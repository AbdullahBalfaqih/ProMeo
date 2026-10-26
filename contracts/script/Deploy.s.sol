// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {AgentPolicyRegistry} from "../src/AgentPolicyRegistry.sol";
import {ProcurementEscrow} from "../src/ProcurementEscrow.sol";

/// @notice Deploys the Agent Procurement Network contracts.
///
/// Required environment variables:
///   MUSD_ADDRESS      Real MUSD token for the target chain. NEVER hardcoded —
///                     the deployer must pass the address they verified against
///                     https://mezo.org/docs/users/resources/contracts-reference/.
///   REGISTRY_ADMIN    Multisig / timelock that will own both contracts.
///   FEE_RECIPIENT     Treasury address receiving protocol fees.
///   FEE_BPS           Initial fee in basis points, 0..500.
///   ESCROW_ADMIN      Optional; defaults to REGISTRY_ADMIN. Operational admin for
///                     the escrow (pause + resolver role grants).
///
/// Usage (dry run against a local anvil):
///   forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
///
/// The script enforces chain-id sanity: set EXPECTED_CHAIN_ID to refuse deploying
/// onto a network you did not intend (e.g. mainnet by accident).
contract Deploy is Script {
    function run() external returns (address registryAddr, address escrowAddr) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address musd = vm.envAddress("MUSD_ADDRESS");
        address registryAdmin = vm.envAddress("REGISTRY_ADMIN");
        address escrowAdmin = vm.envOr("ESCROW_ADMIN", registryAdmin);
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        uint16 feeBps = uint16(vm.envUint("FEE_BPS"));

        string memory network = vm.envString("NETWORK"); // e.g. "local-anvil", "mezo-testnet"
        bool testDouble = vm.envOr("TEST_DOUBLE_MUSD", false);
        uint256 expected = vm.envOr("EXPECTED_CHAIN_ID", uint256(0));
        if (expected != 0 && block.chainid != expected) {
            revert(string.concat("chain id mismatch: got ", vm.toString(block.chainid)));
        }

        console.log("chainId       :", block.chainid);
        console.log("MUSD          :", musd);
        console.log("registryAdmin :", registryAdmin);
        console.log("escrowAdmin   :", escrowAdmin);

        vm.startBroadcast(pk);

        AgentPolicyRegistry registry = new AgentPolicyRegistry(registryAdmin);
        ProcurementEscrow escrow =
            new ProcurementEscrow(musd, address(registry), escrowAdmin, feeRecipient, feeBps);

        vm.stopBroadcast();

        registryAddr = address(registry);
        escrowAddr = address(escrow);

        console.log("AgentPolicyRegistry:", registryAddr);
        console.log("ProcurementEscrow  :", escrowAddr);

        _writeDeployment(registryAddr, escrowAddr, musd, registryAdmin, feeRecipient, feeBps, network, testDouble);
    }

    function _writeDeployment(
        address registry,
        address escrow,
        address musd,
        address admin_,
        address feeRecipient,
        uint16 feeBps,
        string memory network,
        bool testDouble
    ) internal {
        string memory obj = "deployment";
        vm.serializeString(obj, "network", network);
        vm.serializeBool(obj, "testDoubleMUSD", testDouble);
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "musd", musd);
        vm.serializeAddress(obj, "agentPolicyRegistry", registry);
        vm.serializeAddress(obj, "procurementEscrow", escrow);
        vm.serializeAddress(obj, "registryAdmin", admin_);
        vm.serializeAddress(obj, "feeRecipient", feeRecipient);
        vm.serializeUint(obj, "feeBps", feeBps);
        vm.serializeUint(obj, "deployedAt", block.timestamp);
        string memory json = vm.serializeUint(obj, "blockNumber", block.number);

        string memory path = string.concat("deployments/", network, "-", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console.log("wrote", path);
    }
}
