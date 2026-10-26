import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Database } from "../db/client.js";
import type { Config } from "../config.js";
import {
  agentBudgets,
  agentCredentials,
  agents,
  apiKeys,
  budgetReservations,
  organizations,
  users,
} from "../db/schema.js";
import { generateToken } from "../lib/crypto.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { parse, parseLimit, principalOf, withIdempotency, sendIdempotent } from "../lib/http.js";
import { formatMusd } from "../lib/money.js";
import { periodFor } from "../agents/budgets.js";
import { appendAudit } from "../lib/audit.js";
import { requirePermission, requireUser } from "../auth/service.js";
import { AGENT_SCOPES, USER_ROLE_PERMISSIONS, isAgentScope } from "../auth/rbac.js";
import { escrowConfig, readAgentAuthorization } from "../escrow/client.js";
import { createPolicyVersion, activatePolicy } from "../policy/service.js";
import { defaultPolicyDocument } from "../policy/defaults.js";
import type { Address } from "viem";
import {
  CreateAgent,
  CreateApiKey,
  IssueCredential,
  SetBudgets,
  UpdateOrg,
  UpdateAgent,
  Uuid,
  Pagination,
} from "./schemas.js";

export function registerIdentityRoutes(app: FastifyInstance, db: Database, config: Config) {
  // -----------------------------------------------------------------------
  // Wallet Authentication
  // -----------------------------------------------------------------------

  app.post("/v1/auth/wallet", async (req, reply) => {
    const body = parse(
      z.object({
        walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      }),
      req.body,
    );

    const addr = body.walletAddress.toLowerCase();

    // 1. Look for existing org matching this walletAddress (case-insensitive)
    const [existingOrg] = await db
      .select()
      .from(organizations)
      .where(sql`LOWER(${organizations.walletAddress}) = ${addr}`)
      .limit(1);

    if (existingOrg) {
      const [owner] = await db
        .select()
        .from(users)
        .where(and(eq(users.orgId, existingOrg.id), eq(users.role, "owner")))
        .limit(1);

      if (owner) {
        const token = generateToken("user");
        await db.insert(apiKeys).values({
          orgId: existingOrg.id,
          userId: owner.id,
          name: "Wallet session " + new Date().toISOString(),
          prefix: token.prefix,
          secretHash: token.secretHash,
          scopes: [],
        });

        return reply.status(200).send({
          org: existingOrg,
          user: { id: owner.id, email: owner.email, role: owner.role, displayName: owner.displayName },
          token: token.token,
          sessionToken: token.token,
          isNew: false,
        });
      }
    }

    // 2. If not existing, provision a fresh dedicated organization for this wallet
    const token = generateToken("user");
    const shortAddr = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    const orgName = `Org ${shortAddr}`;
    const slug = `org-${addr.slice(2, 10).toLowerCase()}-${Date.now().toString(36)}`;
    const email = `${addr.slice(0, 10).toLowerCase()}@apn.wallet`;

    const result = await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({
          name: orgName,
          slug,
          walletAddress: addr,
          chainId: config.MEZO_CHAIN_ID,
        })
        .returning();

      const [user] = await tx
        .insert(users)
        .values({
          orgId: org!.id,
          email,
          displayName: shortAddr,
          role: "owner",
        })
        .returning();

      await tx.insert(apiKeys).values({
        orgId: org!.id,
        userId: user!.id,
        name: "Wallet session key",
        prefix: token.prefix,
        secretHash: token.secretHash,
        scopes: [],
      });

      const draft = await createPolicyVersion(tx as unknown as Database, org!.id, defaultPolicyDocument(), user!.id);
      await activatePolicy(tx as unknown as Database, org!.id, draft.id, user!.id);

      await appendAudit(tx as unknown as Database, {
        orgId: org!.id,
        actorType: "user",
        actorId: user!.id,
        action: "org.wallet_authenticated",
        resourceType: "organization",
        resourceId: org!.id,
        metadata: { walletAddress: addr },
      });

      return { org, user };
    });

    return reply.status(201).send({
      org: result.org,
      user: { id: result.user!.id, email: result.user!.email, role: result.user!.role, displayName: result.user!.displayName },
      token: token.token,
      sessionToken: token.token,
      isNew: true,
    });
  });

  // -----------------------------------------------------------------------
  // Organization
  // -----------------------------------------------------------------------

  app.get("/v1/org", async (req) => {
    const p = principalOf(req);
    const [org] = await db.select().from(organizations).where(eq(organizations.id, p.orgId)).limit(1);
    if (!org) throw notFound("Organization not found");
    return { org, role: p.kind === "user" ? p.role : "agent", principal: p.kind };
  });

  app.patch("/v1/org", async (req) => {
    const p = requirePermission(req.principal, "org:manage");
    const body = parse(UpdateOrg, req.body);
    const [org] = await db
      .update(organizations)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(organizations.id, p.orgId))
      .returning();
    if (!org) throw notFound("Organization not found");
    await appendAudit(db, {
      orgId: p.orgId,
      actorType: p.kind,
      actorId: p.kind === "user" ? p.userId : p.agentId,
      action: "org.updated",
      resourceType: "organization",
      resourceId: p.orgId,
      metadata: { fields: Object.keys(body) },
    });
    return { org };
  });

  app.get("/v1/org/members", async (req) => {
    const p = requirePermission(req.principal, "org:read");
    return {
      data: await db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          role: users.role,
          status: users.status,
        })
        .from(users)
        .where(eq(users.orgId, p.orgId))
        .orderBy(desc(users.createdAt)),
    };
  });

  /** Owner/admin creates a teammate and issues their first API key. */
  app.post("/v1/org/members", async (req, reply) => {
    const p = requirePermission(req.principal, "user:manage");
    requireUser(p);
    const body = parse(
      z.object({
        email: z.string().email(),
        displayName: z.string().min(2).max(120),
        role: z.enum(["admin", "procurement_manager", "approver", "finance", "auditor", "viewer"]),
      }),
      req.body,
    );
    const token = generateToken("user");

    const result = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ orgId: p.orgId, email: body.email, displayName: body.displayName, role: body.role })
        .returning();
      if (!user) throw new Error("user insert failed");
      await tx.insert(apiKeys).values({
        orgId: p.orgId,
        userId: user.id,
        name: `${body.displayName} — first key`,
        prefix: token.prefix,
        secretHash: token.secretHash,
        scopes: [],
      });
      return user;
    });

    await appendAudit(db, {
      orgId: p.orgId,
      actorType: "user",
      actorId: p.kind === "user" ? p.userId : p.agentId,
      action: "org.member_created",
      resourceType: "user",
      resourceId: result.id,
      metadata: { role: body.role },
    });

    return reply.status(201).send({
      user: { id: result.id, email: result.email, displayName: result.displayName, role: result.role },
      token: token.token,
      warning: "Store this token now; it will never be shown again.",
    });
  });

  // -----------------------------------------------------------------------
  // API keys (human credentials)
  // -----------------------------------------------------------------------

  app.get("/v1/api-keys", async (req) => {
    const p = requirePermission(req.principal, "apikey:manage");
    return {
      data: await db
        .select({
          id: apiKeys.id,
          name: apiKeys.name,
          prefix: apiKeys.prefix,
          scopes: apiKeys.scopes,
          lastUsedAt: apiKeys.lastUsedAt,
          expiresAt: apiKeys.expiresAt,
          revokedAt: apiKeys.revokedAt,
          createdAt: apiKeys.createdAt,
        })
        .from(apiKeys)
        .where(eq(apiKeys.orgId, p.orgId))
        .orderBy(desc(apiKeys.createdAt)),
    };
  });

  app.post("/v1/api-keys", async (req, reply) => {
    const p = requirePermission(req.principal, "apikey:manage");
    const user = requireUser(p);
    const body = parse(CreateApiKey, req.body);

    const rolePerms = USER_ROLE_PERMISSIONS[user.role] ?? new Set<string>();
    const scopes = body.scopes ?? [];
    for (const s of scopes) {
      if (!rolePerms.has(s as never)) throw badRequest(`scope ${s} exceeds the role's permissions`);
    }

    const token = generateToken("user");
    const [row] = await db
      .insert(apiKeys)
      .values({
        orgId: p.orgId,
        userId: user.userId,
        name: body.name,
        prefix: token.prefix,
        secretHash: token.secretHash,
        scopes,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      })
      .returning({ id: apiKeys.id, prefix: apiKeys.prefix, name: apiKeys.name, createdAt: apiKeys.createdAt });

    await appendAudit(db, {
      orgId: p.orgId,
      actorType: "user",
      actorId: user.userId,
      action: "apikey.created",
      resourceType: "api_key",
      resourceId: row?.id,
      metadata: { scopes },
    });

    return reply.status(201).send({
      apiKey: row,
      token: token.token,
      warning: "Store this token now; it will never be shown again.",
    });
  });

  app.delete("/v1/api-keys/:id", async (req, reply) => {
    const p = requirePermission(req.principal, "apikey:manage");
    const { id } = parse(z.object({ id: Uuid }), req.params);
    const res = await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.orgId, p.orgId)))
      .returning({ id: apiKeys.id });
    if (res.length === 0) throw notFound("API key not found");
    return reply.status(204).send();
  });

  // -----------------------------------------------------------------------
  // Agents
  // -----------------------------------------------------------------------

  app.get("/v1/agents", async (req) => {
    const p = requirePermission(req.principal, "agent:manage");
    const rows = await db.select().from(agents).where(eq(agents.orgId, p.orgId)).orderBy(desc(agents.createdAt));
    return { data: rows };
  });

  app.post("/v1/agents", async (req, reply) => {
    const p = requirePermission(req.principal, "agent:manage");
    const body = parse(CreateAgent, req.body);
    for (const s of body.scopes) if (!isAgentScope(s)) throw badRequest(`invalid agent scope ${s}`);

    const result = await withIdempotency(db, req, p, async () => {
      const [row] = await db
        .insert(agents)
        .values({
          orgId: p.orgId,
          name: body.name,
          description: body.description,
          walletAddress: body.walletAddress.toLowerCase(),
          scopes: body.scopes,
          trustLevel: body.trustLevel,
          createdByUserId: p.kind === "user" ? p.userId : null,
        })
        .returning();
      if (!row) throw new Error("agent insert failed");
      await appendAudit(db, {
        orgId: p.orgId,
        actorType: p.kind,
        actorId: p.kind === "user" ? p.userId : p.agentId,
        action: "agent.created",
        resourceType: "agent",
        resourceId: row.id,
        metadata: { scopes: body.scopes, trustLevel: body.trustLevel },
      });
      return { status: 201, body: { agent: row } };
    });
    return sendIdempotent(reply, result);
  });

  app.get("/v1/agents/:id", async (req) => {
    const p = requirePermission(req.principal, "agent:manage");
    const id = parse(Uuid, (req.params as { id: string }).id);
    const agent = await getAgent(db, p.orgId, id);

    const budgets = await db.select().from(agentBudgets).where(eq(agentBudgets.agentId, id));
    const reservations = await db
      .select()
      .from(budgetReservations)
      .where(and(eq(budgetReservations.agentId, id), eq(budgetReservations.status, "held")));

    let onchain: unknown = null;
    let onchainNote: string | null = null;
    try {
      const cfg = escrowConfig(config);
      onchain = await readAgentAuthorization(cfg, p.orgId, agent.walletAddress as Address);
    } catch {
      onchainNote = "Escrow/registry not configured on this deployment";
    }

    return {
      agent,
      budgets: budgets.map((b) => ({
        id: b.id,
        window: b.window,
        limit: b.limitAmount,
        limitDisplay: formatMusd(BigInt(b.limitAmount)),
        spent: b.spentAmount,
        spentDisplay: formatMusd(BigInt(b.spentAmount)),
        reserved: b.reservedAmount,
        reservedDisplay: formatMusd(BigInt(b.reservedAmount)),
        periodStart: b.periodStart,
        periodEnd: b.periodEnd,
      })),
      openReservations: reservations.length,
      onchain,
      onchainNote,
    };
  });

  app.patch("/v1/agents/:id", async (req) => {
    const p = requirePermission(req.principal, "agent:manage");
    const id = parse(Uuid, (req.params as { id: string }).id);
    await getAgent(db, p.orgId, id);
    const body = parse(UpdateAgent, req.body);

    const [row] = await db
      .update(agents)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(agents.id, id), eq(agents.orgId, p.orgId)))
      .returning();

    await appendAudit(db, {
      orgId: p.orgId,
      actorType: p.kind,
      actorId: p.kind === "user" ? p.userId : p.agentId,
      action: "agent.updated",
      resourceType: "agent",
      resourceId: id,
      metadata: { fields: Object.keys(body) },
    });

    if (body.status === "revoked" || body.status === "suspended") {
      await db
        .update(agentCredentials)
        .set({ revokedAt: new Date() })
        .where(and(eq(agentCredentials.agentId, id), eq(agentCredentials.orgId, p.orgId)));
    }
    return { agent: row };
  });

  app.post("/v1/agents/:id/credentials", async (req, reply) => {
    const p = requirePermission(req.principal, "agent:manage");
    const id = parse(Uuid, (req.params as { id: string }).id);
    const agent = await getAgent(db, p.orgId, id);
    if (agent.status !== "active") throw conflict("Agent is not active");
    const body = parse(IssueCredential, req.body);

    const token = generateToken("agent");
    const expiresAt = new Date(Date.now() + body.ttlDays * 24 * 3600_000);
    const [row] = await db
      .insert(agentCredentials)
      .values({
        agentId: id,
        orgId: p.orgId,
        prefix: token.prefix,
        secretHash: token.secretHash,
        label: body.label,
        expiresAt,
      })
      .returning({ id: agentCredentials.id, label: agentCredentials.label, expiresAt: agentCredentials.expiresAt });

    await appendAudit(db, {
      orgId: p.orgId,
      actorType: p.kind,
      actorId: p.kind === "user" ? p.userId : p.agentId,
      action: "agent.credential_issued",
      resourceType: "agent",
      resourceId: id,
      metadata: { credentialId: row?.id, expiresAt: expiresAt.toISOString() },
    });

    return reply.status(201).send({
      credential: row,
      token: token.token,
      warning: "Store this token now; it will never be shown again.",
    });
  });

  app.delete("/v1/agents/:id/credentials/:credentialId", async (req, reply) => {
    const p = requirePermission(req.principal, "agent:manage");
    const { id, credentialId } = req.params as { id: string; credentialId: string };
    parse(Uuid, id);
    parse(Uuid, credentialId);
    const res = await db
      .update(agentCredentials)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(agentCredentials.id, credentialId),
          eq(agentCredentials.agentId, id),
          eq(agentCredentials.orgId, p.orgId),
        ),
      )
      .returning({ id: agentCredentials.id });
    if (res.length === 0) throw notFound("Credential not found");
    return reply.status(204).send();
  });

  app.put("/v1/agents/:id/budgets", async (req) => {
    const p = requirePermission(req.principal, "budget:manage");
    const id = parse(Uuid, (req.params as { id: string }).id);
    await getAgent(db, p.orgId, id);
    const body = parse(SetBudgets, req.body);
    const now = new Date();

    const upserts: Array<{ window: "daily" | "monthly" | "per_request"; limit: string }> = [];
    if (body.daily) upserts.push({ window: "daily", limit: body.daily });
    if (body.monthly) upserts.push({ window: "monthly", limit: body.monthly });
    if (body.perRequest) upserts.push({ window: "per_request", limit: body.perRequest });
    if (upserts.length === 0) throw badRequest("Provide at least one of daily, monthly, perRequest");

    for (const u of upserts) {
      const { start, end } = periodFor(u.window === "per_request" ? "per_request" : u.window, now);
      const [existing] = await db
        .select({ id: agentBudgets.id })
        .from(agentBudgets)
        .where(
          and(
            eq(agentBudgets.agentId, id),
            eq(agentBudgets.window, u.window),
            eq(agentBudgets.periodStart, start),
          ),
        )
        .limit(1);

      if (existing) {
        await db
          .update(agentBudgets)
          .set({ limitAmount: u.limit, updatedAt: now })
          .where(eq(agentBudgets.id, existing.id));
      } else {
        await db.insert(agentBudgets).values({
          orgId: p.orgId,
          agentId: id,
          window: u.window,
          limitAmount: u.limit,
          spentAmount: "0",
          reservedAmount: "0",
          periodStart: start,
          periodEnd: end,
        });
      }
    }

    await appendAudit(db, {
      orgId: p.orgId,
      actorType: p.kind,
      actorId: p.kind === "user" ? p.userId : p.agentId,
      action: "agent.budgets_set",
      resourceType: "agent",
      resourceId: id,
      metadata: { budgets: upserts },
    });

    const rows = await db.select().from(agentBudgets).where(eq(agentBudgets.agentId, id));
    return {
      budgets: rows.map((b) => ({
        window: b.window,
        limit: b.limitAmount,
        limitDisplay: formatMusd(BigInt(b.limitAmount)),
        spent: b.spentAmount,
        reserved: b.reservedAmount,
        periodStart: b.periodStart,
        periodEnd: b.periodEnd,
      })),
    };
  });

  app.get("/v1/agents/scopes", async () => ({ scopes: AGENT_SCOPES }));

  app.get("/v1/agents/:id/budget-reservations", async (req) => {
    const p = requirePermission(req.principal, "budget:read");
    const id = parse(Uuid, (req.params as { id: string }).id);
    await getAgent(db, p.orgId, id);
    const q = parse(Pagination, req.query);
    const rows = await db
      .select()
      .from(budgetReservations)
      .where(eq(budgetReservations.agentId, id))
      .orderBy(desc(budgetReservations.createdAt))
      .limit(parseLimit(q.limit));
    return { data: rows };
  });
}

async function getAgent(db: Database, orgId: string, id: string) {
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.orgId, orgId)))
    .limit(1);
  if (!agent) throw notFound("Agent not found");
  return agent;
}
