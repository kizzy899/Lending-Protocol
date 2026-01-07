'use client';

import React, { useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { lendingPoolAddress, lendingPoolAbi, wethAddress, usdcAddress, erc20Abi, tokens } from '@/config';

export function Liquidation() {
  const { address } = useAccount();
  const [borrowerAddress, setBorrowerAddress] = useState('');
  const [repayToken, setRepayToken] = useState<'WETH' | 'USDC'>('USDC');
  const [seizeToken, setSeizeToken] = useState<'WETH' | 'USDC'>('WETH');
  const [amount, setAmount] = useState('');

  const repayTokenAddress = repayToken === 'WETH' ? wethAddress : usdcAddress;
  const seizeTokenAddress = seizeToken === 'WETH' ? wethAddress : usdcAddress;
  const repayTokenInfo = tokens[repayToken];

  // 读取清算人的代币余额
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: repayTokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // 读取授权额度
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: repayTokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, lendingPoolAddress] : undefined,
    query: { enabled: !!address },
  });

  // 读取借款人的健康度
  const { data: healthFactor } = useReadContract({
    address: lendingPoolAddress,
    abi: lendingPoolAbi,
    functionName: 'getHealthFactor',
    args: borrowerAddress ? [borrowerAddress, [wethAddress, usdcAddress], [wethAddress, usdcAddress]] : undefined,
    query: { enabled: !!borrowerAddress },
  });

  // 处理健康度数据
  const maxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  const healthFactorValue = healthFactor as bigint | undefined;

  // 读取借款人的借款
  const { data: borrowerDebt } = useReadContract({
    address: lendingPoolAddress,
    abi: lendingPoolAbi,
    functionName: 'borrowed',
    args: borrowerAddress ? [borrowerAddress, repayTokenAddress] : undefined,
    query: { enabled: !!borrowerAddress },
  });

  // 处理借款人债务数据
  const borrowerDebtValue = borrowerDebt as bigint | undefined;

  // 写入操作
  const { writeContract: approveToken, data: approveHash } = useWriteContract();
  const { writeContract: liquidate, data: liquidateHash } = useWriteContract();

  // 等待交易确认
  const { isLoading: isApproving, isSuccess: isApproved } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isLoading: isLiquidating, isSuccess: isLiquidated } = useWaitForTransactionReceipt({ hash: liquidateHash });

  // 交易确认后刷新数据
  React.useEffect(() => {
    if (isApproved || isLiquidated) {
      refetchBalance();
      refetchAllowance();
      setAmount('');
    }
  }, [isApproved, isLiquidated, refetchBalance, refetchAllowance]);

  const handleApprove = () => {
    if (!address || !amount) return;
    const amountBigInt = parseUnits(amount, repayTokenInfo.decimals);
    approveToken({
      address: repayTokenAddress,
      abi: erc20Abi,
      functionName: 'approve',
      args: [lendingPoolAddress, amountBigInt],
    });
  };

  const handleLiquidate = () => {
    if (!address || !borrowerAddress || !amount) return;
    const amountBigInt = parseUnits(amount, repayTokenInfo.decimals);
    liquidate({
      address: lendingPoolAddress,
      abi: lendingPoolAbi,
      functionName: 'liquidate',
      args: [borrowerAddress, repayTokenAddress, seizeTokenAddress, amountBigInt],
    });
  };

  const needsApproval = amount && allowance 
    ? parseUnits(amount, repayTokenInfo.decimals) > (allowance as bigint)
    : false;

  const isEligible = healthFactorValue && healthFactorValue !== maxUint256
    ? Number(healthFactorValue) < 10000
    : false;

  const maxAmount = balance ? formatUnits(balance as bigint, repayTokenInfo.decimals) : '0';

  if (!address) {
    return (
      <div className="bg-card rounded-2xl p-6 border border-border">
        <p className="text-muted-foreground">请连接钱包</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl p-6 border border-border">
      <h2 className="text-2xl font-semibold text-card-foreground mb-6">清算</h2>

      {/* 借款人地址 */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">借款人地址</label>
        <input
          type="text"
          value={borrowerAddress}
          onChange={(e) => setBorrowerAddress(e.target.value)}
          placeholder="0x..."
          className="w-full p-2 border border-border rounded-lg bg-background"
        />
      </div>

      {/* 健康度显示 */}
      {borrowerAddress && healthFactorValue && (
        <div className="mb-4 p-3 bg-muted rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">健康度</span>
            <span className={`text-lg font-bold ${
              Number(healthFactorValue) < 10000 ? 'text-red-500' : 'text-green-500'
            }`}>
              {healthFactorValue === maxUint256
                ? '∞'
                : (Number(healthFactorValue) / 100).toFixed(2) + '%'
              }
            </span>
          </div>
          {!isEligible && (
            <p className="text-sm text-yellow-500 mt-2">
              ⚠️ 健康度高于 100%，无法清算
            </p>
          )}
        </div>
      )}

      {/* 偿还代币 */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">偿还代币</label>
        <select
          value={repayToken}
          onChange={(e) => setRepayToken(e.target.value as 'WETH' | 'USDC')}
          className="w-full p-2 border border-border rounded-lg bg-background"
        >
          <option value="WETH">WETH</option>
          <option value="USDC">USDC</option>
        </select>
      </div>

      {/* 没收代币 */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">没收代币（抵押品）</label>
        <select
          value={seizeToken}
          onChange={(e) => setSeizeToken(e.target.value as 'WETH' | 'USDC')}
          className="w-full p-2 border border-border rounded-lg bg-background"
        >
          <option value="WETH">WETH</option>
          <option value="USDC">USDC</option>
        </select>
      </div>

      {/* 余额显示 */}
      <div className="mb-4 p-3 bg-muted rounded-lg">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">可用余额</span>
          <span className="font-medium">
            {balance ? formatUnits(balance as bigint, repayTokenInfo.decimals) : '0'} {repayTokenInfo.symbol}
          </span>
        </div>
        {borrowerDebtValue && (
          <div className="flex justify-between text-sm mt-2">
            <span className="text-muted-foreground">借款人债务</span>
            <span className="font-medium">
              {formatUnits(borrowerDebtValue, repayTokenInfo.decimals)} {repayTokenInfo.symbol}
            </span>
          </div>
        )}
      </div>

      {/* 输入金额 */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">清算金额</label>
        <div className="flex space-x-2">
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="flex-1 p-2 border border-border rounded-lg bg-background"
          />
          <button
            onClick={() => setAmount(maxAmount)}
            className="px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg text-sm"
          >
            最大
          </button>
        </div>
      </div>

      {/* 操作按钮 */}
      {needsApproval ? (
        <button
          onClick={handleApprove}
          disabled={isApproving || !amount}
          className="w-full py-3 px-4 bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-primary-foreground font-semibold rounded-lg transition-colors"
        >
          {isApproving ? '授权中...' : '授权代币'}
        </button>
      ) : (
        <button
          onClick={handleLiquidate}
          disabled={
            isLiquidating || 
            !amount || 
            !borrowerAddress ||
            parseFloat(amount) <= 0 ||
            !isEligible
          }
          className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 text-white font-semibold rounded-lg transition-colors"
        >
          {isLiquidating ? '清算中...' : '执行清算'}
        </button>
      )}

      {/* 交易状态 */}
      {isLiquidated && (
        <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-sm text-green-800 dark:text-green-200 font-semibold">
            ✅ 清算成功！您已获得清算奖励
          </p>
        </div>
      )}

      {/* 提示信息 */}
      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          💡 提示：清算需要借款人健康度低于 100%。清算人将获得 5% 的清算奖励。
        </p>
      </div>
    </div>
  );
}

