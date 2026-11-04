// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IPriceFeed} from "../../src/interfaces/IPriceFeed.sol";

contract MockPriceFeed is IPriceFeed {
    uint256 public price;

    constructor(uint256 initialPrice) {
        price = initialPrice;
    }

    function setPrice(uint256 newPrice) external {
        price = newPrice;
    }

    function fetchPrice() external view override returns (uint256) {
        return price;
    }
}
