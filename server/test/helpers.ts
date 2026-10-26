import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "../src/config.js";
import { createDb, type Database } from "../src/db/client.js";
import { buildApp } from "../src/app.js";

export const config = loadConfig();

export function testDb(): { db: Database; close: () => Promise<void> } {
  const handle = createDb(config.DATABASE_URL, 8);
  return { db: handle.db, close: handle.close };
}

/** Truncates every tenant table. Order is irrelevant thanks to CASCADE. */
export async function resetDb(db: Database) {
  const tables = [
    "webhook_deliveries",
    "webhook_endpoints",
    "chain_events",
    "disputes",
    "budget_reservations",
    "agent_budgets",
    "agreements",
    "offers",
    "approvals",
    "request_events",
    "procurement_requests",
    "vendor_services",
    "vendors",
    "agents",
    "agent_credentials",
    "api_keys",
    "users",
    "policy_evaluations",
    "policies",
    "audit_log",
    "idempotency_keys",
    "indexer_cursors",
    "indexer_reorgs",
    "organizations",
  ];
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`));
}

export async function makeApp(db: Database): Promise<FastifyInstance> {
  return buildApp(db, config);
}

export async function bootstrap(
  app: FastifyInstance,
  slug = `org-${randomUUID().slice(0, 8)}`,
): Promise<{ token: string; orgId: string; userId: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/v1/bootstrap",
    payload: { orgName: `Org ${slug}`, slug, email: `owner@${slug}.test`, displayName: "Owner" },
  });
  if (res.statusCode !== 201) throw new Error(`bootstrap failed: ${res.statusCode} ${res.body}`);
  const body = res.json() as { token: string; org: { id: string }; user: { id: string } };
  return { token: body.token, orgId: body.org.id, userId: body.user.id };
}

export function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

export async function json<T = any>(
  app: FastifyInstance,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  url: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: T }> {
  const res = await app.inject({
    method,
    url,
    headers: { ...(opts.token ? auth(opts.token) : {}), ...opts.headers },
    ...(opts.body !== undefined ? { payload: opts.body as object } : {}),
  });
  return { status: res.statusCode, body: res.body ? (res.json() as T) : (undefined as T) };
}
