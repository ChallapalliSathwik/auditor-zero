import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Audit, Doc, Finding } from "../types";
import { Button, Card, CardHead, Empty, Progress, SeverityChip, Spinner, Stat } from "../components";
import { shortId, timeAgo } from "../format";

export function Dashboard({ onOpenAudit, onNewAudit }: { onOpenAudit: (id: string) => void; onNewAudit: () => void }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [findingsByAudit, setFindingsByAudit] = useState<Record<string, Finding[]>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ docs }, { audits }] = await Promise.all([
      api<{ docs: Doc[] }>("/api/docs"),
      api<{ audits: Audit[] }>("/api/audits"),
    ]);
    setDocs(docs);
    setAudits(audits);
    const entries = await Promise.all(
      audits.map(async (a) => {
        try {
          const { findings } = await api<{ findings: Finding[] }>(`/api/audits/${a.id}`);
          return [a.id, findings] as const;
        } catch {
          return [a.id, [] as Finding[]] as const;
        }
      })
    );
    setFindingsByAudit(Object.fromEntries(entries));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 2500); // keep running audits fresh
    return () => clearInterval(t);
  }, [load]);

  const allFindings = Object.values(findingsByAudit).flat();
  const highCount = allFindings.filter((f) => f.severity === "high").length;
  const contradictions = allFindings.filter((f) => f.type === "contradiction").length;
  const disappearances = allFindings.filter((f) => f.type === "disappearance").length;

  return (
    <div className="az-grid" style={{ gap: 18 }}>
      <div className="az-stats">
        <Stat label="Documents" value={docs.length} foot="ingested" />
        <Stat label="Audits" value={audits.length} foot={`${audits.filter((a) => a.status === "running").length} running`} />
        <Stat label="Contradictions" value={contradictions} accent="var(--az-warn)" foot="across all audits" />
        <Stat label="High severity" value={highCount} accent="var(--az-danger)" foot={`${disappearances} disappearances`} />
      </div>

      <Card>
        <CardHead
          title="Recent audits"
          sub={loading ? undefined : `${audits.length} total`}
          actions={
            <Button variant="primary" onClick={onNewAudit}>
              + New audit
            </Button>
          }
        />
        {loading ? (
          <div className="az-empty">
            <Spinner /> <span style={{ marginLeft: 8 }}>Loading…</span>
          </div>
        ) : audits.length === 0 ? (
          <Empty icon="📋" title="No audits yet" sub="Start a new audit to detect contradictions and vanished clauses." />
        ) : (
          <div className="az-table-scroll">
            <table className="az-table">
              <thead>
                <tr>
                  <th>Audit</th>
                  <th>Status</th>
                  <th>Findings</th>
                  <th>Top severity</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {audits.map((a) => {
                  const fs = findingsByAudit[a.id] ?? [];
                  const top = fs.some((f) => f.severity === "high")
                    ? "high"
                    : fs.some((f) => f.severity === "medium")
                    ? "medium"
                    : fs.length
                    ? "low"
                    : null;
                  return (
                    <tr key={a.id} style={{ cursor: "pointer" }} onClick={() => onOpenAudit(a.id)}>
                      <td className="az-mono">{shortId(a.id)}</td>
                      <td>
                        {a.status === "running" ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120 }}>
                            <Progress done={a.progressDone} total={a.progressTotal} />
                            <span style={{ fontSize: 11, color: "var(--az-text-3)" }}>
                              {a.progressTotal ? Math.round((a.progressDone / a.progressTotal) * 100) : 0}%
                            </span>
                          </div>
                        ) : a.status === "failed" ? (
                          <span style={{ color: "var(--az-danger)" }}>failed</span>
                        ) : (
                          <span style={{ color: "var(--az-success)" }}>complete</span>
                        )}
                      </td>
                      <td className="az-tnum">{fs.length}</td>
                      <td>{top ? <SeverityChip severity={top as any} /> : <span style={{ color: "var(--az-text-3)" }}>—</span>}</td>
                      <td style={{ color: "var(--az-text-3)" }}>{timeAgo(a.createdAt)}</td>
                      <td>
                        <Button size="sm" onClick={() => onOpenAudit(a.id)}>
                          Open →
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
