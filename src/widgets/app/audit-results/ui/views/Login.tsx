import React, { useState } from "react";
import { authenticate } from "../api";
import { Button } from "../components";
import { ThemeName } from "../theme";

export function Login({ onAuthed, theme, toggleTheme }: { onAuthed: () => void; theme: ThemeName; toggleTheme: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authenticate(mode, email, password);
      onAuthed();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="az-auth-wrap">
      <div style={{ position: "fixed", top: 16, right: 16 }}>
        <Button variant="ghost" onClick={toggleTheme}>
          {theme === "dark" ? "☀ Light" : "🌙 Dark"}
        </Button>
      </div>
      <div className="az-auth-card">
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div className="az-brand-mark" style={{ width: 44, height: 44, margin: "0 auto 12px", fontSize: 20, borderRadius: 12 }}>
            AZ
          </div>
          <h1 style={{ fontSize: 22, margin: "0 0 4px", letterSpacing: "-.02em" }}>Auditor Zero</h1>
          <p style={{ color: "var(--az-text-3)", margin: 0, fontSize: 13.5 }}>
            Contradiction &amp; vanished-clause auditing with a keyed, tamper-proof Black Box.
          </p>
        </div>
        <div className="az-card az-card-pad">
          <div className="az-seg" style={{ marginBottom: 16, width: "100%" }}>
            <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")} style={{ flex: 1 }}>
              Sign in
            </button>
            <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")} style={{ flex: 1 }}>
              Create account
            </button>
          </div>
          <form onSubmit={submit}>
            <div className="az-field">
              <label className="az-label">Email</label>
              <input className="az-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
            </div>
            <div className="az-field">
              <label className="az-label">Password</label>
              <input className="az-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
            </Button>
            {error && <p style={{ color: "var(--az-danger)", fontSize: 13, marginBottom: 0 }}>{error}</p>}
          </form>
          <p style={{ marginTop: 14, marginBottom: 0, fontSize: 12, color: "var(--az-text-3)" }}>
            Demo — create any account, or reuse{" "}
            <code className="az-mono">demo@auditor-zero.local</code> / <code className="az-mono">demo-password</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
