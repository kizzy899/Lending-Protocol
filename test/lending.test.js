const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LendingPool - 核心借贷功能测试", function () {
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
    await oracle.setPrice(weth.address, ethers.utils.parseUnits("2000", 18)); // $2000
    await oracle.setPrice(usdc.address, ethers.utils.parseUnits("1", 18));    // $1

    // 4. 部署 CollateralManager
    const CollateralManager = await ethers.getContractFactory("CollateralManager");
    collateralManager = await CollateralManager.deploy(oracle.address);
    await collateralManager.deployed();

    // 5. 配置抵押参数
    await collateralManager.setLtv(weth.address, 8000); // 80%
    await collateralManager.setLiquidationThreshold(weth.address, 8500); // 85%
    await collateralManager.setLtv(usdc.address, 9000); // 90%
    await collateralManager.setLiquidationThreshold(usdc.address, 9300); // 93%
    await collateralManager.setCloseFactor(5000); // 50%
    await collateralManager.setLiquidationBonus(10500); // 105%

    // 6. 部署利率模型
    const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
    interestModel = await InterestRateModel.deploy(0, ethers.utils.parseUnits("0.000001", 18));
    await interestModel.deployed();

    // 7. 部署 LendingPool
    const LendingPool = await ethers.getContractFactory("LendingPool");
    lendingPool = await LendingPool.deploy(collateralManager.address);
    await lendingPool.deployed();

    // 8. 注册市场
    await lendingPool.listMarket(weth.address, interestModel.address, 1000);
    await lendingPool.listMarket(usdc.address, interestModel.address, 1000);

    // 9. 为测试用户铸造代币
    await weth.mint(owner.address, ethers.utils.parseUnits("100", 18));
    await usdc.mint(owner.address, ethers.utils.parseUnits("50000", 6));
    await weth.mint(user1.address, ethers.utils.parseUnits("10", 18));
    await usdc.mint(user1.address, ethers.utils.parseUnits("5000", 6));
    await weth.mint(user2.address, ethers.utils.parseUnits("5", 18));
    await usdc.mint(user2.address, ethers.utils.parseUnits("10000", 6));
  });

  describe("市场注册", function () {
    it("应该成功注册市场", async function () {
      const market = await lendingPool.markets(weth.address);
      expect(market.listed).to.equal(true);
    });

    it("不应该重复注册市场", async function () {
      await expect(
        lendingPool.listMarket(weth.address, interestModel.address, 1000)
      ).to.be.revertedWith("already listed");
    });

    it("只有 owner 可以注册市场", async function () {
      const TokenMock = await ethers.getContractFactory("TokenMock");
      const newToken = await TokenMock.deploy("New Token", "NEW", 18);
      
      await expect(
        lendingPool.connect(user1).listMarket(newToken.address, interestModel.address, 1000)
      ).to.be.revertedWith("only owner");
    });
  });

  describe("存款功能", function () {
    it("应该成功存入代币", async function () {
      const depositAmount = ethers.utils.parseUnits("5", 18);
      
      await weth.connect(user1).approve(lendingPool.address, depositAmount);
      await lendingPool.connect(user1).deposit(weth.address, depositAmount);

      const supplied = await lendingPool.supplied(user1.address, weth.address);
      expect(supplied).to.equal(depositAmount);
    });

    it("存款后应该更新市场总供应量", async function () {
      const depositAmount = ethers.utils.parseUnits("5", 18);
      
      await weth.connect(user1).approve(lendingPool.address, depositAmount);
      await lendingPool.connect(user1).deposit(weth.address, depositAmount);

      const market = await lendingPool.markets(weth.address);
      expect(market.totalSupply).to.equal(depositAmount);
    });

    it("不应该存入零金额", async function () {
      await expect(
        lendingPool.connect(user1).deposit(weth.address, 0)
      ).to.be.revertedWith("zero");
    });

    it("不应该存入未注册的代币", async function () {
      const TokenMock = await ethers.getContractFactory("TokenMock");
      const newToken = await TokenMock.deploy("New Token", "NEW", 18);
      
      await expect(
        lendingPool.connect(user1).deposit(newToken.address, 100)
      ).to.be.revertedWith("market not listed");
    });

    it("应该触发 Deposit 事件", async function () {
      const depositAmount = ethers.utils.parseUnits("5", 18);
      
      await weth.connect(user1).approve(lendingPool.address, depositAmount);
      
      await expect(
        lendingPool.connect(user1).deposit(weth.address, depositAmount)
      ).to.emit(lendingPool, "Deposit")
        .withArgs(user1.address, weth.address, depositAmount);
    });
  });

  describe("取款功能", function () {
    beforeEach(async function () {
      // 先存入一些代币
      const depositAmount = ethers.utils.parseUnits("5", 18);
      await weth.connect(user1).approve(lendingPool.address, depositAmount);
      await lendingPool.connect(user1).deposit(weth.address, depositAmount);
    });

    it("应该成功取出代币", async function () {
      const withdrawAmount = ethers.utils.parseUnits("2", 18);
      
      await lendingPool.connect(user1).withdraw(weth.address, withdrawAmount);

      const supplied = await lendingPool.supplied(user1.address, weth.address);
      expect(supplied).to.equal(ethers.utils.parseUnits("3", 18));
    });

    it("取款后应该更新市场总供应量", async function () {
      const withdrawAmount = ethers.utils.parseUnits("2", 18);
      
      await lendingPool.connect(user1).withdraw(weth.address, withdrawAmount);

      const market = await lendingPool.markets(weth.address);
      expect(market.totalSupply).to.equal(ethers.utils.parseUnits("3", 18));
    });

    it("不应该取出超过存入的金额", async function () {
      const withdrawAmount = ethers.utils.parseUnits("10", 18);
      
      await expect(
        lendingPool.connect(user1).withdraw(weth.address, withdrawAmount)
      ).to.be.revertedWith("insufficient supply");
    });

    it("应该触发 Withdraw 事件", async function () {
      const withdrawAmount = ethers.utils.parseUnits("2", 18);
      
      await expect(
        lendingPool.connect(user1).withdraw(weth.address, withdrawAmount)
      ).to.emit(lendingPool, "Withdraw")
        .withArgs(user1.address, weth.address, withdrawAmount);
    });
  });

  describe("借款功能", function () {
    beforeEach(async function () {
      // Owner 提供流动性
      await weth.connect(owner).approve(lendingPool.address, ethers.utils.parseUnits("50", 18));
      await lendingPool.connect(owner).deposit(weth.address, ethers.utils.parseUnits("50", 18));
      
      await usdc.connect(owner).approve(lendingPool.address, ethers.utils.parseUnits("30000", 6));
      await lendingPool.connect(owner).deposit(usdc.address, ethers.utils.parseUnits("30000", 6));

      // User1 存入抵押品
      await weth.connect(user1).approve(lendingPool.address, ethers.utils.parseUnits("5", 18));
      await lendingPool.connect(user1).deposit(weth.address, ethers.utils.parseUnits("5", 18));
    });

    it("应该成功借出代币", async function () {
      const borrowAmount = ethers.utils.parseUnits("5000", 6);
      
      await lendingPool.connect(user1).borrow(usdc.address, borrowAmount);

      const borrowed = await lendingPool.borrowed(user1.address, usdc.address);
      expect(borrowed).to.equal(borrowAmount);
    });

    it("借款后应该更新市场总借款量", async function () {
      const borrowAmount = ethers.utils.parseUnits("5000", 6);
      
      await lendingPool.connect(user1).borrow(usdc.address, borrowAmount);

      const market = await lendingPool.markets(usdc.address);
      expect(market.totalBorrows).to.equal(borrowAmount);
    });

    it("不应该借出超过借款能力的金额", async function () {
      // User1 有 5 WETH ($10,000)，LTV 80%，最多借 $8,000
      const borrowAmount = ethers.utils.parseUnits("9000", 6); // 超过限制
      console.log(await lendingPool.getUserBorrowingPowerUSD(user1.address, [weth.address]));//计算借款能力
      console.log(await lendingPool.getUserBorrowedUSD(user1.address, [usdc.address]));//计算当前的总借款 
      await expect(
        lendingPool.connect(user1).borrow(usdc.address, borrowAmount)
      ).to.be.revertedWith("exceeds borrow power");
    });

    it("应该触发 Borrow 事件", async function () {
      const borrowAmount = ethers.utils.parseUnits("5000", 6);
      
      await expect(
        lendingPool.connect(user1).borrow(usdc.address, borrowAmount)
      ).to.emit(lendingPool, "Borrow")
        .withArgs(user1.address, usdc.address, borrowAmount);
    });

    it("应该正确计算借款能力", async function () {
      // User1 有 5 WETH * $2000 = $10,000
      // LTV 80% = $8,000 借款能力
      const borrowPower = await lendingPool.getUserBorrowingPowerUSD(
        user1.address,
        [weth.address]
      );
      
      expect(borrowPower).to.equal(ethers.utils.parseUnits("8000", 18));
    });
  });

  describe("还款功能", function () {
    beforeEach(async function () {
      // Owner 提供流动性
      await usdc.connect(owner).approve(lendingPool.address, ethers.utils.parseUnits("30000", 6));
      await lendingPool.connect(owner).deposit(usdc.address, ethers.utils.parseUnits("30000", 6));

      // User1 存入抵押品并借款
      await weth.connect(user1).approve(lendingPool.address, ethers.utils.parseUnits("5", 18));
      await lendingPool.connect(user1).deposit(weth.address, ethers.utils.parseUnits("5", 18));
      await lendingPool.connect(user1).borrow(usdc.address, ethers.utils.parseUnits("5000", 6));
    });

    it("应该成功还款", async function () {
      const repayAmount = ethers.utils.parseUnits("2000", 6);
      
      // 获取还款前的本金借款
      const borrowedBefore = await lendingPool.borrowed(user1.address, usdc.address);
      
      await usdc.connect(user1).approve(lendingPool.address, repayAmount);
      await lendingPool.connect(user1).repay(usdc.address, repayAmount, user1.address);

      const borrowed = await lendingPool.borrowed(user1.address, usdc.address);
      // 还款后本金应该减少 repayAmount
      expect(borrowed).to.equal(borrowedBefore.sub(repayAmount));
    });

    it("还款后应该更新市场总借款量", async function () {
      const repayAmount = ethers.utils.parseUnits("2000", 6);
      
      const totalBorrowsBefore = marketBefore.totalBorrows;
      
      await usdc.connect(user1).approve(lendingPool.address, repayAmount);
      await lendingPool.connect(user1).repay(usdc.address, repayAmount, user1.address);

      const market = await lendingPool.markets(usdc.address);
      // 还款后总借款量应该减少 repayAmount（注意：由于利息累积，实际借款可能略高于原始借款）
      // 所以还款后的总借款量 = 还款前的总借款量 - 还款金额
      // 但由于 repay 函数内部会再次调用 _accrue，可能会产生额外的利息差异
      // 使用 closeTo 来允许小的差异（最多 0.01 USDC，即 10000 单位，6位小数）
      const expectedTotalBorrows = totalBorrowsBefore.sub(repayAmount);
      expect(market.totalBorrows).to.be.closeTo(expectedTotalBorrows, ethers.utils.parseUnits("0.01", 6));
    });

    it("应该可以全额还款", async function () {
      const borrowed = await lendingPool.borrowed(user1.address, usdc.address);
      
      await usdc.connect(user1).approve(lendingPool.address, borrowed);
      await lendingPool.connect(user1).repay(usdc.address, borrowed, user1.address);

      const remainingBorrowed = await lendingPool.borrowed(user1.address, usdc.address);
      expect(remainingBorrowed).to.equal(0);
    });

    it("应该触发 Repay 事件", async function () {
      const repayAmount = ethers.utils.parseUnits("2000", 6);
      
      await usdc.connect(user1).approve(lendingPool.address, repayAmount);
      
      await expect(
        lendingPool.connect(user1).repay(usdc.address, repayAmount, user1.address)
      ).to.emit(lendingPool, "Repay")
        .withArgs(user1.address, user1.address, usdc.address, repayAmount);
    });

    it("其他人应该可以代为还款", async function () {
      const repayAmount = ethers.utils.parseUnits("2000", 6);
      
      // User2 为 User1 还款
      await usdc.connect(user2).approve(lendingPool.address, repayAmount);
      await lendingPool.connect(user2).repay(usdc.address, repayAmount, user1.address);

      const borrowed = await lendingPool.borrowed(user1.address, usdc.address);
      expect(borrowed).to.equal(ethers.utils.parseUnits("3000", 6));
    });
  });

  describe("健康度计算", function () {
    beforeEach(async function () {
      // Owner 提供流动性
      await usdc.connect(owner).approve(lendingPool.address, ethers.utils.parseUnits("30000", 6));
      await lendingPool.connect(owner).deposit(usdc.address, ethers.utils.parseUnits("30000", 6));

      // User1 存入抵押品并借款
      await weth.connect(user1).approve(lendingPool.address, ethers.utils.parseUnits("5", 18));
      await lendingPool.connect(user1).deposit(weth.address, ethers.utils.parseUnits("5", 18));
      await lendingPool.connect(user1).borrow(usdc.address, ethers.utils.parseUnits("7000", 6));
    });

    it("应该正确计算健康度", async function () {
      // 抵押品: 5 WETH * $2000 = $10,000
      // 清算阈值: 85%
      // 借款: $7,000
      // 健康度: ($10,000 * 85%) / $7,000 = 121.43%
      const health = await lendingPool.getHealthFactor(
        user1.address,
        [weth.address],
        [usdc.address]
      );
      
      // 健康度应该约为 12143 (121.43%)
      expect(health).to.be.closeTo(12143, 10);
    });

    it("价格下跌后健康度应该降低", async function () {
      // 初始健康度
      const healthBefore = await lendingPool.getHealthFactor(
        user1.address,
        [weth.address],
        [usdc.address]
      );

      // 价格下跌 30%
      await oracle.simulatePriceDrop(weth.address, 30);

      // 新健康度
      const healthAfter = await lendingPool.getHealthFactor(
        user1.address,
        [weth.address],
        [usdc.address]
      );

      expect(healthAfter).to.be.lt(healthBefore);
    });

    it("没有借款时健康度应该是最大值", async function () {
      const health = await lendingPool.getHealthFactor(
        user2.address, // User2 没有借款
        [weth.address],
        [usdc.address]
      );
      
      expect(health).to.equal(ethers.constants.MaxUint256);
    });
  });

  describe("取款限制", function () {
    beforeEach(async function () {
      // Owner 提供流动性
      await usdc.connect(owner).approve(lendingPool.address, ethers.utils.parseUnits("30000", 6));
      await lendingPool.connect(owner).deposit(usdc.address, ethers.utils.parseUnits("30000", 6));

      // User1 存入抵押品并借款
      await weth.connect(user1).approve(lendingPool.address, ethers.utils.parseUnits("5", 18));
      await lendingPool.connect(user1).deposit(weth.address, ethers.utils.parseUnits("5", 18));
      await lendingPool.connect(user1).borrow(usdc.address, ethers.utils.parseUnits("7000", 6));
    });

    it("不应该取出导致抵押不足的金额", async function () {
      // User1 有 5 WETH 抵押品，借了 $7,000
      // 如果取出太多，会导致抵押不足
      const withdrawAmount = ethers.utils.parseUnits("4", 18); // 取出 4 WETH
      
      await expect(
        lendingPool.connect(user1).withdraw(weth.address, withdrawAmount)
      ).to.be.revertedWith("withdraw would undercollateralize");
    });

    it("应该可以取出不影响健康度的金额", async function () {
      // 取出少量不影响健康度
      const withdrawAmount = ethers.utils.parseUnits("0.5", 18);
      
      await lendingPool.connect(user1).withdraw(weth.address, withdrawAmount);

      const supplied = await lendingPool.supplied(user1.address, weth.address);
      expect(supplied).to.equal(ethers.utils.parseUnits("4.5", 18));
    });
  });
});

