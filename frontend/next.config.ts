import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    // 忽略可选依赖的警告（这些是 React Native 和开发工具的可选依赖，在浏览器环境中不需要）
    if (!isServer) {
      const webpack = require('webpack');
      const emptyModulePath = path.resolve(__dirname, 'lib', 'empty-module.js');

      // 使用 NormalModuleReplacementPlugin 替换可选依赖为空模块
      if (!config.plugins) {
        config.plugins = [];
      }
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^@react-native-async-storage\/async-storage$/,
          emptyModulePath
        ),
        new webpack.NormalModuleReplacementPlugin(
          /^pino-pretty$/,
          emptyModulePath
        )
      );

      // 设置 fallback 以避免解析错误
      if (!config.resolve) {
        config.resolve = {};
      }
      config.resolve.fallback = {
        ...config.resolve.fallback,
        '@react-native-async-storage/async-storage': false,
        'pino-pretty': false,
      };
    }

    return config;
  },
};

export default nextConfig;
