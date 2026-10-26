import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { agentBudgets, agents, budgetReservations, organizations, users } from "../src/db/schema.js";
import { captureReservations, releaseReservations, reserveBudget } from "../src/agents/budgets.js";
import { testDb, resetDb } from "./helpers.js";

const { db, close } = testDb();
const ORG = randomUUID();

beforeEach(async () => {
  await resetDb(db);
  await db.insert(organizations).values({ id: ORG, name: "Budget Org", slug: `budget-${ORG.slice(0, 8)}` });
  const [u] = await db
    .insert(users)
    .values({ orgId: ORG, email: "o@budget.test", displayName: "Owner", role: "owner" })
    .returning();
  void u;
});

afterAll(async () => {
  await close();
});

async function makeAgent(limits: { daily?: bigint; monthly?: bigint; perRequest?: bigint }) {
  const [agent] = await db
    .insert(agents)
    .values({
      orgId: ORG,
      name: "agent",
      walletAddress: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
      scopes: ["request:create"],
      trustLevel: 2,
    })
    .returning();
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = [];
  if (limits.daily !== undefined)
    rows.push({
      orgId: ORG,
      agentId: agent!.id,
      window: "daily" as const,
      limitAmount: limits.daily.toString(),
      periodStart: dayStart,
      periodEnd: new Date(dayStart.getTime() + 86400_000),
    });
  if (limits.monthly !== undefined)
    rows.push({
      orgId: ORG,
      agentId: agent!.id,
      window: "monthly" as const,
      limitAmount: limits.monthly.toString(),
      periodStart: monthStart,
      periodEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
    });
  if (limits.perRequest !== undefined)
    rows.push({
      orgId: ORG,
      agentId: agent!.id,
      window: "per_request" as const,
      limitAmount: limits.perRequest.toString(),
      periodStart: new Date(0),
      periodEnd: new Date(Date.UTC(9999, 0, 1)),
    });
  await db.insert(agentBudgets).values(rows);
  return agent!;
}

const M = (n: number) => BigInt(n) * 10n ** 18n;

describe("atomic budget reservation", () => {
  it("never lets concurrent reservations exceed the daily limit", async () => {
    const agent = await makeAgent({ daily: M(1000) });

    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        db.transaction((tx) => reserveBudget(tx as never, { orgId: ORG, agentId: agent.id, amount: M(300) })),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toBe(3);
    expect(rejected.every((r) => r.reason?.code === "budget_exceeded")).toBe(true);

    const [budget] = await db.select().from(agentBudgets).where(eq(agentBudgets.agentId, agent.id));
    expect(BigInt(budget!.reservedAmount)).toBe(M(900));
    expect(BigInt(budget!.spentAmount)).toBe(0n);
  });

  it("enforces the per-request window without accumulating", async () => {
    const agent = await makeAgent({ daily: M(10_000), perRequest: M(250) });
    await expect(
      db.transaction((tx) => reserveBudget(tx as never, { orgId: ORG, agentId: agent.id, amount: M(251) })),
    ).rejects.toMatchObject({ code: "budget_exceeded", status: 422 });

    // Consecutive reservations under the cap are allowed: it is a per-request cap.
    const first = await db.transaction((tx) => reserveBudget(tx as never, { orgId: ORG, agentId: agent.id, amount: M(200) }));
    await db.transaction((tx) => releaseReservations(tx as never, first));
    const second = await db.transaction((tx) => reserveBudget(tx as never, { orgId: ORG, agentId: agent.id, amount: M(200) }));
    expect(second).toHaveLength(2);
  });

  it("checks every window and rolls back all of them on failure", async () => {
    const agent = await makeAgent({ daily: M(1000), monthly: M(500) });
    await expect(
      db.transaction((tx) => reserveBudget(tx as never, { orgId: ORG, agentId: agent.id, amount: M(600) })),
    ).rejects.toMatchObject({ code: "budget_exceeded" });

    const rows = await db.select().from(agentBudgets).where(eq(agentBudgets.agentId, agent.id));
    for (const row of rows) expect(BigInt(row.reservedAmount)).toBe(0n);
    const res = await db.select().from(budgetReservations);
    expect(res).toHaveLength(0);
  });

  it("captures a hold into spend atomically", async () => {
    const agent = await makeAgent({ daily: M(1000) });
    const ids = await db.transaction((tx) => reserveBudget(tx as never, { orgId: ORG, agentId: agent.id, amount: M(400) }));
    await db.transaction((tx) => captureReservations(tx as never, [ids[0]!]));

    const [budget] = await db.select().from(agentBudgets).where(eq(agentBudgets.agentId, agent.id));
    expect(BigInt(budget!.reservedAmount)).toBe(0n);
    expect(BigInt(budget!.spentAmount)).toBe(M(400));

    const [res] = await db.select().from(budgetReservations).where(eq(budgetReservations.id, ids[0]!));
    expect(res!.status).toBe("captured");

    // Releasing a captured hold must not decrement spend.
    await db.transaction((tx) => releaseReservations(tx as never, ids));
    const [after] = await db.select().from(agentBudgets).where(eq(agentBudgets.agentId, agent.id));
    expect(BigInt(after!.spentAmount)).toBe(M(400));
    expect(BigInt(after!.reservedAmount)).toBe(0n);
  });

  it("refuses when the agent has no budget at all", async () => {
    const agent = await makeAgent({ daily: 0n });
    await expect(
      db.transaction((tx) => reserveBudget(tx as never, { orgId: ORG, agentId: agent.id, amount: 1n })),
    ).rejects.toMatchObject({ code: "budget_exceeded" });
  });
});
