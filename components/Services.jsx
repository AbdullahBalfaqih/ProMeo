'use client';

import { useState } from 'react';
import { serviceOrder, services } from '@/lib/data';
import { Eyebrow } from '@/components/ui/Atoms';
import { useAuth } from '@/components/Web3Provider';

export default function Services() {
  const { handleGetStarted, isAuthenticated } = useAuth();
  const [activeKey, setActiveKey] = useState('custody');
  // `tick` forces the copy block to remount so the swap-in animation replays,
  // exactly like the class re-flow trick used previously.
  const [tick, setTick] = useState(0);
  const active = services[activeKey];

  const selectTab = (key) => {
    setActiveKey(key);
    setTick((value) => value + 1);
  };

  return (
    <section className="services section" id="services">
      <div className="section-glow" aria-hidden="true"></div>
      <div className="container">
        <div className="section-head" data-reveal="">
          <Eyebrow label="Services" />
          <h2>Autonomous Procurement Engine</h2>
        </div>

        <div className="tabs" role="tablist" aria-label="Services" data-reveal="">
          {serviceOrder.map((key) => {
            const service = services[key];
            const isActive = key === activeKey;
            return (
              <button
                key={key}
                className={isActive ? 'tab active' : 'tab'}
                role="tab"
                aria-selected={isActive}
                data-tab={key}
                type="button"
                onClick={() => selectTab(key)}
              >
                <svg className="tab-ic">
                  <use href={`#${service.tabIcon}`} />
                </svg>
                <span>{service.tab}</span>
              </button>
            );
          })}
        </div>

        <div className="service-panel" data-reveal="" style={{ '--d': '.08s' }}>
          <div className={tick ? 'service-copy swap-in' : 'service-copy'} key={`${activeKey}-${tick}`}>
            <h3 id="serviceTitle">{active.title}</h3>
            <p id="serviceDesc">{active.desc}</p>
            <ul className="checklist" id="serviceList">
              {active.items.map((item) => (
                <li key={item}>
                  <span className="ck">
                    <svg>
                      <use href="#i-check" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <button
              className="btn btn-primary service-btn"
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
          <div className="scene" aria-hidden="true">
            <div className="scene-grid"></div>
            <div className="scene-rings">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div className="scene-core">
              <span className="scene-ic" data-scene-icon="">
                <svg key={active.icon}>
                  <use href={`#${active.icon}`} />
                </svg>
              </span>
            </div>
            <span className="scene-node n1"></span>
            <span className="scene-node n2"></span>
            <span className="scene-node n3"></span>
            <span className="scene-node n4"></span>
            <span className="scene-line"></span>
            <span className="scene-chip chip-a">Encrypted</span>
            <span className="scene-chip chip-b">On-chain</span>
            <span className="scene-chip chip-c">Verified</span>
            <span className="scene-bar">
              <i></i>
              <i></i>
              <i></i>
              <i></i>
              <i></i>
              <i></i>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
