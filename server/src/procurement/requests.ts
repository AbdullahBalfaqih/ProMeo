import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  agreements,
  approvals,
  offers,
  procurementRequests,
  requestEvents,
  users,
  vendorServices,
  vendors,
} from "../db/schema.js";
import { appendAudit } from "../lib/audit.js";
import { canonicalSha256 } from "../lib/canonical.js";
import { conflict, forbidden, notFound, policyDenied, preconditionFailed } from "../lib/errors.js";
import { dbAmount } from "../lib/money.js";
import { getActivePolicy, recordEvaluation, type ActivePolicy } from "../policy/service.js";
import type { PolicyContext } from "../policy/engine.js";
import type { Principal } from "../types.js";
import { assertTransition, permissionForTransition, type RequestStatus } from "./state.js";
import type { OfferPayload } from "./offers.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface RequestRow {
  id: string;
  orgId: string;
  reference: string;
  title: string;
  description: string;
  category: string;
  requirements: Record<string, unknown>;
  budgetAmount: string;
  currency: string;
  status: RequestStatus;
  createdByUserId: string | null;
  createdByAgentId: string | null;
  deadlineAt: Date | null;
  version: number;
}

async function appendRequestEvent(
  tx: Tx,
  params: {
    orgId: string;
    requestId: string;
    fromStatus: RequestStatus | null;
    toStatus: RequestStatus;
    actor: Principal;
    reason?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const [prev] = await tx
    .select({ hash: requestEvents.hash })
    .from(requestEvents)
    .where(eq(requestEvents.requestId, params.requestId))
    .orderBy(desc(requestEvents.seq))
    .limit(1);

  const prevHash = prev?.hash ?? null;
  const body = {
    requestId: params.requestId,
    fromStatus: params.fromStatus,
    toStatus: params.toStatus,
    actorType: params.actor.kind,
    actorId: params.actor.kind === "user" ? params.actor.userId : params.actor.agentId,
    reason: params.reason ?? null,
    metadata: params.metadata ?? {},
    prevHash,
  };
  const hash = await canonicalSha256(body);

  await tx.insert(requestEvents).values({
    orgId: params.orgId,
    requestId: params.requestId,
    fromStatus: params.fromStatus,
    toStatus: params.toStatus,
    actorType: params.actor.kind,
    actorId: body.actorId,
    reason: params.reason,
    metadata: params.metadata ?? {},
    prevHash,
    hash,
  });
}

export async function createRequest(
  db: Database,
  principal: Principal,
  input: {
    reference?: string;
    title: string;
    description: string;
    category: string;
    requirements: Record<string, unknown>;
    budgetAmount: string;
    deadlineAt?: string | null;
  },
): Promise<RequestRow> {
  return db.transaction(async (tx) => {
    const orgId = principal.orgId;
    const reference = input.reference?.trim() || (await nextReference(tx, orgId));
    const [row] = await tx
      .insert(procurementRequests)
      .values({
        orgId,
        reference,
        title: input.title,
        description: input.description,
        category: input.category,
        requirements: input.requirements,
        budgetAmount: input.budgetAmount,
        currency: "MUSD",
        status: "draft",
        createdByUserId: principal.kind === "user" ? principal.userId : null,
        createdByAgentId: principal.kind === "agent" ? principal.agentId : null,
        deadlineAt: input.deadlineAt ? new Date(input.deadlineAt) : null,
      })
      .returning();

    if (!row) throw new Error("request insert failed");

    await appendRequestEvent(tx, {
      orgId,
      requestId: row.id,
      fromStatus: null,
      toStatus: "draft",
      actor: principal,
    });
    await appendAudit(tx, {
      orgId,
      actorType: principal.kind,
      actorId: principal.kind === "user" ? principal.userId : principal.agentId,
      action: "request.created",
      resourceType: "procurement_request",
      resourceId: row.id,
      metadata: { reference, budgetAmount: input.budgetAmount },
    });

    return row as unknown as RequestRow;
  });
}

async function nextReference(tx: Tx, orgId: string): Promise<string> {
  const [agg] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(procurementRequests)
    .where(eq(procurementRequests.orgId, orgId));
  const n = (agg?.count ?? 0) + 1;
  return `REQ-${new Date().getUTCFullYear()}-${String(n).padStart(5, "0")}`;
}

export async function getRequest(db: Database, orgId: string, requestId: string) {
  const [row] = await db
    .select()
    .from(procurementRequests)
    .where(and(eq(procurementRequests.id, requestId), eq(procurementRequests.orgId, orgId)))
    .limit(1);
  if (!row) throw notFound("Request not found");
  return row;
}

export async function listRequests(
  db: Database,
  orgId: string,
  filters: { status?: RequestStatus; limit: number; cursor?: string },
) {
  const conditions = [eq(procurementRequests.orgId, orgId)];
  if (filters.status) conditions.push(eq(procurementRequests.status, filters.status));
  if (filters.cursor) conditions.push(sql`${procurementRequests.createdAt} < ${filters.cursor}`);
  const rows = await db
    .select()
    .from(procurementRequests)
    .where(and(...conditions))
    .orderBy(desc(procurementRequests.createdAt))
    .limit(filters.limit + 1);
  const page = rows.slice(0, filters.limit);
  const next = rows.length > filters.limit ? page[page.length - 1]!.createdAt.toISOString() : null;
  return { data: page, nextCursor: next };
}

export async function publishRequest(db: Database, principal: Principal, requestId: string) {
  return db.transaction(async (tx) => {
    const row = await lockRequest(tx, principal.orgId, requestId);
    assertTransition(row.status as RequestStatus, "open");

    const [updated] = await tx
      .update(procurementRequests)
      .set({ status: "open", version: row.version + 1, updatedAt: new Date() })
      .where(eq(procurementRequests.id, requestId))
      .returning();
    if (!updated) throw new Error("request update failed");

    await appendRequestEvent(tx, {
      orgId: principal.orgId,
      requestId,
      fromStatus: row.status as RequestStatus,
      toStatus: "open",
      actor: principal,
    });
    await appendAudit(tx, {
      orgId: principal.orgId,
      actorType: principal.kind,
      actorId: actorId(principal),
      action: "request.published",
      resourceType: "procurement_request",
      resourceId: requestId,
    });
    return updated;
  });
}

export async function cancelRequest(db: Database, principal: Principal, requestId: string, reason: string) {
  return db.transaction(async (tx) => {
    const row = await lockRequest(tx, principal.orgId, requestId);
    assertTransition(row.status as RequestStatus, "cancelled");
    const [agreement] = await tx
      .select({ id: agreements.id, state: agreements.state })
      .from(agreements)
      .where(and(eq(agreements.requestId, requestId), eq(agreements.orgId, principal.orgId)))
      .limit(1);
    if (agreement && agreement.state !== "proposed") {
      throw conflict("Cannot cancel a request whose escrow is already funded");
    }

    const [updated] = await tx
      .update(procurementRequests)
      .set({ status: "cancelled", version: row.version + 1, updatedAt: new Date() })
      .where(eq(procurementRequests.id, requestId))
      .returning();
    if (!updated) throw new Error("request cancel failed");

    await appendRequestEvent(tx, {
      orgId: principal.orgId,
      requestId,
      fromStatus: row.status as RequestStatus,
      toStatus: "cancelled",
      actor: principal,
      reason,
    });
    await appendAudit(tx, {
      orgId: principal.orgId,
      actorType: principal.kind,
      actorId: actorId(principal),
      action: "request.cancelled",
      resourceType: "procurement_request",
      resourceId: requestId,
      metadata: { reason },
    });
    return updated;
  });
}

export async function listOffers(db: Database, orgId: string, requestId: string) {
  await getRequest(db, orgId, requestId);
  return db
    .select({
      offer: offers,
      vendorName: vendors.name,
      vendorVerified: vendors.verified,
      vendorTier: vendors.tier,
      vendorOrgId: vendors.orgId,
      serviceName: vendorServices.name,
      serviceCapabilities: vendorServices.capabilities,
    })
    .from(offers)
    .innerJoin(vendors, eq(vendors.id, offers.vendorId))
    .leftJoin(vendorServices, eq(vendorServices.id, offers.serviceId))
    .where(eq(offers.requestId, requestId))
    .orderBy(desc(offers.createdAt));
}

export async function submitOffer(
  db: Database,
  principal: Principal,
  requestId: string,
  input: {
    vendorId: string;
    serviceId?: string | null;
    priceAmount: string;
    deliveryDays: number;
    terms: Record<string, unknown>;
    notes?: string;
    expiresAt: string;
    offerHash: string;
    signature: string;
    signer: string;
    nonce: string;
    requestIdForHash?: string;
  },
) {
  return db.transaction(async (tx) => {
    // The vendor must belong to the caller's organization: cross-tenant writes are
    // impossible even though the request belongs to another tenant.
    const [vendor] = await tx
      .select()
      .from(vendors)
      .where(and(eq(vendors.id, input.vendorId), eq(vendors.orgId, principal.orgId)))
      .limit(1);
    if (!vendor) throw notFound("Vendor not found");

    const [request] = await tx
      .select()
      .from(procurementRequests)
      .where(eq(procurementRequests.id, requestId))
      .limit(1);
    if (!request || request.status !== "open") throw notFound("Open request not found");

    if (input.signer.toLowerCase() !== vendor.payoutAddress.toLowerCase()) {
      throw forbidden("Offer signer must be the vendor payout address");
    }

    const payload: OfferPayload = {
      requestId,
      vendorId: vendor.id,
      vendorWallet: vendor.payoutAddress,
      serviceId: input.serviceId ?? null,
      priceAmount: input.priceAmount,
      currency: "MUSD",
      deliveryDays: input.deliveryDays,
      terms: input.terms,
      expiresAt: new Date(input.expiresAt).toISOString(),
      nonce: input.nonce,
    };
    const { hashOffer } = await import("./offers.js");
    const expectedHash = hashOffer(payload);
    if (expectedHash.toLowerCase() !== input.offerHash.toLowerCase()) {
      throw preconditionFailed("Offer hash does not match the canonical payload", {
        expected: expectedHash,
      });
    }

    const [row] = await tx
      .insert(offers)
      .values({
        orgId: request.orgId,
        requestId,
        vendorId: vendor.id,
        serviceId: input.serviceId ?? null,
        priceAmount: input.priceAmount,
        currency: "MUSD",
        deliveryDays: input.deliveryDays,
        terms: input.terms,
        notes: input.notes,
        canonicalHash: expectedHash,
        signature: input.signature,
        signer: input.signer,
        status: "received",
        expiresAt: new Date(input.expiresAt),
      })
      .onConflictDoNothing()
      .returning();

    if (!row) throw conflict("An offer from this vendor already exists for this request");

    await appendAudit(tx, {
      orgId: request.orgId,
      actorType: principal.kind,
      actorId: actorId(principal),
      action: "offer.submitted",
      resourceType: "offer",
      resourceId: row.id,
      metadata: { vendorId: vendor.id, offerHash: expectedHash },
    });

    return row;
  });
}

/**
 * Award = select an offer and run the policy engine. The policy decision decides
 * whether the request becomes `approved` (automatic) or `pending_approval`.
 * Nothing moves on-chain at this step.
 */
export async function awardRequest(
  db: Database,
  principal: Principal,
  requestId: string,
  offerId: string,
) {
  const policy = await getActivePolicy(db, principal.orgId);
  if (!policy) throw preconditionFailed("No active policy; activate a policy before awarding");

  return db.transaction(async (tx) => {
    const row = await lockRequest(tx, principal.orgId, requestId);
    if (row.status !== "open") {
      throw conflict(`Request must be open to award (currently ${row.status})`);
    }

    const [offerRow] = await tx
      .select({ offer: offers, vendor: vendors })
      .from(offers)
      .innerJoin(vendors, eq(vendors.id, offers.vendorId))
      .where(and(eq(offers.id, offerId), eq(offers.requestId, requestId), eq(offers.orgId, principal.orgId)))
      .limit(1);

    if (!offerRow) throw notFound("Offer not found");
    if (offerRow.offer.status === "withdrawn" || offerRow.offer.expiresAt.getTime() <= Date.now()) {
      throw preconditionFailed("Offer is no longer valid");
    }
    if (offerRow.vendor.status !== "active") throw preconditionFailed("Vendor is not active");

    const countRows = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(offers)
      .where(eq(offers.requestId, requestId));
    const count = countRows[0]?.count ?? 0;

    const ctx = buildPolicyContext({
      request: row,
      amount: offerRow.offer.priceAmount,
      vendor: offerRow.vendor,
      agentId: row.createdByAgentId,
      principal,
      offerCount: count,
    });

    const contextHash = await canonicalSha256(ctx as unknown as Record<string, unknown>);
    const evaluation = await recordEvaluation(tx as unknown as Database, {
      orgId: principal.orgId,
      requestId,
      policy,
      context: ctx,
      contextHash,
      agentId: principal.kind === "agent" ? principal.agentId : undefined,
    });

    // Persist the policy snapshot on the request.
    await tx
      .update(procurementRequests)
      .set({
        policyId: policy.id,
        policyVersion: policy.version,
        policyDecision: evaluation.decision,
        updatedAt: new Date(),
      })
      .where(eq(procurementRequests.id, requestId));

    if (evaluation.decision === "DENY") {
      throw policyDenied("Policy denied this award", {
        decision: evaluation.decision,
        matchedRules: evaluation.matchedRules,
        policyVersion: policy.version,
      });
    }

    const nextStatus: RequestStatus =
      evaluation.decision === "REQUIRE_HUMAN_APPROVAL" ? "pending_approval" : "approved";
    assertTransition(row.status as RequestStatus, nextStatus);

    const [updated] = await tx
      .update(procurementRequests)
      .set({ status: nextStatus, version: row.version + 1, updatedAt: new Date() })
      .where(eq(procurementRequests.id, requestId))
      .returning();

    if (nextStatus === "pending_approval") {
      const ttl = evaluation.approvalTtlMinutes || 1440;
      await tx.insert(approvals).values({
        orgId: principal.orgId,
        requestId,
        offerId,
        requiredRole: (evaluation.requiredRoles[0] ?? "approver") as "approver",
        status: "pending",
        policyId: policy.id,
        policyVersion: policy.version,
        requestedBy: actorId(principal),
        expiresAt: new Date(Date.now() + ttl * 60_000),
      });
    }

    await tx
      .update(offers)
      .set({ status: "accepted", rankScore: null, updatedAt: new Date() })
      .where(eq(offers.id, offerId));
    await tx
      .update(offers)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(and(eq(offers.requestId, requestId), sql`${offers.id} <> ${offerId}`));

    await appendRequestEvent(tx, {
      orgId: principal.orgId,
      requestId,
      fromStatus: row.status as RequestStatus,
      toStatus: nextStatus,
      actor: principal,
      metadata: { offerId, policyDecision: evaluation.decision, policyVersion: policy.version },
    });
    await appendAudit(tx, {
      orgId: principal.orgId,
      actorType: principal.kind,
      actorId: actorId(principal),
      action: "request.awarded",
      resourceType: "procurement_request",
      resourceId: requestId,
      metadata: { offerId, decision: evaluation.decision },
    });

    return { request: updated, evaluation, policyVersion: policy.version };
  });
}

export async function decideApproval(
  db: Database,
  principal: Principal,
  approvalId: string,
  decision: "approved" | "rejected",
  note?: string,
) {
  if (principal.kind !== "user") throw forbidden("Agents cannot approve procurement");
  return db.transaction(async (tx) => {
    const [approval] = await tx
      .select()
      .from(approvals)
      .where(and(eq(approvals.id, approvalId), eq(approvals.orgId, principal.orgId)))
      .limit(1);
    if (!approval) throw notFound("Approval not found");
    if (approval.status !== "pending") throw conflict("Approval already decided");
    if (approval.expiresAt.getTime() <= Date.now()) throw conflict("Approval request expired");
    if (approval.requestedBy === actorId(principal)) {
      throw forbidden("The requester cannot approve their own request");
    }

    const [user] = await tx
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, principal.userId))
      .limit(1);
    if (!user || user.role !== approval.requiredRole) {
      throw forbidden(`This approval requires role ${approval.requiredRole}`);
    }

    const row = await lockRequest(tx, principal.orgId, approval.requestId);
    if (row.status !== "pending_approval") throw conflict(`Request is ${row.status}`);

    const next: RequestStatus = decision === "approved" ? "approved" : "rejected";
    assertTransition(row.status as RequestStatus, next);

    const now = new Date();
    await tx
      .update(approvals)
      .set({ status: decision, decidedByUserId: principal.userId, decisionNote: note, decidedAt: now })
      .where(eq(approvals.id, approvalId));

    const [updated] = await tx
      .update(procurementRequests)
      .set({ status: next, version: row.version + 1, updatedAt: now })
      .where(eq(procurementRequests.id, approval.requestId))
      .returning();

    await appendRequestEvent(tx, {
      orgId: principal.orgId,
      requestId: approval.requestId,
      fromStatus: row.status as RequestStatus,
      toStatus: next,
      actor: principal,
      reason: note,
    });
    await appendAudit(tx, {
      orgId: principal.orgId,
      actorType: "user",
      actorId: principal.userId,
      action: `approval.${decision}`,
      resourceType: "approval",
      resourceId: approvalId,
      metadata: { requestId: approval.requestId, note },
    });

    return { request: updated, approvalId };
  });
}

export function buildPolicyContext(params: {
  request: { category: string; budgetAmount: string };
  amount: string;
  vendor: { id: string; verified: boolean; tier: number } | null;
  agentId: string | null;
  principal: Principal;
  offerCount: number;
  now?: Date;
}): PolicyContext {
  const now = params.now ?? new Date();
  const trustLevel =
    params.principal.kind === "agent" ? params.principal.trustLevel : 5; // humans are fully trusted
  const agentId = params.principal.kind === "agent" ? params.principal.agentId : (params.agentId ?? params.principal.userId);
  return {
    amount: params.amount,
    currency: "MUSD",
    category: params.request.category,
    budgetAmount: params.request.budgetAmount,
    agent: { id: agentId, trustLevel },
    vendor: params.vendor
      ? { id: params.vendor.id, verified: params.vendor.verified, tier: params.vendor.tier }
      : null,
    request: { offerCount: params.offerCount },
    time: { hourUtc: now.getUTCHours(), dayOfWeekUtc: now.getUTCDay() },
  };
}

async function lockRequest(tx: Tx, orgId: string, requestId: string) {
  const [row] = await tx
    .select()
    .from(procurementRequests)
    .where(and(eq(procurementRequests.id, requestId), eq(procurementRequests.orgId, orgId)))
    .for("update");
  if (!row) throw notFound("Request not found");
  return row;
}

export function actorId(principal: Principal): string {
  return principal.kind === "user" ? principal.userId : principal.agentId;
}

export function permissionForNextStatus(status: RequestStatus) {
  return permissionForTransition(status);
}

export { dbAmount, asc };
