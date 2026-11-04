import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Config } from "../config.js";
import type { Database } from "../db/client.js";
import {
  apiKeys,
  auditLog,
  organizations,
  users,
  vendors,
  webhookDeliveries,
  webhookEndpoints,
} from "../db/schema.js";
import { requirePermission } from "../auth/service.js";
import { appendAudit } from "../lib/audit.js";
import { canonicalSha256 } from "../lib/canonical.js";
import { generateToken, sealSecret, sha256Hex } from "../lib/crypto.js";
import { badRequest, forbidden, notFound, preconditionFailed } from "../lib/errors.js";
import { hashEquals, sha256Hex as hashToken } from "../lib/crypto.js";
import { parse, parseLimit } from "../lib/http.js";
import { activatePolicy, createPolicyVersion } from "../policy/service.js";
import { defaultPolicyDocument } from "../policy/defaults.js";
import { WEBHOOK_EVENTS } from "../webhooks/service.js";
import { Pagination, Uuid } from "./schemas.js";

/**
 * Health, capability discovery, webhooks, audit and local bootstrapping.
 * Everything except /healthz, /v1/meta and /v1/bootstrap/status is authenticated
 * and tenant-scoped.
 */
export function registerSystemRoutes(app: FastifyInstance, db: Database, config: Config) {
  const started = Date.now();

  app.get("/healthz", async () => ({
    ok: true,
    status: "ok",
    version: "0.1.0",
    uptimeSeconds: Math.floor((Date.now() - started) / 1000),
    time: new Date().toISOString(),
    chain: {
      chainId: config.MEZO_CHAIN_ID,
      escrow: config.ESCROW_CONTRACT_ADDRESS ?? null,
    },
  }));

  app.post("/healthz", async () => ({
    ok: true,
    received: true,
    time: new Date().toISOString(),
  }));

  app.get("/v1/meta", async () => ({
    api: { name: "Agent Procurement Network", version: "1.0.0", build: "0.1.0" },
    chain: {
      name:
        config.MEZO_CHAIN_ID === 31612 ? "Mezo Mainnet" : config.MEZO_CHAIN_ID === 31611 ? "Mezo Testnet" : "Custom EVM",
      chainId: config.MEZO_CHAIN_ID,
      rpcUrl: config.MEZO_RPC_URL,
      explorer: config.MEZO_EXPLORER_URL,
      escrow: config.ESCROW_CONTRACT_ADDRESS ?? null,
      registry: config.REGISTRY_CONTRACT_ADDRESS ?? null,
      musd: config.MUSD_ADDRESS ?? null,
    },
    currency: { symbol: "MUSD", decimals: 18 },
    webhooks: {
      signatureHeader: "x-apn-signature",
      timestampHeader: "x-apn-timestamp",
      algorithm: "HMAC-SHA256 over `<timestamp>.<raw body>`, hex, prefixed v1=",
      events: WEBHOOK_EVENTS,
    },
    policy: { note: "deny-overrides, immutable versions, evaluated server-side" },
    capabilities: {
      bootstrap: config.ALLOW_BOOTSTRAP,
      indexer: config.INDEXER_ENABLED,
      webhooks: Boolean(config.SECRET_ENCRYPTION_KEY),
      disputeResolution: Boolean(config.RESOLVER_PRIVATE_KEY),
    },
  }));

  // -------------------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------------------

  app.get("/v1/webhooks", async (req) => {
    const p = requirePermission(req.principal, "webhook:read");
    return {
      data: await db
        .select({
          id: webhookEndpoints.id,
          url: webhookEndpoints.url,
          description: webhookEndpoints.description,
          events: webhookEndpoints.events,
          active: webhookEndpoints.active,
          createdAt: webhookEndpoints.createdAt,
        })
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.orgId, p.orgId))
        .orderBy(desc(webhookEndpoints.createdAt)),
    };
  });

  app.post("/v1/webhooks", async (req, reply) => {
    const p = requirePermission(req.principal, "webhook:manage");
    if (!config.SECRET_ENCRYPTION_KEY) {
      throw preconditionFailed("SECRET_ENCRYPTION_KEY is not configured; webhooks are disabled");
    }
    const body = parse(
      z.object({
        url: z
          .string()
          .url()
          .refine(
            (u) => u.startsWith("https://") || /^http:\/\/(localhost|127\.0\.0\.1)([:/]|$)/.test(u),
            "HTTPS is required (HTTP is only accepted for localhost)",
          ),
        description: z.string().max(200).optional(),
        events: z
          .array(z.string())
          .min(1)
          .max(WEBHOOK_EVENTS.length)
          .refine((evs) => evs.every((e) => (WEBHOOK_EVENTS as readonly string[]).includes(e)), "unknown event type"),
      }),
      req.body,
    );

    const secret = randomBytes(32).toString("hex");
    const [row] = await db
      .insert(webhookEndpoints)
      .values({
        orgId: p.orgId,
        url: body.url,
        description: body.description,
        events: [...new Set(body.events)],
        secretHash: sha256Hex(secret),
        secretSealed: sealSecret(secret, config.SECRET_ENCRYPTION_KEY),
      })
      .returning({
        id: webhookEndpoints.id,
        url: webhookEndpoints.url,
        description: webhookEndpoints.description,
        events: webhookEndpoints.events,
        active: webhookEndpoints.active,
      });

    await appendAudit(db, {
      orgId: p.orgId,
      actorType: p.kind,
      actorId: p.kind === "user" ? p.userId : p.agentId,
      action: "webhook.created",
      resourceType: "webhook_endpoint",
      resourceId: row!.id,
      metadata: { events: row!.events },
    });

    return reply.status(201).send({
      endpoint: row,
      secret,
      warning: "Store the signing secret now; it cannot be retrieved again.",
    });
  });

  app.delete("/v1/webhooks/:id", async (req, reply) => {
    const p = requirePermission(req.principal, "webhook:manage");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const [row] = await db
      .delete(webhookEndpoints)
      .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.orgId, p.orgId)))
      .returning({ id: webhookEndpoints.id });
    if (!row) throw notFound("Webhook endpoint not found");
    await appendAudit(db, {
      orgId: p.orgId,
      actorType: p.kind,
      actorId: p.kind === "user" ? p.userId : p.agentId,
      action: "webhook.deleted",
      resourceType: "webhook_endpoint",
      resourceId: id,
    });
    return reply.status(204).send();
  });

  app.get("/v1/webhooks/deliveries", async (req) => {
    const p = requirePermission(req.principal, "webhook:read");
    const q = parse(Pagination, req.query);
    return {
      data: await db
        .select({
          id: webhookDeliveries.id,
          endpointId: webhookDeliveries.endpointId,
          eventType: webhookDeliveries.eventType,
          status: webhookDeliveries.status,
          attempts: webhookDeliveries.attempts,
          lastResponseCode: webhookDeliveries.lastResponseCode,
          lastError: webhookDeliveries.lastError,
          nextAttemptAt: webhookDeliveries.nextAttemptAt,
          deliveredAt: webhookDeliveries.deliveredAt,
          createdAt: webhookDeliveries.createdAt,
        })
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.orgId, p.orgId))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(parseLimit(q.limit)),
    };
  });

  /** Enqueues a synthetic event so an integrator can verify their receiver. */
  app.post("/v1/webhooks/:id/test", async (req, reply) => {
    const p = requirePermission(req.principal, "webhook:manage");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const [endpoint] = await db
      .select()
      .from(webhookEndpoints)
      .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.orgId, p.orgId)))
      .limit(1);
    if (!endpoint) throw notFound("Webhook endpoint not found");

    const eventId = randomUUID();
    const payload = {
      id: eventId,
      type: "webhook.test",
      createdAt: new Date().toISOString(),
      data: { message: "Test delivery from Agent Procurement Network", endpointId: endpoint.id },
    };
    const [delivery] = await db
      .insert(webhookDeliveries)
      .values({
        orgId: p.orgId,
        endpointId: endpoint.id,
        eventId,
        sourceKey: `webhook.test:${eventId}`,
        eventType: "webhook.test",
        payload,
        payloadHash: await canonicalSha256(payload),
        status: "pending",
        nextAttemptAt: new Date(),
      })
      .returning({ id: webhookDeliveries.id });

    return reply.status(201).send({
      deliveryId: delivery!.id,
      exampleHeaders: { "x-apn-event-id": eventId, "x-apn-event-type": "webhook.test" },
    });
  });

  // -------------------------------------------------------------------------
  // Platform operator actions
  // -------------------------------------------------------------------------

  /**
   * Vendor verification is a platform decision: a tenant must never be able to
   * mark its own vendor as verified. Requires OPERATOR_TOKEN; if unset the
   * endpoint is disabled and verification is a database/ops action.
   */
  app.post("/v1/operator/vendors/:id/verify", async (req) => {
    if (!config.OPERATOR_TOKEN) throw preconditionFailed("OPERATOR_TOKEN is not configured");
    const supplied = req.headers["x-operator-token"];
    if (typeof supplied !== "string" || !hashEquals(hashToken(supplied), hashToken(config.OPERATOR_TOKEN))) {
      throw forbidden("Invalid operator token");
    }
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const body = parse(z.object({ verified: z.boolean(), tier: z.number().int().min(1).max(5).optional() }), req.body);

    const [row] = await db
      .update(vendors)
      .set({ verified: body.verified, ...(body.tier ? { tier: body.tier } : {}), updatedAt: new Date() })
      .where(eq(vendors.id, id))
      .returning();
    if (!row) throw notFound("Vendor not found");

    await appendAudit(db, {
      orgId: row.orgId,
      actorType: "system",
      actorId: "operator",
      action: body.verified ? "vendor.verified" : "vendor.unverified",
      resourceType: "vendor",
      resourceId: id,
      metadata: { tier: row.tier },
    });

    return { vendor: { id: row.id, verified: row.verified, tier: row.tier } };
  });

  // -------------------------------------------------------------------------
  // Audit
  // -------------------------------------------------------------------------

  app.get("/v1/audit", async (req) => {
    const p = requirePermission(req.principal, "audit:read");
    const q = parse(Pagination, req.query);
    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.orgId, p.orgId))
      .orderBy(desc(auditLog.seq))
      .limit(parseLimit(q.limit));
    return { data: rows, nextCursor: rows.length > 0 ? String(rows[rows.length - 1]!.seq) : null };
  });

  /** Recomputes the chain; the first mismatch identifies a tampered row. */
  app.get("/v1/audit/verify", async (req) => {
    const p = requirePermission(req.principal, "audit:read");
    const rows = await db.select().from(auditLog).where(eq(auditLog.orgId, p.orgId)).orderBy(auditLog.seq);

    let prevHash: string | null = null;
    for (const [index, row] of rows.entries()) {
      // Must match `appendAudit` exactly (no seq: insert order is not content).
      const expected = await canonicalSha256({
        orgId: row.orgId,
        actorType: row.actorType,
        actorId: row.actorId,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        metadata: row.metadata,
        prevHash: row.prevHash,
      });
      if (expected !== row.hash) {
        return { valid: false, checked: index + 1, brokenAtSeq: row.seq, reason: "hash_mismatch" };
      }
      if (row.prevHash !== prevHash) {
        return { valid: false, checked: index + 1, brokenAtSeq: row.seq, reason: "chain_link_mismatch" };
      }
      prevHash = row.hash;
    }
    return { valid: true, checked: rows.length, head: prevHash };
  });

  // -------------------------------------------------------------------------
  // Local bootstrapping (development only — refused in production)
  // -------------------------------------------------------------------------

  app.get("/v1/bootstrap/status", async (req) => {
    let demoPrincipals: Record<string, string> | null = null;
    if (config.ALLOW_BOOTSTRAP && existsSync("/tmp/apn-seed.json")) {
      try {
        demoPrincipals = JSON.parse(readFileSync("/tmp/apn-seed.json", "utf8")) as Record<string, string>;
      } catch {
        demoPrincipals = null;
      }
    }
    const q = (req.query ?? {}) as { ensure?: string };
    if (config.ALLOW_BOOTSTRAP && q.ensure === "1") {
      let valid = false;
      const tok = demoPrincipals?.northwind_owner;
      if (tok && tok.startsWith("apn_u_")) {
        const prefix = tok.split("_")[2] ?? "";
        if (prefix) {
          const [row] = await db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.prefix, prefix)).limit(1);
          valid = Boolean(row);
        }
      }
      if (!valid) {
        try {
          const { seed } = await import("../../scripts/seed.js");
          await seed(db, { rotate: true });
          if (existsSync("/tmp/apn-seed.json")) {
            demoPrincipals = JSON.parse(readFileSync("/tmp/apn-seed.json", "utf8")) as Record<string, string>;
          }
        } catch {
          // Ignore seed error if concurrent
        }
      }
    }
    return { enabled: config.ALLOW_BOOTSTRAP, demoPrincipals };
  });

  /**
   * Creates organization + owner + API key + default policy in one transaction.
   * Guarded by ALLOW_BOOTSTRAP, which `loadConfig` refuses to enable in
   * production. This is a developer bootstrap, not a self-serve signup.
   */
  app.post("/v1/bootstrap", async (req, reply) => {
    if (!config.ALLOW_BOOTSTRAP) throw preconditionFailed("Bootstrap is disabled on this deployment");
    const body = parse(
      z.object({
        orgName: z.string().min(2).max(120),
        slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,40}$/),
        email: z.string().email(),
        displayName: z.string().min(1).max(120),
      }),
      req.body,
    );

    const token = generateToken("user");
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, body.slug))
        .limit(1);
      if (existing) throw badRequest("slug already in use");

      const [org] = await tx.insert(organizations).values({ name: body.orgName, slug: body.slug }).returning();
      const [user] = await tx
        .insert(users)
        .values({ orgId: org!.id, email: body.email, displayName: body.displayName, role: "owner" })
        .returning();
      await tx.insert(apiKeys).values({
        orgId: org!.id,
        userId: user!.id,
        name: "Bootstrap key",
        prefix: token.prefix,
        secretHash: token.secretHash,
        scopes: [],
      });

      const draft = await createPolicyVersion(tx as unknown as Database, org!.id, defaultPolicyDocument(), user!.id);
      await activatePolicy(tx as unknown as Database, org!.id, draft.id, user!.id);

      await appendAudit(tx as unknown as Database, {
        orgId: org!.id,
        actorType: "system",
        actorId: null,
        action: "org.bootstrapped",
        resourceType: "organization",
        resourceId: org!.id,
        metadata: { slug: body.slug },
      });

      return { org, user, policy: { id: draft.id, version: draft.version, hash: draft.hash } };
    });

    return reply.status(201).send({
      org: result.org,
      user: { id: result.user!.id, email: result.user!.email, role: result.user!.role },
      token: token.token,
      policy: result.policy,
      warning: "Store this token now; it is shown once and only its hash is persisted.",
    });
  });
}
