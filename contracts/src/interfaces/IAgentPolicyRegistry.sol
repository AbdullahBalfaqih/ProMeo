// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IAgentPolicyRegistry
/// @notice On-chain mirror of the off-chain agent authorization state. The escrow
///         contract consults this registry on every fund-moving call so that a
///         revoked agent key cannot move buyer funds even if the backend is
///         compromised or its database is rolled back.
interface IAgentPolicyRegistry {
    enum Decision {
        ALLOW,
        DENY
    }

    /// @notice Emitted whenever an agent's authorization state is mutated.
    event AgentAuthorizationSet(
        bytes32 indexed orgId,
        address indexed agent,
        bool authorized,
        uint64 validUntil,
        bytes32 policyHash
    );

    /// @notice Emitted when an org freezes / unfreezes all of its agents at once.
    event OrgFrozen(bytes32 indexed orgId, bool frozen);

    error NotRegistryAdmin();
    error ZeroOrgId();
    error ZeroAgent();

    /// @notice Returns true only if the agent is explicitly authorized, not expired,
    ///         the org is not frozen, and the registry is not globally paused.
    function isAuthorized(bytes32 orgId, address agent) external view returns (bool);

    /// @notice Rich read used by the backend and by the SDK to explain a denial.
    function authorizationOf(bytes32 orgId, address agent)
        external
        view
        returns (bool authorized, uint64 validUntil, bytes32 policyHash, bool orgFrozen);
}
