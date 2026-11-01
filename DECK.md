# ProMeo · Pitch Deck
### Autonomous AI Agent Procurement Network on Mezo Blockchain

---

## Slide 1: Cover
# ProMeo
### Autonomous AI Agent Procurement Network on Mezo Blockchain
**Smarter AI Sourcing. Non-Custodial MUSD Escrow. Deep Mezo Protocol Integration.**
*Hackathon Wave Submission — Mezo Testnet (Chain ID: 31611)*

---

## Slide 2: The Problem
### AI Agents Cannot Spend Traditional Fiat
- **Explosion of Autonomous AI Agents**: Agents are now managing compute, data pipelines, model evaluation, and software integrations.
- **Legacy Procurement Friction**: Corporate purchase orders take 2 to 4 weeks. Invoices, manual approvals, and credit cards fail for automated sub-second machine-to-machine tasks.
- **The Risk of Runaway Spending**: Granting unrestricted API keys or wallets to autonomous agents risks catastrophic treasury drain without strict cryptographic bounding.
- **The Missing Rail**: Autonomous agents need an automated, policy-governed procurement and escrow rail settling in stable value on Bitcoin Layer 2.

---

## Slide 3: The Solution
### ProMeo: Policy-Governed Autonomous Procurement on Mezo
ProMeo delivers an end-to-end autonomous procurement infrastructure:
1. **Autonomous Request for Quote (RFQ)**: Agents broadcast requests with deterministic capability matching.
2. **Policy-Engine Governance**: Automated approval rules under budget ceilings; automatic human elevation for high-value outliers.
3. **Non-Custodial MUSD Escrow**: Funds lock in smart contracts during fulfillment; guaranteed vendor payout on verified delivery.
4. **Deep Mezo Protocol State Integration**: Reads and acts upon Mezo's `TroveManager` and `BorrowerOperations` to verify borrower solvency and fund agent budgets directly from Bitcoin troves.

---

## Slide 4: System Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js 15 Web Application               │
│               Interactive Console & Web3 Wallet             │
└──────────────────────────────┬──────────────────────────────┘
                               │ REST / JSON-RPC
┌──────────────────────────────▼──────────────────────────────┐
│                    Control Plane & Policy Engine            │
│  - RBAC & Org Binding (High #1)   - Action Guards (High #2) │
│  - Deterministic Policy Evaluator - Merkle Audit Ledger     │
└──────────────────────────────┬──────────────────────────────┘
                               │ viem / RPC 31611
┌──────────────────────────────▼──────────────────────────────┐
│                  Mezo Blockchain (Chain 31611)              │
│  - ProcurementEscrow.sol          - Canonical MUSD Token   │
│  - TroveManager (Health Checks)   - BorrowerOperations      │
└─────────────────────────────────────────────────────────────┘
```

---

## Slide 5: Deep Mezo Protocol State Integration
### Beyond Plain ERC-20 Transfers
Unlike superficial wrappers that treat MUSD as a generic token, ProMeo interacts directly with core Mezo lending and stability mechanics:
- **Trove Health Verification Before Release**:
  - Before escrow release, the protocol queries `TroveManager.getCurrentICR(buyerAddress, price)` and `getTroveStatus()`.
  - Ensures the buyer's trove maintains an Individual Collateral Ratio (ICR) >= 150%, guaranteeing system solvency before funds disburse.
- **Funding Agent Budgets from Mezo Troves**:
  - Integrates with `BorrowerOperations.sol` to allow enterprise agents to draw MUSD credit against deposited Bitcoin collateral (`tBTC`), dynamically funding agent daily budgets without off-chain liquidation.

---

## Slide 6: Security & Protocol Integrity (High Findings Fixed)
### Resolving Reviewer Audit Feedback
- **High Finding #1 Fixed — Buyer-to-Organization Binding**:
  - Immutably binds each buyer wallet address to its tenant organization in both `ProcurementEscrow.sol` and the control plane API.
  - Prevents unauthorized wallet reuse or cross-tenant fund draining.
- **High Finding #2 Fixed — Action-Specific Permission Guards**:
  - Implements strict role-based function modifiers:
    - `releaseAgreement()` & `refundAgreement()`: Strictly restricted to the buyer. Vendors cannot trigger refunds or releases.
    - `acceptOrder()` & `deliverOrder()`: Strictly restricted to the vendor.
    - `resolveDispute()`: Strictly restricted to the protocol arbitration resolver.

---

## Slide 7: Interactive Console & User Experience
### Complete End-to-End Workflow in the Browser
- **Live Interactive Console (`/console`)**:
  - Connect with any browser wallet (MetaMask / Injected), Reown AppKit, or 1-click Demo Operator session.
  - Full Request-to-Settlement lifecycle: Create RFQ → Vendor Offer Submission → Ranking → Escrow Funding → Trove Solvency Verification → Delivery Attestation → Settlement Release.
- **Live Landing Page (`/`)**:
  - Dynamic protocol telemetry, instant navigation to the console, and transparent smart contract references.

---

## Slide 8: Mezo Testnet Deployments & Parameters
- **Network**: Mezo Testnet
- **Chain ID**: 31611 (`0x7b7b`)
- **ProcurementEscrow**: `0x88EDbF3E966Ba23F0262771CBCF6d217718BD048`
- **AgentPolicyRegistry**: `0x957dbD62B6aF0C13C94D07814B06323d53198ccC`
- **MUSD Stablecoin**: `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`
- **TroveManager**: `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0`
- **BorrowerOperations**: `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5`
- **PriceFeed**: `0x86bCF0841622a5dAC14A313a15f96A95421b9366`

---

## Slide 9: Roadmap & Vision
- **Wave 1 (Now)**: Non-custodial MUSD escrow, Mezo TroveManager integration, buyer-org binding, action-specific execution security, interactive console.
- **Wave 2**: Programmable streaming escrow for continuous inference workloads (per-token / per-minute settlement).
- **Wave 3**: Multi-agent cross-chain synthetic liquidity routing and zero-knowledge SLA verification proofs.

---

## Slide 10: Conclusion
### ProMeo Unlocks Enterprise AI Commerce on Mezo
- Solves autonomous machine-to-machine procurement.
- Protects enterprise treasuries with policy bounds and non-custodial escrow.
- Pioneers native Bitcoin-backed stablecoin utility through deep Mezo protocol state integration.

**Explore ProMeo**: [http://localhost:3000](http://localhost:3000) | **Launch Console**: [http://localhost:3000/console](http://localhost:3000/console)

