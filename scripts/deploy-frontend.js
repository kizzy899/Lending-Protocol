// 🚀 前端演示基础数据部署脚本
// 这个脚本会：
// 1. 部署所有合约
// 2. 配置基础参数
// 3. 创建初始状态（流动性、用户余额等）
// 4. 生成前端配置文件
// 使用方式：
//   - 使用 Hardhat 内置网络（推荐）：
//     npx hardhat run scripts/deploy-frontend.js
//   - 使用本地节点：
//     npx hardhat run scripts/deploy-frontend.js --network localhost
//   - 指定自定义账户（通过环境变量）：
//     USER1_PRIVATE_KEY=0x... USER2_PRIVATE_KEY=0x... USER3_PRIVATE_KEY=0x... npx hardhat run scripts/deploy-frontend.js

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 前端演示基础数据部署');
  console.log('='.repeat(80));

  // 获取默认部署账户
  const [defaultDeployer] = await ethers.getSigners();
  
  // 尝试从环境变量获取自定义账户私钥
  const user1PrivateKey = process.env.USER1_PRIVATE_KEY;
  const user2PrivateKey = process.env.USER2_PRIVATE_KEY;
  const user3PrivateKey = process.env.USER3_PRIVATE_KEY;
  
  // 创建账户
  let deployer = defaultDeployer;
  let user1, user2, user3;
  
  if (user1PrivateKey) {
    user1 = new ethers.Wallet(user1PrivateKey, ethers.provider);
    console.log('✅ 使用自定义 User1 账户');
  } else {
    const signers = await ethers.getSigners();
    user1 = signers[1] || defaultDeployer;
  }
  
  if (user2PrivateKey) {
    user2 = new ethers.Wallet(user2PrivateKey, ethers.provider);
    console.log('✅ 使用自定义 User2 账户');
  } else {
    const signers = await ethers.getSigners();
    user2 = signers[2] || defaultDeployer;
  }
  
  if (user3PrivateKey) {
    user3 = new ethers.Wallet(user3PrivateKey, ethers.provider);
    console.log('✅ 使用自定义 User3 账户');
  } else {
    const signers = await ethers.getSigners();
    user3 = signers[3] || defaultDeployer;
  }
  
  console.log('\n👥 账户信息:');
  console.log('   Deployer:', deployer.address, '(管理员 & 流动性提供者)');
  console.log('   User1:   ', user1.address, '(借款人)', user1PrivateKey ? '[自定义]' : '[默认]');
  console.log('   User2:   ', user2.address, '(清算人)', user2PrivateKey ? '[自定义]' : '[默认]');
  console.log('   User3:   ', user3.address, '(普通用户)', user3PrivateKey ? '[自定义]' : '[默认]');
  
  if (!user1PrivateKey && !user2PrivateKey && !user3PrivateKey) {
    console.log('\n💡 提示: 可以通过环境变量指定自定义账户:');
    console.log('   USER1_PRIVATE_KEY=0x... USER2_PRIVATE_KEY=0x... USER3_PRIVATE_KEY=0x... npx hardhat run scripts/deploy-frontend.js');
  }

  // ========== 部署合约 ==========
  console.log('\n' + '─'.repeat(80));
  console.log('📦 第一步：部署合约');
  console.log('─'.repeat(80));

  // 1. 部署价格预言机
  const PriceOracleMock = await ethers.getContractFactory('PriceOracleMock');
  const oracle = await PriceOracleMock.deploy();
  await oracle.deployed();
  console.log('✅ PriceOracleMock:', oracle.address);

  // 2. 部署测试代币
  const TokenMock = await ethers.getContractFactory('TokenMock');
  const weth = await TokenMock.deploy('Wrapped ETH', 'WETH', 18);
  await weth.deployed();
  const usdc = await TokenMock.deploy('USD Coin', 'USDC', 6);
  await usdc.deployed();
  console.log('✅ WETH Token:', weth.address);
  console.log('✅ USDC Token:', usdc.address);

  // 3. 设置价格
  await oracle.setPrice(weth.address, ethers.utils.parseUnits('2000', 18)); // $2000
  await oracle.setPrice(usdc.address, ethers.utils.parseUnits('1', 18));    // $1
  console.log('✅ 价格设置: WETH=$2000, USDC=$1');

  // 4. 部署 CollateralManager
  const CollateralManager = await ethers.getContractFactory('CollateralManager');
  const cm = await CollateralManager.deploy(oracle.address);
  await cm.deployed();
  console.log('✅ CollateralManager:', cm.address);

  // 5. 配置抵押参数
  await cm.setLtv(weth.address, 8000);        // 80% LTV
  await cm.setLiquidationThreshold(weth.address, 8500); // 85% 清算阈值
  await cm.setLtv(usdc.address, 9000);        // 90% LTV
  await cm.setLiquidationThreshold(usdc.address, 9300); // 93% 清算阈值
  await cm.setCloseFactor(5000);               // 50% 单次清算比例
  await cm.setLiquidationBonus(10500);         // 105% 清算奖励（5%）
  console.log('✅ 抵押参数配置完成');

  // 6. 部署利率模型和借贷池
  const InterestRateModel = await ethers.getContractFactory('InterestRateModel');
  const irm = await InterestRateModel.deploy(0, ethers.utils.parseUnits('0.000001', 18));
  await irm.deployed();
  
  const LendingPool = await ethers.getContractFactory('LendingPool');
  const pool = await LendingPool.deploy(cm.address);
  await pool.deployed();
  console.log('✅ LendingPool:', pool.address);

  // 7. 注册市场
  await pool.listMarket(weth.address, irm.address, 1000); // 10% 储备金率
  await pool.listMarket(usdc.address, irm.address, 1000);
  console.log('✅ 市场注册完成');

  // ========== 铸造代币 ==========
  console.log('\n' + '─'.repeat(80));
  console.log('💰 第二步：铸造测试代币');
  console.log('─'.repeat(80));

  // Deployer: 流动性提供者
  await weth.mint(deployer.address, ethers.utils.parseUnits('200', 18));
  await usdc.mint(deployer.address, ethers.utils.parseUnits('100000', 6));
  console.log('✅ Deployer: 200 WETH + 100,000 USDC');

  // User1: 借款人（有较多抵押品）
  await weth.mint(user1.address, ethers.utils.parseUnits('20', 18));
  await usdc.mint(user1.address, ethers.utils.parseUnits('5000', 6));
  console.log('✅ User1:    20 WETH + 5,000 USDC');

  // User2: 清算人（有较多 USDC）
  await weth.mint(user2.address, ethers.utils.parseUnits('10', 18));
  await usdc.mint(user2.address, ethers.utils.parseUnits('50000', 6));
  console.log('✅ User2:    10 WETH + 50,000 USDC');

  // User3: 普通用户
  await weth.mint(user3.address, ethers.utils.parseUnits('15', 18));
  await usdc.mint(user3.address, ethers.utils.parseUnits('10000', 6));
  console.log('✅ User3:    15 WETH + 10,000 USDC');


  // ========== 提供流动性 ==========
  console.log('\n' + '─'.repeat(80));
  console.log('🏊 第三步：Deployer 提供流动性');
  console.log('─'.repeat(80));
  
  // 代币授权（等待交易确认）
  console.log('⏳ 授权 WETH...');
  const approveWethTx = await weth.connect(deployer).approve(pool.address, ethers.constants.MaxUint256);
  await approveWethTx.wait();
  console.log('✅ WETH 授权完成');
  
  console.log('⏳ 授权 USDC...');
  const approveUsdcTx = await usdc.connect(deployer).approve(pool.address, ethers.constants.MaxUint256);
  await approveUsdcTx.wait();
  console.log('✅ USDC 授权完成');
  
  // 存入代币（等待交易确认）
  console.log('⏳ 存入 WETH...');
  const depositWethTx = await pool.connect(deployer).deposit(weth.address, ethers.utils.parseUnits('100', 18));
  await depositWethTx.wait();
  console.log('✅ 存入 WETH 完成');
  
  console.log('⏳ 存入 USDC...');
  const depositUsdcTx = await pool.connect(deployer).deposit(usdc.address, ethers.utils.parseUnits('80000', 6));
  await depositUsdcTx.wait();
  console.log('✅ 存入 USDC 完成');
  
  console.log('✅ 存入: 100 WETH + 80,000 USDC');

  // ========== 创建初始借贷状态 ==========
  console.log('\n' + '─'.repeat(80));
  console.log('💳 第四步：创建初始借贷状态（供前端演示）');
  console.log('─'.repeat(80));

  // User1 存入抵押品并借款（健康状态）
  console.log('⏳ User1 授权 WETH...');
  const user1ApproveTx = await weth.connect(user1).approve(pool.address, ethers.constants.MaxUint256);
  await user1ApproveTx.wait();
  
  console.log('⏳ User1 存入 WETH...');
  const user1DepositTx = await pool.connect(user1).deposit(weth.address, ethers.utils.parseUnits('10', 18));
  await user1DepositTx.wait();
  console.log('✅ User1 存入: 10 WETH 作为抵押品');
  
  console.log('⏳ User1 借出 USDC...');
  const user1BorrowTx = await pool.connect(user1).borrow(usdc.address, ethers.utils.parseUnits('12000', 6));
  await user1BorrowTx.wait();
  console.log('✅ User1 借出: 12,000 USDC');
  
  const health1 = await pool.getHealthFactor(user1.address, [weth.address], [usdc.address]);
  console.log('   User1 健康度:', (health1.toNumber() / 100).toFixed(2) + '% ✅ (安全)');

  // User3 也存入一些抵押品（不借款，展示存款功能）
  console.log('⏳ User3 授权 WETH...');
  const user3ApproveTx = await weth.connect(user3).approve(pool.address, ethers.constants.MaxUint256);
  await user3ApproveTx.wait();
  
  console.log('⏳ User3 存入 WETH...');
  const user3DepositTx = await pool.connect(user3).deposit(weth.address, ethers.utils.parseUnits('5', 18));
  await user3DepositTx.wait();
  console.log('✅ User3 存入: 5 WETH（仅存款，不借款）');

  // ========== 生成前端配置 ==========
  console.log('\n' + '─'.repeat(80));
  console.log('📝 第五步：生成前端配置文件');
  console.log('─'.repeat(80));

  const config = {
    network: {
      chainId: (await ethers.provider.getNetwork()).chainId,
      name: (await ethers.provider.getNetwork()).name
    },
    contracts: {
      oracle: oracle.address,
      weth: weth.address,
      usdc: usdc.address,
      collateralManager: cm.address,
      interestRateModel: irm.address,
      lendingPool: pool.address
    },
    accounts: {
      deployer: {
        address: deployer.address,
        privateKey: null, // Deployer 使用默认账户，不导出私钥
        role: '管理员 & 流动性提供者'
      },
      user1: {
        address: user1.address,
        privateKey: user1PrivateKey || null,
        role: '借款人'
      },
      user2: {
        address: user2.address,
        privateKey: user2PrivateKey || null,
        role: '清算人'
      },
      user3: {
        address: user3.address,
        privateKey: user3PrivateKey || null,
        role: '普通用户'
      }
    },
    tokens: {
      WETH: {
        address: weth.address,
        name: 'Wrapped ETH',
        symbol: 'WETH',
        decimals: 18,
        price: '2000', // USD
        ltv: 80, // %
        liquidationThreshold: 85 // %
      },
      USDC: {
        address: usdc.address,
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6,
        price: '1', // USD
        ltv: 90, // %
        liquidationThreshold: 93 // %
      }
    },
    parameters: {
      closeFactor: 50, // %
      liquidationBonus: 5, // %
      reserveFactor: 10 // %
    },
    initialState: {
      liquidity: {
        WETH: '100',
        USDC: '80000'
      },
      user1: {
        collateral: {
          WETH: '10'
        },
        borrow: {
          USDC: '12000'
        },
        healthFactor: (health1.toNumber() / 100).toFixed(2)
      },
      user3: {
        deposit: {
          WETH: '5'
        }
      }
    }
  };

  // 保存到根目录
  const configPath = path.join(__dirname, '..', 'frontend-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('✅ 前端配置已保存到:', configPath);

  // 保存地址文件（兼容旧格式）
  const addressesPath = path.join(__dirname, '..', 'deployed-addresses.json');
  fs.writeFileSync(addressesPath, JSON.stringify({
    oracle: oracle.address,
    weth: weth.address,
    usdc: usdc.address,
    collateralManager: cm.address,
    interestModel: irm.address,
    lendingPool: pool.address,
    deployer: deployer.address,
    user1: user1.address,
    user2: user2.address,
    user3: user3.address
  }, null, 2));
  console.log('✅ 合约地址已保存到:', addressesPath);

  // ========== 总结 ==========
  console.log('\n' + '='.repeat(80));
  console.log('🎉 部署完成！');
  console.log('='.repeat(80));
  console.log('✅ 已部署的合约:');
  console.log('   - PriceOracleMock');
  console.log('   - WETH Token (18 decimals)');
  console.log('   - USDC Token (6 decimals)');
  console.log('   - CollateralManager');
  console.log('   - InterestRateModel');
  console.log('   - LendingPool');
  console.log('');
  console.log('✅ 初始状态:');
  console.log('   - 流动性: 100 WETH + 80,000 USDC');
  console.log('   - User1: 10 WETH 抵押品，12,000 USDC 借款（健康状态）');
  console.log('   - User3: 5 WETH 存款（无借款）');
  console.log('   - User2: 50,000 USDC（可用于清算）');
  console.log('');
  console.log('📝 前端可以使用以下文件:');
  console.log('   - frontend-config.json (完整配置)');
  console.log('   - deployed-addresses.json (地址列表)');
  console.log('');
  console.log('💡 提示:');
  console.log('   - 前端可以连接这些合约地址进行交互');
  console.log('   - 可以使用 User1 账户演示借款功能');
  console.log('   - 可以模拟价格下跌触发清算条件');
  console.log('   - 可以使用 User2 账户执行清算');
  console.log('='.repeat(80) + '\n');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

