// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IPriceOracle.sol";

/// @title Chainlink 价格预言机集成
/// @notice 从 Chainlink 价格源获取真实的市场价格
/// @dev 生产环境使用，提供真实的去中心化价格数据
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function version() external view returns (uint256);
    
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

contract ChainlinkPriceOracle is IPriceOracle {
    address public owner;
    
    // 代币地址 => Chainlink 价格源地址
    mapping(address => address) public priceFeeds;
    
    // 价格过期时间（秒），默认 1 小时
    uint256 public priceValidityDuration = 3600;
    
    event PriceFeedSet(address indexed token, address indexed priceFeed);
    event PriceValidityDurationUpdated(uint256 newDuration);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }
    
    constructor() {
        owner = msg.sender;
    }
    
    /// @notice 设置代币的 Chainlink 价格源
    /// @param token 代币地址
    /// @param priceFeed Chainlink 价格源合约地址
    function setPriceFeed(address token, address priceFeed) external onlyOwner {
        require(priceFeed != address(0), "invalid price feed");
        priceFeeds[token] = priceFeed;
        emit PriceFeedSet(token, priceFeed);
    }
    
    /// @notice 批量设置价格源
    function setPriceFeeds(
        address[] calldata tokens,
        address[] calldata _priceFeeds
    ) external onlyOwner {
        require(tokens.length == _priceFeeds.length, "length mismatch");
        for (uint256 i = 0; i < tokens.length; i++) {
            require(_priceFeeds[i] != address(0), "invalid price feed");
            priceFeeds[tokens[i]] = _priceFeeds[i];
            emit PriceFeedSet(tokens[i], _priceFeeds[i]);
        }
    }
    
    /// @notice 设置价格有效期
    function setPriceValidityDuration(uint256 duration) external onlyOwner {
        require(duration > 0, "duration must be positive");
        priceValidityDuration = duration;
        emit PriceValidityDurationUpdated(duration);
    }
    
    /// @notice 获取代币价格（18 位小数）
    /// @param token 代币地址
    /// @return price 价格（1e18 精度）
    function getPrice(address token) external view override returns (uint256) {
        address priceFeed = priceFeeds[token];
        require(priceFeed != address(0), "price feed not set");
        
        AggregatorV3Interface feed = AggregatorV3Interface(priceFeed);
        
        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = feed.latestRoundData();
        
        // 检查价格数据的有效性
        require(answer > 0, "invalid price");
        require(answeredInRound >= roundId, "stale price");
        require(block.timestamp - updatedAt <= priceValidityDuration, "price too old");
        
        // 将价格转换为 18 位小数
        uint8 decimals = feed.decimals();
        uint256 price = uint256(answer);
        
        if (decimals < 18) {
            price = price * (10 ** (18 - decimals));
        } else if (decimals > 18) {
            price = price / (10 ** (decimals - 18));
        }
        
        return price;
    }
    
    /// @notice 获取价格源信息（用于调试）
    function getPriceFeedInfo(address token) external view returns (
        address priceFeed,
        string memory description,
        uint8 decimals,
        int256 latestPrice,
        uint256 updatedAt
    ) {
        priceFeed = priceFeeds[token];
        require(priceFeed != address(0), "price feed not set");
        
        AggregatorV3Interface feed = AggregatorV3Interface(priceFeed);
        description = feed.description();
        decimals = feed.decimals();
        
        (
            ,
            int256 answer,
            ,
            uint256 _updatedAt,
            
        ) = feed.latestRoundData();
        
        latestPrice = answer;
        updatedAt = _updatedAt;
    }
}

