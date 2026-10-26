import { describe, expect, it } from "vitest";
import {
  evaluatePolicy,
  policyHashOf,
  validatePolicyDocument,
  type PolicyContext,
  type PolicyDocument,
} from "../src/policy/engine.js";
import { defaultPolicyDocument } from "../src/policy/defaults.js";

const m = (n: number) => (BigInt(n) * 10n ** 18n).toString();

const ctx = (over: Partial<PolicyContext> = {}): PolicyContext => ({
  amount: m(100),
  currency: "MUSD",
  category: "cloud_infrastructure",
  budgetAmount: m(5000),
  agent: { id: "agent-1", trustLevel: 2 },
  vendor: { id: "vendor-1", verified: true, tier: 3 },
  request: { offerCount: 2 },
  time: { hourUtc: 12, dayOfWeekUtc: 2 },
  ...over,
});

const doc = defaultPolicyDocument();
const hash = policyHashOf(doc);

describe("default policy decisions", () => {
  it("auto-allows a verified vendor under 500 MUSD", () => {
    const e = evaluatePolicy(doc, 3, hash, ctx({ amount: m(499) }));
    expect(e.decision).toBe("ALLOW");
  });

  it("requires human approval above 500 MUSD", () => {
    const e = evaluatePolicy(doc, 3, hash, ctx({ amount: m(900) }));
    expect(e.decision).toBe("REQUIRE_HUMAN_APPROVAL");
    expect(e.requiredRoles).toContain("approver");
    expect(e.approvalTtlMinutes).toBe(1440);
  });

  it("denies above the hard ceiling regardless of any allow rule", () => {
    const e = evaluatePolicy(doc, 3, hash, ctx({ amount: m(25_001) }));
    expect(e.decision).toBe("DENY");
    expect(e.matchedRules[0]!.id).toBe("limit:maxAmount");
  });

  it("denies a disallowed category", () => {
    const e = evaluatePolicy(doc, 3, hash, ctx({ category: "gambling" }));
    expect(e.decision).toBe("DENY");
  });

  it("denies low-trust agents above their cap", () => {
    const e = evaluatePolicy(doc, 3, hash, ctx({ amount: m(2500), agent: { id: "a", trustLevel: 1 } }));
    expect(e.decision).toBe("DENY");
  });

  it("denies unverified vendors above 1,000 MUSD", () => {
    const e = evaluatePolicy(doc, 3, hash, ctx({ amount: m(1500), vendor: { id: "v", verified: false, tier: 1 } }));
    expect(e.decision).toBe("DENY");
  });

  it("forces a human for any unverified vendor below the hard limit", () => {
    expect(evaluatePolicy(doc, 3, hash, ctx({ amount: m(400), vendor: { id: "v", verified: false, tier: 1 } })).decision).toBe(
      "REQUIRE_HUMAN_APPROVAL",
    );
    expect(evaluatePolicy(doc, 3, hash, ctx({ amount: m(600), vendor: { id: "v", verified: false, tier: 1 } })).decision).toBe(
      "REQUIRE_HUMAN_APPROVAL",
    );
  });

  it("is deterministic and echoes the exact policy version and hash", () => {
    const a = evaluatePolicy(doc, 7, hash, ctx({ amount: m(700) }));
    const b = evaluatePolicy(doc, 7, hash, ctx({ amount: m(700) }));
    expect(a).toEqual(b);
    expect(a.policyVersion).toBe(7);
    expect(a.policyHash).toBe(hash);
  });
});

describe("deny-overrides semantics", () => {
  const custom: PolicyDocument = {
    schemaVersion: 1,
    name: "override test",
    defaultEffect: "allow",
    rules: [
      { id: "allow-all", effect: "allow", priority: 10, when: { field: "currency", op: "eq", value: "MUSD" } },
      { id: "deny-most", effect: "deny", priority: 5, when: { field: "amount", op: "gt", value: m(10) } },
    ],
  };

  it("denies even when a higher-priority rule allows", () => {
    const e = evaluatePolicy(custom, 1, "0xabc", ctx({ amount: m(11) }));
    expect(e.decision).toBe("DENY");
    expect(e.matchedRules.map((r) => r.id).sort()).toEqual(["allow-all", "deny-most"]);
  });

  it("falls back to the policy default when nothing matches", () => {
    const sparse: PolicyDocument = {
      schemaVersion: 1,
      name: "sparse",
      defaultEffect: "deny",
      rules: [{ id: "huge-only", effect: "allow", when: { field: "amount", op: "gt", value: m(100_000) } }],
    };
    const e = evaluatePolicy(sparse, 1, "0xabc", ctx({ amount: m(1) }));
    expect(e.decision).toBe("DENY");
    expect(e.matchedRules).toEqual([]);
  });

  it("escalates before allowing", () => {
    const withApproval: PolicyDocument = {
      ...custom,
      rules: [
        { id: "approve", effect: "require_human_approval", when: { field: "amount", op: "gt", value: m(5) } },
        { id: "allow", effect: "allow", when: { field: "amount", op: "gt", value: m(0) } },
      ],
    };
    expect(evaluatePolicy(withApproval, 1, "0xabc", ctx({ amount: m(6) })).decision).toBe("REQUIRE_HUMAN_APPROVAL");
  });
});

describe("policy validation", () => {
  it("accepts the shipped default", () => {
    expect(() => validatePolicyDocument(doc)).not.toThrow();
  });

  it("rejects unknown fields and operators", () => {
    expect(() =>
      validatePolicyDocument({
        schemaVersion: 1,
        name: "x",
        defaultEffect: "deny",
        rules: [{ id: "r", effect: "allow", when: { field: "vendor.secretScore", op: "gt", value: "1" } }],
      }),
    ).toThrow(/unknown field/i);

    expect(() =>
      validatePolicyDocument({
        schemaVersion: 1,
        name: "x",
        defaultEffect: "deny",
        rules: [{ id: "r", effect: "allow", when: { field: "amount", op: "approx", value: "1" } }],
      }),
    ).toThrow(/unknown op|comparator/i);
  });

  it("rejects duplicate rule ids and oversized policies", () => {
    const rule = { id: "dup", effect: "allow" as const, when: { field: "amount" as const, op: "gt" as const, value: "1" } };
    expect(() =>
      validatePolicyDocument({ schemaVersion: 1, name: "x", defaultEffect: "deny", rules: [rule, rule] }),
    ).toThrow(/duplicate/i);
    const many = Array.from({ length: 201 }, (_, i) => ({ ...rule, id: `r${i}` }));
    expect(() => validatePolicyDocument({ schemaVersion: 1, name: "x", defaultEffect: "deny", rules: many })).toThrow(/too many/i);
  });

  it("changes the hash when anything changes", () => {
    const copy = JSON.parse(JSON.stringify(doc)) as PolicyDocument;
    copy.rules[0]!.priority = 999;
    expect(policyHashOf(copy)).not.toBe(hash);
  });
});
