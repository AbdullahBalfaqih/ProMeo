import type { FastifyReply, FastifyRequest } from "fastify";
import type { z, ZodTypeAny } from "zod";
import type { Database } from "../db/client.js";
import { idempotencyKeys } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { AppError, badRequest, conflict } from "./errors.js";
import { canonicalSha256 } from "./canonical.js";
import type { Principal } from "../types.js";

export function parse<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const res = schema.safeParse(value);
  if (!res.success) {
    throw badRequest(
      "Request validation failed",
      res.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return res.data;
}

export function principalOf(req: FastifyRequest): Principal {
  if (!req.principal) throw new AppError(401, "unauthorized", "Authentication required");
  return req.principal;
}

export function parseLimit(value: unknown, def = 25, max = 100): number {
  const n = Number(value ?? def);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(Math.trunc(n), 1), max);
}

export interface IdempotentResult<T> {
  replayed: boolean;
  status: number;
  body: T;
}

/**
 * Idempotency for unsafe operations. The key is scoped per tenant. Replaying the
 * same key with a different body is a conflict (never silently returns a stale
 * response for a different intent).
 */
export async function withIdempotency<T>(
  db: Database,
  req: FastifyRequest,
  principal: Principal,
  fn: () => Promise<{ status: number; body: T }>,
): Promise<IdempotentResult<T>> {
  const key = req.headers["idempotency-key"];
  if (typeof key !== "string" || key.length < 8 || key.length > 200) {
    return { replayed: false, ...(await fn()) };
  }

  const requestHash = await canonicalSha256({ method: req.method, url: req.url, body: req.body ?? null });
  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.orgId, principal.orgId), eq(idempotencyKeys.key, key)))
    .limit(1);

  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw conflict("Idempotency key was already used with a different request body");
    }
    return { replayed: true, status: existing.responseStatus, body: existing.responseBody as T };
  }

  const result = await fn();
  await db
    .insert(idempotencyKeys)
    .values({
      orgId: principal.orgId,
      key,
      method: req.method,
      path: req.url.split("?")[0] ?? req.url,
      requestHash,
      responseStatus: result.status,
      responseBody: result.body as unknown,
    })
    .onConflictDoNothing();
  return { replayed: false, ...result };
}

export function sendIdempotent<T>(reply: FastifyReply, result: IdempotentResult<T>) {
  if (result.replayed) reply.header("idempotent-replay", "true");
  return reply.status(result.status).send(result.body);
}
