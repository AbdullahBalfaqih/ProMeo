'use client';

import { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { balances, tools } from '@/lib/data';
import { MiniEyebrow } from '@/components/ui/Atoms';
import { useAuth } from '@/components/Web3Provider';

// 4 sets of balances ensure seamless infinite looping across any screen width
const tickerItems = [...balances, ...balances, ...balances, ...balances];

export default function Tools() {
  const { handleGetStarted, isAuthenticated } = useAuth();
  const trackRef = useRef(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let tween;

    const setupMarquee = () => {
      if (tween) tween.kill();

      const children = track.children;
      let singleSetWidth = 0;
      for (let i = 0; i < balances.length && i < children.length; i++) {
        singleSetWidth += children[i].offsetWidth + 12; // 12px gap
      }

      if (singleSetWidth <= 0) {
        singleSetWidth = track.scrollWidth / 4;
      }

      // Moves from Left to Right: starts at -singleSetWidth and slides to 0 continuously
      tween = gsap.fromTo(
        track,
        { x: -singleSetWidth },
        {
          x: 0,
          duration: Math.max(16, singleSetWidth / 60),
          ease: 'none',
          repeat: -1,
        }
      );
    };

    const timer = setTimeout(setupMarquee, 60);
    window.addEventListener('resize', setupMarquee);

    return () => {
      clearTimeout(timer);
      if (tween) tween.kill();
      window.removeEventListener('resize', setupMarquee);
    };
  }, []);

  return (
    <section className="tools section" id="features">
      <div className="ticker" aria-label="Live balances">
        <div
          className="ticker-track"
          id="tickerTrack"
          ref={trackRef}
          style={{ willChange: 'transform' }}
        >
          {tickerItems.map((item, i) => (
            <span className="balance-pill" key={`${item.name}-${i}`}>
              <span className="bp-txt">
                <em>{item.name}</em>
                <b>
                  {item.amount} <small>{item.unit}</small>
                </b>
                <i>{item.usd}</i>
              </span>
              <span className="bp-coin">
                <img src={item.icon} alt="" />
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="container-wide">
        <div className="tools-grid">
          <div className="tools-copy" data-reveal="">
            <MiniEyebrow label="Features" leadingLine trailingLine />
            <h2>Core Capabilities of ProMeo APN</h2>
            <p>
              Empower your organization with autonomous procurement agents, programmatic MUSD escrow on Mezo, strict budget policies, and Merkle-verified audit integrity.
            </p>
            <button
              className="btn btn-primary"
              onClick={handleGetStarted}
              type="button"
              style={{ cursor: 'pointer' }}
            >
              <span className="orb">
                <svg>
                  <use href="#i-spark" />
                </svg>
              </span>
              <span>{isAuthenticated ? 'Open Dashboard →' : 'Get Started'}</span>
            </button>
          </div>

          <div className="tools-emblem" aria-hidden="true" data-reveal="" style={{ '--d': '.1s' }}>
            <span className="te-glow"></span>
            <span className="te-particles"></span>
            <img src="/assets/logo.png" alt="ProMeo" />
          </div>

          <div className="tools-list" data-reveal="" style={{ '--d': '.16s' }}>
            {tools.map((tool) => (
              <div className="tool-item" data-hot={tool.hot ? '' : undefined} key={tool.label}>
                <span className="ti">
                  <svg>
                    <use href={`#${tool.icon}`} />
                  </svg>
                </span>
                {tool.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
