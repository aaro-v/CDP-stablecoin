// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
}

/// @title Mock router that simulates a token-for-token swap
/// @notice For local testing only. The router pulls collateral from the caller and
/// transfers the requested stablecoin amount that must be pre-funded on this contract.
contract MockRouter {
    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 /*deadline*/
    ) external returns (uint256[] memory amounts) {
        require(path.length >= 2, "Path");
        IERC20Minimal collateral = IERC20Minimal(path[0]);
        IERC20Minimal stable = IERC20Minimal(path[path.length - 1]);

        // Pull the maximum collateral from the caller (CDP contract)
        require(collateral.transferFrom(msg.sender, address(this), amountInMax), "PullFail");
        // Pay out the requested stablecoin amount
        require(stable.transfer(to, amountOut), "PayoutFail");

        amounts = new uint256[](path.length);
        amounts[0] = amountInMax;
        amounts[path.length - 1] = amountOut;
    }
}
