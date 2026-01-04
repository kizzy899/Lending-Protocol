'use client';

import React from 'react';
import { useAccount } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import { ThemeToggle } from '@/component/ThemeToggle';
import { UserAssets } from '@/component/UserAssets';
import { DepositWithdraw } from '@/component/DepositWithdraw';
import { BorrowRepay } from '@/component/BorrowRepay';
import { Liquidation } from '@/component/Liquidation';
import Image from 'next/image';

export default function LendingProtocol() {
  const { address, isConnected } = useAccount();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="flex justify-between items-center px-6 py-4 border-b border-border">
        {/* Logo */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <Image src="/icon.JPG" alt="logo" width={40} height={40} className="rounded-full" />
          </div>
          <div>
            <h1 className="text-xl font-bold">借贷协议</h1>
            <p className="text-xs text-muted-foreground">Lending Protocol</p>
          </div>
        </div>
        
        {/* 右侧按钮组 */}
        <div className="flex items-center space-x-3">
          {/* 主题切换按钮 */}
          <ThemeToggle />
          {/* Connect Wallet Button */}
          <ConnectKitButton />
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        {!isConnected ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="text-center max-w-2xl">
              <h2 className="text-4xl font-bold text-foreground mb-4">
                欢迎使用借贷协议
              </h2>
              <p className="text-xl text-muted-foreground mb-8">
                请连接您的钱包以开始使用
              </p>
              <ConnectKitButton />
            </div>
          </div>
        ) : (
          <>
            {/* 欢迎信息 */}
            <div className="mb-8">
              <h2 className="text-3xl font-bold mb-2">欢迎回来</h2>
              <p className="text-muted-foreground">
                已连接钱包: {address?.slice(0, 6)}...{address?.slice(-4)}
              </p>
            </div>

            {/* 协议信息 */}
            <div className="bg-card rounded-2xl p-6 border border-border mb-6">
              <h3 className="text-xl font-semibold mb-4">协议信息</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">WETH LTV</p>
                  <p className="text-2xl font-bold">80%</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">USDC LTV</p>
                  <p className="text-2xl font-bold">90%</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">清算奖励</p>
                  <p className="text-2xl font-bold">5%</p>
                </div>
              </div>
            </div>

            {/* 网格布局 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 ">
              {/* 左侧列 */}
              <div className="space-y-6">
                {/* 用户资产 */}
                <UserAssets />
                
                {/* 存款/取款 */}
                <DepositWithdraw />
              </div>

              {/* 右侧列 */}
              <div className="space-y-6">
                {/* 借款/还款 */}
                <BorrowRepay />
                
                {/* 清算 */}
                <Liquidation />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
