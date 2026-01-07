// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IERC20.sol";
import "./interfaces/IInterestRateModel.sol";
import "./interfaces/IPriceOracle.sol";
import "./CollateralManager.sol";

/// @notice 最小化重入保护
contract ReentrancyGuard {

    uint256 private _status;
    constructor() { _status = 1; }

    modifier nonReentrant() {
        require(_status == 1, "reentrant");
        _status = 2;
        _;
        _status = 1;
    }
    
}

contract LendingPool is ReentrancyGuard {
    struct Market {
        bool listed;
        uint256 totalSupply; // 已存入的代币总量（原始数量）
        uint256 totalBorrows; // 已借出的本金总量（原始数量）
        uint256 lastUpdate; // 利息计算的最后更新时间戳
        IInterestRateModel interestModel;
        uint256 reserveFactor; // 储备金率，以1e4为基数（例如：1000 == 10%）
    }

    // 用户 => 代币 => 存入数量
    mapping(address => mapping(address => uint256)) public supplied;
    // 用户 => 代币 => 借出本金（不包含利息）
    mapping(address => mapping(address => uint256)) public borrowed;

    // 代币 => 市场信息
    mapping(address => Market) public markets;
    
    // 已列出的代币列表（用于遍历）
    address[] public listedTokens;

    // 代币 => 通过抵押品管理器获取价格
    CollateralManager public collateralManager;
    IPriceOracle public priceOracle; // same as collateralManager.priceOracle

    address public owner;

    event MarketListed(address token, address interestModel, uint256 reserveFactor);
    event Deposit(address indexed user, address indexed token, uint256 amount);
    event Withdraw(address indexed user, address indexed token, uint256 amount);
    event Borrow(address indexed user, address indexed token, uint256 amount);
    event Repay(address indexed payer, address indexed borrower, address indexed token, uint256 amount);
    event Liquidation(address indexed liquidator, address indexed borrower, address repayToken, address seizeToken, uint256 repayAmount, uint256 seizeAmount);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor(address _collateralManager) {
        owner = msg.sender;
        collateralManager = CollateralManager(_collateralManager);
        priceOracle = IPriceOracle(address(collateralManager)); // uses collateralManager.getPrice delegator
    }

    // --- 市场管理 ---
    function listMarket(address token, address interestModel, uint256 reserveFactor) external onlyOwner {
        require(!markets[token].listed, "already listed");
        markets[token] = Market({
            listed: true,
            totalSupply: 0,
            totalBorrows: 0,
            lastUpdate: block.timestamp,
            interestModel: IInterestRateModel(interestModel),
            reserveFactor: reserveFactor
        });
        listedTokens.push(token);
        emit MarketListed(token, interestModel, reserveFactor);
    }

    // --- 核心操作 ---
    function deposit(address token, uint256 amount) external nonReentrant {
        require(markets[token].listed, "market not listed");
        require(amount > 0, "zero");
        _accrue(token);

        // transfer in
        _safeTransferFrom(token, msg.sender, address(this), amount);

        // accounting
        supplied[msg.sender][token] += amount;
        markets[token].totalSupply += amount;

        emit Deposit(msg.sender, token, amount);
    }

    function withdraw(address token, uint256 amount) external nonReentrant {
        require(markets[token].listed, "market not listed");
        require(amount > 0, "zero");
        require(supplied[msg.sender][token] >= amount, "insufficient supply");
        _accrue(token);

        // ensure withdraw doesn't make borrow unsafe
        supplied[msg.sender][token] -= amount;
        markets[token].totalSupply -= amount;

        // check health across all markets
        require(_isAccountHealthy(msg.sender), "withdraw would undercollateralize");

        _safeTransfer(token, msg.sender, amount);
        emit Withdraw(msg.sender, token, amount);
    }

    function borrow(address token, uint256 amount) external nonReentrant {
        require(markets[token].listed, "market not listed");
        require(amount > 0, "zero");
        _accrue(token);

        // compute user's borrowing power and total borrows in USD
        uint256 borrowPowerUSD = _getUserBorrowingPowerUSD(msg.sender);
        uint256 totalBorrowedUSD = _getUserBorrowedUSD(msg.sender);

        // requested borrow in USD
        // 注意：price 是 18 位小数，amount 是代币的原始单位
        // 需要将 amount 转换为 18 位小数来计算 USD 价值
        uint256 price = priceOracle.getPrice(token); // 1e18
        uint8 decimals = IERC20(token).decimals();
        // 将代币数量转换为 18 位小数：amount * 10^(18 - decimals)
        uint256 amountUSD;
        if (decimals <= 18) {
            // 将代币数量转换为 18 位小数，然后乘以价格
            amountUSD = (price * amount) / (10 ** decimals);
        } else {
            // 如果代币小数位数超过 18，这种情况很少见，但也要处理
            amountUSD = (price * amount) / (10 ** decimals);
        }

        require(totalBorrowedUSD + amountUSD <= borrowPowerUSD, "exceeds borrow power");

        // update accounting
        borrowed[msg.sender][token] += amount;
        markets[token].totalBorrows += amount;

        _safeTransfer(token, msg.sender, amount);
        emit Borrow(msg.sender, token, amount);
    }

    function repay(address token, uint256 amount, address borrower) external nonReentrant {
        require(markets[token].listed, "market not listed");
        require(amount > 0, "zero");
        _accrue(token);

        uint256 owe = borrowed[borrower][token];
        require(owe > 0, "nothing owed");
        uint256 pay = amount;
        if (pay > owe) pay = owe;

        // transfer from payer
        _safeTransferFrom(token, msg.sender, address(this), pay);

        borrowed[borrower][token] = owe - pay;
        markets[token].totalBorrows -= pay;

        emit Repay(msg.sender, borrower, token, pay);
    }

    // --- 清算操作 ---
    /// @notice 清算人为 `borrower` 偿还 `repayToken` 并获取 `seizeToken` 抵押品
    function liquidate(address borrower, address repayToken, address seizeToken, uint256 repayAmount) external nonReentrant {
        require(markets[repayToken].listed && markets[seizeToken].listed, "markets not listed");
        require(repayAmount > 0, "zero");
        _accrue(repayToken);
        _accrue(seizeToken);

        // 先检查借款人是否有借款
        uint256 owe = borrowed[borrower][repayToken];
        require(owe > 0, "borrower owes nothing");

        // borrower must be under liquidation threshold
        require(!_isAccountHealthy(borrower), "not eligible");

        // max repayable = owe * closeFactor
        uint256 maxRepay = (owe * collateralManager.closeFactor()) / 10000;
        uint256 pay = repayAmount;
        if (pay > maxRepay) pay = maxRepay;
        if (pay > owe) pay = owe;

        // compute seize amount in tokens:
        // repay USD = pay * price(repayToken)
        // 注意：priceRepay 是 18 位小数，pay 是代币的原始精度
        // 需要除以代币的 decimals 来得到 18 位小数的 USD 价值
        uint256 priceRepay = priceOracle.getPrice(repayToken);
        uint8 repayDecimals = IERC20(repayToken).decimals();
        uint256 repayUSD = (priceRepay * pay) / (10 ** repayDecimals);

        // seize USD needed: repayUSD * liquidationBonus / 1e4
        uint256 seizeUSD = (repayUSD * uint256(collateralManager.liquidationBonus())) / 10000;

        // token amount to seize = seizeUSD / price(seizeToken)
        uint256 priceSeize = priceOracle.getPrice(seizeToken);
        require(priceSeize > 0, "price 0");
        uint256 seizeAmount = (seizeUSD * 1e18 + priceSeize - 1) / priceSeize; // ceil

        // check borrower has enough collateral
        require(supplied[borrower][seizeToken] >= seizeAmount, "insufficient collateral");

        // transfer repay from liquidator
        _safeTransferFrom(repayToken, msg.sender, address(this), pay);

        // reduce borrower's debt and totalBorrows
        borrowed[borrower][repayToken] -= pay;
        markets[repayToken].totalBorrows -= pay;

        // seize collateral: reduce borrower supplied, increase liquidator supplied (we could send tokens directly)
        supplied[borrower][seizeToken] -= seizeAmount;
        supplied[msg.sender][seizeToken] += seizeAmount;

        emit Liquidation(msg.sender, borrower, repayToken, seizeToken, pay, seizeAmount);
    }

    // --- 会计核算/辅助函数 ---
    /// @notice 计算市场的利息（根据上次更新时间计算利息并更新总借款额）
    function _accrue(address token) internal {
        Market storage m = markets[token];
        if (!m.listed) return;
        uint256 t = block.timestamp;
        uint256 delta = t - m.lastUpdate;
        if (delta == 0) return;

        // 利用率 = 总借款 / (总存款 + 总借款)，以1e18为基数
        uint256 util;
        uint256 denom = m.totalSupply + m.totalBorrows;
        if (denom == 0) {
            util = 0;
        } else {
            util = (m.totalBorrows * 1e18) / denom;
        }

        uint256 borrowRatePerSec = m.interestModel.getBorrowRate(util); // 每秒借款利率，1e18精度
        // 利息 = 总借款 * 借款利率 * 时间间隔
        uint256 interest = (m.totalBorrows * borrowRatePerSec * delta) / 1e18;

        // 计算储备金（按储备金率）
        // 注意：储备金保留在合约余额中，这里不单独记账
        // uint256 reserve = (interest * m.reserveFactor) / 10000;
        // 将利息加到总借款中（储备金保留在合约中，这里只是将利息加到总借款中）
        m.totalBorrows += interest;

        // no explicit reserve accounting here; reserve tokens remain in contract's balance (simple)
        m.lastUpdate = t;
    }

    /// @notice 检查账户的总借款USD是否小于等于借款能力（抵押品价值USD * ltv的总和）
    function _isAccountHealthy(address account) internal view returns (bool) {
        // 计算用户的总借款 USD
        uint256 borrowedUSD = 0;
        for (uint256 i = 0; i < listedTokens.length; ) {
            address t = listedTokens[i];
            uint256 amt = borrowed[account][t];
            if (amt > 0) {
                uint256 p = priceOracle.getPrice(t);
                uint8 decimals = IERC20(t).decimals();
                borrowedUSD += (p * amt) / (10 ** decimals);
            }
            unchecked { ++i; }
        }
        
        // 计算用户的清算阈值 USD
        uint256 thresholdUSD = 0;
        for (uint256 i = 0; i < listedTokens.length; ) {
            address t = listedTokens[i];
            uint256 amt = supplied[account][t];
            if (amt > 0) {
                uint256 val = collateralManager.liquidationThresholdValue(t, amt);
                thresholdUSD += val;
            }
            unchecked { ++i; }
        }
        
        // healthy when borrowedUSD <= thresholdUSD
        return borrowedUSD <= thresholdUSD;
    }

    function _getUserBorrowingPowerUSD(address account) internal view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < listedTokens.length; ) {
            address t = listedTokens[i];
            uint256 amount = supplied[account][t];
            if (amount > 0) {
                uint256 val = collateralManager.collateralValueUSD(t, amount);
                uint256 ltv = collateralManager.ltv(t);
                total += (val * ltv) / 10000;
            }
            unchecked { ++i; }
        }
        return total;
    }

    // public view helpers that accept token arrays (practical)
    function getUserBorrowingPowerUSD(address account, address[] calldata tokens) external view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < tokens.length; ) {
            address t = tokens[i];
            uint256 amount = supplied[account][t];
            if (amount > 0) {
                uint256 val = collateralManager.collateralValueUSD(t, amount);
                uint256 ltv = collateralManager.ltv(t);
                total += (val * ltv) / 10000;
            }
            unchecked { ++i; }
        }
        return total;
    }

    function _getUserBorrowedUSD(address account) internal view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < listedTokens.length; ) {
            address t = listedTokens[i];
            uint256 amt = borrowed[account][t];
            if (amt > 0) {
                uint256 price = priceOracle.getPrice(t);
                uint8 decimals = IERC20(t).decimals();
                total += (price * amt) / (10 ** decimals);
            }
            unchecked { ++i; }
        }
        return total;
    }

    function _getUserLiquidationThresholdUSD(address account) internal view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < listedTokens.length; ) {
            address t = listedTokens[i];
            uint256 amt = supplied[account][t];
            if (amt > 0) {
                uint256 val = collateralManager.liquidationThresholdValue(t, amt);
                total += val;
            }
            unchecked { ++i; }
        }
        return total;
    }

    function getUserBorrowedUSD(address account, address[] calldata tokens) external view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < tokens.length; ) {
            address t = tokens[i];
            uint256 amt = borrowed[account][t];
            if (amt > 0) {
                uint256 price = priceOracle.getPrice(t);
                uint8 decimals = IERC20(t).decimals();
                total += (price * amt) / (10 ** decimals);
            }
            unchecked { ++i; }
        }
        return total;
    }

    function getHealthFactor(address account, address[] calldata collateralTokens, address[] calldata borrowTokens) external view returns (uint256 healthPercentX10000) {
        uint256 borrowedUSD = this.getUserBorrowedUSD(account, borrowTokens);
        uint256 thresholdUSD = 0;
        for (uint256 i = 0; i < collateralTokens.length; ) {
            address t = collateralTokens[i];
            uint256 amt = supplied[account][t];
            if (amt > 0) {
                uint256 val = collateralManager.liquidationThresholdValue(t, amt);
                thresholdUSD += val;
            }
            unchecked { ++i; }
        }
        if (borrowedUSD == 0) return type(uint256).max;
        // return thresholdUSD * 1e4 / borrowedUSD (1e4 basis to represent percent with 2 decimals)
        return (thresholdUSD * 10000) / borrowedUSD;
    }

    // --- 底层代币辅助函数 ---
    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        bool ok = IERC20(token).transferFrom(from, to, amount);
        require(ok, "transferFrom failed");
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        bool ok = IERC20(token).transfer(to, amount);
        require(ok, "transfer failed");
    }
}
