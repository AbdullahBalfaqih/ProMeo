import { keccak256, toBytes, verifyTypedData, type Address, type Hex } from "viem";
import { canonicalHash, DOMAINS } from "../lib/canonical.js";

/** Everything a vendor commits to. This exact object is hashed and published. */
export interface OfferPayload {
  requestId: string;
  vendorId: string;
  vendorWallet: string;
  serviceId: string | null;
  priceAmount: string;
  currency: string;
  deliveryDays: number;
  terms: Record<string, unknown>;
  expiresAt: string; // ISO-8601, UTC, second precision
  nonce: string;
}

export function offerCanonicalPayload(p: OfferPayload): OfferPayload {
  return {
    requestId: p.requestId,
    vendorId: p.vendorId,
    vendorWallet: p.vendorWallet.toLowerCase(),
    serviceId: p.serviceId,
    priceAmount: p.priceAmount,
    currency: p.currency,
    deliveryDays: p.deliveryDays,
    terms: p.terms,
    expiresAt: new Date(p.expiresAt).toISOString(),
    nonce: p.nonce,
  };
}

export function hashOffer(p: OfferPayload): Hex {
  return canonicalHash(DOMAINS.offer, offerCanonicalPayload(p));
}

export function requestIdHash(requestId: string): Hex {
  return keccak256(toBytes(requestId));
}

export function offerTypedData(params: {
  chainId: number;
  verifyingContract: Address;
  requestId: string;
  offerHash: Hex;
  vendor: Address;
  priceAmount: bigint;
  expiresAt: number;
}) {
  return {
    domain: {
      name: "AgentProcurementNetwork",
      version: "1",
      chainId: params.chainId,
      verifyingContract: params.verifyingContract,
    },
    types: {
      Offer: [
        { name: "requestId", type: "bytes32" },
        { name: "offerHash", type: "bytes32" },
        { name: "vendor", type: "address" },
        { name: "priceAmount", type: "uint256" },
        { name: "expiresAt", type: "uint64" },
      ],
    },
    primaryType: "Offer" as const,
    message: {
      requestId: requestIdHash(params.requestId),
      offerHash: params.offerHash,
      vendor: params.vendor,
      priceAmount: params.priceAmount,
      expiresAt: BigInt(params.expiresAt),
    },
  } as const;
}

export async function verifyOfferSignature(params: {
  chainId: number;
  verifyingContract: Address;
  signature: Hex;
  signer: Address;
  requestId: string;
  offerHash: Hex;
  priceAmount: bigint;
  expiresAt: number;
}): Promise<boolean> {
  try {
    return await verifyTypedData({
      address: params.signer,
      signature: params.signature,
      ...offerTypedData({ ...params, vendor: params.signer }),
    });
  } catch {
    return false;
  }
}

/** JSON-safe view of the EIP-712 payload (viem accepts strings for uint fields). */
export function serializableTypedData(td: ReturnType<typeof offerTypedData>) {
  return {
    domain: td.domain,
    types: td.types,
    primaryType: td.primaryType,
    message: {
      requestId: td.message.requestId,
      offerHash: td.message.offerHash,
      vendor: td.message.vendor,
      priceAmount: td.message.priceAmount.toString(),
      expiresAt: td.message.expiresAt.toString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Deterministic ranking
// ---------------------------------------------------------------------------

export const WEIGHTS = {
  price: 45,
  speed: 25,
  verified: 10,
  tier: 15,
  capability: 5,
} as const;

const PERMILLE = 1000n;

export interface RankableOffer {
  offerId: string;
  vendorId: string;
  vendorName: string;
  vendorVerified: boolean;
  vendorTier: number; // 1..5
  priceAmount: bigint; // MUSD base units
  deliveryDays: number; // >= 1
  serviceCapabilities: string[];
  expiresAt: Date;
}

export interface RankedOffer {
  offerId: string;
  vendorId: string;
  vendorName: string;
  vendorVerified: boolean;
  priceAmount: string;
  deliveryDays: number;
  rankScore: number; // 0..100000, integer permille
  rankBreakdown: {
    price: number;
    speed: number;
    verified: number;
    tier: number;
    capability: number;
    eligible: boolean;
    reason?: string;
  };
}

/**
 * Pure function. Same inputs -> byte-identical ordering, no clock, no locale,
 * no floating point. Scores are integers in per-mille (max 100_000).
 *
 * Tie-break order: score desc, price asc, delivery days asc, vendor id asc.
 */
export function rankOffers(
  offers: RankableOffer[],
  requirements: { capabilities: string[]; budgetAmount: bigint; now: Date },
): RankedOffer[] {
  const eligible = offers.filter((o) => o.expiresAt.getTime() > requirements.now.getTime() && o.priceAmount > 0n);
  if (eligible.length === 0) return [];

  const bestPrice = eligible.reduce((m, o) => (o.priceAmount < m ? o.priceAmount : m), eligible[0]!.priceAmount);
  const bestDays = eligible.reduce((m, o) => (o.deliveryDays < m ? o.deliveryDays : m), eligible[0]!.deliveryDays);
  const required = requirements.capabilities;

  const ranked = offers.map<RankedOffer>((o) => {
    const expired = o.expiresAt.getTime() <= requirements.now.getTime();
    const overBudget = o.priceAmount > requirements.budgetAmount;
    const eligibleNow = !expired && !overBudget && o.priceAmount > 0n;

    const price = Number((BigInt(WEIGHTS.price) * PERMILLE * bestPrice) / o.priceAmount);
    const speed = Number((BigInt(WEIGHTS.speed) * PERMILLE * BigInt(bestDays)) / BigInt(o.deliveryDays));
    const verified = o.vendorVerified ? WEIGHTS.verified * 1000 : 0;
    const tierNum = BigInt(Math.min(Math.max(o.vendorTier, 0), 5));
    const tier = Number((BigInt(WEIGHTS.tier) * PERMILLE * tierNum) / 5n);
    const matched = required.filter((c) => o.serviceCapabilities.includes(c)).length;
    const capability =
      required.length === 0
        ? WEIGHTS.capability * 1000
        : Number((BigInt(WEIGHTS.capability) * PERMILLE * BigInt(matched)) / BigInt(required.length));

    const total = price + speed + verified + tier + capability;
    return {
      offerId: o.offerId,
      vendorId: o.vendorId,
      vendorName: o.vendorName,
      vendorVerified: o.vendorVerified,
      priceAmount: o.priceAmount.toString(),
      deliveryDays: o.deliveryDays,
      rankScore: eligibleNow ? total : 0,
      rankBreakdown: {
        price,
        speed,
        verified,
        tier,
        capability,
        eligible: eligibleNow,
        ...(expired ? { reason: "expired" } : overBudget ? { reason: "over_budget" } : {}),
      },
    };
  });

  return ranked.sort((a, b) => {
    if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
    const pa = BigInt(a.priceAmount);
    const pb = BigInt(b.priceAmount);
    if (pa !== pb) return pa < pb ? -1 : 1;
    if (a.deliveryDays !== b.deliveryDays) return a.deliveryDays - b.deliveryDays;
    return a.vendorId.localeCompare(b.vendorId);
  });
}
