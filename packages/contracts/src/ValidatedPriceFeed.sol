// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {IAggregator} from "./Stovia.sol";

interface IPausedStock {
    function oraclePaused() external view returns (bool);
}

/// @notice Configure only with independently verified feed proxy, sequencer feed and stock addresses.
contract ValidatedPriceFeed is IAggregator {
    IAggregator public immutable source;
    IAggregator public immutable sequencer;
    address public immutable stock;
    uint256 public immutable gracePeriod;

    constructor(IAggregator feed, IAggregator uptime, address stockToken, uint256 grace) {
        require(address(feed).code.length > 0 && address(uptime).code.length > 0 && grace > 0, "config");
        source = feed;
        sequencer = uptime;
        stock = stockToken;
        gracePeriod = grace;
    }

    function decimals() external view returns (uint8) {
        return source.decimals();
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        (, int256 status, uint256 since,,) = sequencer.latestRoundData();
        require(
            status == 0 && since > 0 && since < block.timestamp && block.timestamp - since > gracePeriod,
            "sequencer unavailable"
        );
        if (stock != address(0)) require(!IPausedStock(stock).oraclePaused(), "corporate action pause");
        return source.latestRoundData();
    }
}
