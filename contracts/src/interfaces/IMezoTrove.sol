// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IMezoTroveManager
/// @notice Interface to read Mezo protocol Trove health and collateralization state.
///         Allows ProMeo escrow to verify the buyer's credit health before locking
///         or releasing high-value MUSD agreements.
interface IMezoTroveManager {
    enum Status {
        nonExistent,
        active,
        closedByOwner,
        closedByLiquidation,
        closedByRedemption
    }

    /// @notice Returns the status of the borrower's Trove on Mezo
    function getTroveStatus(address _borrower) external view returns (uint256);

    /// @notice Returns Trove stake amount
    function getTroveStake(address _borrower) external view returns (uint256);

    /// @notice Returns total debt (principal + interest) of borrower in MUSD
    function getTroveDebt(address _borrower) external view returns (uint256);

    /// @notice Returns total collateral (BTC) deposited in the borrower's Trove
    function getTroveColl(address _borrower) external view returns (uint256);

    /// @notice Returns the Individual Collateral Ratio (ICR) given a BTC/USD price
    function getCurrentICR(address _borrower, uint256 _price) external view returns (uint256);
}

/// @title IMezoBorrowerOperations
/// @notice Interface to interact with Mezo Trove operations (borrowing MUSD against BTC collateral)
interface IMezoBorrowerOperations {
    function openTrove(
        uint256 _maxFeePercentage,
        uint256 _musdAmount,
        address _upperHint,
        address _lowerHint
    ) external payable returns (uint256);

    function withdrawMUSD(
        uint256 _maxFeePercentage,
        uint256 _musdAmount,
        address _upperHint,
        address _lowerHint
    ) external;

    function closeTrove() external;
}
