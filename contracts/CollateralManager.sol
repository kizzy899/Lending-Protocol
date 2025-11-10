// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "../interfaces/IPriceOracle.sol";

contract CollateralManager {
    // 代币 => 贷款价值比(LTV)，以1e4为基数（例如：8000 == 80.00%）
    mapping(address => uint16) public ltv; // 百分比 * 100，例如 8000 = 80%
    // 代币 => 清算阈值（以1e4为基数）。如果健康度低于此值 -> 可被清算
    mapping(address => uint16) public liquidationThreshold; // 例如：7500 = 75%
    uint16 public constant BASE = 10000;

    // 清算因子（以1e4为基数）（单次清算中可以偿还的借款比例）
    uint16 public closeFactor = 5000; // 默认50%，控制单次清算覆盖借款的比例
    // 清算奖励（以1e4为基数）（例如：10500表示清算人获得5%的奖励）
    uint16 public liquidationBonus = 10500;

    address public owner;
    IPriceOracle public priceOracle;

    event LtvUpdated(address indexed token, uint16 ltv);
    event LiquidationThresholdUpdated(address indexed token, uint16 threshold);
    event CloseFactorUpdated(uint16 newCloseFactor);
    event LiquidationBonusUpdated(uint16 newBonus);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor(address _priceOracle) {
        owner = msg.sender;
        priceOracle = IPriceOracle(_priceOracle);
    }

    function setLtv(address token, uint16 _ltv) external onlyOwner {
        require(_ltv <= BASE, "ltv>100%");
        ltv[token] = _ltv;
        emit LtvUpdated(token, _ltv);
    }

    function setLiquidationThreshold(address token, uint16 _threshold) external onlyOwner {
        require(_threshold <= BASE, "threshold>100%");
        liquidationThreshold[token] = _threshold;
        emit LiquidationThresholdUpdated(token, _threshold);
    }

    function setCloseFactor(uint16 _closeFactor) external onlyOwner {
        require(_closeFactor <= BASE, "closeFactor>100%");
        closeFactor = _closeFactor;
        emit CloseFactorUpdated(_closeFactor);
    }

    function setLiquidationBonus(uint16 _bonus) external onlyOwner {
        require(_bonus >= BASE, "bonus<100%");
        liquidationBonus = _bonus;
        emit LiquidationBonusUpdated(_bonus);
    }

    /// @notice 计算给定代币数量的抵押品美元价值（18位小数）
    function collateralValueUSD(address token, uint256 amount) public view returns (uint256) {
        uint256 price = priceOracle.getPrice(token); // 1e18
        return (price * amount) / 1e18;
    }

    /// @notice 使用LTV计算给定代币数量的借款能力（美元）
    function borrowingPowerUSD(address token, uint256 amount) public view returns (uint256) {
        uint256 val = collateralValueUSD(token, amount);
        return (val * uint256(ltv[token])) / uint256(BASE);
    }

    /// @notice 清算阈值价值：头寸可被清算的美元价值阈值
    function liquidationThresholdValue(address token, uint256 amount) public view returns (uint256) {
        uint256 val = collateralValueUSD(token, amount);
        return (val * uint256(liquidationThreshold[token])) / uint256(BASE);
    }

    // 辅助函数，向其他合约暴露预言机价格
    function getPrice(address token) external view returns (uint256) {
        return priceOracle.getPrice(token);
    }
}
