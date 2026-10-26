import { writeFileSync } from "node:fs";
import { canonicalize, canonicalHash, DOMAINS } from "../src/lib/canonical.js";

const inputs: Array<[string, unknown]> = [
  ["simple", { b: 2, a: 1 }],
  ["nested", { z: { y: [3, 2, 1], x: null }, a: true }],
  ["money-strings", { amount: "1200000000000000000000", currency: "MUSD" }],
  ["unicode", { note: "دفعة مقابل خدمات GPU — 8×H100", emoji: "✅" }],
  ["arrays", { list: [1, "two", false, null, { k: "v" }] }],
  ["escapes", { text: "quote\" backslash\\ newline\n tab\t" }],
];

const out = {
  generatedAt: "2026-10-17",
  note: "Cross-language conformance vectors for RFC 8785-style canonical JSON and keccak256 domain hashing. Server and SDK tests must both reproduce these exactly.",
  canonical: inputs.map(([name, input]) => ({ name, input, canonical: canonicalize(input) })),
  hashes: inputs.map(([name, input]) => ({
    name,
    domain: DOMAINS.offer,
    input,
    hash: canonicalHash(DOMAINS.offer, input),
  })),
};

writeFileSync(new URL("../../spec/hash-vectors.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log("wrote spec/hash-vectors.json");
