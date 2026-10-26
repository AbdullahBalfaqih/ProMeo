import { and, eq, lte, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { webhookDeliveries, webhookEndpoints } from "../db/schema.js";
import { canonicalSha256, canonicalize } from "../lib/canonical.js";
import { hmacSha256Hex, openSecret } from "../lib/crypto.js";
import type { Config } from "../config.js";

type Tx = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Queues one delivery row per subscribed, active endpoint. Delivery is
 * at-least-once and exactly-once per (endpoint, eventId) thanks to the unique
 * index; consumers must dedupe on `x-apn-event-id`.
 */
export async function enqueueEvent(
  tx: Tx,
  orgId: string,
  eventType: string,
  payload: Record<string, unknown>,
  opts: { sourceKey?: string } = {},
): Promise<string> {
  const eventId = crypto.randomUUID();
  const body = { id: eventId, type: eventType, createdAt: new Date().toISOString(), data: payload };
  const payloadHash = await canonicalSha256(body);

  const endpoints = await tx
    .select({ id: webhookEndpoints.id, events: webhookEndpoints.events })
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.orgId, orgId), eq(webhookEndpoints.active, true)));

  const subscribed = endpoints.filter((e) => e.events.includes(eventType) || e.events.includes("*"));
  if (subscribed.length === 0) return eventId;

  await tx.insert(webhookDeliveries).values(
    subscribed.map((e) => ({
      orgId,
      endpointId: e.id,
      eventId,
      sourceKey: opts.sourceKey ?? null,
      eventType,
      payload: body as unknown as Record<string, unknown>,
      payloadHash,
      status: "pending" as const,
      nextAttemptAt: new Date(),
    })),
  ).onConflictDoNothing();

  return eventId;
}

export interface SignedPayload {
  timestamp: number;
  body: string;
  signature: string;
  headers: Record<string, string>;
}

/** `signature = v1=<hex hmac(secret, `${timestamp}.${body}`)>` */
export async function signWebhook(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)): Promise<SignedPayload> {
  const mac = await hmacSha256Hex(secret, `${timestamp}.${body}`);
  return {
    timestamp,
    body,
    signature: `v1=${mac}`,
    headers: {
      "content-type": "application/json",
      "x-apn-signature": `v1=${mac}`,
      "x-apn-timestamp": String(timestamp),
    },
  };
}

/** Constant-time-ish verification helper exported for SDK parity tests. */
export async function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string,
  timestampHeader: string,
  toleranceSeconds = 300,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) return false;
  const expected = await hmacSha256Hex(secret, `${ts}.${body}`);
  return timingSafeEqualHex(`v1=${expected}`, header);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface DeliveryResult {
  attempted: number;
  delivered: number;
  failed: number;
}

/**
 * Delivers due webhook rows with exponential backoff and jitter-free scheduling
 * (deterministic backoff keeps tests simple: 5s, 15s, 45s ... capped at 1h).
 */
export async function deliverDue(
  db: Database,
  config: Config,
  opts: { limit?: number; now?: Date; fetchImpl?: typeof fetch; orgId?: string } = {},
): Promise<DeliveryResult> {
  if (!config.SECRET_ENCRYPTION_KEY) throw new Error("SECRET_ENCRYPTION_KEY is required to sign webhooks");
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 20;
  const doFetch = opts.fetchImpl ?? fetch;

  const due = await db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.status, "pending"),
        lte(webhookDeliveries.nextAttemptAt, now),
        ...(opts.orgId ? [eq(webhookDeliveries.orgId, opts.orgId)] : []),
      ),
    )
    .limit(limit);

  let delivered = 0;
  let failed = 0;

  for (const row of due) {
    const [endpoint] = await db
      .select()
      .from(webhookEndpoints)
      .where(and(eq(webhookEndpoints.id, row.endpointId), eq(webhookEndpoints.active, true)))
      .limit(1);

    if (!endpoint) {
      await db
        .update(webhookDeliveries)
        .set({ status: "abandoned", lastError: "endpoint disabled" })
        .where(eq(webhookDeliveries.id, row.id));
      continue;
    }

    // Claim the row optimistically so two workers never double-deliver.
    const claimed = await db
      .update(webhookDeliveries)
      .set({ status: "delivering", attempts: row.attempts + 1 })
      .where(and(eq(webhookDeliveries.id, row.id), eq(webhookDeliveries.status, "pending")))
      .returning({ id: webhookDeliveries.id });
    if (claimed.length === 0) continue;

    const attempts = row.attempts + 1;
    const body = canonicalize(row.payload as never);
    let secret: string;
    try {
      secret = openSecret(endpoint.secretSealed, config.SECRET_ENCRYPTION_KEY);
    } catch {
      await db
        .update(webhookDeliveries)
        .set({ status: "abandoned", lastError: "cannot unseal endpoint secret" })
        .where(eq(webhookDeliveries.id, row.id));
      continue;
    }

    const signed = await signWebhook(secret, body);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.WEBHOOK_TIMEOUT_MS);
      const res = await doFetch(endpoint.url, {
        method: "POST",
        headers: {
          ...signed.headers,
          "x-apn-event-id": row.eventId,
          "x-apn-delivery-id": row.id,
          "user-agent": "apn-webhooks/1.0",
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status >= 200 && res.status < 300) {
        delivered += 1;
        await db
          .update(webhookDeliveries)
          .set({ status: "delivered", deliveredAt: new Date(), lastResponseCode: res.status })
          .where(eq(webhookDeliveries.id, row.id));
      } else {
        failed += 1;
        await scheduleRetry(db, config, row.id, attempts, res.status, `HTTP ${res.status}`);
      }
    } catch (err) {
      failed += 1;
      await scheduleRetry(db, config, row.id, attempts, null, (err as Error).message);
    }
  }

  return { attempted: due.length, delivered, failed };
}

async function scheduleRetry(
  db: Database,
  config: Config,
  id: string,
  attempts: number,
  code: number | null,
  error: string,
): Promise<void> {
  if (attempts >= config.WEBHOOK_MAX_ATTEMPTS) {
    await db
      .update(webhookDeliveries)
      .set({ status: "abandoned", lastResponseCode: code, lastError: error })
      .where(eq(webhookDeliveries.id, id));
    return;
  }
  const delaySeconds = Math.min(5 * 3 ** (attempts - 1), 3600);
  await db
    .update(webhookDeliveries)
    .set({
      status: "pending",
      lastResponseCode: code,
      lastError: error.slice(0, 500),
      nextAttemptAt: new Date(Date.now() + delaySeconds * 1000),
    })
    .where(eq(webhookDeliveries.id, id));
}

export const WEBHOOK_EVENTS = [
  "request.created",
  "request.published",
  "request.pending_approval",
  "request.approved",
  "request.rejected",
  "request.awarded",
  "request.cancelled",
  "offer.submitted",
  "agreement.created",
  "agreement.funded",
  "agreement.accepted",
  "agreement.delivered",
  "agreement.released",
  "agreement.refunded",
  "agreement.disputed",
  "dispute.resolved",
  "agent.revoked",
  "budget.threshold",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

export async function resetStuckDeliveries(db: Database, olderThanSeconds = 300): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanSeconds * 1000);
  const res = await db
    .update(webhookDeliveries)
    .set({ status: "pending" })
    .where(and(eq(webhookDeliveries.status, "delivering"), sql`${webhookDeliveries.createdAt} < ${cutoff.toISOString()}`))
    .returning({ id: webhookDeliveries.id });
  return res.length;
}
