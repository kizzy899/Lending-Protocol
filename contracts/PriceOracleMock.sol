// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IPriceOracle.sol";

/// @title 简单的价格预言机Mock - 用于测试和演示
/// @notice 允许手动设置代币价格,方便模拟价格波动触发清算
contract PriceOracleMock is IPriceOracle {
    // 代币地址 => 价格 (以1e18为基数，表示1个代币的USD价值)
    mapping(address => uint256) public prices;
    
    /// @notice 设置代币价格（移除 onlyOwner 限制，方便测试）
    /// @param token 代币地址
    /// @param price 价格 (1e18精度, 例如: 2000e18 表示 $2000)
    function setPrice(address token, uint256 price) external {
        prices[token] = price;
    }
    
    /// @notice 批量设置多个代币价格
    function setPrices(address[] calldata tokens, uint256[] calldata _prices) external {
        require(tokens.length == _prices.length, "length mismatch");
        for (uint256 i = 0; i < tokens.length; i++) {
            prices[tokens[i]] = _prices[i];
        }
    }
    
    /// @notice 获取代币价格
    function getPrice(address token) external view override returns (uint256) {
        uint256 price = prices[token];
        require(price > 0, "price not set");
        return price;
    }
    
    /// @notice 模拟价格下跌 (用于触发清算场景)
    /// @param token 代币地址
    /// @param percentDrop 下跌百分比 (以100为基数, 例如: 20 表示下跌20%)
    function simulatePriceDrop(address token, uint256 percentDrop) external {
        require(percentDrop <= 100, "drop too large");
        uint256 oldPrice = prices[token];
        require(oldPrice > 0, "price not set");
        uint256 newPrice = (oldPrice * (100 - percentDrop)) / 100;
        prices[token] = newPrice;
    }
    
    /// @notice 模拟价格上涨
    /// @param token 代币地址
    /// @param percentIncrease 上涨百分比 (以100为基数, 例如: 20 表示上涨20%)
    function simulatePriceIncrease(address token, uint256 percentIncrease) external {
        uint256 oldPrice = prices[token];
        require(oldPrice > 0, "price not set");
        uint256 newPrice = (oldPrice * (100 + percentIncrease)) / 100;
        prices[token] = newPrice;
    }
}
