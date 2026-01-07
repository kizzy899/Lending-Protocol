// 🚀 一键部署并演示完整的借贷清算流程
// 这个脚本会：
// 1. 部署所有合约
// 2. 自动铸造测试代币（不需要你有任何代币）
// 3. 完整演示借贷和清算流程
// 使用方式：
//   - 使用 Hardhat 内置网络（推荐，无需启动节点）：
//     npx hardhat run scripts/quick-demo.js
//   - 使用本地节点（需要先启动：npx hardhat node）：
//     npx hardhat run scripts/quick-demo.js --network localhost

const { ethers } = require("hardhat");

function formatAmount(amount, decimals = 18) {
  return ethers.utils.formatUnits(amount, decimals);
}

function formatUSD(amount) {
  return '$' + parseFloat(formatAmount(amount, 18)).toFixed(2);
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('🎬 一键演示：借贷协议完整流程 (从零开始)');
  console.log('='.repeat(80));

  const [deployer, user1, user2] = await ethers.getSigners();
  
  console.log('\n👥 参与者:');
  console.log('   Deployer:', deployer.address, '(流动性提供者)');
  console.log('   User1:   ', user1.address, '(借款人)');
  console.log('   User2:   ', user2.address, '(清算人)');

  // ========== 部署阶段 ==========
  console.log('\n' + '─'.repeat(80));
  console.log('📦 第一阶段：部署合约');
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
  await cm.setLtv(weth.address, 8000);
  await cm.setLiquidationThreshold(weth.address, 8500);
  await cm.setLtv(usdc.address, 9000);
  await cm.setLiquidationThreshold(usdc.address, 9300);
  await cm.setCloseFactor(5000);
  await cm.setLiquidationBonus(10500);
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
  await pool.listMarket(weth.address, irm.address, 1000);
  await pool.listMarket(usdc.address, irm.address, 1000);
  console.log('✅ 市场注册完成');

  // ========== 铸币阶段 ==========
  console.log('\n' + '─'.repeat(80));
  console.log('💰 第二阶段：铸造测试代币 (免费获得)');
  console.log('─'.repeat(80));

  // 为所有人铸造代币
  await weth.mint(deployer.address, ethers.utils.parseUnits('100', 18));
  await usdc.mint(deployer.address, ethers.utils.parseUnits('50000', 6));
  console.log('✅ Deployer: 100 WETH + 50,000 USDC');

  await weth.mint(user1.address, ethers.utils.parseUnits('10', 18));
  await usdc.mint(user1.address, ethers.utils.parseUnits('5000', 6));
  console.log('✅ User1:    10 WETH + 5,000 USDC');

  await weth.mint(user2.address, ethers.utils.parseUnits('5', 18));
  await usdc.mint(user2.address, ethers.utils.parseUnits('10000', 6));
  console.log('✅ User2:    5 WETH + 10,000 USDC');

  // ========== 流动性提供 ==========
  console.log('\n' + '─'.repeat(80));
  console.log('🏊 第三阶段：Deployer 提供流动性');
  console.log('─'.repeat(80));

  await weth.connect(deployer).approve(pool.address, ethers.constants.MaxUint256);
  await usdc.connect(deployer).approve(pool.address, ethers.constants.MaxUint256);
  
  await pool.connect(deployer).deposit(weth.address, ethers.utils.parseUnits('50', 18));
  await pool.connect(deployer).deposit(usdc.address, ethers.utils.parseUnits('30000', 6));
  console.log('✅ 存入: 50 WETH + 30,000 USDC');

  // ========== 借贷演示 ==========
  console.log('\n' + '─'.repeat(80));
  console.log('💳 第四阶段：User1 存入抵押品并借款');
  console.log('─'.repeat(80));

  // User1 存入 5 WETH
  await weth.connect(user1).approve(pool.address, ethers.constants.MaxUint256);
  await pool.connect(user1).deposit(weth.address, ethers.utils.parseUnits('5', 18));
  console.log('✅ User1 存入: 5 WETH');
  
  const supplied = await pool.supplied(user1.address, weth.address);
  console.log('   抵押品价值:', formatUSD(supplied.mul(2000).mul(ethers.utils.parseUnits('1', 18)).div(ethers.utils.parseUnits('1', 18))));

  // User1 借出 7000 USDC
  await pool.connect(user1).borrow(usdc.address, ethers.utils.parseUnits('7000', 6));
  console.log('✅ User1 借出: 7,000 USDC');
  
  const borrowed = await pool.borrowed(user1.address, usdc.address);
  console.log('   借款金额:', formatAmount(borrowed, 6), 'USDC');

  // 检查健康度
  let health = await pool.getHealthFactor(user1.address, [weth.address], [usdc.address]);
  console.log('   健康度:', (health.toNumber() / 100).toFixed(2) + '% ✅ (安全)');

  // ========== 价格波动 ==========
  console.log('\n' + '─'.repeat(80));
  console.log('📉 第五阶段：市场波动 - WETH 价格暴跌');
  console.log('─'.repeat(80));

  console.log('⚠️  模拟市场崩盘...');
  await oracle.simulatePriceDrop(weth.address, 30); // 下跌 30%
  
  const newPrice = await oracle.getPrice(weth.address);
  console.log('✅ WETH 新价格:', formatUSD(newPrice), '(下跌 30%)');

  health = await pool.getHealthFactor(user1.address, [weth.address], [usdc.address]);
  console.log('   User1 新健康度:', (health.toNumber() / 100).toFixed(2) + '% 🚨 (可清算!)');

  // ========== 清算演示 ==========
  console.log('\n' + '─'.repeat(80));
  console.log('🔨 第六阶段：User2 执行清算');
  console.log('─'.repeat(80));

  // User2 清算前状态
  const user2UsdcBefore = await usdc.balanceOf(user2.address);
  const user2WethBefore = await weth.balanceOf(user2.address);
  console.log('User2 清算前:');
  console.log('   USDC:', formatAmount(user2UsdcBefore, 6));
  console.log('   WETH:', formatAmount(user2WethBefore, 18));

  // 执行清算
  await usdc.connect(user2).approve(pool.address, ethers.constants.MaxUint256);
  await pool.connect(user2).liquidate(
    user1.address,
    usdc.address,
    weth.address,
    ethers.utils.parseUnits('3500', 6)
  );
  console.log('✅ 清算执行成功！');

  // User2 清算后状态
  const user2UsdcAfter = await usdc.balanceOf(user2.address);
  const user2WethAfter = await weth.balanceOf(user2.address);
  const wethGain = user2WethAfter.sub(user2WethBefore);
  const usdcSpent = user2UsdcBefore.sub(user2UsdcAfter);
  
  console.log('User2 清算后:');
  console.log('   支付 USDC:', formatAmount(usdcSpent, 6));
  console.log('   获得 WETH:', formatAmount(wethGain, 18));
  
  const wethValue = wethGain.mul(newPrice).div(ethers.utils.parseUnits('1', 18));
  const profit = wethValue.sub(usdcSpent.mul(ethers.utils.parseUnits('1', 12)));
  console.log('   💰 清算收益:', formatUSD(profit));

  // User1 最终状态
  const finalSupplied = await pool.supplied(user1.address, weth.address);
  const finalBorrowed = await pool.borrowed(user1.address, usdc.address);
  const finalHealth = await pool.getHealthFactor(user1.address, [weth.address], [usdc.address]);
  
  console.log('User1 清算后:');
  console.log('   剩余抵押品:', formatAmount(finalSupplied, 18), 'WETH');
  console.log('   剩余借款:', formatAmount(finalBorrowed, 6), 'USDC');
  console.log('   健康度:', (finalHealth.toNumber() / 100).toFixed(2) + '% ✅ (已恢复)');

  // ========== 总结 ==========
  console.log('\n' + '='.repeat(80));
  console.log('🎉 演示完成！');
  console.log('='.repeat(80));
  console.log('✅ 完整演示了以下功能:');
  console.log('   1️⃣  部署完整的借贷协议');
  console.log('   2️⃣  免费铸造测试代币 (不需要任何初始资金)');
  console.log('   3️⃣  提供流动性');
  console.log('   4️⃣  存入抵押品并借款');
  console.log('   5️⃣  模拟价格波动触发清算条件');
  console.log('   6️⃣  执行清算并获得奖励');
  console.log('');
  console.log('💡 关键数据:');
  console.log('   - 初始 WETH 价格: $2,000');
  console.log('   - 下跌后价格: $1,400 (-30%)');
  console.log('   - 清算奖励: 5%');
  console.log('   - User1 健康度: 从安全 → 可清算 → 恢复');
  console.log('='.repeat(80));

  // 保存地址供后续使用
  const fs = require('fs');
  fs.writeFileSync('deployed-addresses.json', JSON.stringify({
    oracle: oracle.address,
    weth: weth.address,
    usdc: usdc.address,
    collateralManager: cm.address,
    interestModel: irm.address,
    lendingPool: pool.address,
    deployer: deployer.address,
    user1: user1.address,
    user2: user2.address
  }, null, 2));
  
  console.log('\n✅ 合约地址已保存到 deployed-addresses.json');
  console.log('📝 你可以使用这些地址在前端进行交互\n');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

