import { and, desc, eq, max } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { policies, policyEvaluations } from "../db/schema.js";
import { evaluatePolicy, policyHashOf, validatePolicyDocument, type PolicyContext, type PolicyDocument } from "./engine.js";
import { conflict, notFound } from "../lib/errors.js";

export interface ActivePolicy {
  id: string;
  orgId: string;
  version: number;
  hash: string;
  document: PolicyDocument;
}

export async function getActivePolicy(db: Database, orgId: string): Promise<ActivePolicy | null> {
  const [row] = await db
    .select()
    .from(policies)
    .where(and(eq(policies.orgId, orgId), eq(policies.status, "active")))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.orgId,
    version: row.version,
    hash: row.documentHash,
    document: row.document as unknown as PolicyDocument,
  };
}

export async function listPolicies(db: Database, orgId: string) {
  return db
    .select({
      id: policies.id,
      version: policies.version,
      status: policies.status,
      hash: policies.documentHash,
      name: policies.document,
      activatedAt: policies.activatedAt,
      createdAt: policies.createdAt,
    })
    .from(policies)
    .where(eq(policies.orgId, orgId))
    .orderBy(desc(policies.version));
}

/**
 * Creates a new draft version. Versions are per-org monotonic and immutable once
 * active; editing means creating a new version, which keeps every evaluation
 * point-in-time reproducible.
 */
export async function createPolicyVersion(
  db: Database,
  orgId: string,
  document: unknown,
  userId: string,
): Promise<{ id: string; version: number; hash: string }> {
  const doc = validatePolicyDocument(document);
  const hash = policyHashOf(doc);
  return db.transaction(async (tx) => {
    const [agg] = await tx
      .select({ v: max(policies.version) })
      .from(policies)
      .where(eq(policies.orgId, orgId));
    const version = (agg?.v ?? 0) + 1;
    const [row] = await tx
      .insert(policies)
      .values({
        orgId,
        version,
        status: "draft",
        document: doc as unknown as Record<string, unknown>,
        documentHash: hash,
        createdByUserId: userId,
      })
      .returning({ id: policies.id, version: policies.version, hash: policies.documentHash });
    if (!row) throw new Error("policy insert failed");
    return row;
  });
}

/** Atomically makes one version active and archives the previous one. */
export async function activatePolicy(
  db: Database,
  orgId: string,
  policyId: string,
  userId: string,
): Promise<ActivePolicy> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(policies)
      .where(and(eq(policies.id, policyId), eq(policies.orgId, orgId)))
      .limit(1);
    if (!target) throw notFound("Policy not found");
    if (target.status === "active") {
      return {
        id: target.id,
        orgId: target.orgId,
        version: target.version,
        hash: target.documentHash,
        document: target.document as unknown as PolicyDocument,
      };
    }
    if (target.status === "archived") throw conflict("Cannot re-activate an archived policy; create a new version");

    const now = new Date();
    await tx
      .update(policies)
      .set({ status: "archived", archivedAt: now, updatedAt: now })
      .where(and(eq(policies.orgId, orgId), eq(policies.status, "active")));

    const [activated] = await tx
      .update(policies)
      .set({ status: "active", activatedAt: now, updatedAt: now })
      .where(eq(policies.id, policyId))
      .returning();

    if (!activated) throw conflict("Policy activation failed");
    return {
      id: activated.id,
      orgId: activated.orgId,
      version: activated.version,
      hash: activated.documentHash,
      document: activated.document as unknown as PolicyDocument,
    };
  });
}

export async function recordEvaluation(
  db: Database,
  params: {
    orgId: string;
    requestId?: string;
    policy: ActivePolicy;
    context: PolicyContext;
    contextHash: string;
    agentId?: string;
  },
) {
  const evaluation = evaluatePolicy(params.policy.document, params.policy.version, params.policy.hash, params.context);
  await db.insert(policyEvaluations).values({
    orgId: params.orgId,
    requestId: params.requestId,
    policyId: params.policy.id,
    policyVersion: params.policy.version,
    policyHash: params.policy.hash,
    decision: evaluation.decision,
    reasons: evaluation.matchedRules,
    context: params.context as unknown as Record<string, unknown>,
    contextHash: params.contextHash,
    evaluatedByAgentId: params.agentId,
  });
  return evaluation;
}
