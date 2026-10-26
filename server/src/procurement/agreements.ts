import { randomBytes } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { createWalletClient, encodeFunctionData, http, parseAbi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Config } from "../config.js";
import type { Database } from "../db/client.js";
import {
  agreements,
  auditLog,
  chainEvents,
  disputes,
  offers,
  organizations,
  procurementRequests,
  vendors,
} from "../db/schema.js";
import { appendAudit } from "../lib/audit.js";
import { canonicalHash, DOMAINS } from "../lib/canonical.js";
import { conflict, notFound, preconditionFailed } from "../lib/errors.js";
import { dbAmount, formatMusd } from "../lib/money.js";
import { escrowAbi } from "../escrow/abi.js";
import {
  actionIntent,
  buildFundingIntent,
  decodeEscrowLogs,
  disputeIntent,
  escrowConfig,
  eventsFromTx,
  orgOnchainId,
  publicClientFor,
  requestOnchainId,
  type EscrowConfig,
} from "../escrow/client.js";
import { jsonSafe, projectEscrowEvent } from "../indexer/project.js";
import { reserveBudget, releaseReservations } from "../agents/budgets.js";
import { enqueueEvent } from "../webhooks/service.js";
import type { Principal } from "../types.js";
import { actorId } from "./requests.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const MAX_DISPUTE_WINDOW = 30 * 24 * 3600;
const MIN_DISPUTE_WINDOW = 3600;

export async function createAgreementProposal(
  db: Database,
  config: Config,
  principal: Principal,
  input: {
    requestId: string;
    offerId: string;
    acceptByHours?: number;
    deliverByDays?: number;
    disputeWindowSeconds?: number;
  },
) {
  const cfg = escrowConfig(config);

  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(procurementRequests)
      .where(and(eq(procurementRequests.id, input.requestId), eq(procurementRequests.orgId, principal.orgId)))
      .for("update");
    if (!request) throw notFound("Request not found");
    if (request.status !== "approved") throw conflict(`Request must be approved (currently ${request.status})`);

    const [row] = await tx
      .select({ offer: offers, vendor: vendors })
      .from(offers)
      .innerJoin(vendors, eq(vendors.id, offers.vendorId))
      .where(and(eq(offers.id, input.offerId), eq(offers.requestId, request.id)))
      .limit(1);
    if (!row) throw notFound("Offer not found");
    if (row.offer.status !== "accepted") throw preconditionFailed("Offer is not the accepted offer");

    const [existing] = await tx
      .select({ id: agreements.id, state: agreements.state })
      .from(agreements)
      .where(eq(agreements.requestId, request.id))
      .limit(1);
    if (existing && existing.state !== "cancelled") {
      throw conflict("An agreement already exists for this request", { agreementId: existing.id });
    }

    const [org] = await tx
      .select({ walletAddress: organizations.walletAddress })
      .from(organizations)
      .where(eq(organizations.id, principal.orgId))
      .limit(1);
    if (!org?.walletAddress) {
      throw preconditionFailed("Organization wallet address is not configured; set it before funding");
    }

    const now = new Date();
    const acceptBy = new Date(now.getTime() + (input.acceptByHours ?? 72) * 3600_000);
    const deliveryDays = input.deliverByDays ?? row.offer.deliveryDays + 3;
    const deliverBy = new Date(acceptBy.getTime() + deliveryDays * 24 * 3600_000);
    const disputeWindow = input.disputeWindowSeconds ?? 7 * 24 * 3600;
    if (disputeWindow < MIN_DISPUTE_WINDOW || disputeWindow > MAX_DISPUTE_WINDOW) {
      throw preconditionFailed("disputeWindowSeconds must be between 1 hour and 30 days");
    }
    if (deliverBy.getTime() <= acceptBy.getTime()) {
      throw preconditionFailed("deliverBy must be after acceptBy");
    }

    const amount = dbAmount(row.offer.priceAmount);
    const nonce = BigInt("0x" + randomBytes(16).toString("hex"));

    const terms = {
      schemaVersion: 1,
      chainId: cfg.chainId,
      escrow: cfg.escrow,
      orgId: principal.orgId,
      requestId: request.id,
      requestReference: request.reference,
      offerId: row.offer.id,
      offerHash: row.offer.canonicalHash,
      buyer: org.walletAddress.toLowerCase(),
      vendor: row.vendor.payoutAddress.toLowerCase(),
      vendorId: row.vendor.id,
      amount: amount.toString(),
      currency: "MUSD",
      description: request.title,
      deliverables: request.requirements,
      deadlines: { acceptBy: acceptBy.toISOString(), deliverBy: deliverBy.toISOString() },
      disputeWindowSeconds: disputeWindow,
      createdAt: now.toISOString(),
    };
    const termsHash = canonicalHash(DOMAINS.terms, terms);

    const intent = await buildFundingIntent({
      cfg,
      orgId: principal.orgId,
      requestId: request.id,
      offerHash: row.offer.canonicalHash as Hex,
      termsHash,
      buyer: org.walletAddress as Address,
      vendor: row.vendor.payoutAddress as Address,
      amount,
      acceptBy: Math.floor(acceptBy.getTime() / 1000),
      deliverBy: Math.floor(deliverBy.getTime() / 1000),
      disputeWindow,
      nonce,
    });

    // Fee is read from the contract, never guessed.
    const feeAmount = await readFee(cfg, amount);
    let reservationIds: string[] = [];
    if (request.createdByAgentId) {
      reservationIds = await reserveBudget(tx, {
        orgId: principal.orgId,
        agentId: request.createdByAgentId,
        requestId: request.id,
        amount: amount + feeAmount,
      });
    }

    const [agreement] = await tx
      .insert(agreements)
      .values({
        onchainId: intent.agreementId.toLowerCase(),
        orgId: principal.orgId,
        requestId: request.id,
        offerId: row.offer.id,
        vendorId: row.vendor.id,
        chainId: cfg.chainId,
        escrowAddress: cfg.escrow.toLowerCase(),
        buyerAddress: org.walletAddress.toLowerCase(),
        vendorAddress: row.vendor.payoutAddress.toLowerCase(),
        amount: amount.toString(),
        feeAmount: feeAmount.toString(),
        offerHash: row.offer.canonicalHash,
        termsHash,
        state: "proposed",
        acceptBy,
        deliverBy,
        disputeWindowSeconds: disputeWindow,
        budgetReservationIds: reservationIds,
      })
      .returning();

    if (!agreement) throw new Error("agreement insert failed");

    await appendAudit(tx, {
      orgId: principal.orgId,
      actorType: principal.kind,
      actorId: actorId(principal),
      action: "agreement.proposed",
      resourceType: "agreement",
      resourceId: agreement.id,
      metadata: {
        onchainId: agreement.onchainId,
        amount: amount.toString(),
        feeAmount: feeAmount.toString(),
        nonce: nonce.toString(),
      },
    });
    await enqueueEvent(
      tx,
      principal.orgId,
      "agreement.created",
      {
        agreementId: agreement.id,
        onchainId: agreement.onchainId,
        requestId: request.id,
        amount: amount.toString(),
        feeAmount: feeAmount.toString(),
      },
      { sourceKey: `agreement.created:${agreement.id}` },
    );

    return {
      agreement,
      fundingIntent: intent,
      terms: { ...terms, termsHash },
      amount: formatMusd(amount),
      feeAmount: formatMusd(feeAmount),
      totalAmount: formatMusd(amount + feeAmount),
    };
  });
}

async function readFee(cfg: EscrowConfig, amount: bigint): Promise<bigint> {
  const client = publicClientFor(cfg);
  const fee = (await client.readContract({
    address: cfg.escrow,
    abi: escrowAbi,
    functionName: "quoteFee",
    args: [amount],
  })) as bigint;
  return fee;
}

export async function confirmTransaction(
  db: Database,
  config: Config,
  principal: Principal,
  agreementId: string,
  txHash: Hex,
) {
  const cfg = escrowConfig(config);
  const [agreement] = await db
    .select()
    .from(agreements)
    .where(and(eq(agreements.id, agreementId), eq(agreements.orgId, principal.orgId)))
    .limit(1);
  if (!agreement) throw notFound("Agreement not found");

  const { receipt, events } = await eventsFromTx(cfg, txHash);
  const ours = events.filter((e) => e.agreementId.toLowerCase() === agreement.onchainId.toLowerCase());
  if (ours.length === 0) {
    throw preconditionFailed("Transaction does not contain events for this agreement", { txHash });
  }

  return db.transaction(async (tx) => {
    const applied: Array<{ event: string; applied: boolean; reason?: string }> = [];
    for (const event of ours) {
      await tx
        .insert(chainEvents)
        .values({
          chainId: cfg.chainId,
          contractAddress: cfg.escrow.toLowerCase(),
          txHash: event.txHash.toLowerCase(),
          logIndex: event.logIndex,
          blockNumber: Number(event.blockNumber),
          blockHash: event.blockHash,
          transactionIndex: receipt.transactionIndex,
          eventName: event.eventName,
          agreementOnchainId: event.agreementId.toLowerCase(),
          decoded: jsonSafe(event.args),
          processedAt: new Date(),
        })
        .onConflictDoNothing();

      const res = await projectEscrowEvent(tx, {
        chainId: cfg.chainId,
        contract: cfg.escrow,
        event,
      });
      applied.push({ event: event.eventName, applied: res.applied, reason: res.reason });
    }

    await appendAudit(tx, {
      orgId: principal.orgId,
      actorType: principal.kind,
      actorId: actorId(principal),
      action: "agreement.tx_confirmed",
      resourceType: "agreement",
      resourceId: agreementId,
      metadata: { txHash, events: ours.map((e) => e.eventName) },
    });

    const [updated] = await tx.select().from(agreements).where(eq(agreements.id, agreementId)).limit(1);

    return { agreement: updated, events: applied, blockNumber: Number(receipt.blockNumber) };
  });
}

export async function listAgreements(db: Database, orgId: string, limit: number, cursor?: string) {
  const conditions = [eq(agreements.orgId, orgId)];
  if (cursor) conditions.push(sql`${agreements.createdAt} < ${cursor}`);
  const rows = await db
    .select({
      agreement: agreements,
      vendorName: vendors.name,
      requestReference: procurementRequests.reference,
    })
    .from(agreements)
    .innerJoin(vendors, eq(vendors.id, agreements.vendorId))
    .innerJoin(procurementRequests, eq(procurementRequests.id, agreements.requestId))
    .where(and(...conditions))
    .orderBy(desc(agreements.createdAt))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return {
    data: page,
    nextCursor: rows.length > limit ? page[page.length - 1]!.agreement.createdAt.toISOString() : null,
  };
}

export async function getAgreement(db: Database, orgId: string, id: string) {
  const [row] = await db
    .select({
      agreement: agreements,
      vendorName: vendors.name,
      vendorAddress: vendors.payoutAddress,
      requestReference: procurementRequests.reference,
      requestTitle: procurementRequests.title,
    })
    .from(agreements)
    .innerJoin(vendors, eq(vendors.id, agreements.vendorId))
    .innerJoin(procurementRequests, eq(procurementRequests.id, agreements.requestId))
    .where(and(eq(agreements.id, id), eq(agreements.orgId, orgId)))
    .limit(1);
  if (!row) throw notFound("Agreement not found");
  return row;
}

/** Returns the unsigned transaction for a buyer-side escrow action. */
export async function buildActionIntent(
  db: Database,
  config: Config,
  principal: Principal,
  agreementId: string,
  action: "release" | "cancel",
) {
  const cfg = escrowConfig(config);
  const { agreement } = await getAgreement(db, principal.orgId, agreementId);
  const onchainId = agreement.onchainId as Hex;

  if (action === "release" && !["accepted", "delivered"].includes(agreement.state)) {
    throw conflict(`Cannot release an agreement in state ${agreement.state}`);
  }
  if (action === "cancel" && agreement.state !== "proposed" && agreement.state !== "funded") {
    throw conflict(`Cannot cancel an agreement in state ${agreement.state}`);
  }

  const intent =
    action === "release"
      ? actionIntent(cfg, "release", onchainId)
      : actionIntent(cfg, "cancelUnaccepted", onchainId);
  return { agreement, intent };
}

export async function openDispute(
  db: Database,
  config: Config,
  principal: Principal,
  agreementId: string,
  input: { reason: string; evidence: Record<string, unknown> },
) {
  const cfg = escrowConfig(config);
  const { agreement } = await getAgreement(db, principal.orgId, agreementId);

  const now = Date.now();
  const state = agreement.state;
  if (state === "delivered") {
    const deadline = (agreement.deliveredAt?.getTime() ?? 0) + agreement.disputeWindowSeconds * 1000;
    if (now > deadline) throw preconditionFailed("Dispute window has closed");
  } else if (state === "accepted") {
    if (now <= agreement.deliverBy.getTime()) {
      throw preconditionFailed("Vendor still has time to deliver; wait until the delivery deadline");
    }
  } else {
    throw conflict(`Cannot open a dispute from state ${state}`);
  }

  const evidenceHash = canonicalHash(DOMAINS.dispute, {
    agreementId,
    reason: input.reason,
    evidence: input.evidence,
    at: new Date(now).toISOString(),
  });

  const dispute = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: disputes.id })
      .from(disputes)
      .where(and(eq(disputes.agreementId, agreementId), sql`${disputes.status} <> 'resolved'`))
      .limit(1);
    if (existing) throw conflict("An open dispute already exists for this agreement", { disputeId: existing.id });

    const [row] = await tx
      .insert(disputes)
      .values({
        orgId: principal.orgId,
        agreementId,
        openedBy: actorId(principal),
        reason: input.reason,
        evidence: { ...input.evidence, evidenceHash },
        status: "open",
      })
      .returning();
    if (!row) throw new Error("dispute insert failed");

    await tx.update(agreements).set({ disputeId: row.id, updatedAt: new Date() }).where(eq(agreements.id, agreementId));
    await appendAudit(tx, {
      orgId: principal.orgId,
      actorType: principal.kind,
      actorId: actorId(principal),
      action: "dispute.opened",
      resourceType: "dispute",
      resourceId: row.id,
      metadata: { agreementId, evidenceHash },
    });
    return row;
  });

  return {
    dispute,
    evidenceHash,
    disputeIntent: disputeIntent(cfg, agreement.onchainId as Hex, evidenceHash as Hex),
  };
}

export async function resolveDispute(
  db: Database,
  config: Config,
  principal: Principal,
  disputeId: string,
  input: { vendorShare: string; note: string },
) {
  const cfg = escrowConfig(config);
  const [row] = await db
    .select({ dispute: disputes, agreement: agreements })
    .from(disputes)
    .innerJoin(agreements, eq(agreements.id, disputes.agreementId))
    .where(and(eq(disputes.id, disputeId), eq(disputes.orgId, principal.orgId)))
    .limit(1);
  if (!row) throw notFound("Dispute not found");
  if (row.dispute.status === "resolved") throw conflict("Dispute already resolved");
  if (row.agreement.state !== "disputed") {
    throw conflict(`Agreement is ${row.agreement.state}; on-chain dispute must be confirmed first`);
  }

  const vendorShare = dbAmount(input.vendorShare);
  if (vendorShare > dbAmount(row.agreement.amount)) throw preconditionFailed("vendorShare exceeds agreement amount");

  const rulingHash = canonicalHash(DOMAINS.dispute, {
    disputeId,
    agreementId: row.agreement.id,
    onchainId: row.agreement.onchainId,
    vendorShare: vendorShare.toString(),
    note: input.note,
    resolver: actorId(principal),
    at: new Date().toISOString(),
  });

  const intent = {
    chainId: cfg.chainId,
    to: cfg.escrow,
    value: "0",
    data: encodeResolve(cfg, row.agreement.onchainId as Hex, vendorShare, rulingHash as Hex),
    description: `Resolve dispute ${disputeId} paying ${formatMusd(vendorShare)} MUSD to the vendor`,
    rulingHash,
    agreementId: row.agreement.onchainId,
  };

  let txHash: Hex | null = null;
  if (config.RESOLVER_PRIVATE_KEY) {
    const { resolveDisputeOnchain } = await import("../escrow/client.js");
    txHash = await resolveDisputeOnchain(
      cfg,
      config.RESOLVER_PRIVATE_KEY as Hex,
      row.agreement.onchainId as Hex,
      vendorShare,
      rulingHash as Hex,
    );
    const { events } = await eventsFromTx(cfg, txHash);
    await db.transaction(async (tx) => {
      for (const event of events) {
        await tx
          .insert(chainEvents)
          .values({
            chainId: cfg.chainId,
            contractAddress: cfg.escrow.toLowerCase(),
            txHash: event.txHash.toLowerCase(),
            logIndex: event.logIndex,
            blockNumber: Number(event.blockNumber),
            blockHash: event.blockHash,
            eventName: event.eventName,
            agreementOnchainId: event.agreementId.toLowerCase(),
            decoded: jsonSafe(event.args),
            processedAt: new Date(),
          })
          .onConflictDoNothing();
        await projectEscrowEvent(tx, { chainId: cfg.chainId, contract: cfg.escrow, event });
      }
    });
  }

  const updated = await db.transaction(async (tx) => {
    const [d] = await tx
      .update(disputes)
      .set({
        status: "resolved",
        vendorShare: vendorShare.toString(),
        rulingHash,
        resolvedByUserId: principal.kind === "user" ? principal.userId : null,
        resolutionNote: input.note,
        resolutionTxHash: txHash,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(disputes.id, disputeId))
      .returning();
    await appendAudit(tx, {
      orgId: principal.orgId,
      actorType: principal.kind,
      actorId: actorId(principal),
      action: "dispute.resolved",
      resourceType: "dispute",
      resourceId: disputeId,
      metadata: { vendorShare: vendorShare.toString(), txHash, rulingHash },
    });
    return d;
  });

  return { dispute: updated, txHash, rulingHash, onchainIntent: txHash ? null : intent };
}

function encodeResolve(cfg: EscrowConfig, agreementId: Hex, vendorAmount: bigint, rulingHash: Hex): Hex {
  cfg;
  return encodeFunctionData({
    abi: escrowAbi,
    functionName: "resolveDispute",
    args: [agreementId, vendorAmount, rulingHash],
  });
}

export async function releaseHoldsOnFailure(db: Database, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction(async (tx) => {
    await releaseReservations(tx, ids);
  });
}

const LOCAL_BUYER_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const LOCAL_VENDOR_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;

/** A well-funded local Anvil node is the only place the hardhat-style default
 *  keys may ever be used. Remote chains demand explicit configured keys. */
function isLocalDevChain(config: Config): boolean {
  return /\/\/(127\.0\.0\.1|localhost|\[::1\])/.test(config.MEZO_RPC_URL);
}

function buyerExecutorKey(config: Config): Hex {
  if (config.BUYER_PRIVATE_KEY) return config.BUYER_PRIVATE_KEY as Hex;
  if (isLocalDevChain(config)) return LOCAL_BUYER_PK;
  throw preconditionFailed(
    "BUYER_PRIVATE_KEY is not configured; refusing to sign on the remote chain " + config.MEZO_RPC_URL,
  );
}

function vendorExecutorKey(config: Config): Hex {
  if (config.VENDOR_PRIVATE_KEY) return config.VENDOR_PRIVATE_KEY as Hex;
  if (isLocalDevChain(config)) return LOCAL_VENDOR_PK;
  throw preconditionFailed(
    "VENDOR_PRIVATE_KEY is not configured; refusing to sign on the remote chain " + config.MEZO_RPC_URL,
  );
}
const mockMusdAbi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

export async function executeAgreementOnchain(
  db: Database,
  config: Config,
  principal: Principal,
  agreementId: string,
  action: "fund" | "accept" | "deliver" | "release" | "cancel" | "dispute",
  params?: { summary?: string; artifactUri?: string; reason?: string; evidence?: Record<string, unknown> },
) {
  const cfg = escrowConfig(config);
  const pub = publicClientFor(cfg);
  const [agreement] = await db
    .select()
    .from(agreements)
    .where(and(eq(agreements.id, agreementId), eq(agreements.orgId, principal.orgId)))
    .limit(1);
  if (!agreement) throw notFound("Agreement not found");

  const sendRaw = async (pk: Hex, to: Address, data: Hex) => {
    const account = privateKeyToAccount(pk);
    const client = createWalletClient({ account, transport: http(cfg.rpcUrl) });
    const hash = await client.sendTransaction({ account, chain: null, to, data });
    await pub.waitForTransactionReceipt({ hash });
    return hash;
  };

  let txHash: Hex;

  if (action === "fund") {
    if (agreement.state !== "proposed") {
      throw conflict(`Agreement is already ${agreement.state}`);
    }
    const [audit] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.orgId, principal.orgId),
          eq(auditLog.resourceType, "agreement"),
          eq(auditLog.resourceId, agreement.id),
          eq(auditLog.action, "agreement.proposed"),
        ),
      )
      .orderBy(desc(auditLog.seq))
      .limit(1);
    const meta = (audit?.metadata ?? {}) as { nonce?: string };
    if (!meta.nonce) {
      throw preconditionFailed("Agreement proposal nonce not found; create a fresh agreement proposal");
    }
    const amount = BigInt(agreement.amount);
    const feeAmount = BigInt(agreement.feeAmount);
    const total = amount + feeAmount;
    const buyerAddr = agreement.buyerAddress as Address;

    if (isLocalDevChain(config)) {
      try {
        const bal = (await pub.readContract({
          address: cfg.musd,
          abi: mockMusdAbi,
          functionName: "balanceOf",
          args: [buyerAddr],
        })) as bigint;
        if (bal < total) {
          const mintData = encodeFunctionData({
            abi: mockMusdAbi,
            functionName: "mint",
            args: [buyerAddr, total * 10n],
          });
          await sendRaw(LOCAL_BUYER_PK, cfg.musd, mintData);
        }
      } catch {
        // Ignore if token is non-mintable and buyer already holds balance
      }
    }

    const intent = await buildFundingIntent({
      cfg,
      orgId: agreement.orgId,
      requestId: agreement.requestId,
      offerHash: agreement.offerHash as Hex,
      termsHash: agreement.termsHash as Hex,
      buyer: buyerAddr,
      vendor: agreement.vendorAddress as Address,
      amount,
      acceptBy: Math.floor(agreement.acceptBy.getTime() / 1000),
      deliverBy: Math.floor(agreement.deliverBy.getTime() / 1000),
      disputeWindow: agreement.disputeWindowSeconds,
      nonce: BigInt(meta.nonce),
    });

    const approveData = encodeFunctionData({
      abi: mockMusdAbi,
      functionName: "approve",
      args: [cfg.escrow, total],
    });
    await sendRaw(buyerExecutorKey(config), cfg.musd, approveData);
    txHash = await sendRaw(buyerExecutorKey(config), intent.to, intent.data);
  } else if (action === "accept") {
    if (agreement.state !== "funded") {
      throw conflict(`Agreement must be funded before vendor acceptance (currently ${agreement.state})`);
    }
    const data = encodeFunctionData({
      abi: escrowAbi,
      functionName: "accept",
      args: [agreement.onchainId as Hex],
    });
    txHash = await sendRaw(vendorExecutorKey(config), cfg.escrow, data);
  } else if (action === "deliver") {
    if (agreement.state !== "accepted") {
      throw conflict(`Agreement must be accepted before delivery submission (currently ${agreement.state})`);
    }
    const proofHash = canonicalHash(DOMAINS.deliverable, {
      agreementId: agreement.id,
      onchainId: agreement.onchainId,
      summary: params?.summary || "Compute cluster provisioned, benchmarked, and handed over with cryptographic attestation.",
      artifactUri: params?.artifactUri || "https://artifacts.helios.compute/attestations/" + agreement.id,
      deliveredAt: new Date().toISOString(),
    });
    const data = encodeFunctionData({
      abi: escrowAbi,
      functionName: "submitDelivery",
      args: [agreement.onchainId as Hex, proofHash as Hex],
    });
    txHash = await sendRaw(vendorExecutorKey(config), cfg.escrow, data);
  } else if (action === "release") {
    const res = await buildActionIntent(db, config, principal, agreement.id, "release");
    txHash = await sendRaw(buyerExecutorKey(config), res.intent.to, res.intent.data);
  } else if (action === "cancel") {
    const res = await buildActionIntent(db, config, principal, agreement.id, "cancel");
    txHash = await sendRaw(buyerExecutorKey(config), res.intent.to, res.intent.data);
  } else if (action === "dispute") {
    const reason = params?.reason || "SLA latency or throughput deviation reported during acceptance window.";
    const res = await openDispute(db, config, principal, agreement.id, {
      reason,
      evidence: params?.evidence ?? { reportedBy: actorId(principal), timestamp: new Date().toISOString() },
    });
    txHash = await sendRaw(buyerExecutorKey(config), res.disputeIntent.to, res.disputeIntent.data);
  } else {
    throw preconditionFailed(`Unsupported action ${action}`);
  }

  return confirmTransaction(db, config, principal, agreement.id, txHash);
}

export { decodeEscrowLogs, orgOnchainId, requestOnchainId };
