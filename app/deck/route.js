export const dynamic = 'force-dynamic';

export async function GET() {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ProMeo · Pitch Deck</title>
  <style>
    :root {
      --bg: #0d0a1a;
      --card-bg: rgba(26, 19, 54, 0.7);
      --accent: #6d3fea;
      --accent-glow: #8b5cf6;
      --text: #ffffff;
      --muted: #a59fc4;
      --line: rgba(139, 92, 246, 0.25);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: radial-gradient(ellipse 90% 70% at 50% 10%, #20124d 0%, var(--bg) 100%);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
    }
    header {
      padding: 16px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--line);
      background: rgba(13, 10, 26, 0.85);
      backdrop-filter: blur(12px);
      position: sticky;
      top: 0;
      z-index: 50;
    }
    .logo-badge {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 700;
      font-size: 18px;
    }
    .logo-badge img { width: 30px; height: 30px; }
    .nav-btns { display: flex; gap: 10px; align-items: center; }
    .btn {
      padding: 8px 18px;
      border-radius: 99px;
      border: 1px solid var(--line);
      background: rgba(109, 63, 234, 0.15);
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn.primary {
      background: linear-gradient(135deg, #8659f4 0%, #6d3fea 100%);
      box-shadow: 0 4px 18px rgba(109, 63, 234, 0.4);
      border-color: transparent;
    }
    .btn:hover { transform: translateY(-1px); border-color: var(--accent-glow); }
    main {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 30px 20px;
    }
    .deck-container {
      width: 100%;
      max-width: 980px;
      min-height: 560px;
      background: var(--card-bg);
      border: 1px solid var(--line);
      border-radius: 28px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(24px);
      padding: 50px 60px;
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .slide { display: none; }
    .slide.active { display: flex; flex-direction: column; flex: 1; animation: fadeIn 0.25s ease; }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .tag {
      align-self: flex-start;
      padding: 4px 12px;
      border-radius: 99px;
      background: rgba(139, 92, 246, 0.2);
      border: 1px solid rgba(139, 92, 246, 0.4);
      font-size: 12px;
      font-weight: 600;
      color: #d1bbf9;
      margin-bottom: 16px;
    }
    h1 { font-size: 38px; font-weight: 800; line-height: 1.15; margin-bottom: 14px; letter-spacing: -0.02em; }
    h2 { font-size: 26px; font-weight: 700; margin-bottom: 18px; color: #fff; }
    p { font-size: 16px; color: var(--muted); line-height: 1.65; margin-bottom: 20px; }
    .feature-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-top: 12px;
    }
    .f-box {
      padding: 20px;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .f-box b { display: block; font-size: 15px; color: #fff; margin-bottom: 6px; }
    .f-box span { font-size: 13px; color: var(--muted); line-height: 1.5; display: block; }
    .controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 24px;
      border-top: 1px solid var(--line);
      margin-top: 30px;
    }
    .indicator { font-size: 13px; color: var(--muted); font-weight: 500; }
    code {
      font-family: ui-monospace, Menlo, monospace;
      font-size: 13px;
      background: rgba(0,0,0,0.4);
      padding: 2px 6px;
      border-radius: 6px;
      color: #c9a6fb;
    }
  </style>
</head>
<body>
  <header>
    <div class="logo-badge">
      <img src="/assets/logo.png" alt="ProMeo" />
      <span>ProMeo · Pitch Deck</span>
    </div>
    <div class="nav-btns">
      <a class="btn" href="/">Landing Page</a>
      <a class="btn primary" href="/console">Launch Console →</a>
    </div>
  </header>

  <main>
    <div class="deck-container">
      <!-- Slide 1 -->
      <div class="slide active">
        <span class="tag">Mezo Testnet Chain 31611</span>
        <h1>ProMeo</h1>
        <h2 style="color:#b49cff">Autonomous AI Agent Procurement Network</h2>
        <p style="font-size:18px">
          Bridging autonomous machine-to-machine procurement with non-custodial MUSD escrow and deep Mezo protocol state integration.
        </p>
        <div class="feature-grid">
          <div class="f-box">
            <b>Autonomous AI Sourcing</b>
            <span>Multi-agent RFQ, deterministic quote ranking, and SLA evaluation for compute and APIs.</span>
          </div>
          <div class="f-box">
            <b>Mezo Trove State Integration</b>
            <span>Solvency verification via <code>TroveManager</code> and budget funding from <code>BorrowerOperations</code>.</span>
          </div>
          <div class="f-box">
            <b>High Finding #1 Fixed</b>
            <span>Strict buyer-to-organization binding enforced across contract and API layers.</span>
          </div>
          <div class="f-box">
            <b>High Finding #2 Fixed</b>
            <span>Action-specific permissions guarding release, refund, dispute, and settlement.</span>
          </div>
        </div>
      </div>

      <!-- Slide 2 -->
      <div class="slide">
        <span class="tag">The Problem</span>
        <h2>AI Agents Cannot Spend Traditional Fiat</h2>
        <p>As autonomous AI agent fleets scale to manage cloud compute, data pipelines, and external APIs, legacy corporate procurement breaks down completely:</p>
        <div class="feature-grid">
          <div class="f-box">
            <b>4-Week Purchase Orders Fail</b>
            <span>Invoices and manual signatures cannot fulfill sub-second machine-to-machine transactions.</span>
          </div>
          <div class="f-box">
            <b>Unrestricted Spending Risk</b>
            <span>Handing raw corporate credit cards or unrestricted wallets to AI agents invites catastrophic treasury drain.</span>
          </div>
          <div class="f-box">
            <b>Zero Counterparty Trust</b>
            <span>Vendors cannot risk delivering high-performance GPU hours to autonomous agents without guaranteed on-chain escrow.</span>
          </div>
          <div class="f-box">
            <b>The Bitcoin Layer 2 Rail</b>
            <span>Agents need stable value (MUSD) settled securely on Bitcoin-backed infrastructure (Mezo).</span>
          </div>
        </div>
      </div>

      <!-- Slide 3 -->
      <div class="slide">
        <span class="tag">The Solution</span>
        <h2>Policy-Governed Procurement on Mezo</h2>
        <p>ProMeo provides a complete, trust-minimized procurement infrastructure tailored specifically for autonomous agent commerce:</p>
        <div class="feature-grid">
          <div class="f-box">
            <b>1. Autonomous RFQ & Ranking</b>
            <span>Agents broadcast requirements; vendors submit signed offers ranked deterministically by price, latency, and SLA.</span>
          </div>
          <div class="f-box">
            <b>2. Policy Governance Engine</b>
            <span>Low-risk compute purchases auto-approve; high-value outliers automatically route to human sign-off.</span>
          </div>
          <div class="f-box">
            <b>3. Non-Custodial MUSD Escrow</b>
            <span>Locked in <code>ProcurementEscrow.sol</code> until verified delivery, eliminating counterparty risk.</span>
          </div>
          <div class="f-box">
            <b>4. Mezo Protocol State Integration</b>
            <span>Direct verification of Trove health and collateral ratios before release of funds.</span>
          </div>
        </div>
      </div>

      <!-- Slide 4 -->
      <div class="slide">
        <span class="tag">Deep Mezo Integration</span>
        <h2>Beyond Generic ERC-20 Transfers</h2>
        <p>ProMeo reads and acts directly upon the native Mezo Liquity-fork lending contracts:</p>
        <div class="feature-grid">
          <div class="f-box">
            <b>Trove Health Solvency Gate</b>
            <span>Queries <code>TroveManager.getCurrentICR</code> (0xE47c...6bb0). Requires borrower ICR &gt;= 150% before escrow release.</span>
          </div>
          <div class="f-box">
            <b>Funding Budgets from Troves</b>
            <span>Enterprise buyers can draw MUSD against Bitcoin collateral (<code>tBTC</code>) via <code>BorrowerOperations</code> to fund agent budgets.</span>
          </div>
          <div class="f-box">
            <b>Oracle Price Feed Verification</b>
            <span>Reads <code>PriceFeed.fetchPrice</code> (0x86bC...9366) to compute real-time collateral ratios.</span>
          </div>
          <div class="f-box">
            <b>Cryptographic Audit Proofs</b>
            <span>Every Trove health check and settlement is appended to a tamper-evident SHA-256 audit ledger.</span>
          </div>
        </div>
      </div>

      <!-- Slide 5 -->
      <div class="slide">
        <span class="tag">Security Fixes</span>
        <h2>High Audit Findings Resolved</h2>
        <p>Both high-severity vulnerabilities highlighted by the review committee have been permanently resolved:</p>
        <div class="feature-grid">
          <div class="f-box">
            <b>High #1: Buyer-Org Binding</b>
            <span>In <code>ProcurementEscrow.sol</code> and the API, buyer addresses are permanently bound to their organization ID, preventing cross-tenant address reuse.</span>
          </div>
          <div class="f-box">
            <b>High #2: Action Permissions</b>
            <span>Strict role checks: <code>release</code> and <code>refund</code> are strictly restricted to the Buyer; <code>accept</code> and <code>deliver</code> to the Vendor; <code>resolve</code> to the Resolver.</span>
          </div>
        </div>
        <p style="margin-top:20px;font-size:14px;color:#c9a6fb">
          Deployed Contracts: <code>ProcurementEscrow (0x88EDbF3E966Ba23F0262771CBCF6d217718BD048)</code> | <code>AgentPolicyRegistry (0x957dbD62B6aF0C13C94D07814B06323d53198ccC)</code>
        </p>
      </div>

      <!-- Slide 6 -->
      <div class="slide">
        <span class="tag">Live Experience</span>
        <h2>Try ProMeo Console Right Now</h2>
        <p>The console is live, interactive, and connected to the Mezo Testnet:</p>
        <div class="feature-grid">
          <div class="f-box">
            <b>Connect Your Wallet</b>
            <span>Support for MetaMask, browser injected wallets, and Reown AppKit.</span>
          </div>
          <div class="f-box">
            <b>One-Click Demo Session</b>
            <span>Instant access to explore the complete buyer, vendor, and agent workflow without friction.</span>
          </div>
        </div>
        <div style="margin-top:30px;display:flex;gap:12px">
          <a class="btn primary" href="/console" style="padding:12px 28px;font-size:15px">Launch Console →</a>
          <a class="btn" href="/" style="padding:12px 28px;font-size:15px">View Landing Page</a>
        </div>
      </div>

      <div class="controls">
        <button class="btn" id="prevBtn" type="button">← Previous</button>
        <span class="indicator" id="slideIndicator">Slide 1 of 6</span>
        <button class="btn primary" id="nextBtn" type="button">Next →</button>
      </div>
    </div>
  </main>

  <script>
    const slides = document.querySelectorAll(".slide");
    let current = 0;

    function update() {
      slides.forEach((s, i) => s.classList.toggle("active", i === current));
      document.getElementById("slideIndicator").textContent = "Slide " + (current + 1) + " of " + slides.length;
      document.getElementById("prevBtn").style.visibility = current === 0 ? "hidden" : "visible";
      document.getElementById("nextBtn").textContent = current === slides.length - 1 ? "Start Over ↺" : "Next →";
    }

    document.getElementById("prevBtn").onclick = () => {
      if (current > 0) { current--; update(); }
    };
    document.getElementById("nextBtn").onclick = () => {
      current = (current + 1) % slides.length;
      update();
    };

    window.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === " ") { current = (current + 1) % slides.length; update(); }
      else if (e.key === "ArrowLeft" && current > 0) { current--; update(); }
    });

    update();
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
    },
  });
}

