import { canonicalHash, DOMAINS } from "../lib/canonical.js";

/**
 * Deterministic policy engine.
 *
 * The engine is deliberately boring: no ML, no randomness, no clock reads other
 * than the values injected in the context object. Given the same policy version
 * and the same context it always returns the same decision, which is what makes
 * an approval auditable. Decision precedence is deny-overrides:
 *
 *   any matching DENY  -> DENY
 *   else any matching REQUIRE_HUMAN_APPROVAL -> REQUIRE_HUMAN_APPROVAL
 *   else any matching ALLOW -> ALLOW
 *   else policy.defaultEffect
 *
 * Hard limits (`limits`) are evaluated before rules and can only deny.
 */

export type Decision = "ALLOW" | "DENY" | "REQUIRE_HUMAN_APPROVAL";

export type Comparator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "not_in"
  | "exists"
  | "within_hours";

export interface LeafCondition {
  field: PolicyField;
  op: Comparator;
  value?: unknown;
}

export type Condition =
  | LeafCondition
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export type PolicyField =
  | "amount"
  | "currency"
  | "category"
  | "budgetAmount"
  | "agent.id"
  | "agent.trustLevel"
  | "vendor.verified"
  | "vendor.tier"
  | "vendor.id"
  | "request.offerCount"
  | "time.hourUtc"
  | "time.dayOfWeekUtc";

export interface PolicyRule {
  id: string;
  effect: "allow" | "deny" | "require_human_approval";
  priority?: number;
  description?: string;
  when: Condition;
}

export interface PolicyLimits {
  maxAmount?: string;
  minAmount?: string;
  allowedCategories?: string[];
  maxAgentTrustRequiredAmount?: { trustLevel: number; maxAmount: string };
}

export interface PolicyDocument {
  schemaVersion: 1;
  name: string;
  description?: string;
  defaultEffect: "allow" | "deny";
  rules: PolicyRule[];
  limits?: PolicyLimits;
  approval?: {
    requiredRoles?: string[];
    ttlMinutes: number;
  };
}

export interface PolicyContext {
  amount: string;
  currency: string;
  category: string;
  budgetAmount: string;
  agent: { id: string; trustLevel: number };
  vendor: { id: string; verified: boolean; tier: number } | null;
  request: { offerCount: number };
  time: { hourUtc: number; dayOfWeekUtc: number };
}

export interface MatchedRule {
  id: string;
  effect: PolicyRule["effect"];
  description?: string;
}

export interface Evaluation {
  decision: Decision;
  matchedRules: MatchedRule[];
  policyVersion: number;
  policyHash: string;
  requiresApproval: boolean;
  requiredRoles: string[];
  approvalTtlMinutes: number;
}

const KNOWN_FIELDS = new Set<string>([
  "amount",
  "currency",
  "category",
  "budgetAmount",
  "agent.id",
  "agent.trustLevel",
  "vendor.verified",
  "vendor.tier",
  "vendor.id",
  "request.offerCount",
  "time.hourUtc",
  "time.dayOfWeekUtc",
]);

const OPS = new Set<string>(["eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in", "exists", "within_hours"]);

export class PolicyValidationError extends Error {
  constructor(message: string, readonly path: string) {
    super(`${path}: ${message}`);
    this.name = "PolicyValidationError";
  }
}

/** Structural validation; run before persisting any policy version. */
export function validatePolicyDocument(doc: unknown): PolicyDocument {
  if (!isRecord(doc)) throw new PolicyValidationError("policy must be an object", "$");
  if (doc.schemaVersion !== 1) throw new PolicyValidationError("schemaVersion must be 1", "schemaVersion");
  if (typeof doc.name !== "string" || doc.name.trim().length === 0) {
    throw new PolicyValidationError("name is required", "name");
  }
  if (doc.defaultEffect !== "allow" && doc.defaultEffect !== "deny") {
    throw new PolicyValidationError("defaultEffect must be allow or deny", "defaultEffect");
  }
  if (!Array.isArray(doc.rules)) throw new PolicyValidationError("rules must be an array", "rules");
  if (doc.rules.length > 200) throw new PolicyValidationError("too many rules (max 200)", "rules");

  const ids = new Set<string>();
  doc.rules.forEach((rule, i) => {
    const base = `rules[${i}]`;
    if (!isRecord(rule)) throw new PolicyValidationError("rule must be an object", base);
    if (typeof rule.id !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(rule.id)) {
      throw new PolicyValidationError("id must match ^[a-z0-9][a-z0-9_-]{0,63}$", `${base}.id`);
    }
    if (ids.has(rule.id)) throw new PolicyValidationError(`duplicate rule id ${rule.id}`, `${base}.id`);
    ids.add(rule.id);
    if (!["allow", "deny", "require_human_approval"].includes(String(rule.effect))) {
      throw new PolicyValidationError("invalid effect", `${base}.effect`);
    }
    if (rule.priority !== undefined && (typeof rule.priority !== "number" || !Number.isFinite(rule.priority))) {
      throw new PolicyValidationError("priority must be a number", `${base}.priority`);
    }
    validateCondition(rule.when, `${base}.when`);
  });

  if (doc.limits !== undefined) {
    if (!isRecord(doc.limits)) throw new PolicyValidationError("limits must be an object", "limits");
    for (const k of ["maxAmount", "minAmount"] as const) {
      const v = doc.limits[k];
      if (v !== undefined && (typeof v !== "string" || !/^[0-9]+$/.test(v))) {
        throw new PolicyValidationError(`${k} must be an integer string in base units`, `limits.${k}`);
      }
    }
    const al = doc.limits.allowedCategories;
    if (al !== undefined && (!Array.isArray(al) || al.some((c) => typeof c !== "string"))) {
      throw new PolicyValidationError("allowedCategories must be strings", "limits.allowedCategories");
    }
  }

  if (doc.approval !== undefined) {
    if (!isRecord(doc.approval)) throw new PolicyValidationError("approval must be an object", "approval");
    const ttl = doc.approval.ttlMinutes;
    if (typeof ttl !== "number" || !Number.isFinite(ttl) || ttl <= 0 || ttl > 20160) {
      throw new PolicyValidationError("approval.ttlMinutes must be 1..20160", "approval.ttlMinutes");
    }
    const roles = doc.approval.requiredRoles;
    if (roles !== undefined && (!Array.isArray(roles) || roles.some((r) => typeof r !== "string"))) {
      throw new PolicyValidationError("requiredRoles must be strings", "approval.requiredRoles");
    }
  }

  return doc as unknown as PolicyDocument;
}

function validateCondition(cond: unknown, path: string): void {
  if (!isRecord(cond)) throw new PolicyValidationError("condition must be an object", path);
  const keys = Object.keys(cond);

  if (keys.some((k) => k === "all" || k === "any" || k === "not")) {
    if (keys.length !== 1) throw new PolicyValidationError("logical condition must have exactly one key", path);
  } else {
    const allowed = new Set(["field", "op", "value"]);
    for (const k of keys) {
      if (!allowed.has(k)) throw new PolicyValidationError(`unknown condition key ${k}`, `${path}.${k}`);
    }
    if (keys.length < 2) throw new PolicyValidationError("leaf condition needs field and op", path);
  }

  if (keys[0] === "all" || keys[0] === "any") {
    const arr = (cond as Record<string, unknown>)[keys[0]];
    if (!Array.isArray(arr) || arr.length === 0) {
      throw new PolicyValidationError(`${keys[0]} must be a non-empty array`, path);
    }
    arr.forEach((c, i) => validateCondition(c, `${path}.${keys[0]}[${i}]`));
    return;
  }
  if (keys[0] === "not") {
    validateCondition((cond as Record<string, unknown>).not, `${path}.not`);
    return;
  }

  const leaf = cond as unknown as LeafCondition;
  if (typeof leaf.field !== "string" || !KNOWN_FIELDS.has(leaf.field)) {
    throw new PolicyValidationError(`unknown field ${String(leaf.field)}`, `${path}.field`);
  }
  if (typeof leaf.op !== "string" || !OPS.has(leaf.op)) {
    throw new PolicyValidationError(`unknown op ${String(leaf.op)}`, `${path}.op`);
  }
  if (leaf.op === "exists") {
    if (leaf.value !== undefined && typeof leaf.value !== "boolean") {
      throw new PolicyValidationError("exists expects a boolean", `${path}.value`);
    }
    return;
  }
  if (leaf.op === "in" || leaf.op === "not_in") {
    if (!Array.isArray(leaf.value)) throw new PolicyValidationError(`${leaf.op} expects an array`, `${path}.value`);
    return;
  }
  if (leaf.op === "within_hours") {
    const v = leaf.value;
    if (!isRecord(v) || typeof v.from !== "number" || typeof v.to !== "number") {
      throw new PolicyValidationError("within_hours expects {from,to}", `${path}.value`);
    }
    if (v.from < 0 || v.from > 23 || v.to < 0 || v.to > 23) {
      throw new PolicyValidationError("hours must be 0..23", `${path}.value`);
    }
    return;
  }
  if (leaf.value === undefined) throw new PolicyValidationError("value is required", `${path}.value`);
}

export function evaluatePolicy(
  doc: PolicyDocument,
  policyVersion: number,
  policyHash: string,
  ctx: PolicyContext,
): Evaluation {
  // ---- hard limits -------------------------------------------------------
  if (doc.limits?.maxAmount !== undefined && cmpBig(ctx.amount, doc.limits.maxAmount) > 0) {
    return deny(policyVersion, policyHash, "limit:maxAmount", `amount exceeds maxAmount ${doc.limits.maxAmount}`);
  }
  if (doc.limits?.minAmount !== undefined && cmpBig(ctx.amount, doc.limits.minAmount) < 0) {
    return deny(policyVersion, policyHash, "limit:minAmount", `amount below minAmount ${doc.limits.minAmount}`);
  }
  if (doc.limits?.allowedCategories && !doc.limits.allowedCategories.includes(ctx.category)) {
    return deny(policyVersion, policyHash, "limit:category", `category ${ctx.category} is not allowed`);
  }
  const trust = doc.limits?.maxAgentTrustRequiredAmount;
  if (trust && ctx.agent.trustLevel < trust.trustLevel && cmpBig(ctx.amount, trust.maxAmount) > 0) {
    return deny(
      policyVersion,
      policyHash,
      "limit:agent_trust",
      `agent trust level ${ctx.agent.trustLevel} cannot spend more than ${trust.maxAmount}`,
    );
  }

  // ---- rules -------------------------------------------------------------
  const matched: Array<MatchedRule & { priority: number }> = [];
  for (const rule of doc.rules) {
    if (matches(rule.when, ctx)) {
      matched.push({ id: rule.id, effect: rule.effect, description: rule.description, priority: rule.priority ?? 0 });
    }
  }
  matched.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

  const reasons: MatchedRule[] = matched.map(({ id, effect, description }) => ({ id, effect, description }));

  if (matched.some((m) => m.effect === "deny")) {
    return { ...result(policyVersion, policyHash, "DENY", reasons), requiresApproval: false, requiredRoles: [], approvalTtlMinutes: ttl(doc) };
  }
  if (matched.some((m) => m.effect === "require_human_approval")) {
    return {
      ...result(policyVersion, policyHash, "REQUIRE_HUMAN_APPROVAL", reasons),
      requiresApproval: true,
      requiredRoles: doc.approval?.requiredRoles ?? ["approver"],
      approvalTtlMinutes: ttl(doc),
    };
  }
  if (matched.some((m) => m.effect === "allow")) {
    return { ...result(policyVersion, policyHash, "ALLOW", reasons), requiresApproval: false, requiredRoles: [], approvalTtlMinutes: ttl(doc) };
  }
  return {
    ...result(policyVersion, policyHash, doc.defaultEffect === "allow" ? "ALLOW" : "DENY", reasons),
    requiresApproval: false,
    requiredRoles: [],
    approvalTtlMinutes: ttl(doc),
  };
}

function ttl(doc: PolicyDocument): number {
  return doc.approval?.ttlMinutes ?? 1440;
}

function result(version: number, hash: string, decision: Decision, matchedRules: MatchedRule[]) {
  return { decision, matchedRules, policyVersion: version, policyHash: hash };
}

function deny(version: number, hash: string, ruleId: string, description: string): Evaluation {
  return {
    decision: "DENY",
    matchedRules: [{ id: ruleId, effect: "deny", description }],
    policyVersion: version,
    policyHash: hash,
    requiresApproval: false,
    requiredRoles: [],
    approvalTtlMinutes: 0,
  };
}

export function policyHashOf(doc: PolicyDocument): string {
  return canonicalHash(DOMAINS.policy, doc);
}

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

function matches(cond: Condition, ctx: PolicyContext): boolean {
  if ("all" in cond) return cond.all.every((c) => matches(c, ctx));
  if ("any" in cond) return cond.any.some((c) => matches(c, ctx));
  if ("not" in cond) return !matches(cond.not, ctx);
  return leafMatches(cond, ctx);
}

function leafMatches(leaf: LeafCondition, ctx: PolicyContext): boolean {
  const actual = readField(leaf.field, ctx);
  switch (leaf.op) {
    case "exists":
      return (actual !== undefined && actual !== null) === (leaf.value === undefined ? true : leaf.value);
    case "eq":
      return looseEquals(actual, leaf.value);
    case "neq":
      return !looseEquals(actual, leaf.value);
    case "in":
      return Array.isArray(leaf.value) && leaf.value.some((v) => looseEquals(actual, v));
    case "not_in":
      return Array.isArray(leaf.value) && !leaf.value.some((v) => looseEquals(actual, v));
    case "gt":
      return compare(actual, leaf.value) > 0;
    case "gte":
      return compare(actual, leaf.value) >= 0;
    case "lt":
      return compare(actual, leaf.value) < 0;
    case "lte":
      return compare(actual, leaf.value) <= 0;
    case "within_hours": {
      const v = leaf.value as { from: number; to: number };
      const h = typeof actual === "number" ? actual : Number.NaN;
      if (Number.isNaN(h)) return false;
      return v.from <= v.to ? h >= v.from && h <= v.to : h >= v.from || h <= v.to;
    }
    default:
      return false;
  }
}

function readField(field: PolicyField, ctx: PolicyContext): unknown {
  switch (field) {
    case "amount":
      return ctx.amount;
    case "currency":
      return ctx.currency;
    case "category":
      return ctx.category;
    case "budgetAmount":
      return ctx.budgetAmount;
    case "agent.id":
      return ctx.agent.id;
    case "agent.trustLevel":
      return ctx.agent.trustLevel;
    case "vendor.verified":
      return ctx.vendor?.verified;
    case "vendor.tier":
      return ctx.vendor?.tier;
    case "vendor.id":
      return ctx.vendor?.id;
    case "request.offerCount":
      return ctx.request.offerCount;
    case "time.hourUtc":
      return ctx.time.hourUtc;
    case "time.dayOfWeekUtc":
      return ctx.time.dayOfWeekUtc;
    default:
      return undefined;
  }
}

const INT = /^-?[0-9]+$/;

function compare(a: unknown, b: unknown): number {
  if (a === undefined || a === null || b === undefined || b === null) return Number.NaN;
  if (typeof a === "number" && typeof b === "number") return a === b ? 0 : a < b ? -1 : 1;
  if (typeof a === "string" && typeof b === "string") {
    if (INT.test(a) && INT.test(b)) {
      const c = cmpBig(a, b);
      return c === 0 ? 0 : c > 0 ? 1 : -1;
    }
    return a === b ? 0 : a < b ? -1 : 1;
  }
  if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? 1 : -1;
  return Number.NaN;
}

function cmpBig(a: string, b: string): number {
  const x = BigInt(a);
  const y = BigInt(b);
  return x === y ? 0 : x < y ? -1 : 1;
}

function looseEquals(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string" && INT.test(a) && INT.test(b)) {
    return BigInt(a) === BigInt(b);
  }
  return a === b;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
