// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Minimal ERC-20 surface used by the escrow. Mezo USD (MUSD) is a plain
///         18-decimal ERC-20 (verified on-chain 2026-10-17), so only the standard
///         functions are required. We deliberately do not use safe-wrappers from
///         OpenZeppelin to keep the ABI surface explicit; see MUSDTokenAdapter.
interface IMUSD {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function decimals() external view returns (uint8);
    function symbol() external view returns (string memory);
}
