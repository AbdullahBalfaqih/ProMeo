# Threat model

Scope: the APN protocol as implemented in this repository — contracts,
API, indexer, webhooks, SDK and admin console. The landing page is out of scope.

Method: assets → actors → abuse cases → controls, each with an honest status.

Legend: **M** mitigated in code (with the enforcing file), **P** partial /
defence-in-depth only, **N** not implemented (documented gap).

---

## 1. Assets

| Asset | Where it lives | Impact if compromised |
| --- | --- | --- |
| Escrowed MUSD | `ProcurementEscrow` on Mezo | Direct loss of buyer funds |
| Buyer signing keys | Customer wallet / agent wallet — **never** on the server | Unauthorized funding or release |
| Resolver key | Server env (`RESOLVER_PRIVATE_KEY`), optional | Biased dispute rulings |
| API keys / agent credentials | Hashed in Postgres | Impersonation within one tenant |
| Procurement intent, prices, offers | Postgres | Financial and competitive data leak |
| Policy documents | Postgres (versioned) | Overspend, bypass of controls |
| Webhook secrets | Sealed in Postgres | Forged event delivery to customers |
| Audit trail | Postgres hash chain | Loss of non-repudiation |

## 2. Actors

Buyer org (humans + agents), vendor org (humans + agents), platform operator
(deploys contracts, verifies vendors, may hold the resolver key), anonymous
internet, and a compromised-but-authenticated insider.

---

## 3. Threats and controls

### 3.1 Agent-specific

| # | Threat | Control | Status |
| --- | --- | --- | --- |
| A1 | Compromised agent drains budget by creating many requests/agreements | Per-request, daily and monthly budgets with **atomic** conditional-update reservations; agents lack `request:award`, `agreement:release_intent`, `request:approve` | M (`agents/budgets.ts`, `auth/rbac.ts`) |
| A2 | Prompt-injected agent submits a huge request | Policy engine hard limits (`maxAmount`, category allowlist, trust-level caps) evaluated server-side, not by the model | M (`policy/engine.ts`) |
| A3 | Agent forges an "approved" state locally | Approval is a server-side row with a required role and TTL; `open → awarded` is not a legal transition | M (`procurement/state.ts`) |
| A4 | Agent reuses a leaked credential forever | Credentials are expiring, individually revocable, hashed at rest, and every use is audit-logged | M (`agents/credentials`) |
| A5 | Agent calls the chain directly with its wallet, bypassing API policy | On-chain `AgentPolicyRegistry` authorization is per org + wallet + expiry + per-tx cap; escrow checks `isAuthorized` for any caller that is not the buyer | M/P (registry exists; **operator must keep registry state in sync** — API does not write it) |
| A6 | Agent enumerates other tenants' data | Every query is scoped by `principal.orgId`; cross-tenant reads return `404`; marketplace projection is explicit and field-limited | M (`routes/*`, `lib/http.ts`) |
| A7 | Agent floods the API | Per-credential rate limiting (default 240 req/min), 1 MB body limit | M (`app.ts`) |

### 3.2 Offer and pricing integrity

| # | Threat | Control | Status |
| --- | --- | --- | --- |
| O1 | Vendor tampers with price after signing | Canonical payload hash recomputed server-side; EIP-712 signature verified; mismatch → `422` | M (`procurement/offers.ts`) |
| O2 | Two clients serialize the same offer differently | RFC 8785-style canonicalisation + shared conformance vectors in `spec/hash-vectors.json` | M |
| O3 | Replay of an old offer | `expiresAt` in the signed payload; expired offers are excluded from ranking and rejected | M |
| O4 | Ranking gamed by float rounding | Integer per-mille scoring; deterministic tie-breaks; property tests | M |
| O5 | Non-deterministic discovery used to hide a better offer | Pure function, same inputs → identical order; test asserts byte equality across permutations | M |
| O6 | Vendor identity spoofing | An offer must reference a vendor owned by the submitting org, and the signing key must equal the vendor payout address | M (`routes/market.ts`) |

### 3.3 Escrow and settlement

| # | Threat | Control | Status |
| --- | --- | --- | --- |
| E1 | Reentrancy on MUSD | `ReentrancyGuard` + checks-effects-interactions + `SafeERC20` | M (`ProcurementEscrow.sol`) |
| E2 | Fee escalation by a malicious operator | `MAX_FEE_BPS = 500`, fee quoted at creation time and stored per agreement | M |
| E3 | Pausing to trap funds | Pause blocks only `createAgreement`; release/refund/dispute stay open | M |
| E4 | Double release / release after refund | Explicit state machine + terminal states in the contract | M |
| E5 | Dispute never resolved | Resolver role; vendor can `claimAfterDisputeWindow` if the buyer is silent. **No** on-chain deadline for the resolver itself | P |
| E6 | Resolver key compromise | Single key, no multisig in code; key is optional and never required for normal flow | N (deployment control: run behind a multisig / KMS) |
| E7 | Agreement id collision / replay across chains | `agreementId = keccak(orgId, requestId, offerHash, nonce, chainId, escrow)` | M |
| E8 | Buyer's authority proxied to an arbitrary address | `_requireBuyerAuthority` accepts the buyer or an address authorized in the registry for that org | M |

### 3.4 Webhooks

| # | Threat | Control | Status |
| --- | --- | --- | --- |
| W1 | Forged delivery | HMAC-SHA256 over `timestamp.body`, constant-time compare | M |
| W2 | Replay of an old delivery | Timestamp is inside the signed string; consumers must enforce a tolerance window (SDK helper does, 300 s) | M (consumer-side) |
| W3 | Secret leak from the database | Secrets sealed with AES-256-GCM; only the owner can read them at creation time | M |
| W4 | SSRF into internal networks | URL must be HTTPS (HTTP only for localhost/127.0.0.1); **no DNS/IP egress filtering or rebinding protection** | P |
| W5 | Delivery storm / retry flood | Exponential backoff capped at 1 h, max attempts, per-endpoint outbox | M |
| W6 | Event loss | At-least-once with durable outbox rows and attempt counters | M |

### 3.5 Tenancy and access control

| # | Threat | Control | Status |
| --- | --- | --- | --- |
| T1 | Cross-tenant object access (IDOR) | All reads/writes keyed by `principal.orgId`; foreign ids → `404`, never `403` (no existence leak) | M |
| T2 | Privilege escalation via role self-assignment | Role change requires `user:manage` and is limited to a fixed role list; an API key can only narrow its role's permissions, never widen | M |
| T3 | Key theft from backups | Only SHA-256 digests stored; plaintext shown once | M |
| T4 | Revoked key still works | Revocation checked on every request; agent credentials also expire | M |
| T5 | Timing oracle on key comparison | `timingSafeEqual` on hashes | M |

### 3.6 Infrastructure and supply chain

| # | Threat | Control | Status |
| --- | --- | --- | --- |
| I1 | SQL injection | Drizzle parameterised queries; no string-built SQL with user input | M |
| I2 | Log leakage of secrets | Pino redaction of `authorization`, `x-api-key`, `body.secret`, `body.password` | M |
| I3 | Malicious dependency | Lockfiles committed; `npm audit` in CI (non-blocking) | P |
| I4 | Container escape / host compromise | Out of scope of the app; deployment guidance in SECURITY.md | N |
| I5 | Denial of service via huge payloads | 1 MB body limit, 1–100 row pagination | M |

### 3.7 Disputes and governance

| # | Threat | Control | Status |
| --- | --- | --- | --- |
| D1 | Buyer disputes in bad faith to delay payment | Dispute only inside the window; vendor can claim after it | M |
| D2 | Resolver collusion | Ruling hash + note are recorded and audited; **no** economic stake or multi-party arbitration | N |
| D3 | Evidence tampering | Evidence is hashed; the hash goes into the dispute record and, when resolved, into `rulingHash` on-chain | M |

---

## 4. Explicit non-goals / known gaps

1. **No third-party audit.** Nothing here has been audited; do not deploy with
   real funds without one.
2. **Not deployed to Mezo.** Only a local Anvil deployment exists. Addresses in
   `contracts/deployments/local-anvil-31611.json` are local test addresses.
3. **No KYC/AML, sanctions screening, or vendor due diligence automation.**
   `verified` is an operator-set flag.
4. **No IP allowlisting, mTLS or egress proxy** for webhooks (SSRF residual).
5. **Single-process indexer and webhook worker.** No leader election.
6. **Resolver is a single key**, not a multisig or a decentralized panel.
7. **No on-chain enforcement of per-request policy limits** — the contract
   enforces per-transaction caps and authorization, the API enforces policy.
   A caller with a valid buyer key can always fund directly; that is inherent to
   non-custodial escrow and is why budgets live on the API side too.
8. **No email/push notifications**, no vendor scorecards derived from history.
