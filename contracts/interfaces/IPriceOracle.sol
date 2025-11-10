// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// 获取资产的美元价格（USD），用于计算抵押品价值与健康度
interface IPriceOracle {
    /// @notice 返回美元价格，使用18位小数（例如：1美元 -> 1e18）
    function getPrice(address token) external view returns (uint256);
}
