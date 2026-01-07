'use client'

import { type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitProvider } from 'connectkit';
import { config } from '@/config';
import { ThemeProvider } from '@/context/ThemeContext';

const queryClient = new QueryClient();

export function Provider({ children }: { children: ReactNode }) {
    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <ThemeProvider>
                    <ConnectKitProvider>{children}</ConnectKitProvider>
                </ThemeProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}