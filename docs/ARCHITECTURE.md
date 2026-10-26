# Architecture

Agent Procurement Network (APN) is a protocol and reference implementation for
machine buyers to source work from human/machine vendors and settle it on Mezo
in MUSD, with every step attributable, policy-checked and replayable.

This document describes what actually exists in this repository. Anything not
listed here is **not** implemented; see [IMPLEMENTED.md](./IMPLEMENTED.md) for
the explicit gap list.

---

## 1. Components

```
                 ┌───────────────────────────────────────────────┐
  human operator │  Admin console (server/public/admin)          │
  / auditor      │  single page, served by the API at /admin     │
                 └───────────────┬───────────────────────────────┘
                                 │ HTTPS + API key
┌──────────────┐        ┌────────▼─────────┐        ┌──────────────────┐
│ Agent runtime│───────▶│  APN API (Fastify)│───────▶│  PostgreSQL 17   │
│ (vendor/user │  agent │  authn / RBAC     │        │  tenants, policy,│
│  credentials)│  token │  policy engine    │        │  escrow mirror,  │
└──────────────┘        │  budgets          │        │  audit chain     │
                        │  escrow intents   │        └──────────────────┘
                        └───┬───────────┬───┘
                            │           │ signed webhooks (HMAC-SHA256)
                            │ JSON-RPC  ▼
                            │        ┌──────────────┐
                            │        │ Customer     │
                            │        │ webhook sink │
                            │        └──────────────┘
                            ▼
                 ┌───────────────────────┐         ┌──────────────────────┐
                 │ Mezo (EVM, chain 31611│◀───────▶│ Indexer worker       │
                 │ testnet / 31612 main) │  logs   │ cursor + reorg rewind│
                 │  ProcurementEscrow    │         └──────────┬───────────┘
                 │  AgentPolicyRegistry  │                    │
                 │  MUSD (ERC-20)        │                    ▼
                 └───────────────────────┘              PostgreSQL
```

| Component | Location | Responsibility |
| --- | --- | --- |
| Contracts | `contracts/src` | Escrow of MUSD, agreement lifecycle, agent authorization registry, fee/pause controls |
| API | `server/src` | Authn/authz, tenancy, policy decisions, budgets, offers, agreement intents, webhooks, audit |
| Indexer | `server/src/indexer` | Canonical chain ingestion with confirmation depth, reorg rewind, reconciliation |
| Webhook worker | `server/src/webhooks` | Outbox delivery with retries, signing, delivery log |
| Admin console | `server/public/admin/index.html` | Operator UI over the public API (no privileged backdoor) |
| SDK | `packages/sdk` | Typed client, canonical hashing, EIP-712 offer helpers, webhook verification |
| Spec | `spec/openapi.yaml`, `spec/hash-vectors.json` | API contract and cross-language hashing conformance vectors |

The existing marketing site (`app/`, `components/`, `lib/`, `public/assets`) is
untouched by the protocol and remains a static Next.js page. The API and admin
console are separate artifacts; they are **not** mounted into the Next.js app.

---

## 2. Trust boundaries

1. **Human ↔ API.** API keys are bearer credentials bound to a user + org +
   role. Only a SHA-256 of the secret is stored; the prefix allows O(1) lookup.
2. **Agent ↔ API.** Agents hold their own credentials, a strict subset of
   scopes, budgets, and an on-chain authorization entry. They can never
   approve, award, manage policy or move money by themselves.
3. **API ↔ chain.** The API is **non-custodial** for funding: it only *builds
   unsigned transactions* (calldata, chain id, contract, value `0`) that the
   org's wallet or agent wallet signs. The only private key the server may hold
   is `RESOLVER_PRIVATE_KEY`, used exclusively to submit a dispute ruling.
4. **Chain ↔ database.** The database is a *projection* of chain state, never
   the source of truth for money. `POST /v1/admin/reconcile` rebuilds it from
   canonical logs, and the indexer rewinds on reorgs.
5. **API ↔ webhook consumer.** Delivery is at-least-once and signed; consumers
   must verify HMAC and deduplicate on `x-apn-event-id`.

---

## 3. Data model (PostgreSQL)

Main tables (`server/src/db/schema.ts`):

| Table | Purpose |
| --- | --- |
| `organizations`, `users`, `api_keys` | Tenants, humans, hashed credentials + role |
| `agents`, `agent_credentials` | Machine identities, scoped + expiring tokens |
| `agent_budgets`, `budget_reservations` | Per-window limits with atomic holds |
| `policies`, `policy_evaluations` | Immutable policy versions + replayable decisions |
| `vendors`, `vendor_services` | Vendor profiles and hashed service manifests |
| `procurement_requests`, `request_events` | Request lifecycle + append-only event log |
| `offers` | Signed vendor offers, canonical hash, EIP-712 signature |
| `approvals` | Human approval queue with TTL and role |
| `agreements` | Mirror of escrow agreements, keyed by on-chain id |
| `chain_events`, `indexer_cursors`, `indexer_reorgs` | Canonical log store and reorg forensics |
| `disputes` | Evidence, ruling hash, vendor share |
| `webhook_endpoints`, `webhook_deliveries` | Signed outbox with retry state |
| `audit_log` | Per-org hash-chained audit trail |
| `idempotency_keys` | Request replay protection |

Money is stored as `NUMERIC(78,0)` **base units** (18 decimals), never floats.
API responses carry both base units and a display string.

---

## 4. Procurement lifecycle

```
draft ──publish──▶ open ──policy ALLOW──▶ approved ──award──▶ awarded ──escrow released──▶ completed
  │                 │  └──policy APPROVAL──▶ pending_approval ──▶ approved / rejected
  │                 └──cancel──▶ cancelled
  └──cancel──▶ cancelled
```

* Transitions are enforced in `server/src/procurement/state.ts` and mirrored
  in `allowedNextStatuses` in the API (single source of truth).
* `open → awarded` is deliberately impossible: money can only be committed
  after an explicit policy decision (`approved`).
* Every transition appends a hash-chained `request_events` row with actor,
  reason and prior hash.

## 5. Offer integrity

A vendor offer is a JSON payload (`requestId, vendorId, vendorWallet,
serviceId, priceAmount, currency, deliveryDays, terms, expiresAt, nonce`),
canonicalised (sorted keys, no whitespace, integers as decimal strings) and
hashed with keccak256 under the domain `apn.offer.v1`. The vendor signs EIP-712
typed data over `{requestId hash, offerHash, vendor, priceAmount, expiresAt}`
against the escrow contract on the configured chain.

The API recomputes the payload and the hash from the submitted fields and
verifies the signature; a mismatch (including a single-wei difference) is a
`422 offer_hash_mismatch`. Conformance vectors live in `spec/hash-vectors.json`
and are asserted by both the server and SDK test suites.

## 6. Discovery and ranking

`rankOffers` is a pure function with integer-only arithmetic (per-mille
scores): price 45, speed 25, vendor tier 15, verification 10, capability match
5. Ties break on score, price, delivery days, vendor id. There is no model, no
randomness and no clock in the scoring path, so the same data yields byte-
identical ordering — a property covered by tests.

## 7. Escrow and settlement

`ProcurementEscrow` holds MUSD per agreement:

1. `createAgreement(buyer, params)` pulls `amount + fee` from the payer,
   where the fee is quoted by the contract (`quoteFee`) and capped by
   `MAX_FEE_BPS = 500` (5%).
2. Vendor `accept`, then `submitDelivery(proofHash)`.
3. Buyer `release` (vendor paid, fee paid), or `dispute` during the dispute
   window. If the buyer stays silent the vendor can `claimAfterDisputeWindow`.
4. `resolveDispute(vendorAmount, rulingHash)` — resolver-only — splits the
   escrow and pays the fee proportionally.
5. `cancelUnaccepted` refunds the full amount + fee if the vendor never accepted.
6. `PAUSER_ROLE` blocks **new** agreements only; existing funds can always be
   released, refunded or disputed.

## 8. Indexer and reconciliation

* Confirmation depth is configurable (`INDEXER_CONFIRMATIONS`, default 3).
* On every tick the worker compares the stored block hash at the cursor with
  the canonical chain. On mismatch it walks back up to 128 blocks, deletes
  orphaned events, rewinds the cursor, and replays canonical logs.
* Events are stored with `(chainId, txHash, logIndex)` uniqueness, so replays
  are idempotent.
* Projection is state-guarded: an out-of-order `Delivered` before `Accepted` is
  recorded but not applied, and can be corrected by `POST /v1/admin/reconcile`.

## 9. Webhooks

Every state change fans out to subscribed endpoints through an outbox row
(`webhook_deliveries`) processed by a worker:

* `x-apn-signature: v1=<hex>` = HMAC-SHA256(secret, `"<timestamp>.<raw body>"`)
* `x-apn-timestamp`, `x-apn-event-id`, `x-apn-event-type`
* Retries: 5s, 15s, 45s … capped at 1h, max attempts configurable, then `dead`
* Secrets are sealed with AES-256-GCM using `SECRET_ENCRYPTION_KEY`

## 10. Audit

`audit_log` is append-only per organization: each row hashes its own content and
the previous row's hash. `GET /v1/audit/verify` recomputes the chain and reports
the first broken sequence number. The org row is locked during appends so
concurrent writers cannot fork the chain.

---

## 11. Configuration and deployment shape

All runtime secrets come from the environment (`.env`, never committed). The
API refuses to start with invalid configuration, and in `NODE_ENV=production`
it rejects wildcard CORS and local bootstrap. There is no default contract
address and no fallback RPC: if the operator does not configure the escrow, the
API refuses to build transaction intents rather than pointing at a guessed
address.

Deployment topology that is supported today: one API process + one indexer
process + one webhook worker process + PostgreSQL. Horizontal scaling of the API
is safe (stateless); the indexer and webhook worker are designed to run as a
single instance (cursor/`FOR UPDATE SKIP LOCKED` semantics), which is documented
in [OPERATIONS.md](./OPERATIONS.md).
