import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Audit, Doc } from "../types";
import { Button, Card, CardHead, Chip, Empty, Spinner, useToast } from "../components";

export function Documents({ onOpenAudit, onIngest }: { onOpenAudit: (id: string) => void; onIngest: () => void }) {
  const toast = useToast();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { docs } = await api<{ docs: Doc[] }>("/api/docs");
    setDocs(docs);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => (prev.size === docs.length ? new Set() : new Set(docs.map((d) => d.id))));

  const loadDemo = async () => {
    setBusy(true);
    try {
      const { docs: seeded } = await api<{ docs: Doc[] }>("/api/demo/seed", { method: "POST" });
      toast(`Loaded ${seeded.length} demo documents`, "ok");
      await load();
      setSelected(new Set(seeded.map((d) => d.id)));
    } catch (e: any) {
      toast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  };

  const runAudit = async () => {
    setBusy(true);
    try {
      const { audit } = await api<{ audit: Audit }>("/api/audits", { method: "POST", body: { docIds: [...selected] } });
      toast("Audit started", "ok");
      onOpenAudit(audit.id);
    } catch (e: any) {
      toast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  };

  const docById = new Map(docs.map((d) => [d.id, d]));

  return (
    <Card>
      <CardHead
        title="Documents"
        sub={`${docs.length} ingested`}
        actions={
          <>
            <Button onClick={loadDemo} disabled={busy}>
              {busy ? <Spinner /> : "⬇"} Load demo data
            </Button>
            <Button onClick={onIngest}>+ Ingest</Button>
            <Button variant="primary" onClick={runAudit} disabled={busy || selected.size < 1}>
              Run audit ({selected.size})
            </Button>
          </>
        }
      />
      {loading ? (
        <div className="az-empty">
          <Spinner />
        </div>
      ) : docs.length === 0 ? (
        <Empty
          icon="📄"
          title="No documents yet"
          sub="Click “Load demo data” for a ready-made policy set, or ingest your own."
        />
      ) : (
        <div className="az-table-scroll">
          <table className="az-table">
            <thead>
              <tr>
                <th style={{ width: 34 }}>
                  <input type="checkbox" checked={selected.size === docs.length} onChange={toggleAll} />
                </th>
                <th>Title</th>
                <th>Type</th>
                <th>Version</th>
                <th>Access tier</th>
                <th>Prior version</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
                  </td>
                  <td style={{ fontWeight: 550 }}>{d.title}</td>
                  <td>
                    <Chip tone="outline">{d.docType}</Chip>
                  </td>
                  <td className="az-mono">{d.version}</td>
                  <td style={{ color: "var(--az-text-2)" }}>{d.accessTier}</td>
                  <td style={{ color: "var(--az-text-3)" }}>
                    {d.previousDocumentId ? docById.get(d.previousDocumentId)?.version ?? "linked" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
