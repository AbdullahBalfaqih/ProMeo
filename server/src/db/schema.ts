import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  bigint,
  bigserial,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Money is always stored as an integer amount of MUSD base units (18 decimals)
 * in NUMERIC(78,0). Never floats. Application code converts to/from bigint at
 * the boundary (see lib/money.ts). NUMERIC(78,0) covers uint256 with headroom.
 */
const money = (name: string) => numeric(name, { precision: 78, scale: 0 });

export const orgStatus = pgEnum("org_status", ["active", "suspended", "closed"]);
export const userRole = pgEnum("user_role", [
  "owner",
  "admin",
  "procurement_manager",
  "approver",
  "finance",
  "auditor",
  "viewer",
]);
export const agentStatus = pgEnum("agent_status", ["active", "suspended", "revoked"]);
export const policyStatus = pgEnum("policy_status", ["draft", "active", "archived"]);
export const vendorStatus = pgEnum("vendor_status", ["pending", "active", "suspended"]);
export const requestStatus = pgEnum("request_status", [
  "draft",
  "open",
  "pending_approval",
  "approved",
  "rejected",
  "awarded",
  "completed",
  "cancelled",
  "expired",
]);
export const offerStatus = pgEnum("offer_status", ["received", "shortlisted", "accepted", "rejected", "withdrawn"]);
export const approvalStatus = pgEnum("approval_status", ["pending", "approved", "rejected", "expired", "cancelled"]);
export const agreementState = pgEnum("agreement_state", [
  "proposed",
  "funded",
  "accepted",
  "delivered",
  "released",
  "refunded",
  "disputed",
  "cancelled",
]);
export const webhookDeliveryStatus = pgEnum("webhook_delivery_status", [
  "pending",
  "delivering",
  "delivered",
  "failed",
  "abandoned",
]);
export const budgetWindow = pgEnum("budget_window", ["daily", "monthly", "per_request"]);
export const reservationStatus = pgEnum("reservation_status", ["held", "captured", "released", "expired"]);
export const disputeStatus = pgEnum("dispute_status", ["open", "under_review", "resolved", "withdrawn"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// ---------------------------------------------------------------------------
// Tenancy & identity
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: orgStatus("status").notNull().default("active"),
  /** Chain id + registry org id (bytes32) used for on-chain agent authorization. */
  chainId: integer("chain_id"),
  onchainOrgId: text("onchain_org_id"),
  /** Wallet that funds escrows on behalf of this organization. */
  walletAddress: text("wallet_address"),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: userRole("role").notNull(),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_org_email_uq").on(t.orgId, t.email), index("users_org_idx").on(t.orgId)],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** First half of the token, stored plainly to allow O(1) lookup. */
    prefix: text("prefix").notNull().unique(),
    /** sha256 of the secret part. The secret is shown once, at creation. */
    secretHash: text("secret_hash").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("api_keys_org_idx").on(t.orgId)],
);

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: agentStatus("status").notNull().default("active"),
    /** Wallet address the agent uses on-chain; must be authorized in the registry. */
    walletAddress: text("wallet_address").notNull(),
    /** Scopes the agent may exercise; a subset of its creator's scopes. */
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    /** Trust tier consumed by the policy engine. */
    trustLevel: integer("trust_level").notNull().default(1),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("agents_org_idx").on(t.orgId),
    uniqueIndex("agents_org_wallet_uq").on(t.orgId, t.walletAddress),
  ],
);

export const agentCredentials = pgTable(
  "agent_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    prefix: text("prefix").notNull().unique(),
    secretHash: text("secret_hash").notNull(),
    label: text("label").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agent_credentials_agent_idx").on(t.agentId)],
);

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export const policies = pgTable(
  "policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: policyStatus("status").notNull().default("draft"),
    document: jsonb("document").$type<Record<string, unknown>>().notNull(),
    /** keccak256 over the canonical document, excluding this hash field. */
    documentHash: text("document_hash").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("policies_org_version_uq").on(t.orgId, t.version),
    index("policies_org_status_idx").on(t.orgId, t.status),
  ],
);

export const policyEvaluations = pgTable(
  "policy_evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    requestId: uuid("request_id"),
    policyId: uuid("policy_id").references(() => policies.id, { onDelete: "set null" }),
    policyVersion: integer("policy_version").notNull(),
    policyHash: text("policy_hash").notNull(),
    decision: text("decision").notNull(),
    reasons: jsonb("reasons").$type<unknown[]>().notNull(),
    context: jsonb("context").$type<Record<string, unknown>>().notNull(),
    contextHash: text("context_hash").notNull(),
    evaluatedByAgentId: uuid("evaluated_by_agent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("policy_eval_org_idx").on(t.orgId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------

export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Owning tenant. Vendors are visible cross-tenant when active. */
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    description: text("description"),
    status: vendorStatus("status").notNull().default("pending"),
    payoutAddress: text("payout_address").notNull(),
    verified: boolean("verified").notNull().default(false),
    tier: integer("tier").notNull().default(1),
    contactEmail: text("contact_email"),
    ...timestamps,
  },
  (t) => [index("vendors_org_idx").on(t.orgId), index("vendors_status_idx").on(t.status)],
);

export const vendorServices = pgTable(
  "vendor_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    /** Denormalized for tenant filtering on writes; discovery is cross-tenant. */
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    capabilities: jsonb("capabilities").$type<string[]>().notNull(),
    regions: jsonb("regions").$type<string[]>().notNull(),
    priceModel: text("price_model").notNull(),
    /** Base price in MUSD base units; nullable meaning "quote on request". */
    basePrice: money("base_price"),
    minPrice: money("min_price"),
    maxPrice: money("max_price"),
    currency: text("currency").notNull().default("MUSD"),
    slaHours: integer("sla_hours").notNull(),
    active: boolean("active").notNull().default(true),
    manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull(),
    manifestHash: text("manifest_hash").notNull(),
    ...timestamps,
  },
  (t) => [
    index("vendor_services_vendor_idx").on(t.vendorId),
    index("vendor_services_category_idx").on(t.category),
    uniqueIndex("vendor_services_vendor_name_uq").on(t.vendorId, t.name),
  ],
);

// ---------------------------------------------------------------------------
// Procurement workflow
// ---------------------------------------------------------------------------

export const procurementRequests = pgTable(
  "procurement_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    reference: text("reference").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    requirements: jsonb("requirements").$type<Record<string, unknown>>().notNull(),
    budgetAmount: money("budget_amount").notNull(),
    currency: text("currency").notNull().default("MUSD"),
    status: requestStatus("status").notNull().default("draft"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    policyId: uuid("policy_id").references(() => policies.id, { onDelete: "set null" }),
    policyVersion: integer("policy_version"),
    policyDecision: text("policy_decision"),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("requests_org_reference_uq").on(t.orgId, t.reference),
    index("requests_org_status_idx").on(t.orgId, t.status),
    index("requests_org_created_idx").on(t.orgId, t.createdAt),
  ],
);

export const requestEvents = pgTable(
  "request_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Insertion order, used for the hash chain. */
    seq: bigserial("seq", { mode: "number" }).notNull(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    requestId: uuid("request_id")
      .notNull()
      .references(() => procurementRequests.id, { onDelete: "cascade" }),
    fromStatus: requestStatus("from_status"),
    toStatus: requestStatus("to_status").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    /** Hash chain over (prevHash, this record) for tamper evidence. */
    prevHash: text("prev_hash"),
    hash: text("hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("request_events_request_idx").on(t.requestId, t.createdAt)],
);

export const offers = pgTable(
  "offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    requestId: uuid("request_id")
      .notNull()
      .references(() => procurementRequests.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").references(() => vendorServices.id, { onDelete: "set null" }),
    priceAmount: money("price_amount").notNull(),
    currency: text("currency").notNull().default("MUSD"),
    deliveryDays: integer("delivery_days").notNull(),
    terms: jsonb("terms").$type<Record<string, unknown>>().notNull(),
    notes: text("notes"),
    canonicalHash: text("canonical_hash").notNull(),
    /** EIP-712 signature by the vendor payout address, when provided. */
    signature: text("signature"),
    signer: text("signer"),
    status: offerStatus("status").notNull().default("received"),
    rankScore: integer("rank_score"),
    rankBreakdown: jsonb("rank_breakdown").$type<Record<string, unknown>>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("offers_request_vendor_uq").on(t.requestId, t.vendorId),
    uniqueIndex("offers_canonical_hash_uq").on(t.canonicalHash),
    index("offers_request_idx").on(t.requestId),
    index("offers_org_idx").on(t.orgId),
  ],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    requestId: uuid("request_id")
      .notNull()
      .references(() => procurementRequests.id, { onDelete: "cascade" }),
    offerId: uuid("offer_id").references(() => offers.id, { onDelete: "set null" }),
    requiredRole: userRole("required_role").notNull().default("approver"),
    status: approvalStatus("status").notNull().default("pending"),
    policyId: uuid("policy_id").references(() => policies.id, { onDelete: "set null" }),
    policyVersion: integer("policy_version"),
    requestedBy: text("requested_by"),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, { onDelete: "set null" }),
    decisionNote: text("decision_note"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("approvals_org_status_idx").on(t.orgId, t.status),
    uniqueIndex("approvals_request_pending_uq")
      .on(t.requestId)
      .where(sql`status = 'pending'`),
  ],
);

export const agreements = pgTable(
  "agreements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** bytes32 escrow id, unique per chain. */
    onchainId: text("onchain_id").notNull(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    requestId: uuid("request_id")
      .notNull()
      .references(() => procurementRequests.id, { onDelete: "restrict" }),
    offerId: uuid("offer_id")
      .notNull()
      .references(() => offers.id, { onDelete: "restrict" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    chainId: integer("chain_id").notNull(),
    escrowAddress: text("escrow_address").notNull(),
    buyerAddress: text("buyer_address").notNull(),
    vendorAddress: text("vendor_address").notNull(),
    amount: money("amount").notNull(),
    feeAmount: money("fee_amount").notNull(),
    offerHash: text("offer_hash").notNull(),
    termsHash: text("terms_hash").notNull(),
    state: agreementState("state").notNull().default("proposed"),
    acceptBy: timestamp("accept_by", { withTimezone: true }).notNull(),
    deliverBy: timestamp("deliver_by", { withTimezone: true }).notNull(),
    disputeWindowSeconds: integer("dispute_window_seconds").notNull(),
    fundingTxHash: text("funding_tx_hash"),
    fundingBlock: bigint("funding_block", { mode: "number" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    disputeId: uuid("dispute_id"),
    /** Held budget reservations captured when the escrow funding is confirmed. */
    budgetReservationIds: jsonb("budget_reservation_ids").$type<string[]>().notNull().default([]),
    lastEventBlock: bigint("last_event_block", { mode: "number" }),
    lastEventLogIndex: integer("last_event_log_index"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("agreements_chain_onchain_uq").on(t.chainId, t.onchainId),
    index("agreements_org_idx").on(t.orgId),
    index("agreements_request_idx").on(t.requestId),
    index("agreements_state_idx").on(t.state),
  ],
);

export const disputes = pgTable(
  "disputes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    agreementId: uuid("agreement_id")
      .notNull()
      .references(() => agreements.id, { onDelete: "cascade" }),
    openedBy: text("opened_by").notNull(),
    reason: text("reason").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
    status: disputeStatus("status").notNull().default("open"),
    vendorShare: money("vendor_share"),
    rulingHash: text("ruling_hash"),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, { onDelete: "set null" }),
    resolutionNote: text("resolution_note"),
    resolutionTxHash: text("resolution_tx_hash"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("disputes_agreement_open_uq").on(t.agreementId).where(sql`status <> 'resolved'`)],
);

// ---------------------------------------------------------------------------
// Chain indexing
// ---------------------------------------------------------------------------

export const chainEvents = pgTable(
  "chain_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chainId: integer("chain_id").notNull(),
    contractAddress: text("contract_address").notNull(),
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: bigint("block_number", { mode: "number" }).notNull(),
    blockHash: text("block_hash").notNull(),
    transactionIndex: integer("transaction_index").notNull().default(0),
    eventName: text("event_name").notNull(),
    agreementOnchainId: text("agreement_onchain_id"),
    decoded: jsonb("decoded").$type<Record<string, unknown>>().notNull(),
    removed: boolean("removed").notNull().default(false),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("chain_events_unique_log").on(t.chainId, t.txHash, t.logIndex),
    index("chain_events_block_idx").on(t.chainId, t.blockNumber),
    index("chain_events_agreement_idx").on(t.agreementOnchainId),
  ],
);

export const indexerCursors = pgTable(
  "indexer_cursors",
  {
    chainId: integer("chain_id").notNull(),
    contractAddress: text("contract_address").notNull(),
    lastProcessedBlock: bigint("last_processed_block", { mode: "number" }).notNull(),
    lastBlockHash: text("last_block_hash").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.chainId, t.contractAddress] })],
);

export const indexerReorgs = pgTable("indexer_reorgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  chainId: integer("chain_id").notNull(),
  contractAddress: text("contract_address").notNull(),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  rewoundToBlock: bigint("rewound_to_block", { mode: "number" }).notNull(),
  previousBlock: bigint("previous_block", { mode: "number" }).notNull(),
  orphanedLogs: integer("orphaned_logs").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
});

// ---------------------------------------------------------------------------
// Agent budgets (atomic reservation)
// ---------------------------------------------------------------------------

export const agentBudgets = pgTable(
  "agent_budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    window: budgetWindow("window").notNull(),
    limitAmount: money("limit_amount").notNull(),
    spentAmount: money("spent_amount").notNull().default("0"),
    reservedAmount: money("reserved_amount").notNull().default("0"),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("agent_budgets_unique_window").on(t.agentId, t.window, t.periodStart),
    index("agent_budgets_agent_idx").on(t.agentId),
  ],
);

export const budgetReservations = pgTable(
  "budget_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    budgetId: uuid("budget_id")
      .notNull()
      .references(() => agentBudgets.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").references(() => procurementRequests.id, { onDelete: "set null" }),
    amount: money("amount").notNull(),
    status: reservationStatus("status").notNull().default("held"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("budget_reservations_agent_idx").on(t.agentId, t.status)],
);

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    description: text("description"),
    /** Only the hash is stored; the signing secret is shown once at creation. */
    secretHash: text("secret_hash").notNull(),
    /** AES-256-GCM sealed secret, needed to actually sign deliveries. */
    secretSealed: text("secret_sealed").notNull(),
    events: jsonb("events").$type<string[]>().notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("webhook_endpoints_org_idx").on(t.orgId)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull(),
    /**
     * Deterministic identity of the source event (chain tx/log or domain id).
     * Makes enqueueing idempotent when a chain range is replayed.
     */
    sourceKey: text("source_key"),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    payloadHash: text("payload_hash").notNull(),
    status: webhookDeliveryStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastResponseCode: integer("last_response_code"),
    lastError: text("last_error"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("webhook_deliveries_idempotent").on(t.endpointId, t.eventId),
    uniqueIndex("webhook_deliveries_source_uq")
      .on(t.endpointId, t.sourceKey)
      .where(sql`source_key is not null`),
    index("webhook_deliveries_due_idx").on(t.status, t.nextAttemptAt),
    index("webhook_deliveries_org_idx").on(t.orgId, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Audit & idempotency
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Insertion order, used for the hash chain. */
    seq: bigserial("seq", { mode: "number" }).notNull(),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    prevHash: text("prev_hash"),
    hash: text("hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_org_idx").on(t.orgId, t.createdAt)],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    method: text("method").notNull(),
    path: text("path").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseBody: jsonb("response_body").$type<unknown>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.key] })],
);
