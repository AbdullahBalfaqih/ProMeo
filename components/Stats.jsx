'use client';

import { useEffect, useRef } from 'react';
import { growthBars, partnerBars, stats } from '@/lib/data';
import { MiniEyebrow } from '@/components/ui/Atoms';
import { useAuth } from '@/components/Web3Provider';

export default function Stats() {
  const { handleGetStarted, isAuthenticated } = useAuth();
  const countersRef = useRef([]);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const counters = countersRef.current.filter(Boolean);

    const animate = (el) => {
      const target = Number(el.dataset.count || 0);
      const suffix = el.dataset.suffix || '';
      if (prefersReduced) {
        el.textContent = target + suffix;
        return;
      }
      const duration = 1500;
      const start = performance.now();
      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              animate(entry.target);
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.5 }
      );
      counters.forEach((el) => {
        el.textContent = '0' + (el.dataset.suffix || '');
        io.observe(el);
      });
      return () => io.disconnect();
    }

    counters.forEach(animate);
  }, []);

  return (
    <section className="stats section">
      <div className="container-wide">
        <div className="stats-grid">
          <article className="stats-left" data-reveal="">
            <MiniEyebrow label="Procurement" />
            <h2 className="stats-h">Source. Approve. Settle — All On Mezo Blockchain</h2>
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
            <div className="partner-scene" aria-hidden="true">
              <div className="bars">
                {partnerBars.map((height, i) => (
                  <span key={i} style={{ '--h': height }}></span>
                ))}
              </div>
              <div className="partner-chips">
                <span className="p-chip">
                  <img src="/assets/ui/cloudwatch.svg" alt="CloudWatch" />
                </span>
                <span className="p-chip">
                  <img src="/assets/ui/partner.svg" alt="Partner" />
                </span>
                <span className="p-chip p-text">
                  <b>Mezo</b>
                  <em>Testnet 31611</em>
                </span>
              </div>
            </div>
          </article>

          <article className="stats-right" data-reveal="" style={{ '--d': '.08s' }}>
            <div className="clients-badge">
              <img src="/assets/avatars/people/ronald.jpg" alt="" />
              <span>500+ Active AI Agents</span>
            </div>
            <div className="stat-row">
              {stats.map((stat, i) => (
                <div className="stat" key={stat.label}>
                  <b
                    className="count"
                    data-count={stat.value}
                    data-suffix={stat.suffix}
                    ref={(node) => {
                      countersRef.current[i] = node;
                    }}
                  >
                    {stat.value}
                    {stat.suffix}
                  </b>
                  <span>{stat.label}</span>
                </div>
              ))}
            </div>
            <div className="growth-chart" aria-hidden="true">
              {growthBars.map((bar) => (
                <div className="g-bar" key={bar.pct} style={{ '--h': bar.height }}>
                  <span className="g-ic">
                    <img src={bar.icon} alt="" />
                  </span>
                  <span className="g-pct">{bar.pct}</span>
                </div>
              ))}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
