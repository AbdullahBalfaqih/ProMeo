// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ITroveManager {
    function getTroveStatus(address _borrower) external view returns (uint256);
    function getCurrentICR(address _borrower, uint256 _price) external view returns (uint256);
}

interface IPriceFeed {
    function fetchPrice() external view returns (uint256);
}

/**
 * @title ProcurementEscrow
 * @notice Non-custodial MUSD escrow for autonomous agent procurement on Mezo.
 *         Binds each buyer address to an organization, enforces action-specific
 *         permissions, and integrates with Mezo TroveManager protocol state.
 * @dev    Deployed on Mezo Testnet (chain 31611). Uses canonical MUSD token:
 *         0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503
 */
contract ProcurementEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Types ───────────────────────────────────────────────────────────
    enum AgreementState {
        None,       // 0 - does not exist
        Funded,     // 1 - buyer locked MUSD
        Released,   // 2 - buyer released to vendor
        Refunded,   // 3 - buyer reclaimed
        Disputed,   // 4 - either party raised dispute
        Resolved    // 5 - resolver split funds
    }

    struct Agreement {
        address buyer;
        address vendor;
        uint256 amount;
        bytes32 termsHash;
        AgreementState state;
        bytes32 orgId;          // binds buyer to their org (Fix High #1)
        uint256 createdAt;
    }

    // ─── State ───────────────────────────────────────────────────────────
    IERC20 public immutable musd;
    address public resolver;    // dispute resolver address

    uint256 public nextAgreementId = 1;
    mapping(uint256 => Agreement) public agreements;

    // Buyer → OrgId binding (Fix High #1)
    mapping(address => bytes32) public buyerOrg;

    // Mezo Protocol State Integration
    address public troveManager; // Mezo TroveManager: 0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0
    address public priceFeed;    // Mezo PriceFeed: 0x86bCF0841622a5dAC14A313a15f96A95421b9366
    uint256 public minReleaseICR = 110e16; // 110% minimum ICR required to release if borrower has a Trove

    // Protocol fee in basis points (e.g., 50 = 0.5%)
    uint256 public feeBps = 50;
    address public feeRecipient;
    uint256 public totalFeesCollected;

    // ─── Events ──────────────────────────────────────────────────────────
    event OrgBound(address indexed buyer, bytes32 indexed orgId);
    event AgreementCreated(
        uint256 indexed agreementId,
        address indexed buyer,
        address indexed vendor,
        uint256 amount,
        bytes32 termsHash,
        bytes32 orgId
    );
    event AgreementFunded(uint256 indexed agreementId, uint256 amount);
    event AgreementReleased(uint256 indexed agreementId, uint256 vendorAmount, uint256 fee);
    event AgreementRefunded(uint256 indexed agreementId, uint256 amount);
    event AgreementDisputed(uint256 indexed agreementId, address indexed disputedBy);
    event DisputeResolved(
        uint256 indexed agreementId,
        uint256 vendorShare,
        uint256 buyerShare
    );
    event ResolverUpdated(address indexed oldResolver, address indexed newResolver);
    event TroveManagerUpdated(address indexed troveManager);
    event PriceFeedUpdated(address indexed priceFeed);
    event MinReleaseICRUpdated(uint256 minICR);
    event TroveHealthVerified(address indexed buyer, uint256 icr, uint256 troveStatus);
    event FeeBpsUpdated(uint256 oldBps, uint256 newBps);

    // ─── Errors ──────────────────────────────────────────────────────────
    error OnlyBuyer();
    error OnlyVendor();
    error OnlyBuyerOrVendor();
    error OnlyResolver();
    error InvalidState(AgreementState current, AgreementState expected);
    error ZeroAddress();
    error ZeroAmount();
    error OrgMismatch(bytes32 expected, bytes32 provided);
    error InvalidShares();
    error AgreementNotFound();
    error TroveUnhealthy(uint256 currentICR, uint256 minRequired);
    error TroveNotActive(uint256 status);

    // ─── Modifiers (Fix High #2: Action-Specific Permissions) ─────────────
    modifier onlyBuyer(uint256 _id) {
        if (msg.sender != agreements[_id].buyer) revert OnlyBuyer();
        _;
    }

    modifier onlyVendor(uint256 _id) {
        if (msg.sender != agreements[_id].vendor) revert OnlyVendor();
        _;
    }

    modifier onlyBuyerOrVendor(uint256 _id) {
        Agreement storage a = agreements[_id];
        if (msg.sender != a.buyer && msg.sender != a.vendor) revert OnlyBuyerOrVendor();
        _;
    }

    modifier onlyResolverRole() {
        if (msg.sender != resolver) revert OnlyResolver();
        _;
    }

    modifier inState(uint256 _id, AgreementState _expected) {
        if (agreements[_id].state != _expected)
            revert InvalidState(agreements[_id].state, _expected);
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────
    constructor(
        address _musd,
        address _resolver,
        address _feeRecipient,
        address _troveManager,
        address _priceFeed
    ) Ownable(msg.sender) {
        if (_musd == address(0)) revert ZeroAddress();
        musd = IERC20(_musd);
        resolver = _resolver;
        feeRecipient = _feeRecipient == address(0) ? msg.sender : _feeRecipient;
        troveManager = _troveManager;
        priceFeed = _priceFeed;
    }

    // ─── Org Binding (Fix High #1) ───────────────────────────────────────
    /**
     * @notice Bind a buyer address to an organization. Once bound, all
     *         agreements created by this buyer must use the same orgId.
     */
    function bindBuyerToOrg(bytes32 _orgId) external {
        if (_orgId == bytes32(0)) revert ZeroAmount();
        if (buyerOrg[msg.sender] != bytes32(0) && buyerOrg[msg.sender] != _orgId) {
            revert OrgMismatch(buyerOrg[msg.sender], _orgId);
        }
        buyerOrg[msg.sender] = _orgId;
        emit OrgBound(msg.sender, _orgId);
    }

    // ─── Core Escrow Lifecycle ───────────────────────────────────────────

    /**
     * @notice Create and fund an escrow agreement in one transaction.
     *         Buyer must have approved this contract for `_amount` MUSD.
     *         The buyer's orgId must be pre-bound or provided here.
     * @param _vendor   Vendor payout address
     * @param _amount   MUSD amount to lock in escrow
     * @param _termsHash keccak256 of the off-chain agreement terms
     * @param _orgId    Organization identifier for the buyer
     */
    function createAgreement(
        address _vendor,
        uint256 _amount,
        bytes32 _termsHash,
        bytes32 _orgId
    ) external nonReentrant returns (uint256 agreementId) {
        if (_vendor == address(0)) revert ZeroAddress();
        if (_amount == 0) revert ZeroAmount();
        if (_orgId == bytes32(0)) revert ZeroAmount();

        // Enforce org binding (Fix High #1)
        if (buyerOrg[msg.sender] == bytes32(0)) {
            buyerOrg[msg.sender] = _orgId;
            emit OrgBound(msg.sender, _orgId);
        } else if (buyerOrg[msg.sender] != _orgId) {
            revert OrgMismatch(buyerOrg[msg.sender], _orgId);
        }

        agreementId = nextAgreementId++;
        agreements[agreementId] = Agreement({
            buyer: msg.sender,
            vendor: _vendor,
            amount: _amount,
            termsHash: _termsHash,
            state: AgreementState.Funded,
            orgId: _orgId,
            createdAt: block.timestamp
        });

        // Transfer MUSD from buyer to this contract
        musd.safeTransferFrom(msg.sender, address(this), _amount);

        emit AgreementCreated(agreementId, msg.sender, _vendor, _amount, _termsHash, _orgId);
        emit AgreementFunded(agreementId, _amount);
    }

    /**
     * @notice Buyer releases MUSD to the vendor upon verified delivery.
     *         Checks Mezo Trove health if buyer has an active Trove position.
     *         A protocol fee is deducted and sent to the fee recipient.
     *         Action-specific: only the buyer can release (Fix High #2).
     */
    function releaseAgreement(uint256 _id)
        external
        nonReentrant
        onlyBuyer(_id)           // Fix High #2: action-specific permission
        inState(_id, AgreementState.Funded)
    {
        Agreement storage a = agreements[_id];

        // Mezo Protocol State Verification: Check Trove health
        if (troveManager != address(0)) {
            uint256 status = ITroveManager(troveManager).getTroveStatus(a.buyer);
            // 0: non-existent (plain buyer), 1: active. If 2,3,4 (closed/liquidated), revert!
            if (status != 0 && status != 1) revert TroveNotActive(status);

            if (status == 1 && priceFeed != address(0) && minReleaseICR > 0) {
                uint256 price = IPriceFeed(priceFeed).fetchPrice();
                uint256 icr = ITroveManager(troveManager).getCurrentICR(a.buyer, price);
                if (icr < minReleaseICR) revert TroveUnhealthy(icr, minReleaseICR);
                emit TroveHealthVerified(a.buyer, icr, status);
            }
        }

        a.state = AgreementState.Released;

        uint256 fee = (a.amount * feeBps) / 10000;
        uint256 vendorAmount = a.amount - fee;

        musd.safeTransfer(a.vendor, vendorAmount);
        if (fee > 0) {
            musd.safeTransfer(feeRecipient, fee);
            totalFeesCollected += fee;
        }

        emit AgreementReleased(_id, vendorAmount, fee);
    }

    /**
     * @notice Buyer reclaims MUSD from a funded (non-disputed) agreement.
     *         Action-specific: only the buyer can refund (Fix High #2).
     */
    function refundAgreement(uint256 _id)
        external
        nonReentrant
        onlyBuyer(_id)           // Fix High #2: action-specific permission
        inState(_id, AgreementState.Funded)
    {
        Agreement storage a = agreements[_id];
        a.state = AgreementState.Refunded;

        musd.safeTransfer(a.buyer, a.amount);

        emit AgreementRefunded(_id, a.amount);
    }

    /**
     * @notice Either buyer or vendor can raise a dispute on a funded agreement.
     *         Action-specific: only buyer or vendor (Fix High #2).
     */
    function disputeAgreement(uint256 _id)
        external
        onlyBuyerOrVendor(_id)   // Fix High #2: action-specific permission
        inState(_id, AgreementState.Funded)
    {
        agreements[_id].state = AgreementState.Disputed;
        emit AgreementDisputed(_id, msg.sender);
    }

    /**
     * @notice Resolver splits the escrowed MUSD between vendor and buyer.
     *         Action-specific: only the resolver address (Fix High #2).
     */
    function resolveDispute(
        uint256 _id,
        uint256 _vendorShare,
        uint256 _buyerShare
    )
        external
        nonReentrant
        onlyResolverRole()       // Fix High #2: action-specific permission
        inState(_id, AgreementState.Disputed)
    {
        Agreement storage a = agreements[_id];
        if (_vendorShare + _buyerShare != a.amount) revert InvalidShares();

        a.state = AgreementState.Resolved;

        if (_vendorShare > 0) musd.safeTransfer(a.vendor, _vendorShare);
        if (_buyerShare > 0) musd.safeTransfer(a.buyer, _buyerShare);

        emit DisputeResolved(_id, _vendorShare, _buyerShare);
    }

    // ─── View helpers ────────────────────────────────────────────────────

    function getAgreement(uint256 _id)
        external
        view
        returns (
            address buyer,
            address vendor,
            uint256 amount,
            bytes32 termsHash,
            AgreementState state,
            bytes32 orgId,
            uint256 createdAt
        )
    {
        if (_id == 0 || _id >= nextAgreementId) revert AgreementNotFound();
        Agreement storage a = agreements[_id];
        return (a.buyer, a.vendor, a.amount, a.termsHash, a.state, a.orgId, a.createdAt);
    }

    function checkTroveHealth(address _borrower) external view returns (uint256 status, uint256 icr) {
        if (troveManager == address(0)) return (0, 0);
        status = ITroveManager(troveManager).getTroveStatus(_borrower);
        if (status == 1 && priceFeed != address(0)) {
            uint256 price = IPriceFeed(priceFeed).fetchPrice();
            icr = ITroveManager(troveManager).getCurrentICR(_borrower, price);
        }
    }

    function agreementCount() external view returns (uint256) {
        return nextAgreementId - 1;
    }

    // ─── Admin ───────────────────────────────────────────────────────────

    function setResolver(address _resolver) external onlyOwner {
        emit ResolverUpdated(resolver, _resolver);
        resolver = _resolver;
    }

    function setTroveManager(address _troveManager) external onlyOwner {
        troveManager = _troveManager;
        emit TroveManagerUpdated(_troveManager);
    }

    function setPriceFeed(address _priceFeed) external onlyOwner {
        priceFeed = _priceFeed;
        emit PriceFeedUpdated(_priceFeed);
    }

    function setMinReleaseICR(uint256 _minICR) external onlyOwner {
        minReleaseICR = _minICR;
        emit MinReleaseICRUpdated(_minICR);
    }

    function setFeeBps(uint256 _bps) external onlyOwner {
        require(_bps <= 1000, "Fee too high"); // max 10%
        emit FeeBpsUpdated(feeBps, _bps);
        feeBps = _bps;
    }

    function setFeeRecipient(address _recipient) external onlyOwner {
        if (_recipient == address(0)) revert ZeroAddress();
        feeRecipient = _recipient;
    }
}
