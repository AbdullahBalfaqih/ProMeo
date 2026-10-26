import { and, eq, isNull, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { Database } from "../db/client.js";
import { agentCredentials, agents, apiKeys, users } from "../db/schema.js";
import { unauthorized, forbidden } from "../lib/errors.js";
import { hashEquals, parseToken, sha256Hex } from "../lib/crypto.js";
import { USER_ROLE_PERMISSIONS, userCan, type Permission } from "./rbac.js";
import type { Principal } from "../types.js";

const TOUCH_INTERVAL_MS = 60_000;

export async function authenticate(db: Database, req: FastifyRequest): Promise<Principal> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw unauthorized("Missing bearer token");
  const token = header.slice("Bearer ".length).trim();
  const parsed = parseToken(token);
  if (!parsed) throw unauthorized("Malformed token");

  if (parsed.kind === "user") {
    const [row] = await db
      .select({
        keyId: apiKeys.id,
        orgId: apiKeys.orgId,
        userId: apiKeys.userId,
        secretHash: apiKeys.secretHash,
        scopes: apiKeys.scopes,
        revokedAt: apiKeys.revokedAt,
        expiresAt: apiKeys.expiresAt,
        lastUsedAt: apiKeys.lastUsedAt,
        role: users.role,
        userStatus: users.status,
      })
      .from(apiKeys)
      .innerJoin(users, eq(users.id, apiKeys.userId))
      .where(eq(apiKeys.prefix, parsed.prefix))
      .limit(1);

    if (!row) throw unauthorized("Invalid token");
    if (!hashEquals(sha256Hex(parsed.secret), row.secretHash)) throw unauthorized("Invalid token");
    if (row.revokedAt) throw unauthorized("Token revoked");
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) throw unauthorized("Token expired");
    if (row.userStatus !== "active") throw forbidden("User disabled");

    const rolePerms = USER_ROLE_PERMISSIONS[row.role] ?? new Set<Permission>();
    // A key may be further restricted; it can never exceed the role's permissions.
    const permissions = new Set<Permission>(
      row.scopes.length === 0
        ? rolePerms
        : [...rolePerms].filter((p) => row.scopes.includes(p)),
    );

    if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      await db
        .update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, row.keyId));
    }

    return {
      kind: "user",
      orgId: row.orgId,
      userId: row.userId,
      role: row.role,
      apiKeyId: row.keyId,
      permissions,
    };
  }

  const [row] = await db
    .select({
      credentialId: agentCredentials.id,
      orgId: agentCredentials.orgId,
      agentId: agentCredentials.agentId,
      secretHash: agentCredentials.secretHash,
      revokedAt: agentCredentials.revokedAt,
      expiresAt: agentCredentials.expiresAt,
      lastUsedAt: agentCredentials.lastUsedAt,
      status: agents.status,
      scopes: agents.scopes,
      trustLevel: agents.trustLevel,
      walletAddress: agents.walletAddress,
    })
    .from(agentCredentials)
    .innerJoin(agents, eq(agents.id, agentCredentials.agentId))
    .where(eq(agentCredentials.prefix, parsed.prefix))
    .limit(1);

  if (!row) throw unauthorized("Invalid token");
  if (!hashEquals(sha256Hex(parsed.secret), row.secretHash)) throw unauthorized("Invalid token");
  if (row.revokedAt) throw unauthorized("Credential revoked");
  if (row.expiresAt.getTime() <= Date.now()) throw unauthorized("Credential expired");
  if (row.status !== "active") throw forbidden("Agent is not active");

  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    await db
      .update(agentCredentials)
      .set({ lastUsedAt: new Date() })
      .where(eq(agentCredentials.id, row.credentialId));
  }

  return {
    kind: "agent",
    orgId: row.orgId,
    agentId: row.agentId,
    credentialId: row.credentialId,
    trustLevel: row.trustLevel,
    walletAddress: row.walletAddress,
    scopes: new Set(row.scopes),
  };
}

export function requireUser(principal: Principal | undefined): Extract<Principal, { kind: "user" }> {
  if (!principal) throw unauthorized();
  if (principal.kind !== "user") throw forbidden("This endpoint requires a user credential");
  return principal;
}

export function requirePermission(principal: Principal | undefined, permission: Permission): Principal {
  if (!principal) throw unauthorized();
  if (principal.kind === "user") {
    if (!userCan(principal.role, permission) || !principal.permissions.has(permission)) {
      throw forbidden(`Missing permission: ${permission}`);
    }
    return principal;
  }
  // Agent scopes use the same vocabulary for the subset they are allowed.
  if (!principal.scopes.has(permission)) {
    throw forbidden(`Agent scope missing: ${permission}`);
  }
  return principal;
}

export async function revokeAgentCredential(
  db: Database,
  orgId: string,
  agentId: string,
  credentialId: string,
): Promise<boolean> {
  const res = await db
    .update(agentCredentials)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(agentCredentials.id, credentialId),
        eq(agentCredentials.agentId, agentId),
        eq(agentCredentials.orgId, orgId),
        isNull(agentCredentials.revokedAt),
      ),
    )
    .returning({ id: agentCredentials.id });
  return res.length > 0;
}

export async function findActiveOrgApiKeys(db: Database, orgId: string) {
  return db
    .select({ id: apiKeys.id, prefix: apiKeys.prefix, name: apiKeys.name, createdAt: apiKeys.createdAt })
    .from(apiKeys)
    .where(and(eq(apiKeys.orgId, orgId), isNull(apiKeys.revokedAt), sql`true`));
}
