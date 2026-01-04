'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    resolvedTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider ({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>('light'); // 用户设置的主题
    const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light'); // 当前应用的实际主题
    // 从本地存储读取主题
    useEffect(()=>{
        const savedTheme = localStorage.getItem('theme') as Theme;

        if (savedTheme && ['light', 'dark'].includes(savedTheme)) {
            setTheme(savedTheme);
        }
    }, []);


 // 监听用户设置的主题变化
    useEffect(() => {
        setResolvedTheme(theme);
      }, [theme]);

      // 更新 DOM 类名
      useEffect(() => {
        const root = document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(resolvedTheme);
      }, [resolvedTheme]);

      // 保存主题偏好到本地存储
      const handleSetTheme = (newTheme: Theme) => {
        setTheme(newTheme);
        localStorage.setItem('theme', newTheme);
      }

      return (
        <ThemeContext.Provider value={{ theme, setTheme: handleSetTheme, resolvedTheme }}>
          {children}
        </ThemeContext.Provider>
      );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}