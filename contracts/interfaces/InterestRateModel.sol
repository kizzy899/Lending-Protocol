// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

//负责计算实时利率（借款利率 & 存款利率），根据资金利用率动态调节。
interface InterestRateModel {
    /// @notice 每秒借款利率（类似ray精度，取决于具体实现；这里我们使用1e18精度）
    function getBorrowRate(uint256 utilization) external view returns (uint256);
    function getSupplyRate(uint256 utilization) external view returns (uint256);
}
