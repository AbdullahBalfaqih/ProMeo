import type { Chain } from "viem";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeFunctionData,
  getContractAddress,
  http,
  keccak256,
  parseAbiItem,
  toBytes,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Config } from "../config.js";
import { chainError, preconditionFailed } from "../lib/errors.js";
import { escrowAbi, registryAbi } from "./abi.js";

/** Mezo chains use 18-decimal native BTC; gas is priced in wei of that asset. */
export const mezoTestnet = {
  id: 31611,
  name: "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.test.mezo.org"] } },
  blockExplorers: { default: { name: "Mezo Testnet Explorer", url: "https://explorer.test.mezo.org" } },
} as const;

export const mezoMainnet = {
  id: 31612,
  name: "Mezo",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mezo.org"] } },
  blockExplorers: { default: { name: "Mezo Explorer", url: "https://explorer.mezo.org" } },
} as const;

export function chainFor(chainId: number) {
  if (chainId === mezoTestnet.id) return mezoTestnet;
  if (chainId === mezoMainnet.id) return mezoMainnet;
  // Custom/local chains (anvil) are allowed but clearly labelled.
  return {
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
    rpcUrls: { default: { http: [] as string[] } },
    blockExplorers: { default: { name: "none", url: "" } },
  } as const;
}

export interface EscrowConfig {
  chainId: number;
  rpcUrl: string;
  escrow: Address;
  registry: Address;
  musd: Address;
  explorer: string;
}

export function escrowConfig(config: Config): EscrowConfig {
  if (!config.ESCROW_CONTRACT_ADDRESS || !config.REGISTRY_CONTRACT_ADDRESS || !config.MUSD_ADDRESS) {
    throw preconditionFailed(
      "Escrow is not configured on this deployment (ESCROW_CONTRACT_ADDRESS / REGISTRY_CONTRACT_ADDRESS / MUSD_ADDRESS)",
    );
  }
  return {
    chainId: config.MEZO_CHAIN_ID,
    rpcUrl: config.MEZO_RPC_URL,
    escrow: config.ESCROW_CONTRACT_ADDRESS as Address,
    registry: config.REGISTRY_CONTRACT_ADDRESS as Address,
    musd: config.MUSD_ADDRESS as Address,
    explorer: config.MEZO_EXPLORER_URL,
  };
}

export function publicClientFor(cfg: EscrowConfig): PublicClient {
  return createPublicClient({ transport: http(cfg.rpcUrl, { timeout: 20_000 }) }) as PublicClient;
}

export function orgOnchainId(orgUuid: string): Hex {
  // Deterministic mapping documented in docs/DATA_MODEL.md: keccak256(utf8(uuid)).
  return keccak256(toBytes(orgUuid));
}

export function requestOnchainId(requestUuid: string): Hex {
  return keccak256(toBytes(requestUuid));
}

export interface FundingIntent {
  chainId: number;
  to: Address;
  data: Hex;
  value: "0";
  /** Human-readable summary for wallets that cannot decode custom contracts. */
  description: string;
  agreementId: Hex;
  nonce: string;
}

export async function buildFundingIntent(params: {
  cfg: EscrowConfig;
  orgId: string;
  requestId: string;
  offerHash: Hex;
  termsHash: Hex;
  buyer: Address;
  vendor: Address;
  amount: bigint;
  acceptBy: number;
  deliverBy: number;
  disputeWindow: number;
  nonce: bigint;
}): Promise<FundingIntent> {
  const client = publicClientFor(params.cfg);
  let agreementId: Hex;
  let feeAmount: bigint;
  try {
    agreementId = (await client.readContract({
      address: params.cfg.escrow,
      abi: escrowAbi,
      functionName: "agreementIdFor",
      args: [orgOnchainId(params.orgId), requestOnchainId(params.requestId), params.offerHash, params.nonce],
    })) as Hex;
    feeAmount = (await client.readContract({
      address: params.cfg.escrow,
      abi: escrowAbi,
      functionName: "quoteFee",
      args: [params.amount],
    })) as bigint;
  } catch (err) {
    throw chainError("Failed to read the escrow contract", { cause: (err as Error).message });
  }

  const data = encodeFunctionData({
    abi: escrowAbi,
    functionName: "createAgreement",
    args: [
      params.buyer,
      {
        orgId: orgOnchainId(params.orgId),
        requestId: requestOnchainId(params.requestId),
        offerHash: params.offerHash,
        termsHash: params.termsHash,
        vendor: params.vendor,
        amount: params.amount,
        acceptBy: BigInt(params.acceptBy),
        deliverBy: BigInt(params.deliverBy),
        disputeWindow: BigInt(params.disputeWindow),
        nonce: params.nonce,
        feeOnTop: true,
      },
    ],
  });

  return {
    chainId: params.cfg.chainId,
    to: params.cfg.escrow,
    data,
    value: "0",
    description: `Fund ${params.amount} MUSD (+${feeAmount} MUSD fee) into escrow ${agreementId.slice(0, 10)}…`,
    agreementId,
    nonce: params.nonce.toString(),
  };
}

export function actionIntent(cfg: EscrowConfig, action: "release" | "cancelUnaccepted", agreementId: Hex): FundingIntent {
  return {
    chainId: cfg.chainId,
    to: cfg.escrow,
    data: encodeFunctionData({ abi: escrowAbi, functionName: action, args: [agreementId] }),
    value: "0",
    description: `${action} escrow ${agreementId.slice(0, 10)}…`,
    agreementId,
    nonce: "0",
  };
}

export function disputeIntent(cfg: EscrowConfig, agreementId: Hex, evidenceHash: Hex): FundingIntent {
  return {
    chainId: cfg.chainId,
    to: cfg.escrow,
    data: encodeFunctionData({ abi: escrowAbi, functionName: "dispute", args: [agreementId, evidenceHash] }),
    value: "0",
    description: `Dispute escrow ${agreementId.slice(0, 10)}…`,
    agreementId,
    nonce: "0",
  };
}

export interface DecodedEscrowEvent {
  eventName: string;
  agreementId: Hex;
  args: Record<string, unknown>;
  blockNumber: bigint;
  blockHash: Hex;
  txHash: Hex;
  logIndex: number;
  address: Address;
}

const eventNames = new Set([
  "AgreementCreated",
  "AgreementAccepted",
  "DeliverySubmitted",
  "AgreementReleased",
  "AgreementRefunded",
  "AgreementDisputed",
  "DisputeResolved",
  "AgreementCancelled",
]);

export function decodeEscrowLogs(logs: readonly { address: string; topics: readonly Hex[]; data: Hex; blockNumber: bigint | null; blockHash: Hex | null; transactionHash: Hex | null; logIndex: number | null; removed?: boolean }[], escrow: Address): DecodedEscrowEvent[] {
  const out: DecodedEscrowEvent[] = [];
  for (const log of logs) {
    if (log.address.toLowerCase() !== escrow.toLowerCase()) continue;
    if (log.removed) continue;
    try {
      const decoded = decodeEventLog({ abi: escrowAbi, topics: log.topics as [Hex, ...Hex[]], data: log.data });
      if (!decoded.eventName || !eventNames.has(decoded.eventName)) continue;
      const args = decoded.args as unknown as Record<string, unknown>;
      const agreementId = args.agreementId as Hex | undefined;
      if (!agreementId) continue;
      out.push({
        eventName: decoded.eventName,
        agreementId,
        args,
        blockNumber: log.blockNumber ?? 0n,
        blockHash: (log.blockHash ?? "0x") as Hex,
        txHash: (log.transactionHash ?? "0x") as Hex,
        logIndex: log.logIndex ?? 0,
        address: log.address as Address,
      });
    } catch {
      // Not one of our events.
    }
  }
  return out;
}

/** Reads the transaction receipt and returns events belonging to this escrow. */
export async function eventsFromTx(
  cfg: EscrowConfig,
  txHash: Hex,
): Promise<{ receipt: TransactionReceipt; events: DecodedEscrowEvent[] }> {
  const client = publicClientFor(cfg);
  let receipt: TransactionReceipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash });
  } catch (err) {
    throw chainError("Transaction not found on the configured chain", { cause: (err as Error).message });
  }
  if (receipt.status !== "success") throw chainError("Transaction reverted on-chain", { txHash });
  return { receipt, events: decodeEscrowLogs(receipt.logs, cfg.escrow) };
}

export async function readAgreementState(cfg: EscrowConfig, agreementId: Hex) {
  const client = publicClientFor(cfg);
  const state = (await client.readContract({
    address: cfg.escrow,
    abi: escrowAbi,
    functionName: "getAgreement",
    args: [agreementId],
  })) as unknown as { state: number };
  return Number(state.state ?? state);
}

/** Sends resolveDispute with the configured resolver key, if the key holds the role. */
export async function resolveDisputeOnchain(
  cfg: EscrowConfig,
  privateKey: Hex,
  agreementId: Hex,
  vendorAmount: bigint,
  rulingHash: Hex,
): Promise<Hex> {
  const account = privateKeyToAccount(privateKey);
  const pub = publicClientFor(cfg);
  const hasRole = (await pub.readContract({
    address: cfg.escrow,
    abi: escrowAbi,
    functionName: "hasRole",
    args: [
      (await pub.readContract({ address: cfg.escrow, abi: escrowAbi, functionName: "RESOLVER_ROLE" })) as Hex,
      account.address,
    ],
  })) as boolean;
  if (!hasRole) throw preconditionFailed("Configured resolver key does not hold RESOLVER_ROLE on-chain");

  const wallet = createWalletClient({ account, transport: http(cfg.rpcUrl) });
  const hash = await wallet.writeContract({
    address: cfg.escrow,
    abi: escrowAbi,
    functionName: "resolveDispute",
    args: [agreementId, vendorAmount, rulingHash],
    chain: chainFor(cfg.chainId) as unknown as Chain,
    account,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw chainError("resolveDispute reverted");
  return hash;
}

/** Reads which agent wallets are authorized for an org, straight from the registry. */
export async function readAgentAuthorization(cfg: EscrowConfig, orgId: string, agent: Address) {
  const client = publicClientFor(cfg);
  const [authorized, validUntil, policyHash, orgFrozen] = (await client.readContract({
    address: cfg.registry,
    abi: registryAbi,
    functionName: "authorizationOf",
    args: [orgOnchainId(orgId), agent],
  })) as [boolean, bigint, Hex, boolean];
  return { authorized, validUntil: Number(validUntil), policyHash, orgFrozen };
}

export const agreementCreatedEvent = parseAbiItem(
  "event AgreementCreated(bytes32 indexed agreementId, bytes32 indexed orgId, bytes32 indexed requestId, address buyer, address vendor, uint256 amount, uint256 feeAmount, bytes32 offerHash, bytes32 termsHash, uint64 acceptBy, uint64 deliverBy, uint64 disputeWindow)",
);

export { getContractAddress };
