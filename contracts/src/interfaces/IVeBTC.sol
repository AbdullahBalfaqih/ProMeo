// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IVeBTC
/// @notice The interface for Mezo's veBTC (vote-escrowed Bitcoin NFT positions).
///         Mezo Testnet address: 0xB63fcCd03521Cf21907627bd7fA465C129479231
interface IVeBTC {
    function ownerOf(uint256 tokenId) external view returns (address);
    function balanceOf(address owner) external view returns (uint256);
    function escrowType(uint256 tokenId) external view returns (uint8);
    function voted(uint256 tokenId) external view returns (bool);
}
