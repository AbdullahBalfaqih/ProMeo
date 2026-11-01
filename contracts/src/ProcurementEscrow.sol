// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAgentPolicyRegistry} from "./interfaces/IAgentPolicyRegistry.sol";
import {IProcurementEscrow} from "./interfaces/IProcurementEscrow.sol";

/// @title ProcurementEscrow
/// @notice MUSD-denominated escrow for agent-to-vendor procurement on Mezo.
///
///         Money flow
///         ----------
///         Buyer funds `amount` (vendor payment) plus `feeAmount` (protocol fee,
///         charged on top, never deducted from the vendor's quoted price). Both are
///         held by this contract. On release the vendor receives exactly `amount`
///         and the fee recipient receives `feeAmount`. On refund the buyer receives
///         `amount + feeAmount`. On a split ruling the fee is pro-rated to the
///         vendor's share so a buyer is never charged a full fee for work that was
///         not delivered.
///
///         Authority model
///         ---------------
///         * `buyer` may drive its own agreement (release, cancel, dispute).
///         * Any other caller must be an agent explicitly authorized for the
///           agreement's `orgId` in the AgentPolicyRegistry at execution time.
///           Revoking an agent takes effect immediately, with no transaction
///           needed on this contract.
///         * `vendor` can accept, deliver, and — after the dispute window lapses —
///           pull payment if the buyer goes silent.
///         * `RESOLVER_ROLE` can split a disputed agreement. It can never move
///           funds outside the three parties of that agreement.
///         * `PAUSER_ROLE` can stop new agreements only; existing agreements can
///           always reach a terminal state (safety over liveness for funds).
contract ProcurementEscrow is IProcurementEscrow, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Roles & constants
    // ---------------------------------------------------------------------

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant FEE_MANAGER_ROLE = keccak256("FEE_MANAGER_ROLE");
    bytes32 public constant RESOLVER_ROLE = keccak256("RESOLVER_ROLE");

    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant MAX_FEE_BPS = 500; // 5% hard ceiling, immutable
    uint64 public constant MAX_DISPUTE_WINDOW = 30 days;
    uint64 public constant MIN_DISPUTE_WINDOW = 1 hours;
    uint64 public constant MAX_TERM = 365 days;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    struct Agreement {
        bytes32 orgId;
        bytes32 requestId;
        bytes32 offerHash;
        bytes32 termsHash;
        address buyer;
        address vendor;
        uint256 amount;
        uint256 feeAmount;
        uint64 createdAt;
        uint64 acceptedAt;
        uint64 deliveredAt;
        uint64 acceptBy;
        uint64 deliverBy;
        uint64 disputeWindow;
        State state;
        uint8 deliveryCount;
        bytes32 deliverableHash;
    }

    IERC20 public immutable musd;
    IAgentPolicyRegistry public immutable registry;
    address public feeRecipient;
    uint16 public feeBps;

    mapping(bytes32 => Agreement) private _agreements;
    /// @notice Buyer to organization binding (Fix High Finding #1)
    mapping(address => bytes32) public buyerOrg;
    /// @notice Total MUSD currently held for live agreements. Invariant target.
    uint256 public totalActiveEscrow;
    /// @notice Monotonic counter of agreements ever created, used by indexers.
    uint256 public agreementCount;

    event OrgBound(address indexed buyer, bytes32 indexed orgId);

    error OrgMismatch(bytes32 expected, bytes32 provided);
    error ZeroAddress();
    error InvalidAmount();
    error InvalidFee();
    error InvalidVendor();
    error InvalidDeadlines();
    error InvalidDisputeWindow();
    error AgreementExists(bytes32 agreementId);
    error UnknownAgreement(bytes32 agreementId);
    error InvalidState(bytes32 agreementId, State expected, State actual);
    error NotBuyer();
    error NotVendor();
    error NotParty();
    error AgentNotAuthorized(bytes32 orgId, address agent);
    error DeadlinePassed(bytes32 agreementId);
    error DeadlineNotPassed(bytes32 agreementId);
    error DisputeWindowOpen(bytes32 agreementId);
    error DisputeWindowClosed(bytes32 agreementId);
    error InvalidRuling();
    error FeeRecipientUnset();

    constructor(address musd_, address registry_, address admin_, address feeRecipient_, uint16 feeBps_) {
        if (
            musd_ == address(0) || registry_ == address(0) || admin_ == address(0)
                || feeRecipient_ == address(0)
        ) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert InvalidFee();

        musd = IERC20(musd_);
        registry = IAgentPolicyRegistry(registry_);
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
        _grantRole(FEE_MANAGER_ROLE, admin_);
        _grantRole(RESOLVER_ROLE, admin_);
    }

    // ---------------------------------------------------------------------
    // Buyer side
    // ---------------------------------------------------------------------

    struct CreateParams {
        bytes32 orgId;
        bytes32 requestId;
        bytes32 offerHash;
        bytes32 termsHash;
        address vendor;
        uint256 amount;
        uint64 acceptBy;
        uint64 deliverBy;
        uint64 disputeWindow;
        uint256 nonce;
        bool feeOnTop;
    }

    /// @notice Create and fund an agreement. Caller must either be the buyer or an
    ///         agent authorized for `orgId` at call time.
    /// @return agreementId Deterministic id of the agreement.
    function createAgreement(address buyer, CreateParams calldata p)
        external
        nonReentrant
        whenNotPaused
        returns (bytes32 agreementId)
    {
        if (buyer == address(0) || p.vendor == address(0)) revert ZeroAddress();
        if (buyer == p.vendor) revert InvalidVendor();
        if (p.orgId == bytes32(0) || p.requestId == bytes32(0)) revert ZeroAddress();
        if (p.amount == 0) revert InvalidAmount();
        if (p.offerHash == bytes32(0) || p.termsHash == bytes32(0)) revert InvalidAmount();

        if (p.acceptBy <= block.timestamp) revert InvalidDeadlines();
        if (p.deliverBy <= p.acceptBy) revert InvalidDeadlines();
        if (p.deliverBy > p.acceptBy + MAX_TERM) revert InvalidDeadlines();
        if (p.disputeWindow < MIN_DISPUTE_WINDOW || p.disputeWindow > MAX_DISPUTE_WINDOW) {
            revert InvalidDisputeWindow();
        }

        if (msg.sender != buyer && !registry.isAuthorized(p.orgId, msg.sender)) {
            revert AgentNotAuthorized(p.orgId, msg.sender);
        }

        // Fix High Finding #1: Bind each buyer address to its org
        if (buyerOrg[buyer] == bytes32(0)) {
            buyerOrg[buyer] = p.orgId;
            emit OrgBound(buyer, p.orgId);
        } else if (buyerOrg[buyer] != p.orgId) {
            revert OrgMismatch(buyerOrg[buyer], p.orgId);
        }

        agreementId = keccak256(
            abi.encode(block.chainid, address(this), p.orgId, p.requestId, p.offerHash, p.nonce)
        );
        if (_agreements[agreementId].state != State.None) revert AgreementExists(agreementId);

        uint256 feeAmount = (p.amount * feeBps) / BPS_DENOMINATOR;
        // `feeOnTop` is recorded for accounting clarity; the contract always
        // charges the fee in addition to `amount` (never silently deducted).
        uint256 total = p.amount + feeAmount;

        Agreement storage a = _agreements[agreementId];
        a.orgId = p.orgId;
        a.requestId = p.requestId;
        a.offerHash = p.offerHash;
        a.termsHash = p.termsHash;
        a.buyer = buyer;
        a.vendor = p.vendor;
        a.amount = p.amount;
        a.feeAmount = feeAmount;
        a.createdAt = uint64(block.timestamp);
        a.acceptBy = p.acceptBy;
        a.deliverBy = p.deliverBy;
        a.disputeWindow = p.disputeWindow;
        a.state = State.Funded;

        totalActiveEscrow += total;
        agreementCount += 1;

        _emitAgreementCreated(agreementId, buyer, p, feeAmount);

        musd.safeTransferFrom(buyer, address(this), total);
        return agreementId;
    }

    /// @notice Buyer releases payment for an accepted or delivered agreement.
    function release(bytes32 agreementId) external nonReentrant {
        Agreement storage a = _requireKnown(agreementId);
        _requireBuyerAuthority(a);
        if (a.state != State.Accepted && a.state != State.Delivered) {
            revert InvalidState(agreementId, State.Delivered, a.state);
        }
        _settleRelease(agreementId, a);
    }

    /// @notice Cancel an agreement that the vendor never accepted, or cancel a
    ///         funded agreement before `acceptBy`. Full refund, including fee.
    function cancelUnaccepted(bytes32 agreementId) external nonReentrant {
        Agreement storage a = _requireKnown(agreementId);
        _requireBuyerAuthority(a);
        if (a.state != State.Funded) revert InvalidState(agreementId, State.Funded, a.state);
        _settleRefund(agreementId, a, keccak256("buyer_cancelled"));
    }

    /// @notice Buyer opens a dispute while the dispute window is open.
    function dispute(bytes32 agreementId, bytes32 evidenceHash) external nonReentrant {
        Agreement storage a = _requireKnown(agreementId);
        if (msg.sender != a.buyer && msg.sender != a.vendor) revert NotParty();
        if (evidenceHash == bytes32(0)) revert InvalidAmount();

        if (a.state == State.Accepted) {
            // Disputing an accepted, undelivered agreement is allowed until the
            // delivery deadline (vendor failed to deliver in time).
            if (block.timestamp <= a.deliverBy) revert DeadlineNotPassed(agreementId);
        } else if (a.state == State.Delivered) {
            if (block.timestamp > a.deliveredAt + a.disputeWindow) revert DisputeWindowClosed(agreementId);
        } else {
            revert InvalidState(agreementId, State.Delivered, a.state);
        }

        a.state = State.Disputed;
        emit AgreementDisputed(agreementId, msg.sender, evidenceHash);
    }

    // ---------------------------------------------------------------------
    // Vendor side
    // ---------------------------------------------------------------------

    function accept(bytes32 agreementId) external nonReentrant {
        Agreement storage a = _requireKnown(agreementId);
        if (msg.sender != a.vendor) revert NotVendor();
        if (a.state != State.Funded) revert InvalidState(agreementId, State.Funded, a.state);
        if (block.timestamp > a.acceptBy) revert DeadlinePassed(agreementId);

        a.state = State.Accepted;
        a.acceptedAt = uint64(block.timestamp);
        emit AgreementAccepted(agreementId, msg.sender, a.acceptedAt);
    }

    /// @notice Vendor submits (or re-submits) a delivery proof hash. The hash is the
    ///         keccak256 of the canonical delivery manifest produced by the backend;
    ///         the raw manifest is pinned off-chain (see docs/DATA_MODEL.md).
    function submitDelivery(bytes32 agreementId, bytes32 proofHash) external nonReentrant {
        Agreement storage a = _requireKnown(agreementId);
        if (msg.sender != a.vendor) revert NotVendor();
        if (a.state != State.Accepted && a.state != State.Delivered) {
            revert InvalidState(agreementId, State.Accepted, a.state);
        }
        if (block.timestamp > a.deliverBy) revert DeadlinePassed(agreementId);
        if (proofHash == bytes32(0)) revert InvalidAmount();

        a.state = State.Delivered;
        a.deliveredAt = uint64(block.timestamp);
        a.deliveryCount += 1;
        a.deliverableHash = proofHash;

        emit DeliverySubmitted(agreementId, msg.sender, proofHash, a.deliveryCount);
    }

    /// @notice Vendor claims payment after the dispute window has lapsed without a
    ///         dispute or release. Protects vendors from buyer inaction.
    function claimAfterDisputeWindow(bytes32 agreementId) external nonReentrant {
        Agreement storage a = _requireKnown(agreementId);
        if (msg.sender != a.vendor) revert NotVendor();
        if (a.state != State.Delivered) revert InvalidState(agreementId, State.Delivered, a.state);
        if (block.timestamp <= a.deliveredAt + a.disputeWindow) revert DisputeWindowOpen(agreementId);
        _settleRelease(agreementId, a);
    }

    // ---------------------------------------------------------------------
    // Resolution
    // ---------------------------------------------------------------------

    /// @notice Resolve a disputed agreement. `vendorAmount` is paid to the vendor;
    ///         the buyer receives `amount - vendorAmount`; the fee is pro-rated to
    ///         the vendor share. `vendorAmount` must not exceed `amount`.
    function resolveDispute(bytes32 agreementId, uint256 vendorAmount, bytes32 rulingHash)
        external
        onlyRole(RESOLVER_ROLE)
        nonReentrant
    {
        Agreement storage a = _requireKnown(agreementId);
        if (a.state != State.Disputed) revert InvalidState(agreementId, State.Disputed, a.state);
        if (vendorAmount > a.amount) revert InvalidRuling();
        if (rulingHash == bytes32(0)) revert InvalidAmount();

        uint256 feeForVendor = (a.feeAmount * vendorAmount) / a.amount;
        uint256 buyerAmount = (a.amount - vendorAmount) + (a.feeAmount - feeForVendor);

        a.state = State.Released; // terminal
        totalActiveEscrow -= (a.amount + a.feeAmount);

        if (vendorAmount > 0) musd.safeTransfer(a.vendor, vendorAmount);
        if (feeForVendor > 0) musd.safeTransfer(feeRecipient, feeForVendor);
        if (buyerAmount > 0) musd.safeTransfer(a.buyer, buyerAmount);

        emit DisputeResolved(agreementId, vendorAmount, buyerAmount, feeForVendor, rulingHash);
    }

    // ---------------------------------------------------------------------
    // Fee administration
    // ---------------------------------------------------------------------

    function setFeeBps(uint16 newFeeBps) external onlyRole(FEE_MANAGER_ROLE) {
        if (newFeeBps > MAX_FEE_BPS) revert InvalidFee();
        feeBps = newFeeBps;
        emit FeeUpdated(newFeeBps);
    }

    function setFeeRecipient(address newRecipient) external onlyRole(FEE_MANAGER_ROLE) {
        if (newRecipient == address(0)) revert ZeroAddress();
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(newRecipient);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    event FeeUpdated(uint16 feeBps);
    event FeeRecipientUpdated(address recipient);

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getAgreement(bytes32 agreementId) external view returns (AgreementView memory v) {
        Agreement storage a = _requireKnown(agreementId);
        v = AgreementView({
            id: agreementId,
            orgId: a.orgId,
            requestId: a.requestId,
            offerHash: a.offerHash,
            termsHash: a.termsHash,
            buyer: a.buyer,
            vendor: a.vendor,
            amount: a.amount,
            feeAmount: a.feeAmount,
            createdAt: a.createdAt,
            acceptBy: a.acceptBy,
            deliverBy: a.deliverBy,
            disputeWindow: a.disputeWindow,
            state: a.state,
            deliveryCount: a.deliveryCount,
            feeOnTop: true
        });
    }

    function stateOf(bytes32 agreementId) external view returns (State) {
        return _agreements[agreementId].state;
    }

    function deliverableOf(bytes32 agreementId) external view returns (bytes32) {
        return _agreements[agreementId].deliverableHash;
    }

    function quoteFee(uint256 amount) external view returns (uint256) {
        return (amount * feeBps) / BPS_DENOMINATOR;
    }

    function agreementIdFor(
        bytes32 orgId,
        bytes32 requestId,
        bytes32 offerHash,
        uint256 nonce
    ) external view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), orgId, requestId, offerHash, nonce));
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _emitAgreementCreated(
        bytes32 agreementId,
        address buyer,
        CreateParams calldata p,
        uint256 feeAmount
    ) internal {
        emit AgreementCreated(
            agreementId,
            p.orgId,
            p.requestId,
            buyer,
            p.vendor,
            p.amount,
            feeAmount,
            p.offerHash,
            p.termsHash,
            p.acceptBy,
            p.deliverBy,
            p.disputeWindow
        );
    }

    function _requireKnown(bytes32 agreementId) internal view returns (Agreement storage a) {
        a = _agreements[agreementId];
        if (a.state == State.None) revert UnknownAgreement(agreementId);
    }

    function _requireBuyerAuthority(Agreement storage a) internal view {
        if (msg.sender == a.buyer) return;
        if (!registry.isAuthorized(a.orgId, msg.sender)) revert AgentNotAuthorized(a.orgId, msg.sender);
    }

    function _settleRelease(bytes32 agreementId, Agreement storage a) internal {
        uint256 amount = a.amount;
        uint256 fee = a.feeAmount;
        address vendor = a.vendor;

        a.state = State.Released;
        totalActiveEscrow -= (amount + fee);

        musd.safeTransfer(vendor, amount);
        if (fee > 0) {
            if (feeRecipient == address(0)) revert FeeRecipientUnset();
            musd.safeTransfer(feeRecipient, fee);
        }
        emit AgreementReleased(agreementId, vendor, amount, fee);
    }

    function _settleRefund(bytes32 agreementId, Agreement storage a, bytes32 reasonHash) internal {
        uint256 total = a.amount + a.feeAmount;
        address buyer = a.buyer;

        a.state = State.Refunded;
        totalActiveEscrow -= total;

        musd.safeTransfer(buyer, total);
        emit AgreementRefunded(agreementId, buyer, total, reasonHash);
    }
}
