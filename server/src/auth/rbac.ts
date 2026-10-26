/**
 * Role-based access control for humans and scope-based access control for agents.
 * Deny by default: any permission not listed for the role is refused.
 */

export type Permission =
  | "org:read"
  | "org:manage"
  | "user:manage"
  | "apikey:manage"
  | "agent:manage"
  | "policy:read"
  | "policy:write"
  | "request:read"
  | "request:create"
  | "request:update"
  | "request:publish"
  | "request:cancel"
  | "request:award"
  | "request:approve"
  | "offer:read"
  | "offer:discover"
  | "offer:submit"
  | "vendor:read"
  | "vendor:manage"
  | "agreement:read"
  | "agreement:fund_intent"
  | "agreement:release_intent"
  | "agreement:cancel_intent"
  | "dispute:read"
  | "dispute:open"
  | "dispute:resolve"
  | "webhook:read"
  | "webhook:manage"
  | "audit:read"
  | "budget:read"
  | "budget:manage";

export const USER_ROLE_PERMISSIONS: Record<string, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([
    "org:read",
    "org:manage",
    "user:manage",
    "apikey:manage",
    "agent:manage",
    "policy:read",
    "policy:write",
    "request:read",
    "request:create",
    "request:update",
    "request:publish",
    "request:cancel",
    "request:award",
    "request:approve",
    "offer:read",
    "offer:discover",
    "offer:submit",
    "vendor:read",
    "vendor:manage",
    "agreement:read",
    "agreement:fund_intent",
    "agreement:release_intent",
    "agreement:cancel_intent",
    "dispute:read",
    "dispute:open",
    "dispute:resolve",
    "webhook:read",
    "webhook:manage",
    "audit:read",
    "budget:read",
    "budget:manage",
  ]),
  admin: new Set<Permission>([
    "org:read",
    "org:manage",
    "user:manage",
    "apikey:manage",
    "agent:manage",
    "policy:read",
    "policy:write",
    "request:read",
    "request:create",
    "request:update",
    "request:publish",
    "request:cancel",
    "request:award",
    "request:approve",
    "offer:read",
    "offer:discover",
    "offer:submit",
    "vendor:read",
    "vendor:manage",
    "agreement:read",
    "agreement:fund_intent",
    "agreement:release_intent",
    "agreement:cancel_intent",
    "dispute:read",
    "dispute:open",
    "webhook:read",
    "webhook:manage",
    "audit:read",
    "budget:read",
    "budget:manage",
  ]),
  procurement_manager: new Set<Permission>([
    "org:read",
    "agent:manage",
    "policy:read",
    "request:read",
    "request:create",
    "request:update",
    "request:publish",
    "request:cancel",
    "request:award",
    "offer:read",
    "offer:discover",
    "offer:submit",
    "vendor:read",
    "vendor:manage",
    "agreement:read",
    "agreement:fund_intent",
    "agreement:release_intent",
    "agreement:cancel_intent",
    "dispute:read",
    "dispute:open",
    "budget:read",
    "audit:read",
  ]),
  approver: new Set<Permission>([
    "org:read",
    "policy:read",
    "request:read",
    "request:approve",
    "offer:read",
    "offer:discover",
    "agreement:read",
    "dispute:read",
    "audit:read",
  ]),
  finance: new Set<Permission>([
    "org:read",
    "policy:read",
    "request:read",
    "offer:read",
    "agreement:read",
    "agreement:fund_intent",
    "agreement:release_intent",
    "agreement:cancel_intent",
    "dispute:read",
    "dispute:open",
    "budget:read",
    "audit:read",
  ]),
  auditor: new Set<Permission>([
    "org:read",
    "policy:read",
    "request:read",
    "offer:read",
    "vendor:read",
    "agreement:read",
    "dispute:read",
    "webhook:read",
    "audit:read",
    "budget:read",
  ]),
  viewer: new Set<Permission>(["org:read", "request:read", "offer:read", "agreement:read", "dispute:read"]),
};

/**
 * Agent scopes are deliberately narrower than user permissions. An agent can
 * never approve its own spend, change policy, manage other agents, or resolve a
 * dispute. `agreement:fund_intent` only yields an unsigned transaction that a
 * human-controlled wallet still has to sign, unless the agent wallet itself is
 * authorized on-chain.
 */
export const AGENT_SCOPES = [
  "request:read",
  "request:create",
  "offer:read",
  "offer:discover",
  "agreement:read",
  "agreement:fund_intent",
  "budget:read",
] as const;

export type AgentScope = (typeof AGENT_SCOPES)[number];

export function isAgentScope(s: string): s is AgentScope {
  return (AGENT_SCOPES as readonly string[]).includes(s);
}

export function userCan(role: string, permission: Permission): boolean {
  return USER_ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function assertUserCan(role: string, permission: Permission): void {
  if (!userCan(role, permission)) {
    throw new Error(`role ${role} lacks ${permission}`);
  }
}
