// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice External ABI of the escrow, consumed by dispute module and by the SDK
///         for typed decoding of events.
interface IProcurementEscrow {
    enum State {
        None,
        Funded,
        Accepted,
        Delivered,
        Released,
        Refunded,
        Disputed,
        Cancelled
    }

    struct AgreementView {
        bytes32 id;
        bytes32 orgId;
        bytes32 requestId;
        bytes32 offerHash;
        bytes32 termsHash;
        address buyer;
        address vendor;
        uint256 amount;
        uint256 feeAmount;
        uint64 createdAt;
        uint64 acceptBy;
        uint64 deliverBy;
        uint64 disputeWindow;
        State state;
        uint8 deliveryCount;
        bool feeOnTop;
    }

    event AgreementCreated(
        bytes32 indexed agreementId,
        bytes32 indexed orgId,
        bytes32 indexed requestId,
        address buyer,
        address vendor,
        uint256 amount,
        uint256 feeAmount,
        bytes32 offerHash,
        bytes32 termsHash,
        uint64 acceptBy,
        uint64 deliverBy,
        uint64 disputeWindow
    );

    event AgreementAccepted(bytes32 indexed agreementId, address indexed vendor, uint64 acceptedAt);
    event DeliverySubmitted(bytes32 indexed agreementId, address indexed vendor, bytes32 proofHash, uint8 deliveryCount);
    event AgreementReleased(
        bytes32 indexed agreementId, address indexed vendor, uint256 vendorAmount, uint256 feeAmount
    );
    event AgreementRefunded(bytes32 indexed agreementId, address indexed buyer, uint256 amount, bytes32 reasonHash);
    event AgreementDisputed(bytes32 indexed agreementId, address indexed initiator, bytes32 evidenceHash);
    event DisputeResolved(
        bytes32 indexed agreementId, uint256 vendorAmount, uint256 buyerAmount, uint256 feeAmount, bytes32 rulingHash
    );
    event AgreementCancelled(bytes32 indexed agreementId, address indexed buyer, uint256 amount);

    function getAgreement(bytes32 agreementId) external view returns (AgreementView memory);
    function stateOf(bytes32 agreementId) external view returns (State);
}
