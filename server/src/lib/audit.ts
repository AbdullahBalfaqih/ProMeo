import { desc, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { auditLog, organizations } from "../db/schema.js";
import { canonicalSha256 } from "./canonical.js";

type Tx = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface AuditEntry {
  orgId: string | null;
  actorType: "user" | "agent" | "system" | "resolver";
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Appends a tamper-evident audit record. Each row hashes the previous row's hash
 * for the same organization, so deleting or editing history is detectable by
 * replaying the chain (`GET /v1/audit/verify`).
 *
 * The org row is locked for the duration of the insert to serialize concurrent
 * appends and avoid forked chains.
 */
export async function appendAudit(tx: Tx, entry: AuditEntry): Promise<string> {
  let prevHash: string | null = null;

  if (entry.orgId) {
    await tx.execute(sql`SELECT id FROM organizations WHERE id = ${entry.orgId} FOR UPDATE`);
    const [prev] = await tx
      .select({ hash: auditLog.hash })
      .from(auditLog)
      .where(eq(auditLog.orgId, entry.orgId))
      .orderBy(desc(auditLog.seq))
      .limit(1);
    prevHash = prev?.hash ?? null;
  }

  const payload = {
    orgId: entry.orgId,
    actorType: entry.actorType,
    actorId: entry.actorId,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    metadata: entry.metadata ?? {},
    prevHash,
  };
  const hash = await canonicalSha256(payload);

  await tx.insert(auditLog).values({
    orgId: entry.orgId,
    actorType: entry.actorType,
    actorId: entry.actorId,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    metadata: entry.metadata ?? {},
    prevHash,
    hash,
  });

  // Touch the org row so the lock is held until commit.
  if (entry.orgId) {
    await tx.update(organizations).set({ updatedAt: new Date() }).where(eq(organizations.id, entry.orgId));
  }

  return hash;
}
