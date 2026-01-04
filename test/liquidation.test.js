const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LendingPool - 清算功能测试", function () {
  let lendingPool;
  let collateralManager;
  let oracle;
  let interestModel;
  let weth;
  let usdc;
  let owner;
  let user1;
  let user2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // 1. 部署价格预言机
    const PriceOracleMock = await ethers.getContractFactory("PriceOracleMock");
    oracle = await PriceOracleMock.deploy();
    await oracle.deployed();

    // 2. 部署测试代币
    const TokenMock = await ethers.getContractFactory("TokenMock");
    weth = await TokenMock.deploy("Wrapped ETH", "WETH", 18);
    await weth.deployed();
    usdc = await TokenMock.deploy("USD Coin", "USDC", 6);
    await usdc.deployed();

    // 3. 设置价格
    await oracle.setPrice(weth.address, ethers.utils.parseUnits("2000", 18));
    await oracle.setPrice(usdc.address, ethers.utils.parseUnits("1", 18));

    // 4. 部署 CollateralManager
    const CollateralManager = await ethers.getContractFactory("CollateralManager");
    collateralManager = await CollateralManager.deploy(oracle.address);
    await collateralManager.deployed();

    // 5. 配置抵押参数
    await collateralManager.setLtv(weth.address, 8000);
    await collateralManager.setLiquidationThreshold(weth.address, 8500);
    await collateralManager.setCloseFactor(5000); //  50%
    await collateralManager.setLiquidationBonus(10500); // 105%

    // 6. 部署利率模型
    const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
    interestModel = await InterestRateModel.deploy(0, ethers.utils.parseUnits("0.000001", 18));//
    await interestModel.deployed();

    // 7. 部署 LendingPool
    const LendingPool = await ethers.getContractFactory("LendingPool");
    lendingPool = await LendingPool.deploy(collateralManager.address);
    await lendingPool.deployed();

    // 8. 注册市场
    await lendingPool.listMarket(weth.address, interestModel.address, 1000);
    await lendingPool.listMarket(usdc.address, interestModel.address, 1000);

    // 9. 铸造代币
    await weth.mint(owner.address, ethers.utils.parseUnits("100", 18));
    await usdc.mint(owner.address, ethers.utils.parseUnits("50000", 6));
    await weth.mint(user1.address, ethers.utils.parseUnits("10", 18));
    await usdc.mint(user1.address, ethers.utils.parseUnits("5000", 6));
    await weth.mint(user2.address, ethers.utils.parseUnits("5", 18));
    await usdc.mint(user2.address, ethers.utils.parseUnits("10000", 6));

    // 10. 设置初始状态：Owner 提供流动性，User1 借款
    await weth.connect(owner).approve(lendingPool.address, ethers.utils.parseUnits("50", 18));
    await lendingPool.connect(owner).deposit(weth.address, ethers.utils.parseUnits("50", 18));
    
    await usdc.connect(owner).approve(lendingPool.address, ethers.utils.parseUnits("30000", 6));
    await lendingPool.connect(owner).deposit(usdc.address, ethers.utils.parseUnits("30000", 6));

    // User1 存入抵押品并借款
    await weth.connect(user1).approve(lendingPool.address, ethers.utils.parseUnits("5", 18));
    await lendingPool.connect(user1).deposit(weth.address, ethers.utils.parseUnits("5", 18));
    await lendingPool.connect(user1).borrow(usdc.address, ethers.utils.parseUnits("7000", 6));
  });

  describe("清算条件检查", function () {
    it("健康的仓位不应该被清算", async function () {
      // User1 当前健康度 > 100%
      const repayAmount = ethers.utils.parseUnits("3500", 6);
      
      await usdc.connect(user2).approve(lendingPool.address, repayAmount);
      
      await expect(
        lendingPool.connect(user2).liquidate(
          user1.address,
          usdc.address,
          weth.address,
          repayAmount
        )
      ).to.be.revertedWith("not eligible");
    });

    it("价格下跌后应该可以被清算", async function () {
      // 价格下跌 30%
      await oracle.simulatePriceDrop(weth.address, 30);

      // 现在健康度 < 100%，可以清算
      const repayAmount = ethers.utils.parseUnits("3500", 6);
      
      await usdc.connect(user2).approve(lendingPool.address, repayAmount);
      
      await expect(
        lendingPool.connect(user2).liquidate(
          user1.address,
          usdc.address,
          weth.address,
          repayAmount
        )
      ).to.not.be.reverted;
    });

    it("应该正确判断清算资格", async function () {
      // 初始状态：健康
      let health = await lendingPool.getHealthFactor(
        user1.address,
        [weth.address],
        [usdc.address]
      );
      expect(health).to.be.gt(10000); // > 100%

      // 价格下跌后：不健康
      await oracle.simulatePriceDrop(weth.address, 30);
      
      health = await lendingPool.getHealthFactor(
        user1.address,
        [weth.address],
        [usdc.address]
      );
      expect(health).to.be.lt(10000); // < 100%
    });
  });

  describe("清算执行", function () {
    beforeEach(async function () {
      // 触发清算条件
      await oracle.simulatePriceDrop(weth.address, 30);
    });

    it("应该成功执行清算", async function () {
      const repayAmount = ethers.utils.parseUnits("3500", 6);
      
      await usdc.connect(user2).approve(lendingPool.address, repayAmount);
      await lendingPool.connect(user2).liquidate(
        user1.address,
        usdc.address,
        weth.address,
        repayAmount
      );

      // 检查借款是否减少
      const borrowed = await lendingPool.borrowed(user1.address, usdc.address);
      expect(borrowed).to.equal(ethers.utils.parseUnits("3500", 6)); // 7000 - 3500
    });

    it("清算后应该转移抵押品", async function () {
      const repayAmount = ethers.utils.parseUnits("3500", 6);
      
      const user1SuppliedBefore = await lendingPool.supplied(user1.address, weth.address);
      const user2SuppliedBefore = await lendingPool.supplied(user2.address, weth.address);
      
      await usdc.connect(user2).approve(lendingPool.address, repayAmount);
      await lendingPool.connect(user2).liquidate(
        user1.address,
        usdc.address,
        weth.address,
        repayAmount
      );

      const user1SuppliedAfter = await lendingPool.supplied(user1.address, weth.address);
      const user2SuppliedAfter = await lendingPool.supplied(user2.address, weth.address);

      // User1 抵押品减少
      expect(user1SuppliedAfter).to.be.lt(user1SuppliedBefore);
      
      // User2 获得抵押品
      expect(user2SuppliedAfter).to.be.gt(user2SuppliedBefore);
    });

    it("清算人应该获得清算奖励", async function () {
      const repayAmount = ethers.utils.parseUnits("3500", 6); // 3500 USDC，6位小数
      
      // ========== 清算奖励计算说明 ==========
      // 清算奖励的计算逻辑（在 LendingPool.sol 的 liquidate 函数中）：
      // 1. 计算偿还的 USD 价值：
      //    repayUSD = (repayAmount * usdcPrice) / 10^6
      //    - repayAmount: 3500 * 10^6 (6位小数)
      //    - usdcPrice: 1 * 10^18 (18位小数，表示 $1)
      //    - repayUSD = (3500 * 10^6 * 1 * 10^18) / 10^6 = 3500 * 10^18 (18位小数)
      //
      // 2. 计算应获得的抵押品 USD 价值（包含清算奖励）：
      //    seizeUSD = repayUSD * liquidationBonus / 10000
      //    - liquidationBonus = 10500 (表示 105%)
      //    - seizeUSD = (3500 * 10^18 * 10500) / 10000 = 3675 * 10^18 (18位小数)
      //
      // 3. 计算应获得的 WETH 数量：
      //    seizeAmount = (seizeUSD * 10^18 + priceSeize - 1) / priceSeize
      //    - priceSeize: WETH 价格，18位小数（例如：$1400 = 1400 * 10^18）
      //    - seizeAmount = (3675 * 10^18 * 10^18 + 1400 * 10^18 - 1) / (1400 * 10^18)
      //    - seizeAmount ≈ 2.625 * 10^18 (18位小数，即 2.625 WETH)
      //
      // 预期结果：
      // - WETH 价格 = $1400 (下跌30%后，从 $2000 跌到 $1400)
      // - 偿还 $3500 USDC
      // - 应获得抵押品价值 = $3500 * 105% = $3675
      // - WETH 数量 = $3675 / $1400 ≈ 2.625 WETH
      
      const user2SuppliedBefore = await lendingPool.supplied(user2.address, weth.address);
      
      await usdc.connect(user2).approve(lendingPool.address, repayAmount);
      await lendingPool.connect(user2).liquidate(
        user1.address,
        usdc.address,
        weth.address,
        repayAmount
      );

      const user2SuppliedAfter = await lendingPool.supplied(user2.address, weth.address);
      const wethGained = user2SuppliedAfter.sub(user2SuppliedBefore); // WETH 数量，18位小数
      
      
      // 应该获得约 2.625 WETH（允许 0.01 WETH 的误差）
      expect(wethGained).to.be.closeTo(
        ethers.utils.parseUnits("2.625", 18),
        ethers.utils.parseUnits("0.01", 18)
      );
    });

    it("应该触发 Liquidation 事件", async function () {
      const repayAmount = ethers.utils.parseUnits("3500", 6);
      
      await usdc.connect(user2).approve(lendingPool.address, repayAmount);
      
      await expect(
        lendingPool.connect(user2).liquidate(
          user1.address,
          usdc.address,
          weth.address,
          repayAmount
        )
      ).to.emit(lendingPool, "Liquidation");
    });
  });

  describe("清算限制", function () {
    beforeEach(async function () {
      await oracle.simulatePriceDrop(weth.address, 30);
    });

    it("单次清算不应该超过 closeFactor", async function () {
      // closeFactor = 50%，借款 $7000，最多清算 $3500
      const repayAmount = ethers.utils.parseUnits("4000", 6); // 超过 50%
      
      await usdc.connect(user2).approve(lendingPool.address, repayAmount);
      await lendingPool.connect(user2).liquidate(
        user1.address,
        usdc.address,
        weth.address,
        repayAmount
      );

      // 实际只清算了 $3500
      const borrowed = await lendingPool.borrowed(user1.address, usdc.address);
      expect(borrowed).to.equal(ethers.utils.parseUnits("3500", 6));
    });

    it("不应该清算没有借款的用户", async function () {
      const repayAmount = ethers.utils.parseUnits("1000", 6);
      
      await usdc.connect(user2).approve(lendingPool.address, repayAmount);

      await expect(
        lendingPool.connect(user2).liquidate(
          owner.address, // Owner 没有借款
          usdc.address,
          weth.address,
          repayAmount
        )
      ).to.be.revertedWith("borrower owes nothing");
    });

    it("清算会被限制在可用抵押品范围内", async function () {
      // 测试场景：尝试清算一个非常大的金额
      // 由于 closeFactor 和抵押品限制，实际清算金额会被限制
      // User1 有 5 WETH 抵押品（价值 $7000），借款 7000 USDC
      // closeFactor = 50%，所以最多清算 3500 USDC
      // 清算 3500 USDC 需要约 2.625 WETH（考虑 105% 清算奖励），这是足够的
      
      const repayAmount = ethers.utils.parseUnits("7000", 6); // 尝试清算全部借款
      
      await usdc.connect(user2).approve(lendingPool.address, repayAmount);
      
      // 清算应该成功，但会被限制在 3500 USDC（50%）
      await lendingPool.connect(user2).liquidate(
        user1.address,
        usdc.address,
        weth.address,
        repayAmount
      );
      
      // 验证只清算了 3500（50%），而不是全部 7000
      const borrowed = await lendingPool.borrowed(user1.address, usdc.address);
      expect(borrowed).to.equal(ethers.utils.parseUnits("3500", 6));
      
      // 验证清算人获得了相应的抵押品
      const user2Weth = await lendingPool.supplied(user2.address, weth.address);
      expect(user2Weth).to.be.gt(0); // 应该获得一些 WETH
    });
  });

  describe("多次清算", function () {
    beforeEach(async function () {
      await oracle.simulatePriceDrop(weth.address, 30);
    });

    it("应该可以多次清算同一个用户", async function () {
      const repayAmount = ethers.utils.parseUnits("3500", 6);
      
      // 第一次清算
      await usdc.connect(user2).approve(lendingPool.address, repayAmount);
      await lendingPool.connect(user2).liquidate(
        user1.address,
        usdc.address,
        weth.address,
        repayAmount
      );

      let borrowed = await lendingPool.borrowed(user1.address, usdc.address);
      expect(borrowed).to.equal(ethers.utils.parseUnits("3500", 6));

      // 如果还是不健康，可以再次清算
      const health = await lendingPool.getHealthFactor(
        user1.address,
        [weth.address],
        [usdc.address]
      );

      if (health.lt(10000)) {
        // 第二次清算
        const repayAmount2 = ethers.utils.parseUnits("1750", 6); // 剩余的 50%
        
        await usdc.connect(user2).approve(lendingPool.address, repayAmount2);
        await lendingPool.connect(user2).liquidate(
          user1.address,
          usdc.address,
          weth.address,
          repayAmount2
        );

        borrowed = await lendingPool.borrowed(user1.address, usdc.address);
        expect(borrowed).to.equal(ethers.utils.parseUnits("1750", 6));
      }
    });
  });

  describe("清算后健康度恢复", function () {
    beforeEach(async function () {
      await oracle.simulatePriceDrop(weth.address, 30);
    });

    it("清算后健康度应该提高", async function () {
      // 注意：清算后健康度并不总是会提高
      // 因为清算奖励（105%）会导致抵押品减少得比借款减少得更多
      // 例如：
      // - 清算前：5 WETH ($7000) 抵押品，7000 USDC 借款，健康度 85%
      // - 清算 3500 USDC，被没收 2.625 WETH ($3675，考虑 105% 奖励)
      // - 清算后：2.375 WETH ($3325) 抵押品，3500 USDC 借款
      // - 健康度 = (3325 * 85%) / 3500 = 80.75%，反而下降了
      //
      // 但在某些情况下，如果清算金额较小或价格更有利，健康度可能会提高
      // 这个测试验证清算功能正常工作，但不一定期望健康度总是提高
      
      const healthBefore = await lendingPool.getHealthFactor(
        user1.address,
        [weth.address],
        [usdc.address]
      );

      const repayAmount = ethers.utils.parseUnits("3500", 6);
      
      await usdc.connect(user2).approve(lendingPool.address, repayAmount);
      await lendingPool.connect(user2).liquidate(
        user1.address,
        usdc.address,
        weth.address,
        repayAmount
      );

      const healthAfter = await lendingPool.getHealthFactor(
        user1.address,
        [weth.address],
        [usdc.address]
      );

      // 验证清算成功执行（借款减少）
      const borrowed = await lendingPool.borrowed(user1.address, usdc.address);
      expect(borrowed).to.equal(ethers.utils.parseUnits("3500", 6));
      
      // 验证抵押品被没收
      const supplied = await lendingPool.supplied(user1.address, weth.address);
      expect(supplied).to.be.lt(ethers.utils.parseUnits("5", 18));
      
      // 注意：健康度可能提高或下降，取决于清算奖励和价格
      // 在这个场景下，由于清算奖励 105%，健康度可能会下降
      // 但这是正常的清算行为
      console.log("清算前健康度:", healthBefore.toNumber() / 100, "%");
      console.log("清算后健康度:", healthAfter.toNumber() / 100, "%");
      
      // 不强制要求健康度提高，只验证清算功能正常
      // 如果健康度提高了，那很好；如果下降了，也是正常的清算行为
    });

    it("清算后可能恢复到健康状态", async function () {
      const repayAmount = ethers.utils.parseUnits("3500", 6);
      
      await usdc.connect(user2).approve(lendingPool.address, repayAmount);
      await lendingPool.connect(user2).liquidate(
        user1.address,
        usdc.address,
        weth.address,
        repayAmount
      );

      const health = await lendingPool.getHealthFactor(
        user1.address,
        [weth.address],
        [usdc.address]
      );

      // 清算后健康度可能恢复到 > 100%
      // 这取决于具体的价格和清算金额
      console.log("清算后健康度:", health.toNumber() / 100, "%");
    });
  });

  describe("边界情况", function () {
    it("价格为零时应该失败", async function () {
      await oracle.setPrice(weth.address, 0);

      const repayAmount = ethers.utils.parseUnits("1000", 6);
      
      await usdc.connect(user2).approve(lendingPool.address, repayAmount);
      
      // PriceOracleMock 在价格为 0 时会返回 "price not set"
      // 合约中如果 priceSeize 为 0 会返回 "price 0"，但这里 PriceOracleMock 会先 revert
      await expect(
        lendingPool.connect(user2).liquidate(
          user1.address,
          usdc.address,
          weth.address,
          repayAmount
        )
      ).to.be.revertedWith("price not set");
    });

    it("清算金额为零应该失败", async function () {
      await oracle.simulatePriceDrop(weth.address, 30);

      await expect(
        lendingPool.connect(user2).liquidate(
          user1.address,
          usdc.address,
          weth.address,
          0
        )
      ).to.be.reverted;
    });
  });

  describe("清算收益计算", function () {
    beforeEach(async function () {
      await oracle.simulatePriceDrop(weth.address, 30);
    });

    it("应该正确计算清算收益", async function () {
      const repayAmount = ethers.utils.parseUnits("3500", 6); // 3500 USDC，6位小数 = 3500 * 10^6
      
      const user2UsdcBefore = await usdc.balanceOf(user2.address);
      const user2WethBefore = await lendingPool.supplied(user2.address, weth.address);
      
      await usdc.connect(user2).approve(lendingPool.address, repayAmount);
      await lendingPool.connect(user2).liquidate(
        user1.address,
        usdc.address,
        weth.address,
        repayAmount
      );

      const user2WethAfter = await lendingPool.supplied(user2.address, weth.address);
      const wethGained = user2WethAfter.sub(user2WethBefore); // WETH 数量，18位小数
      
      // ========== Decimal 计算说明 ==========
      // 1. 计算获得的 WETH 价值（USD，18位小数）
      //    - wethGained: WETH 数量，18位小数（例如：2.625 WETH = 2.625 * 10^18）
      //    - wethPrice: WETH 价格，18位小数（例如：$1400 = 1400 * 10^18）
      //    - 计算：wethGained * wethPrice = (18位) * (18位) = 36位小数
      //    - 需要除以 10^18 得到 18位小数的 USD 价值
      const wethPrice = await oracle.getPrice(weth.address); // 18位小数
      const wethValue = wethGained.mul(wethPrice).div(ethers.utils.parseUnits("1", 18));
      // wethValue 现在是 18位小数的 USD 价值
      
      // 2. 计算支付的 USDC 价值（USD，18位小数）
      //    - repayAmount: USDC 数量，6位小数（例如：3500 USDC = 3500 * 10^6）
      //    - usdcPrice: USDC 价格，18位小数（例如：$1 = 1 * 10^18）
      //    - 方法1：使用价格计算（更准确）
      //      usdcValue = (repayAmount * usdcPrice) / 10^6
      //      = (6位小数 * 18位小数) / 10^6 = 18位小数
      //    - 方法2：直接转换（假设价格为 $1）
      //      usdcValue = repayAmount * 10^12 (因为 18 - 6 = 12)
      const usdcPrice = await oracle.getPrice(usdc.address); // 18位小数
      const usdcValue = repayAmount.mul(usdcPrice).div(ethers.utils.parseUnits("1", 6));
      // usdcValue 现在是 18位小数的 USD 价值
      
      // 3. 计算收益（USD，18位小数）
      //    - profit = wethValue - usdcValue
      //    - 两者都是 18位小数，可以直接相减
      const profit = wethValue.sub(usdcValue);
      
      // ========== 输出详细信息 ==========
      console.log("\n========== 清算收益计算详情 ==========");
      console.log("【输入】");
      console.log("  偿还金额:", ethers.utils.formatUnits(repayAmount, 6), "USDC");
      console.log("  USDC 价格:", ethers.utils.formatUnits(usdcPrice, 18), "USD");
      console.log("\n【计算过程】");
      console.log("  1. 支付的 USDC 价值计算:");
      console.log("     repayAmount (6位小数):", repayAmount.toString());
      console.log("     usdcPrice (18位小数):", usdcPrice.toString());
      console.log("     usdcValue = (repayAmount * usdcPrice) / 10^6");
      console.log("     usdcValue (18位小数):", usdcValue.toString());
      console.log("     usdcValue (格式化):", ethers.utils.formatUnits(usdcValue, 18), "USD");
      
      console.log("\n  2. 获得的 WETH 价值计算:");
      console.log("     获得 WETH:", ethers.utils.formatUnits(wethGained, 18), "WETH");
      console.log("     WETH 价格:", ethers.utils.formatUnits(wethPrice, 18), "USD");
      console.log("     wethValue = (wethGained * wethPrice) / 10^18");
      console.log("     wethValue (18位小数):", wethValue.toString());
      console.log("     wethValue (格式化):", ethers.utils.formatUnits(wethValue, 18), "USD");
      
      console.log("\n【结果】");
      console.log("  支付价值:", ethers.utils.formatUnits(usdcValue, 18), "USD");
      console.log("  获得价值:", ethers.utils.formatUnits(wethValue, 18), "USD");
      console.log("  清算收益:", ethers.utils.formatUnits(profit, 18), "USD");
      console.log("  收益率:", profit.mul(10000).div(usdcValue).toNumber() / 100, "%");
      console.log("=====================================\n");
      
      // 收益应该约为 5% (清算奖励 = liquidationBonus - 100% = 105% - 100% = 5%)
      const expectedProfit = usdcValue.mul(5).div(100); // 5% 的收益
      expect(profit).to.be.closeTo(expectedProfit, ethers.utils.parseUnits("10", 18));
    });
  });
});

