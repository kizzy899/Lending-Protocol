// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "../interfaces/IInterestRateModel.sol";

//借贷利率模型中的“基础利率（Base Rate）”，
//即在利用率为 0% 的情况下，也要收取的最低借款利率。


/*baseRate 是什么？

当资金利用率为 0 的时候：

没有人借钱

池子里有大量闲置资金

协议仍然希望借款者付一点点利息（而不是 0）

这个最小利率，就是 baseRate

利率模型的基础利率，用于决定借款利率在利用率 = 0% 时的最小利率，是线性利率曲线的起点。 */


/// @title Simple linear interest rate model
/// @dev All rates are in 1e18 fixed point. Utilization is in 1e18 (0..1e18)
contract InterestRateModel is IInterestRateModel {
    uint256 public immutable baseRate; // per second, 1e18 units
    uint256 public immutable slope;    // per second, scaled by 1e18

    constructor(uint256 _baseRate, uint256 _slope) {
        baseRate = _baseRate;
        slope = _slope;
    }

    /// @notice utilization is a 1e18 fixed-point value (0..1e18)
    function getBorrowRate(uint256 utilization) external view override returns (uint256) {
        // linear: base + slope * utilization
        // both baseRate and slope are per-second with 1e18 scaling
        // borrowRate = baseRate + slope * utilization / 1e18
        return baseRate + (slope * utilization) / 1e18;
    }

    /// @notice supplyRate = borrowRate * utilization * (1 - reserveFactor)
    /// here we let caller compute reserveFactor externally; for simplicity we return borrowRate * utilization
    function getSupplyRate(uint256 utilization) external view override returns (uint256) {
        // naive: supplyRate = borrowRate * utilization
        uint256 borrowRate = baseRate + (slope * utilization) / 1e18;
        return (borrowRate * utilization) / 1e18;
    }
}
