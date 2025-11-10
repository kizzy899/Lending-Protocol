// 简单部署脚本：部署 TokenMock, CollateralManager, InterestRateModel, LendingPool
// 使用：
// npx hardhat run scripts/deploy.js --network localhost

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying contracts with account:', deployer.address);

  // Deploy TokenMock (用于测试)
  const Token = await ethers.getContractFactory('TokenMock');
  const token = await Token.deploy('Mock Token', 'MCK', 18);
  await token.deployed();
  console.log('TokenMock deployed to:', token.address);

  // Deploy a simple InterestRateModel
  // baseRate & slope are per-second rates with 1e18 precision. 使用较小基数以便测试
  const baseRate = ethers.BigNumber.from('0'); // 0 per sec
  const slope = ethers.utils.parseUnits('0.000001', 18); // small slope
  const IRM = await ethers.getContractFactory('InterestRateModel');
  const irm = await IRM.deploy(baseRate, slope);
  await irm.deployed();
  console.log('InterestRateModel deployed to:', irm.address);

  // Deploy a minimal price oracle mock contract to provide prices for tests
  const PriceOracleMockFactory = await ethers.getContractFactory(
    [
      'function setPrice(address token, uint256 price) external',
      'function getPrice(address token) external view returns (uint256)'
    ],
    { bytecode: '0x' }
  ).catch(() => null);

  // Since creating an on-the-fly contract via getContractFactory with raw ABI/bytecode is tricky,
  // we'll instead reuse CollateralManager as a price oracle placeholder by passing a deployed mock later.

  // Deploy CollateralManager with a placeholder oracle (deployer address) then use it for price-related calls in tests
  const CollateralManager = await ethers.getContractFactory('CollateralManager');
  const cm = await CollateralManager.deploy(deployer.address);
  await cm.deployed();
  console.log('CollateralManager deployed to:', cm.address);

  // Deploy LendingPool with collateralManager address
  const LendingPool = await ethers.getContractFactory('LendingPool');
  const pool = await LendingPool.deploy(cm.address);
  await pool.deployed();
  console.log('LendingPool deployed to:', pool.address);

  // List market for token: call listMarket from owner
  // The function listMarket is onlyOwner; deployer is owner
  const tx = await pool.listMarket(token.address, irm.address, 1000); // reserveFactor 1000 == 10%
  await tx.wait();
  console.log('Market listed for token:', token.address);

  console.log('\nSummary:');
  console.log('TokenMock:', token.address);
  console.log('InterestRateModel:', irm.address);
  console.log('CollateralManager:', cm.address);
  console.log('LendingPool:', pool.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
