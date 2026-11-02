'use client';

import { useRef } from 'react';
import { coinsLeft, coinsRight } from '@/lib/data';
import { Eyebrow } from '@/components/ui/Atoms';
import { useAuth } from '@/components/Web3Provider';

export default function Hero() {
  const heroRef = useRef(null);
  const spotRef = useRef(null);
  const { isAuthenticated, handleGetStarted, isAuthenticating } = useAuth();

  /* soft spotlight follows the cursor (desktop / fine pointers only) */
  const onPointerMove = (event) => {
    if (!spotRef.current || !heroRef.current) return;
    if (!window.matchMedia('(pointer:fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = heroRef.current.getBoundingClientRect();
    spotRef.current.style.left = `${event.clientX - rect.left}px`;
    spotRef.current.style.top = `${event.clientY - rect.top - 380}px`;
  };

  return (
    <section className="hero" id="home" ref={heroRef} onPointerMove={onPointerMove}>
      <div className="hero-bg" aria-hidden="true">
        <span className="hero-spot" ref={spotRef}></span>
      </div>
      <div className="container hero-inner">
        <div className="eyebrow" data-reveal="">
          <span className="line"></span>
          <svg className="spark">
            <use href="#i-spark" />
          </svg>
          <span>Autonomous AI Network</span>
          <span className="line"></span>
        </div>
        <h1 data-reveal="" style={{ '--d': '.05s' }}>
          Autonomous AI Procurement
          <br />– Powered by Mezo &amp; MUSD
        </h1>
        <p className="hero-sub" data-reveal="" style={{ '--d': '.12s' }}>
          Empower AI agents to discover, negotiate, and settle enterprise compute and services with on-chain MUSD escrow and verifiable Merkle audits.
        </p>
        <div className="hero-actions" data-reveal="" style={{ '--d': '.18s', display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            className="btn btn-primary"
            onClick={handleGetStarted}
            type="button"
            id="heroGetStartedBtn"
            style={{ cursor: 'pointer' }}
          >
            <span className="orb">
              <svg>
                <use href="#i-spark" />
              </svg>
            </span>
            <span>
              {isAuthenticating
                ? 'Connecting…'
                : isAuthenticated
                ? 'Open Dashboard →'
                : 'Connect & Enter'}
            </span>
          </button>

          <a
            className="btn btn-secondary"
            href="/console"
            id="heroConsoleBtn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '12px 24px',
              fontSize: '15px',
              fontWeight: 600,
              borderRadius: '99px',
              background: 'rgba(255, 255, 255, 0.85)',
              color: 'var(--ink)',
              border: '1px solid rgba(84, 58, 170, 0.2)',
              textDecoration: 'none',
              backdropFilter: 'blur(10px)',
              cursor: 'pointer',
            }}
          >
            <span>Launch Live Console →</span>
          </a>
        </div>
      </div>

      <div className="orbit" aria-hidden="true">
        <div className="orbit-glow"></div>
        <div className="orbit-beam"></div>
        <div className="orbit-flare"></div>
        <div className="orbit-line"></div>
        <div className="coin-track">
          {coinsLeft.map((coin, i) => (
            <span className={`coin ${coin.size}`} key={`l-${i}`}>
              <img src={coin.src} alt={coin.alt || 'Crypto'} />
            </span>
          ))}
          <div className="hero-core">
            <span className="core-face">
              <img src="/assets/logo.png" alt="ProMeo" />
            </span>
          </div>
          {coinsRight.map((coin, i) => (
            <span className={`coin ${coin.size}`} key={`r-${i}`}>
              <img src={coin.src} alt={coin.alt || 'Crypto'} />
            </span>
          ))}
        </div>
        <div className="hero-stars"></div>
      </div>
    </section>
  );
}
