/**
 * Canonical JSON (a restricted RFC 8785 / JCS profile) used for every hash the
 * protocol publishes. The same algorithm is implemented in the TypeScript SDK
 * and mirrored on-chain by hashing the resulting UTF-8 bytes with keccak256.
 *
 * Rules:
 *  - Object keys are sorted by UTF-16 code units, no whitespace.
 *  - Strings use JSON escaping; lone surrogates are rejected.
 *  - Numbers must be safe integers or finite decimals representable exactly as
 *    IEEE-754 doubles; money and ids are never numbers (they are strings) so this
 *    restriction keeps cross-language determinism.
 *  - `undefined` fields are omitted; `null` is preserved.
 *  - Arrays preserve order and may not contain holes or undefined.
 */
import { keccak256, toBytes, type Hex } from "viem";

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export function canonicalize(value: unknown): string {
  return canonical(value, new Set());
}

function canonical(value: unknown, seen: Set<object>): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number": {
      if (!Number.isFinite(value)) throw new Error("canonical: non-finite number");
      if (Object.is(value, -0)) return "0";
      if (!Number.isSafeInteger(value) && !Number.isFinite(value)) {
        throw new Error("canonical: unsafe number");
      }
      return JSON.stringify(value);
    }
    case "string":
      return JSON.stringify(assertWellFormed(value));
    case "bigint":
      // BigInts are never serialized as numbers; the caller must pass strings.
      throw new Error("canonical: bigint must be encoded as a decimal string");
    case "undefined":
      throw new Error("canonical: undefined is not a JSON value");
    case "function":
      throw new Error("canonical: functions are not JSON values");
    case "object":
      break;
    default:
      throw new Error(`canonical: unsupported type ${typeof value}`);
  }

  const obj = value as object;
  if (seen.has(obj)) throw new Error("canonical: circular reference");
  seen.add(obj);
  try {
    if (Array.isArray(obj)) {
      const parts: string[] = [];
      for (const item of obj) {
        if (item === undefined) throw new Error("canonical: undefined array element");
        parts.push(canonical(item, seen));
      }
      return `[${parts.join(",")}]`;
    }
    if (obj instanceof Date) {
      throw new Error("canonical: Date must be encoded as an ISO string");
    }
    const rec = obj as Record<string, unknown>;
    const keys = Object.keys(rec)
      .filter((k) => rec[k] !== undefined)
      .sort();
    const parts: string[] = [];
    for (const k of keys) {
      parts.push(`${JSON.stringify(assertWellFormed(k))}:${canonical(rec[k], seen)}`);
    }
    return `{${parts.join(",")}}`;
  } finally {
    seen.delete(obj);
  }
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function assertWellFormed(s: string): string {
  if (LONE_SURROGATE.test(s)) throw new Error("canonical: lone surrogate in string");
  return s;
}

/** keccak256 of canonical JSON, prefixed with a domain tag to prevent reuse. */
export function canonicalHash(domain: string, value: unknown): Hex {
  const body = canonicalize({ domain, payload: value });
  return keccak256(toBytes(body));
}

/** sha256 hex of the canonical form, used for audit chains and idempotency. */
export async function canonicalSha256(value: unknown): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}

export const DOMAINS = {
  offer: "apn.offer.v1",
  terms: "apn.terms.v1",
  policy: "apn.policy.v1",
  manifest: "apn.vendor_manifest.v1",
  request: "apn.request.v1",
  webhook: "apn.webhook.v1",
  audit: "apn.audit.v1",
  dispute: "apn.dispute.v1",
  deliverable: "apn.deliverable.v1",
} as const;
