import type { Hex } from "viem";
import { hashOffer, offerTypedData, serializableOfferTypedData, type OfferPayload } from "./offers.js";
import type {
  Agent,
  Agreement,
  Approval,
  Budget,
  Dispute,
  Meta,
  Offer,
  Organization,
  Page,
  ProcurementRequest,
  RankedOffer,
  RequestStatus,
  TxIntent,
  WebhookEndpoint,
} from "./types.js";

export interface ApnClientOptions {
  baseUrl: string;
  /** Bearer token: an API key (apn_u_…) or an agent credential (apn_a_…). */
  token?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  userAgent?: string;
}

export class ApnError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApnError";
  }
}

type Query = Record<string, string | number | boolean | undefined>;

export class ApnClient {
  private readonly baseUrl: string;
  private readonly doFetch: typeof fetch;
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private token?: string;

  constructor(opts: ApnClientOptions) {
    if (!opts.baseUrl) throw new Error("baseUrl is required");
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.token = opts.token;
    this.doFetch = opts.fetch ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.userAgent = opts.userAgent ?? "apn-sdk/0.1.0";
  }

  /** Returns a new client sharing configuration but with a different credential. */
  withToken(token: string): ApnClient {
    const c = new ApnClient({
      baseUrl: this.baseUrl,
      token,
      fetch: this.doFetch,
      timeoutMs: this.timeoutMs,
      userAgent: this.userAgent,
    });
    return c;
  }

  async request<T>(
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    opts: { body?: unknown; query?: Query; idempotencyKey?: string; token?: string } = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.doFetch(url.toString(), {
        method,
        headers: {
          accept: "application/json",
          "user-agent": this.userAgent,
          ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
          ...(opts.token ?? this.token ? { authorization: `Bearer ${opts.token ?? this.token}` } : {}),
          ...(opts.idempotencyKey ? { "idempotency-key": opts.idempotencyKey } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      throw new ApnError(0, "network_error", (err as Error).message);
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const parsed = text ? (JSON.parse(text) as unknown) : null;

    if (!res.ok) {
      const err = (parsed as { error?: { code?: string; message?: string; details?: unknown; requestId?: string } })?.error;
      throw new ApnError(
        res.status,
        err?.code ?? "unknown_error",
        err?.message ?? `HTTP ${res.status}`,
        err?.details,
        err?.requestId,
      );
    }
    return parsed as T;
  }

  // -------------------------------------------------------------------------
  // System
  // -------------------------------------------------------------------------

  health = () => this.request<{ status: string; version: string; chain: Record<string, unknown> }>("GET", "/healthz");
  meta = () => this.request<Meta>("GET", "/v1/meta");
  bootstrap = (body: { orgName: string; slug: string; email: string; displayName: string }) =>
    this.request<{ org: Organization; user: { id: string; email: string }; token: string; policy: { id: string; version: number; hash: string } }>(
      "POST",
      "/v1/bootstrap",
      { body },
    );

  // -------------------------------------------------------------------------
  // Organization, keys, agents
  // -------------------------------------------------------------------------

  org = {
    get: () => this.request<{ org: Organization }>("GET", "/v1/org"),
    update: (body: { name?: string; walletAddress?: string }) =>
      this.request<{ org: Organization }>("PATCH", "/v1/org", { body }),
    members: () =>
      this.request<{ data: Array<{ id: string; email: string; displayName: string; role: string; status: string }> }>(
        "GET",
        "/v1/org/members",
      ),
    createMember: (body: { email: string; displayName: string; role: string }) =>
      this.request<{ user: { id: string; role: string }; token: string }>("POST", "/v1/org/members", { body }),
  };

  apiKeys = {
    list: () =>
      this.request<{
        data: Array<{ id: string; name: string; prefix: string; scopes: string[]; revokedAt: string | null }>;
      }>("GET", "/v1/api-keys"),
    create: (body: { name: string; scopes?: string[]; expiresAt?: string }) =>
      this.request<{ apiKey: { id: string }; token: string }>("POST", "/v1/api-keys", { body }),
    revoke: (id: string) => this.request<void>("DELETE", `/v1/api-keys/${id}`),
  };

  agents = {
    list: () => this.request<{ data: Agent[] }>("GET", "/v1/agents"),
    create: (body: { name: string; walletAddress: string; scopes: string[]; trustLevel?: number; description?: string }) =>
      this.request<{ agent: Agent }>("POST", "/v1/agents", { body }),
    get: (id: string) =>
      this.request<{ agent: Agent; budgets: Budget[]; onchain: unknown; onchainNote: string | null }>(
        "GET",
        `/v1/agents/${id}`,
      ),
    update: (id: string, body: { status?: string; trustLevel?: number; scopes?: string[]; description?: string }) =>
      this.request<{ agent: Agent }>("PATCH", `/v1/agents/${id}`, { body }),
    issueCredential: (id: string, body: { label: string; ttlDays?: number }) =>
      this.request<{ credential: { id: string; expiresAt: string }; token: string }>(
        "POST",
        `/v1/agents/${id}/credentials`,
        { body },
      ),
    revokeCredential: (id: string, credentialId: string) =>
      this.request<void>("DELETE", `/v1/agents/${id}/credentials/${credentialId}`),
    setBudgets: (id: string, body: { daily?: string; monthly?: string; perRequest?: string }) =>
      this.request<{ budgets: Budget[] }>("PUT", `/v1/agents/${id}/budgets`, { body }),
    scopes: () => this.request<{ scopes: string[] }>("GET", "/v1/agents/scopes"),
  };

  // -------------------------------------------------------------------------
  // Policy & vendors
  // -------------------------------------------------------------------------

  policies = {
    list: () =>
      this.request<{ data: Array<{ id: string; version: number; status: string; hash: string; name: string | null }> }>(
        "GET",
        "/v1/policies",
      ),
    get: (id: string) => this.request<{ policy: Record<string, unknown> }>("GET", `/v1/policies/${id}`),
    create: (document: Record<string, unknown>) =>
      this.request<{ policy: { id: string; version: number; hash: string; status: string } }>("POST", "/v1/policies", {
        body: { document },
      }),
    activate: (id: string) =>
      this.request<{ policy: { id: string; version: number; hash: string; status: string } }>(
        "POST",
        `/v1/policies/${id}/activate`,
      ),
    simulate: (body: Record<string, unknown>) =>
      this.request<{ evaluation: { decision: string; matchedRules: unknown[] } }>("POST", "/v1/policies/simulate", { body }),
  };

  vendors = {
    list: () => this.request<{ data: Array<Record<string, unknown>> }>("GET", "/v1/vendors"),
    create: (body: { name: string; payoutAddress: string; legalName?: string; description?: string; contactEmail?: string }) =>
      this.request<{ vendor: { id: string; status: string } }>("POST", "/v1/vendors", { body }),
    update: (id: string, body: Record<string, unknown>) =>
      this.request<{ vendor: Record<string, unknown> }>("PATCH", `/v1/vendors/${id}`, { body }),
    createService: (id: string, body: Record<string, unknown>) =>
      this.request<{ service: { id: string; manifestHash: string } }>("POST", `/v1/vendors/${id}/services`, { body }),
    services: (id: string) => this.request<{ data: Array<Record<string, unknown>> }>("GET", `/v1/vendors/${id}/services`),
  };

  services = {
    list: (query?: { category?: string; capability?: string; limit?: number }) =>
      this.request<{ data: Array<Record<string, unknown>> }>("GET", "/v1/services", { query }),
  };

  // -------------------------------------------------------------------------
  // Requests & offers
  // -------------------------------------------------------------------------

  requests = {
    create: (
      body: {
        title: string;
        description: string;
        category: string;
        budgetAmount: string;
        requirements?: Record<string, unknown>;
        deadlineAt?: string;
        reference?: string;
      },
      idempotencyKey?: string,
    ) =>
      this.request<{ request: ProcurementRequest }>("POST", "/v1/requests", { body, idempotencyKey }),
    list: (query?: { status?: RequestStatus; limit?: number; cursor?: string }) =>
      this.request<Page<ProcurementRequest>>("GET", "/v1/requests", { query }),
    get: (id: string) =>
      this.request<{ request: ProcurementRequest; pendingApproval: Approval | null; offerCount: number; allowedNextStatuses: string[] }>(
        "GET",
        `/v1/requests/${id}`,
      ),
    publish: (id: string) => this.request<{ request: ProcurementRequest }>("POST", `/v1/requests/${id}/publish`),
    cancel: (id: string, reason: string) =>
      this.request<{ request: ProcurementRequest }>("POST", `/v1/requests/${id}/cancel`, { body: { reason } }),
    events: (id: string) => this.request<{ data: Array<Record<string, unknown>> }>("GET", `/v1/requests/${id}/events`),
    evaluations: (id: string) =>
      this.request<{ data: Array<Record<string, unknown>> }>("GET", `/v1/requests/${id}/policy-evaluations`),
    offers: (id: string) =>
      this.request<{ data: Array<Offer & { vendorName: string; priceAmountDisplay: string }> }>(
        "GET",
        `/v1/requests/${id}/offers`,
      ),
    discover: (id: string) =>
      this.request<{
        ranking: RankedOffer[];
        algorithm: Record<string, unknown>;
        requiredCapabilities: string[];
      }>("GET", `/v1/requests/${id}/offers/discover`),
    award: (id: string, offerId: string) =>
      this.request<{ request: ProcurementRequest; policy: { decision: string; version: number; matchedRules: unknown[] } }>(
        "POST",
        `/v1/requests/${id}/award`,
        { body: { offerId } },
      ),
  };

  marketplace = {
    requests: (query?: { limit?: number; cursor?: string }) =>
      this.request<{ data: Array<Record<string, unknown>> }>("GET", "/v1/marketplace/requests", { query }),
    request: (id: string) => this.request<{ request: Record<string, unknown> }>("GET", `/v1/marketplace/requests/${id}`),
    submitOffer: (requestId: string, body: Record<string, unknown>) =>
      this.request<{ offer: Offer; typedData: unknown }>("POST", `/v1/marketplace/requests/${requestId}/offers`, { body }),
    myOffers: () => this.request<{ data: Array<Offer & { requestReference: string }> }>("GET", "/v1/marketplace/me/offers"),
  };

  offers = {
    get: (id: string) => this.request<{ offer: Offer }>("GET", `/v1/offers/${id}`),
    hash: (body: OfferPayload) => this.request<{ offerHash: Hex; hashDomain: string }>("POST", "/v1/offers/hash", { body }),
    byHash: (hash: string) =>
      this.request<{ found: boolean; offer: { id: string; status: string } | null }>("GET", `/v1/offers/by-hash/${hash}`),
    signaturePayload: (id: string) => this.request<{ typedData: unknown }>("GET", `/v1/offers/${id}/signature-payload`),
  };

  approvals = {
    list: (query?: { status?: string; limit?: number }) =>
      this.request<{ data: Array<{ approval: Approval; requestTitle: string; requestReference: string }> }>(
        "GET",
        "/v1/approvals",
        { query },
      ),
    decide: (id: string, decision: "approved" | "rejected", note?: string) =>
      this.request<{ request: ProcurementRequest; decision: string }>("POST", `/v1/approvals/${id}/decide`, {
        body: { decision, note },
      }),
  };

  // -------------------------------------------------------------------------
  // Agreements & disputes
  // -------------------------------------------------------------------------

  agreements = {
    create: (body: { requestId: string; offerId: string; acceptByHours?: number; deliverByDays?: number; disputeWindowSeconds?: number }, idempotencyKey?: string) =>
      this.request<{
        agreement: Agreement;
        fundingIntent: TxIntent;
        terms: Record<string, unknown>;
        amount: string;
        feeAmount: string;
        totalAmount: string;
      }>("POST", "/v1/agreements", { body, idempotencyKey }),
    list: (query?: { limit?: number; cursor?: string }) =>
      this.request<Page<Agreement & { amountDisplay: string; vendorName: string }>>("GET", "/v1/agreements", { query }),
    get: (id: string) =>
      this.request<{
        agreement: Agreement & { amountDisplay: string; feeAmountDisplay: string; totalDisplay: string };
        request: { id: string; reference: string; title: string };
        vendor: { id: string; name: string; payoutAddress: string };
        chainEvents: Array<Record<string, unknown>>;
      }>("GET", `/v1/agreements/${id}`),
    action: (id: string, action: "release" | "cancel") =>
      this.request<{ agreementId: string; state: string; intent: TxIntent }>(
        "POST",
        `/v1/agreements/${id}/actions/${action}`,
      ),
    confirm: (id: string, txHash: string) =>
      this.request<{ agreement: Agreement; events: Array<{ event: string; applied: boolean }> }>(
        "POST",
        `/v1/agreements/${id}/confirm`,
        { body: { txHash } },
      ),
    openDispute: (id: string, body: { reason: string; evidence?: Record<string, unknown> }) =>
      this.request<{ dispute: Dispute; evidenceHash: string; disputeIntent: TxIntent }>(
        "POST",
        `/v1/agreements/${id}/disputes`,
        { body },
      ),
  };

  disputes = {
    list: (query?: { limit?: number }) => this.request<{ data: Dispute[] }>("GET", "/v1/disputes", { query }),
    get: (id: string) => this.request<{ dispute: Dispute }>("GET", `/v1/disputes/${id}`),
    resolve: (id: string, body: { vendorShare: string; note: string }) =>
      this.request<{ dispute: Dispute; txHash: string | null; rulingHash: string; onchainIntent: unknown }>(
        "POST",
        `/v1/disputes/${id}/resolve`,
        { body },
      ),
  };

  // -------------------------------------------------------------------------
  // Webhooks & audit
  // -------------------------------------------------------------------------

  webhooks = {
    list: () => this.request<{ data: WebhookEndpoint[] }>("GET", "/v1/webhooks"),
    create: (body: { url: string; events: string[]; description?: string }) =>
      this.request<{ endpoint: WebhookEndpoint; secret: string }>("POST", "/v1/webhooks", { body }),
    remove: (id: string) => this.request<void>("DELETE", `/v1/webhooks/${id}`),
    deliveries: (query?: { limit?: number }) =>
      this.request<{ data: Array<Record<string, unknown>> }>("GET", "/v1/webhooks/deliveries", { query }),
    test: (id: string) =>
      this.request<{ deliveryId: string; exampleHeaders: Record<string, string> }>("POST", `/v1/webhooks/${id}/test`),
  };

  audit = {
    list: (query?: { limit?: number }) =>
      this.request<{ data: Array<Record<string, unknown>> }>("GET", "/v1/audit", { query }),
    verify: () =>
      this.request<{ valid: boolean; checked: number; head: string | null; reason?: string }>("GET", "/v1/audit/verify"),
  };

  // -------------------------------------------------------------------------
  // Offer helpers (client-side signing)
  // -------------------------------------------------------------------------

  /**
   * Builds the canonical offer payload and the EIP-712 typed data a vendor must
   * sign. The API independently recomputes both, so a mismatch is rejected.
   */
  prepareOffer(params: {
    requestId: string;
    vendorId: string;
    vendorWallet: string;
    serviceId: string | null;
    priceAmount: string;
    deliveryDays: number;
    terms?: Record<string, unknown>;
    expiresAt: Date;
    nonce: string;
    chainId: number;
    escrow: string;
  }): {
    payload: OfferPayload;
    offerHash: Hex;
    typedData: ReturnType<typeof serializableOfferTypedData>;
  } {
    const payload: OfferPayload = {
      requestId: params.requestId,
      vendorId: params.vendorId,
      vendorWallet: params.vendorWallet,
      serviceId: params.serviceId,
      priceAmount: params.priceAmount,
      currency: "MUSD",
      deliveryDays: params.deliveryDays,
      terms: params.terms ?? {},
      expiresAt: params.expiresAt.toISOString(),
      nonce: params.nonce,
    };
    const offerHash = hashOffer(payload);
    const typedData = serializableOfferTypedData(
      offerTypedData({
        chainId: params.chainId,
        verifyingContract: params.escrow as `0x${string}`,
        requestId: params.requestId,
        offerHash,
        vendor: params.vendorWallet as `0x${string}`,
        priceAmount: BigInt(params.priceAmount),
        expiresAt: Math.floor(params.expiresAt.getTime() / 1000),
      }),
    );
    return { payload, offerHash, typedData };
  }
}
