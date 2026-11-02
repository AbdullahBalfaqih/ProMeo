// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAgentPolicyRegistry} from "./interfaces/IAgentPolicyRegistry.sol";
import {IProcurementEscrow} from "./interfaces/IProcurementEscrow.sol";
import {IMezoTroveManager} from "./interfaces/IMezoTrove.sol";
import {IPriceFeed} from "./interfaces/IPriceFeed.sol";
import {IVeBTC} from "./interfaces/IVeBTC.sol";

/// @title ProcurementEscrow
/// @notice MUSD-denominated escrow for agent-to-vendor procurement on Mezo.
///
///         Money flow & Settlement Modes
///         -----------------------------
///         Buyer funds `amount` (vendor payment) plus `feeAmount` (protocol fee,
///         charged on top, never deducted from the vendor's quoted price). Both are
///         held by this contract.
///         Supports:
///         - Single full settlement via `release`
///         - Multi-stage milestone payouts via `releaseMilestone`
///         - EIP-2612 gasless approval via `createAgreementWithPermit`
///         - Deep Mezo protocol state verification (Trove health & collateral checking)
///
///         Authority & Tenant Isolation model
///         -----------------------------------
///         * Strict Buyer-to-Org binding: Each buyer address is bound to its `orgId`,
///           preventing arbitrary cross-tenant fund draining or unauthorized agreement creation.
///         * `buyer` may drive its own agreement (release, cancel, dispute).
///         * Any other caller must be an agent explicitly authorized for the
///           agreement's `orgId` in the AgentPolicyRegistry at execution time.
///         * `vendor` can accept, deliver, and claim after the dispute window lapses.
///         * `RESOLVER_ROLE` resolves disputed agreements.
///         * `PAUSER_ROLE` pauses new agreements while permitting ongoing agreements to settle.
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
        uint256 releasedAmount;
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

    /// @notice Organization => Bound Buyer/Treasury Address
    mapping(bytes32 => address) public orgBuyer;

    /// @notice Optional Mezo Trove Manager contract for checking borrower ICR / collateral health
    IMezoTroveManager public troveManager;
    /// @notice Minimum Individual Collateral Ratio required (scaled by 1e18, 0 = disabled)
    uint256 public minTroveHealthRatio;

    /// @notice Mezo's native Skip BTC/USD price oracle (0x86bCF0841622a5dAC14A313a15f96A95421b9366 on testnet)
    IPriceFeed public priceFeed;
    /// @notice Mezo's vote-escrowed Bitcoin position NFT (0xB63fcCd03521Cf21907627bd7fA465C129479231 on testnet)
    IVeBTC public veBtc;

    mapping(bytes32 => Agreement) private _agreements;
    /// @notice Total MUSD currently held for live agreements. Invariant target.
    uint256 public totalActiveEscrow;
    /// @notice Monotonic counter of agreements ever created, used by indexers.
    uint256 public agreementCount;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event OrgBuyerBound(bytes32 indexed orgId, address indexed buyer);
    event OrgBuyerRebound(bytes32 indexed orgId, address indexed oldBuyer, address indexed newBuyer);
    event MilestoneReleased(bytes32 indexed agreementId, uint256 amountReleased, uint256 totalReleased, uint256 remaining);
    event TroveManagerUpdated(address indexed troveManager, uint256 minRatio);
    event TroveHealthVerified(address indexed buyer, uint256 coll, uint256 debt);
    event PriceFeedUpdated(address indexed priceFeed);
    event VeBtcUpdated(address indexed veBtc);
    event FeeUpdated(uint16 feeBps);
    event FeeRecipientUpdated(address recipient);

    // ---------------------------------------------------------------------
    // Custom Errors
    // ---------------------------------------------------------------------

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
    error BuyerNotBoundToOrg(bytes32 orgId, address attemptedBuyer, address boundBuyer);
    error UnhealthyTrove(address buyer, uint256 coll, uint256 debt);
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
    // Buyer side & Agreement Lifecycle
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

    /// @notice Bind or update an organization's designated buyer treasury address.
    function setOrgBuyer(bytes32 orgId, address newBuyer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (orgId == bytes32(0) || newBuyer == address(0)) revert ZeroAddress();
        address oldBuyer = orgBuyer[orgId];
        orgBuyer[orgId] = newBuyer;
        emit OrgBuyerRebound(orgId, oldBuyer, newBuyer);
    }

    /// @notice Configure Mezo Trove Manager integration for protocol-level credit checks.
    function setTroveManager(address troveManager_, uint256 minRatio_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        troveManager = IMezoTroveManager(troveManager_);
        minTroveHealthRatio = minRatio_;
        emit TroveManagerUpdated(troveManager_, minRatio_);
    }

    /// @notice Set Mezo's native Skip BTC/USD price oracle address.
    function setPriceFeed(address priceFeed_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        priceFeed = IPriceFeed(priceFeed_);
        emit PriceFeedUpdated(priceFeed_);
    }

    /// @notice Set Mezo's native veBTC NFT contract address.
    function setVeBtc(address veBtc_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        veBtc = IVeBTC(veBtc_);
        emit VeBtcUpdated(veBtc_);
    }

    /// @notice Reads current BTC/USD price directly from Mezo's Skip oracle.
    function getBtcPrice() public view returns (uint256) {
        if (address(priceFeed) == address(0)) return 0;
        return priceFeed.fetchPrice();
    }

    /// @notice Converts an MUSD amount to its equivalent BTC value using Mezo's live oracle.
    function btcValueOf(uint256 musdAmount) external view returns (uint256) {
        uint256 price = getBtcPrice();
        if (price == 0) return 0;
        return (musdAmount * 1e18) / price;
    }

    /// @notice Checks how many veBTC positions the buyer holds on Mezo.
    function getBuyerVeBtcCount(address buyer) external view returns (uint256) {
        if (address(veBtc) == address(0)) return 0;
        return veBtc.balanceOf(buyer);
    }

    /// @notice Verify a buyer's Mezo Trove health and collateralization.
    function checkBuyerTroveHealth(address buyer) public view returns (bool healthy, uint256 coll, uint256 debt) {
        if (address(troveManager) == address(0) || minTroveHealthRatio == 0) {
            return (true, 0, 0);
        }
        uint256 status = troveManager.getTroveStatus(buyer);
        // Status 1 = active in Liquity/Mezo
        if (status != 1) {
            return (false, 0, 0);
        }
        coll = troveManager.getTroveColl(buyer);
        debt = troveManager.getTroveDebt(buyer);
        if (debt == 0) return (true, coll, debt);
        // ICR in 1e18 format (coll * price / debt)
        uint256 icr = troveManager.getCurrentICR(buyer, 1e18);
        healthy = (icr >= minTroveHealthRatio);
    }

    /// @notice Create and fund an agreement. Caller must be the bound buyer or an
    ///         authorized agent for `orgId`.
    /// @return agreementId Deterministic id of the agreement.
    function createAgreement(address buyer, CreateParams calldata p)
        external
        nonReentrant
        whenNotPaused
        returns (bytes32 agreementId)
    {
        return _createAgreementInternal(buyer, p);
    }

    /// @notice Create and fund an agreement in a single transaction using EIP-2612 Permit.
    function createAgreementWithPermit(
        address buyer,
        CreateParams calldata p,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant whenNotPaused returns (bytes32 agreementId) {
        uint256 feeAmount = (p.amount * feeBps) / BPS_DENOMINATOR;
        uint256 total = p.amount + feeAmount;
        IERC20Permit(address(musd)).permit(buyer, address(this), total, deadline, v, r, s);
        return _createAgreementInternal(buyer, p);
    }

    function _createAgreementInternal(address buyer, CreateParams calldata p)
        internal
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

        // High Finding #1 Resolution: Enforce that buyer address is bound to its orgId
        address bound = orgBuyer[p.orgId];
        address registryBound = registry.getOrgBuyer(p.orgId);
        address expected = registryBound != address(0) ? registryBound : bound;

        if (expected == address(0)) {
            // First agreement for this organization binds the buyer address
            orgBuyer[p.orgId] = buyer;
            emit OrgBuyerBound(p.orgId, buyer);
        } else if (expected != buyer) {
            revert BuyerNotBoundToOrg(p.orgId, buyer, expected);
        }

        // Caller authorization: caller must be either the bound buyer itself or an authorized agent
        if (msg.sender != buyer && !registry.isAuthorized(p.orgId, msg.sender)) {
            revert AgentNotAuthorized(p.orgId, msg.sender);
        }

        // Check buyer Trove health if configured
        if (address(troveManager) != address(0) && minTroveHealthRatio > 0) {
            (bool healthy, uint256 coll, uint256 debt) = checkBuyerTroveHealth(buyer);
            if (!healthy) revert UnhealthyTrove(buyer, coll, debt);
            emit TroveHealthVerified(buyer, coll, debt);
        }

        agreementId = keccak256(
            abi.encode(block.chainid, address(this), p.orgId, p.requestId, p.offerHash, p.nonce)
        );
        if (_agreements[agreementId].state != State.None) revert AgreementExists(agreementId);

        uint256 feeAmount = (p.amount * feeBps) / BPS_DENOMINATOR;
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
        a.releasedAmount = 0;
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

    /// @notice Buyer releases full remaining payment for an accepted or delivered agreement.
    function release(bytes32 agreementId) external nonReentrant {
        Agreement storage a = _requireKnown(agreementId);
        _requireBuyerAuthority(a);
        if (a.state != State.Accepted && a.state != State.Delivered) {
            revert InvalidState(agreementId, State.Delivered, a.state);
        }
        _settleRelease(agreementId, a);
    }

    /// @notice Release a partial milestone payment to the vendor.
    function releaseMilestone(bytes32 agreementId, uint256 milestoneAmount) external nonReentrant {
        Agreement storage a = _requireKnown(agreementId);
        _requireBuyerAuthority(a);
        if (a.state != State.Accepted && a.state != State.Delivered) {
            revert InvalidState(agreementId, State.Delivered, a.state);
        }
        if (milestoneAmount == 0 || a.releasedAmount + milestoneAmount > a.amount) {
            revert InvalidAmount();
        }

        a.releasedAmount += milestoneAmount;
        uint256 fee = (milestoneAmount * feeBps) / BPS_DENOMINATOR;
        uint256 totalMilestoneDeduction = milestoneAmount + fee;

        if (totalActiveEscrow >= totalMilestoneDeduction) {
            totalActiveEscrow -= totalMilestoneDeduction;
        } else {
            totalActiveEscrow = 0;
        }

        uint256 remaining = a.amount - a.releasedAmount;
        if (remaining == 0) {
            a.state = State.Released;
        }

        emit MilestoneReleased(agreementId, milestoneAmount, a.releasedAmount, remaining);

        musd.safeTransfer(a.vendor, milestoneAmount);
        if (fee > 0 && feeRecipient != address(0)) {
            musd.safeTransfer(feeRecipient, fee);
        }
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

    /// @notice Vendor submits (or re-submits) a delivery proof hash.
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

    /// @notice Vendor claims payment after the dispute window has lapsed without dispute or release.
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

    /// @notice Resolve a disputed agreement.
    function resolveDispute(bytes32 agreementId, uint256 vendorAmount, bytes32 rulingHash)
        external
        onlyRole(RESOLVER_ROLE)
        nonReentrant
    {
        Agreement storage a = _requireKnown(agreementId);
        if (a.state != State.Disputed) revert InvalidState(agreementId, State.Disputed, a.state);
        uint256 unreleasedAmount = a.amount - a.releasedAmount;
        if (vendorAmount > unreleasedAmount) revert InvalidRuling();
        if (rulingHash == bytes32(0)) revert InvalidAmount();

        uint256 unreleasedFee = (a.feeAmount * unreleasedAmount) / a.amount;
        uint256 feeForVendor = (unreleasedFee * vendorAmount) / unreleasedAmount;
        uint256 buyerAmount = (unreleasedAmount - vendorAmount) + (unreleasedFee - feeForVendor);

        a.state = State.Released; // terminal
        totalActiveEscrow -= (unreleasedAmount + unreleasedFee);

        if (vendorAmount > 0) musd.safeTransfer(a.vendor, vendorAmount);
        if (feeForVendor > 0) musd.safeTransfer(feeRecipient, feeForVendor);
        if (buyerAmount > 0) musd.safeTransfer(a.buyer, buyerAmount);

        emit DisputeResolved(agreementId, vendorAmount, buyerAmount, feeForVendor, rulingHash);
    }

    // ---------------------------------------------------------------------
    // Fee administration & Pause
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
        uint256 unreleasedAmount = a.amount - a.releasedAmount;
        if (unreleasedAmount == 0) revert InvalidAmount();

        uint256 unreleasedFee = (unreleasedAmount * feeBps) / BPS_DENOMINATOR;
        address vendor = a.vendor;

        a.releasedAmount = a.amount;
        a.state = State.Released;
        totalActiveEscrow -= (unreleasedAmount + unreleasedFee);

        musd.safeTransfer(vendor, unreleasedAmount);
        if (unreleasedFee > 0) {
            if (feeRecipient == address(0)) revert FeeRecipientUnset();
            musd.safeTransfer(feeRecipient, unreleasedFee);
        }
        emit AgreementReleased(agreementId, vendor, unreleasedAmount, unreleasedFee);
    }

    function _settleRefund(bytes32 agreementId, Agreement storage a, bytes32 reasonHash) internal {
        uint256 unreleasedAmount = a.amount - a.releasedAmount;
        uint256 unreleasedFee = (unreleasedAmount * feeBps) / BPS_DENOMINATOR;
        uint256 totalRefund = unreleasedAmount + unreleasedFee;
        address buyer = a.buyer;

        a.state = State.Refunded;
        totalActiveEscrow -= totalRefund;

        musd.safeTransfer(buyer, totalRefund);
        emit AgreementRefunded(agreementId, buyer, totalRefund, reasonHash);
    }
}
