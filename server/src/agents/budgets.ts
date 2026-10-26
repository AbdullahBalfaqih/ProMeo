import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { agentBudgets, budgetReservations } from "../db/schema.js";
import { budgetExceeded } from "../lib/errors.js";

type Tx = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface BudgetContext {
  orgId: string;
  agentId: string;
  requestId?: string;
  amount: bigint;
  now?: Date;
}

type Window = "daily" | "monthly" | "per_request";

const WINDOW_ORDER: Window[] = ["per_request", "daily", "monthly"];

/**
 * Atomically reserves `amount` against every active budget window of an agent.
 *
 * The check-and-reserve is a single conditional UPDATE per window
 * (`reserved = reserved + amount WHERE spent + reserved + amount <= limit`),
 * so two concurrent reservations can never both pass a stale read. Windows are
 * updated in a fixed order to avoid deadlocks between concurrent workers.
 *
 * Throws `budget_exceeded` (422) if any window would be exceeded; the enclosing
 * transaction rolls back all prior reservations.
 */
export async function reserveBudget(tx: Tx, ctx: BudgetContext): Promise<string[]> {
  const now = ctx.now ?? new Date();
  const reservationIds: string[] = [];
  const budgetsToTouch: Array<{ id: string; amount: bigint }> = [];

  for (const window of WINDOW_ORDER) {
    const budget = await ensureCurrentBudget(tx, ctx.agentId, ctx.orgId, window, now);
    if (!budget || !budget.active) continue;

    if (window === "per_request") {
      if (ctx.amount > BigInt(budget.limitAmount)) {
        throw budgetExceeded(`per-request limit exceeded: ${ctx.amount} > ${budget.limitAmount}`, {
          window,
          limit: budget.limitAmount,
        });
      }
      budgetsToTouch.push({ id: budget.id, amount: ctx.amount });
      continue;
    }

    const updated = await tx
      .update(agentBudgets)
      .set({
        reservedAmount: sql`${agentBudgets.reservedAmount} + ${ctx.amount.toString()}::numeric`,
        updatedAt: now,
      })
      .where(
        and(
          eq(agentBudgets.id, budget.id),
          sql`(${agentBudgets.spentAmount} + ${agentBudgets.reservedAmount} + ${ctx.amount.toString()}::numeric) <= ${agentBudgets.limitAmount}`,
        ),
      )
      .returning({ id: agentBudgets.id });

    if (updated.length === 0) {
      throw budgetExceeded(`budget window ${window} would be exceeded`, {
        window,
        limit: budget.limitAmount,
        remaining: (BigInt(budget.limitAmount) - BigInt(budget.spentAmount) - BigInt(budget.reservedAmount)).toString(),
      });
    }
    budgetsToTouch.push({ id: budget.id, amount: ctx.amount });
  }

  const expiresAt = new Date(now.getTime() + 30 * 60_000);
  for (const b of budgetsToTouch) {
    const [row] = await tx
      .insert(budgetReservations)
      .values({
        orgId: ctx.orgId,
        agentId: ctx.agentId,
        budgetId: b.id,
        requestId: ctx.requestId,
        amount: b.amount.toString(),
        status: "held",
        expiresAt,
      })
      .returning({ id: budgetReservations.id });
    if (!row) throw new Error("failed to create budget reservation");
    reservationIds.push(row.id);
  }

  return reservationIds;
}

/** Converts held reservations into spent budget (called when escrow is funded). */
export async function captureReservations(tx: Tx, reservationIds: string[]): Promise<void> {
  const now = new Date();
  for (const id of reservationIds) {
    const [res] = await tx
      .update(budgetReservations)
      .set({ status: "captured", updatedAt: now })
      .where(and(eq(budgetReservations.id, id), eq(budgetReservations.status, "held")))
      .returning({ budgetId: budgetReservations.budgetId, amount: budgetReservations.amount });
    if (!res) continue;
    await tx
      .update(agentBudgets)
      .set({
        reservedAmount: sql`GREATEST(${agentBudgets.reservedAmount} - ${res.amount}::numeric, 0)`,
        spentAmount: sql`${agentBudgets.spentAmount} + ${res.amount}::numeric`,
        updatedAt: now,
      })
      .where(eq(agentBudgets.id, res.budgetId));
  }
}

/** Releases held reservations without spending them. */
export async function releaseReservations(tx: Tx, reservationIds: string[]): Promise<void> {
  const now = new Date();
  for (const id of reservationIds) {
    const [res] = await tx
      .update(budgetReservations)
      .set({ status: "released", updatedAt: now })
      .where(and(eq(budgetReservations.id, id), eq(budgetReservations.status, "held")))
      .returning({ budgetId: budgetReservations.budgetId, amount: budgetReservations.amount });
    if (!res) continue;
    await tx
      .update(agentBudgets)
      .set({
        reservedAmount: sql`GREATEST(${agentBudgets.reservedAmount} - ${res.amount}::numeric, 0)`,
        updatedAt: now,
      })
      .where(eq(agentBudgets.id, res.budgetId));
  }
}

/** Releases reservations whose hold has expired; safe to run repeatedly. */
export async function expireStaleReservations(tx: Tx, now = new Date()): Promise<number> {
  const stale = await tx
    .update(budgetReservations)
    .set({ status: "expired", updatedAt: now })
    .where(and(eq(budgetReservations.status, "held"), sql`${budgetReservations.expiresAt} < ${now.toISOString()}`))
    .returning({ id: budgetReservations.id, budgetId: budgetReservations.budgetId, amount: budgetReservations.amount });

  for (const r of stale) {
    await tx
      .update(agentBudgets)
      .set({
        reservedAmount: sql`GREATEST(${agentBudgets.reservedAmount} - ${r.amount}::numeric, 0)`,
        updatedAt: now,
      })
      .where(eq(agentBudgets.id, r.budgetId));
  }
  return stale.length;
}

async function ensureCurrentBudget(
  tx: Tx,
  agentId: string,
  orgId: string,
  window: Window,
  now: Date,
): Promise<{ id: string; limitAmount: string; spentAmount: string; reservedAmount: string; active: boolean } | null> {
  const [latest] = await tx
    .select()
    .from(agentBudgets)
    .where(and(eq(agentBudgets.agentId, agentId), eq(agentBudgets.window, window)))
    .orderBy(sql`${agentBudgets.periodStart} DESC`)
    .limit(1);

  if (!latest) return null;
  if (window === "per_request" || (latest.periodStart <= now && now < latest.periodEnd)) {
    return {
      id: latest.id,
      limitAmount: latest.limitAmount,
      spentAmount: latest.spentAmount,
      reservedAmount: latest.reservedAmount,
      active: true,
    };
  }
  if (now < latest.periodStart) {
    return {
      id: latest.id,
      limitAmount: latest.limitAmount,
      spentAmount: latest.spentAmount,
      reservedAmount: latest.reservedAmount,
      active: true,
    };
  }

  // Roll the period forward, carrying the configured limit only.
  const { start, end } = periodFor(window, now);
  const [created] = await tx
    .insert(agentBudgets)
    .values({
      orgId,
      agentId,
      window,
      limitAmount: latest.limitAmount,
      spentAmount: "0",
      reservedAmount: "0",
      periodStart: start,
      periodEnd: end,
    })
    .onConflictDoNothing()
    .returning();

  if (created) {
    return {
      id: created.id,
      limitAmount: created.limitAmount,
      spentAmount: created.spentAmount,
      reservedAmount: created.reservedAmount,
      active: true,
    };
  }
  const [again] = await tx
    .select()
    .from(agentBudgets)
    .where(and(eq(agentBudgets.agentId, agentId), eq(agentBudgets.window, window), eq(agentBudgets.periodStart, start)))
    .limit(1);
  return again
    ? {
        id: again.id,
        limitAmount: again.limitAmount,
        spentAmount: again.spentAmount,
        reservedAmount: again.reservedAmount,
        active: true,
      }
    : null;
}

export function periodFor(window: Window, now: Date): { start: Date; end: Date } {
  if (window === "daily") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { start, end: new Date(start.getTime() + 24 * 3600_000) };
  }
  if (window === "monthly") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { start, end };
  }
  const epoch = new Date(0);
  return { start: epoch, end: new Date(Date.UTC(9999, 0, 1)) };
}
