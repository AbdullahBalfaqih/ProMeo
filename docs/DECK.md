# ProMeo: Autonomous AI Agent Procurement Network on Mezo
## Official Project Pitch Deck & Executive Presentation

---

### Slide 1: Cover & Vision
# ProMeo
### Autonomous AI Agent Procurement Network on Mezo Blockchain
*Empowering autonomous AI agents to discover, negotiate, and settle enterprise services with non-custodial MUSD escrow, Mezo Trove credit lines, and cryptographic audit integrity.*

- **Network:** Mezo Testnet (Chain ID `31611`) & Mezo Mainnet (`31612`)
- **Core Currency:** Mezo native MUSD (backed by Bitcoin collateral)
- **Contracts:** `ProcurementEscrow.sol` · `AgentPolicyRegistry.sol`
- **Application:** Next.js 15 · Web3 Reown AppKit · Fastify Control Plane

---

### Slide 2: The Problem — The AI Agent Commerce Bottleneck
As autonomous AI agents take over critical enterprise workflows (training, model inference, ETL pipelines, vector search, cloud infrastructure), they face a fundamental barrier: **Capital & Procurement Friction**.

1. **Credit Cards & Bank Accounts Break:** Traditional banking rails cannot issue instantaneous, granular spending limits for thousands of autonomous sub-agents.
2. **Slow Human Procurement Cycles:** Enterprise vendor onboarding and invoice reconciliation takes 2–6 weeks; AI workloads scale up and down in seconds.
3. **Counterparty Risk & Non-Delivery:** Pre-paying vendors risks non-delivery; post-paying vendors risks unpaid compute invoices.
4. **Lack of Cryptographic Auditability:** Traditional logs can be edited or deleted, making compliance and post-mortems difficult for autonomous execution.

---

### Slide 3: The Solution — ProMeo Protocol
ProMeo provides a programmatic, trustless rail for autonomous agent commerce:

- **Non-Custodial MUSD Escrow:** Funds are locked in smart contracts on Mezo upon agreement formation and released only upon cryptographically verified delivery or milestone completion.
- **Deterministic Policy Engine:** Organizations define spending limits, category allowlists, and threshold policies (e.g., auto-approve < $500, require human approval > $500).
- **EIP-2612 Gasless Permit:** 1-transaction approval and agreement funding eliminates separate token allowance transactions.
- **Milestone Payouts:** Support for progressive delivery stages with prorated fee settlement.
- **Tamper-Evident Merkle Audit:** Every quote, policy decision, and escrow transaction is SHA-256 hash-chained for mathematical proof of compliance.

---

### Slide 4: Why Mezo Blockchain?
ProMeo is built natively for the Mezo Bitcoin Economic Layer:

1. **Native BTC Collateral:** Enterprise treasuries hold Bitcoin. Mezo allows organizations to deposit BTC and borrow MUSD without selling their core Bitcoin holdings.
2. **Deep Trove State Integration:**
   - ProMeo smart contracts inspect Mezo Trove health (`IMezoTroveManager`) and Individual Collateral Ratio (ICR) before locking high-value contracts.
   - Agent budgets can be funded directly from MUSD credit lines via `BorrowerOperations`.
3. **Ultra-Low Gas Fees & Bitcoin Security:** Transactions settle on Mezo EVM with tBTC gas fees of pennies, enabling micro-procurement tasks.
4. **Canonical MUSD Settlement:** Zero reliance on centralized bridge tokens; native EIP-2612 compliance.

---

### Slide 5: System Architecture & Dual-Layer Security

```
+-------------------------------------------------------------------------+
|                              CLIENT LAYER                               |
|   Next.js 15 Web App  |  Enterprise Agent SDK  |  Operator Console      |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                          CONTROL PLANE (Fastify)                        |
|  - RBAC & Tenant Authentication (Action-Specific Permissions)           |
|  - Deterministic Policy Evaluator (Allow / Deny / Require Review)       |
|  - Atomic Budget Engine (SELECT ... FOR UPDATE Concurrency Guards)      |
|  - SHA-256 Hash-Chained Audit Ledger                                    |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                        MEZO BLOCKCHAIN (Chain 31611)                    |
|  - ProcurementEscrow.sol:                                               |
|      * Strict Buyer-to-Org binding (Tenant Isolation)                   |
|      * EIP-2612 Gasless Permit funding                                  |
|      * Progressive Milestone settlements                                |
|      * Trove Health Verification via IMezoTroveManager                  |
|  - AgentPolicyRegistry.sol:                                             |
|      * On-chain Agent identities, spending ceilings, and kill-switches  |
|  - Canonical MUSD Token: Non-custodial settlement rail                  |
+-------------------------------------------------------------------------+
```

---

### Slide 6: Lifecycle of an Autonomous Agreement

1. **Request Formulation:** Buyer agent submits procurement intent (e.g. 8x H100 GPU cluster for 72 hours).
2. **Policy Verification:** Control plane evaluates organization budget and spending rules.
3. **RFQ & EIP-712 Bidding:** Verified supplier agents submit typed-data cryptographic quotes.
4. **Escrow Lock:** Buyer funds escrow in 1 transaction via EIP-2612 Permit. Buyer address is strictly validated against the registered organization treasury (`orgBuyer`).
5. **Execution & Delivery:** Vendor provisions cluster and posts deliverable attestation hash.
6. **Milestone / Full Release:** Buyer inspects SLA benchmarks and triggers progressive milestone release (`releaseMilestone`) or final settlement (`release`).
7. **Dispute Arbitration:** If SLAs are breached, either party can freeze escrow with proof hashes, adjudicated by designated resolvers.

---

### Slide 7: Security Audit & High Findings Resolution
ProMeo has completed a rigorous internal audit and resolved the critical security findings:

| Finding | Severity | Resolution Implemented |
|---|---|---|
| **Buyer Address Unbound in `createAgreement`** | **HIGH** | Resolved in `ProcurementEscrow.sol`. Each organization's buyer treasury is strictly bound (`orgBuyer`). Any attempt by unauthorized callers or cross-tenant agents to use another buyer's address reverts immediately with `BuyerNotBoundToOrg`. |
| **Broad Read Scope on `/execute` Route** | **HIGH** | Resolved in `server/src/routes/agreements.ts`. The execute route now enforces strict action-specific permissions (`agreement:fund_intent`, `agreement:release_intent`, `agreement:cancel_intent`, `dispute:open`, `vendor:manage`). Viewers can no longer execute financial actions. |
| **Deep Mezo Protocol State** | **FEATURE** | Integrated `IMezoTroveManager` to read borrower Trove status, collateral, debt, and ICR on Mezo before releasing escrow. |
| **Gasless Permit & Milestones** | **FEATURE** | Implemented `createAgreementWithPermit` (EIP-2612) and `releaseMilestone` for progressive multi-stage payouts. |

---

### Slide 8: Market Opportunity & Unit Economics

- **Total Addressable Market (TAM):** By 2028, autonomous AI agent compute, API, and cloud procurement is projected to exceed $120B annually.
- **Revenue Model:**
  - **1.0% Protocol Settlement Fee** on escrow releases (capped at 5% hard-coded in contract).
  - Enterprise Private Policy Engine licensing & custom Trove liquidity connectors.
- **Target Customers:**
  - AI Agent Labs & Autonomous Hedge Funds.
  - Decentralized Compute Networks & GPU Suppliers (e.g. Helios, Aether).
  - Enterprise IT procurement departments deploying autonomous workflow agents.

---

### Slide 9: Product Roadmap

- **Phase 1: Foundation (Current - Mezo Testnet):**
  - Smart contracts deployed and hardened on Mezo Testnet (`31611`).
  - Next.js 15 interactive console with Reown AppKit wallet connectivity.
  - High findings resolved; EIP-2612 permit & milestone payouts live.
- **Phase 2: Protocol Integration & Mezo Mainnet (`31612`):**
  - Live Trove integration funding agent budgets directly from BTC collateral via `BorrowerOperations`.
  - Multi-sig timelock arbitration via Safe on Mezo.
  - Verified contracts on Mezo Blockscout.
- **Phase 3: Agentic Commerce Ecosystem:**
  - ERC-4337 Account Abstraction session keys for fully autonomous sub-wallets.
  - Cross-chain intent bridges routing liquidity into Mezo MUSD.

---

### Slide 10: Summary & Why ProMeo Wins
1. **Real Utility on Mezo:** Drives real, high-velocity transaction volume and utility for native MUSD.
2. **Beyond Plain ERC-20:** Deeply tied to Mezo's native credit layer and Bitcoin collateral architecture.
3. **Enterprise Grade:** Mathematical Merkle auditability, role-based access control, and audited smart contracts.
4. **Working Live Today:** Full-featured interactive console, SDK, and production-ready contracts.
