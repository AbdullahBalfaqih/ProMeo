import { z } from "zod";
import { AGENT_SCOPES } from "../auth/rbac.js";
import { parseMusd } from "../lib/money.js";
import { WEBHOOK_EVENTS } from "../webhooks/service.js";

/** Decimal MUSD string ("1500", "12.5") -> base units as a decimal string. */
export const MusdInput = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,29})(\.[0-9]{1,18})?$/, "must be a positive decimal MUSD amount")
  .transform((v) => parseMusd(v).toString());

export const BaseUnits = z.string().regex(/^[0-9]{1,78}$/, "must be an integer string in base units");

export const Uuid = z.string().uuid();
export const Hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const TxHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

export const CreateRequest = z.object({
  reference: z.string().min(1).max(64).optional(),
  title: z.string().min(3).max(200),
  description: z.string().min(3).max(10_000),
  category: z.string().min(2).max(64),
  requirements: z.record(z.unknown()).default({}),
  budgetAmount: MusdInput,
  deadlineAt: z.string().datetime().nullish(),
});

export const SubmitOffer = z.object({
  vendorId: Uuid,
  serviceId: Uuid.nullish(),
  /**
   * Base units (integer string, 18 decimals). Offers are signed protocol
   * payloads, so they never use human decimal notation: the hash must match
   * byte-for-byte what the vendor signed.
   */
  priceAmount: BaseUnits,
  deliveryDays: z.number().int().min(1).max(3650),
  terms: z.record(z.unknown()).default({}),
  notes: z.string().max(4000).optional(),
  expiresAt: z.string().datetime(),
  offerHash: Hex32,
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
  signer: Address,
  nonce: z.string().min(8).max(64),
});

export const Award = z.object({ offerId: Uuid });

export const Decision = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(2000).optional(),
});

export const CreateAgreement = z.object({
  requestId: Uuid,
  offerId: Uuid,
  acceptByHours: z.number().int().min(1).max(720).optional(),
  deliverByDays: z.number().int().min(1).max(365).optional(),
  disputeWindowSeconds: z.number().int().min(3600).max(2_592_000).optional(),
});

export const ConfirmTx = z.object({ txHash: TxHash });

export const OpenDispute = z.object({
  reason: z.string().min(10).max(4000),
  evidence: z.record(z.unknown()).default({}),
});

export const ResolveDispute = z.object({
  vendorShare: BaseUnits,
  note: z.string().min(3).max(4000),
});

export const CreateAgent = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional(),
  walletAddress: Address,
  scopes: z.array(z.enum(AGENT_SCOPES)).min(1),
  trustLevel: z.number().int().min(1).max(5).default(1),
});

export const UpdateAgent = z.object({
  status: z.enum(["active", "suspended", "revoked"]).optional(),
  trustLevel: z.number().int().min(1).max(5).optional(),
  scopes: z.array(z.enum(AGENT_SCOPES)).min(1).optional(),
  description: z.string().max(1000).optional(),
});

export const IssueCredential = z.object({
  label: z.string().min(2).max(120),
  ttlDays: z.number().int().min(1).max(365).default(30),
});

export const SetBudgets = z.object({
  daily: MusdInput.optional(),
  monthly: MusdInput.optional(),
  perRequest: MusdInput.optional(),
});

export const CreatePolicy = z.object({ document: z.record(z.unknown()) });

export const SimulatePolicy = z.object({
  document: z.record(z.unknown()).optional(),
  context: z.object({
    amount: BaseUnits,
    category: z.string(),
    budgetAmount: BaseUnits,
    agentId: z.string().default("00000000-0000-0000-0000-000000000000"),
    agentTrustLevel: z.number().int().min(1).max(5).default(1),
    vendor: z
      .object({ id: Uuid, verified: z.boolean(), tier: z.number().int().min(1).max(5) })
      .nullable()
      .default(null),
    offerCount: z.number().int().min(0).default(0),
  }),
});

export const CreateVendor = z.object({
  name: z.string().min(2).max(200),
  legalName: z.string().max(300).optional(),
  description: z.string().max(4000).optional(),
  payoutAddress: Address,
  contactEmail: z.string().email().optional(),
});

export const UpdateVendor = z.object({
  name: z.string().min(2).max(200).optional(),
  description: z.string().max(4000).optional(),
  status: z.enum(["pending", "active", "suspended"]).optional(),
  payoutAddress: Address.optional(),
  verified: z.boolean().optional(),
  tier: z.number().int().min(1).max(5).optional(),
});

export const CreateService = z.object({
  name: z.string().min(2).max(200),
  category: z.string().min(2).max(64),
  description: z.string().min(3).max(4000),
  capabilities: z.array(z.string().min(1).max(64)).max(50).default([]),
  regions: z.array(z.string().min(1).max(64)).max(50).default([]),
  priceModel: z.enum(["fixed", "hourly", "milestone", "quote"]),
  basePrice: MusdInput.nullish(),
  minPrice: MusdInput.nullish(),
  maxPrice: MusdInput.nullish(),
  slaHours: z.number().int().min(1).max(8760),
  manifest: z.record(z.unknown()).default({}),
});

export const CreateApiKey = z.object({
  name: z.string().min(2).max(120),
  scopes: z.array(z.string()).max(60).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const CreateWebhook = z.object({
  url: z
    .string()
    .url()
    .refine(
      (u) => u.startsWith("https://") || /^http:\/\/(localhost|127\.0\.0\.1)([:/]|$)/.test(u),
      { message: "HTTPS is required (HTTP is only allowed for localhost/127.0.0.1 in development)" },
    ),
  description: z.string().max(300).optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).or(z.array(z.literal("*")).length(1)),
});

export const UpdateOrg = z.object({
  name: z.string().min(2).max(200).optional(),
  walletAddress: Address.optional(),
});

export const Pagination = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});
