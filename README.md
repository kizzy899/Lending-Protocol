# Lending-Protocol
模拟 Aave / Compound 的去中心化借贷协议

> 使用 **Solidity + Hardhat + Ethers.js** 实现的去中心化借贷协议，支持多代币抵押与借贷，具备利率模型、抵押率管理、清算机制、安全防护和 Gas 优化等核心功能。  
> 本项目旨在深入理解 DeFi 协议核心逻辑与链上风险控制机制。

---

## 🚀 项目简介

本项目是一个 **Aave / Compound 风格的去中心化借贷协议模拟实现**，用户可以：

- 存入多种 ERC20 代币作为抵押资产（Collateral）
- 借出其他代币（Borrow）
- 根据 **利率模型** 动态计算借款利率与存款利率
- 自动维护 **抵押率 (Collateral Ratio)**，当低于阈值时可被清算
- 实现 **清算机制 (Liquidation)**，保证系统健康运行
- 支持多代币资产管理与账户健康度监控

该项目完整复刻了去中心化金融 (DeFi) 协议的核心逻辑，展示了如何在链上实现借贷、计息与风险控制。

---

## 🧩 技术栈

| 层级 | 技术 |
|------|------|
| 智能合约 | Solidity (v0.8.28) |
| 开发框架 | Hardhat |
| 测试框架 | Mocha + Chai |
| 前端交互 | Ethers.js |
| 区块链网络 | Ethereum (Hardhat local / Testnet) |

---

## ⚙️ 功能特性

### 🏦 1. 存款与借款
- 用户可存入任意支持的 ERC20 代币。
- 存入后获得对应的利息收益。
- 借款需满足抵押率要求。

### 📈 2. 利率模型（Interest Rate Model）
- 动态利率算法，根据资金利用率 (Utilization Rate) 自动调整借款利率与存款利率。
- 支持线性或阶梯利率模型。

### 🧮 3. 抵押率管理（Collateral Management）
- 每种代币设定不同的抵押率（如 ETH: 80%, DAI: 75%）。
- 借款上限由抵押资产价值决定。

### ⚖️ 4. 清算机制（Liquidation）
- 当抵押率低于安全阈值（如 75%），可由其他用户发起清算。
- 清算人获得部分奖励（Liquidation Bonus）。

### 💎 5. 多代币支持
- 支持多种 ERC20 资产，如 WETH、DAI、USDC 等。
- 动态注册新代币市场。

### 🛡️ 6. 安全与 Gas 优化
- 使用 `ReentrancyGuard` 防重入攻击。
- 避免不必要的存储读写与状态更新。
- 使用 `unchecked` 优化数学计算。
- 对关键函数加上权限与条件验证（modifier）。

---

## 📁 项目结构
```
├── contracts
│ ├── LendingPool.sol # 主借贷逻辑合约
│ ├── InterestRateModel.sol # 利率计算模型
│ ├── CollateralManager.sol # 抵押率与清算逻辑
│ ├── TokenMock.sol # 测试代币 (ERC20)
│ └── interfaces/ # 接口文件夹
│
├── scripts
│ ├── deploy.js # 部署脚本
│
├── test
│ ├── lending.test.js # 借贷核心功能测试
│ ├── liquidation.test.js # 清算机制测试
│
├── frontend/
│ ├── index.html # 前端页面
│ ├── app.js # 使用 Ethers.js 的交互逻辑
│
├── hardhat.config.js
└── README.md
```

## 🧪 部署与测试

### 1️⃣ 安装依赖
```bash
npm install
```

2️⃣ 编译合约
```
npx hardhat compile
```

3️⃣ 运行测试
```
npx hardhat test
```

4️⃣ 启动本地节点
```
npx hardhat node
```

5️⃣ 部署到本地网络
```
npx hardhat run scripts/deploy.js --network localhost
```
6️⃣ 前端交互

前端使用 Ethers.js 与合约交互，可通过：
```
npx hardhat node
```

并在浏览器中打开 frontend/index.html 查看 UI。


🧠 核心算法示例

资金利用率计算
```
utilizationRate = totalBorrows * 1e18 / totalDeposits;
```

利率模型 (线性增长)
```
borrowRate = baseRate + utilizationRate * slope;
```

抵押率计算
```
collateralRatio = (collateralValue * 100) / borrowedValue;
```

清算条件
```
require(collateralRatio < liquidationThreshold, "Position healthy");
```

🔐 安全防护
```
✅ 防重入攻击：使用 ReentrancyGuard

✅ 安全数学：SafeMath（Solidity 0.8+ 自动检测溢出）

✅ 权限控制：onlyOwner 限制关键操作

✅ 外部调用安全：防止闪电贷攻击与价格操纵

✅ 测试覆盖：覆盖存款、借款、清算、边界条件等
```

⛽ Gas 优化
```
合理使用 storage 与 memory

避免重复的状态读取

合理打包事件日志

使用 unchecked 减少安全检查成本

简化循环与映射访问
```

🌐 项目目标
```
该项目旨在帮助开发者理解：

DeFi 借贷协议的 核心经济机制

如何在链上实现 动态利率与风险管理

智能合约的 安全与优化实践
```

前端与 EVM 的 交互模式
