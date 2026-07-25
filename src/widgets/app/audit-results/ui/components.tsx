import React, { createContext, useCallback, useContext, useState } from "react";
import { Severity } from "./types";

type BtnVariant = "default" | "primary" | "danger" | "ghost";

export function Button({
  children,
  onClick,
  variant = "default",
  size = "md",
  disabled,
  type = "button",
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  size?: "md" | "sm";
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
}) {
  const cls = ["az-btn"];
  if (variant === "primary") cls.push("az-btn-primary");
  if (variant === "danger") cls.push("az-btn-danger");
  if (variant === "ghost") cls.push("az-btn-ghost");
  if (size === "sm") cls.push("az-btn-sm");
  return (
    <button className={cls.join(" ")} onClick={onClick} disabled={disabled} type={type} title={title}>
      {children}
    </button>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`az-card ${className ?? ""}`}>{children}</div>;
}

export function CardHead({ title, sub, actions }: { title: React.ReactNode; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="az-card-head">
      <div className="az-card-title">
        {title}
        {sub && <small>{sub}</small>}
      </div>
      {actions && <div className="az-row">{actions}</div>}
    </div>
  );
}

export function SeverityChip({ severity, confidence }: { severity: Severity; confidence?: string }) {
  return (
    <span className={`az-chip az-chip-${severity}`}>
      <span className="az-dot" />
      {severity.toUpperCase()}
      {confidence && ` · ${confidence} conf`}
    </span>
  );
}

export function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "accent" | "outline" }) {
  return <span className={`az-chip az-chip-${tone}`}>{children}</span>;
}

export function Stat({ label, value, foot, accent }: { label: string; value: React.ReactNode; foot?: string; accent?: string }) {
  return (
    <div className="az-stat">
      <div className="az-stat-label">{label}</div>
      <div className="az-stat-value" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {foot && <div className="az-stat-foot">{foot}</div>}
    </div>
  );
}

export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="az-progress" aria-label={`progress ${pct}%`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Empty({ icon, title, sub }: { icon?: string; title: string; sub?: string }) {
  return (
    <div className="az-empty">
      {icon && <div className="az-empty-ico">{icon}</div>}
      <div style={{ fontWeight: 600, color: "var(--az-text-2)" }}>{title}</div>
      {sub && <div style={{ fontSize: 13, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function Spinner() {
  return <span className="az-spinner" />;
}

export function Drawer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="az-overlay" onClick={onClose} />
      <aside className="az-drawer" role="dialog" aria-modal="true">
        {children}
      </aside>
    </>
  );
}

// --- Toasts ---
interface Toast {
  id: number;
  msg: string;
  tone: "ok" | "bad" | "info";
}
const ToastCtx = createContext<(msg: string, tone?: "ok" | "bad" | "info") => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((msg: string, tone: "ok" | "bad" | "info" = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="az-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`az-toast ${t.tone === "info" ? "" : t.tone}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
