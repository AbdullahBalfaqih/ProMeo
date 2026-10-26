import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { canonicalHash, canonicalize, DOMAINS } from "../src/lib/canonical.js";

const vectors = JSON.parse(
  readFileSync(new URL("../../spec/hash-vectors.json", import.meta.url), "utf8"),
) as {
  canonical: Array<{ name: string; input: unknown; canonical: string }>;
  hashes: Array<{ name: string; domain: string; input: unknown; hash: string }>;
};

describe("canonical JSON", () => {
  for (const v of vectors.canonical) {
    it(`matches the spec vector: ${v.name}`, () => {
      expect(canonicalize(v.input)).toBe(v.canonical);
    });
  }

  it("sorts keys at every depth and keeps array order", () => {
    expect(canonicalize({ b: { d: 1, c: [{ z: 1, a: 2 }] }, a: [3, 2, 1] })).toBe(
      '{"a":[3,2,1],"b":{"c":[{"a":2,"z":1}],"d":1}}',
    );
  });

  it("refuses values that cannot be represented identically twice", () => {
    expect(() => canonicalize({ x: 1n })).toThrow(/bigint/i);
    expect(() => canonicalize({ x: Number.NaN })).toThrow(/finite/i);
    expect(() => canonicalize({ x: Number.POSITIVE_INFINITY })).toThrow(/finite/i);
    expect(() => canonicalize({ x: new Date() })).toThrow(/ISO/i);
    expect(() => canonicalize({ a: undefined, b: 1 })).not.toThrow();
    expect(() => canonicalize([undefined])).toThrow(/undefined/i);
    expect(() => canonicalize({ x: () => 1 })).toThrow();
  });

  it("drops undefined object properties like JSON.stringify", () => {
    expect(canonicalize({ a: undefined, b: 1 })).toBe('{"b":1}');
  });

  it("normalises negative zero", () => {
    expect(canonicalize({ n: -0 })).toBe('{"n":0}');
  });

  it("rejects lone surrogates (not valid UTF-8)", () => {
    expect(() => canonicalize({ s: "\ud800" })).toThrow(/surrogate/i);
  });

  it("detects circular references", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => canonicalize(a)).toThrow(/circular/i);
  });

  it("allows the same object twice in different branches", () => {
    const shared = { k: 1 };
    expect(canonicalize({ a: shared, b: shared })).toBe('{"a":{"k":1},"b":{"k":1}}');
  });
});

describe("domain-separated hashing", () => {
  for (const v of vectors.hashes) {
    it(`matches the spec vector: ${v.name}`, () => {
      expect(canonicalHash(v.domain, v.input)).toBe(v.hash);
    });
  }

  it("produces different digests for different domains", () => {
    const payload = { a: 1 };
    expect(canonicalHash(DOMAINS.offer, payload)).not.toBe(canonicalHash(DOMAINS.policy, payload));
  });

  it("is insensitive to key order but sensitive to value", () => {
    expect(canonicalHash(DOMAINS.offer, { a: 1, b: 2 })).toBe(canonicalHash(DOMAINS.offer, { b: 2, a: 1 }));
    expect(canonicalHash(DOMAINS.offer, { a: 1, b: 2 })).not.toBe(canonicalHash(DOMAINS.offer, { a: 2, b: 2 }));
  });
});
