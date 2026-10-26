/** Response shapes mirrored from the API. Amounts are base-unit integer strings. */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "closed";
  chainId: number | null;
  onchainOrgId: string | null;
  walletAddress: string | null;
}

export interface Agent {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  status: "active" | "suspended" | "revoked";
  walletAddress: string;
  scopes: string[];
  trustLevel: number;
}

export interface Budget {
  window: "daily" | "monthly" | "per_request";
  limit: string;
  limitDisplay: string;
  spent: string;
  reserved: string;
  periodStart: string;
  periodEnd: string;
}

export interface ProcurementRequest {
  id: string;
  reference: string;
  title: string;
  description: string;
  category: string;
  requirements: Record<string, unknown>;
  budgetAmount: string;
  budgetAmountDisplay?: string;
  status: RequestStatus;
  policyDecision: string | null;
  policyVersion: number | null;
  deadlineAt: string | null;
  createdAt: string;
}

export type RequestStatus =
  | "draft"
  | "open"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "awarded"
  | "completed"
  | "cancelled"
  | "expired";

export interface Offer {
  id: string;
  requestId: string;
  vendorId: string;
  serviceId: string | null;
  priceAmount: string;
  currency: string;
  deliveryDays: number;
  terms: Record<string, unknown>;
  canonicalHash: string;
  signature: string | null;
  signer: string | null;
  status: "received" | "shortlisted" | "accepted" | "rejected" | "withdrawn";
  expiresAt: string;
}

export interface RankedOffer {
  position: number;
  offerId: string;
  vendorId: string;
  vendorName: string;
  vendorVerified: boolean;
  priceAmount: string;
  priceAmountDisplay: string;
  deliveryDays: number;
  rankScore: number;
  rankBreakdown: {
    price: number;
    speed: number;
    verified: number;
    tier: number;
    capability: number;
    eligible: boolean;
    reason?: string;
  };
}

export interface Approval {
  id: string;
  requestId: string;
  offerId: string | null;
  requiredRole: string;
  status: "pending" | "approved" | "rejected" | "expired";
  expiresAt: string;
}

export interface Agreement {
  id: string;
  onchainId: string;
  requestId: string;
  offerId: string;
  vendorId: string;
  chainId: number;
  escrowAddress: string;
  buyerAddress: string;
  vendorAddress: string;
  amount: string;
  feeAmount: string;
  state: AgreementState;
  acceptBy: string;
  deliverBy: string;
  disputeWindowSeconds: number;
  fundingTxHash: string | null;
}

export type AgreementState =
  | "proposed"
  | "funded"
  | "accepted"
  | "delivered"
  | "released"
  | "refunded"
  | "disputed"
  | "cancelled";

export interface TxIntent {
  chainId: number;
  to: string;
  data: string;
  value: "0";
  description: string;
  agreementId: string;
  nonce: string;
}

export interface Dispute {
  id: string;
  agreementId: string;
  status: "open" | "under_review" | "resolved" | "withdrawn";
  reason: string;
  evidence: Record<string, unknown>;
  vendorShare: string | null;
  rulingHash: string | null;
  resolutionTxHash: string | null;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  active: boolean;
}

export interface Page<T> {
  data: T[];
  nextCursor?: string | null;
}

export interface Meta {
  api: { version: string; build: string };
  chain: {
    chainId: number;
    rpcUrl: string;
    explorer: string;
    escrow: string | null;
    registry: string | null;
    musd: string | null;
  };
  currency: { symbol: string; decimals: number };
  webhooks: {
    signatureHeader: string;
    timestampHeader: string;
    algorithm: string;
    events: string[];
  };
}
