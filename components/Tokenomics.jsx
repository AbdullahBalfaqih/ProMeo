'use client';

import { useState } from 'react';
import { tokenLabels, tokenSegments } from '@/lib/data';
import { Eyebrow } from '@/components/ui/Atoms';

export default function Tokenomics() {
  const [hovered, setHovered] = useState(null);

  return (
    <section className="tokenomics section" id="token">
      <div className="container-wide">
        <div className="section-head" data-reveal="">
          <Eyebrow label="Settlement" />
          <h2>Built on Autonomous MUSD Settlement</h2>
        </div>

        <div className="donut-stage" data-reveal="" style={{ '--d': '.08s' }}>
          {tokenLabels.map((label) => {
            const isHot = hovered === label.name;
            return (
              <span
                key={label.name}
                className={`token-label ${label.cls}`}
                style={
                  isHot
                    ? { borderColor: 'rgba(200,180,255,.6)', background: 'rgba(139,92,246,.18)' }
                    : undefined
                }
              >
                <b>{label.name}:</b>
                <em>{label.pct}</em>
              </span>
            );
          })}
          <span className="token-line l1"></span>
          <span className="token-line l2"></span>
          <span className="token-line r1"></span>
          <span className="token-line r2"></span>
          <div className="donut">
            <svg
              viewBox="0 0 460 460"
              role="img"
              aria-label="Settlement distribution on Mezo Blockchain in MUSD"
            >
              <g transform="rotate(-90 230 230)">
                {tokenSegments.map((segment) => (
                  <circle
                    key={segment.name}
                    className={`seg ${segment.cls}`}
                    cx="230"
                    cy="230"
                    r="150"
                    pathLength="100"
                    strokeDasharray={segment.dash}
                    strokeDashoffset={segment.offset}
                    data-name={segment.name}
                    data-pct={segment.pct}
                    onMouseEnter={() => setHovered(segment.name)}
                    onMouseLeave={() => setHovered(null)}
                  />
                ))}
              </g>
            </svg>
            <div className="donut-center">
              <img src="/assets/logo.png" alt="ProMeo" />
              <span className="donut-hint">
                <b>100%</b>
                <em>Verified on Mezo</em>
              </span>
            </div>
          </div>
          <div className="token-legend">
            <span>
              <i className="k1"></i>AI Sourcing 25%
            </span>
            <span>
              <i className="k2"></i>GPU Compute 25%
            </span>
            <span>
              <i className="k3"></i>Escrow Reserve 20%
            </span>
            <span>
              <i className="k4"></i>Mezo Liquidity 15%
            </span>
            <span>
              <i className="k5"></i>Audits &amp; Security 10%
            </span>
            <span>
              <i className="k6"></i>Governance 5%
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
