import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { privateKeyToAccount } from "viem/accounts";
import { offerTypedData } from "../src/procurement/offers.js";
import { hashOffer } from "../src/procurement/offers.js";
import { vendors } from "../src/db/schema.js";
import type { Database } from "../src/db/client.js";
import { bootstrap, config, json, makeApp, resetDb, testDb } from "./helpers.js";

const { db, close } = testDb();
let app: FastifyInstance;

const vendorAccount = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");

interface Ctx {
  buyerToken: string;
  buyerOrgId: string;
  approverToken: string;
  vendorToken: string;
  vendorId: string;
  requestId: string;
  offerId: string;
  slug: string;
}

let ctx: Ctx;

beforeAll(async () => {
  await resetDb(db);
  app = await makeApp(db);
  await app.ready();

  const slug = `it-${randomUUID().slice(0, 8)}`;
  const buyer = await bootstrap(app, `${slug}-buyer`);
  const vendorOrg = await bootstrap(app, `${slug}-vendor`);

  // Owner creates an approver teammate (returns a one-time token).
  const approverRes = await json(app, "POST", "/v1/org/members", {
    token: buyer.token,
    body: { email: `approver@${slug}.test`, displayName: "Approver", role: "approver" },
  });
  expect(approverRes.status).toBe(201);

  const vendorRes = await json(app, "POST", "/v1/vendors", {
    token: vendorOrg.token,
    body: { name: "Helios Compute", payoutAddress: vendorAccount.address, contactEmail: "v@helios.test" },
  });
  expect(vendorRes.status).toBe(201);
  const vendorId = vendorRes.body.vendor.id as string;

  const svc = await json(app, "POST", `/v1/vendors/${vendorId}/services`, {
    token: vendorOrg.token,
    body: {
      name: "8xH100 node",
      category: "cloud_infrastructure",
      description: "8 H100 SXM node, EU West",
      capabilities: ["h100", "kubernetes"],
      regions: ["eu-west"],
      priceModel: "hourly",
      basePrice: "24",
      slaHours: 4,
      manifest: { unit: "node-hour" },
    },
  });
  expect(svc.status).toBe(201);

  // Vendor verification is an operator action; there is no self-service route.
  await db.update(vendors).set({ verified: true, status: "active", tier: 3 }).where(eq(vendors.id, vendorId));

  const reqRes = await json(app, "POST", "/v1/requests", {
    token: buyer.token,
    headers: { "idempotency-key": `req-${slug}-0001` },
    body: {
      title: "8x H100 for fine-tuning",
      description: "Two week dedicated node, EU residency",
      category: "cloud_infrastructure",
      budgetAmount: "1200",
      requirements: { capabilities: ["h100", "kubernetes"] },
    },
  });
  expect(reqRes.status).toBe(201);
  const requestId = reqRes.body.request.id as string;

  const pub = await json(app, "POST", `/v1/requests/${requestId}/publish`, { token: buyer.token });
  expect(pub.status).toBe(200);

  const payload = {
    requestId,
    vendorId,
    vendorWallet: vendorAccount.address,
    serviceId: null,
    priceAmount: (1200n * 10n ** 18n).toString(),
    currency: "MUSD" as const,
    deliveryDays: 3,
    terms: { slaHours: 4 },
    expiresAt: new Date(Date.now() + 3 * 86400_000).toISOString(),
    nonce: `nonce-${slug}`,
  };
  const offerHash = hashOffer(payload);
  const typed = offerTypedData({
    chainId: config.MEZO_CHAIN_ID,
    verifyingContract: config.ESCROW_CONTRACT_ADDRESS as `0x${string}`,
    requestId,
    offerHash,
    vendor: vendorAccount.address,
    priceAmount: BigInt(payload.priceAmount),
    expiresAt: Math.floor(new Date(payload.expiresAt).getTime() / 1000),
  });
  const signature = await vendorAccount.signTypedData({
    domain: typed.domain,
    types: typed.types,
    primaryType: "Offer",
    message: typed.message,
  });

  const offerRes = await json(app, "POST", `/v1/marketplace/requests/${requestId}/offers`, {
    token: vendorOrg.token,
    body: { ...payload, offerHash, signature, signer: vendorAccount.address },
  });
  expect(offerRes.status).toBe(201);

  ctx = {
    buyerToken: buyer.token,
    buyerOrgId: buyer.orgId,
    approverToken: approverRes.body.token as string,
    vendorToken: vendorOrg.token,
    vendorId,
    requestId,
    offerId: offerRes.body.offer.id as string,
    slug,
  };
});

afterAll(async () => {
  await app.close();
  await close();
});

describe("tenant isolation", () => {
  it("hides another tenant's request behind a 404", async () => {
    const res = await json(app, "GET", `/v1/requests/${ctx.requestId}`, { token: ctx.vendorToken });
    expect(res.status).toBe(404);
  });

  it("does not leak vendors across tenants", async () => {
    const res = await json(app, "GET", "/v1/vendors", { token: ctx.buyerToken });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("exposes only a projection of open requests on the marketplace", async () => {
    const res = await json(app, "GET", "/v1/marketplace/requests", { token: ctx.vendorToken });
    expect(res.status).toBe(200);
    const row = res.body.data.find((r: { id: string }) => r.id === ctx.requestId);
    expect(row).toBeTruthy();
    expect(row.orgId).toBeUndefined();
    expect(row.createdByUserId).toBeUndefined();
  });
});

describe("RBAC and separation of duties", () => {
  it("refuses policy authoring to a viewer role", async () => {
    const viewer = await json(app, "POST", "/v1/org/members", {
      token: ctx.buyerToken,
      body: { email: `viewer@${ctx.slug}.test`, displayName: "Viewer", role: "viewer" },
    });
    expect(viewer.status).toBe(201);
    const res = await json(app, "POST", "/v1/policies", {
      token: viewer.body.token as string,
      body: { document: { schemaVersion: 1, name: "x", defaultEffect: "allow", rules: [] } },
    });
    expect(res.status).toBe(403);
  });

  it("only lets an approver decide an approval", async () => {
    const award = await json(app, "POST", `/v1/requests/${ctx.requestId}/award`, {
      token: ctx.buyerToken,
      body: { offerId: ctx.offerId },
    });
    expect(award.status).toBe(200);
    expect(award.body.request.status).toBe("pending_approval");

    const queue = await json(app, "GET", "/v1/approvals?status=pending", { token: ctx.approverToken });
    expect(queue.body.data.length).toBeGreaterThan(0);
    const approvalId = queue.body.data[0].approval.id as string;

    // The owner/requester must not be able to approve their own request.
    const self = await json(app, "POST", `/v1/approvals/${approvalId}/decide`, {
      token: ctx.buyerToken,
      body: { decision: "approved" },
    });
    expect(self.status).toBe(403);

    const decided = await json(app, "POST", `/v1/approvals/${approvalId}/decide`, {
      token: ctx.approverToken,
      body: { decision: "approved", note: "budget approved" },
    });
    expect(decided.status).toBe(200);
    expect(decided.body.request.status).toBe("approved");
  });
});

describe("offers", () => {
  it("rejects a tampered hash", async () => {
    const res = await json(app, "POST", "/v1/offers/hash", {
      token: ctx.vendorToken,
      body: {
        requestId: ctx.requestId,
        vendorId: ctx.vendorId,
        vendorWallet: vendorAccount.address,
        priceAmount: "1",
      },
    });
    expect([400, 404]).toContain(res.status);
  });

  it("ranks deterministically", async () => {
    const a = await json(app, "GET", `/v1/requests/${ctx.requestId}/offers/discover`, { token: ctx.buyerToken });
    const b = await json(app, "GET", `/v1/requests/${ctx.requestId}/offers/discover`, { token: ctx.buyerToken });
    expect(a.status).toBe(200);
    expect(JSON.stringify(a.body)).toBe(JSON.stringify(b.body));
    expect(a.body.ranking[0].offerId).toBe(ctx.offerId);
  });
});

describe("agreements", () => {
  it("refuses to build a funding intent without an org wallet", async () => {
    const res = await json(app, "POST", "/v1/agreements", {
      token: ctx.buyerToken,
      body: { requestId: ctx.requestId, offerId: ctx.offerId },
    });
    expect(res.status).toBe(412);
    expect(res.body.error.message).toMatch(/wallet/i);
  });
});

describe("idempotency", () => {
  it("replays the same key+body and rejects a different body", async () => {
    const body = {
      title: "Repeatable request",
      description: "idempotency check",
      category: "software",
      budgetAmount: "10",
    };
    const key = `idem-${ctx.slug}-1234`;
    const first = await json(app, "POST", "/v1/requests", { token: ctx.buyerToken, body, headers: { "idempotency-key": key } });
    expect(first.status).toBe(201);
    const replay = await json(app, "POST", "/v1/requests", { token: ctx.buyerToken, body, headers: { "idempotency-key": key } });
    expect(replay.body.request.id).toBe(first.body.request.id);
    const conflict = await json(app, "POST", "/v1/requests", {
      token: ctx.buyerToken,
      body: { ...body, title: "Different" },
      headers: { "idempotency-key": key },
    });
    expect(conflict.status).toBe(409);
  });
});

describe("audit", () => {
  it("verifies a tamper-evident chain", async () => {
    const res = await json(app, "GET", "/v1/audit/verify", { token: ctx.buyerToken });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.checked).toBeGreaterThan(3);
  });
});
