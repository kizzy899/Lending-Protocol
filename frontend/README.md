# 借贷协议前端

这是一个基于 Next.js + wagmi + ConnectKit 的去中心化借贷协议前端应用。

## 功能特性

- ✅ **存款/取款**：存入代币作为抵押品或取出已存入的代币
- ✅ **借款/还款**：使用抵押品借出代币或偿还借款
- ✅ **清算**：清算健康度低于 100% 的借款人，获得清算奖励
- ✅ **资产查看**：实时查看抵押品、借款和健康度
- ✅ **钱包连接**：支持 MetaMask、WalletConnect 等钱包

## 项目结构

```
frontend/
├── app/                    # Next.js App Router
│   ├── page.tsx           # 主页面
│   ├── layout.tsx         # 布局
│   └── provider.tsx       # Wagmi Provider
├── component/             # React 组件
│   ├── UserAssets.tsx     # 用户资产显示
│   ├── DepositWithdraw.tsx # 存款/取款
│   ├── BorrowRepay.tsx    # 借款/还款
│   └── Liquidation.tsx    # 清算
├── config/                 # 配置文件
│   └── index.ts           # 合约地址和 ABI（支持多网络）
├── abi/                    # 合约 ABI
│   ├── LendingPool.json
│   ├── CollaterManager.json
│   └── PriceOracleMock.json
└── public/                 # 静态文件
    └── frontend-config.json # 部署配置
```

## 技术栈

- **Next.js 15** - React 框架
- **wagmi** - React Hooks for Ethereum
- **ConnectKit** - 钱包连接 UI
- **viem** - 类型安全的 Ethereum 库
- **Tailwind CSS** - 样式框架
- **TypeScript** - 类型安全
