import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Doc } from "../types";
import { Button, Card, CardHead, useToast } from "../components";

export function Ingest({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("policy");
  const [version, setVersion] = useState("v1");
  const [accessTier, setAccessTier] = useState("tier-1");
  const [previousDocumentId, setPreviousDocumentId] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  const loadDocs = useCallback(async () => {
    const { docs } = await api<{ docs: Doc[] }>("/api/docs");
    setDocs(docs);
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/docs", {
        method: "POST",
        body: { title, docType, version, accessTier, content, previousDocumentId: previousDocumentId || null },
      });
      toast("Document ingested", "ok");
      setTitle("");
      setContent("");
      await loadDocs();
    } catch (err: any) {
      toast(err.message, "bad");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHead
        title="Ingest a document"
        sub="Tag its version and optionally link a prior version for cross-version comparison"
        actions={<Button onClick={onDone}>← Back to documents</Button>}
      />
      <form onSubmit={submit} className="az-card-pad">
        <div className="az-field">
          <label className="az-label">Title</label>
          <input className="az-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Remote Access Security Policy (v2)" required />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          <div className="az-field">
            <label className="az-label">Doc type</label>
            <input className="az-input" value={docType} onChange={(e) => setDocType(e.target.value)} placeholder="policy" required />
          </div>
          <div className="az-field">
            <label className="az-label">Version</label>
            <input className="az-input" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v1" required />
          </div>
          <div className="az-field">
            <label className="az-label">Access tier</label>
            <input className="az-input" value={accessTier} onChange={(e) => setAccessTier(e.target.value)} placeholder="tier-1" required />
          </div>
        </div>
        <div className="az-field">
          <label className="az-label">Prior version (optional)</label>
          <select className="az-select" value={previousDocumentId} onChange={(e) => setPreviousDocumentId(e.target.value)}>
            <option value="">— none —</option>
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} ({d.version})
              </option>
            ))}
          </select>
        </div>
        <div className="az-field">
          <label className="az-label">Content</label>
          <textarea className="az-textarea" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Paste the document text here…" required />
        </div>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Ingesting…" : "Ingest document"}
        </Button>
      </form>
    </Card>
  );
}
