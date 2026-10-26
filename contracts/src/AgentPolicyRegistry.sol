// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IAgentPolicyRegistry} from "./interfaces/IAgentPolicyRegistry.sol";

/// @title AgentPolicyRegistry
/// @notice Authoritative, on-chain registry of which AI agents may move an
///         organization's escrowed funds. It is intentionally minimal: it stores a
///         boolean authorization plus an expiry and a hash of the policy document
///         that authorized the agent, so the off-chain policy engine can be audited
///         against an immutable anchor.
///
///         Design notes
///         ------------
///         * Keys are scoped per (orgId, agent). An agent authorized for org A has
///           NO authority over org B — tenant isolation is enforced at the contract
///           level, not only in the backend.
///         * `validUntil` is a hard expiry. The escrow reads `isAuthorized` at
///           execution time, so expiry takes effect without any transaction.
///         * `policyHash` is keccak256 of the canonical policy document version
///           that granted the agent. It lets a dispute reviewer prove which policy
///           was in force when funds moved.
///         * The registry can be paused globally (emergency brake) and each org can
///           be frozen independently (org-level kill switch).
///
///         Trust model: the registry admin is expected to be a multisig / timelocked
///         controller in production (see docs/CONTRACTS.md). It can authorize agents
///         but can never move escrowed funds.
contract AgentPolicyRegistry is IAgentPolicyRegistry, AccessControl, Pausable {
    bytes32 public constant REGISTRY_ADMIN_ROLE = keccak256("REGISTRY_ADMIN_ROLE");
    bytes32 public constant ORG_MANAGER_ROLE = keccak256("ORG_MANAGER_ROLE");

    struct Authorization {
        bool authorized;
        uint64 validUntil;
        bytes32 policyHash;
    }

    /// @dev orgId => agent => authorization
    mapping(bytes32 => mapping(address => Authorization)) private _authorizations;
    /// @dev orgId => frozen?
    mapping(bytes32 => bool) private _orgFrozen;

    /// @notice Number of currently authorized, unexpired agents per org (best-effort
    ///         counter used by dashboards; expiry may make it optimistic).
    mapping(bytes32 => uint32) public activeAgentCount;

    event RegistryAdminGranted(bytes32 indexed orgId, address indexed manager);
    event RegistryAdminRevoked(bytes32 indexed orgId, address indexed manager);

    error OrgIsFrozen(bytes32 orgId);
    error ExpiryInPast(uint64 validUntil);
    error PolicyHashRequired();

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAgent();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGISTRY_ADMIN_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // Admin surface
    // ---------------------------------------------------------------------

    /// @notice Authorize (or update) an agent for an organization.
    /// @param orgId Tenant identifier, keccak256 of the off-chain org UUID (or the
    ///        UUID bytes right-padded by the backend). Must be non-zero.
    /// @param agent Agent wallet address (a scoped hot key, never the org owner).
    /// @param authorized true to authorize, false to revoke.
    /// @param validUntil Unix timestamp after which authorization lapses. Ignored on revoke.
    /// @param policyHash keccak256 of the canonical authorized policy version.
    function setAgentAuthorization(
        bytes32 orgId,
        address agent,
        bool authorized,
        uint64 validUntil,
        bytes32 policyHash
    ) external onlyRole(REGISTRY_ADMIN_ROLE) whenNotPaused {
        if (orgId == bytes32(0)) revert ZeroOrgId();
        if (agent == address(0)) revert ZeroAgent();
        if (authorized && validUntil <= block.timestamp) revert ExpiryInPast(validUntil);
        if (authorized && policyHash == bytes32(0)) revert PolicyHashRequired();
        if (_orgFrozen[orgId]) revert OrgIsFrozen(orgId);

        Authorization storage a = _authorizations[orgId][agent];
        bool wasActive = _isActive(a);
        if (authorized) {
            a.authorized = true;
            a.validUntil = validUntil;
            a.policyHash = policyHash;
            if (!wasActive) activeAgentCount[orgId] += 1;
        } else {
            a.authorized = false;
            a.validUntil = 0;
            if (wasActive && activeAgentCount[orgId] > 0) activeAgentCount[orgId] -= 1;
        }

        emit AgentAuthorizationSet(orgId, agent, authorized, validUntil, policyHash);
    }

    /// @notice Freeze or unfreeze every agent of an organization at once. While
    ///         frozen, `isAuthorized` returns false for all agents of that org and
    ///         no new authorization can be written.
    function setOrgFrozen(bytes32 orgId, bool frozen) external onlyRole(REGISTRY_ADMIN_ROLE) {
        if (orgId == bytes32(0)) revert ZeroOrgId();
        _orgFrozen[orgId] = frozen;
        emit OrgFrozen(orgId, frozen);
    }

    /// @notice Grant a per-org manager the ability to authorize agents for that org.
    /// @dev    Scoped through a derived role so an org manager cannot touch another
    ///         tenant. The derived role is `keccak256(orgId, ORG_MANAGER_ROLE)`.
    function grantOrgManager(bytes32 orgId, address manager) external onlyRole(REGISTRY_ADMIN_ROLE) {
        if (orgId == bytes32(0)) revert ZeroOrgId();
        if (manager == address(0)) revert ZeroAgent();
        _grantRole(_orgManagerRole(orgId), manager);
        emit RegistryAdminGranted(orgId, manager);
    }

    /// @notice Revoke a per-org manager.
    function revokeOrgManager(bytes32 orgId, address manager) external onlyRole(REGISTRY_ADMIN_ROLE) {
        _revokeRole(_orgManagerRole(orgId), manager);
        emit RegistryAdminRevoked(orgId, manager);
    }

    /// @notice Org-scoped authorization, callable by that org's manager.
    ///         Mirrors `setAgentAuthorization` but cannot cross tenant boundaries.
    function setAgentAuthorizationByOrg(
        bytes32 orgId,
        address agent,
        bool authorized,
        uint64 validUntil,
        bytes32 policyHash
    ) external onlyRole(_orgManagerRole(orgId)) whenNotPaused {
        if (agent == address(0)) revert ZeroAgent();
        if (authorized && validUntil <= block.timestamp) revert ExpiryInPast(validUntil);
        if (authorized && policyHash == bytes32(0)) revert PolicyHashRequired();
        if (_orgFrozen[orgId]) revert OrgIsFrozen(orgId);

        Authorization storage a = _authorizations[orgId][agent];
        bool wasActive = _isActive(a);
        if (authorized) {
            a.authorized = true;
            a.validUntil = validUntil;
            a.policyHash = policyHash;
            if (!wasActive) activeAgentCount[orgId] += 1;
        } else {
            a.authorized = false;
            a.validUntil = 0;
            if (wasActive && activeAgentCount[orgId] > 0) activeAgentCount[orgId] -= 1;
        }
        emit AgentAuthorizationSet(orgId, agent, authorized, validUntil, policyHash);
    }

    function pause() external onlyRole(REGISTRY_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(REGISTRY_ADMIN_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------

    function isAuthorized(bytes32 orgId, address agent) public view returns (bool) {
        if (paused() || _orgFrozen[orgId]) return false;
        return _isActive(_authorizations[orgId][agent]);
    }

    function authorizationOf(bytes32 orgId, address agent)
        external
        view
        returns (bool authorized, uint64 validUntil, bytes32 policyHash, bool orgFrozen)
    {
        Authorization storage a = _authorizations[orgId][agent];
        authorized = isAuthorized(orgId, agent);
        validUntil = a.validUntil;
        policyHash = a.policyHash;
        orgFrozen = _orgFrozen[orgId];
    }

    function orgFrozen(bytes32 orgId) external view returns (bool) {
        return _orgFrozen[orgId];
    }

    /// @notice Role identifier for an org-scoped manager.
    function orgManagerRole(bytes32 orgId) external pure returns (bytes32) {
        return _orgManagerRole(orgId);
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _orgManagerRole(bytes32 orgId) internal pure returns (bytes32) {
        return keccak256(abi.encode("ORG_MANAGER_ROLE", orgId));
    }

    function _isActive(Authorization storage a) internal view returns (bool) {
        return a.authorized && a.validUntil > block.timestamp;
    }
}
