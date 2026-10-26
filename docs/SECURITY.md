# Security

This document is the operational security contract for APN. It describes what
the code enforces, what operators must do, and what is explicitly out of scope.
Read it together with [THREAT_MODEL.md](./THREAT_MODEL.md).

> Status: reference implementation, **not audited**, **not deployed to Mezo**.
> Do not move real funds with it.

---

## 1. Authentication

| Principal | Credential | Storage | Rotation |
| --- | --- | --- | --- |
| Human | `apn_u_<prefix>_<secret>` bearer token | `sha256(secret)` + plaintext prefix in `api_keys` | Create a new key, revoke the old one (`DELETE /v1/api-keys/:id`) |
| Agent | `apn_a_<prefix>_<secret>` bearer token | `sha256(secret)` in `agent_credentials`, with `expires_at` | Per-credential TTL, revoke at any time (`DELETE /v1/agents/:id/credentials/:cid`) |
| Resolver | secp256k1 key in `RESOLVER_PRIVATE_KEY` | environment only | Rotate the on-chain `RESOLVER_ROLE` holder, then the env var |

* Secrets are 32 random bytes (base64url) or 64 hex chars. They are printed
  **once** at creation; there is no recovery endpoint.
* Every request re-checks `revoked_at`, `expires_at`, the user's `status`, and
  the agent's `status`. A suspended agent cannot authenticate even with a valid
  credential.
* API keys can narrow a role (explicit scope list) but never exceed it:
  `permissions = role ∩ keyScopes`.

## 2. Authorization

RBAC is deny-by-default (`server/src/auth/rbac.ts`). The seven roles are
`owner`, `admin`, `procurement_manager`, `approver`, `finance`, `auditor`,
`viewer`. Agents use the same permission vocabulary but only a hard-coded
subset is accepted at creation:

```
request:create  request:read  offer:read  offer:discover  budget:read
agreement:read  agreement:fund_intent
```

Agents can never: approve, award, manage policies, manage vendors, resolve
disputes, manage webhooks, read audit logs outside their scopes.

Separation of duties that is enforced:

* A requester cannot approve their own request (`approval.requested_by != user`).
* Agents cannot approve even if granted `request:approve` (explicit agent check).
* Funding and releasing require different permissions than approval.
* Policy documents can only be written by users, never by agent credentials.

## 3. Tenancy

Every table with tenant data has `org_id`, and every query is filtered by the
authenticated principal's `org_id` — never by a client-supplied id. Foreign
resource ids return `404 Not Found` (not `403`) to avoid existence oracles.

The only intentional cross-tenant surface is the marketplace:

* `GET /v1/marketplace/requests[/:id]` returns a **field-limited projection** of
  `open` requests to any authenticated principal.
* `POST /v1/marketplace/requests/:id/offers` requires the caller to own the
  vendor they are bidding as, and the offer's signing key must equal that
  vendor's payout address.

## 4. Secrets management

| Secret | Requirement | Failure mode |
| --- | --- | --- |
| `DATABASE_URL` | secret manager / env file with 0600 | API refuses to start |
| `SECRET_ENCRYPTION_KEY` | 32 bytes hex, from KMS/secret manager | Webhooks cannot be created (`412`) |
| `RESOLVER_PRIVATE_KEY` | optional; KMS or hardware-backed | Disputes can still be resolved manually on-chain |
| Customer keys | never on the server | — |

Rules:

* Never commit `.env`. `server/.env` is gitignored; only `.env.example` is tracked.
* Never reuse `SECRET_ENCRYPTION_KEY` across environments. Rotating it requires
  re-sealing endpoint secrets (there is no automatic migration; re-create the
  endpoints).
* Logs redact `authorization`, `x-api-key`, `body.secret`, `body.password`.

## 5. Transport and headers

* TLS is expected to terminate in front of the API. The API itself speaks HTTP.
* `trustProxy` is enabled so client IPs are derived from `X-Forwarded-For`;
  **only** run it behind a proxy that overwrites that header.
* `/admin` is served with a restrictive CSP (`default-src 'self'`,
  `connect-src 'self'`), `nosniff`, and `referrer-policy: no-referrer`.
* CORS is off by default; configure `CORS_ORIGINS` explicitly. Wildcard is
  rejected in production.

## 6. Rate limiting and abuse

* Global per-credential rate limit (`RATE_LIMIT_PER_MINUTE`, default 240/min).
* Body limit 1 MB; pagination capped at 100 rows.
* Idempotency keys (8–200 chars) on all mutating POSTs; replaying the same body
  returns the original response, replaying a different body returns `409`.

## 7. On-chain safety

* `ReentrancyGuard` on every value-moving function; `SafeERC20` for MUSD.
* Fee ceiling of 500 bps enforced in the contract; fee is quoted at creation
  and stored per agreement.
* Pause affects only new agreements.
* `AgentPolicyRegistry` authorizes `(orgId, agent)` with expiry and per-tx cap;
  the escrow reverts if a non-buyer caller is not authorized.
* Every agreement is bound to `chainId` and the escrow address in its id, which
  prevents cross-chain replay.
* **Operators must** verify `MUSD_ADDRESS` against the official Mezo contract
  reference before deploying, and must not trust any address in this repo.

## 8. Incident response

1. **Suspected key compromise** — revoke the API key / agent credential
   immediately (`DELETE` endpoints), suspend the agent (`PATCH /v1/agents/:id
   {status:"suspended"}`), and if the wallet key is at risk, remove the on-chain
   authorization (`AgentPolicyRegistry.setAgentAuthorization(..., validUntil=0,
   maxPerTx=0)`), which takes effect for all new escrow interactions.
2. **Suspicious escrow activity** — `PAUSER_ROLE.pause()` stops new agreements.
   Funds already escrowed remain releasable/refundable; this is intentional.
3. **Webhook secret leak** — delete and recreate the endpoint; the old secret
   stops being valid immediately.
4. **Audit tampering** — `GET /v1/audit/verify` returns the first broken
   sequence number; restore from an off-host copy and preserve the database for
   forensics.
5. **Database compromise** — assume offer/policy/request data is disclosed;
   credentials are hashed, but rotate all API keys and agent credentials.

## 9. Verification you can run yourself

```bash
# contracts (includes fuzz + invariant suites)
cd contracts && forge test

# API unit + DB integration tests (needs PostgreSQL)
cd server && npm test

# cross-language hashing conformance
cd server && npx tsx scripts/gen-hash-vectors.ts && npm test
cd packages/sdk && npm test

# end-to-end: real HTTP + real transactions against a local Anvil chain
cd server && npm run e2e     # writes docs/e2e-report.json
```

## 10. Out of scope

Third-party audit, penetration test, bug bounty, SOC2, GDPR/DPIA, KYC/AML,
sanctions screening, hardware wallets, multi-region disaster recovery, and
multi-sig operation of privileged roles. See THREAT_MODEL.md §4.
