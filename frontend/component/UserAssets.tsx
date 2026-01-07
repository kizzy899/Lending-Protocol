'use client';

import React from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { lendingPoolAddress, lendingPoolAbi, wethAddress, usdcAddress, tokens } from '@/config';

export function UserAssets() {
  const { address } = useAccount();

  // 读取用户抵押品
  const { data: wethSupplied } = useReadContract({
    address: lendingPoolAddress,
    abi: lendingPoolAbi,
    functionName: 'supplied',
    args: address ? [address, wethAddress] : undefined,
    query: { enabled: !!address },
  });

  const { data: usdcSupplied } = useReadContract({
    address: lendingPoolAddress,
    abi: lendingPoolAbi,
    functionName: 'supplied',
    args: address ? [address, usdcAddress] : undefined,
    query: { enabled: !!address },
  });

  // 读取用户借款
  const { data: wethBorrowed } = useReadContract({
    address: lendingPoolAddress,
    abi: lendingPoolAbi,
    functionName: 'borrowed',
    args: address ? [address, wethAddress] : undefined,
    query: { enabled: !!address },
  });

  const { data: usdcBorrowed } = useReadContract({
    address: lendingPoolAddress,
    abi: lendingPoolAbi,
    functionName: 'borrowed',
    args: address ? [address, usdcAddress] : undefined,
    query: { enabled: !!address },
  });

  // 读取健康度
  const { data: healthFactor } = useReadContract({
    address: lendingPoolAddress,
    abi: lendingPoolAbi,
    functionName: 'getHealthFactor',
    args: address ? [address, [wethAddress, usdcAddress], [wethAddress, usdcAddress]] : undefined,
    query: { enabled: !!address },
  });

  if (!address) {
    return (
      <div className="bg-card rounded-2xl p-6 border border-border">
        <p className="text-muted-foreground">请连接钱包查看资产</p>
      </div>
    );
  }

  // 处理健康度数据
  const maxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  const healthFactorValue = healthFactor as bigint | undefined;

  const healthPercent = healthFactorValue 
    ? healthFactorValue === maxUint256
      ? '∞'
      : (Number(healthFactorValue) / 100).toFixed(2) + '%'
    : '计算中...';

  const healthColor = healthFactorValue && healthFactorValue !== maxUint256
    ? Number(healthFactorValue) < 10000
      ? 'text-red-500'
      : Number(healthFactorValue) < 15000
      ? 'text-yellow-500'
      : 'text-green-500'
    : 'text-foreground';

  return (
    <div className="bg-card rounded-2xl p-6 border border-border">
      <h2 className="text-2xl font-semibold text-card-foreground mb-6">我的资产</h2>
      
      {/* 健康度 */}
      <div className="mb-6 p-4 bg-muted rounded-lg">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">健康度</span>
          <span className={`text-2xl font-bold ${healthColor}`}>{healthPercent}</span>
        </div>
        {healthFactorValue && healthFactorValue !== maxUint256 && Number(healthFactorValue) < 10000 && (
          <p className="text-sm text-red-500 mt-2">⚠️ 健康度低于 100%，可能被清算</p>
        )}
      </div>

      {/* 抵押品 */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3">抵押品</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
            <div>
              <p className="font-medium">WETH</p>
              <p className="text-sm text-muted-foreground">
                {wethSupplied ? formatUnits(wethSupplied as bigint, 18) : '0'} WETH
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">价值</p>
              <p className="font-medium">
                ${wethSupplied ? (Number(formatUnits(wethSupplied as bigint, 18)) * Number(tokens.WETH.price)).toFixed(2) : '0'}
              </p>
            </div>
          </div>
          <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
            <div>
              <p className="font-medium">USDC</p>
              <p className="text-sm text-muted-foreground">
                {usdcSupplied ? formatUnits(usdcSupplied as bigint, 6) : '0'} USDC
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">价值</p>
              <p className="font-medium">
                ${usdcSupplied ? formatUnits(usdcSupplied as bigint, 6) : '0'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 借款 */}
      <div>
        <h3 className="text-lg font-semibold mb-3">借款</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
            <div>
              <p className="font-medium">WETH</p>
              <p className="text-sm text-muted-foreground">
                {wethBorrowed ? formatUnits(wethBorrowed as bigint, 18) : '0'} WETH
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">价值</p>
              <p className="font-medium">
                ${wethBorrowed ? (Number(formatUnits(wethBorrowed as bigint, 18)) * Number(tokens.WETH.price)).toFixed(2) : '0'}
              </p>
            </div>
          </div>
          <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
            <div>
              <p className="font-medium">USDC</p>
              <p className="text-sm text-muted-foreground">
                {usdcBorrowed ? formatUnits(usdcBorrowed as bigint, 6) : '0'} USDC
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">价值</p>
              <p className="font-medium">
                ${usdcBorrowed ? formatUnits(usdcBorrowed as bigint, 6) : '0'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

