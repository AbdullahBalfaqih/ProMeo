import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Hex } from "viem";
import type { Database } from "../db/client.js";
import type { Config } from "../config.js";
import { agreements, chainEvents, disputes, indexerCursors } from "../db/schema.js";
import { formatMusd } from "../lib/money.js";
import { notFound, preconditionFailed } from "../lib/errors.js";
import { parse, parseLimit, principalOf, sendIdempotent, withIdempotency } from "../lib/http.js";
import { requirePermission } from "../auth/service.js";
import {
  buildActionIntent,
  confirmTransaction,
  createAgreementProposal,
  executeAgreementOnchain,
  getAgreement,
  listAgreements,
  openDispute,
  resolveDispute,
} from "../procurement/agreements.js";
import { escrowConfig } from "../escrow/client.js";
import { rebuildProjection, tick } from "../indexer/worker.js";
import { deliverDue } from "../webhooks/service.js";
import { ConfirmTx, CreateAgreement, OpenDispute, Pagination, ResolveDispute, Uuid } from "./schemas.js";

export function registerAgreementRoutes(app: FastifyInstance, db: Database, config: Config) {
  app.post("/v1/agreements", async (req, reply) => {
    const p = requirePermission(req.principal, "agreement:fund_intent");
    const body = parse(CreateAgreement, req.body);
    const result = await withIdempotency(db, req, p, async () => {
      const res = await createAgreementProposal(db, config, p, body);
      return { status: 201, body: res };
    });
    return sendIdempotent(reply, result);
  });

  app.get("/v1/agreements", async (req) => {
    const p = requirePermission(req.principal, "agreement:read");
    const q = parse(Pagination, req.query);
    const rows = await listAgreements(db, p.orgId, parseLimit(q.limit), q.cursor);
    return {
      data: rows.data.map((r) => ({
        ...r.agreement,
        amountDisplay: formatMusd(BigInt(r.agreement.amount)),
        feeAmountDisplay: formatMusd(BigInt(r.agreement.feeAmount)),
        vendorName: r.vendorName,
        requestReference: r.requestReference,
      })),
      nextCursor: rows.nextCursor,
    };
  });

  app.get("/v1/agreements/:id", async (req) => {
    const p = requirePermission(req.principal, "agreement:read");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const row = await getAgreement(db, p.orgId, id);
    const events = await db
      .select()
      .from(chainEvents)
      .where(
        and(
          eq(chainEvents.chainId, row.agreement.chainId),
          eq(chainEvents.agreementOnchainId, row.agreement.onchainId),
        ),
      )
      .orderBy(desc(chainEvents.blockNumber), desc(chainEvents.logIndex));

    return {
      agreement: {
        ...row.agreement,
        amountDisplay: formatMusd(BigInt(row.agreement.amount)),
        feeAmountDisplay: formatMusd(BigInt(row.agreement.feeAmount)),
        totalDisplay: formatMusd(BigInt(row.agreement.amount) + BigInt(row.agreement.feeAmount)),
      },
      request: { id: row.agreement.requestId, reference: row.requestReference, title: row.requestTitle },
      vendor: { id: row.agreement.vendorId, name: row.vendorName, payoutAddress: row.vendorAddress },
      chainEvents: events,
    };
  });

  app.post("/v1/agreements/:id/actions/:action", async (req) => {
    const { id, action } = parse(
      z.object({ id: Uuid, action: z.enum(["release", "cancel"]) }),
      req.params,
    );
    requirePermission(req.principal, action === "release" ? "agreement:release_intent" : "agreement:cancel_intent");
    const res = await buildActionIntent(db, config, principalOf(req), id, action);
    return {
      agreementId: res.agreement.id,
      state: res.agreement.state,
      intent: res.intent,
      next: "Sign and broadcast this transaction, then POST /v1/agreements/:id/confirm with the tx hash.",
    };
  });

  app.post("/v1/agreements/:id/confirm", async (req) => {
    const p = requirePermission(req.principal, "agreement:read");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const body = parse(ConfirmTx, req.body);
    return confirmTransaction(db, config, p, id, body.txHash as Hex);
  });

  app.post("/v1/agreements/:id/execute/:action", async (req) => {
    const p = requirePermission(req.principal, "agreement:read");
    const { id, action } = parse(
      z.object({
        id: Uuid,
        action: z.enum(["fund", "accept", "deliver", "release", "cancel", "dispute"]),
      }),
      req.params,
    );
    const body = parse(
      z
        .object({
          summary: z.string().optional(),
          artifactUri: z.string().optional(),
          reason: z.string().optional(),
          evidence: z.record(z.unknown()).optional(),
        })
        .optional()
        .default({}),
      req.body ?? {},
    );
    return executeAgreementOnchain(db, config, p, id, action, body);
  });

  app.post("/v1/agreements/:id/disputes", async (req, reply) => {
    const p = requirePermission(req.principal, "dispute:open");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const body = parse(OpenDispute, req.body);
    const res = await openDispute(db, config, p, id, body);
    return reply.status(201).send(res);
  });

  app.get("/v1/disputes", async (req) => {
    const p = requirePermission(req.principal, "dispute:read");
    const q = parse(Pagination, req.query);
    const rows = await db
      .select({ dispute: disputes, agreement: agreements })
      .from(disputes)
      .innerJoin(agreements, eq(agreements.id, disputes.agreementId))
      .where(eq(disputes.orgId, p.orgId))
      .orderBy(desc(disputes.createdAt))
      .limit(parseLimit(q.limit));
    return {
      data: rows.map((r) => ({
        ...r.dispute,
        agreementOnchainId: r.agreement.onchainId,
        agreementAmount: r.agreement.amount,
        agreementAmountDisplay: formatMusd(BigInt(r.agreement.amount)),
      })),
    };
  });

  app.get("/v1/disputes/:id", async (req) => {
    const p = requirePermission(req.principal, "dispute:read");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const [row] = await db
      .select({ dispute: disputes, agreement: agreements })
      .from(disputes)
      .innerJoin(agreements, eq(agreements.id, disputes.agreementId))
      .where(and(eq(disputes.id, id), eq(disputes.orgId, p.orgId)))
      .limit(1);
    if (!row) throw notFound("Dispute not found");
    return {
      dispute: {
        ...row.dispute,
        agreementAmount: row.agreement.amount,
        agreementAmountDisplay: formatMusd(BigInt(row.agreement.amount)),
        vendorShareDisplay: row.dispute.vendorShare ? formatMusd(BigInt(row.dispute.vendorShare)) : null,
      },
      agreement: { id: row.agreement.id, onchainId: row.agreement.onchainId, state: row.agreement.state },
    };
  });

  app.post("/v1/disputes/:id/resolve", async (req) => {
    const p = requirePermission(req.principal, "dispute:resolve");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const body = parse(ResolveDispute, req.body);
    return resolveDispute(db, config, p, id, body);
  });

  // -----------------------------------------------------------------------
  // Operational endpoints (org-scoped, admin permission)
  // -----------------------------------------------------------------------

  app.get("/v1/admin/indexer", async (req) => {
    requirePermission(req.principal, "org:manage");
    const cursors = await db.select().from(indexerCursors);
    return {
      indexerEnabled: config.INDEXER_ENABLED,
      confirmations: config.INDEXER_CONFIRMATIONS,
      cursors,
    };
  });

  app.post("/v1/admin/indexer/tick", async (req) => {
    requirePermission(req.principal, "org:manage");
    const cfg = escrowConfig(config);
    return tick(db, cfg, config);
  });

  app.post("/v1/admin/reconcile", async (req) => {
    const p = requirePermission(req.principal, "org:manage");
    const body = parse(z.object({ agreementId: Uuid.optional() }), req.body ?? {});
    const cfg = escrowConfig(config);
    if (body.agreementId) {
      const row = await getAgreement(db, p.orgId, body.agreementId);
      await rebuildProjection(db, cfg, row.agreement.onchainId);
      const fresh = await getAgreement(db, p.orgId, body.agreementId);
      return { reconciled: [body.agreementId], agreement: fresh.agreement };
    }
    const rows = await db.select({ id: agreements.id, onchainId: agreements.onchainId }).from(agreements).where(eq(agreements.orgId, p.orgId));
    for (const r of rows) await rebuildProjection(db, cfg, r.onchainId);
    return { reconciled: rows.map((r) => r.id) };
  });

  app.post("/v1/admin/webhooks/tick", async (req) => {
    const p = requirePermission(req.principal, "org:manage");
    return deliverDue(db, config, { limit: 25, orgId: p.orgId });
  });

  app.post("/v1/admin/expire-reservations", async (req) => {
    requirePermission(req.principal, "budget:manage");
    const { expireStaleReservations } = await import("../agents/budgets.js");
    const count = await db.transaction(async (tx) => expireStaleReservations(tx));
    return { expired: count };
  });

  app.get("/v1/agreements/:id/intent-metadata", async (req) => {
    requirePermission(req.principal, "agreement:read");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const row = await getAgreement(db, principalOf(req).orgId, id);
    if (!config.ESCROW_CONTRACT_ADDRESS) throw preconditionFailed("Escrow is not configured");
    return {
      chainId: row.agreement.chainId,
      escrow: row.agreement.escrowAddress,
      onchainId: row.agreement.onchainId,
      explorerTxUrl: `${config.MEZO_EXPLORER_URL}/tx/`,
    };
  });
}
