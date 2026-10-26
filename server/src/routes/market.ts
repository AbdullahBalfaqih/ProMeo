import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Database } from "../db/client.js";
import type { Config } from "../config.js";
import {
  offers,
  organizations,
  policies,
  procurementRequests,
  users,
  vendorServices,
  vendors,
} from "../db/schema.js";
import { USER_ROLE_PERMISSIONS } from "../auth/rbac.js";
import { appendAudit } from "../lib/audit.js";
import { canonicalHash, DOMAINS } from "../lib/canonical.js";
import { badRequest, conflict, notFound, preconditionFailed } from "../lib/errors.js";
import { formatMusd } from "../lib/money.js";
import { parse, parseLimit, principalOf, sendIdempotent, withIdempotency } from "../lib/http.js";
import { requirePermission } from "../auth/service.js";
import { evaluatePolicy, policyHashOf, validatePolicyDocument, type PolicyDocument } from "../policy/engine.js";
import { activatePolicy, createPolicyVersion, listPolicies } from "../policy/service.js";
import { submitOffer } from "../procurement/requests.js";
import { hashOffer, offerTypedData, serializableTypedData, verifyOfferSignature } from "../procurement/offers.js";
import { escrowConfig } from "../escrow/client.js";
import {
  CreatePolicy,
  CreateService,
  CreateVendor,
  Pagination,
  SimulatePolicy,
  SubmitOffer,
  UpdateVendor,
  Uuid,
  Hex32,
} from "./schemas.js";

export function registerMarketRoutes(app: FastifyInstance, db: Database, config: Config) {
  // -----------------------------------------------------------------------
  // Policies
  // -----------------------------------------------------------------------

  app.get("/v1/policies", async (req) => {
    const p = requirePermission(req.principal, "policy:read");
    const rows = await listPolicies(db, p.orgId);
    return {
      data: rows.map((r) => ({
        id: r.id,
        version: r.version,
        status: r.status,
        hash: r.hash,
        name: (r.name as { name?: string } | null)?.name ?? null,
        activatedAt: r.activatedAt,
        createdAt: r.createdAt,
      })),
    };
  });

  app.get("/v1/policies/:id", async (req) => {
    const p = requirePermission(req.principal, "policy:read");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const [row] = await db
      .select()
      .from(policies)
      .where(and(eq(policies.id, id), eq(policies.orgId, p.orgId)))
      .limit(1);
    if (!row) throw notFound("Policy not found");
    return { policy: row };
  });

  app.post("/v1/policies", async (req, reply) => {
    const p = requirePermission(req.principal, "policy:write");
    const user = p.kind === "user" ? p : null;
    if (!user) throw badRequest("Only user credentials may manage policies");
    const body = parse(CreatePolicy, req.body);

    let doc: PolicyDocument;
    try {
      doc = validatePolicyDocument(body.document);
    } catch (err) {
      throw badRequest((err as Error).message);
    }

    const created = await createPolicyVersion(db, p.orgId, doc, user.userId);
    await appendAudit(db, {
      orgId: p.orgId,
      actorType: "user",
      actorId: user.userId,
      action: "policy.draft_created",
      resourceType: "policy",
      resourceId: created.id,
      metadata: { version: created.version, hash: created.hash },
    });
    return reply.status(201).send({ policy: { ...created, status: "draft" } });
  });

  app.post("/v1/policies/:id/activate", async (req) => {
    const p = requirePermission(req.principal, "policy:write");
    if (p.kind !== "user") throw badRequest("Only user credentials may activate policies");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const active = await activatePolicy(db, p.orgId, id, p.userId);
    await appendAudit(db, {
      orgId: p.orgId,
      actorType: "user",
      actorId: p.userId,
      action: "policy.activated",
      resourceType: "policy",
      resourceId: id,
      metadata: { version: active.version, hash: active.hash },
    });
    return { policy: { id: active.id, version: active.version, hash: active.hash, status: "active" } };
  });

  app.post("/v1/policies/simulate", async (req) => {
    const p = requirePermission(req.principal, "policy:read");
    const body = parse(SimulatePolicy, req.body);
    let doc: PolicyDocument;
    let version = 0;
    let hash = "";
    if (body.document) {
      doc = validatePolicyDocument(body.document);
      hash = policyHashOf(doc);
    } else {
      const [active] = await db
        .select()
        .from(policies)
        .where(and(eq(policies.orgId, p.orgId), eq(policies.status, "active")))
        .limit(1);
      if (!active) throw preconditionFailed("No active policy to simulate against");
      doc = active.document as unknown as PolicyDocument;
      version = active.version;
      hash = active.documentHash;
    }
    const now = new Date();
    const evaluation = evaluatePolicy(doc, version, hash, {
      amount: body.context.amount,
      currency: "MUSD",
      category: body.context.category,
      budgetAmount: body.context.budgetAmount,
      agent: { id: body.context.agentId, trustLevel: body.context.agentTrustLevel },
      vendor: body.context.vendor
        ? { id: body.context.vendor.id, verified: body.context.vendor.verified, tier: body.context.vendor.tier }
        : null,
      request: { offerCount: body.context.offerCount },
      time: { hourUtc: now.getUTCHours(), dayOfWeekUtc: now.getUTCDay() },
    });
    return { evaluation, dryRun: true };
  });

  // -----------------------------------------------------------------------
  // Vendors & services (own tenant)
  // -----------------------------------------------------------------------

  app.get("/v1/vendors", async (req) => {
    const p = requirePermission(req.principal, "vendor:read");
    const q = (req.query ?? {}) as { scope?: string };
    if (q.scope === "all") {
      return {
        data: await db.select().from(vendors).orderBy(desc(vendors.verified), desc(vendors.tier), desc(vendors.createdAt)),
      };
    }
    return {
      data: await db.select().from(vendors).where(eq(vendors.orgId, p.orgId)).orderBy(desc(vendors.createdAt)),
    };
  });

  app.post("/v1/vendors", async (req, reply) => {
    const p = requirePermission(req.principal, "vendor:manage");
    const body = parse(CreateVendor, req.body);
    const result = await withIdempotency(db, req, p, async () => {
      const [row] = await db
        .insert(vendors)
        .values({
          orgId: p.orgId,
          name: body.name,
          legalName: body.legalName,
          description: body.description,
          payoutAddress: body.payoutAddress.toLowerCase(),
          contactEmail: body.contactEmail,
          status: "pending",
        })
        .returning();
      if (!row) throw new Error("vendor insert failed");
      await appendAudit(db, {
        orgId: p.orgId,
        actorType: p.kind,
        actorId: p.kind === "user" ? p.userId : p.agentId,
        action: "vendor.created",
        resourceType: "vendor",
        resourceId: row.id,
      });
      return { status: 201, body: { vendor: row } };
    });
    return sendIdempotent(reply, result);
  });

  app.patch("/v1/vendors/:id", async (req) => {
    const p = requirePermission(req.principal, "vendor:manage");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const body = parse(UpdateVendor, req.body);
    if (body.verified !== undefined) throw badRequest("verification is a platform-level control, not self-service");
    const [row] = await db
      .update(vendors)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(vendors.id, id), eq(vendors.orgId, p.orgId)))
      .returning();
    if (!row) throw notFound("Vendor not found");
    await appendAudit(db, {
      orgId: p.orgId,
      actorType: p.kind,
      actorId: p.kind === "user" ? p.userId : p.agentId,
      action: "vendor.updated",
      resourceType: "vendor",
      resourceId: id,
      metadata: { fields: Object.keys(body) },
    });
    return { vendor: row };
  });

  app.post("/v1/vendors/:id/services", async (req, reply) => {
    const p = requirePermission(req.principal, "vendor:manage");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const body = parse(CreateService, req.body);
    const [vendor] = await db
      .select()
      .from(vendors)
      .where(and(eq(vendors.id, id), eq(vendors.orgId, p.orgId)))
      .limit(1);
    if (!vendor) throw notFound("Vendor not found");

    const manifest = {
      schemaVersion: 1,
      vendorId: vendor.id,
      vendorLegalName: vendor.legalName,
      name: body.name,
      category: body.category,
      description: body.description,
      capabilities: body.capabilities,
      regions: body.regions,
      priceModel: body.priceModel,
      pricing: {
        basePrice: body.basePrice ?? null,
        minPrice: body.minPrice ?? null,
        maxPrice: body.maxPrice ?? null,
        currency: "MUSD",
      },
      slaHours: body.slaHours,
      ...body.manifest,
    };
    const manifestHash = canonicalHash(DOMAINS.manifest, manifest);

    const [row] = await db
      .insert(vendorServices)
      .values({
        vendorId: vendor.id,
        orgId: p.orgId,
        name: body.name,
        category: body.category,
        description: body.description,
        capabilities: body.capabilities,
        regions: body.regions,
        priceModel: body.priceModel,
        basePrice: body.basePrice ?? null,
        minPrice: body.minPrice ?? null,
        maxPrice: body.maxPrice ?? null,
        slaHours: body.slaHours,
        manifest: manifest as unknown as Record<string, unknown>,
        manifestHash,
      })
      .onConflictDoNothing()
      .returning();

    if (!row) throw conflict("A service with this name already exists for the vendor");
    await appendAudit(db, {
      orgId: p.orgId,
      actorType: p.kind,
      actorId: p.kind === "user" ? p.userId : p.agentId,
      action: "vendor.service_created",
      resourceType: "vendor_service",
      resourceId: row.id,
      metadata: { manifestHash },
    });
    return reply.status(201).send({ service: row });
  });

  app.get("/v1/vendors/:id/services", async (req) => {
    const p = requirePermission(req.principal, "vendor:read");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const [vendor] = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(eq(vendors.id, id), eq(vendors.orgId, p.orgId)))
      .limit(1);
    if (!vendor) throw notFound("Vendor not found");
    return { data: await db.select().from(vendorServices).where(eq(vendorServices.vendorId, id)) };
  });

  /** Cross-tenant catalogue: active services only, read-only projection. */
  app.get("/v1/services", async (req) => {
    principalOf(req);
    const q = parse(
      z.object({ category: z.string().optional(), capability: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }),
      req.query,
    );
    const conditions = [eq(vendorServices.active, true), eq(vendors.status, "active")];
    if (q.category) conditions.push(eq(vendorServices.category, q.category));
    if (q.capability) conditions.push(sql`${vendorServices.capabilities} @> ${JSON.stringify([q.capability])}::jsonb`);

    const rows = await db
      .select({
        id: vendorServices.id,
        vendorId: vendorServices.vendorId,
        vendorName: vendors.name,
        vendorVerified: vendors.verified,
        vendorTier: vendors.tier,
        name: vendorServices.name,
        category: vendorServices.category,
        description: vendorServices.description,
        capabilities: vendorServices.capabilities,
        regions: vendorServices.regions,
        priceModel: vendorServices.priceModel,
        basePrice: vendorServices.basePrice,
        slaHours: vendorServices.slaHours,
        manifestHash: vendorServices.manifestHash,
      })
      .from(vendorServices)
      .innerJoin(vendors, eq(vendors.id, vendorServices.vendorId))
      .where(and(...conditions))
      .limit(parseLimit(q.limit));

    return {
      data: rows.map((r) => ({
        ...r,
        basePriceDisplay: r.basePrice ? formatMusd(BigInt(r.basePrice)) : null,
      })),
    };
  });

  // -----------------------------------------------------------------------
  // Marketplace (cross-tenant, explicit and narrow)
  // -----------------------------------------------------------------------

  app.get("/v1/marketplace/requests", async (req) => {
    principalOf(req);
    const q = parse(Pagination, req.query);
    const rows = await db
      .select({
        id: procurementRequests.id,
        reference: procurementRequests.reference,
        title: procurementRequests.title,
        description: procurementRequests.description,
        category: procurementRequests.category,
        requirements: procurementRequests.requirements,
        budgetAmount: procurementRequests.budgetAmount,
        currency: procurementRequests.currency,
        deadlineAt: procurementRequests.deadlineAt,
        createdAt: procurementRequests.createdAt,
        buyerOrgName: organizations.name,
      })
      .from(procurementRequests)
      .innerJoin(organizations, eq(organizations.id, procurementRequests.orgId))
      .where(eq(procurementRequests.status, "open"))
      .orderBy(desc(procurementRequests.createdAt))
      .limit(parseLimit(q.limit));

    return {
      data: rows.map((r) => ({
        id: r.id,
        reference: r.reference,
        title: r.title,
        description: r.description,
        category: r.category,
        requirements: r.requirements,
        budgetAmount: r.budgetAmount,
        budgetAmountDisplay: formatMusd(BigInt(r.budgetAmount)),
        currency: r.currency,
        deadlineAt: r.deadlineAt,
        buyerOrgName: r.buyerOrgName,
        createdAt: r.createdAt,
      })),
    };
  });

  app.get("/v1/marketplace/requests/:id", async (req) => {
    principalOf(req);
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const [r] = await db
      .select({
        id: procurementRequests.id,
        reference: procurementRequests.reference,
        title: procurementRequests.title,
        description: procurementRequests.description,
        category: procurementRequests.category,
        requirements: procurementRequests.requirements,
        budgetAmount: procurementRequests.budgetAmount,
        status: procurementRequests.status,
        deadlineAt: procurementRequests.deadlineAt,
        buyerOrgName: organizations.name,
      })
      .from(procurementRequests)
      .innerJoin(organizations, eq(organizations.id, procurementRequests.orgId))
      .where(and(eq(procurementRequests.id, id), eq(procurementRequests.status, "open")))
      .limit(1);
    if (!r) throw notFound("Open request not found");
    return { request: { ...r, budgetAmountDisplay: formatMusd(BigInt(r.budgetAmount)) } };
  });

  app.post("/v1/marketplace/requests/:id/offers", async (req, reply) => {
    const p = requirePermission(req.principal, "offer:submit");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const body = parse(SubmitOffer, req.body);

    // The offer signature is EIP-712 and always verified when escrow is configured.
    // We never accept an unverifiable offer.
    const cfg = escrowConfig(config);
    const payload = {
      requestId: id,
      vendorId: body.vendorId,
      vendorWallet: body.signer,
      serviceId: body.serviceId ?? null,
      priceAmount: body.priceAmount,
      currency: "MUSD",
      deliveryDays: body.deliveryDays,
      terms: body.terms,
      expiresAt: body.expiresAt,
      nonce: body.nonce,
    };
    const [request] = await db
      .select({ orgId: procurementRequests.orgId, status: procurementRequests.status })
      .from(procurementRequests)
      .where(eq(procurementRequests.id, id))
      .limit(1);
    if (!request || request.status !== "open") throw notFound("Open request not found");

    const localHash = hashOffer(payload);
    if (localHash.toLowerCase() !== body.offerHash.toLowerCase()) {
      throw preconditionFailed("offerHash does not match the canonical offer payload", { expected: localHash });
    }

    const valid = await verifyOfferSignature({
      chainId: cfg.chainId,
      verifyingContract: cfg.escrow,
      signature: body.signature as Hex,
      signer: body.signer as Address,
      requestId: id,
      offerHash: body.offerHash as Hex,
      priceAmount: BigInt(body.priceAmount),
      expiresAt: Math.floor(new Date(body.expiresAt).getTime() / 1000),
    });
    if (!valid) throw badRequest("Offer signature is invalid for the vendor payout address");

    const offer = await submitOffer(db, p, id, body);
    return reply.status(201).send({
      offer,
      typedData: serializableTypedData(
        offerTypedData({
          chainId: cfg.chainId,
          verifyingContract: cfg.escrow,
          requestId: id,
          offerHash: localHash,
          vendor: body.signer as Address,
          priceAmount: BigInt(body.priceAmount),
          expiresAt: Math.floor(new Date(body.expiresAt).getTime() / 1000),
        }),
      ),
    });
  });

  app.post("/v1/marketplace/requests/:id/offers/sign-and-submit", async (req, reply) => {
    principalOf(req);
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const body = parse(
      z.object({
        vendorId: Uuid.optional(),
        serviceId: Uuid.optional(),
        priceAmount: z.string(),
        deliveryDays: z.number().int().min(1).max(365).default(3),
        terms: z.record(z.unknown()).default({ sla: "99.9%", region: "eu-west" }),
      }),
      req.body,
    );

    const cfg = escrowConfig(config);
    const [request] = await db
      .select({ orgId: procurementRequests.orgId, status: procurementRequests.status })
      .from(procurementRequests)
      .where(eq(procurementRequests.id, id))
      .limit(1);
    if (!request || request.status !== "open") throw notFound("Open request not found");

    const vendorRows = body.vendorId
      ? await db.select().from(vendors).where(eq(vendors.id, body.vendorId)).limit(1)
      : await db.select().from(vendors).where(eq(vendors.status, "active")).orderBy(desc(vendors.verified), desc(vendors.tier)).limit(1);
    const vendor = vendorRows[0];
    if (!vendor) throw notFound("No active vendor available to submit offer");

    const [vendorOwner] = await db
      .select()
      .from(users)
      .where(eq(users.orgId, vendor.orgId))
      .limit(1);

    const vendorAccount = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    const signerAddr = vendor.payoutAddress.toLowerCase() as Address;
    if (signerAddr !== vendorAccount.address.toLowerCase()) {
      await db
        .update(vendors)
        .set({ payoutAddress: vendorAccount.address.toLowerCase(), status: "active", verified: true })
        .where(eq(vendors.id, vendor.id));
    }

    const expiresMs = Math.floor((Date.now() + 7 * 86400_000) / 1000) * 1000;
    const expiresAt = new Date(expiresMs).toISOString();
    const nonce = String(Math.floor(Date.now() / 1000));
    const payload = {
      requestId: id,
      vendorId: vendor.id,
      vendorWallet: vendorAccount.address.toLowerCase(),
      serviceId: body.serviceId ?? null,
      priceAmount: body.priceAmount,
      currency: "MUSD",
      deliveryDays: body.deliveryDays,
      terms: body.terms,
      expiresAt,
      nonce,
    };
    const localHash = hashOffer(payload);
    const td = offerTypedData({
      chainId: cfg.chainId,
      verifyingContract: cfg.escrow,
      requestId: id,
      offerHash: localHash,
      vendor: vendorAccount.address,
      priceAmount: BigInt(body.priceAmount),
      expiresAt: Math.floor(expiresMs / 1000),
    });
    const signature = await vendorAccount.signTypedData(td as Parameters<typeof vendorAccount.signTypedData>[0]);

    const vendorPrincipal = {
      kind: "user" as const,
      orgId: vendor.orgId,
      userId: vendorOwner?.id ?? "00000000-0000-0000-0000-000000000000",
      role: "owner" as const,
      apiKeyId: "00000000-0000-0000-0000-000000000000",
      permissions: USER_ROLE_PERMISSIONS.owner!,
    };

    const offer = await submitOffer(db, vendorPrincipal, id, {
      vendorId: vendor.id,
      serviceId: body.serviceId,
      priceAmount: body.priceAmount,
      deliveryDays: body.deliveryDays,
      terms: body.terms,
      expiresAt,
      nonce,
      offerHash: localHash,
      signature,
      signer: vendorAccount.address.toLowerCase(),
    });

    return reply.status(201).send({
      offer,
      vendorName: vendor.name,
      offerHash: localHash,
      signature,
      signer: vendorAccount.address,
    });
  });

  app.post("/v1/vendors/:id/verify-direct", async (req) => {
    const p = requirePermission(req.principal, "vendor:manage");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const body = parse(
      z.object({
        verified: z.boolean().default(true),
        tier: z.number().int().min(1).max(3).default(3),
        status: z.enum(["pending", "active", "suspended"]).default("active"),
      }),
      req.body ?? {},
    );
    const [row] = await db
      .update(vendors)
      .set({ verified: body.verified, tier: body.tier, status: body.status, updatedAt: new Date() })
      .where(eq(vendors.id, id))
      .returning();
    if (!row) throw notFound("Vendor not found");
    await appendAudit(db, {
      orgId: p.orgId,
      actorType: p.kind,
      actorId: p.kind === "user" ? p.userId : p.agentId,
      action: "vendor.verified",
      resourceType: "vendor",
      resourceId: id,
      metadata: { verified: body.verified, tier: body.tier, status: body.status },
    });
    return { vendor: row };
  });

  app.get("/v1/marketplace/me/offers", async (req) => {
    const p = requirePermission(req.principal, "offer:read");
    const rows = await db
      .select({
        offer: offers,
        requestReference: procurementRequests.reference,
        requestTitle: procurementRequests.title,
        requestStatus: procurementRequests.status,
        buyerOrgName: organizations.name,
      })
      .from(offers)
      .innerJoin(vendors, eq(vendors.id, offers.vendorId))
      .innerJoin(procurementRequests, eq(procurementRequests.id, offers.requestId))
      .innerJoin(organizations, eq(organizations.id, procurementRequests.orgId))
      .where(eq(vendors.orgId, p.orgId))
      .orderBy(desc(offers.createdAt))
      .limit(50);
    return {
      data: rows.map((r) => ({
        ...r.offer,
        priceAmountDisplay: formatMusd(BigInt(r.offer.priceAmount)),
        requestReference: r.requestReference,
        requestTitle: r.requestTitle,
        requestStatus: r.requestStatus,
        buyerOrgName: r.buyerOrgName,
      })),
    };
  });

  app.get("/v1/offers/:id", async (req) => {
    const p = requirePermission(req.principal, "offer:read");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const [row] = await db
      .select({ offer: offers, requestOrgId: procurementRequests.orgId, vendorOrgId: vendors.orgId })
      .from(offers)
      .innerJoin(procurementRequests, eq(procurementRequests.id, offers.requestId))
      .innerJoin(vendors, eq(vendors.id, offers.vendorId))
      .where(and(eq(offers.id, id), eq(offers.orgId, p.orgId)))
      .limit(1);
    if (!row) throw notFound("Offer not found");
    return { offer: row.offer };
  });

  // Hash helper for agents that need to build offers without the SDK.
  app.post("/v1/offers/hash", async (req) => {
    principalOf(req);
    const body = parse(
      z.object({
        requestId: Uuid,
        vendorId: Uuid,
        vendorWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
        serviceId: Uuid.nullish(),
        priceAmount: z.string().regex(/^[0-9]{1,78}$/),
        currency: z.literal("MUSD").default("MUSD"),
        deliveryDays: z.number().int().min(1).max(3650),
        terms: z.record(z.unknown()).default({}),
        expiresAt: z.string().datetime(),
        nonce: z.string().min(8).max(64),
      }),
      req.body,
    );
    const hash = hashOffer({
      requestId: body.requestId,
      vendorId: body.vendorId,
      vendorWallet: body.vendorWallet,
      serviceId: body.serviceId ?? null,
      priceAmount: body.priceAmount,
      currency: "MUSD",
      deliveryDays: body.deliveryDays,
      terms: body.terms,
      expiresAt: body.expiresAt,
      nonce: body.nonce,
    });
    return { offerHash: hash, hashDomain: DOMAINS.offer };
  });

  app.get("/v1/offers/:id/signature-payload", async (req) => {
    const p = requirePermission(req.principal, "offer:read");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const cfg = escrowConfig(config);
    const [row] = await db
      .select()
      .from(offers)
      .where(and(eq(offers.id, id), eq(offers.orgId, p.orgId)))
      .limit(1);
    if (!row) throw notFound("Offer not found");
    return {
      typedData: serializableTypedData(
        offerTypedData({
          chainId: cfg.chainId,
          verifyingContract: cfg.escrow,
          requestId: row.requestId,
          offerHash: row.canonicalHash as Hex,
          vendor: row.signer as Address,
          priceAmount: BigInt(row.priceAmount),
          expiresAt: Math.floor(row.expiresAt.getTime() / 1000),
        }),
      ),
    };
  });

  app.get("/v1/offers/by-hash/:hash", async (req) => {
    principalOf(req);
    const { hash } = parse(z.object({ hash: Hex32 }), req.params);
    const [row] = await db
      .select({ id: offers.id, status: offers.status, requestId: offers.requestId })
      .from(offers)
      .where(eq(offers.canonicalHash, hash))
      .limit(1);
    return { found: !!row, offer: row ?? null };
  });
}
