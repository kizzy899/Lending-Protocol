import { createConfig, http } from 'wagmi';
import { sepolia, hardhat } from 'wagmi/chains';
import type { Abi } from 'viem';

// 导入 ABI
import lendingPoolAbiFile from '@/abi/LendingPool.json';
import collateralManagerAbiFile from '@/abi/CollaterManager.json';
import priceOracleAbiFile from '@/abi/PriceOracleMock.json';

// 导出 ABI
export const lendingPoolAbi = lendingPoolAbiFile.abi as Abi;
export const collateralManagerAbi = collateralManagerAbiFile.abi as Abi;
export const priceOracleAbi = priceOracleAbiFile.abi as Abi;

// 合约地址接口
interface ContractAddresses {
  lendingPool: `0x${string}`;
  collateralManager: `0x${string}`;
  priceOracle: `0x${string}`;
  weth: `0x${string}`;
  usdc: `0x${string}`;
}

// 网络类型
type NetworkType = 'hardhat' | 'sepolia' | 'mainnet' | 'localhost';

// 各网络配置
const configs: Record<NetworkType, ContractAddresses> = {
  hardhat: {
    lendingPool: (process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS || '0xc4F5997af934fA3aE10AFDEfa67317BdF498b0c0') as `0x${string}`,
    collateralManager: (process.env.NEXT_PUBLIC_COLLATERAL_MANAGER_ADDRESS || '0x456a9d52350C1aA9d3F5abAdf005C3f2c6A6A288') as `0x${string}`,
    priceOracle: (process.env.NEXT_PUBLIC_PRICE_ORACLE_ADDRESS || '0x3FCB9B49EC69106aE6b0CA284b5Ba203953ab787') as `0x${string}`,
    weth: (process.env.NEXT_PUBLIC_WETH_ADDRESS || '0xC5E69F3D3BB1566b639325fB2EB6ad9e1c28ACd9') as `0x${string}`,
    usdc: (process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x3ec87e0E6ff7D0902cF7A0D79C2923e210a46439') as `0x${string}`,
  },
  localhost: {
    lendingPool: (process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
    collateralManager: (process.env.NEXT_PUBLIC_COLLATERAL_MANAGER_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
    priceOracle: (process.env.NEXT_PUBLIC_PRICE_ORACLE_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
    weth: (process.env.NEXT_PUBLIC_WETH_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
    usdc: (process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
  },
  sepolia: {
    lendingPool: (process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS || '0xc4F5997af934fA3aE10AFDEfa67317BdF498b0c0') as `0x${string}`,
      collateralManager: (process.env.NEXT_PUBLIC_COLLATERAL_MANAGER_ADDRESS || '0x456a9d52350C1aA9d3F5abAdf005C3f2c6A6A288') as `0x${string}`,
    priceOracle: (process.env.NEXT_PUBLIC_PRICE_ORACLE_ADDRESS || '0x3FCB9B49EC69106aE6b0CA284b5Ba203953ab787') as `0x${string}`,
    weth: (process.env.NEXT_PUBLIC_WETH_ADDRESS || '0xC5E69F3D3BB1566b639325fB2EB6ad9e1c28ACd9') as `0x${string}`,
    usdc: (process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x3ec87e0E6ff7D0902cF7A0D79C2923e210a46439') as `0x${string}`,
  },
  mainnet: {
    lendingPool: (process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
    collateralManager: (process.env.NEXT_PUBLIC_COLLATERAL_MANAGER_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
    priceOracle: (process.env.NEXT_PUBLIC_PRICE_ORACLE_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
    weth: (process.env.NEXT_PUBLIC_WETH_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
    usdc: (process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
  },
};

// 获取当前网络类型
function getCurrentNetwork(): NetworkType {
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'http://127.0.0.1:8545';
  const networkEnv = process.env.NEXT_PUBLIC_NETWORK as NetworkType | undefined;
  
  if (networkEnv && networkEnv in configs) {
    return networkEnv;
  }
  
  // 根据 RPC URL 自动判断
  if (rpcUrl.includes('localhost') || rpcUrl.includes('127.0.0.1')) {
    return 'hardhat';
  }
  
  // 默认返回 sepolia
  return 'sepolia';
}

// 获取合约配置
export function getContractConfig(network?: NetworkType): ContractAddresses {
  const targetNetwork = network || getCurrentNetwork();
  return configs[targetNetwork];
}

// 导出当前网络的合约地址（向后兼容）
const currentConfig = getContractConfig();
export const lendingPoolAddress = currentConfig.lendingPool;
export const collateralManagerAddress = currentConfig.collateralManager;
export const priceOracleAddress = currentConfig.priceOracle;
export const wethAddress = currentConfig.weth;
export const usdcAddress = currentConfig.usdc;

// 导出类型
export type { NetworkType, ContractAddresses };

// 代币配置接口
interface TokenConfig {
  address: `0x${string}`;
  name: string;
  symbol: string;
  decimals: number;
  price: string;
  ltv: number;
  liquidationThreshold: number;
}

// 代币配置（使用当前网络的地址）
export const tokens: Record<'WETH' | 'USDC', TokenConfig> = {
  WETH: {
    address: wethAddress,
    name: 'Wrapped ETH',
    symbol: 'WETH',
    decimals: 18,
    price: '2000',
    ltv: 80,
    liquidationThreshold: 85,
  },
  USDC: {
    address: usdcAddress,
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
    price: '1',
    ltv: 90,
    liquidationThreshold: 93,
  },
};

export type { TokenConfig };

// ERC20 ABI（用于代币操作）
export const erc20Abi = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      { name: '_spender', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [
      { name: '_owner', type: 'address' },
      { name: '_spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    type: 'function',
  },
] as const;

// Wagmi 配置
const rpcUrl = "https://sepolia.infura.io/v3/cf8ac5c33c5e4e30a82b9859de4ab411";

export const config = createConfig({
  chains: [sepolia],
  transports: {
    [sepolia.id]: http(rpcUrl),
  } as Record<number, ReturnType<typeof http>>,
});



