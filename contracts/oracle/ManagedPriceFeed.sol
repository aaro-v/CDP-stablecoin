// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

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

/// @title ManagedPriceFeed
/// @notice Chainlink-compatible feed governed through access control. Authorised updaters
///         can push new prices sourced from off-chain infrastructure.
contract ManagedPriceFeed is AggregatorV3Interface, AccessControl {
    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");

    uint8 private immutable _decimals;
    string private _description;
    uint256 private constant VERSION = 1;

    struct RoundData {
        int256 answer;
        uint64 startedAt;
        uint64 updatedAt;
        uint80 answeredInRound;
    }

    uint80 private _latestRoundId;
    mapping(uint80 => RoundData) private _rounds;

    event PriceUpdated(uint80 indexed roundId, int256 answer, uint64 timestamp);

    constructor(address admin, uint8 decimals_, string memory description_) {
        require(admin != address(0), "AdminZero");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPDATER_ROLE, admin);
        _decimals = decimals_;
        _description = description_;
    }

    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function description() external view override returns (string memory) {
        return _description;
    }

    function version() external pure override returns (uint256) {
        return VERSION;
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        roundId = _latestRoundId;
        RoundData storage round = _rounds[roundId];
        require(round.updatedAt != 0, "NoData");
        answer = round.answer;
        startedAt = round.startedAt;
        updatedAt = round.updatedAt;
        answeredInRound = round.answeredInRound;
    }

    /// @notice Push a new price reading.
    /// @param answer Price scaled by feed decimals.
    function pushPrice(int256 answer) external onlyRole(UPDATER_ROLE) {
        require(answer > 0, "Answer");
        uint80 newRoundId = _latestRoundId + 1;
        uint64 timestamp = uint64(block.timestamp);
        _rounds[newRoundId] = RoundData({
            answer: answer,
            startedAt: timestamp,
            updatedAt: timestamp,
            answeredInRound: newRoundId
        });
        _latestRoundId = newRoundId;
        emit PriceUpdated(newRoundId, answer, timestamp);
    }
}
