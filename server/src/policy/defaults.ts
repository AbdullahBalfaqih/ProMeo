import type { PolicyDocument } from "./engine.js";

/**
 * Starter policy template copied into a new organization. It is intentionally
 * conservative and easy to read; every number is in MUSD base units (18 dec).
 *
 * Logic (deny-overrides):
 *  1. Hard deny anything above 25,000 MUSD regardless of rules.
 *  2. Agents below trust level 2 may not spend more than 2,000 MUSD.
 *  3. Unverified vendors require a human at any amount up to 1,000 MUSD, and
 *     are refused above it.
 *  4. Anything above 500 MUSD needs a human approver.
 *  5. Verified vendors with any trust level are auto-approved up to 500 MUSD.
 *  6. Default deny.
 */
export function defaultPolicyDocument(): PolicyDocument {
  const m = (whole: number) => (BigInt(whole) * 10n ** 18n).toString();
  return {
    schemaVersion: 1,
    name: "Default procurement policy",
    description: "Conservative starter policy: human approval above 500 MUSD, hard ceiling at 25,000 MUSD.",
    defaultEffect: "deny",
    limits: {
      maxAmount: m(25_000),
      minAmount: "1",
      allowedCategories: [
        "cloud_infrastructure",
        "software",
        "security",
        "data",
        "marketing",
        "logistics",
        "research",
        "professional_services",
        "other",
      ],
      maxAgentTrustRequiredAmount: { trustLevel: 2, maxAmount: m(2_000) },
    },
    approval: { requiredRoles: ["approver"], ttlMinutes: 1440 },
    rules: [
      {
        id: "unverified-vendor-large",
        effect: "deny",
        priority: 100,
        description: "Unverified vendors may not receive more than 1,000 MUSD",
        when: { all: [{ field: "vendor.verified", op: "eq", value: false }, { field: "amount", op: "gt", value: m(1_000) }] },
      },
      {
        id: "unverified-vendor-approval",
        effect: "require_human_approval",
        priority: 85,
        description: "Unverified vendors always need a human, up to the 1,000 MUSD hard limit",
        when: {
          all: [
            { field: "vendor.verified", op: "eq", value: false },
            { field: "amount", op: "lte", value: m(1_000) },
          ],
        },
      },
      {
        id: "large-request-needs-human",
        effect: "require_human_approval",
        priority: 90,
        description: "Orders above 500 MUSD require a human approver",
        when: { all: [{ field: "amount", op: "gt", value: m(500) }] },
      },
      {
        id: "after-hours-approval",
        effect: "require_human_approval",
        priority: 80,
        description: "Agent-initiated spend outside 06:00-20:00 UTC requires a human",
        when: { all: [{ field: "time.hourUtc", op: "within_hours", value: { from: 20, to: 6 } }] },
      },
      {
        id: "verified-vendor-auto",
        effect: "allow",
        priority: 50,
        description: "Verified vendors up to 500 MUSD may proceed automatically",
        when: { all: [{ field: "vendor.verified", op: "eq", value: true }, { field: "amount", op: "lte", value: m(500) }] },
      },
    ],
  };
}
