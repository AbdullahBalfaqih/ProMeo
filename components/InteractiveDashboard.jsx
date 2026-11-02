'use client';

import React, { useState, useId } from 'react';

const TIME_DATA = {
  '24H': {
    points: [120, 145, 130, 185, 210, 240, 290, 310, 350, 420, 480, 498],
    labels: ['00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', 'Now'],
    volume: '$48,250 MUSD',
    peak: '$498.00',
    change: '+5.4%',
    btcEq: '0.72 BTC',
  },
  '7D': {
    points: [220, 260, 240, 320, 390, 370, 498],
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    volume: '$184,900 MUSD',
    peak: '$512.00',
    change: '+14.8%',
    btcEq: '2.84 BTC',
  },
  '30D': {
    points: [110, 160, 190, 240, 280, 310, 350, 390, 420, 460, 480, 498],
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    volume: '$557,507 MUSD',
    peak: '$557.50',
    change: '+23.5%',
    btcEq: '8.14 BTC',
  },
  '1Y': {
    points: [60, 95, 140, 180, 240, 300, 360, 410, 450, 498],
    labels: ['Q1 25', 'Q2 25', 'Q3 25', 'Q4 25', 'Q1 26', 'Q2 26', 'Q3 26', 'Q4 26', 'Current', 'Target'],
    volume: '$1,840,000 MUSD',
    peak: '$680.00',
    change: '+184%',
    btcEq: '27.5 BTC',
  },
};

const INITIAL_PROJECTS = [
  {
    id: 'p1',
    name: 'Autonomous Llama 3 70B Cluster',
    metric: '36h / week',
    category: 'Compute',
    icon: '⚡',
    progress: 45,
    timeLeft: '2 days left',
    vendor: 'Helios Cloud',
    color: '#8b5cf6',
  },
  {
    id: 'p2',
    name: 'Enterprise Mezo Vector Pipeline',
    metric: '12GB / month',
    category: 'Storage',
    icon: '🔮',
    progress: 25,
    timeLeft: '19 days left',
    vendor: 'Aether Data',
    color: '#ec4899',
  },
  {
    id: 'p3',
    name: 'High-Throughput Reasoning Fleet',
    metric: '2,500 req / day',
    category: 'Inference',
    icon: '🛡️',
    progress: 73,
    timeLeft: '7 hours left',
    vendor: 'Nexus AI',
    color: '#6366f1',
  },
];

const AGENTS = [
  { name: 'Devon Lane', role: 'Sourcing Agent', status: 'Routing RFQ', ping: '12ms', avatar: '/assets/avatars/people/wade.jpg' },
  { name: 'Robert Fox', role: 'Compute Auditor', status: 'Checking SLA', ping: '18ms', avatar: '/assets/avatars/people/robert.jpg' },
  { name: 'Wade Warren', role: 'Mezo Escrow Bot', status: 'Locking MUSD', ping: '9ms', avatar: '/assets/avatars/people/guy.jpg' },
  { name: 'Arlene McCoy', role: 'Policy Engine', status: 'Evaluating Tier', ping: '14ms', avatar: '/assets/avatars/people/brooklyn.jpg' },
];

export default function InteractiveDashboard() {
  const [timeframe, setTimeframe] = useState('30D');
  const [stakeAmount, setStakeAmount] = useState('1500');
  const [lockDuration, setLockDuration] = useState('30 days');
  const [activeTab, setActiveTab] = useState('agents');
  const [projects, setProjects] = useState(INITIAL_PROJECTS);
  const [toastMessage, setToastMessage] = useState('');
  const [selectedPin, setSelectedPin] = useState(null);

  const sparkGradientId = useId();
  const currentData = TIME_DATA[timeframe];

  // SVG chart points calculation
  const width = 640;
  const height = 220;
  const maxVal = 550;
  const minVal = 50;

  const chartPoints = currentData.points.map((val, idx) => {
    const x = (idx / (currentData.points.length - 1)) * (width - 40) + 20;
    const y = height - 20 - ((val - minVal) / (maxVal - minVal)) * (height - 60);
    return { x, y, val };
  });

  const pathD = chartPoints.reduce((acc, pt, i, arr) => {
    if (i === 0) return `M ${pt.x} ${pt.y}`;
    const prev = arr[i - 1];
    const cx = (prev.x + pt.x) / 2;
    return `${acc} C ${cx} ${prev.y}, ${cx} ${pt.y}, ${pt.x} ${pt.y}`;
  }, '');

  const areaD = `${pathD} L ${chartPoints[chartPoints.length - 1].x} ${height} L ${chartPoints[0].x} ${height} Z`;

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const handleAdvanceMilestone = (id) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          const next = Math.min(p.progress + 25, 100);
          triggerToast(`Milestone released for "${p.name}"! New progress: ${next}%`);
          return { ...p, progress: next };
        }
        return p;
      })
    );
  };

  // Radial dial calculation
  const capacityPercent = Math.min(Math.round((Number(stakeAmount || 0) / 5000) * 100), 100);
  const circumference = 2 * Math.PI * 52;
  const strokeDashoffset = circumference - (circumference * capacityPercent) / 100;

  return (
    <section className="interactive-dashboard-section" style={{ padding: '60px 0 100px', position: 'relative' }}>
      <div className="container-wide">
        {/* Section Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 16px',
            borderRadius: '99px',
            background: 'rgba(109,63,234,0.12)',
            color: 'var(--purple)',
            fontWeight: 700,
            fontSize: '13px',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: '14px',
          }}>
            <span>⚡ Interactive Protocol Station</span>
          </div>
          <h2 style={{ fontSize: '38px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em', margin: 0 }}>
            Live Escrow, Oracle &amp; Agent Terminal
          </h2>
          <p style={{ color: 'var(--ink-soft)', maxWidth: '640px', margin: '12px auto 0', fontSize: '16px', lineHeight: 1.6 }}>
            Real-time telemetry on Mezo Testnet (Chain ID 31611). Explore live MUSD escrow pools, Skip oracle feeds, and autonomous milestones.
          </p>
        </div>

        {/* TOP ROW: 3D Translucent Glass Stat Cards (Reference Image 3) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '20px',
          marginBottom: '24px',
        }}>
          {/* Card 1: Total MUSD Escrowed */}
          <div className="glass-card" style={{
            background: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(20px)',
            borderRadius: '26px',
            padding: '24px',
            boxShadow: '0 16px 36px rgba(109, 63, 234, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.9)',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Total Escrowed
                </span>
                <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--ink)', marginTop: '4px' }}>
                  $557,507
                </div>
                <span style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>MUSD Active Lock</span>
              </div>
              <img
                src="/assets/3d/glass-lock.png"
                alt="Glass Lock"
                style={{ width: '74px', height: '74px', objectFit: 'contain', filter: 'drop-shadow(0 10px 14px rgba(109,63,234,0.18))' }}
              />
            </div>
            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                background: 'rgba(16, 185, 129, 0.14)',
                color: '#059669',
                fontSize: '12px',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '99px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                ▲ +23.50%
              </span>
              <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>vs previous cycle</span>
            </div>
          </div>

          {/* Card 2: veBTC Collateral Health */}
          <div className="glass-card" style={{
            background: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(20px)',
            borderRadius: '26px',
            padding: '24px',
            boxShadow: '0 16px 36px rgba(109, 63, 234, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.9)',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  veBTC Collateral
                </span>
                <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--ink)', marginTop: '4px' }}>
                  185.4%
                </div>
                <span style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>Mezo Trove Health (ICR)</span>
              </div>
              <img
                src="/assets/3d/glass-pie.png"
                alt="Glass Pie"
                style={{ width: '74px', height: '74px', objectFit: 'contain', filter: 'drop-shadow(0 10px 14px rgba(109,63,234,0.18))' }}
              />
            </div>
            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                background: 'rgba(109, 63, 234, 0.12)',
                color: 'var(--purple)',
                fontSize: '12px',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '99px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                🛡️ Tier 3 Boosted
              </span>
              <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>5.2 BTC Locked</span>
            </div>
          </div>

          {/* Card 3: Autonomous Sourcing Speed */}
          <div className="glass-card" style={{
            background: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(20px)',
            borderRadius: '26px',
            padding: '24px',
            boxShadow: '0 16px 36px rgba(109, 63, 234, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.9)',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Agent Velocity
                </span>
                <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--ink)', marginTop: '4px' }}>
                  18,432
                </div>
                <span style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>Tasks Settled in MUSD</span>
              </div>
              <img
                src="/assets/3d/glass-rocket.png"
                alt="Glass Rocket"
                style={{ width: '74px', height: '74px', objectFit: 'contain', filter: 'drop-shadow(0 10px 14px rgba(109,63,234,0.18))' }}
              />
            </div>
            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                background: 'rgba(245, 158, 11, 0.14)',
                color: '#d97706',
                fontSize: '12px',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '99px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                ⚡ 10X Faster
              </span>
              <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>sub-second settlement</span>
            </div>
          </div>
        </div>

        {/* MIDDLE SECTION: Grid of Chart (Left 2 cols) & Action Station (Right 1 col) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)',
          gap: '24px',
          marginBottom: '24px',
        }}>
          {/* Main Chart Card (Image 1 & 3 style) */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(24px)',
            borderRadius: '28px',
            padding: '28px',
            boxShadow: '0 20px 48px rgba(109, 63, 234, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.9)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            {/* Chart Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '10px',
                    background: 'var(--grad-btn)',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: '15px',
                  }}>
                    ₿
                  </div>
                  <div>
                    <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
                      Mezo Skip Oracle &amp; Escrow Volume
                    </h3>
                    <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                      Live BTC/USD Price Feed &amp; Protocol Liquidity
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '12px' }}>
                  <span style={{ fontSize: '34px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                    $68,450.00
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#059669' }}>
                    {currentData.change} ({currentData.volume})
                  </span>
                </div>
              </div>

              {/* Timeframe selector pills */}
              <div style={{
                display: 'inline-flex',
                background: 'rgba(109, 63, 234, 0.08)',
                padding: '4px',
                borderRadius: '99px',
                gap: '4px',
              }}>
                {['24H', '7D', '30D', '1Y'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTimeframe(t)}
                    type="button"
                    style={{
                      border: 'none',
                      background: timeframe === t ? 'var(--purple)' : 'transparent',
                      color: timeframe === t ? '#fff' : 'var(--ink-soft)',
                      fontWeight: 700,
                      fontSize: '12.5px',
                      padding: '6px 14px',
                      borderRadius: '99px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: timeframe === t ? '0 4px 12px rgba(109,63,234,0.35)' : 'none',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* SVG Interactive Area Curve */}
            <div style={{ width: '100%', height: '220px', margin: '20px 0 10px', position: 'relative' }}>
              <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id={sparkGradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Grid guidelines */}
                {[50, 100, 150, 190].map((y) => (
                  <line key={y} x1="20" y1={y} x2={width - 20} y2={y} stroke="rgba(109,63,234,0.08)" strokeDasharray="4 4" />
                ))}

                {/* Area Fill */}
                <path d={areaD} fill={`url(#${sparkGradientId})`} />

                {/* Glowing stroke */}
                <path d={pathD} fill="none" stroke="#7c3aed" strokeWidth="3.5" strokeLinecap="round" />

                {/* End Point / Highlight Indicator */}
                {chartPoints.map((pt, i) => (
                  <circle
                    key={i}
                    cx={pt.x}
                    cy={pt.y}
                    r={i === chartPoints.length - 1 ? 6 : 3.5}
                    fill={i === chartPoints.length - 1 ? '#7c3aed' : '#a78bfa'}
                    stroke="#ffffff"
                    strokeWidth="2.5"
                    style={{ filter: i === chartPoints.length - 1 ? 'drop-shadow(0 0 8px #7c3aed)' : 'none' }}
                  />
                ))}
              </svg>
            </div>

            {/* Bottom Chart Stats Row (Image 1 style) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              paddingTop: '16px',
              borderTop: '1px solid rgba(84, 58, 170, 0.08)',
              textAlign: 'center',
            }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  Total Escrow
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)', marginTop: '2px' }}>
                  {currentData.volume}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  BTC Collateral Eq.
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--purple)', marginTop: '2px' }}>
                  {currentData.btcEq}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  Chain Target
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)', marginTop: '2px' }}>
                  $1,000,000 St.
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT ACTION STATION: Radial Gauge & Escrow Lock Simulator (Image 3 style) */}
          <div style={{
            background: 'linear-gradient(160deg, rgba(255,255,255,0.95) 0%, rgba(243,238,255,0.92) 100%)',
            backdropFilter: 'blur(24px)',
            borderRadius: '28px',
            padding: '26px',
            boxShadow: '0 20px 48px rgba(109, 63, 234, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.9)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
                  Lock MUSD Escrow
                </h3>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--purple)', background: 'rgba(109,63,234,0.1)', padding: '3px 8px', borderRadius: '6px' }}>
                  EIP-2612 Permit
                </span>
              </div>

              {/* Radial Arc Gauge Widget */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: '18px 0' }}>
                <div style={{ position: 'relative', width: '110px', height: '110px', flexShrink: 0 }}>
                  <svg width="110" height="110" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(109,63,234,0.12)" strokeWidth="10" />
                    <circle
                      cx="60"
                      cy="60"
                      r="52"
                      fill="none"
                      stroke="url(#gaugeGrad)"
                      strokeWidth="10"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      transform="rotate(-90 60 60)"
                      style={{ transition: 'stroke-dashoffset 0.4s ease' }}
                    />
                    <defs>
                      <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#a855f7" />
                        <stop offset="100%" stopColor="#6366f1" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink)' }}>{capacityPercent}%</span>
                    <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>Escrow Cap</span>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '12.5px', color: 'var(--muted)', marginBottom: '4px' }}>Simulated Allocation</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--ink)' }}>{stakeAmount || 0} MUSD</div>
                  <div style={{ fontSize: '11.5px', color: '#059669', fontWeight: 600 }}>Trove ICR: 185% (Safe)</div>
                </div>
              </div>

              {/* Interactive Amount Input with MAX pill */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '6px' }}>
                  Escrow Amount (MUSD)
                </label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: '#ffffff',
                  borderRadius: '14px',
                  border: '1px solid rgba(84,58,170,0.15)',
                  padding: '4px 10px',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)',
                }}>
                  <input
                    type="number"
                    value={stakeAmount}
                    onChange={(e) => setStakeAmount(e.target.value)}
                    placeholder="Enter MUSD"
                    style={{
                      border: 'none',
                      outline: 'none',
                      fontSize: '16px',
                      fontWeight: 700,
                      color: 'var(--ink)',
                      width: '100%',
                      padding: '8px 4px',
                      background: 'transparent',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setStakeAmount('5000')}
                    style={{
                      border: 'none',
                      background: 'rgba(109,63,234,0.12)',
                      color: 'var(--purple)',
                      fontWeight: 700,
                      fontSize: '11px',
                      padding: '5px 10px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                    }}
                  >
                    MAX
                  </button>
                </div>
              </div>

              {/* Lockup Milestone Duration Pills (Image 3 style) */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '6px' }}>
                  Settlement Window / Milestones
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {['14 days', '30 days', '60 days'].map((dur) => (
                    <button
                      key={dur}
                      type="button"
                      onClick={() => setLockDuration(dur)}
                      style={{
                        border: lockDuration === dur ? '1px solid var(--purple)' : '1px solid rgba(84,58,170,0.12)',
                        background: lockDuration === dur ? 'var(--purple)' : '#ffffff',
                        color: lockDuration === dur ? '#ffffff' : 'var(--ink)',
                        borderRadius: '10px',
                        padding: '8px 4px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {dur}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary Lines */}
              <div style={{
                background: 'rgba(109,63,234,0.04)',
                borderRadius: '12px',
                padding: '10px 12px',
                fontSize: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                marginBottom: '16px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                  <span>Protocol Fee (1.0%):</span>
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                    {(Number(stakeAmount || 0) * 0.01).toFixed(2)} MUSD
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                  <span>Mezo Gas (tBTC):</span>
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>&lt; 0.00002 tBTC</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                  <span>Binding Organization:</span>
                  <span style={{ fontWeight: 600, color: 'var(--purple)' }}>orgBuyer Verified ✓</span>
                </div>
              </div>
            </div>

            {/* Direct Action Button */}
            <button
              type="button"
              onClick={() => triggerToast(`Transaction broadcast to Mezo (31611): Funded ${stakeAmount} MUSD for ${lockDuration}!`)}
              style={{
                width: '100%',
                border: 'none',
                background: 'var(--grad-btn)',
                color: '#ffffff',
                padding: '14px',
                borderRadius: '16px',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(109,63,234,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'transform 0.15s ease',
              }}
            >
              <span>Lock &amp; Fund Escrow →</span>
            </button>
          </div>
        </div>

        {/* BOTTOM SECTION: Active Agreements Cards (Image 1 style) & Nodes/Collaborators (Image 1 & 2 style) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)',
          gap: '24px',
        }}>
          {/* Active Milestone Cards Grid (Image 1 "Bicycle Drill" / "Jogging Hero" style) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '19px', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
                Active Procurement Agreements &amp; Milestones
              </h3>
              <a href="/console" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--purple)', textDecoration: 'none' }}>
                View All in Console →
              </a>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '16px',
            }}>
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  style={{
                    background: '#ffffff',
                    borderRadius: '22px',
                    padding: '20px',
                    boxShadow: '0 12px 28px rgba(84, 58, 170, 0.06)',
                    border: '1px solid rgba(84, 58, 170, 0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    {/* Top Badge & Category */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '14px',
                        background: 'rgba(109,63,234,0.1)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: '20px',
                      }}>
                        {proj.icon}
                      </div>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 9px',
                        borderRadius: '99px',
                        background: 'rgba(236,72,153,0.1)',
                        color: '#db2777',
                      }}>
                        {proj.timeLeft}
                      </span>
                    </div>

                    <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)', margin: '0 0 4px' }}>
                      {proj.name}
                    </h4>
                    <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
                      {proj.metric} · {proj.vendor}
                    </div>

                    {/* Interactive Progress Bar */}
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                        <span style={{ color: 'var(--ink-soft)' }}>Milestone Progress</span>
                        <span style={{ color: 'var(--purple)', fontWeight: 800 }}>{proj.progress}%</span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: 'rgba(109,63,234,0.1)', borderRadius: '99px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${proj.progress}%`,
                            height: '100%',
                            background: 'var(--grad-btn)',
                            borderRadius: '99px',
                            transition: 'width 0.4s ease',
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <button
                    type="button"
                    onClick={() => handleAdvanceMilestone(proj.id)}
                    style={{
                      border: '1px solid rgba(109,63,234,0.25)',
                      background: 'rgba(109,63,234,0.06)',
                      color: 'var(--purple)',
                      padding: '8px 14px',
                      borderRadius: '12px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>Release Milestone +25%</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Collaborators / Agents & Live Mezo Node Map (Image 1 style) */}
          <div style={{
            background: '#ffffff',
            borderRadius: '26px',
            padding: '22px',
            boxShadow: '0 12px 32px rgba(84, 58, 170, 0.06)',
            border: '1px solid rgba(84, 58, 170, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            <div>
              {/* Segmented Switcher */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                background: 'rgba(109,63,234,0.08)',
                padding: '4px',
                borderRadius: '99px',
                marginBottom: '16px',
              }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('agents')}
                  style={{
                    border: 'none',
                    background: activeTab === 'agents' ? 'var(--purple)' : 'transparent',
                    color: activeTab === 'agents' ? '#fff' : 'var(--ink-soft)',
                    padding: '6px',
                    borderRadius: '99px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Autonomous Agents
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('nodes')}
                  style={{
                    border: 'none',
                    background: activeTab === 'nodes' ? 'var(--purple)' : 'transparent',
                    color: activeTab === 'nodes' ? '#fff' : 'var(--ink-soft)',
                    padding: '6px',
                    borderRadius: '99px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Mezo Validators
                </button>
              </div>

              {/* Agent List with Ping & Status */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
                {AGENTS.map((agt) => (
                  <div
                    key={agt.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px',
                      borderRadius: '12px',
                      transition: 'background 0.2s ease',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(109,63,234,0.05)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ position: 'relative' }}>
                        <img
                          src={agt.avatar}
                          alt={agt.name}
                          style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }}
                        />
                        <span style={{
                          position: 'absolute',
                          bottom: 0,
                          right: 0,
                          width: '9px',
                          height: '9px',
                          borderRadius: '50%',
                          background: '#10b981',
                          border: '2px solid #fff',
                        }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>{agt.name}</div>
                        <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>{agt.role}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--purple)',
                        background: 'rgba(109,63,234,0.08)',
                        padding: '2px 8px',
                        borderRadius: '6px',
                      }}>
                        {agt.ping}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Interactive Live Network Map Widget (Image 1 style) */}
            <div style={{
              background: 'radial-gradient(circle at 50% 50%, rgba(243,238,255,0.8), rgba(220,207,252,0.6))',
              borderRadius: '18px',
              padding: '14px',
              border: '1px solid rgba(109,63,234,0.15)',
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  📍 Mezo Node Map
                </span>
                <span style={{ fontSize: '10.5px', color: '#059669', fontWeight: 700 }}>● 31611 Connected</span>
              </div>

              {/* Map Canvas with Animated Pins */}
              <div style={{ height: '90px', position: 'relative', background: 'rgba(255,255,255,0.5)', borderRadius: '12px' }}>
                <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
                  <path d="M 40 30 Q 120 70 200 40 T 280 60" fill="none" stroke="rgba(109,63,234,0.2)" strokeWidth="2" strokeDasharray="3 3" />
                </svg>

                {/* Pin 1 */}
                <button
                  type="button"
                  onClick={() => setSelectedPin('Mezo Validator Node #1 (Latency 12ms, Block 16364920)')}
                  style={{
                    position: 'absolute',
                    top: '20px',
                    left: '35px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                  title="Node 1"
                >
                  <span style={{
                    display: 'block',
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: '#f97316',
                    boxShadow: '0 0 0 4px rgba(249,115,22,0.25)',
                    color: '#fff',
                    fontSize: '10px',
                    fontWeight: 800,
                    lineHeight: '18px',
                    textAlign: 'center',
                  }}>
                    V1
                  </span>
                </button>

                {/* Pin 2 */}
                <button
                  type="button"
                  onClick={() => setSelectedPin('Agent Sourcing Cluster (32 Tasks Active, 0.4s Negotiation)')}
                  style={{
                    position: 'absolute',
                    bottom: '22px',
                    right: '45px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                  title="Cluster 2"
                >
                  <span style={{
                    display: 'block',
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: 'var(--purple)',
                    boxShadow: '0 0 0 4px rgba(109,63,234,0.25)',
                    color: '#fff',
                    fontSize: '10px',
                    fontWeight: 800,
                    lineHeight: '18px',
                    textAlign: 'center',
                  }}>
                    A2
                  </span>
                </button>
              </div>

              {selectedPin ? (
                <div style={{ fontSize: '11px', color: 'var(--purple)', fontWeight: 600, marginTop: '8px', textAlign: 'center' }}>
                  {selectedPin}
                </div>
              ) : (
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px', textAlign: 'center' }}>
                  Click pins to inspect live Mezo block latency
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Global Floating Toast Feedback */}
        {toastMessage && (
          <div style={{
            position: 'fixed',
            bottom: '28px',
            right: '28px',
            background: 'rgba(36, 27, 69, 0.95)',
            color: '#ffffff',
            padding: '14px 22px',
            borderRadius: '16px',
            fontSize: '14px',
            fontWeight: 600,
            boxShadow: '0 16px 36px rgba(0,0,0,0.25)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            border: '1px solid rgba(255,255,255,0.15)',
            backdropFilter: 'blur(12px)',
          }}>
            <span style={{ fontSize: '18px' }}>⚡</span>
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    </section>
  );
}
