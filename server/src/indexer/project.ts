import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { agreements, disputes, procurementRequests } from "../db/schema.js";
import { captureReservations } from "../agents/budgets.js";
import { canonicalSha256 } from "../lib/canonical.js";
import type { DecodedEscrowEvent } from "../escrow/client.js";
import { enqueueEvent } from "../webhooks/service.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const STATE_FOR_EVENT: Record<string, string> = {
  AgreementCreated: "funded",
  AgreementAccepted: "accepted",
  DeliverySubmitted: "delivered",
  AgreementReleased: "released",
  AgreementRefunded: "refunded",
  AgreementDisputed: "disputed",
  DisputeResolved: "released",
  AgreementCancelled: "cancelled",
};

/** Events may only move the projection forward. */
const ALLOWED_FROM: Record<string, string[]> = {
  AgreementCreated: ["proposed", "funded"],
  AgreementAccepted: ["funded", "accepted"],
  DeliverySubmitted: ["accepted", "delivered"],
  AgreementReleased: ["accepted", "delivered", "disputed", "released"],
  AgreementRefunded: ["funded", "refunded"],
  AgreementDisputed: ["funded", "accepted", "delivered", "disputed"],
  DisputeResolved: ["disputed", "released"],
  AgreementCancelled: ["proposed", "cancelled"],
};

export interface ProjectionResult {
  known: boolean;
  agreementId: string | null;
  applied: boolean;
  reason?: string;
}

/**
 * Applies one decoded escrow event to the Postgres projection. Idempotent: the
 * event row itself is deduplicated by (chainId, txHash, logIndex) and state moves
 * are guarded so replaying a range is safe.
 */
export async function projectEscrowEvent(
  tx: Tx,
  params: { chainId: number; contract: string; event: DecodedEscrowEvent },
): Promise<ProjectionResult> {
  const { event } = params;
  const onchainId = event.agreementId.toLowerCase();

  const [agreement] = await tx
    .select()
    .from(agreements)
    .where(and(eq(agreements.onchainId, onchainId), eq(agreements.chainId, params.chainId)))
    .limit(1);

  if (!agreement) {
    // Not one of ours: stored for forensics by the caller, never projected.
    return { known: false, agreementId: null, applied: false, reason: "unknown_agreement" };
  }

  const next = STATE_FOR_EVENT[event.eventName];
  if (!next) return { known: true, agreementId: agreement.id, applied: false, reason: "unmapped_event" };

  const allowed = ALLOWED_FROM[event.eventName] ?? [];
  if (!allowed.includes(agreement.state)) {
    return {
      known: true,
      agreementId: agreement.id,
      applied: false,
      reason: `illegal_transition:${agreement.state}->${next}`,
    };
  }

  const now = new Date();
  const patch: Record<string, unknown> = {
    state: next,
    lastEventBlock: Number(event.blockNumber),
    lastEventLogIndex: event.logIndex,
    updatedAt: now,
  };

  if (event.eventName === "AgreementCreated") {
    patch.fundingTxHash = event.txHash;
    patch.fundingBlock = Number(event.blockNumber);
  }
  if (event.eventName === "AgreementAccepted") patch.acceptedAt = new Date(Number(event.args.acceptedAt) * 1000);
  if (event.eventName === "DeliverySubmitted") patch.deliveredAt = now;
  if (event.eventName === "AgreementReleased" || event.eventName === "DisputeResolved") patch.releasedAt = now;

  await tx.update(agreements).set(patch).where(eq(agreements.id, agreement.id));

  if (event.eventName === "AgreementCreated") {
    await tx
      .update(procurementRequests)
      .set({ status: "awarded", updatedAt: now })
      .where(and(eq(procurementRequests.id, agreement.requestId), eq(procurementRequests.status, "approved")));
    if (agreement.budgetReservationIds.length > 0) {
      await captureReservations(tx, agreement.budgetReservationIds);
    }
  }

  if (event.eventName === "AgreementReleased" || event.eventName === "DisputeResolved") {
    await tx
      .update(procurementRequests)
      .set({ status: "completed", updatedAt: now })
      .where(eq(procurementRequests.id, agreement.requestId));
  }

  if (event.eventName === "AgreementRefunded") {
    await tx
      .update(procurementRequests)
      .set({ status: "cancelled", updatedAt: now })
      .where(eq(procurementRequests.id, agreement.requestId));
  }

  if (event.eventName === "AgreementDisputed") {
    const [existing] = await tx
      .select({ id: disputes.id })
      .from(disputes)
      .where(and(eq(disputes.agreementId, agreement.id), sql`${disputes.status} <> 'resolved'`))
      .limit(1);
    if (!existing) {
      const evidence = {
        source: "onchain",
        initiator: String(event.args.initiator ?? ""),
        evidenceHash: String(event.args.evidenceHash ?? ""),
        txHash: event.txHash,
      };
      const [created] = await tx
        .insert(disputes)
        .values({
          orgId: agreement.orgId,
          agreementId: agreement.id,
          openedBy: "onchain",
          reason: "On-chain dispute opened directly",
          evidence,
          status: "open",
        })
        .returning({ id: disputes.id });
      await tx
        .update(agreements)
        .set({ disputeId: created?.id ?? null })
        .where(eq(agreements.id, agreement.id));
    }
  }

  if (event.eventName === "DisputeResolved") {
    await tx
      .update(disputes)
      .set({
        status: "resolved",
        vendorShare: String(event.args.vendorAmount ?? "0"),
        rulingHash: String(event.args.rulingHash ?? ""),
        resolutionTxHash: event.txHash,
        resolvedAt: now,
        updatedAt: now,
      })
      .where(and(eq(disputes.agreementId, agreement.id), sql`${disputes.status} <> 'resolved'`));
  }

  const eventType = webhookTypeFor(event.eventName);
  if (eventType) {
    const requestRows = await tx
      .select({ id: procurementRequests.id })
      .from(procurementRequests)
      .where(eq(procurementRequests.id, agreement.requestId))
      .limit(1);
    const requestId = requestRows[0]?.id;
    await enqueueEvent(
      tx,
      agreement.orgId,
      eventType,
      {
        agreementId: agreement.id,
        onchainId,
        requestId: requestId ?? agreement.requestId,
        state: next,
        txHash: event.txHash,
        blockNumber: Number(event.blockNumber),
        ...pickAmounts(event),
      },
      { sourceKey: `${params.chainId}:${event.txHash}:${event.logIndex}:${event.eventName}` },
    );
  }

  return { known: true, agreementId: agreement.id, applied: true };
}

function webhookTypeFor(eventName: string): string | null {
  switch (eventName) {
    case "AgreementCreated":
      return "agreement.funded";
    case "AgreementAccepted":
      return "agreement.accepted";
    case "DeliverySubmitted":
      return "agreement.delivered";
    case "AgreementReleased":
      return "agreement.released";
    case "AgreementRefunded":
      return "agreement.refunded";
    case "AgreementDisputed":
      return "agreement.disputed";
    case "DisputeResolved":
      return "dispute.resolved";
    default:
      return null;
  }
}

function pickAmounts(event: DecodedEscrowEvent): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ["vendorAmount", "feeAmount", "amount", "buyerAmount"]) {
    if (event.args[key] !== undefined) out[key] = String(event.args[key]);
  }
  return out;
}

/** JSON-safe copy of decoded args (bigint -> decimal string). */
export function jsonSafe(value: unknown): Record<string, unknown> {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): unknown => {
    if (typeof v === "bigint") return v.toString();
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v as object)) throw new Error("cyclic args");
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(walk);
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = walk(val);
    return out;
  };
  return walk(value) as Record<string, unknown>;
}

export async function hashEvidence(evidence: Record<string, unknown>): Promise<string> {
  return canonicalSha256(evidence);
}
