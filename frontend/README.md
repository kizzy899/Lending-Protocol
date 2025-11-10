前端说明（Frontend）

这个简单前端用于与本地部署的 LendingPool 合约交互（演示与调试）。它使用 Ethers.js，并期望你在本地运行 Hardhat 节点并部署合约。

主要功能：
- 连接 MetaMask 钱包
- 输入 LendingPool 合约地址和 TokenMock 地址，加载市场与用户数据
- Deposit / Withdraw / Borrow / Repay 操作
- Approve 按钮与自动 approve 流程（在 deposit / repay 前会检查 allowance 并在必要时自动发起 approve）

快速上手

1. 编译合约：
   npm install
   npx hardhat compile

2. 启动本地节点：
   npx hardhat node

3. 部署合约到本地网络：
   npx hardhat run scripts/deploy.js --network localhost

脚本会输出合约地址（TokenMock、InterestRateModel、CollateralManager、LendingPool）。把 LendingPool 与 TokenMock 地址填到页面输入框中。

4. 运行前端：
   推荐使用一个静态服务器来打开 frontend 文件夹，例如使用 serve：
   npx serve frontend

5. 在 MetaMask 中选择 Localhost 8545，连接钱包，输入合约地址，点击“加载市场 & 用户数据”。

注意事项
- Deposit / Repay 操作会使用 ERC20 的 transferFrom，因此在执行这些操作前需要 approve。前端提供了手动 Approve 按钮，也会在必要时自动发起 approve（自动 approve 默认使用 MaxUint256，或使用你在 approve 输入框里填写的金额）。
- 如果需要更复杂的前端（多代币支持、Allowance 显示等），我可以继续扩展。

Enjoy!
