/**
 * Canonical JSON + domain-separated keccak256.
 *
 * This is a byte-for-byte mirror of `server/src/lib/canonical.ts`. Both are
 * validated against `spec/hash-vectors.json`, which is the normative artifact:
 * if an implementation diverges, the vectors fail.
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
    case "number":
      if (!Number.isFinite(value)) throw new Error("canonical: non-finite number");
      if (Object.is(value, -0)) return "0";
      return JSON.stringify(value);
    case "string":
      return JSON.stringify(assertWellFormed(value));
    case "bigint":
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
    if (obj instanceof Date) throw new Error("canonical: Date must be encoded as an ISO string");
    const rec = obj as Record<string, unknown>;
    const keys = Object.keys(rec)
      .filter((k) => rec[k] !== undefined)
      .sort();
    const parts: string[] = [];
    for (const k of keys) parts.push(`${JSON.stringify(assertWellFormed(k))}:${canonical(rec[k], seen)}`);
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

export function canonicalHash(domain: string, value: unknown): Hex {
  return keccak256(toBytes(canonicalize({ domain, payload: value })));
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
} as const;
