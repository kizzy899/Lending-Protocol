'use client';

import React, { useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { lendingPoolAddress, lendingPoolAbi, wethAddress, usdcAddress, erc20Abi, tokens } from '@/config';

export function DepositWithdraw() {
  const { address } = useAccount();
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [token, setToken] = useState<'WETH' | 'USDC'>('WETH');
  const [amount, setAmount] = useState('');

  const tokenAddress = token === 'WETH' ? wethAddress : usdcAddress;
  const tokenInfo = tokens[token];

  // 读取代币余额
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // 读取授权额度
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, lendingPoolAddress] : undefined,
    query: { enabled: !!address },
  });

  // 读取已存入金额
  const { data: supplied, refetch: refetchSupplied } = useReadContract({
    address: lendingPoolAddress,
    abi: lendingPoolAbi,
    functionName: 'supplied',
    args: address ? [address, tokenAddress] : undefined,
    query: { enabled: !!address },
  });

  // 写入操作
  const { writeContract: approveToken, data: approveHash } = useWriteContract();
  const { writeContract: depositToken, data: depositHash } = useWriteContract();
  const { writeContract: withdrawToken, data: withdrawHash } = useWriteContract();

  // 等待交易确认
  const { isLoading: isApproving, isSuccess: isApproved } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isLoading: isDepositing, isSuccess: isDeposited } = useWaitForTransactionReceipt({ hash: depositHash });
  const { isLoading: isWithdrawing, isSuccess: isWithdrawn } = useWaitForTransactionReceipt({ hash: withdrawHash });

  // 交易确认后刷新数据
  React.useEffect(() => {
    if (isApproved || isDeposited || isWithdrawn) {
      refetchBalance();
      refetchAllowance();
      refetchSupplied();
      setAmount('');
    }
  }, [isApproved, isDeposited, isWithdrawn, refetchBalance, refetchAllowance, refetchSupplied]);

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

  const handleDeposit = () => {
    if (!address || !amount) return;
    const amountBigInt = parseUnits(amount, tokenInfo.decimals);
    depositToken({
      address: lendingPoolAddress,
      abi: lendingPoolAbi,
      functionName: 'deposit',
      args: [tokenAddress, amountBigInt],
    });
  };

  const handleWithdraw = () => {
    if (!address || !amount) return;
    const amountBigInt = parseUnits(amount, tokenInfo.decimals);
    withdrawToken({
      address: lendingPoolAddress,
      abi: lendingPoolAbi,
      functionName: 'withdraw',
      args: [tokenAddress, amountBigInt],
    });
  };

  const needsApproval = activeTab === 'deposit' && amount && allowance 
    ? parseUnits(amount, tokenInfo.decimals) > (allowance as bigint)
    : false;

  const maxAmount = activeTab === 'deposit' 
    ? balance ? formatUnits(balance as bigint, tokenInfo.decimals) : '0'
    : supplied ? formatUnits(supplied as bigint, tokenInfo.decimals) : '0';

  if (!address) {
    return (
      <div className="bg-card rounded-2xl p-6 border border-border">
        <p className="text-muted-foreground">请连接钱包</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl p-6 border border-border">
      <h2 className="text-2xl font-semibold text-card-foreground mb-6">存款 / 取款</h2>

      {/* 标签页 */}
      <div className="flex space-x-2 mb-6">
        <button
          onClick={() => setActiveTab('deposit')}
          className={`flex-1 py-2 px-4 rounded-lg transition-colors ${
            activeTab === 'deposit'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          存款
        </button>
        <button
          onClick={() => setActiveTab('withdraw')}
          className={`flex-1 py-2 px-4 rounded-lg transition-colors ${
            activeTab === 'withdraw'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          取款
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

      {/* 余额显示 */}
      <div className="mb-4 p-3 bg-muted rounded-lg">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {activeTab === 'deposit' ? '钱包余额' : '已存入'}
          </span>
          <span className="font-medium">
            {activeTab === 'deposit' 
              ? (balance ? formatUnits(balance as bigint, tokenInfo.decimals) : '0')
              : (supplied ? formatUnits(supplied as bigint, tokenInfo.decimals) : '0')
            } {tokenInfo.symbol}
          </span>
        </div>
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
          onClick={activeTab === 'deposit' ? handleDeposit : handleWithdraw}
          disabled={
            (activeTab === 'deposit' ? isDepositing : isWithdrawing) || 
            !amount || 
            parseFloat(amount) <= 0 ||
            parseFloat(amount) > parseFloat(maxAmount)
          }
          className="w-full py-3 px-4 bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-primary-foreground font-semibold rounded-lg transition-colors"
        >
          {activeTab === 'deposit' 
            ? (isDepositing ? '存款中...' : '存款')
            : (isWithdrawing ? '取款中...' : '取款')
          }
        </button>
      )}

      {/* 交易状态 */}
      {(isDeposited || isWithdrawn) && (
        <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-sm text-green-800 dark:text-green-200 font-semibold">
            ✅ 交易确认成功！
          </p>
        </div>
      )}
    </div>
  );
}

