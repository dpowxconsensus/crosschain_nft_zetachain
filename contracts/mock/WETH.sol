// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Context.sol";

contract WETH is ERC20("Wrapped Ether", "WETH") {
    constructor(uint256 initialSupply) {
        _mint(msg.sender, initialSupply * (10 ** uint256(decimals())));
    }
}
