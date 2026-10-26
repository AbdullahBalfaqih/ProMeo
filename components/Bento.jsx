'use client';

/* Soft radial highlight that follows the pointer inside each bento card. */
function handleGlow(event) {
  const card = event.currentTarget;
  const rect = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${((event.clientX - rect.left) / rect.width) * 100}%`);
  card.style.setProperty('--my', `${((event.clientY - rect.top) / rect.height) * 100}%`);
}

export default function Bento() {
  return (
    <section className="bento-section">
      <div className="container-wide">
        <div className="bento">
          {/* One stop */}
          <article className="bento-card card-one" data-reveal="" onPointerMove={handleGlow}>
            <div className="flow" aria-hidden="true">
              <div className="flow-row r1">
                <span className="flow-pill">
                  <i className="dot"></i>Escrow Funded
                </span>
                <span className="flow-pill hot">MUSD Locked</span>
              </div>
              <div className="flow-row r2">
                <span className="flow-pill">
                  <svg className="mini">
                    <use href="#i-spark" />
                  </svg>
                  Mezo Chain 31611
                </span>
                <span className="flow-pill">
                  <svg className="mini">
                    <use href="#i-spark" />
                  </svg>
                  Autonomous Sourcing
                </span>
                <span className="flow-pill">Policy Enforced</span>
              </div>
              <div className="flow-row r3">
                <span className="flow-pill">Policy Enforced</span>
                <span className="flow-pill">
                  <svg className="mini">
                    <use href="#i-spark" />
                  </svg>
                  Autonomous Sourcing
                </span>
                <span className="flow-pill">Mezo Chain 31611</span>
              </div>
              <div className="flow-row r4">
                <span className="flow-pill">Merkle Audit Log</span>
                <span className="flow-pill">
                  <svg className="mini">
                    <use href="#i-spark" />
                  </svg>
                  Zero Counterparty Risk
                </span>
              </div>
              <span className="flow-glow"></span>
            </div>
            <div className="card-foot">
              <span className="card-icon">
                <svg>
                  <use href="#i-spark" />
                </svg>
              </span>
              <h3>Autonomous AI Procurement</h3>
              <p>AI agents discover, negotiate &amp; settle on Mezo</p>
            </div>
          </article>

          {/* Market growth */}
          <article className="bento-card card-market" data-reveal="" style={{ '--d': '.07s' }} onPointerMove={handleGlow}>
            <div className="market" aria-hidden="true">
              <div className="market-rings">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span className="chip c1">99.9% SLA</span>
              <span className="chip c2">&lt; 1s Check</span>
              <span className="chip c3">Zero Leak</span>
              <span className="chip c4">Auto-Cap</span>
              <svg className="sparkline" viewBox="0 0 320 110" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#fff" stopOpacity=".28" />
                    <stop offset="1" stopColor="#fff" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0 92 C24 86 34 64 56 68 C78 72 84 88 106 80 C128 72 132 44 154 48 C176 52 182 74 204 64 C226 54 232 26 254 30 C276 34 288 20 320 10 L320 110 L0 110 Z"
                  fill="url(#sparkFill)"
                />
                <path
                  d="M0 92 C24 86 34 64 56 68 C78 72 84 88 106 80 C128 72 132 44 154 48 C176 52 182 74 204 64 C226 54 232 26 254 30 C276 34 288 20 320 10"
                  fill="none"
                  stroke="rgba(255,255,255,.55)"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
            <div className="card-foot">
              <span className="card-icon">
                <svg>
                  <use href="#i-bars" />
                </svg>
              </span>
              <h3>Policy &amp; Budget Governance</h3>
              <p>Hard spending limits &amp; human approval queues</p>
            </div>
          </article>

          {/* Rating */}
          <article className="bento-card card-rating" data-reveal="" style={{ '--d': '.14s' }} onPointerMove={handleGlow}>
            <div className="rating-badge">
              <span className="rb-ic">
                <svg>
                  <use href="#i-star" />
                </svg>
              </span>
              <span>
                <b>Protocol Integrity</b>
                <em>100% (SHA-256)</em>
              </span>
            </div>
            <div className="rating-orb" aria-hidden="true">
              <span className="ro-wave w1"></span>
              <span className="ro-wave w2"></span>
              <span className="ro-wave w3"></span>
              <span className="ro-core">
                <img src="/assets/logo.png" alt="ProMeo" />
              </span>
            </div>
            <div className="reviews">
              <div className="mini-review">
                <div className="mr-head">
                  <img src="/assets/avatars/a1.png" alt="" />
                  <div>
                    <b>Loriyas D..</b>
                    <span>Lead AI Engineer</span>
                  </div>
                </div>
                <p>
                  Deploying autonomous procurement with MUSD escrow cut our cloud cluster procurement cycle from weeks to minutes.
                </p>
                <div className="mr-foot">
                  <span>
                    <svg>
                      <use href="#i-thumb" />
                    </svg>
                    3
                  </span>
                  <span>
                    <svg>
                      <use href="#i-chat" />
                    </svg>
                    0
                  </span>
                </div>
              </div>
              <div className="mini-review">
                <div className="mr-head">
                  <img src="/assets/avatars/people/carlo.jpg" alt="" />
                  <div>
                    <b>Robert Carlo</b>
                    <span>Head of Infrastructure</span>
                  </div>
                </div>
                <p>
                  The policy engine automatically approves routine API subscriptions while holding large compute agreements for human approval.
                </p>
                <div className="mr-foot">
                  <span>
                    <svg>
                      <use href="#i-thumb" />
                    </svg>
                    3
                  </span>
                  <span>
                    <svg>
                      <use href="#i-chat" />
                    </svg>
                    0
                  </span>
                </div>
              </div>
            </div>
            <div className="card-foot">
              <span className="card-icon">
                <svg>
                  <use href="#i-star" />
                </svg>
              </span>
              <h3>Cryptographic Merkle Proof</h3>
              <p>Tamper-evident logs across every transaction</p>
            </div>
          </article>

          {/* Trading */}
          <article className="bento-card card-trade" data-reveal="" style={{ '--d': '.1s' }} onPointerMove={handleGlow}>
            <div className="trade-scene" aria-hidden="true">
              <span className="trade-arc"></span>
              <div className="trade-input">
                <span className="ti-text">
                  Request Infrastructure in MUSD<i className="caret"></i>
                </span>
                <span className="ti-btn">
                  <svg>
                    <use href="#i-refresh" />
                  </svg>
                </span>
              </div>
              <span className="chip t1">MUSD Locked</span>
              <span className="chip t2">Mezo Escrow</span>
            </div>
            <div className="card-foot">
              <span className="card-icon">
                <svg>
                  <use href="#i-spark" />
                </svg>
              </span>
              <h3>Instant Settlement on Delivery</h3>
              <p>Deposit MUSD, lock escrow &amp; release upon fulfillment</p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
