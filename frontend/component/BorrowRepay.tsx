'use client';

import React, { useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { lendingPoolAddress, lendingPoolAbi, wethAddress, usdcAddress, erc20Abi, tokens } from '@/config';

export function BorrowRepay() {
  const { address } = useAccount();
  const [activeTab, setActiveTab] = useState<'borrow' | 'repay'>('borrow');
  const [token, setToken] = useState<'WETH' | 'USDC'>('USDC');
  const [amount, setAmount] = useState('');

  const tokenAddress = token === 'WETH' ? wethAddress : usdcAddress;
  const tokenInfo = tokens[token];

  // 读取借款能力
  const { data: borrowPower } = useReadContract({
    address: lendingPoolAddress,
    abi: lendingPoolAbi,
    functionName: 'getUserBorrowingPowerUSD',
    args: address ? [address, [wethAddress, usdcAddress]] : undefined,
    query: { enabled: !!address },
  });

  // 读取当前借款
  const { data: borrowed, refetch: refetchBorrowed } = useReadContract({
    address: lendingPoolAddress,
    abi: lendingPoolAbi,
    functionName: 'borrowed',
    args: address ? [address, tokenAddress] : undefined,
    query: { enabled: !!address },
  });

  // 读取代币余额（用于还款）
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // 读取授权额度（用于还款）
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, lendingPoolAddress] : undefined,
    query: { enabled: !!address },
  });

  // 写入操作
  const { writeContract: approveToken, data: approveHash } = useWriteContract();
  const { writeContract: borrowToken, data: borrowHash } = useWriteContract();
  const { writeContract: repayToken, data: repayHash } = useWriteContract();

  // 等待交易确认
  const { isLoading: isApproving, isSuccess: isApproved } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isLoading: isBorrowing, isSuccess: isBorrowed } = useWaitForTransactionReceipt({ hash: borrowHash });
  const { isLoading: isRepaying, isSuccess: isRepaid } = useWaitForTransactionReceipt({ hash: repayHash });

  // 交易确认后刷新数据
  React.useEffect(() => {
    if (isApproved || isBorrowed || isRepaid) {
      refetchBorrowed();
      refetchBalance();
      refetchAllowance();
      setAmount('');
    }
  }, [isApproved, isBorrowed, isRepaid, refetchBorrowed, refetchBalance, refetchAllowance]);

  const handleApprove = () => {
    if (!address || !amount) return;
    const amountBigInt = parseUnits(amount, tokenInfo.decimals);
    approveToken({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'approve',
      args: [lendingPoolAddress, amountBigInt],
    });
  };

  const handleBorrow = () => {
    if (!address || !amount) return;
    const amountBigInt = parseUnits(amount, tokenInfo.decimals);
    borrowToken({
      address: lendingPoolAddress,
      abi: lendingPoolAbi,
      functionName: 'borrow',
      args: [tokenAddress, amountBigInt],
    });
  };

  const handleRepay = () => {
    if (!address || !amount) return;
    const amountBigInt = parseUnits(amount, tokenInfo.decimals);
    repayToken({
      address: lendingPoolAddress,
      abi: lendingPoolAbi,
      functionName: 'repay',
      args: [tokenAddress, amountBigInt, address],
    });
  };

  const needsApproval = activeTab === 'repay' && amount && allowance 
    ? parseUnits(amount, tokenInfo.decimals) > (allowance as bigint)
    : false;

  const maxAmount = activeTab === 'borrow'
    ? borrowPower ? formatUnits(borrowPower as bigint, 18) : '0' // borrowPower 是 18 位小数
    : borrowed ? formatUnits(borrowed as bigint, tokenInfo.decimals) : '0';

  if (!address) {
    return (
      <div className="bg-card rounded-2xl p-6 border border-border">
        <p className="text-muted-foreground">请连接钱包</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl p-6 border border-border">
      <h2 className="text-2xl font-semibold text-card-foreground mb-6">借款 / 还款</h2>

      {/* 标签页 */}
      <div className="flex space-x-2 mb-6">
        <button
          onClick={() => setActiveTab('borrow')}
          className={`flex-1 py-2 px-4 rounded-lg transition-colors ${
            activeTab === 'borrow'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          借款
        </button>
        <button
          onClick={() => setActiveTab('repay')}
          className={`flex-1 py-2 px-4 rounded-lg transition-colors ${
            activeTab === 'repay'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          还款
        </button>
      </div>

      {/* 代币选择 */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">选择代币</label>
        <select
          value={token}
          onChange={(e) => setToken(e.target.value as 'WETH' | 'USDC')}
          className="w-full p-2 border border-border rounded-lg bg-background"
        >
          <option value="WETH">WETH</option>
          <option value="USDC">USDC</option>
        </select>
      </div>

      {/* 信息显示 */}
      <div className="mb-4 space-y-2">
        {activeTab === 'borrow' ? (
          <div className="p-3 bg-muted rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">借款能力</span>
              <span className="font-medium">
                ${borrowPower ? formatUnits(borrowPower as bigint, 18) : '0'}
              </span>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-muted rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">当前借款</span>
              <span className="font-medium">
                {borrowed ? formatUnits(borrowed as bigint, tokenInfo.decimals) : '0'} {tokenInfo.symbol}
              </span>
            </div>
            <div className="flex justify-between text-sm mt-2">
              <span className="text-muted-foreground">钱包余额</span>
              <span className="font-medium">
                {balance ? formatUnits(balance as bigint, tokenInfo.decimals) : '0'} {tokenInfo.symbol}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 输入金额 */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">金额</label>
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
          onClick={activeTab === 'borrow' ? handleBorrow : handleRepay}
          disabled={
            (activeTab === 'borrow' ? isBorrowing : isRepaying) || 
            !amount || 
            parseFloat(amount) <= 0
          }
          className="w-full py-3 px-4 bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-primary-foreground font-semibold rounded-lg transition-colors"
        >
          {activeTab === 'borrow' 
            ? (isBorrowing ? '借款中...' : '借款')
            : (isRepaying ? '还款中...' : '还款')
          }
        </button>
      )}

      {/* 交易状态 */}
      {(isBorrowed || isRepaid) && (
        <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-sm text-green-800 dark:text-green-200 font-semibold">
            ✅ 交易确认成功！
          </p>
        </div>
      )}
    </div>
  );
}

