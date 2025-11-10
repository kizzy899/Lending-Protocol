// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "../interfaces/IInterestRateModel.sol";

/// @title 简单线性利率模型
/// @dev 所有利率都使用1e18定点数表示。资金利用率范围是0到1e18
contract InterestRateModel is IInterestRateModel {
    uint256 public immutable baseRate; // 每秒基础利率，1e18单位
    uint256 public immutable slope;    // 每秒斜率，以1e18为基数

    constructor(uint256 _baseRate, uint256 _slope) {
        baseRate = _baseRate;
        slope = _slope;
    }

    /// @notice 资金利用率是一个1e18定点数值（范围：0到1e18）
    function getBorrowRate(uint256 utilization) external view override returns (uint256) {
        // 线性模型：基础利率 + 斜率 * 利用率
        // baseRate和slope都是每秒利率，使用1e18精度
        // 借款利率 = 基础利率 + 斜率 * 利用率 / 1e18
        return baseRate + (slope * utilization) / 1e18;
    }

    /// @notice 存款利率 = 借款利率 * 利用率 * (1 - 储备金率)
    /// 这里我们让调用者在外部计算储备金率；为简单起见，我们返回 借款利率 * 利用率
    function getSupplyRate(uint256 utilization) external view override returns (uint256) {
        // 简单计算：存款利率 = 借款利率 * 利用率
        uint256 borrowRate = baseRate + (slope * utilization) / 1e18;
        return (borrowRate * utilization) / 1e18;
    }
}
