import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDb, type DbHandle } from "../src/db/client.js";
import * as schema from "../src/db/schema.js";
import {
  agentBudgets,
  agents,
  agreements,
  budgetReservations,
  offers,
  organizations,
  procurementRequests,
  vendors,
  webhookDeliveries,
  webhookEndpoints,
} from "../src/db/schema.js";
import { releaseReservations, reserveBudget } from "../src/agents/budgets.js";
import { projectEscrowEvent } from "../src/indexer/project.js";
import { getRequest, listRequests } from "../src/procurement/requests.js";
import { sealSecret } from "../src/lib/crypto.js";
import type { DecodedEscrowEvent } from "../src/escrow/client.js";
import type { Hex } from "viem";

const DB_URL = process.env.DATABASE_URL ?? "postgres://apn:apn_dev_password@127.0.0.1:5432/apn_test";
let handle: DbHandle;

const ORG_A = randomUUID();
const ORG_B = randomUUID();

beforeAll(async () => {
  handle = createDb(DB_URL, 12);
  await handle.db.execute(sql`select 1`);
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.db.execute(sql`
    truncate table webhook_deliveries, webhook_endpoints, chain_events, budget_reservations,
      agent_budgets, agreements, offers, procurement_requests, vendor_services, vendors,
      agents, agent_credentials, api_keys, users, policies, policy_evaluations, audit_log,
      idempotency_keys, indexer_cursors, indexer_reorgs, disputes, organizations restart identity cascade
  `);
  await handle.db.insert(organizations).values([
    { id: ORG_A, name: "Org A", slug: `org-a-${ORG_A.slice(0, 8)}` },
    { id: ORG_B, name: "Org B", slug: `org-b-${ORG_B.slice(0, 8)}` },
  ]);
});

async function makeAgent(orgId: string) {
  const [agent] = await handle.db
    .insert(agents)
    .values({
      orgId,
      name: "bot",
      walletAddress: "0x00000000000000000000000000000000000000a1",
      scopes: ["request:create"],
      trustLevel: 2,
    })
    .returning();
  return agent!;
}

async function makeBudgets(agentId: string, orgId: string, limit: bigint, windows: Array<"daily" | "monthly"> = ["daily", "monthly"]) {
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = windows.map((w) => ({
    orgId,
    agentId,
    window: w,
    limitAmount: limit.toString(),
    spentAmount: "0",
    reservedAmount: "0",
    periodStart: w === "daily" ? dayStart : monthStart,
    periodEnd: w === "daily" ? new Date(dayStart.getTime() + 86400_000) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  }));
  await handle.db.insert(agentBudgets).values(rows);
}

describe("atomic budget reservation", () => {
  it("never allows concurrent reservations to exceed the limit", async () => {
    const agent = await makeAgent(ORG_A);
    await makeBudgets(agent.id, ORG_A, 500n * 10n ** 18n, ["daily"]);

    const attempt = () =>
      handle.db.transaction(async (tx) => reserveBudget(tx, { orgId: ORG_A, agentId: agent.id, amount: 200n * 10n ** 18n }));

    const results = await Promise.allSettled(Array.from({ length: 10 }, attempt));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    const [budget] = await handle.db.select().from(agentBudgets).where(sql`${agentBudgets.agentId} = ${agent.id}`);
    const reserved = BigInt(budget!.reservedAmount);

    expect(ok).toBe(2);
    expect(failed).toBe(8);
    expect(reserved).toBe(400n * 10n ** 18n);
    expect(reserved).toBeLessThanOrEqual(BigInt(budget!.limitAmount));
  });

  it("releases holds without spending", async () => {
    const agent = await makeAgent(ORG_A);
    await makeBudgets(agent.id, ORG_A, 1000n * 10n ** 18n, ["daily"]);

    const ids = await handle.db.transaction(async (tx) =>
      reserveBudget(tx, { orgId: ORG_A, agentId: agent.id, amount: 100n * 10n ** 18n }),
    );
    await handle.db.transaction(async (tx) => releaseReservations(tx, ids));

    const [budget] = await handle.db.select().from(agentBudgets).where(sql`${agentBudgets.agentId} = ${agent.id}`);
    expect(BigInt(budget!.reservedAmount)).toBe(0n);
    expect(BigInt(budget!.spentAmount)).toBe(0n);

    const reservations = await handle.db.select().from(budgetReservations);
    expect(reservations.every((r) => r.status === "released" || r.status === "expired")).toBe(true);
  });

  it("rejects a single reservation above the per-request limit", async () => {
    const agent = await makeAgent(ORG_A);
    await makeBudgets(agent.id, ORG_A, 3000n * 10n ** 18n, ["daily"]);
    await handle.db.insert(agentBudgets).values({
      orgId: ORG_A,
      agentId: agent.id,
      window: "per_request",
      limitAmount: (500n * 10n ** 18n).toString(),
      periodStart: new Date(0),
      periodEnd: new Date(Date.UTC(9999, 0, 1)),
    });

    await expect(
      handle.db.transaction(async (tx) =>
        reserveBudget(tx, { orgId: ORG_A, agentId: agent.id, amount: 600n * 10n ** 18n }),
      ),
    ).rejects.toMatchObject({ code: "budget_exceeded", status: 422 });
  });
});

describe("tenant isolation", () => {
  it("does not return another tenant's request", async () => {
    const [req] = await handle.db
      .insert(procurementRequests)
      .values({
        orgId: ORG_A,
        reference: "REQ-1",
        title: "Test",
        description: "Test request",
        category: "software",
        requirements: {},
        budgetAmount: "1000",
      })
      .returning();

    await expect(getRequest(handle.db, ORG_B, req!.id)).rejects.toMatchObject({ status: 404 });
    const listB = await listRequests(handle.db, ORG_B, { limit: 10 });
    expect(listB.data).toHaveLength(0);
    const listA = await listRequests(handle.db, ORG_A, { limit: 10 });
    expect(listA.data).toHaveLength(1);
  });
});

describe("escrow event projection", () => {
  const chainId = 31611;
  const contract = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
  const onchainId = ("0x" + "ab".repeat(32)) as Hex;

  async function seedAgreement() {
    const [vendor] = await handle.db
      .insert(vendors)
      .values({
        orgId: ORG_B,
        name: "Vendor",
        payoutAddress: "0x00000000000000000000000000000000000000b2",
        status: "active",
        verified: true,
      })
      .returning();
    const [req] = await handle.db
      .insert(procurementRequests)
      .values({
        orgId: ORG_A,
        reference: "REQ-2",
        title: "GPU",
        description: "GPU request",
        category: "cloud_infrastructure",
        requirements: {},
        budgetAmount: "1000",
        status: "approved",
      })
      .returning();
    const [offer] = await handle.db
      .insert(offers)
      .values({
        orgId: ORG_A,
        requestId: req!.id,
        vendorId: vendor!.id,
        priceAmount: "1000",
        deliveryDays: 3,
        terms: {},
        canonicalHash: "0x" + "cd".repeat(32),
        signer: "0x00000000000000000000000000000000000000b2",
        expiresAt: new Date(Date.now() + 86400_000),
        status: "accepted",
      })
      .returning();
    const [agreement] = await handle.db
      .insert(agreements)
      .values({
        onchainId,
        orgId: ORG_A,
        requestId: req!.id,
        offerId: offer!.id,
        vendorId: vendor!.id,
        chainId,
        escrowAddress: contract,
        buyerAddress: "0x00000000000000000000000000000000000000a1",
        vendorAddress: "0x00000000000000000000000000000000000000b2",
        amount: "1000",
        feeAmount: "10",
        offerHash: "0x" + "cd".repeat(32),
        termsHash: "0x" + "ef".repeat(32),
        state: "proposed",
        acceptBy: new Date(Date.now() + 86400_000),
        deliverBy: new Date(Date.now() + 2 * 86400_000),
        disputeWindowSeconds: 3600,
      })
      .returning();
    return { agreement: agreement!, request: req!, vendor: vendor!, offer: offer! };
  }

  function event(name: string, block = 100, logIndex = 0, args: Record<string, unknown> = {}): DecodedEscrowEvent {
    return {
      eventName: name,
      agreementId: onchainId,
      args: { agreementId: onchainId, ...args },
      blockNumber: BigInt(block),
      blockHash: ("0x" + "11".repeat(32)) as Hex,
      txHash: ("0x" + "22".repeat(32)) as Hex,
      logIndex,
      address: contract as Hex,
    };
  }

  async function project(name: string, block = 100, logIndex = 0, args: Record<string, unknown> = {}) {
    return handle.db.transaction(async (tx) =>
      projectEscrowEvent(tx, { chainId, contract, event: event(name, block, logIndex, args) }),
    );
  }

  it("walks funded → accepted → delivered → released", async () => {
    const { agreement, request } = await seedAgreement();

    expect((await project("AgreementCreated")).applied).toBe(true);
    let [row] = await handle.db.select().from(agreements).where(sql`${agreements.id} = ${agreement.id}`);
    expect(row!.state).toBe("funded");
    let [req] = await handle.db.select().from(procurementRequests).where(sql`${procurementRequests.id} = ${request.id}`);
    expect(req!.status).toBe("awarded");

    await project("AgreementAccepted", 101, 0, { acceptedAt: BigInt(Math.floor(Date.now() / 1000)) });
    await project("DeliverySubmitted", 102, 0, { proofHash: "0x" + "33".repeat(32), deliveryCount: 1 });
    [row] = await handle.db.select().from(agreements).where(sql`${agreements.id} = ${agreement.id}`);
    expect(row!.state).toBe("delivered");

    await project("AgreementReleased", 103, 0, { vendorAmount: 1000n, feeAmount: 10n });
    [row] = await handle.db.select().from(agreements).where(sql`${agreements.id} = ${agreement.id}`);
    expect(row!.state).toBe("released");
    [req] = await handle.db.select().from(procurementRequests).where(sql`${procurementRequests.id} = ${request.id}`);
    expect(req!.status).toBe("completed");
  });

  it("is idempotent when the same event is replayed", async () => {
    const { agreement } = await seedAgreement();
    await project("AgreementCreated", 100);
    const again = await project("AgreementCreated", 100);
    expect(again.applied).toBe(true);
    const [row] = await handle.db.select().from(agreements).where(sql`${agreements.id} = ${agreement.id}`);
    expect(row!.state).toBe("funded");
  });

  it("ignores out-of-order delivery before acceptance", async () => {
    const { agreement } = await seedAgreement();
    await project("AgreementCreated", 100);
    const res = await project("DeliverySubmitted", 101, 0, { proofHash: "0x" + "33".repeat(32) });
    expect(res.applied).toBe(false);
    expect(res.reason).toMatch(/illegal_transition/);
    const [row] = await handle.db.select().from(agreements).where(sql`${agreements.id} = ${agreement.id}`);
    expect(row!.state).toBe("funded");
  });

  it("records a dispute opened directly on-chain and resolves it", async () => {
    const { agreement } = await seedAgreement();
    await project("AgreementCreated", 100);
    await project("AgreementAccepted", 101, 0, { acceptedAt: BigInt(Math.floor(Date.now() / 1000)) });
    await project("DeliverySubmitted", 102, 0, { proofHash: "0x" + "33".repeat(32) });
    await project("AgreementDisputed", 103, 0, {
      initiator: "0x00000000000000000000000000000000000000a1",
      evidenceHash: "0x" + "44".repeat(32),
    });

    const disputesRows = await handle.db.select().from(schema.disputes);
    expect(disputesRows).toHaveLength(1);
    expect(disputesRows[0]!.status).toBe("open");

    await project("DisputeResolved", 104, 0, { vendorAmount: 400n, buyerAmount: 600n, feeAmount: 4n, rulingHash: "0x" + "55".repeat(32) });
    const [d] = await handle.db.select().from(schema.disputes);
    expect(d!.status).toBe("resolved");
    const [row] = await handle.db.select().from(agreements).where(sql`${agreements.id} = ${agreement.id}`);
    expect(row!.state).toBe("released");
  });

  it("queues exactly one webhook delivery per endpoint per event", async () => {
    await seedAgreement();
    const [endpoint] = await handle.db
      .insert(webhookEndpoints)
      .values({
        orgId: ORG_A,
        url: "http://127.0.0.1:4999/hook",
        secretHash: "x",
        secretSealed: sealSecret("test-secret", process.env.SECRET_ENCRYPTION_KEY!),
        events: ["agreement.funded"],
      })
      .returning();

    await project("AgreementCreated", 100);
    await project("AgreementCreated", 100);

    const rows = await handle.db.select().from(webhookDeliveries).where(sql`${webhookDeliveries.endpointId} = ${endpoint!.id}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.eventType).toBe("agreement.funded");
    expect(rows[0]!.status).toBe("pending");
  });

  it("does not project an unknown agreement but never throws", async () => {
    const res = await handle.db.transaction(async (tx) =>
      projectEscrowEvent(tx, {
        chainId,
        contract,
        event: { ...event("AgreementCreated"), agreementId: ("0x" + "99".repeat(32)) as Hex },
      }),
    );
    expect(res.known).toBe(false);
    expect(res.applied).toBe(false);
  });
});
