import { useState, useEffect, useRef, useCallback } from "react";

// ─── SVG Logo Component (matches your TradingSmart.ai brain+chart logo) ───
const TradingSmartLogo = ({ size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="logoGrad" x1="0" y1="0" x2="100" y2="100">
        <stop offset="0%" stopColor="#38bdf8" />
        <stop offset="100%" stopColor="#06b6d4" />
      </linearGradient>
      <filter id="logoGlow">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
    <g filter="url(#logoGlow)">
      {/* Brain outline */}
      <path d="M20 55 C20 30, 35 15, 50 15 C55 15, 58 18, 55 25 C52 32, 48 30, 45 35 C42 40, 46 45, 50 45 C54 45, 52 40, 55 38 C58 36, 62 38, 60 42 C58 46, 54 48, 52 52 C50 56, 48 60, 45 62 C42 64, 38 62, 35 58 C32 54, 28 56, 25 58 C22 60, 20 58, 20 55Z"
        stroke="url(#logoGrad)" strokeWidth="2" fill="none" />
      {/* Circuit lines */}
      <circle cx="30" cy="35" r="2" fill="#38bdf8" />
      <circle cx="40" cy="28" r="2" fill="#38bdf8" />
      <circle cx="35" cy="45" r="1.5" fill="#06b6d4" />
      <circle cx="45" cy="38" r="1.5" fill="#06b6d4" />
      <line x1="30" y1="35" x2="40" y2="28" stroke="#38bdf8" strokeWidth="1" />
      <line x1="40" y1="28" x2="45" y2="38" stroke="#38bdf8" strokeWidth="1" />
      <line x1="35" y1="45" x2="30" y2="35" stroke="#06b6d4" strokeWidth="1" />
      {/* Candlesticks */}
      <rect x="55" y="50" width="4" height="20" rx="1" fill="#38bdf8" opacity="0.7" />
      <rect x="62" y="42" width="4" height="25" rx="1" fill="#38bdf8" opacity="0.8" />
      <rect x="69" y="35" width="4" height="30" rx="1" fill="#06b6d4" opacity="0.9" />
      <rect x="76" y="28" width="4" height="35" rx="1" fill="#06b6d4" />
      <line x1="57" y1="48" x2="57" y2="72" stroke="#38bdf8" strokeWidth="1" opacity="0.5" />
      <line x1="64" y1="40" x2="64" y2="69" stroke="#38bdf8" strokeWidth="1" opacity="0.5" />
      <line x1="71" y1="33" x2="71" y2="67" stroke="#06b6d4" strokeWidth="1" opacity="0.5" />
      <line x1="78" y1="25" x2="78" y2="65" stroke="#06b6d4" strokeWidth="1" opacity="0.5" />
      {/* Trend arrow */}
      <path d="M52 68 Q65 40, 82 22" stroke="url(#logoGrad)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <polygon points="82,22 85,28 78,26" fill="#38bdf8" />
    </g>
  </svg>
);

// ─── Styles ───
const styles = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@300;400;500;600;700&family=Orbitron:wght@400;500;600;700;800;900&display=swap');

:root {
  --bg-primary: #06080d;
  --bg-secondary: #0a0e17;
  --bg-card: rgba(12, 17, 28, 0.85);
  --border-color: rgba(56, 189, 248, 0.08);
  --border-glow: rgba(56, 189, 248, 0.2);
  --accent-cyan: #38bdf8;
  --accent-blue: #6366f1;
  --accent-purple: #a78bfa;
  --accent-green: #34d399;
  --accent-red: #f43f5e;
  --accent-orange: #fb923c;
  --accent-yellow: #fbbf24;
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted: #475569;
}
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Inter',sans-serif; background:var(--bg-primary); color:var(--text-primary); min-height:100vh; overflow-x:hidden; }
.bg-grid { position:fixed; inset:0; z-index:0; pointer-events:none;
  background-image: linear-gradient(rgba(56,189,248,0.03) 1px,transparent 1px), linear-gradient(90deg,rgba(56,189,248,0.03) 1px,transparent 1px);
  background-size:60px 60px; animation:gridMove 20s linear infinite; }
@keyframes gridMove { to { background-position:60px 60px; } }
.bg-orbs { position:fixed; inset:0; z-index:0; pointer-events:none; overflow:hidden; }
.orb { position:absolute; border-radius:50%; filter:blur(80px); opacity:0.12; animation:orbFloat 15s ease-in-out infinite; }
.orb-1 { width:600px; height:600px; background:var(--accent-cyan); top:-10%; left:-5%; }
.orb-2 { width:500px; height:500px; background:var(--accent-purple); top:50%; right:-10%; animation-delay:-5s; }
.orb-3 { width:400px; height:400px; background:var(--accent-blue); bottom:-10%; left:30%; animation-delay:-10s; }
@keyframes orbFloat { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(30px,-40px) scale(1.05)} 66%{transform:translate(-20px,20px) scale(0.95)} }
.scanlines { position:fixed; inset:0; z-index:1; pointer-events:none;
  background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.03) 2px,rgba(0,0,0,0.03) 4px); }
.app { position:relative; z-index:2; min-height:100vh; }

/* NAV */
.topnav { position:sticky; top:0; z-index:100; display:flex; align-items:center; justify-content:space-between;
  padding:0 32px; height:64px; background:rgba(6,8,13,0.85); backdrop-filter:blur(20px) saturate(1.8);
  border-bottom:1px solid var(--border-color); }
.logo { display:flex; align-items:center; gap:12px; font-family:'Orbitron',sans-serif; font-weight:800;
  font-size:17px; letter-spacing:2px; color:var(--accent-cyan); text-shadow:0 0 20px rgba(56,189,248,0.4); }
.logo-icon { width:40px; height:40px; border-radius:10px;
  background:linear-gradient(135deg,rgba(56,189,248,0.15),rgba(6,182,212,0.15));
  display:flex; align-items:center; justify-content:center;
  box-shadow:0 0 20px rgba(56,189,248,0.3); animation:logoPulse 3s ease-in-out infinite;
  border:1px solid rgba(56,189,248,0.2); }
@keyframes logoPulse { 0%,100%{box-shadow:0 0 20px rgba(56,189,248,0.3)} 50%{box-shadow:0 0 40px rgba(56,189,248,0.6)} }
.logo-text { display:flex; flex-direction:column; line-height:1.1; }
.logo-text-main { font-size:17px; }
.logo-text-sub { font-size:8px; letter-spacing:4px; color:var(--text-muted); font-weight:500; }
.nav-status { display:flex; align-items:center; gap:24px; }
.status-item { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--text-secondary); font-family:'JetBrains Mono',monospace; }
.status-dot { width:8px; height:8px; border-radius:50%; animation:pulse 2s ease-in-out infinite; }
.status-dot.live { background:var(--accent-green); box-shadow:0 0 10px var(--accent-green); }
.status-dot.warn { background:var(--accent-yellow); box-shadow:0 0 10px var(--accent-yellow); }
@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }
.nav-time { font-family:'JetBrains Mono',monospace; font-size:13px; color:var(--accent-cyan); letter-spacing:1px; }

/* MAIN */
.main { padding:24px 32px 48px; max-width:1800px; margin:0 auto; }

/* HERO */
.hero { display:grid; grid-template-columns:1fr 1fr 1fr; gap:20px; margin-bottom:24px; }
.hero-card { background:var(--bg-card); border:1px solid var(--border-color); border-radius:16px; padding:24px;
  backdrop-filter:blur(12px); transition:all 0.4s cubic-bezier(0.4,0,0.2,1); position:relative; overflow:hidden; }
.hero-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px;
  background:linear-gradient(90deg,transparent,var(--accent-cyan),transparent); opacity:0; transition:opacity 0.4s; }
.hero-card:hover { border-color:var(--border-glow); transform:translateY(-2px); }
.hero-card:hover::before { opacity:1; }
.hero-label { font-size:11px; text-transform:uppercase; letter-spacing:2px; color:var(--text-muted); margin-bottom:8px; font-weight:600; }
.hero-value { font-family:'Orbitron',sans-serif; font-size:30px; font-weight:700; margin-bottom:4px; }
.hero-value.positive { color:var(--accent-green); }
.hero-value.neutral { color:var(--text-primary); }
.hero-change { font-size:13px; font-family:'JetBrains Mono',monospace; display:flex; align-items:center; gap:4px; }
.hero-change.up { color:var(--accent-green); }

/* STATS ROW */
.stats-row { display:grid; grid-template-columns:repeat(5,1fr); gap:16px; margin-bottom:24px; }
.stat-card { background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:16px 20px; backdrop-filter:blur(12px); }
.stat-label { font-size:10px; text-transform:uppercase; letter-spacing:2px; color:var(--text-muted); font-weight:600; margin-bottom:6px; }
.stat-value { font-family:'Orbitron',sans-serif; font-size:20px; font-weight:700; }
.progress-container { margin-top:8px; }
.progress-bar-bg { height:6px; border-radius:3px; background:rgba(255,255,255,0.05); overflow:hidden; }
.progress-bar-fill { height:100%; border-radius:3px; transition:width 1s ease-out; }
.progress-label { display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); margin-bottom:4px; }

/* CARDS */
.card { background:var(--bg-card); border:1px solid var(--border-color); border-radius:16px; padding:24px;
  backdrop-filter:blur(12px); transition:all 0.4s cubic-bezier(0.4,0,0.2,1); position:relative; overflow:hidden; }
.card:hover { border-color:var(--border-glow); }
.card-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; }
.card-title { font-size:13px; text-transform:uppercase; letter-spacing:2px; color:var(--text-secondary); font-weight:600;
  display:flex; align-items:center; gap:8px; }
.card-title-icon { width:28px; height:28px; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; font-size:14px; }
.card-badge { font-size:11px; padding:4px 10px; border-radius:20px; font-family:'JetBrains Mono',monospace; font-weight:500; }
.badge-green { background:rgba(52,211,153,0.1); color:var(--accent-green); border:1px solid rgba(52,211,153,0.2); }
.badge-blue { background:rgba(56,189,248,0.1); color:var(--accent-cyan); border:1px solid rgba(56,189,248,0.2); }
.badge-yellow { background:rgba(251,191,36,0.1); color:var(--accent-yellow); border:1px solid rgba(251,191,36,0.2); }

/* DASHBOARD GRID */
.dashboard { display:grid; grid-template-columns:1fr 1fr; gap:20px; }

/* ROBOT PANEL */
.robot-panel { grid-column:1/-1; }
.robot-grid { display:grid; grid-template-columns:260px 1fr 260px; gap:24px; align-items:center; }
.robot-avatar { display:flex; flex-direction:column; align-items:center; gap:16px; }
.robot-ring { width:140px; height:140px; border-radius:50%; position:relative; display:flex; align-items:center; justify-content:center; }
.robot-ring::before { content:''; position:absolute; inset:0; border-radius:50%;
  border:2px solid transparent; border-top-color:var(--accent-cyan); border-right-color:var(--accent-blue);
  animation:robotSpin 3s linear infinite; }
.robot-ring::after { content:''; position:absolute; inset:6px; border-radius:50%;
  border:2px solid transparent; border-bottom-color:var(--accent-purple); border-left-color:var(--accent-cyan);
  animation:robotSpin 2s linear infinite reverse; }
@keyframes robotSpin { to{transform:rotate(360deg)} }
.robot-face { width:100px; height:100px; border-radius:50%;
  background:radial-gradient(circle at 30% 30%,#1e293b,#0f172a);
  display:flex; align-items:center; justify-content:center; font-size:42px; z-index:2;
  box-shadow:inset 0 0 30px rgba(56,189,248,0.1),0 0 40px rgba(56,189,248,0.1); }
.robot-name { font-family:'Orbitron',sans-serif; font-size:14px; font-weight:700; color:var(--accent-cyan); letter-spacing:3px; }
.robot-status-text { font-size:12px; color:var(--accent-green); font-family:'JetBrains Mono',monospace; display:flex; align-items:center; gap:6px; }
.robot-metrics { display:flex; flex-direction:column; gap:10px; }
.metric-row { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-radius:10px;
  background:rgba(15,23,42,0.5); border:1px solid var(--border-color); }
.metric-label { font-size:12px; color:var(--text-secondary); }
.metric-value { font-family:'JetBrains Mono',monospace; font-size:14px; font-weight:600; }
.robot-actions { display:flex; flex-direction:column; gap:12px; }

/* KILL SWITCH */
.kill-switch-container { display:flex; flex-direction:column; align-items:center; gap:14px; }
.kill-switch { width:150px; height:150px; border-radius:50%; border:none; cursor:pointer;
  background:radial-gradient(circle at 40% 35%,#4a1520,#1a0508);
  box-shadow:0 0 0 4px rgba(244,63,94,0.15),0 0 30px rgba(244,63,94,0.1),
    inset 0 -4px 12px rgba(0,0,0,0.5),inset 0 4px 12px rgba(244,63,94,0.1);
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px;
  transition:all 0.3s; position:relative; font-family:'Orbitron',sans-serif; }
.kill-switch::before { content:''; position:absolute; inset:-8px; border-radius:50%;
  border:2px dashed rgba(244,63,94,0.2); animation:killRotate 10s linear infinite; }
@keyframes killRotate { to{transform:rotate(360deg)} }
.kill-switch:hover { box-shadow:0 0 0 4px rgba(244,63,94,0.3),0 0 60px rgba(244,63,94,0.3),
  inset 0 -4px 12px rgba(0,0,0,0.5),inset 0 4px 12px rgba(244,63,94,0.2); transform:scale(1.03); }
.kill-switch:active { transform:scale(0.97); }
.kill-switch.active { background:radial-gradient(circle at 40% 35%,#dc2626,#7f1d1d);
  box-shadow:0 0 0 4px rgba(244,63,94,0.5),0 0 80px rgba(244,63,94,0.4),
    inset 0 -4px 12px rgba(0,0,0,0.5),inset 0 4px 12px rgba(255,255,255,0.1); }
.kill-icon { font-size:34px; }
.kill-text { color:#fca5a5; font-size:9px; letter-spacing:3px; font-weight:700; }
.kill-label { font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--text-muted); text-align:center; line-height:1.5; }
.kill-label span { color:var(--accent-red); font-weight:600; }

/* BUTTONS */
.action-btn { padding:12px 20px; border-radius:10px; border:1px solid; font-family:'Inter',sans-serif;
  font-size:13px; font-weight:600; cursor:pointer; transition:all 0.3s;
  display:flex; align-items:center; justify-content:center; gap:8px; background:transparent; }
.btn-primary { background:linear-gradient(135deg,rgba(56,189,248,0.15),rgba(99,102,241,0.15));
  border-color:rgba(56,189,248,0.3); color:var(--accent-cyan); }
.btn-primary:hover { background:linear-gradient(135deg,rgba(56,189,248,0.25),rgba(99,102,241,0.25));
  box-shadow:0 0 20px rgba(56,189,248,0.15); }
.btn-warning { background:rgba(251,191,36,0.1); border-color:rgba(251,191,36,0.3); color:var(--accent-yellow); }
.btn-warning:hover { background:rgba(251,191,36,0.2); }

/* STRATEGY TABLE */
.strategy-table { width:100%; border-collapse:separate; border-spacing:0; }
.strategy-table th { font-size:10px; text-transform:uppercase; letter-spacing:2px; color:var(--text-muted);
  font-weight:600; padding:8px 12px; text-align:left; border-bottom:1px solid var(--border-color); }
.strategy-table td { padding:12px; font-size:13px; border-bottom:1px solid rgba(56,189,248,0.04);
  font-family:'JetBrains Mono',monospace; vertical-align:middle; }
.strategy-table tbody tr { transition:background 0.2s; }
.strategy-table tbody tr:hover { background:rgba(56,189,248,0.03); }
.strategy-name { font-family:'Inter',sans-serif; font-weight:600; font-size:13px; color:var(--text-primary); }
.strategy-tag { display:inline-block; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600; letter-spacing:1px; }
.tag-active { background:rgba(52,211,153,0.12); color:var(--accent-green); }
.tag-paused { background:rgba(251,191,36,0.12); color:var(--accent-yellow); }

/* ORDER FEED */
.order-feed { display:flex; flex-direction:column; gap:8px; max-height:380px; overflow-y:auto; }
.order-feed::-webkit-scrollbar { width:4px; }
.order-feed::-webkit-scrollbar-track { background:transparent; }
.order-feed::-webkit-scrollbar-thumb { background:var(--border-glow); border-radius:4px; }
.order-item { display:grid; grid-template-columns:44px 1fr auto; gap:12px; align-items:center; padding:12px;
  border-radius:10px; background:rgba(15,23,42,0.4); border:1px solid var(--border-color);
  transition:all 0.3s; animation:orderSlide 0.5s ease-out; }
@keyframes orderSlide { from{opacity:0;transform:translateX(-10px)} to{opacity:1;transform:translateX(0)} }
.order-item:hover { border-color:var(--border-glow); background:rgba(15,23,42,0.6); }
.order-icon { width:44px; height:44px; border-radius:10px; display:flex; align-items:center; justify-content:center;
  font-size:18px; font-weight:700; }
.order-icon.buy { background:rgba(52,211,153,0.1); color:var(--accent-green); }
.order-icon.sell { background:rgba(244,63,94,0.1); color:var(--accent-red); }
.order-pair { font-weight:600; font-size:14px; }
.order-meta { font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono',monospace; }
.order-pnl { font-family:'JetBrains Mono',monospace; font-size:14px; font-weight:600; text-align:right; }
.order-time { font-size:10px; color:var(--text-muted); font-family:'JetBrains Mono',monospace; text-align:right; }

/* CHART */
.chart-area { position:relative; height:260px; margin-top:8px; }
.chart-canvas { width:100%; height:100%; display:block; }

/* RISK GAUGE */
.risk-gauge { display:flex; align-items:center; gap:20px; margin-top:12px; }
.gauge-score { font-family:'Orbitron',sans-serif; font-size:28px; font-weight:700; }
.gauge-label-text { font-size:11px; color:var(--text-muted); }

/* ACTIVITY LOG */
.activity-log { grid-column:1/-1; }
.log-entries { display:flex; flex-direction:column; gap:4px; max-height:180px; overflow-y:auto;
  font-family:'JetBrains Mono',monospace; font-size:12px; background:rgba(0,0,0,0.3);
  border-radius:10px; padding:16px; border:1px solid var(--border-color); }
.log-entries::-webkit-scrollbar { width:4px; }
.log-entries::-webkit-scrollbar-track { background:transparent; }
.log-entries::-webkit-scrollbar-thumb { background:var(--border-glow); border-radius:4px; }
.log-entry { display:flex; gap:12px; padding:4px 0; line-height:1.6; }
.log-time { color:var(--text-muted); min-width:80px; }
.log-type { min-width:60px; font-weight:600; font-size:10px; text-transform:uppercase; letter-spacing:1px; padding:2px 0; }
.log-type.info { color:var(--accent-cyan); }
.log-type.exec { color:var(--accent-green); }
.log-type.warn { color:var(--accent-yellow); }
.log-type.error { color:var(--accent-red); }
.log-msg { color:var(--text-secondary); }

/* SPARKLINE */
.sparkline-svg { display:block; width:100%; height:40px; margin-top:12px; }

/* MY STRATEGY PANEL */
.my-strategy-panel { grid-column:1/-1; }
.strategy-builder { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
.strategy-form { display:flex; flex-direction:column; gap:14px; }
.form-group { display:flex; flex-direction:column; gap:6px; }
.form-label { font-size:11px; text-transform:uppercase; letter-spacing:2px; color:var(--text-muted); font-weight:600; }
.form-input, .form-select, .form-textarea {
  background:rgba(15,23,42,0.6); border:1px solid var(--border-color); border-radius:10px;
  padding:12px 16px; color:var(--text-primary); font-family:'JetBrains Mono',monospace;
  font-size:13px; outline:none; transition:all 0.3s; }
.form-input:focus, .form-select:focus, .form-textarea:focus { border-color:var(--accent-cyan);
  box-shadow:0 0 0 3px rgba(56,189,248,0.1); }
.form-select { appearance:none; cursor:pointer;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%2394a3b8' d='M1.41 0L6 4.58 10.59 0 12 1.41l-6 6-6-6z'/%3E%3C/svg%3E");
  background-repeat:no-repeat; background-position:right 16px center; padding-right:40px; }
.form-select option { background:#0f172a; color:var(--text-primary); }
.form-textarea { min-height:80px; resize:vertical; font-size:12px; line-height:1.6; }
.form-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.strategy-cards { display:flex; flex-direction:column; gap:12px; max-height:420px; overflow-y:auto; }
.strategy-cards::-webkit-scrollbar { width:4px; }
.strategy-cards::-webkit-scrollbar-track { background:transparent; }
.strategy-cards::-webkit-scrollbar-thumb { background:var(--border-glow); border-radius:4px; }
.my-strat-card { padding:16px; border-radius:12px; background:rgba(15,23,42,0.5);
  border:1px solid var(--border-color); transition:all 0.3s; position:relative; }
.my-strat-card:hover { border-color:var(--border-glow); }
.my-strat-card-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.my-strat-card-name { font-weight:700; font-size:14px; color:var(--text-primary); }
.my-strat-card-type { font-size:10px; padding:2px 8px; border-radius:4px; font-weight:600; letter-spacing:1px; }
.type-momentum { background:rgba(56,189,248,0.12); color:var(--accent-cyan); }
.type-meanrev { background:rgba(167,139,250,0.12); color:var(--accent-purple); }
.type-grid { background:rgba(251,191,36,0.12); color:var(--accent-yellow); }
.type-scalp { background:rgba(52,211,153,0.12); color:var(--accent-green); }
.type-arb { background:rgba(244,63,94,0.12); color:var(--accent-red); }
.my-strat-params { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:10px; }
.my-strat-param { display:flex; justify-content:space-between; font-size:11px; padding:4px 8px;
  border-radius:6px; background:rgba(0,0,0,0.2); }
.my-strat-param-label { color:var(--text-muted); }
.my-strat-param-value { color:var(--accent-cyan); font-family:'JetBrains Mono',monospace; font-weight:600; }
.my-strat-actions { display:flex; gap:8px; }
.strat-action-btn { padding:6px 12px; border-radius:8px; border:1px solid; font-size:11px;
  font-weight:600; cursor:pointer; transition:all 0.3s; background:transparent; font-family:'Inter',sans-serif; }
.strat-btn-deploy { border-color:rgba(52,211,153,0.3); color:var(--accent-green); }
.strat-btn-deploy:hover { background:rgba(52,211,153,0.15); }
.strat-btn-edit { border-color:rgba(56,189,248,0.3); color:var(--accent-cyan); }
.strat-btn-edit:hover { background:rgba(56,189,248,0.15); }
.strat-btn-delete { border-color:rgba(244,63,94,0.3); color:var(--accent-red); }
.strat-btn-delete:hover { background:rgba(244,63,94,0.15); }
.strat-deployed-badge { display:inline-flex; align-items:center; gap:4px; font-size:10px;
  padding:2px 8px; border-radius:4px; background:rgba(52,211,153,0.1); color:var(--accent-green);
  font-family:'JetBrains Mono',monospace; font-weight:600; letter-spacing:1px; }
.btn-add-strategy { padding:14px; border-radius:12px; border:2px dashed rgba(56,189,248,0.2);
  background:transparent; color:var(--accent-cyan); font-family:'Inter',sans-serif;
  font-size:14px; font-weight:600; cursor:pointer; transition:all 0.3s;
  display:flex; align-items:center; justify-content:center; gap:8px; }
.btn-add-strategy:hover { border-color:var(--accent-cyan); background:rgba(56,189,248,0.05); }

/* RESPONSIVE */
@media(max-width:1200px){
  .hero{grid-template-columns:1fr 1fr}
  .dashboard{grid-template-columns:1fr}
  .robot-grid{grid-template-columns:1fr;text-align:center}
  .stats-row{grid-template-columns:repeat(3,1fr)}
}
@media(max-width:768px){
  .main{padding:16px}
  .hero{grid-template-columns:1fr}
  .stats-row{grid-template-columns:1fr 1fr}
  .topnav{padding:0 16px}
}
`;

// ─── Utility: generate sparkline data ───
const genSparkData = (n, base, vol, trend) => {
  const d = [base];
  for (let i = 1; i < n; i++) d.push(d[i - 1] + (Math.random() - 0.45) * vol + trend);
  return d;
};

// ─── Sparkline SVG Component ───
const Sparkline = ({ data, color = "#38bdf8" }) => {
  if (!data || data.length < 2) return null;
  const w = 300, h = 40;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h * 0.9 - h * 0.05}`
  ).join(" ");
  const gradId = `sg_${Math.random().toString(36).slice(2, 8)}`;
  return (
    <svg className="sparkline-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${gradId})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ─── Order data generators ───
const SYMBOLS = ["BTC/USDT","ETH/USDT","SOL/USDT","AAPL","TSLA","NVDA","AMZN","META","GOOG","MSFT","BNB/USDT","XRP/USDT","DOGE/USDT","AVAX/USDT"];
const STRATEGIES = ["Momentum Alpha","Mean Reversion X","Grid Scalper Pro","Arbitrage Hunter","Volatility Surfer"];

const genOrder = () => {
  const isBuy = Math.random() > 0.45;
  const sym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  const strat = STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)];
  const now = new Date();
  return {
    id: Math.random().toString(36).slice(2, 10),
    type: isBuy ? "buy" : "sell", symbol: sym, strategy: strat,
    price: (Math.random() * 50000 + 10).toFixed(2),
    qty: (Math.random() * 10 + 0.01).toFixed(4),
    pnl: (Math.random() - 0.35) * 500,
    time: now.toLocaleTimeString("en-US", { hour12: false }),
  };
};

// ─── Main Dashboard Component ───
export default function TradingSmartDashboard() {
  const [time, setTime] = useState("");
  const [uptimeSec, setUptimeSec] = useState(72 * 3600 + 14 * 60 + 38);
  const [killActive, setKillActive] = useState(false);
  const [orders, setOrders] = useState(() => Array.from({ length: 8 }, genOrder));
  const [logs, setLogs] = useState([
    { type: "info", msg: "System initialized — All modules loaded" },
    { type: "exec", msg: "Connected to Binance WebSocket — Latency: 12ms" },
    { type: "info", msg: 'Strategy "Momentum Alpha" deployed on BTC/USDT, ETH/USDT' },
    { type: "exec", msg: "BUY BTC/USDT — 0.0450 @ $67,842.30 via Momentum Alpha" },
    { type: "info", msg: "Risk check passed — Portfolio exposure within limits" },
    { type: "exec", msg: "SELL ETH/USDT — 1.2000 @ $3,891.20 via Mean Reversion X" },
    { type: "warn", msg: "High volatility detected on SOL/USDT — Adjusting position size" },
    { type: "exec", msg: "Grid Scalper placed 12 limit orders on BNB/USDT" },
    { type: "info", msg: "Portfolio rebalance complete — 3 positions adjusted" },
    { type: "exec", msg: "BUY AAPL — 50 shares @ $198.42 via Momentum Alpha" },
  ]);
  const [portfolioVal, setPortfolioVal] = useState(2847392.58);
  const [todayPnl, setTodayPnl] = useState(12847.90);
  const [riskScore, setRiskScore] = useState(28);

  // My Strategies state
  const [myStrategies, setMyStrategies] = useState([
    { id: "ms1", name: "Golden Cross Scalper", type: "momentum", pairs: "BTC/USDT, ETH/USDT", timeframe: "5m", riskPerTrade: "1.5%", stopLoss: "0.8%", takeProfit: "2.4%", maxPositions: "3", deployed: true },
    { id: "ms2", name: "RSI Mean Revert", type: "meanrev", pairs: "SOL/USDT, AVAX/USDT", timeframe: "15m", riskPerTrade: "2%", stopLoss: "1.2%", takeProfit: "3%", maxPositions: "2", deployed: false },
    { id: "ms3", name: "Grid Bot ETH", type: "grid", pairs: "ETH/USDT", timeframe: "1m", riskPerTrade: "0.5%", stopLoss: "N/A", takeProfit: "N/A", maxPositions: "20", deployed: true },
  ]);
  const [showStratForm, setShowStratForm] = useState(false);
  const [stratForm, setStratForm] = useState({ name: "", type: "momentum", pairs: "", timeframe: "5m", riskPerTrade: "1", stopLoss: "1", takeProfit: "2", maxPositions: "3" });

  // Developer Request state
  const [showDevRequest, setShowDevRequest] = useState(false);
  const [devForm, setDevForm] = useState({ strategyName: "", description: "", market: "crypto", urgency: "normal", email: "", pdfName: "" });
  const [devRequests, setDevRequests] = useState([
    { id: "dr1", name: "Ichimoku Cloud Breakout", status: "in_progress", submitted: "2026-04-10", eta: "2026-04-18" },
    { id: "dr2", name: "Volume Profile Reversal", status: "completed", submitted: "2026-03-28", eta: "2026-04-05" },
  ]);
  const fileInputRef = useRef(null);
  const [chartData, setChartData] = useState(() => {
    const d = [2400000];
    for (let i = 1; i < 90; i++) d.push(d[i - 1] + (Math.random() - 0.42) * 8000);
    return d;
  });
  const [sparkData] = useState({
    s1: genSparkData(40, 100, 3, 0.3),
    s2: genSparkData(40, 50, 4, 0.5),
    s3: genSparkData(40, 80, 5, 0.2),
  });

  const canvasRef = useRef(null);
  const logRef = useRef(null);

  const addLog = useCallback((type, msg) => {
    const now = new Date();
    setLogs((prev) => {
      const next = [...prev, { type, msg, time: now.toLocaleTimeString("en-US", { hour12: false }) }];
      return next.slice(-50);
    });
  }, []);

  // Clock
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setTime(n.toLocaleTimeString("en-US", { hour12: false }) + "." + String(n.getMilliseconds()).padStart(3, "0"));
    }, 50);
    return () => clearInterval(id);
  }, []);

  // Uptime
  useEffect(() => {
    const id = setInterval(() => setUptimeSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Live orders
  useEffect(() => {
    const id = setInterval(() => {
      if (killActive) return;
      const o = genOrder();
      setOrders((prev) => [o, ...prev].slice(0, 30));
      addLog("exec", `${o.type.toUpperCase()} ${o.symbol} — ${o.qty} @ $${o.price} via ${o.strategy}`);
    }, 3000);
    return () => clearInterval(id);
  }, [killActive, addLog]);

  // Portfolio animation
  useEffect(() => {
    const id = setInterval(() => {
      if (killActive) return;
      setPortfolioVal((v) => v + (Math.random() - 0.45) * 2000);
      setTodayPnl((v) => v + (Math.random() - 0.4) * 300);
    }, 5000);
    return () => clearInterval(id);
  }, [killActive]);

  // Chart data
  useEffect(() => {
    const id = setInterval(() => {
      if (killActive) return;
      setChartData((prev) => {
        const n = [...prev, prev[prev.length - 1] + (Math.random() - 0.42) * 5000];
        return n.length > 150 ? n.slice(1) : n;
      });
    }, 2000);
    return () => clearInterval(id);
  }, [killActive]);

  // Risk gauge
  useEffect(() => {
    const id = setInterval(() => setRiskScore(15 + Math.floor(Math.random() * 40)), 10000);
    return () => clearInterval(id);
  }, []);

  // Periodic system logs
  useEffect(() => {
    const id = setInterval(() => {
      if (killActive) return;
      const msgs = [
        { type: "info", msg: "Heartbeat — All systems nominal" },
        { type: "info", msg: `WebSocket latency: ${Math.floor(Math.random() * 20 + 5)}ms` },
        { type: "exec", msg: `Risk scan complete — Score: ${Math.floor(Math.random() * 30 + 15)}` },
        { type: "info", msg: `Memory usage: ${(Math.random() * 0.5 + 0.9).toFixed(1)} GB` },
      ];
      const m = msgs[Math.floor(Math.random() * msgs.length)];
      addLog(m.type, m.msg);
    }, 8000);
    return () => clearInterval(id);
  }, [killActive, addLog]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Draw chart on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);
    if (chartData.length < 2) return;
    const min = Math.min(...chartData) * 0.998;
    const max = Math.max(...chartData) * 1.002;
    const range = max - min;
    const pad = { top: 20, bottom: 30, left: 0, right: 0 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;

    ctx.strokeStyle = "rgba(56,189,248,0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = pad.top + (ch / 5) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const gradient = ctx.createLinearGradient(0, pad.top, 0, h);
    gradient.addColorStop(0, "rgba(56,189,248,0.15)");
    gradient.addColorStop(0.5, "rgba(99,102,241,0.05)");
    gradient.addColorStop(1, "rgba(56,189,248,0)");
    const toX = (i) => pad.left + (i / (chartData.length - 1)) * cw;
    const toY = (v) => pad.top + ch - ((v - min) / range) * ch;

    ctx.beginPath();
    ctx.moveTo(toX(0), h);
    chartData.forEach((v, i) => ctx.lineTo(toX(i), toY(v)));
    ctx.lineTo(toX(chartData.length - 1), h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    chartData.forEach((v, i) => { if (i === 0) ctx.moveTo(toX(i), toY(v)); else ctx.lineTo(toX(i), toY(v)); });
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.beginPath();
    chartData.forEach((v, i) => { if (i === 0) ctx.moveTo(toX(i), toY(v)); else ctx.lineTo(toX(i), toY(v)); });
    ctx.strokeStyle = "rgba(56,189,248,0.3)";
    ctx.lineWidth = 6;
    ctx.stroke();

    const lx = toX(chartData.length - 1), ly = toY(chartData[chartData.length - 1]);
    ctx.beginPath(); ctx.arc(lx, ly, 5, 0, Math.PI * 2); ctx.fillStyle = "#38bdf8"; ctx.fill();
    ctx.beginPath(); ctx.arc(lx, ly, 10, 0, Math.PI * 2); ctx.fillStyle = "rgba(56,189,248,0.2)"; ctx.fill();

    ctx.fillStyle = "rgba(148,163,184,0.5)";
    ctx.font = "11px JetBrains Mono";
    ctx.textAlign = "right";
    for (let i = 0; i <= 5; i++) {
      const val = min + (range / 5) * (5 - i);
      const y = pad.top + (ch / 5) * i;
      ctx.fillText("$" + (val / 1000).toFixed(0) + "k", w - 4, y + 4);
    }
  }, [chartData]);

  const formatUptime = (s) => {
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${hh}h ${String(mm).padStart(2, "0")}m ${String(ss).padStart(2, "0")}s`;
  };

  const handleKillSwitch = () => {
    setKillActive((prev) => {
      if (!prev) addLog("error", "KILL SWITCH ACTIVATED — All strategies halted, open orders cancelled");
      else addLog("info", "Kill switch deactivated — Systems resuming");
      return !prev;
    });
  };

  const riskColor = riskScore < 30 ? "var(--accent-green)" : riskScore < 60 ? "var(--accent-yellow)" : "var(--accent-red)";
  const riskLabel = riskScore < 30 ? "Low" : riskScore < 60 ? "Medium" : "High";

  const strategiesData = [
    { name: "Momentum Alpha", status: "active", trades: 142, pnl: "+$48,291", win: "81.2%", pnlColor: "var(--accent-green)", winColor: "var(--accent-green)" },
    { name: "Mean Reversion X", status: "active", trades: 89, pnl: "+$31,847", win: "74.5%", pnlColor: "var(--accent-green)", winColor: "var(--accent-green)" },
    { name: "Grid Scalper Pro", status: "active", trades: 1247, pnl: "+$22,140", win: "68.9%", pnlColor: "var(--accent-green)", winColor: "var(--accent-cyan)" },
    { name: "Arbitrage Hunter", status: "active", trades: 56, pnl: "+$18,500", win: "92.1%", pnlColor: "var(--accent-green)", winColor: "var(--accent-green)" },
    { name: "Volatility Surfer", status: "active", trades: 203, pnl: "-$4,320", win: "52.3%", pnlColor: "var(--accent-red)", winColor: "var(--accent-orange)" },
    { name: "Breakout Ninja", status: "paused", trades: 0, pnl: "$0", win: "--", pnlColor: "var(--text-muted)", winColor: "var(--text-muted)" },
  ];

  return (
    <>
      <style>{styles}</style>
      <div className="bg-grid" />
      <div className="bg-orbs">
        <div className="orb orb-1" /><div className="orb orb-2" /><div className="orb orb-3" />
      </div>
      <div className="scanlines" />

      <div className="app">
        {/* NAV */}
        <nav className="topnav">
          <div className="logo">
            <div className="logo-icon"><TradingSmartLogo size={32} /></div>
            <div className="logo-text">
              <span className="logo-text-main">TRADINGSMART.AI</span>
              <span className="logo-text-sub">ALGO TRADING ENGINE</span>
            </div>
          </div>
          <div className="nav-status">
            <div className="status-item"><div className="status-dot live" /> Exchange Connected</div>
            <div className="status-item"><div className="status-dot live" /> WebSocket Active</div>
            <div className="status-item"><div className="status-dot warn" /> 2 Alerts</div>
            <div className="nav-time">{time}</div>
          </div>
        </nav>

        <div className="main">
          {/* HERO */}
          <div className="hero">
            <div className="hero-card">
              <div className="hero-label">Total Portfolio Value</div>
              <div className="hero-value neutral">${portfolioVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="hero-change up">&#9650; +$23,841.20 (0.84%) today</div>
              <Sparkline data={sparkData.s1} color="#38bdf8" />
            </div>
            <div className="hero-card">
              <div className="hero-label">Algo Cumulative P&L</div>
              <div className="hero-value positive">+$384,291.43</div>
              <div className="hero-change up">&#9650; +$8,412.30 (2.24%) this week</div>
              <Sparkline data={sparkData.s2} color="#34d399" />
            </div>
            <div className="hero-card">
              <div className="hero-label">Today's Algo P&L</div>
              <div className="hero-value positive">{todayPnl >= 0 ? "+" : ""}${Math.abs(todayPnl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="hero-change up">&#9650; 47 trades executed | 76% win rate</div>
              <Sparkline data={sparkData.s3} color="#34d399" />
            </div>
          </div>

          {/* STATS */}
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-label">Win Rate</div>
              <div className="stat-value" style={{ color: "var(--accent-green)" }}>76.4%</div>
              <div className="progress-container">
                <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: "76.4%", background: "linear-gradient(90deg,var(--accent-green),var(--accent-cyan))" }} /></div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Sharpe Ratio</div>
              <div className="stat-value" style={{ color: "var(--accent-cyan)" }}>2.41</div>
              <div className="progress-container">
                <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: "80%", background: "linear-gradient(90deg,var(--accent-cyan),var(--accent-blue))" }} /></div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Max Drawdown</div>
              <div className="stat-value" style={{ color: "var(--accent-orange)" }}>-4.2%</div>
              <div className="progress-container">
                <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: "42%", background: "linear-gradient(90deg,var(--accent-yellow),var(--accent-orange))" }} /></div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Active Positions</div>
              <div className="stat-value" style={{ color: "var(--accent-purple)" }}>14</div>
              <div className="progress-container">
                <div className="progress-label"><span>Exposure</span><span>68%</span></div>
                <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: "68%", background: "linear-gradient(90deg,var(--accent-purple),var(--accent-blue))" }} /></div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Avg Trade Duration</div>
              <div className="stat-value" style={{ color: "var(--text-primary)" }}>4m 32s</div>
              <div className="progress-container">
                <div className="progress-label"><span>Latency</span><span>12ms</span></div>
                <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: "12%", background: "linear-gradient(90deg,var(--accent-green),var(--accent-cyan))" }} /></div>
              </div>
            </div>
          </div>

          {/* DASHBOARD */}
          <div className="dashboard">
            {/* ROBOT COMMAND CENTER */}
            <div className="card robot-panel">
              <div className="card-header">
                <div className="card-title">
                  <span className="card-title-icon" style={{ background: "rgba(56,189,248,0.1)", color: "var(--accent-cyan)" }}>&#x1F916;</span>
                  Robot Command Center
                </div>
                <span className="card-badge badge-green">{killActive ? "&#x25CF; OFFLINE" : "&#x25CF; ONLINE"}</span>
              </div>
              <div className="robot-grid">
                <div className="robot-avatar">
                  <div className="robot-ring"><div className="robot-face">&#x1F916;</div></div>
                  <div className="robot-name">TSA-7</div>
                  <div className="robot-status-text">
                    <div className={`status-dot ${killActive ? "warn" : "live"}`} />
                    {killActive ? "All Systems Halted" : "Actively Trading"}
                  </div>
                </div>
                <div className="robot-metrics">
                  <div className="metric-row"><span className="metric-label">CPU Load</span><span className="metric-value" style={{ color: "var(--accent-green)" }}>23%</span></div>
                  <div className="metric-row"><span className="metric-label">Memory Usage</span><span className="metric-value" style={{ color: "var(--accent-cyan)" }}>1.2 GB / 8 GB</span></div>
                  <div className="metric-row"><span className="metric-label">Orders/Sec</span><span className="metric-value" style={{ color: "var(--accent-purple)" }}>847</span></div>
                  <div className="metric-row"><span className="metric-label">Strategies Running</span><span className="metric-value" style={{ color: "var(--accent-yellow)" }}>{killActive ? "0 / 8" : "5 / 8"}</span></div>
                  <div className="metric-row"><span className="metric-label">Uptime</span><span className="metric-value" style={{ color: "var(--text-primary)" }}>{formatUptime(uptimeSec)}</span></div>
                  <div className="metric-row"><span className="metric-label">API Rate Limit</span><span className="metric-value" style={{ color: "var(--accent-green)" }}>32% used</span></div>
                </div>
                <div className="robot-actions">
                  <div className="kill-switch-container">
                    <button className={`kill-switch ${killActive ? "active" : ""}`} onClick={handleKillSwitch}>
                      <span className="kill-icon">{killActive ? "\u26D4" : "\u26A0"}</span>
                      <span className="kill-text">{killActive ? "ACTIVATED" : "KILL SWITCH"}</span>
                    </button>
                    <div className="kill-label"><span>Emergency Stop</span><br />Halts all strategies & cancels orders</div>
                  </div>
                  <button className="action-btn btn-warning" onClick={() => addLog("warn", "Pause command issued — Pausing all strategies...")}>&#x23F8; Pause All Strategies</button>
                  <button className="action-btn btn-primary" onClick={() => addLog("info", "Portfolio rebalance initiated — Analyzing allocations...")}>&#x21BB; Rebalance Portfolio</button>
                </div>
              </div>
            </div>

            {/* STRATEGIES */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <span className="card-title-icon" style={{ background: "rgba(167,139,250,0.1)", color: "var(--accent-purple)" }}>&#x1F9E0;</span>
                  Active Strategies
                </div>
                <span className="card-badge badge-blue">5 Running</span>
              </div>
              <table className="strategy-table">
                <thead><tr><th>Strategy</th><th>Status</th><th>Trades</th><th>P&L</th><th>Win %</th></tr></thead>
                <tbody>
                  {strategiesData.map((s) => (
                    <tr key={s.name}>
                      <td><span className="strategy-name">{s.name}</span></td>
                      <td><span className={`strategy-tag ${s.status === "active" ? "tag-active" : "tag-paused"}`}>{s.status.toUpperCase()}</span></td>
                      <td>{s.trades.toLocaleString()}</td>
                      <td style={{ color: s.pnlColor }}>{s.pnl}</td>
                      <td style={{ color: s.winColor }}>{s.win}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="risk-gauge">
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div className="gauge-score" style={{ color: riskColor }}>{riskScore}</div>
                  <div className="gauge-label-text">Risk Score — {riskLabel}</div>
                </div>
              </div>
            </div>

            {/* LIVE ORDERS */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <span className="card-title-icon" style={{ background: "rgba(52,211,153,0.1)", color: "var(--accent-green)" }}>&#x26A1;</span>
                  Live Order Feed
                </div>
                <span className="card-badge badge-green">Real-time</span>
              </div>
              <div className="order-feed">
                {orders.map((o) => (
                  <div className="order-item" key={o.id}>
                    <div className={`order-icon ${o.type}`}>{o.type === "buy" ? "\u25B2" : "\u25BC"}</div>
                    <div>
                      <div className="order-pair">{o.symbol} <span style={{ color: o.type === "buy" ? "var(--accent-green)" : "var(--accent-red)", fontSize: 11, textTransform: "uppercase" }}>{o.type}</span></div>
                      <div className="order-meta">{o.strategy} &bull; {o.qty} @ ${o.price}</div>
                    </div>
                    <div>
                      <div className="order-pnl" style={{ color: o.pnl >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>{o.pnl >= 0 ? "+" : ""}${Math.abs(o.pnl).toFixed(2)}</div>
                      <div className="order-time">{o.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ═══ MY STRATEGY PANEL ═══ */}
            <div className="card my-strategy-panel">
              <div className="card-header">
                <div className="card-title">
                  <span className="card-title-icon" style={{ background: "rgba(56,189,248,0.1)", color: "var(--accent-cyan)" }}>&#x1F3AF;</span>
                  My Strategies
                </div>
                <span className="card-badge badge-blue">{myStrategies.length} Saved</span>
              </div>
              <div className="strategy-builder">
                {/* Left: Strategy Cards */}
                <div className="strategy-cards">
                  {myStrategies.map((s) => (
                    <div className="my-strat-card" key={s.id}>
                      <div className="my-strat-card-header">
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span className="my-strat-card-name">{s.name}</span>
                          <span className={`my-strat-card-type type-${s.type}`}>{s.type.toUpperCase()}</span>
                        </div>
                        {s.deployed && <span className="strat-deployed-badge"><span className="status-dot live" style={{ width: 6, height: 6 }} /> LIVE</span>}
                      </div>
                      <div className="my-strat-params">
                        <div className="my-strat-param"><span className="my-strat-param-label">Pairs</span><span className="my-strat-param-value">{s.pairs}</span></div>
                        <div className="my-strat-param"><span className="my-strat-param-label">Timeframe</span><span className="my-strat-param-value">{s.timeframe}</span></div>
                        <div className="my-strat-param"><span className="my-strat-param-label">Risk/Trade</span><span className="my-strat-param-value">{s.riskPerTrade}</span></div>
                        <div className="my-strat-param"><span className="my-strat-param-label">Stop Loss</span><span className="my-strat-param-value">{s.stopLoss}</span></div>
                        <div className="my-strat-param"><span className="my-strat-param-label">Take Profit</span><span className="my-strat-param-value">{s.takeProfit}</span></div>
                        <div className="my-strat-param"><span className="my-strat-param-label">Max Pos</span><span className="my-strat-param-value">{s.maxPositions}</span></div>
                      </div>
                      <div className="my-strat-actions">
                        {!s.deployed ? (
                          <button className="strat-action-btn strat-btn-deploy" onClick={() => {
                            setMyStrategies((prev) => prev.map((x) => x.id === s.id ? { ...x, deployed: true } : x));
                            addLog("exec", `Strategy "${s.name}" deployed to live trading`);
                          }}>&#x25B6; Deploy</button>
                        ) : (
                          <button className="strat-action-btn strat-btn-edit" onClick={() => {
                            setMyStrategies((prev) => prev.map((x) => x.id === s.id ? { ...x, deployed: false } : x));
                            addLog("warn", `Strategy "${s.name}" stopped`);
                          }}>&#x23F9; Stop</button>
                        )}
                        <button className="strat-action-btn strat-btn-edit">&#x270E; Edit</button>
                        <button className="strat-action-btn strat-btn-delete" onClick={() => {
                          setMyStrategies((prev) => prev.filter((x) => x.id !== s.id));
                          addLog("warn", `Strategy "${s.name}" deleted`);
                        }}>&#x2715; Delete</button>
                      </div>
                    </div>
                  ))}
                  <button className="btn-add-strategy" onClick={() => setShowStratForm(true)}>+ Create New Strategy</button>
                </div>

                {/* Right: Create Strategy Form OR Dev Request */}
                <div>
                  {showStratForm && (
                    <div style={{ padding: 20, borderRadius: 12, background: "rgba(15,23,42,0.5)", border: "1px solid var(--border-color)" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: "var(--accent-cyan)", display: "flex", alignItems: "center", gap: 8 }}>
                        <span>&#x2699;</span> New Strategy Configuration
                      </div>
                      <div className="strategy-form">
                        <div className="form-group">
                          <label className="form-label">Strategy Name</label>
                          <input className="form-input" placeholder="e.g. MACD Crossover Pro" value={stratForm.name}
                            onChange={(e) => setStratForm({ ...stratForm, name: e.target.value })} />
                        </div>
                        <div className="form-row">
                          <div className="form-group">
                            <label className="form-label">Type</label>
                            <select className="form-select" value={stratForm.type}
                              onChange={(e) => setStratForm({ ...stratForm, type: e.target.value })}>
                              <option value="momentum">Momentum</option>
                              <option value="meanrev">Mean Reversion</option>
                              <option value="grid">Grid</option>
                              <option value="scalp">Scalping</option>
                              <option value="arb">Arbitrage</option>
                            </select>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Timeframe</label>
                            <select className="form-select" value={stratForm.timeframe}
                              onChange={(e) => setStratForm({ ...stratForm, timeframe: e.target.value })}>
                              <option value="1m">1 Minute</option>
                              <option value="5m">5 Minutes</option>
                              <option value="15m">15 Minutes</option>
                              <option value="1h">1 Hour</option>
                              <option value="4h">4 Hours</option>
                              <option value="1d">1 Day</option>
                            </select>
                          </div>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Trading Pairs</label>
                          <input className="form-input" placeholder="BTC/USDT, ETH/USDT" value={stratForm.pairs}
                            onChange={(e) => setStratForm({ ...stratForm, pairs: e.target.value })} />
                        </div>
                        <div className="form-row">
                          <div className="form-group">
                            <label className="form-label">Risk Per Trade (%)</label>
                            <input className="form-input" type="number" step="0.1" value={stratForm.riskPerTrade}
                              onChange={(e) => setStratForm({ ...stratForm, riskPerTrade: e.target.value })} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Max Positions</label>
                            <input className="form-input" type="number" value={stratForm.maxPositions}
                              onChange={(e) => setStratForm({ ...stratForm, maxPositions: e.target.value })} />
                          </div>
                        </div>
                        <div className="form-row">
                          <div className="form-group">
                            <label className="form-label">Stop Loss (%)</label>
                            <input className="form-input" type="number" step="0.1" value={stratForm.stopLoss}
                              onChange={(e) => setStratForm({ ...stratForm, stopLoss: e.target.value })} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Take Profit (%)</label>
                            <input className="form-input" type="number" step="0.1" value={stratForm.takeProfit}
                              onChange={(e) => setStratForm({ ...stratForm, takeProfit: e.target.value })} />
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                          <button className="action-btn btn-primary" style={{ flex: 1 }} onClick={() => {
                            if (!stratForm.name) return;
                            const ns = { id: "ms" + Date.now(), ...stratForm, riskPerTrade: stratForm.riskPerTrade + "%", stopLoss: stratForm.stopLoss + "%", takeProfit: stratForm.takeProfit + "%", deployed: false };
                            setMyStrategies((prev) => [...prev, ns]);
                            setStratForm({ name: "", type: "momentum", pairs: "", timeframe: "5m", riskPerTrade: "1", stopLoss: "1", takeProfit: "2", maxPositions: "3" });
                            setShowStratForm(false);
                            addLog("info", `New strategy "${ns.name}" created`);
                          }}>&#x2714; Save Strategy</button>
                          <button className="action-btn btn-warning" style={{ flex: 0.5 }} onClick={() => setShowStratForm(false)}>Cancel</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {!showStratForm && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <div style={{ padding: 20, borderRadius: 12, background: "rgba(15,23,42,0.5)", border: "1px solid var(--border-color)" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: "var(--text-primary)" }}>Quick Stats</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 14 }}>Your strategy portfolio at a glance</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <div className="my-strat-param"><span className="my-strat-param-label">Total</span><span className="my-strat-param-value">{myStrategies.length}</span></div>
                          <div className="my-strat-param"><span className="my-strat-param-label">Live</span><span className="my-strat-param-value" style={{ color: "var(--accent-green)" }}>{myStrategies.filter((s) => s.deployed).length}</span></div>
                          <div className="my-strat-param"><span className="my-strat-param-label">Stopped</span><span className="my-strat-param-value" style={{ color: "var(--accent-yellow)" }}>{myStrategies.filter((s) => !s.deployed).length}</span></div>
                          <div className="my-strat-param"><span className="my-strat-param-label">In Dev</span><span className="my-strat-param-value" style={{ color: "var(--accent-purple)" }}>{devRequests.filter((d) => d.status === "in_progress").length}</span></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ═══ REQUEST DEVELOPER TO CODE STRATEGY ═══ */}
            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <div className="card-header">
                <div className="card-title">
                  <span className="card-title-icon" style={{ background: "rgba(167,139,250,0.1)", color: "var(--accent-purple)" }}>&#x1F4BB;</span>
                  Request Strategy Development
                </div>
                <button className="action-btn btn-primary" style={{ padding: "6px 16px", fontSize: 12 }}
                  onClick={() => setShowDevRequest(!showDevRequest)}>
                  {showDevRequest ? "Close" : "+ New Request"}
                </button>
              </div>

              {showDevRequest && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
                  <div className="strategy-form">
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, padding: "10px 14px", borderRadius: 10,
                      background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.1)", marginBottom: 4 }}>
                      Submit your trading strategy idea to our development team. Upload a PDF document with your strategy rules, entry/exit conditions, indicators used, and risk parameters. Our developers will code it into a production-ready algorithm.
                    </div>
                    <div className="form-group">
                      <label className="form-label">Strategy Name</label>
                      <input className="form-input" placeholder="e.g. Fibonacci Retracement Scalper" value={devForm.strategyName}
                        onChange={(e) => setDevForm({ ...devForm, strategyName: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Strategy Description</label>
                      <textarea className="form-input form-textarea" placeholder="Describe your strategy logic, entry/exit rules, indicators, timeframes, and any special conditions..."
                        value={devForm.description} onChange={(e) => setDevForm({ ...devForm, description: e.target.value })} />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Market</label>
                        <select className="form-select" value={devForm.market}
                          onChange={(e) => setDevForm({ ...devForm, market: e.target.value })}>
                          <option value="crypto">Crypto</option>
                          <option value="forex">Forex</option>
                          <option value="stocks">Stocks</option>
                          <option value="options">Options</option>
                          <option value="futures">Futures</option>
                          <option value="commodities">Commodities</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Priority</label>
                        <select className="form-select" value={devForm.urgency}
                          onChange={(e) => setDevForm({ ...devForm, urgency: e.target.value })}>
                          <option value="normal">Normal (7-10 days)</option>
                          <option value="priority">Priority (3-5 days)</option>
                          <option value="rush">Rush (1-2 days)</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Contact Email</label>
                      <input className="form-input" type="email" placeholder="you@example.com" value={devForm.email}
                        onChange={(e) => setDevForm({ ...devForm, email: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Upload Strategy Document (PDF)</label>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setDevForm({ ...devForm, pdfName: file.name });
                          }} />
                        <button className="action-btn btn-primary" style={{ padding: "10px 20px", fontSize: 12 }}
                          onClick={() => fileInputRef.current?.click()}>
                          &#x1F4CE; Choose PDF File
                        </button>
                        {devForm.pdfName ? (
                          <span style={{ fontSize: 12, color: "var(--accent-green)", fontFamily: "'JetBrains Mono',monospace",
                            display: "flex", alignItems: "center", gap: 6 }}>
                            &#x2714; {devForm.pdfName}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>No file selected</span>
                        )}
                      </div>
                    </div>
                    <button className="action-btn btn-primary" style={{ padding: 14, fontSize: 14, marginTop: 4,
                      background: "linear-gradient(135deg,rgba(167,139,250,0.2),rgba(99,102,241,0.2))",
                      borderColor: "rgba(167,139,250,0.4)", color: "var(--accent-purple)" }}
                      onClick={() => {
                        if (!devForm.strategyName) return;
                        setDevRequests((prev) => [...prev, {
                          id: "dr" + Date.now(), name: devForm.strategyName, status: "submitted",
                          submitted: new Date().toISOString().slice(0, 10),
                          eta: new Date(Date.now() + (devForm.urgency === "rush" ? 2 : devForm.urgency === "priority" ? 5 : 10) * 86400000).toISOString().slice(0, 10),
                        }]);
                        addLog("info", `Strategy development request submitted: "${devForm.strategyName}"`);
                        setDevForm({ strategyName: "", description: "", market: "crypto", urgency: "normal", email: "", pdfName: "" });
                        setShowDevRequest(false);
                      }}>
                      &#x1F680; Submit Development Request
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ padding: 16, borderRadius: 12, background: "rgba(15,23,42,0.5)", border: "1px solid var(--border-color)" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>What to Include in Your PDF</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                        {["Entry & exit conditions with specific indicators", "Timeframe and trading pairs/assets", "Position sizing and risk management rules",
                          "Stop loss & take profit logic", "Any special conditions or filters", "Backtesting results (if available)"].map((item, i) => (
                          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                            <span style={{ color: "var(--accent-cyan)", fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>&#x2022;</span>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ padding: 16, borderRadius: 12, background: "rgba(15,23,42,0.5)", border: "1px solid var(--border-color)" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>Pricing</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {[{ label: "Normal", price: "$499", time: "7-10 days" }, { label: "Priority", price: "$899", time: "3-5 days" }, { label: "Rush", price: "$1,499", time: "1-2 days" }].map((p) => (
                          <div key={p.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 8px",
                            borderRadius: 6, background: "rgba(0,0,0,0.2)" }}>
                            <span style={{ color: "var(--text-muted)" }}>{p.label} ({p.time})</span>
                            <span style={{ color: "var(--accent-cyan)", fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>{p.price}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Previous Requests */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>
                  Development Requests
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                  {devRequests.map((r) => (
                    <div key={r.id} style={{ padding: 14, borderRadius: 10, background: "rgba(15,23,42,0.4)",
                      border: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'JetBrains Mono',monospace" }}>
                          Submitted: {r.submitted} &bull; ETA: {r.eta}
                        </div>
                      </div>
                      <span className={`strategy-tag ${r.status === "completed" ? "tag-active" : r.status === "in_progress" ? "tag-paused" : ""}`}
                        style={r.status === "submitted" ? { background: "rgba(56,189,248,0.12)", color: "var(--accent-cyan)" } : {}}>
                        {r.status === "completed" ? "DELIVERED" : r.status === "in_progress" ? "IN PROGRESS" : "SUBMITTED"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* P&L CHART */}
            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <div className="card-header">
                <div className="card-title">
                  <span className="card-title-icon" style={{ background: "rgba(99,102,241,0.1)", color: "var(--accent-blue)" }}>&#x1F4C8;</span>
                  Equity Curve & Drawdown
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {["1D", "1W", "1M", "ALL"].map((r) => (
                    <button key={r} className="action-btn btn-primary" style={{ padding: "6px 14px", fontSize: 11 }}
                      onClick={() => { const d = [2400000]; const n = { "1D": 24, "1W": 50, "1M": 90, ALL: 200 }[r]; for (let i = 1; i < n; i++) d.push(d[i - 1] + (Math.random() - 0.42) * 8000); setChartData(d); }}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div className="chart-area">
                <canvas ref={canvasRef} className="chart-canvas" />
              </div>
            </div>

            {/* ACTIVITY LOG */}
            <div className="card activity-log">
              <div className="card-header">
                <div className="card-title">
                  <span className="card-title-icon" style={{ background: "rgba(251,191,36,0.1)", color: "var(--accent-yellow)" }}>&#x1F4CB;</span>
                  System Activity Log
                </div>
                <span className="card-badge badge-yellow">Live</span>
              </div>
              <div className="log-entries" ref={logRef}>
                {logs.map((l, i) => (
                  <div className="log-entry" key={i}>
                    <span className="log-time">{l.time || new Date().toLocaleTimeString("en-US", { hour12: false })}</span>
                    <span className={`log-type ${l.type}`}>[{l.type.toUpperCase()}]</span>
                    <span className="log-msg">{l.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
