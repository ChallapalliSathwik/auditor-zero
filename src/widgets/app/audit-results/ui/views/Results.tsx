import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Audit, DETECTION_LABELS, DecisionRecord, Finding, ReplayResult } from "../types";
import { Button, Card, CardHead, Chip, Drawer, Empty, Progress, SeverityChip, Spinner, Stat, useToast } from "../components";
import { clockTime, shortHash, shortId, summarize } from "../format";

// ---------------------------------------------------------------------------
// Replay drawer — step through the sealed chain, verify it, and (dev-only)
// tamper a record to watch verification catch it.
// ---------------------------------------------------------------------------

function ReplayDrawer({ finding, onClose }: { finding: Finding; onClose: () => void }) {
  const toast = useToast();
  const [records, setRecords] = useState<DecisionRecord[]>([]);
  const [replay, setReplay] = useState<ReplayResult | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [devTools, setDevTools] = useState(false);

  const loadTrail = useCallback(async () => {
    setLoading(true);
    try {
      const { records } = await api<{ records: DecisionRecord[] }>(
        `/api/audits/${finding.auditId}/trail?findingId=${finding.id}`
      );
      setRecords(records);
      setStep(records.length ? 1 : 0);
    } catch (e: any) {
      toast(e.message, "bad");
    } finally {
      setLoading(false);
    }
  }, [finding.auditId, finding.id, toast]);

  useEffect(() => {
    loadTrail();
  }, [loadTrail]);

  const runVerify = async () => {
    setVerifying(true);
    try {
      const result = await api<ReplayResult>(`/api/audits/${finding.auditId}/verify?findingId=${finding.id}`);
      setReplay(result);
      setRecords(result.records);
      setStep(result.records.length);
      toast(result.verified ? "Integrity verified" : "Tampering detected", result.verified ? "ok" : "bad");
    } catch (e: any) {
      toast(e.message, "bad");
    } finally {
      setVerifying(false);
    }
  };

  const tamper = async (recordId: string) => {
    try {
      await api("/api/tamper", { method: "POST", body: { recordId, newOutput: { verdict: "consistent", note: "edited" } } });
      toast("Record edited in place — now re-verify", "info");
      await runVerify();
    } catch (e: any) {
      toast(e.message, "bad");
    }
  };

  const shown = records.slice(0, step);
  const rootHash = records.length ? records[records.length - 1].hash : "—";

  return (
    <Drawer onClose={onClose}>
      <div className="az-drawer-head">
        <div>
          <div style={{ fontSize: 15, fontWeight: 650 }}>Decision Replay</div>
          <div style={{ fontSize: 12.5, color: "var(--az-text-3)" }}>
            HMAC-sealed Black Box ledger · {records.length} records
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          ✕
        </Button>
      </div>
      <div className="az-drawer-body">
        <div style={{ marginBottom: 14 }}>
          <SeverityChip severity={finding.severity} confidence={finding.confidence} />{" "}
          <Chip tone="accent">{DETECTION_LABELS[finding.detectionMethod]}</Chip>
          <p style={{ fontSize: 13.5, margin: "10px 0 0" }}>{finding.explanation}</p>
        </div>

        {replay && (
          <div className={`az-banner ${replay.verified ? "az-banner-ok" : "az-banner-bad"}`} style={{ marginBottom: 14 }}>
            {replay.verified ? "✓ Integrity verified — chain intact from GENESIS" : "✕ Tampering detected — chain broken"}
          </div>
        )}

        <div className="az-row" style={{ marginBottom: 14 }}>
          <Button size="sm" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step <= 1}>
            ‹ Prev
          </Button>
          <Button size="sm" onClick={() => setStep((s) => Math.min(records.length, s + 1))} disabled={step >= records.length}>
            Next ›
          </Button>
          <Button size="sm" onClick={() => setStep(records.length)} disabled={step >= records.length}>
            Reveal all
          </Button>
          <span style={{ fontSize: 12, color: "var(--az-text-3)" }}>
            {step}/{records.length}
          </span>
          <span className="az-spacer" />
          <Button variant="primary" size="sm" onClick={runVerify} disabled={verifying}>
            {verifying ? "Verifying…" : "Verify integrity"}
          </Button>
        </div>

        <div style={{ fontSize: 11.5, color: "var(--az-text-3)", marginBottom: 14 }}>
          Root hash <span className="az-mono">{shortHash(rootHash)}</span>
        </div>

        {loading ? (
          <div className="az-empty">
            <Spinner />
          </div>
        ) : records.length === 0 ? (
          <Empty title="No ledger records" />
        ) : (
          <div className="az-timeline">
            {shown.map((r) => {
              const broken = replay?.brokenAt === r.id;
              return (
                <div className="az-node" key={r.id}>
                  <span className={`az-node-dot ${broken ? "broken" : ""}`} />
                  <div className="az-node-agent" style={broken ? { color: "var(--az-danger)" } : undefined}>
                    {r.agentName}
                    {broken && " — chain breaks here"}
                  </div>
                  <div className="az-node-io">in: {summarize(r.input)}</div>
                  <div className="az-node-io">out: {summarize(r.output)}</div>
                  <div className="az-row" style={{ gap: 8 }}>
                    <span className="az-node-hash az-mono">
                      {shortHash(r.hash)} · {clockTime(r.timestamp)}
                    </span>
                    {devTools && (
                      <Button variant="danger" size="sm" onClick={() => tamper(r.id)}>
                        Tamper
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <label style={{ display: "flex", gap: 7, alignItems: "center", marginTop: 18, fontSize: 12, color: "var(--az-text-3)" }}>
          <input type="checkbox" checked={devTools} onChange={(e) => setDevTools(e.target.checked)} />
          Show dev tools (tamper a record to demo detection)
        </label>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Results view
// ---------------------------------------------------------------------------

export function Results({ auditId, onBack }: { auditId: string; onBack: () => void }) {
  const toast = useToast();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [active, setActive] = useState<Finding | null>(null);
  const [integrity, setIntegrity] = useState<{ verified: boolean; root: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { audit, findings } = await api<{ audit: Audit; findings: Finding[] }>(`/api/audits/${auditId}`);
    setAudit(audit);
    setFindings(findings);
    setLoading(false);
    return audit.status;
  }, [auditId]);

  useEffect(() => {
    let timer: any;
    const tick = async () => {
      const status = await load().catch(() => "failed");
      if (status === "running") timer = setTimeout(tick, 1500);
    };
    tick();
    return () => clearTimeout(timer);
  }, [load]);

  const verifyAudit = async () => {
    try {
      const r = await api<ReplayResult>(`/api/audits/${auditId}/verify`);
      const root = r.records.length ? r.records[r.records.length - 1].hash : "—";
      setIntegrity({ verified: r.verified, root });
      toast(r.verified ? "Audit chain verified" : "Audit chain broken", r.verified ? "ok" : "bad");
    } catch (e: any) {
      toast(e.message, "bad");
    }
  };

  const stats = useMemo(
    () => ({
      total: findings.length,
      high: findings.filter((f) => f.severity === "high").length,
      contradictions: findings.filter((f) => f.type === "contradiction").length,
      disappearances: findings.filter((f) => f.type === "disappearance").length,
    }),
    [findings]
  );

  const running = audit?.status === "running";

  return (
    <div className="az-grid" style={{ gap: 18 }}>
      <div className="az-row">
        <Button onClick={onBack}>← Back</Button>
        <div>
          <div style={{ fontWeight: 650 }}>
            Audit <span className="az-mono">{shortId(auditId)}</span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--az-text-3)" }}>
            {running ? "Analysis in progress…" : audit?.status === "failed" ? "Failed" : "Analysis complete"}
          </div>
        </div>
        <span className="az-spacer" />
        {!running && (
          <Button variant="primary" onClick={verifyAudit}>
            Verify full chain
          </Button>
        )}
      </div>

      {running && audit && (
        <Card>
          <div className="az-card-pad">
            <div className="az-row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontWeight: 600 }}>Running detectors…</span>
              <span style={{ fontSize: 12.5, color: "var(--az-text-3)" }}>
                {audit.progressDone}/{audit.progressTotal} comparisons · {findings.length} findings so far
              </span>
            </div>
            <Progress done={audit.progressDone} total={audit.progressTotal} />
          </div>
        </Card>
      )}

      {integrity && (
        <div className={`az-banner ${integrity.verified ? "az-banner-ok" : "az-banner-bad"}`}>
          {integrity.verified ? "✓" : "✕"} Full-chain integrity {integrity.verified ? "verified" : "broken"} · root{" "}
          <span className="az-mono" style={{ marginLeft: 4 }}>
            {shortHash(integrity.root)}
          </span>
        </div>
      )}

      {!running && (
        <div className="az-stats">
          <Stat label="Findings" value={stats.total} />
          <Stat label="Contradictions" value={stats.contradictions} accent="var(--az-warn)" />
          <Stat label="Disappearances" value={stats.disappearances} accent="var(--az-accent)" />
          <Stat label="High severity" value={stats.high} accent="var(--az-danger)" />
        </div>
      )}

      <Card>
        <CardHead title="Findings" sub={loading ? undefined : `${findings.length}`} />
        {loading ? (
          <div className="az-empty">
            <Spinner />
          </div>
        ) : findings.length === 0 ? (
          <Empty icon={running ? "⏳" : "✓"} title={running ? "Scanning…" : "No conflicts found"} sub={running ? "Findings appear here as detectors complete." : undefined} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {findings.map((f, i) => (
              <div
                key={f.id}
                style={{
                  padding: "16px 18px",
                  borderTop: i === 0 ? "none" : "1px solid var(--az-border)",
                  display: "flex",
                  gap: 14,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="az-row" style={{ gap: 8, marginBottom: 6 }}>
                    <SeverityChip severity={f.severity} confidence={f.confidence} />
                    <Chip tone="accent">{DETECTION_LABELS[f.detectionMethod]}</Chip>
                    <Chip tone="outline">{f.type}</Chip>
                  </div>
                  <div style={{ fontSize: 13.5 }}>{f.explanation}</div>
                  <div style={{ fontSize: 12, color: "var(--az-text-3)", marginTop: 4 }}>Why flagged: {f.severityJustification}</div>
                </div>
                <Button size="sm" onClick={() => setActive(f)}>
                  Replay →
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {active && <ReplayDrawer finding={active} onClose={() => setActive(null)} />}
    </div>
  );
}
