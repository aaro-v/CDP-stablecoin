// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title Production-grade meme token used as collateral
/// @notice Provides minting via role-based access control and burn support.
contract MemeToken is ERC20, ERC20Burnable, AccessControl {
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");

    constructor(address admin, uint256 initialSupply) ERC20("Meme Token", "MEME") {
        require(admin != address(0), "AdminZero");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(TREASURY_ROLE, admin);
        _mint(admin, initialSupply);
    }

    /// @notice Mint new tokens to a target address. Restricted to treasury role.
    function mint(address to, uint256 amount) external onlyRole(TREASURY_ROLE) {
        _mint(to, amount);
    }
}
