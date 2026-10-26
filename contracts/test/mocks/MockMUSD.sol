// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev TEST DOUBLE ONLY. This is not Mezo USD. Tests never touch the real token;
///      integration against the deployed MUSD is covered by the RPC-level checks in
///      docs/MEZO_INTEGRATION.md and by the backend's read-only chain adapter.
contract MockMUSD is ERC20 {
    constructor() ERC20("Mock Mezo USD", "mMUSD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }
}
