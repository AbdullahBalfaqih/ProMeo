import { keccak256, toBytes, verifyTypedData, type Address, type Hex } from "viem";
import { canonicalHash, DOMAINS } from "./canonical.js";

/** The exact object a vendor commits to. Hashed, then signed via EIP-712. */
export interface OfferPayload {
  requestId: string;
  vendorId: string;
  vendorWallet: string;
  serviceId: string | null;
  /** Base units (integer string). Signed payloads never use decimal notation. */
  priceAmount: string;
  currency: "MUSD";
  deliveryDays: number;
  terms: Record<string, unknown>;
  /** ISO-8601 with second precision (the canonical form truncates milliseconds). */
  expiresAt: string;
  nonce: string;
}

export function normalizeOfferPayload(p: OfferPayload): OfferPayload {
  return {
    requestId: p.requestId,
    vendorId: p.vendorId,
    vendorWallet: p.vendorWallet.toLowerCase(),
    serviceId: p.serviceId,
    priceAmount: p.priceAmount,
    currency: "MUSD",
    deliveryDays: p.deliveryDays,
    terms: p.terms,
    expiresAt: new Date(p.expiresAt).toISOString(),
    nonce: p.nonce,
  };
}

export function hashOffer(p: OfferPayload): Hex {
  return canonicalHash(DOMAINS.offer, normalizeOfferPayload(p));
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

/** JSON-safe variant for sending to / receiving from the API. */
export function serializableOfferTypedData(td: ReturnType<typeof offerTypedData>) {
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
