import React, { useState } from "react";
import { clearToken, getToken } from "./api";
import { useTheme } from "./theme";
import { Button, ToastProvider } from "./components";
import { Login } from "./views/Login";
import { Dashboard } from "./views/Dashboard";
import { Documents } from "./views/Documents";
import { Ingest } from "./views/Ingest";
import { Results } from "./views/Results";

type View = "dashboard" | "documents" | "ingest" | "results";

const PAGE_META: Record<View, { title: string; sub: string }> = {
  dashboard: { title: "Overview", sub: "Audit activity and integrity at a glance" },
  documents: { title: "Documents", sub: "Ingest, select, and audit policy documents" },
  ingest: { title: "Ingest document", sub: "Add a document to the corpus" },
  results: { title: "Audit results", sub: "Findings with replayable, sealed provenance" },
};

function emailFromToken(): string {
  const token = getToken();
  if (!token) return "";
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.email || "";
  } catch {
    return "";
  }
}

function NavItem({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`az-nav-item ${active ? "active" : ""}`} onClick={onClick}>
      <span className="az-ico">{icon}</span>
      {label}
    </button>
  );
}

export function App() {
  const { theme, toggle } = useTheme();
  const [authed, setAuthed] = useState<boolean>(() => !!getToken());
  const [view, setView] = useState<View>("dashboard");
  const [openAuditId, setOpenAuditId] = useState<string | null>(null);

  if (!authed) {
    return (
      <ToastProvider>
        <Login onAuthed={() => setAuthed(true)} theme={theme} toggleTheme={toggle} />
      </ToastProvider>
    );
  }

  const email = emailFromToken();
  const meta = PAGE_META[view];
  const go = (v: View) => setView(v);
  const openAudit = (id: string) => {
    setOpenAuditId(id);
    setView("results");
  };

  return (
    <ToastProvider>
      <div className="az-app">
        <aside className="az-sidebar">
          <div className="az-brand">
            <div className="az-brand-mark">AZ</div>
            <div>
              <div className="az-brand-name">Auditor Zero</div>
              <div className="az-brand-sub">Black Box audit</div>
            </div>
          </div>
          <nav className="az-nav">
            <div className="az-nav-label">Workspace</div>
            <NavItem icon="◧" label="Overview" active={view === "dashboard"} onClick={() => go("dashboard")} />
            <NavItem icon="🗂" label="Documents" active={view === "documents"} onClick={() => go("documents")} />
            <NavItem icon="＋" label="Ingest" active={view === "ingest"} onClick={() => go("ingest")} />
            {openAuditId && (
              <NavItem icon="✔" label="Audit results" active={view === "results"} onClick={() => go("results")} />
            )}
          </nav>
          <div className="az-sidebar-foot">
            <div className="az-user">
              <div className="az-avatar">{(email[0] || "u").toUpperCase()}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {email || "user"}
                </div>
                <div style={{ fontSize: 11, color: "var(--az-text-3)" }}>auditor</div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clearToken();
                setAuthed(false);
              }}
            >
              Log out
            </Button>
          </div>
        </aside>

        <div className="az-main">
          <header className="az-topbar">
            <div>
              <div className="az-page-title">{meta.title}</div>
              <div className="az-page-sub">{meta.sub}</div>
            </div>
            <div className="az-row">
              <Button variant="ghost" onClick={toggle} title="Toggle theme">
                {theme === "dark" ? "☀" : "🌙"}
              </Button>
              <Button variant="primary" onClick={() => go("documents")}>
                + New audit
              </Button>
            </div>
          </header>

          <main className="az-content">
            {view === "dashboard" && <Dashboard onOpenAudit={openAudit} onNewAudit={() => go("documents")} />}
            {view === "documents" && <Documents onOpenAudit={openAudit} onIngest={() => go("ingest")} />}
            {view === "ingest" && <Ingest onDone={() => go("documents")} />}
            {view === "results" && openAuditId && <Results auditId={openAuditId} onBack={() => go("dashboard")} />}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
