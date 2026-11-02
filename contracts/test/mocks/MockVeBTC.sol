// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IVeBTC} from "../../src/interfaces/IVeBTC.sol";

contract MockVeBTC is IVeBTC {
    mapping(address => uint256) public balances;
    mapping(uint256 => address) public owners;

    function setBalance(address user, uint256 count) external {
        balances[user] = count;
    }

    function balanceOf(address owner) external view override returns (uint256) {
        return balances[owner];
    }

    function ownerOf(uint256 tokenId) external view override returns (address) {
        return owners[tokenId];
    }

    function escrowType(uint256) external pure override returns (uint8) {
        return 1;
    }

    function voted(uint256) external pure override returns (bool) {
        return false;
    }
}
