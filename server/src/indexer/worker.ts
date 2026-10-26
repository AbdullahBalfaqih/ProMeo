import "dotenv/config";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import type { Hex } from "viem";
import type { Config } from "../config.js";
import type { Database } from "../db/client.js";
import { agreements, chainEvents, indexerCursors, indexerReorgs } from "../db/schema.js";
import {
  decodeEscrowLogs,
  escrowConfig,
  publicClientFor,
  type DecodedEscrowEvent,
  type EscrowConfig,
} from "../escrow/client.js";
import { jsonSafe, projectEscrowEvent } from "./project.js";

export interface Cursor {
  lastProcessedBlock: number;
  lastBlockHash: string;
}

export async function getCursor(db: Database, chainId: number, contract: string, fallback: number): Promise<Cursor> {
  const [row] = await db
    .select()
    .from(indexerCursors)
    .where(and(eq(indexerCursors.chainId, chainId), eq(indexerCursors.contractAddress, contract.toLowerCase())))
    .limit(1);
  if (!row) return { lastProcessedBlock: fallback, lastBlockHash: "" };
  return { lastProcessedBlock: Number(row.lastProcessedBlock), lastBlockHash: row.lastBlockHash };
}

async function setCursor(db: Database, chainId: number, contract: string, block: number, hash: string) {
  await db
    .insert(indexerCursors)
    .values({
      chainId,
      contractAddress: contract.toLowerCase(),
      lastProcessedBlock: block,
      lastBlockHash: hash,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [indexerCursors.chainId, indexerCursors.contractAddress],
      set: { lastProcessedBlock: block, lastBlockHash: hash, updatedAt: new Date() },
    });
}

/**
 * Detects a reorg by comparing the stored block hash with the canonical chain.
 * Walks back up to `maxDepth` blocks to find the common ancestor, deletes the
 * orphaned events and rebuilds the projections of every affected agreement.
 */
export async function handleReorg(
  db: Database,
  cfg: EscrowConfig,
  cursor: Cursor,
  maxDepth = 128,
): Promise<{ rewoundTo: number; orphaned: number } | null> {
  if (!cursor.lastBlockHash) return null;
  const client = publicClientFor(cfg);
  let depth = 0;
  let block = cursor.lastProcessedBlock;

  while (depth <= maxDepth) {
    const onchain = await client.getBlock({ blockNumber: BigInt(block) });
    if (onchain.hash === cursor.lastBlockHash) break;
    depth += 1;
    block -= 1;
    if (block < 0) break;
  }

  if (depth === 0) return null;
  if (block < 0) throw new Error("reorg deeper than the chain history; manual intervention required");

  const orphanRows = await db
    .delete(chainEvents)
    .where(
      and(
        eq(chainEvents.chainId, cfg.chainId),
        eq(chainEvents.contractAddress, cfg.escrow.toLowerCase()),
        gt(chainEvents.blockNumber, block),
      ),
    )
    .returning({ onchainId: chainEvents.agreementOnchainId });

  const unique = [...new Set(orphanRows.map((r) => r.onchainId).filter((x): x is string => !!x))];
  for (const onchainId of unique) {
    await rebuildProjection(db, cfg, onchainId);
  }

  await setCursor(db, cfg.chainId, cfg.escrow, block, (await client.getBlock({ blockNumber: BigInt(block) })).hash);

  await db.insert(indexerReorgs).values({
    chainId: cfg.chainId,
    contractAddress: cfg.escrow.toLowerCase(),
    rewoundToBlock: block,
    previousBlock: cursor.lastProcessedBlock,
    orphanedLogs: orphanRows.length,
    details: { affectedAgreements: unique },
  });

  return { rewoundTo: block, orphaned: orphanRows.length };
}

/**
 * Recomputes an agreement's state purely from stored canonical events. Used after
 * a reorg so the projection can never drift from the chain.
 */
export async function rebuildProjection(db: Database, cfg: EscrowConfig, onchainId: string): Promise<void> {
  const [agreement] = await db
    .select()
    .from(agreements)
    .where(and(eq(agreements.onchainId, onchainId.toLowerCase()), eq(agreements.chainId, cfg.chainId)))
    .limit(1);
  if (!agreement) return;

  await db
    .update(agreements)
    .set({
      state: "proposed",
      acceptedAt: null,
      deliveredAt: null,
      releasedAt: null,
      fundingTxHash: null,
      fundingBlock: null,
      lastEventBlock: null,
      lastEventLogIndex: null,
      updatedAt: new Date(),
    })
    .where(eq(agreements.id, agreement.id));

  const rows = await db
    .select()
    .from(chainEvents)
    .where(
      and(
        eq(chainEvents.chainId, cfg.chainId),
        eq(chainEvents.contractAddress, cfg.escrow.toLowerCase()),
        eq(chainEvents.agreementOnchainId, onchainId.toLowerCase()),
      ),
    )
    .orderBy(asc(chainEvents.blockNumber), asc(chainEvents.logIndex));

  for (const row of rows) {
    const event: DecodedEscrowEvent = {
      eventName: row.eventName,
      agreementId: onchainId as Hex,
      args: (row.decoded ?? {}) as Record<string, unknown>,
      blockNumber: BigInt(row.blockNumber),
      blockHash: row.blockHash as Hex,
      txHash: row.txHash as Hex,
      logIndex: row.logIndex,
      address: row.contractAddress as Hex,
    };
    await db.transaction(async (tx) => {
      await projectEscrowEvent(tx, { chainId: cfg.chainId, contract: cfg.escrow, event });
    });
  }
}

/** Fetches, persists and projects a block range. Safe to call twice for the same range. */
export async function processRange(
  db: Database,
  cfg: EscrowConfig,
  fromBlock: number,
  toBlock: number,
): Promise<{ logs: number; applied: number; toBlockHash: string }> {
  if (toBlock < fromBlock) return { logs: 0, applied: 0, toBlockHash: "" };
  const client = publicClientFor(cfg);

  const logs = await client.getLogs({
    address: cfg.escrow,
    fromBlock: BigInt(fromBlock),
    toBlock: BigInt(toBlock),
  });
  const events = decodeEscrowLogs(
    logs.map((l) => ({
      address: l.address,
      topics: l.topics,
      data: l.data,
      blockNumber: l.blockNumber,
      blockHash: l.blockHash,
      transactionHash: l.transactionHash,
      logIndex: l.logIndex,
    })),
    cfg.escrow,
  );

  let applied = 0;
  for (const event of events) {
    await db.transaction(async (tx) => {
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
      const res = await projectEscrowEvent(tx, { chainId: cfg.chainId, contract: cfg.escrow, event });
      if (res.applied) applied += 1;
    });
  }

  const toBlockHash = (await client.getBlock({ blockNumber: BigInt(toBlock) })).hash;
  return { logs: events.length, applied, toBlockHash };
}

/** One polling iteration; exported so tests and the cron worker share the code. */
export async function tick(db: Database, cfg: EscrowConfig, config: Config) {
  const client = publicClientFor(cfg);
  const latest = await client.getBlockNumber();

  let cursor = await getCursor(
    db,
    cfg.chainId,
    cfg.escrow,
    Number(process.env.INDEXER_START_BLOCK ?? Math.max(0, Number(latest) - 500)),
  );

  const reorg = await handleReorg(db, cfg, cursor);
  if (reorg) {
    cursor = await getCursor(db, cfg.chainId, cfg.escrow, reorg.rewoundTo);
  }

  const target = Number(latest) - config.INDEXER_CONFIRMATIONS;
  if (target <= cursor.lastProcessedBlock) return { processed: 0, targeted: false };

  const to = Math.min(cursor.lastProcessedBlock + config.INDEXER_BLOCK_CHUNK, target);
  const res = await processRange(db, cfg, cursor.lastProcessedBlock + 1, to);
  if (res.toBlockHash) await setCursor(db, cfg.chainId, cfg.escrow, to, res.toBlockHash);
  return { processed: res.logs, applied: res.applied, from: cursor.lastProcessedBlock + 1, to, targeted: true };
}

async function main() {
  const { loadConfig } = await import("../config.js");
  const { createDb } = await import("../db/client.js");
  const config = loadConfig();
  const cfg = escrowConfig(config);
  const { db, close } = createDb(config.DATABASE_URL, 4);

  console.log(
    JSON.stringify({
      level: "info",
      msg: "indexer starting",
      chainId: cfg.chainId,
      escrow: cfg.escrow,
      confirmations: config.INDEXER_CONFIRMATIONS,
    }),
  );

  let stop = false;
  process.on("SIGINT", () => (stop = true));
  process.on("SIGTERM", () => (stop = true));

  let backoff = config.INDEXER_POLL_MS;
  while (!stop) {
    try {
      const res = await tick(db, cfg, config);
      if (res.targeted) console.log(JSON.stringify({ level: "info", msg: "indexed", ...res }));
      backoff = config.INDEXER_POLL_MS;
      await new Promise((r) => setTimeout(r, config.INDEXER_POLL_MS));
    } catch (err) {
      console.error(JSON.stringify({ level: "error", msg: "indexer error", error: (err as Error).message }));
      await new Promise((r) => setTimeout(r, Math.min(backoff, 60_000)));
      backoff *= 2;
    }
  }
  await close();
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
