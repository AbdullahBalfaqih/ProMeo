// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockMUSD} from "./mocks/MockMUSD.sol";
import {AgentPolicyRegistry} from "../src/AgentPolicyRegistry.sol";
import {ProcurementEscrow} from "../src/ProcurementEscrow.sol";
import {IProcurementEscrow} from "../src/interfaces/IProcurementEscrow.sol";

contract ProcurementEscrowTest is Test {
    MockMUSD internal musd;
    AgentPolicyRegistry internal registry;
    ProcurementEscrow internal escrow;

    address internal admin = address(0xA11CE);
    address internal feeRecipient = address(0xFEE);
    address internal buyer = address(0xB0B);
    address internal vendor = address(0xCA11);
    address internal agent = address(0xA9E17);
    address internal resolver = address(0x5E50);
    address internal stranger = address(0xBAD);

    bytes32 internal constant ORG = keccak256("org-acme");
    bytes32 internal constant ORG2 = keccak256("org-other");

    uint16 internal constant FEE_BPS = 100; // 1%
    uint256 internal constant AMOUNT = 1_000e18;

    function setUp() public {
        vm.warp(1_800_000_000);
        musd = new MockMUSD();
        registry = new AgentPolicyRegistry(admin);
        escrow = new ProcurementEscrow(address(musd), address(registry), admin, feeRecipient, FEE_BPS);

        vm.startPrank(admin);
        escrow.grantRole(escrow.RESOLVER_ROLE(), resolver);
        registry.setAgentAuthorization(ORG, agent, true, uint64(block.timestamp + 30 days), keccak256("policy-v1"));
        vm.stopPrank();

        musd.mint(buyer, 1e33); // test double only
        vm.prank(buyer);
        musd.approve(address(escrow), type(uint256).max);
    }

    function _params() internal view returns (ProcurementEscrow.CreateParams memory p) {
        p = ProcurementEscrow.CreateParams({
            orgId: ORG,
            requestId: keccak256("req-1"),
            offerHash: keccak256("offer-1"),
            termsHash: keccak256("terms-1"),
            vendor: vendor,
            amount: AMOUNT,
            acceptBy: uint64(block.timestamp + 2 days),
            deliverBy: uint64(block.timestamp + 10 days),
            disputeWindow: 3 days,
            nonce: 1,
            feeOnTop: true
        });
    }

    function _create() internal returns (bytes32 id) {
        ProcurementEscrow.CreateParams memory p = _params();
        vm.prank(buyer);
        id = escrow.createAgreement(buyer, p);
    }

    // ------------------------------------------------------------------
    // Happy path
    // ------------------------------------------------------------------

    function test_CreateFundsEscrowWithFeeOnTop() public {
        uint256 before = musd.balanceOf(buyer);
        bytes32 id = _create();
        uint256 fee = escrow.quoteFee(AMOUNT);

        assertEq(musd.balanceOf(buyer), before - AMOUNT - fee);
        assertEq(musd.balanceOf(address(escrow)), AMOUNT + fee);
        assertEq(escrow.totalActiveEscrow(), AMOUNT + fee);

        IProcurementEscrow.AgreementView memory v = escrow.getAgreement(id);
        assertEq(v.amount, AMOUNT);
        assertEq(v.feeAmount, fee);
        assertEq(uint8(v.state), uint8(IProcurementEscrow.State.Funded));
        assertEq(v.buyer, buyer);
        assertEq(v.vendor, vendor);
    }

    function test_DeterministicAgreementId() public {
        ProcurementEscrow.CreateParams memory p = _params();
        bytes32 expected = escrow.agreementIdFor(ORG, p.requestId, p.offerHash, p.nonce);
        vm.prank(buyer);
        bytes32 actual = escrow.createAgreement(buyer, p);
        assertEq(actual, expected);
    }

    function test_AcceptDeliverReleasePaysVendorAndFee() public {
        bytes32 id = _create();
        uint256 fee = escrow.quoteFee(AMOUNT);
        uint256 vendorBefore = musd.balanceOf(vendor);

        vm.prank(vendor);
        escrow.accept(id);
        assertEq(uint8(escrow.stateOf(id)), uint8(IProcurementEscrow.State.Accepted));

        vm.prank(vendor);
        escrow.submitDelivery(id, keccak256("proof-1"));
        assertEq(uint8(escrow.stateOf(id)), uint8(IProcurementEscrow.State.Delivered));
        assertEq(escrow.deliverableOf(id), keccak256("proof-1"));

        vm.prank(buyer);
        escrow.release(id);

        assertEq(uint8(escrow.stateOf(id)), uint8(IProcurementEscrow.State.Released));
        assertEq(musd.balanceOf(vendor), vendorBefore + AMOUNT);
        assertEq(musd.balanceOf(feeRecipient), fee);
        assertEq(musd.balanceOf(address(escrow)), 0);
        assertEq(escrow.totalActiveEscrow(), 0);
    }

    function test_AgentCanDriveBuyerSideWhenAuthorized() public {
        ProcurementEscrow.CreateParams memory p = _params();
        vm.prank(agent);
        bytes32 id = escrow.createAgreement(buyer, p);

        vm.prank(vendor);
        escrow.accept(id);
        vm.prank(vendor);
        escrow.submitDelivery(id, keccak256("proof"));

        uint256 vendorBefore = musd.balanceOf(vendor);
        vm.prank(agent);
        escrow.release(id);
        assertEq(musd.balanceOf(vendor), vendorBefore + AMOUNT);
    }

    function test_RevokedAgentCannotAct() public {
        ProcurementEscrow.CreateParams memory p = _params();
        vm.prank(agent);
        bytes32 id = escrow.createAgreement(buyer, p);

        vm.prank(admin);
        registry.setAgentAuthorization(ORG, agent, false, 0, bytes32(0));

        vm.prank(vendor);
        escrow.accept(id);
        vm.prank(vendor);
        escrow.submitDelivery(id, keccak256("proof"));

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(ProcurementEscrow.AgentNotAuthorized.selector, ORG, agent));
        escrow.release(id);

        // Buyer retains full control.
        vm.prank(buyer);
        escrow.release(id);
    }

    function test_AgentFromOtherOrgCannotAct() public {
        bytes32 id = _create();
        address agentOfOrg2 = address(0xA9E18);
        vm.prank(admin);
        registry.setAgentAuthorization(ORG2, agentOfOrg2, true, uint64(block.timestamp + 1 days), keccak256("p"));

        vm.prank(vendor);
        escrow.accept(id);
        vm.prank(vendor);
        escrow.submitDelivery(id, keccak256("proof"));

        vm.prank(agentOfOrg2);
        vm.expectRevert(abi.encodeWithSelector(ProcurementEscrow.AgentNotAuthorized.selector, ORG, agentOfOrg2));
        escrow.release(id);
    }

    function test_ExpiredAgentCannotAct() public {
        bytes32 id = _create();
        vm.prank(vendor);
        escrow.accept(id);
        vm.prank(vendor);
        escrow.submitDelivery(id, keccak256("proof"));

        vm.warp(block.timestamp + 31 days);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(ProcurementEscrow.AgentNotAuthorized.selector, ORG, agent));
        escrow.release(id);
    }

    function test_FrozenOrgBlocksAgentButNotBuyer() public {
        bytes32 id = _create();
        vm.prank(admin);
        registry.setOrgFrozen(ORG, true);

        vm.prank(vendor);
        escrow.accept(id);
        vm.prank(vendor);
        escrow.submitDelivery(id, keccak256("proof"));

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(ProcurementEscrow.AgentNotAuthorized.selector, ORG, agent));
        escrow.release(id);

        vm.prank(buyer);
        escrow.release(id);
    }

    // ------------------------------------------------------------------
    // Refund / cancel
    // ------------------------------------------------------------------

    function test_CancelBeforeAcceptRefundsFeeToo() public {
        bytes32 id = _create();
        uint256 before = musd.balanceOf(buyer);
        vm.prank(buyer);
        escrow.cancelUnaccepted(id);
        assertEq(musd.balanceOf(buyer), before + AMOUNT + escrow.quoteFee(AMOUNT));
        assertEq(uint8(escrow.stateOf(id)), uint8(IProcurementEscrow.State.Refunded));
        assertEq(escrow.totalActiveEscrow(), 0);
    }

    function test_CannotCancelAfterAccept() public {
        bytes32 id = _create();
        vm.prank(vendor);
        escrow.accept(id);
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProcurementEscrow.InvalidState.selector,
                id,
                IProcurementEscrow.State.Funded,
                IProcurementEscrow.State.Accepted
            )
        );
        escrow.cancelUnaccepted(id);
    }

    function test_CannotAcceptAfterDeadline() public {
        bytes32 id = _create();
        vm.warp(block.timestamp + 3 days);
        vm.prank(vendor);
        vm.expectRevert(abi.encodeWithSelector(ProcurementEscrow.DeadlinePassed.selector, id));
        escrow.accept(id);
    }

    function test_CannotDeliverAfterDeadline() public {
        bytes32 id = _create();
        vm.prank(vendor);
        escrow.accept(id);
        vm.warp(block.timestamp + 11 days);
        vm.prank(vendor);
        vm.expectRevert(abi.encodeWithSelector(ProcurementEscrow.DeadlinePassed.selector, id));
        escrow.submitDelivery(id, keccak256("late"));
    }

    // ------------------------------------------------------------------
    // Disputes
    // ------------------------------------------------------------------

    function test_DisputeAfterDeliveryWindowAndResolveSplit() public {
        bytes32 id = _create();
        vm.prank(vendor);
        escrow.accept(id);
        vm.prank(vendor);
        escrow.submitDelivery(id, keccak256("proof"));

        vm.prank(buyer);
        escrow.dispute(id, keccak256("evidence-not-as-described"));
        assertEq(uint8(escrow.stateOf(id)), uint8(IProcurementEscrow.State.Disputed));

        uint256 fee = escrow.quoteFee(AMOUNT);
        uint256 vendorBefore = musd.balanceOf(vendor);
        uint256 buyerBefore = musd.balanceOf(buyer);

        // 60% to vendor
        vm.prank(resolver);
        escrow.resolveDispute(id, (AMOUNT * 60) / 100, keccak256("ruling-1"));

        uint256 vendorPaid = (AMOUNT * 60) / 100;
        uint256 feePaid = (fee * vendorPaid) / AMOUNT;
        uint256 buyerPaid = (AMOUNT - vendorPaid) + (fee - feePaid);

        assertEq(musd.balanceOf(vendor), vendorBefore + vendorPaid);
        assertEq(musd.balanceOf(buyer), buyerBefore + buyerPaid);
        assertEq(musd.balanceOf(feeRecipient), feePaid);
        assertEq(musd.balanceOf(address(escrow)), 0);
        assertEq(escrow.totalActiveEscrow(), 0);
        assertEq(uint8(escrow.stateOf(id)), uint8(IProcurementEscrow.State.Released));
    }

    function test_CannotDisputeAfterWindowClosed() public {
        bytes32 id = _create();
        vm.prank(vendor);
        escrow.accept(id);
        vm.prank(vendor);
        escrow.submitDelivery(id, keccak256("proof"));
        vm.warp(block.timestamp + 4 days);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(ProcurementEscrow.DisputeWindowClosed.selector, id));
        escrow.dispute(id, keccak256("late"));
    }

    function test_OnlyPartyCanDispute() public {
        bytes32 id = _create();
        vm.prank(vendor);
        escrow.accept(id);
        vm.warp(block.timestamp + 11 days);
        vm.prank(stranger);
        vm.expectRevert(ProcurementEscrow.NotParty.selector);
        escrow.dispute(id, keccak256("x"));
    }

    function test_ResolverCannotOverpayVendor() public {
        bytes32 id = _create();
        vm.prank(vendor);
        escrow.accept(id);
        vm.prank(vendor);
        escrow.submitDelivery(id, keccak256("proof"));
        vm.prank(buyer);
        escrow.dispute(id, keccak256("ev"));
        vm.prank(resolver);
        vm.expectRevert(ProcurementEscrow.InvalidRuling.selector);
        escrow.resolveDispute(id, AMOUNT + 1, keccak256("r"));
    }

    function test_NonResolverCannotResolve() public {
        bytes32 id = _create();
        vm.prank(vendor);
        escrow.accept(id);
        vm.prank(vendor);
        escrow.submitDelivery(id, keccak256("proof"));
        vm.prank(buyer);
        escrow.dispute(id, keccak256("ev"));
        vm.prank(stranger);
        vm.expectRevert();
        escrow.resolveDispute(id, AMOUNT, keccak256("r"));
    }

    function test_VendorClaimsAfterSilentBuyer() public {
        bytes32 id = _create();
        vm.prank(vendor);
        escrow.accept(id);
        vm.prank(vendor);
        escrow.submitDelivery(id, keccak256("proof"));

        vm.prank(vendor);
        vm.expectRevert(abi.encodeWithSelector(ProcurementEscrow.DisputeWindowOpen.selector, id));
        escrow.claimAfterDisputeWindow(id);

        vm.warp(block.timestamp + 3 days + 1);
        uint256 before = musd.balanceOf(vendor);
        vm.prank(vendor);
        escrow.claimAfterDisputeWindow(id);
        assertEq(musd.balanceOf(vendor), before + AMOUNT);
    }

    // ------------------------------------------------------------------
    // Administration
    // ------------------------------------------------------------------

    function test_FeeCapEnforced() public {
        vm.prank(admin);
        vm.expectRevert(ProcurementEscrow.InvalidFee.selector);
        escrow.setFeeBps(501);
        vm.prank(admin);
        escrow.setFeeBps(500);
        assertEq(escrow.feeBps(), 500);
    }

    function test_PauseBlocksNewAgreementsButNotSettlement() public {
        bytes32 id = _create();
        vm.prank(vendor);
        escrow.accept(id);
        vm.prank(admin);
        escrow.pause();

        ProcurementEscrow.CreateParams memory p = _params();
        p.nonce = 2;
        vm.prank(buyer);
        vm.expectRevert();
        escrow.createAgreement(buyer, p);

        // Existing money can still move out.
        vm.prank(buyer);
        escrow.release(id);
        assertEq(uint8(escrow.stateOf(id)), uint8(IProcurementEscrow.State.Released));
    }

    function test_DuplicateAgreementRejected() public {
        ProcurementEscrow.CreateParams memory p = _params();
        vm.startPrank(buyer);
        escrow.createAgreement(buyer, p);
        vm.expectRevert();
        escrow.createAgreement(buyer, p);
        vm.stopPrank();
    }

    function test_RevertOnZeroAmount() public {
        ProcurementEscrow.CreateParams memory p = _params();
        p.amount = 0;
        vm.prank(buyer);
        vm.expectRevert(ProcurementEscrow.InvalidAmount.selector);
        escrow.createAgreement(buyer, p);
    }

    // ------------------------------------------------------------------
    // Fuzz
    // ------------------------------------------------------------------

    /// @dev Any fee at or below the cap must leave the contract solvent and pay the
    ///      vendor exactly `amount`, for arbitrary amounts.
    function testFuzz_ReleaseAlwaysPaysExactAmount(uint96 amount, uint16 feeBps) public {
        amount = uint96(bound(amount, 1, 1e27));
        feeBps = uint16(bound(feeBps, 0, 500));
        vm.prank(admin);
        escrow.setFeeBps(feeBps);

        ProcurementEscrow.CreateParams memory p = _params();
        p.amount = amount;
        p.nonce = uint256(keccak256(abi.encode(amount, feeBps)));
        vm.prank(buyer);
        bytes32 id = escrow.createAgreement(buyer, p);

        vm.prank(vendor);
        escrow.accept(id);
        vm.prank(vendor);
        escrow.submitDelivery(id, keccak256("proof"));

        uint256 vendorBefore = musd.balanceOf(vendor);
        uint256 feeBefore = musd.balanceOf(feeRecipient);
        vm.prank(buyer);
        escrow.release(id);

        uint256 expectedFee = (uint256(amount) * feeBps) / 10_000;
        assertEq(musd.balanceOf(vendor), vendorBefore + amount);
        assertEq(musd.balanceOf(feeRecipient), feeBefore + expectedFee);
        assertEq(escrow.totalActiveEscrow(), 0);
    }

    /// @dev Resolution never creates or destroys value for any split point.
    function testFuzz_ResolutionConservesValue(uint96 amount, uint96 vendorShare) public {
        amount = uint96(bound(amount, 1, 1e27));
        vendorShare = uint96(bound(vendorShare, 0, amount));

        ProcurementEscrow.CreateParams memory p = _params();
        p.amount = amount;
        p.nonce = uint256(keccak256(abi.encode("fuzz2", amount, vendorShare)));
        vm.prank(buyer);
        bytes32 id = escrow.createAgreement(buyer, p);
        vm.prank(vendor);
        escrow.accept(id);
        vm.prank(vendor);
        escrow.submitDelivery(id, keccak256("proof"));
        vm.prank(buyer);
        escrow.dispute(id, keccak256("ev"));

        uint256 totalBefore = musd.balanceOf(buyer) + musd.balanceOf(vendor) + musd.balanceOf(feeRecipient)
            + musd.balanceOf(address(escrow));
        vm.prank(resolver);
        escrow.resolveDispute(id, vendorShare, keccak256("r"));
        uint256 totalAfter = musd.balanceOf(buyer) + musd.balanceOf(vendor) + musd.balanceOf(feeRecipient)
            + musd.balanceOf(address(escrow));

        assertEq(totalAfter, totalBefore);
        assertEq(musd.balanceOf(address(escrow)), 0);
        assertEq(escrow.totalActiveEscrow(), 0);
    }
}
