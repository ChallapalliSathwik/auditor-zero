import { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Design system — a single injected stylesheet driven by CSS variables, so the
// whole app themes light/dark by flipping one attribute on <html>. Enterprise
// SaaS aesthetic: dense, quiet surfaces, one accent, real hover/focus states.
// ---------------------------------------------------------------------------

const STYLE_ID = "az-design-system";

const CSS = `
:root {
  --az-bg: #f5f6f8;
  --az-surface: #ffffff;
  --az-surface-2: #f9fafb;
  --az-surface-3: #f1f3f6;
  --az-border: #e5e7eb;
  --az-border-strong: #d5d9e0;
  --az-text: #0f172a;
  --az-text-2: #566072;
  --az-text-3: #93a0b2;
  --az-accent: #4f46e5;
  --az-accent-hover: #4338ca;
  --az-accent-soft: #eef2ff;
  --az-accent-fg: #ffffff;
  --az-success: #15803d;
  --az-success-soft: #dcfce7;
  --az-warn: #b45309;
  --az-warn-soft: #fef3c7;
  --az-danger: #b91c1c;
  --az-danger-soft: #fee2e2;
  --az-ring: rgba(79,70,229,.35);
  --az-shadow-sm: 0 1px 2px rgba(16,24,40,.05), 0 1px 3px rgba(16,24,40,.08);
  --az-shadow-md: 0 4px 12px rgba(16,24,40,.10);
  --az-shadow-lg: 0 16px 48px rgba(16,24,40,.18);
}
:root[data-theme="dark"] {
  --az-bg: #0a0d13;
  --az-surface: #121722;
  --az-surface-2: #0e131c;
  --az-surface-3: #171d2a;
  --az-border: #232b39;
  --az-border-strong: #313b4d;
  --az-text: #e7ebf2;
  --az-text-2: #97a3b4;
  --az-text-3: #5d6a7b;
  --az-accent: #6366f1;
  --az-accent-hover: #818cf8;
  --az-accent-soft: #1e2140;
  --az-accent-fg: #ffffff;
  --az-success: #34d399;
  --az-success-soft: #0c2c22;
  --az-warn: #fbbf24;
  --az-warn-soft: #2c2410;
  --az-danger: #f87171;
  --az-danger-soft: #331616;
  --az-ring: rgba(99,102,241,.45);
  --az-shadow-sm: 0 1px 2px rgba(0,0,0,.4);
  --az-shadow-md: 0 6px 18px rgba(0,0,0,.45);
  --az-shadow-lg: 0 20px 60px rgba(0,0,0,.6);
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--az-bg);
  color: var(--az-text);
  font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  font-feature-settings: "cv02","cv03","cv04","cv11";
}
.az-mono { font-family: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace; }
.az-tnum { font-variant-numeric: tabular-nums; }

/* Layout */
.az-app { display: flex; min-height: 100vh; }
.az-sidebar {
  width: 236px; flex-shrink: 0; background: var(--az-surface); border-right: 1px solid var(--az-border);
  display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh;
}
.az-brand { display: flex; align-items: center; gap: 10px; padding: 18px 18px 14px; }
.az-brand-mark {
  width: 30px; height: 30px; border-radius: 8px; background: linear-gradient(135deg, var(--az-accent), #8b5cf6);
  display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 15px; box-shadow: var(--az-shadow-sm);
}
.az-brand-name { font-weight: 700; font-size: 15px; letter-spacing: -.01em; }
.az-brand-sub { font-size: 11px; color: var(--az-text-3); }
.az-nav { display: flex; flex-direction: column; gap: 2px; padding: 8px; }
.az-nav-label { font-size: 10.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--az-text-3); padding: 10px 10px 6px; }
.az-nav-item {
  display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; cursor: pointer;
  color: var(--az-text-2); font-weight: 500; font-size: 13.5px; border: none; background: none; text-align: left; width: 100%;
  transition: background .12s, color .12s;
}
.az-nav-item:hover { background: var(--az-surface-3); color: var(--az-text); }
.az-nav-item.active { background: var(--az-accent-soft); color: var(--az-accent); font-weight: 600; }
.az-nav-item .az-ico { width: 17px; text-align: center; }
.az-sidebar-foot { margin-top: auto; padding: 12px; border-top: 1px solid var(--az-border); display: flex; flex-direction: column; gap: 8px; }
.az-user { display: flex; align-items: center; gap: 10px; padding: 4px 6px; }
.az-avatar { width: 28px; height: 28px; border-radius: 999px; background: var(--az-accent-soft); color: var(--az-accent); display: grid; place-items: center; font-weight: 700; font-size: 12px; }

.az-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.az-topbar {
  height: 60px; flex-shrink: 0; border-bottom: 1px solid var(--az-border); background: color-mix(in srgb, var(--az-surface) 82%, transparent);
  backdrop-filter: blur(8px); position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; justify-content: space-between; padding: 0 24px; gap: 16px;
}
.az-page-title { font-size: 16px; font-weight: 650; letter-spacing: -.01em; }
.az-page-sub { font-size: 12.5px; color: var(--az-text-3); }
.az-content { padding: 22px 24px 40px; max-width: 1120px; width: 100%; margin: 0 auto; }
.az-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.az-spacer { flex: 1; }
.az-grid { display: grid; gap: 14px; }

/* Card */
.az-card { background: var(--az-surface); border: 1px solid var(--az-border); border-radius: 12px; box-shadow: var(--az-shadow-sm); }
.az-card-pad { padding: 18px; }
.az-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--az-border); }
.az-card-title { font-size: 14.5px; font-weight: 650; }
.az-card-title small { font-weight: 500; color: var(--az-text-3); margin-left: 6px; }

/* Buttons */
.az-btn {
  display: inline-flex; align-items: center; gap: 7px; padding: 8px 13px; border-radius: 9px; font-size: 13px; font-weight: 600;
  border: 1px solid var(--az-border-strong); background: var(--az-surface); color: var(--az-text); cursor: pointer;
  transition: background .12s, border-color .12s, transform .04s, box-shadow .12s; white-space: nowrap; line-height: 1;
}
.az-btn:hover { background: var(--az-surface-3); }
.az-btn:active { transform: translateY(.5px); }
.az-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--az-ring); }
.az-btn:disabled { opacity: .55; cursor: not-allowed; }
.az-btn-primary { background: var(--az-accent); border-color: var(--az-accent); color: var(--az-accent-fg); }
.az-btn-primary:hover { background: var(--az-accent-hover); border-color: var(--az-accent-hover); }
.az-btn-danger { background: var(--az-danger); border-color: var(--az-danger); color: #fff; }
.az-btn-ghost { background: transparent; border-color: transparent; color: var(--az-text-2); }
.az-btn-ghost:hover { background: var(--az-surface-3); color: var(--az-text); }
.az-btn-sm { padding: 5px 9px; font-size: 12px; border-radius: 7px; }
.az-icon-btn { width: 34px; height: 34px; padding: 0; justify-content: center; }

/* Inputs */
.az-input, .az-textarea, .az-select {
  width: 100%; padding: 9px 11px; border-radius: 9px; border: 1px solid var(--az-border-strong);
  background: var(--az-surface); color: var(--az-text); font-size: 13.5px; font-family: inherit; transition: border-color .12s, box-shadow .12s;
}
.az-input:focus, .az-textarea:focus, .az-select:focus { outline: none; border-color: var(--az-accent); box-shadow: 0 0 0 3px var(--az-ring); }
.az-textarea { min-height: 150px; resize: vertical; line-height: 1.55; }
.az-label { display: block; font-size: 12px; font-weight: 600; color: var(--az-text-2); margin-bottom: 6px; }
.az-field { margin-bottom: 14px; }

/* Table */
.az-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.az-table th { text-align: left; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--az-text-3); padding: 10px 14px; border-bottom: 1px solid var(--az-border); }
.az-table td { padding: 11px 14px; border-bottom: 1px solid var(--az-border); color: var(--az-text); }
.az-table tbody tr:last-child td { border-bottom: none; }
.az-table tbody tr { transition: background .1s; }
.az-table tbody tr:hover { background: var(--az-surface-2); }
.az-table-scroll { overflow-x: auto; }

/* Chips / badges */
.az-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 999px; font-size: 11.5px; font-weight: 600; line-height: 1.4; border: 1px solid transparent; }
.az-chip .az-dot { width: 7px; height: 7px; border-radius: 999px; background: currentColor; }
.az-chip-high { color: var(--az-danger); background: var(--az-danger-soft); }
.az-chip-medium { color: var(--az-warn); background: var(--az-warn-soft); }
.az-chip-low { color: var(--az-success); background: var(--az-success-soft); }
.az-chip-neutral { color: var(--az-text-2); background: var(--az-surface-3); }
.az-chip-accent { color: var(--az-accent); background: var(--az-accent-soft); }
.az-chip-outline { border-color: var(--az-border-strong); color: var(--az-text-2); background: transparent; }

/* Stat tiles */
.az-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.az-stat { background: var(--az-surface); border: 1px solid var(--az-border); border-radius: 12px; padding: 14px 16px; box-shadow: var(--az-shadow-sm); }
.az-stat-label { font-size: 11.5px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--az-text-3); }
.az-stat-value { font-size: 26px; font-weight: 720; letter-spacing: -.02em; margin-top: 4px; }
.az-stat-foot { font-size: 12px; color: var(--az-text-3); margin-top: 2px; }

/* Progress */
.az-progress { height: 7px; border-radius: 999px; background: var(--az-surface-3); overflow: hidden; }
.az-progress > span { display: block; height: 100%; background: linear-gradient(90deg, var(--az-accent), #8b5cf6); border-radius: 999px; transition: width .4s ease; }

/* Empty / loading */
.az-empty { text-align: center; padding: 40px 20px; color: var(--az-text-3); }
.az-empty-ico { font-size: 26px; opacity: .5; margin-bottom: 8px; }
.az-spinner { width: 15px; height: 15px; border: 2px solid var(--az-border-strong); border-top-color: var(--az-accent); border-radius: 999px; display: inline-block; animation: az-spin .7s linear infinite; }
@keyframes az-spin { to { transform: rotate(360deg); } }

/* Drawer (slide-over) */
.az-overlay { position: fixed; inset: 0; background: rgba(2,6,23,.5); z-index: 40; animation: az-fade .16s ease; }
.az-drawer {
  position: fixed; top: 0; right: 0; height: 100vh; width: min(560px, 100vw); background: var(--az-surface);
  border-left: 1px solid var(--az-border); box-shadow: var(--az-shadow-lg); z-index: 41; display: flex; flex-direction: column;
  animation: az-slide .2s cubic-bezier(.22,1,.36,1);
}
.az-drawer-head { padding: 16px 20px; border-bottom: 1px solid var(--az-border); display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.az-drawer-body { padding: 18px 20px; overflow-y: auto; flex: 1; }
@keyframes az-slide { from { transform: translateX(24px); opacity: .4; } to { transform: none; opacity: 1; } }
@keyframes az-fade { from { opacity: 0; } to { opacity: 1; } }

/* Verify banner */
.az-banner { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-radius: 10px; font-weight: 600; font-size: 13px; border: 1px solid transparent; }
.az-banner-ok { color: var(--az-success); background: var(--az-success-soft); border-color: color-mix(in srgb, var(--az-success) 30%, transparent); }
.az-banner-bad { color: var(--az-danger); background: var(--az-danger-soft); border-color: color-mix(in srgb, var(--az-danger) 30%, transparent); }

/* Timeline */
.az-timeline { border-left: 2px solid var(--az-border); margin-left: 7px; padding-left: 20px; display: flex; flex-direction: column; gap: 16px; }
.az-node { position: relative; }
.az-node-dot { position: absolute; left: -27px; top: 3px; width: 11px; height: 11px; border-radius: 999px; background: var(--az-accent); border: 2px solid var(--az-surface); }
.az-node-dot.broken { background: var(--az-danger); box-shadow: 0 0 0 3px var(--az-danger-soft); }
.az-node-agent { font-weight: 650; font-size: 12.5px; }
.az-node-io { font-size: 12px; color: var(--az-text-2); margin: 3px 0; word-break: break-word; }
.az-node-hash { font-size: 11px; color: var(--az-text-3); }

/* Toast */
.az-toasts { position: fixed; bottom: 20px; right: 20px; z-index: 60; display: flex; flex-direction: column; gap: 8px; }
.az-toast { background: var(--az-surface); border: 1px solid var(--az-border); border-left: 3px solid var(--az-accent); border-radius: 10px; box-shadow: var(--az-shadow-md); padding: 11px 14px; font-size: 13px; min-width: 220px; animation: az-slide .18s ease; }
.az-toast.ok { border-left-color: var(--az-success); }
.az-toast.bad { border-left-color: var(--az-danger); }

/* Auth */
.az-auth-wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
.az-auth-card { width: 100%; max-width: 400px; }
.az-seg { display: inline-flex; background: var(--az-surface-3); border-radius: 9px; padding: 3px; gap: 3px; }
.az-seg button { border: none; background: none; padding: 7px 14px; border-radius: 7px; font-size: 13px; font-weight: 600; color: var(--az-text-2); cursor: pointer; }
.az-seg button.active { background: var(--az-surface); color: var(--az-text); box-shadow: var(--az-shadow-sm); }

::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: var(--az-border-strong); border-radius: 999px; border: 2px solid var(--az-surface); }
`;

function injectStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

export type ThemeName = "light" | "dark";

export function useTheme(): { theme: ThemeName; toggle: () => void } {
  const [theme, setTheme] = useState<ThemeName>(() => {
    injectStyles();
    const saved = localStorage.getItem("az_theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("az_theme", theme);
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return { theme, toggle };
}
