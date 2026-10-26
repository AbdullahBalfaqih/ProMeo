import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import type { Config } from "../config.js";
import {
  approvals,
  offers,
  policyEvaluations,
  procurementRequests,
  requestEvents,
  users,
  vendorServices,
  vendors,
} from "../db/schema.js";
import { formatMusd } from "../lib/money.js";
import { forbidden, notFound } from "../lib/errors.js";
import { parse, parseLimit, principalOf, sendIdempotent, withIdempotency } from "../lib/http.js";
import { requirePermission } from "../auth/service.js";
import {
  awardRequest,
  cancelRequest,
  createRequest,
  decideApproval,
  listOffers,
  listRequests,
  publishRequest,
} from "../procurement/requests.js";
import { rankOffers, type RankableOffer } from "../procurement/offers.js";
import { TRANSITIONS, type RequestStatus } from "../procurement/state.js";
import { Award, CreateRequest, Decision, Pagination, Uuid } from "./schemas.js";

export function registerRequestRoutes(app: FastifyInstance, db: Database, _config: Config) {
  app.post("/v1/requests", async (req, reply) => {
    const p = requirePermission(req.principal, "request:create");
    const body = parse(CreateRequest, req.body);
    const result = await withIdempotency(db, req, p, async () => {
      const row = await createRequest(db, p, body);
      return { status: 201, body: { request: withDisplay(row) } };
    });
    return sendIdempotent(reply, result);
  });

  app.get("/v1/requests", async (req) => {
    const p = requirePermission(req.principal, "request:read");
    const q = parse(
      Pagination.extend({ status: z.string().optional() }),
      req.query,
    );
    const rows = await listRequests(db, p.orgId, {
      status: q.status as never,
      limit: parseLimit(q.limit),
      cursor: q.cursor,
    });
    return {
      data: rows.data.map((r) => withDisplay(r as never)),
      nextCursor: rows.nextCursor,
    };
  });

  app.get("/v1/requests/:id", async (req) => {
    const p = requirePermission(req.principal, "request:read");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const [row] = await db
      .select()
      .from(procurementRequests)
      .where(and(eq(procurementRequests.id, id), eq(procurementRequests.orgId, p.orgId)))
      .limit(1);
    if (!row) throw notFound("Request not found");

    const [approval] = await db
      .select()
      .from(approvals)
      .where(and(eq(approvals.requestId, id), eq(approvals.status, "pending")))
      .limit(1);

    const [offerCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(offers)
      .where(eq(offers.requestId, id));

    return {
      request: withDisplay(row),
      pendingApproval: approval ?? null,
      offerCount: offerCount?.count ?? 0,
      allowedNextStatuses: TRANSITIONS[row.status as RequestStatus] ?? [],
    };
  });

  app.post("/v1/requests/:id/publish", async (req) => {
    const p = requirePermission(req.principal, "request:publish");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const row = await publishRequest(db, p, id);
    return { request: withDisplay(row) };
  });

  app.post("/v1/requests/:id/cancel", async (req) => {
    const p = requirePermission(req.principal, "request:cancel");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const body = parse(z.object({ reason: z.string().min(3).max(2000) }), req.body);
    const row = await cancelRequest(db, p, id, body.reason);
    return { request: withDisplay(row) };
  });

  app.get("/v1/requests/:id/events", async (req) => {
    const p = requirePermission(req.principal, "request:read");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    await assertRequest(db, p.orgId, id);
    const events = await db
      .select()
      .from(requestEvents)
      .where(eq(requestEvents.requestId, id))
      .orderBy(desc(requestEvents.createdAt));
    return { data: events };
  });

  app.get("/v1/requests/:id/policy-evaluations", async (req) => {
    const p = requirePermission(req.principal, "policy:read");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    await assertRequest(db, p.orgId, id);
    return {
      data: await db
        .select()
        .from(policyEvaluations)
        .where(and(eq(policyEvaluations.requestId, id), eq(policyEvaluations.orgId, p.orgId)))
        .orderBy(desc(policyEvaluations.createdAt)),
    };
  });

  app.get("/v1/requests/:id/offers", async (req) => {
    const p = requirePermission(req.principal, "offer:read");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const rows = await listOffers(db, p.orgId, id);
    return {
      data: rows.map((r) => ({
        ...r.offer,
        priceAmountDisplay: formatMusd(BigInt(r.offer.priceAmount)),
        vendorName: r.vendorName,
        vendorVerified: r.vendorVerified,
        vendorTier: r.vendorTier,
        serviceName: r.serviceName,
        serviceCapabilities: r.serviceCapabilities,
      })),
    };
  });

  /**
   * Deterministic discovery/ranking. Same data -> same order. The scoring is
   * documented in docs/AGENT_POLICY.md and implemented in procurement/offers.ts.
   */
  app.get("/v1/requests/:id/offers/discover", async (req) => {
    const p = requirePermission(req.principal, "offer:discover");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const request = await assertRequest(db, p.orgId, id);

    const rows = await db
      .select({
        offer: offers,
        vendorName: vendors.name,
        vendorVerified: vendors.verified,
        vendorTier: vendors.tier,
        capabilities: vendorServices.capabilities,
      })
      .from(offers)
      .innerJoin(vendors, eq(vendors.id, offers.vendorId))
      .leftJoin(vendorServices, eq(vendorServices.id, offers.serviceId))
      .where(eq(offers.requestId, id));

    const requirements = request.requirements as { capabilities?: unknown };
    const capabilities = Array.isArray(requirements.capabilities)
      ? requirements.capabilities.filter((c): c is string => typeof c === "string")
      : [];

    const rankable: RankableOffer[] = rows.map((r) => ({
      offerId: r.offer.id,
      vendorId: r.offer.vendorId,
      vendorName: r.vendorName,
      vendorVerified: r.vendorVerified,
      vendorTier: r.vendorTier,
      priceAmount: BigInt(r.offer.priceAmount),
      deliveryDays: r.offer.deliveryDays,
      serviceCapabilities: r.capabilities ?? [],
      expiresAt: r.offer.expiresAt,
    }));

    const ranked = rankOffers(rankable, {
      capabilities,
      budgetAmount: BigInt(request.budgetAmount),
      now: new Date(),
    });

    return {
      requestId: id,
      requiredCapabilities: capabilities,
      budgetAmount: request.budgetAmount,
      budgetAmountDisplay: formatMusd(BigInt(request.budgetAmount)),
      ranking: ranked.map((r, i) => ({ position: i + 1, ...r, priceAmountDisplay: formatMusd(BigInt(r.priceAmount)) })),
      algorithm: {
        version: 1,
        weights: { price: 45, speed: 25, verified: 10, tier: 15, capability: 5 },
        scale: 100000,
        tieBreak: ["rankScore desc", "priceAmount asc", "deliveryDays asc", "vendorId asc"],
      },
    };
  });

  app.post("/v1/requests/:id/award", async (req) => {
    const p = requirePermission(req.principal, "request:award");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const body = parse(Award, req.body);
    const res = await awardRequest(db, p, id, body.offerId);
    return {
      request: withDisplay(res.request as never),
      policy: {
        version: res.policyVersion,
        decision: res.evaluation.decision,
        matchedRules: res.evaluation.matchedRules,
        requiredRoles: res.evaluation.requiredRoles,
      },
    };
  });

  app.get("/v1/approvals", async (req) => {
    const p = requirePermission(req.principal, "request:read");
    const q = parse(Pagination.extend({ status: z.enum(["pending", "approved", "rejected", "expired"]).optional() }), req.query);
    const conditions = [eq(approvals.orgId, p.orgId)];
    if (q.status) conditions.push(eq(approvals.status, q.status));
    const rows = await db
      .select({
        approval: approvals,
        requestTitle: procurementRequests.title,
        requestReference: procurementRequests.reference,
        requestStatus: procurementRequests.status,
        requestedByName: users.displayName,
      })
      .from(approvals)
      .innerJoin(procurementRequests, eq(procurementRequests.id, approvals.requestId))
      .leftJoin(users, eq(users.id, approvals.decidedByUserId))
      .where(and(...conditions))
      .orderBy(desc(approvals.createdAt))
      .limit(parseLimit(q.limit));
    return { data: rows };
  });

  app.post("/v1/approvals/:id/decide", async (req) => {
    const p = requirePermission(req.principal, "request:approve");
    if (p.kind !== "user") throw forbidden("Agents cannot approve procurement");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const body = parse(Decision, req.body);
    const res = await decideApproval(db, p, id, body.decision, body.note);
    return { request: withDisplay(res.request as never), decision: body.decision };
  });
}

async function assertRequest(db: Database, orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(procurementRequests)
    .where(and(eq(procurementRequests.id, id), eq(procurementRequests.orgId, orgId)))
    .limit(1);
  if (!row) throw notFound("Request not found");
  return row;
}

function withDisplay<T extends { budgetAmount?: string }>(row: T) {
  return {
    ...row,
    ...(row.budgetAmount ? { budgetAmountDisplay: formatMusd(BigInt(row.budgetAmount)) } : {}),
  };
}

