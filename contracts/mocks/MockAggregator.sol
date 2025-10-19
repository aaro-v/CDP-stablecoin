// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Mock implementation of a Chainlink AggregatorV3 price feed
contract MockAggregator {
    uint8 private immutable _decimals;
    int256 private _latestAnswer;
    uint80 private _roundId;

    event AnswerUpdated(int256 current, uint256 roundId);

    constructor(uint8 decimals_, int256 initialAnswer) {
        _decimals = decimals_;
        _latestAnswer = initialAnswer;
        _roundId = 1;
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (_roundId, _latestAnswer, block.timestamp, block.timestamp, _roundId);
    }

    function updateAnswer(int256 newAnswer) external {
        require(newAnswer > 0, "Answer");
        _roundId += 1;
        _latestAnswer = newAnswer;
        emit AnswerUpdated(newAnswer, _roundId);
    }
}
