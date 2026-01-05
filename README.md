# Lending Protocol

一个去中心化借贷协议，模拟 Aave/Compound 的核心功能，支持多代币抵押、动态利率和自动清算机制。

## 📋 项目简介

本项目是一个完整的去中心化借贷协议实现，包含智能合约、测试套件和前端界面。用户可以存入代币作为抵押品，借出其他代币，系统会根据资金利用率动态调整利率，并在抵押率不足时触发清算机制。

## ✨ 功能特性

- **多代币支持**：支持 WETH、USDC 等多种 ERC20 代币
- **动态利率模型**：根据资金利用率自动调整借款和存款利率
- **抵押率管理**：每种代币可设置不同的 LTV（Loan-to-Value）和清算阈值
- **自动清算**：当用户健康度低于阈值时，清算人可以清算并获得奖励
- **利息累积**：实时计算和累积借款利息
- **健康度监控**：实时计算和显示用户账户健康度

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 智能合约 | Solidity ^0.8.19 |
| 开发框架 | Hardhat |
| 测试框架 | Mocha + Chai |
| 前端框架 | Next.js 15 + React |
| Web3 库 | wagmi + viem |
| 钱包连接 | ConnectKit |

## 📁 项目结构

```
Lending-Protocol/
├── contracts/              # 智能合约
│   ├── LendingPool.sol           # 主借贷池合约
│   ├── CollateralManager.sol      # 抵押品管理器
│   ├── InterestRateModel.sol      # 利率模型
│   ├── PriceOracleMock.sol        # 价格预言机（测试用）
│   ├── ChainlinkPriceOracle.sol   # Chainlink 价格预言机
│   ├── TokenMock.sol              # 测试代币
│   └── interfaces/                # 接口定义
│
├── scripts/                # 部署脚本
│   ├── deploy-frontend.js         # 前端演示数据部署
│   └── quick-demo.js              # 快速演示脚本
│
├── test/                   # 测试文件
│   ├── lending.test.js           # 借贷功能测试
│   └── liquidation.test.js        # 清算功能测试
│
├── frontend/               # 前端应用
│   ├── app/                      # Next.js 页面
│   ├── component/                 # React 组件
│   ├── config/                   # 配置文件
│   └── abi/                      # 合约 ABI
│
├── hardhat.config.js       # Hardhat 配置
└── README.md               # 项目说明
```

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 编译合约

```bash
npx hardhat compile
```

### 运行测试

```bash
npx hardhat test
```

### 部署合约

```bash
# 部署到本地网络（需要先启动节点）
npx hardhat node
npx hardhat run scripts/deploy-frontend.js --network localhost

# 或使用 Hardhat 内置网络
npx hardhat run scripts/deploy-frontend.js
```

### 启动前端

```bash
cd frontend
npm install
npm run dev
```

## 📚 核心合约

### LendingPool

主借贷池合约，负责：
- 存款和取款
- 借款和还款
- 利息累积（`_accrue`）
- 清算执行
- 健康度计算

### CollateralManager

抵押品管理器，负责：
- LTV（贷款价值比）管理
- 清算阈值设置
- 清算奖励配置
- 抵押品价值计算

### InterestRateModel

利率模型，根据资金利用率计算动态利率：
```
utilizationRate = totalBorrows / (totalSupply + totalBorrows)
borrowRate = baseRate + utilizationRate * slope
```

## 🧠 DeFi 核心机制

### 资金利用率（Utilization Rate）

资金利用率决定了利率的高低，利用率越高，借款利率越高：

```solidity
utilizationRate = (totalBorrows * 1e18) / (totalSupply + totalBorrows)
```

### 动态利率模型

利率根据资金利用率动态调整，鼓励资金流动：

```solidity
borrowRate = baseRate + (utilizationRate * slope) / 1e18
```

- **低利用率**：低利率，鼓励借款
- **高利用率**：高利率，鼓励存款和还款

### 抵押率与健康度

**LTV (Loan-to-Value)**：贷款价值比，决定最大借款能力
```
借款能力 = 抵押品价值 × LTV
```

**健康度 (Health Factor)**：衡量账户安全性的指标
```
健康度 = (抵押品清算阈值价值 × 10000) / 总借款价值
```

- 健康度 > 100%：安全
- 健康度 < 100%：可被清算

### 清算机制

当用户健康度低于 100% 时，清算人可以：
1. 偿还部分借款（最多 50%，由 closeFactor 决定）
2. 获得抵押品（包含 5% 清算奖励）
3. 帮助用户恢复健康度

清算公式：
```
清算奖励 = 偿还金额 × liquidationBonus / 10000
获得抵押品 = (偿还金额 × liquidationBonus) / 抵押品价格
```

## 🎯 项目目标

本项目旨在帮助开发者深入理解：

- **DeFi 借贷协议的核心经济机制**：利率模型、资金利用率、抵押率管理
- **链上风险控制**：如何通过健康度和清算机制保证系统安全
- **智能合约安全实践**：重入保护、权限控制、输入验证
- **前端与 EVM 交互**：使用 wagmi/viem 与智能合约交互的最佳实践

## 🧪 测试

项目包含完整的测试套件：

```bash
# 运行所有测试
npx hardhat test

# 运行特定测试文件
npx hardhat test test/lending.test.js
npx hardhat test test/liquidation.test.js
```

测试覆盖：
- ✅ 市场注册
- ✅ 存款和取款
- ✅ 借款和还款
- ✅ 健康度计算
- ✅ 清算机制
- ✅ 边界条件

## 🔐 安全特性

- **重入保护**：使用 `ReentrancyGuard` 防止重入攻击
- **权限控制**：关键操作使用 `onlyOwner` 修饰符
- **溢出保护**：Solidity 0.8+ 自动检测溢出
- **输入验证**：所有用户输入都经过验证
- **健康度检查**：防止不安全的操作
- **价格验证**：防止价格操纵攻击

## ⛽ Gas 优化

- 合理使用 `storage` 与 `memory`
- 避免重复的状态读取
- 使用 `unchecked` 优化数学计算
- 简化循环与映射访问
- 合理打包事件日志

## 📖 更多信息

- 前端文档：查看 [frontend/README.md](./frontend/README.md)
- 部署指南：运行 `npx hardhat run scripts/deploy-frontend.js` 查看部署说明

## 📄 License

ISC
