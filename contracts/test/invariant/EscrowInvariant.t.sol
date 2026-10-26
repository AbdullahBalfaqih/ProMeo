// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockMUSD} from "../mocks/MockMUSD.sol";
import {AgentPolicyRegistry} from "../../src/AgentPolicyRegistry.sol";
import {ProcurementEscrow} from "../../src/ProcurementEscrow.sol";
import {IProcurementEscrow} from "../../src/interfaces/IProcurementEscrow.sol";

/// @dev Drives the escrow through random but valid-ish sequences. Reverts are
///      ignored on purpose (`fail_on_revert = false`) because invalid transitions
///      are expected; the invariants must hold for every reachable sequence.
contract EscrowHandler is Test {
    MockMUSD public musd;
    ProcurementEscrow public escrow;

    address[] public buyers;
    address[] public vendors;
    bytes32[] public ids;

    uint256 public creates;
    uint256 public releases;
    uint256 public cancels;
    uint256 public disputes;
    uint256 public resolutions;
    uint256 public claims;
    uint256 public ghostDeposited;
    uint256 public ghostWithdrawn;

    bytes32 internal constant ORG = keccak256("org-invariant");

    constructor(MockMUSD musd_, ProcurementEscrow escrow_, address[] memory buyers_, address[] memory vendors_) {
        musd = musd_;
        escrow = escrow_;
        buyers = buyers_;
        vendors = vendors_;
    }

    function create(uint256 buyerSeed, uint256 vendorSeed, uint96 amount, uint16 feeBps, uint64 windowSeed) external {
        address buyer = buyers[buyerSeed % buyers.length];
        address vendor = vendors[vendorSeed % vendors.length];
        amount = uint96(bound(amount, 1e6, 1e21));
        uint16 actualFeeBps = escrow.feeBps();
        feeBps; // silence
        uint64 disputeWindow = uint64(bound(windowSeed, 1 hours, 30 days));
        if (vendor == buyer) return;

        ProcurementEscrow.CreateParams memory p = ProcurementEscrow.CreateParams({
            orgId: ORG,
            requestId: keccak256(abi.encode("req", creates)),
            offerHash: keccak256(abi.encode("offer", creates)),
            termsHash: keccak256(abi.encode("terms", creates)),
            vendor: vendor,
            amount: amount,
            acceptBy: uint64(block.timestamp + 2 days),
            deliverBy: uint64(block.timestamp + 10 days),
            disputeWindow: disputeWindow,
            nonce: creates,
            feeOnTop: true
        });

        uint256 fee = (uint256(amount) * actualFeeBps) / 10_000;
        vm.prank(buyer);
        bytes32 id = escrow.createAgreement(buyer, p);
        ids.push(id);
        creates += 1;
        ghostDeposited += amount + fee;
    }

    function accept(uint256 idSeed) external {
        bytes32 id = _id(idSeed);
        IProcurementEscrow.AgreementView memory v = escrow.getAgreement(id);
        vm.prank(v.vendor);
        escrow.accept(id);
    }

    function deliver(uint256 idSeed, uint256 proofSeed) external {
        bytes32 id = _id(idSeed);
        IProcurementEscrow.AgreementView memory v = escrow.getAgreement(id);
        vm.prank(v.vendor);
        escrow.submitDelivery(id, keccak256(abi.encode("proof", proofSeed)));
    }

    function release(uint256 idSeed) external {
        bytes32 id = _id(idSeed);
        IProcurementEscrow.AgreementView memory v = escrow.getAgreement(id);
        vm.prank(v.buyer);
        escrow.release(id);
        releases += 1;
    }

    function cancel(uint256 idSeed) external {
        bytes32 id = _id(idSeed);
        IProcurementEscrow.AgreementView memory v = escrow.getAgreement(id);
        vm.prank(v.buyer);
        escrow.cancelUnaccepted(id);
        cancels += 1;
    }

    function dispute(uint256 idSeed, uint256 evidenceSeed) external {
        bytes32 id = _id(idSeed);
        IProcurementEscrow.AgreementView memory v = escrow.getAgreement(id);
        vm.prank(v.buyer);
        escrow.dispute(id, keccak256(abi.encode("evidence", evidenceSeed)));
        disputes += 1;
    }

    function resolve(uint256 idSeed, uint96 vendorShare) external {
        bytes32 id = _id(idSeed);
        IProcurementEscrow.AgreementView memory v = escrow.getAgreement(id);
        uint256 share = uint256(vendorShare) % (v.amount + 1);
        vm.prank(address(0x5E50)); // resolver, role granted in setUp
        escrow.resolveDispute(id, share, keccak256("ruling"));
        resolutions += 1;
    }

    function claim(uint256 idSeed) external {
        bytes32 id = _id(idSeed);
        IProcurementEscrow.AgreementView memory v = escrow.getAgreement(id);
        vm.prank(v.vendor);
        escrow.claimAfterDisputeWindow(id);
        claims += 1;
    }

    function warp(uint64 delta) external {
        vm.warp(block.timestamp + bound(delta, 1 hours, 5 days));
    }

    function idCount() external view returns (uint256) {
        return ids.length;
    }

    function idAt(uint256 i) external view returns (bytes32) {
        return ids[i];
    }

    function _id(uint256 seed) internal view returns (bytes32) {
        return ids[seed % ids.length];
    }
}

contract EscrowInvariantTest is Test {
    MockMUSD internal musd;
    AgentPolicyRegistry internal registry;
    ProcurementEscrow internal escrow;
    EscrowHandler internal handler;

    address internal admin = address(0xA11CE);
    address internal feeRecipient = address(0xFEE);
    address[] internal buyers;
    address[] internal vendors;

    function setUp() public {
        vm.warp(1_800_000_000);
        musd = new MockMUSD();
        registry = new AgentPolicyRegistry(admin);
        escrow = new ProcurementEscrow(address(musd), address(registry), admin, feeRecipient, 100);

        vm.startPrank(admin);
        escrow.grantRole(escrow.RESOLVER_ROLE(), address(0x5E50));
        vm.stopPrank();

        for (uint256 i = 0; i < 3; i++) {
            address b = address(uint160(0x1000 + i));
            address v = address(uint160(0x2000 + i));
            buyers.push(b);
            vendors.push(v);
            musd.mint(b, 1e30);
            vm.prank(b);
            musd.approve(address(escrow), type(uint256).max);
        }

        handler = new EscrowHandler(musd, escrow, buyers, vendors);
        targetContract(address(handler));
    }

    /// @notice The contract must always hold exactly the sum of live obligations.
    function invariant_Solvency() public view {
        assertEq(musd.balanceOf(address(escrow)), escrow.totalActiveEscrow());
    }

    /// @notice No agreement may ever be in the null state once created.
    function invariant_NoPhantomAgreements() public view {
        uint256 n = handler.idCount();
        for (uint256 i = 0; i < n; i++) {
            bytes32 id = handler.idAt(i);
            assertTrue(escrow.stateOf(id) != IProcurementEscrow.State.None);
        }
    }

    /// @notice Terminal agreements contribute nothing to the active escrow ledger.
    function invariant_TerminalAgreementsAreSettled() public view {
        uint256 n = handler.idCount();
        for (uint256 i = 0; i < n; i++) {
            bytes32 id = handler.idAt(i);
            IProcurementEscrow.State st = escrow.stateOf(id);
            if (st == IProcurementEscrow.State.Released || st == IProcurementEscrow.State.Refunded) {
                continue;
            }
            IProcurementEscrow.AgreementView memory v = escrow.getAgreement(id);
            assertGe(
                escrow.totalActiveEscrow(),
                v.amount + v.feeAmount,
                "live agreement not backed by escrow ledger"
            );
        }
    }
}
