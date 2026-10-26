/**
 * End-to-end smoke test against a real local chain.
 *
 * Requirements:
 *   - Postgres migrated and empty  (npm run db:reset && npm run db:migrate)
 *   - `anvil --chain-id 31611` running on 127.0.0.1:8545
 *   - contracts deployed via script/Deploy.s.sol (deployments/local-anvil-31611.json)
 *   - API running with those addresses and RESOLVER_PRIVATE_KEY set
 *
 * Everything below is a real HTTP call and a real transaction on the local chain.
 * Nothing is mocked. Amounts are in MUSD base units (18 decimals).
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { keccak256, toBytes, createWalletClient, createPublicClient, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import pg from "pg";
import { hashOffer, offerTypedData } from "../src/procurement/offers.js";
import { verifyWebhookSignature } from "../src/webhooks/service.js";

const API = process.env.API_BASE ?? "http://127.0.0.1:4000";
const RPC = process.env.MEZO_RPC_URL ?? "http://127.0.0.1:8545";
const CHAIN_ID = Number(process.env.MEZO_CHAIN_ID ?? 31611);

const deployment = JSON.parse(readFileSync(new URL("../../contracts/deployments/local-anvil-31611.json", import.meta.url), "utf8"));
const ESCROW = deployment.procurementEscrow as Hex;
const REGISTRY = deployment.agentPolicyRegistry as Hex;
const MUSD = deployment.musd as Hex;

const TREASURY = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" as const;

const KEYS = {
  buyer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  vendor: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  agent: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  resolver: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
} as const;

const buyerAccount = privateKeyToAccount(KEYS.buyer);
const vendorAccount = privateKeyToAccount(KEYS.vendor);
const agentAccount = privateKeyToAccount(KEYS.agent);

const pub = createPublicClient({ transport: http(RPC) });
const wallet = (pk: Hex) => createWalletClient({ account: privateKeyToAccount(pk), transport: http(RPC) });

const mockMusdAbi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);
const registryAbi = parseAbi([
  "function setAgentAuthorization(bytes32 orgId, address agent, bool authorized, uint64 validUntil, bytes32 policyHash)",
  "function isAuthorized(bytes32 orgId, address agent) view returns (bool)",
]);
const escrowAbi = parseAbi([
  "function accept(bytes32 agreementId)",
  "function submitDelivery(bytes32 agreementId, bytes32 proofHash)",
  "function release(bytes32 agreementId)",
  "function dispute(bytes32 agreementId, bytes32 evidenceHash)",
]);

// ---------------------------------------------------------------------------
// tiny test harness
// ---------------------------------------------------------------------------

let passed = 0;
const results: Array<{ name: string; ok: boolean; info?: unknown }> = [];

function check(name: string, condition: boolean, info?: unknown) {
  results.push({ name, ok: condition, info });
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  ✗ ${name}`, info ?? "");
  }
}

function section(title: string) {
  console.log(`\n== ${title}`);
}

async function api(
  path: string,
  opts: { method?: string; token?: string; body?: unknown; idempotencyKey?: string; expect?: number } = {},
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.body ? { "content-type": "application/json" } : {}),
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.idempotencyKey ? { "idempotency-key": opts.idempotencyKey } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (opts.expect !== undefined && res.status !== opts.expect) {
    throw new Error(`${opts.method ?? "GET"} ${path} expected ${opts.expect} got ${res.status}: ${text.slice(0, 500)}`);
  }
  return { status: res.status, body };
}

const b64 = (n: number) => keccak256(toBytes(`nonce-${n}-${Date.now()}`));

async function main() {
  const ts = Date.now().toString(36);
  console.log(`E2E run ${ts} against ${API} (chain ${CHAIN_ID})`);

  section("0. Preconditions");
  const health = await api("/healthz", { expect: 200 });
  check("API healthy", health.body.status === "ok");
  const onchainChainId = await pub.getChainId();
  check("RPC chain id matches", onchainChainId === CHAIN_ID, { got: onchainChainId });
  const escrowCode = await pub.getCode({ address: ESCROW });
  check("escrow contract has code", !!escrowCode && escrowCode.length > 2);

  // -------------------------------------------------------------------------
  section("1. Tenants");
  const buyer = await api("/v1/bootstrap", {
    method: "POST",
    body: { orgName: "Acme Robotics", slug: `acme-${ts}`, email: `owner-${ts}@acme.test`, displayName: "Acme Owner" },
    expect: 201,
  });
  const vendorOrg = await api("/v1/bootstrap", {
    method: "POST",
    body: { orgName: "Zenith Cloud", slug: `zenith-${ts}`, email: `owner-${ts}@zenith.test`, displayName: "Zenith Owner" },
    expect: 201,
  });
  const B = buyer.body.token as string;
  const V = vendorOrg.body.token as string;
  check("two organizations bootstrapped", !!B && !!V);

  await api("/v1/org", { method: "PATCH", token: B, body: { walletAddress: buyerAccount.address }, expect: 200 });
  const approver = await api("/v1/org/members", {
    method: "POST",
    token: B,
    body: { email: `approver-${ts}@acme.test`, displayName: "Acme Approver", role: "approver" },
    expect: 201,
  });
  const A = approver.body.token as string;
  check("approver user provisioned", !!A);

  // Platform-level verification of a vendor is a back-office control, not a
  // tenant self-service action, so the harness flips it directly in the database.
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  // -------------------------------------------------------------------------
  section("2. Vendor catalogue");
  const vendor = await api("/v1/vendors", {
    method: "POST",
    token: V,
    body: { name: "Zenith GPU Cloud", legalName: "Zenith Cloud Ltd", payoutAddress: vendorAccount.address },
    expect: 201,
  });
  const vendorId = vendor.body.vendor.id as string;
  await api(`/v1/vendors/${vendorId}`, { method: "PATCH", token: V, body: { status: "active" }, expect: 200 });
  await db.query("update vendors set verified = true where id = $1", [vendorId]);

  const service = await api(`/v1/vendors/${vendorId}/services`, {
    method: "POST",
    token: V,
    body: {
      name: "GPU cluster — 8×H100 weekly",
      category: "cloud_infrastructure",
      description: "Reserved 8-GPU H100 node with 24/7 support",
      capabilities: ["gpu", "kubernetes"],
      regions: ["eu-west"],
      priceModel: "fixed",
      basePrice: "1200",
      slaHours: 72,
      manifest: { gpuType: "H100", gpuCount: 8 },
    },
    expect: 201,
  });
  const serviceId = service.body.service.id as string;
  check("service manifest published with hash", /^0x[0-9a-f]{64}$/.test(service.body.service.manifestHash));

  // -------------------------------------------------------------------------
  section("3. Agent identity, budget and on-chain authorization");
  const agent = await api("/v1/agents", {
    method: "POST",
    token: B,
    body: {
      name: "procurement-bot",
      description: "Restricted buying agent",
      walletAddress: agentAccount.address,
      scopes: ["request:read", "request:create", "offer:read", "offer:discover", "agreement:read", "agreement:fund_intent", "budget:read"],
      trustLevel: 2,
    },
    expect: 201,
  });
  const agentId = agent.body.agent.id as string;
  const credential = await api(`/v1/agents/${agentId}/credentials`, {
    method: "POST",
    token: B,
    body: { label: "e2e key", ttlDays: 7 },
    expect: 201,
  });
  const AG = credential.body.token as string;
  await api(`/v1/agents/${agentId}/budgets`, {
    method: "PUT",
    token: B,
    body: { daily: "5000", monthly: "20000", perRequest: "3000" },
    expect: 200,
  });

  const orgOnchainId = keccak256(toBytes(buyer.body.org.id));
  const policyHash = buyer.body.policy.hash as Hex;
  const validUntil = BigInt(Math.floor(Date.now() / 1000) + 30 * 86400);
  const authTx = await wallet(KEYS.buyer).writeContract({
    address: REGISTRY,
    abi: registryAbi,
    functionName: "setAgentAuthorization",
    args: [orgOnchainId, agentAccount.address, true, validUntil, policyHash],
    chain: null,
  });
  await pub.waitForTransactionReceipt({ hash: authTx });
  const authorized = await pub.readContract({
    address: REGISTRY,
    abi: registryAbi,
    functionName: "isAuthorized",
    args: [orgOnchainId, agentAccount.address],
  });
  check("agent wallet authorized in registry", authorized === true);

  check(
    "agent token cannot manage policies",
    (await api("/v1/policies", { method: "POST", token: AG, body: { document: {} } })).status === 403,
  );
  check(
    "agent token cannot approve",
    (await fetch(`${API}/v1/approvals/x/decide`, { method: "POST", headers: { authorization: `Bearer ${AG}` } })).status === 403,
  );

  // -------------------------------------------------------------------------
  section("4. Request → offer → policy approval");
  const request = await api("/v1/requests", {
    method: "POST",
    token: AG,
    idempotencyKey: `req-${ts}`,
    body: {
      title: "Weekly GPU capacity for model training",
      description: "Need 8×H100 for one week, EU region, 72h delivery",
      category: "cloud_infrastructure",
      requirements: { capabilities: ["gpu"], region: "eu-west", purpose: "model-training" },
      budgetAmount: "2000",
    },
    expect: 201,
  });
  const requestId = request.body.request.id as string;
  const requestRef = request.body.request.reference as string;
  check("agent created a draft request", request.body.request.status === "draft", requestRef);

  const replay = await api("/v1/requests", {
    method: "POST",
    token: AG,
    idempotencyKey: `req-${ts}`,
    body: {
      title: "Weekly GPU capacity for model training",
      description: "Need 8×H100 for one week, EU region, 72h delivery",
      category: "cloud_infrastructure",
      requirements: { capabilities: ["gpu"], region: "eu-west", purpose: "model-training" },
      budgetAmount: "2000",
    },
    expect: 201,
  });
  check("idempotent replay returns same request", replay.body.request.id === requestId);

  await api(`/v1/requests/${requestId}/publish`, { method: "POST", token: B, expect: 200 });

  const expiresAt = new Date(Math.floor((Date.now() + 2 * 86400_000) / 1000) * 1000).toISOString();
  const nonce = "nonce-" + ts;
  const offerPayload = {
    requestId,
    vendorId,
    vendorWallet: vendorAccount.address,
    serviceId,
    priceAmount: (1200n * 10n ** 18n).toString(),
    currency: "MUSD",
    deliveryDays: 5,
    terms: { slaHours: 72, gpuType: "H100", gpuCount: 8 },
    expiresAt,
    nonce,
  };
  const offerHash = hashOffer(offerPayload);
  const typed = offerTypedData({
    chainId: CHAIN_ID,
    verifyingContract: ESCROW,
    requestId,
    offerHash,
    vendor: vendorAccount.address,
    priceAmount: 1200n * 10n ** 18n,
    expiresAt: Math.floor(new Date(expiresAt).getTime() / 1000),
  });
  const signature = await wallet(KEYS.vendor).signTypedData({
    account: vendorAccount,
    domain: typed.domain,
    types: typed.types,
    primaryType: "Offer",
    message: typed.message,
  });

  check(
    "tampered offer hash rejected",
    (
      await api(`/v1/marketplace/requests/${requestId}/offers`, {
        method: "POST",
        token: V,
        body: { ...offerPayload, offerHash: keccak256(toBytes("wrong")), signature, signer: vendorAccount.address },
      })
    ).status === 412,
  );

  const offer = await api(`/v1/marketplace/requests/${requestId}/offers`, {
    method: "POST",
    token: V,
    body: { ...offerPayload, offerHash, signature, signer: vendorAccount.address },
    expect: 201,
  });
  const offerId = offer.body.offer.id as string;
  check("signed offer accepted", offer.body.offer.canonicalHash === offerHash);

  const discover1 = await api(`/v1/requests/${requestId}/offers/discover`, { token: B, expect: 200 });
  const discover2 = await api(`/v1/requests/${requestId}/offers/discover`, { token: B, expect: 200 });
  check("discovery ranks the offer", discover1.body.ranking.length === 1);
  check(
    "ranking is deterministic",
    JSON.stringify(discover1.body.ranking) === JSON.stringify(discover2.body.ranking),
  );

  const award = await api(`/v1/requests/${requestId}/award`, {
    method: "POST",
    token: B,
    body: { offerId },
    expect: 200,
  });
  check("policy requires human approval above 500 MUSD", award.body.request.status === "pending_approval", award.body.policy);

  const approvals = await api("/v1/approvals?status=pending", { token: A, expect: 200 });
  const approvalId = approvals.body.data[0]?.approval.id as string;
  check("approval queued for approver role", !!approvalId);
  check(
    "requester cannot approve own request",
    (
      await api(`/v1/approvals/${approvalId}/decide`, {
        method: "POST",
        token: B,
        body: { decision: "approved" },
      })
    ).status === 403,
  );
  await api(`/v1/approvals/${approvalId}/decide`, {
    method: "POST",
    token: A,
    body: { decision: "approved", note: "Budget approved for training run" },
    expect: 200,
  });
  const approved = await api(`/v1/requests/${requestId}`, { token: B, expect: 200 });
  check("request approved after human decision", approved.body.request.status === "approved");

  // -------------------------------------------------------------------------
  // A webhook endpoint is registered before money moves so the funded/released
  // events produce real deliveries below.
  const received: Array<{ body: string; signature: string; timestamp: string }> = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({
        body,
        signature: String(req.headers["x-apn-signature"] ?? ""),
        timestamp: String(req.headers["x-apn-timestamp"] ?? ""),
      });
      res.statusCode = 200;
      res.end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(4010, "127.0.0.1", resolve));
  const hook = await api("/v1/webhooks", {
    method: "POST",
    token: B,
    body: {
      url: "http://127.0.0.1:4010/hook",
      description: "e2e receiver",
      events: ["agreement.released", "agreement.funded", "dispute.resolved"],
    },
    expect: 201,
  });
  const hookSecret = hook.body.secret as string;

  // -------------------------------------------------------------------------
  section("5. Escrow funding (agent signs, org wallet pays)");
  await wallet(KEYS.buyer).writeContract({
    address: MUSD,
    abi: mockMusdAbi,
    functionName: "mint",
    args: [buyerAccount.address, 100_000n * 10n ** 18n],
    chain: null,
  });
  await wallet(KEYS.buyer).writeContract({
    address: MUSD,
    abi: mockMusdAbi,
    functionName: "approve",
    args: [ESCROW, 2n ** 255n],
    chain: null,
  });

  const agreementRes = await api("/v1/agreements", {
    method: "POST",
    token: B,
    idempotencyKey: `agr-${ts}`,
    body: { requestId, offerId },
    expect: 201,
  });
  const agreement = agreementRes.body.agreement;
  check("agreement proposed", agreement.state === "proposed");
  check("fee is on top and read from contract", agreementRes.body.feeAmount === "12", agreementRes.body);
  check("funding intent targets the escrow", agreementRes.body.fundingIntent.to.toLowerCase() === ESCROW.toLowerCase());

  const fundTx = await wallet(KEYS.agent).sendTransaction({
    account: agentAccount,
    to: agreementRes.body.fundingIntent.to as Hex,
    data: agreementRes.body.fundingIntent.data as Hex,
    chain: null,
  });
  const fundReceipt = await pub.waitForTransactionReceipt({ hash: fundTx });
  check("funding tx mined", fundReceipt.status === "success");

  const confirmed = await api(`/v1/agreements/${agreement.id}/confirm`, {
    method: "POST",
    token: B,
    body: { txHash: fundTx },
    expect: 200,
  });
  check("agreement projected as funded", confirmed.body.agreement.state === "funded");
  const afterFund = await api(`/v1/requests/${requestId}`, { token: B, expect: 200 });
  check("request moved to awarded", afterFund.body.request.status === "awarded");

  const tick = await api("/v1/admin/indexer/tick", { method: "POST", token: B, expect: 200 });
  check("indexer tick ran", typeof tick.body.processed === "number", tick.body);

  // -------------------------------------------------------------------------
  const vendorBalanceBefore = await pub.readContract({
    address: MUSD,
    abi: mockMusdAbi,
    functionName: "balanceOf",
    args: [vendorAccount.address],
  });

  const treasuryBefore = await pub.readContract({
    address: MUSD,
    abi: mockMusdAbi,
    functionName: "balanceOf",
    args: [TREASURY],
  });

  section("6. Delivery and release");
  const agreementIdOnchain = agreement.onchainId as Hex;
  const acceptTx = await wallet(KEYS.vendor).writeContract({
    address: ESCROW,
    abi: escrowAbi,
    functionName: "accept",
    args: [agreementIdOnchain],
    chain: null,
  });
  await pub.waitForTransactionReceipt({ hash: acceptTx });
  await api(`/v1/agreements/${agreement.id}/confirm`, { method: "POST", token: B, body: { txHash: acceptTx }, expect: 200 });

  const proofHash = keccak256(toBytes(JSON.stringify({ delivery: "gpu-cluster-ready", ts })));
  const deliverTx = await wallet(KEYS.vendor).writeContract({
    address: ESCROW,
    abi: escrowAbi,
    functionName: "submitDelivery",
    args: [agreementIdOnchain, proofHash],
    chain: null,
  });
  await pub.waitForTransactionReceipt({ hash: deliverTx });
  await api(`/v1/agreements/${agreement.id}/confirm`, { method: "POST", token: B, body: { txHash: deliverTx }, expect: 200 });

  const intent = await api(`/v1/agreements/${agreement.id}/actions/release`, { method: "POST", token: B, expect: 200 });
  const releaseTx = await wallet(KEYS.buyer).sendTransaction({
    account: buyerAccount,
    to: intent.body.intent.to as Hex,
    data: intent.body.intent.data as Hex,
    chain: null,
  });
  await pub.waitForTransactionReceipt({ hash: releaseTx });
  const released = await api(`/v1/agreements/${agreement.id}/confirm`, {
    method: "POST",
    token: B,
    body: { txHash: releaseTx },
    expect: 200,
  });
  check("agreement released", released.body.agreement.state === "released");
  const completed = await api(`/v1/requests/${requestId}`, { token: B, expect: 200 });
  check("request completed", completed.body.request.status === "completed");

  const vendorBalanceAfter = await pub.readContract({
    address: MUSD,
    abi: mockMusdAbi,
    functionName: "balanceOf",
    args: [vendorAccount.address],
  });
  check(
    "vendor received exactly the quoted amount",
    vendorBalanceAfter - vendorBalanceBefore === 1200n * 10n ** 18n,
    { delta: (vendorBalanceAfter - vendorBalanceBefore).toString() },
  );
  const treasuryBalance = await pub.readContract({
    address: MUSD,
    abi: mockMusdAbi,
    functionName: "balanceOf",
    args: [TREASURY],
  });
  check(
    "treasury received the 1% fee",
    treasuryBalance - treasuryBefore === 12n * 10n ** 18n,
    { delta: (treasuryBalance - treasuryBefore).toString() },
  );

  // -------------------------------------------------------------------------
  section("7. Webhooks with signed delivery");
  const deliveries = await api("/v1/webhooks/deliveries?limit=10", { token: B, expect: 200 });
  check("webhook deliveries were queued by earlier events", deliveries.body.data.length > 0, { count: deliveries.body.data.length });

  await api("/v1/admin/webhooks/tick", { method: "POST", token: B, expect: 200 });
  await new Promise((r) => setTimeout(r, 300));
  check("receiver got at least one delivery", received.length > 0, { received: received.length });
  let anyValid = false;
  for (const r of received) {
    if (await verifyWebhookSignature(hookSecret, r.body, r.signature, r.timestamp, 3600)) anyValid = true;
  }
  check("HMAC signature verifies on a delivered event", anyValid);
  server.close();

  // -------------------------------------------------------------------------
  section("8. Auto-approval, delivery, dispute and resolution");
  const autoReq = await api("/v1/requests", {
    method: "POST",
    token: B,
    body: {
      title: "Small GPU burst",
      description: "One-off 2-hour burst for evaluation",
      category: "cloud_infrastructure",
      requirements: { capabilities: ["gpu"] },
      budgetAmount: "500",
    },
    expect: 201,
  });
  const autoReqId = autoReq.body.request.id as string;
  await api(`/v1/requests/${autoReqId}/publish`, { method: "POST", token: B, expect: 200 });

  const expires2 = new Date(Math.floor((Date.now() + 2 * 86400_000) / 1000) * 1000).toISOString();
  const payload2 = {
    requestId: autoReqId,
    vendorId,
    vendorWallet: vendorAccount.address,
    serviceId,
    priceAmount: (400n * 10n ** 18n).toString(),
    currency: "MUSD",
    deliveryDays: 2,
    terms: { hours: 2 },
    expiresAt: expires2,
    nonce: "burst-" + ts,
  };
  const hash2 = hashOffer(payload2);
  const typed2 = offerTypedData({
    chainId: CHAIN_ID,
    verifyingContract: ESCROW,
    requestId: autoReqId,
    offerHash: hash2,
    vendor: vendorAccount.address,
    priceAmount: 400n * 10n ** 18n,
    expiresAt: Math.floor(new Date(expires2).getTime() / 1000),
  });
  const sig2 = await wallet(KEYS.vendor).signTypedData({
    account: vendorAccount,
    domain: typed2.domain,
    types: typed2.types,
    primaryType: "Offer",
    message: typed2.message,
  });
  const offer2 = await api(`/v1/marketplace/requests/${autoReqId}/offers`, {
    method: "POST",
    token: V,
    body: { ...payload2, offerHash: hash2, signature: sig2, signer: vendorAccount.address },
    expect: 201,
  });
  const award2 = await api(`/v1/requests/${autoReqId}/award`, {
    method: "POST",
    token: B,
    body: { offerId: offer2.body.offer.id },
    expect: 200,
  });
  check("verified vendor under 500 MUSD auto-approved", award2.body.request.status === "approved", award2.body.policy);

  const agr2 = await api("/v1/agreements", {
    method: "POST",
    token: B,
    body: { requestId: autoReqId, offerId: offer2.body.offer.id },
    expect: 201,
  });
  const fundTx2 = await wallet(KEYS.buyer).sendTransaction({
    account: buyerAccount,
    to: agr2.body.fundingIntent.to as Hex,
    data: agr2.body.fundingIntent.data as Hex,
    chain: null,
  });
  await pub.waitForTransactionReceipt({ hash: fundTx2 });
  await api(`/v1/agreements/${agr2.body.agreement.id}/confirm`, { method: "POST", token: B, body: { txHash: fundTx2 }, expect: 200 });

  const id2 = agr2.body.agreement.onchainId as Hex;
  const acc2 = await wallet(KEYS.vendor).writeContract({ address: ESCROW, abi: escrowAbi, functionName: "accept", args: [id2], chain: null });
  await pub.waitForTransactionReceipt({ hash: acc2 });
  await api(`/v1/agreements/${agr2.body.agreement.id}/confirm`, { method: "POST", token: B, body: { txHash: acc2 }, expect: 200 });

  const del2 = await wallet(KEYS.vendor).writeContract({
    address: ESCROW,
    abi: escrowAbi,
    functionName: "submitDelivery",
    args: [id2, keccak256(toBytes("burst-delivery"))],
    chain: null,
  });
  await pub.waitForTransactionReceipt({ hash: del2 });
  await api(`/v1/agreements/${agr2.body.agreement.id}/confirm`, { method: "POST", token: B, body: { txHash: del2 }, expect: 200 });

  const dispute = await api(`/v1/agreements/${agr2.body.agreement.id}/disputes`, {
    method: "POST",
    token: B,
    body: { reason: "Delivered benchmark ran 40% below contractual throughput", evidence: { p95: "410 tok/s", expected: "700 tok/s" } },
    expect: 201,
  });
  const disputeTx = await wallet(KEYS.buyer).sendTransaction({
    account: buyerAccount,
    to: dispute.body.disputeIntent.to as Hex,
    data: dispute.body.disputeIntent.data as Hex,
    chain: null,
  });
  await pub.waitForTransactionReceipt({ hash: disputeTx });
  await api(`/v1/agreements/${agr2.body.agreement.id}/confirm`, {
    method: "POST",
    token: B,
    body: { txHash: disputeTx },
    expect: 200,
  });

  const resolution = await api(`/v1/disputes/${dispute.body.dispute.id}/resolve`, {
    method: "POST",
    token: B,
    body: { vendorShare: (240n * 10n ** 18n).toString(), note: "60/40 split per SLA schedule" },
    expect: 200,
  });
  check("resolver key submitted the ruling on-chain", !!resolution.body.txHash, resolution.body);
  const disputeAfter = await api(`/v1/disputes/${dispute.body.dispute.id}`, { token: B, expect: 200 });
  check("dispute recorded as resolved", disputeAfter.body.dispute.status === "resolved");
  const agr2After = await api(`/v1/agreements/${agr2.body.agreement.id}`, { token: B, expect: 200 });
  check("disputed agreement settled", agr2After.body.agreement.state === "released");

  // -------------------------------------------------------------------------
  section("9. Guardrails: budget, tenancy, policy");
  const bigReq = await api("/v1/requests", {
    method: "POST",
    token: AG,
    body: {
      title: "Large cluster for 1 month",
      description: "Would exceed the per-request agent budget",
      category: "cloud_infrastructure",
      requirements: { capabilities: ["gpu"] },
      budgetAmount: "4000",
    },
    expect: 201,
  });
  const bigReqId = bigReq.body.request.id as string;
  await api(`/v1/requests/${bigReqId}/publish`, { method: "POST", token: B, expect: 200 });
  const expires3 = new Date(Math.floor((Date.now() + 2 * 86400_000) / 1000) * 1000).toISOString();
  const payload3 = {
    requestId: bigReqId,
    vendorId,
    vendorWallet: vendorAccount.address,
    serviceId,
    priceAmount: (3500n * 10n ** 18n).toString(),
    currency: "MUSD",
    deliveryDays: 30,
    terms: { months: 1 },
    expiresAt: expires3,
    nonce: "big-" + ts,
  };
  const hash3 = hashOffer(payload3);
  const typed3 = offerTypedData({
    chainId: CHAIN_ID,
    verifyingContract: ESCROW,
    requestId: bigReqId,
    offerHash: hash3,
    vendor: vendorAccount.address,
    priceAmount: 3500n * 10n ** 18n,
    expiresAt: Math.floor(new Date(expires3).getTime() / 1000),
  });
  const sig3 = await wallet(KEYS.vendor).signTypedData({
    account: vendorAccount,
    domain: typed3.domain,
    types: typed3.types,
    primaryType: "Offer",
    message: typed3.message,
  });
  const offer3 = await api(`/v1/marketplace/requests/${bigReqId}/offers`, {
    method: "POST",
    token: V,
    body: { ...payload3, offerHash: hash3, signature: sig3, signer: vendorAccount.address },
    expect: 201,
  });
  await api(`/v1/requests/${bigReqId}/award`, {
    method: "POST",
    token: B,
    body: { offerId: offer3.body.offer.id },
    expect: 200,
  });
  const pending = await api("/v1/approvals?status=pending", { token: A, expect: 200 });
  const pendingApproval = pending.body.data.find((d: any) => d.approval.requestId === bigReqId);
  await api(`/v1/approvals/${pendingApproval.approval.id}/decide`, {
    method: "POST",
    token: A,
    body: { decision: "approved" },
    expect: 200,
  });
  const budgetBlocked = await api("/v1/agreements", {
    method: "POST",
    token: B,
    body: { requestId: bigReqId, offerId: offer3.body.offer.id },
  });
  check("agreement blocked by agent budget", budgetBlocked.status === 422 && budgetBlocked.body.error.code === "budget_exceeded", budgetBlocked.body);

  check(
    "tenant isolation on request reads",
    (await api(`/v1/requests/${requestId}`, { token: V })).status === 404,
  );
  check(
    "tenant isolation on agreement reads",
    (await api(`/v1/agreements/${agreement.id}`, { token: V })).status === 404,
  );

  const simulate = await api("/v1/policies/simulate", {
    method: "POST",
    token: B,
    body: {
      context: {
        amount: (1500n * 10n ** 18n).toString(),
        category: "cloud_infrastructure",
        budgetAmount: (2000n * 10n ** 18n).toString(),
        agentTrustLevel: 2,
        vendor: { id: vendorId, verified: false, tier: 1 },
      },
    },
    expect: 200,
  });
  check("policy simulation denies unverified vendor above 1,000", simulate.body.evaluation.decision === "DENY", simulate.body.evaluation.matchedRules);

  const budget = await api(`/v1/agents/${agentId}`, { token: B, expect: 200 });
  const perRequest = budget.body.budgets.find((b: any) => b.window === "per_request");
  const monthly = budget.body.budgets.find((b: any) => b.window === "monthly");
  check("budget spent reflects captured escrow", BigInt(monthly.spent) >= 1212n * 10n ** 18n, monthly);
  check("per-request limit preserved", perRequest.limitDisplay === "3000");

  const audit = await api("/v1/audit/verify", { token: B, expect: 200 });
  check("audit hash chain verifies", audit.body.valid === true, audit.body);

  const tenantAudit = await api("/v1/audit", { token: V, expect: 200 });
  check("audit log is tenant scoped", tenantAudit.body.data.every((r: any) => r.orgId === vendorOrg.body.org.id));

  await db.end();

  // -------------------------------------------------------------------------
  section("Summary");
  console.log(`\n${passed}/${results.length} checks passed`);
  writeFileSync(
    new URL("../../docs/e2e-report.json", import.meta.url),
    JSON.stringify(
      { passed, total: results.length, results },
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ),
  );
  if (passed !== results.length) process.exit(1);
}

main().catch((err) => {
  console.error("\nE2E FAILED:", err);
  process.exit(1);
});
