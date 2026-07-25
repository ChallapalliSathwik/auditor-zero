import { v4 as uuid } from "uuid";
import { db } from "../../db";
import { completeJSON } from "../../lib/llm";
import { logDecision } from "./blackbox.service";
import { Audit, Confidence, DetectionMethod, Doc, Finding, Severity } from "./types";

// ---------------------------------------------------------------------------
// Doc / Audit persistence helpers
// ---------------------------------------------------------------------------

/** Next monotonic ingestion sequence — the reliable ordering signal for versions. */
function nextDocSeq(): number {
  const row = db.prepare(`SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM docs`).get() as { next: number };
  return row.next;
}

export function ingestDocument(
  doc: Omit<Doc, "id" | "createdAt" | "seq" | "previousDocumentId"> & { previousDocumentId?: string | null }
): Doc {
  const record: Doc = {
    ...doc,
    id: uuid(),
    createdAt: new Date().toISOString(),
    seq: nextDocSeq(),
    previousDocumentId: doc.previousDocumentId ?? null,
  };
  db.prepare(
    `INSERT INTO docs (id, title, doc_type, version, access_tier, content, created_at, seq, previous_document_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    record.id,
    record.title,
    record.docType,
    record.version,
    record.accessTier,
    record.content,
    record.createdAt,
    record.seq,
    record.previousDocumentId
  );
  return record;
}

export function getDoc(id: string): Doc | null {
  const row = db.prepare(`SELECT * FROM docs WHERE id = ?`).get(id) as any;
  return row ? rowToDoc(row) : null;
}

export function listDocs(): Doc[] {
  return (db.prepare(`SELECT * FROM docs ORDER BY created_at ASC`).all() as any[]).map(rowToDoc);
}

function rowToDoc(row: any): Doc {
  return {
    id: row.id,
    title: row.title,
    docType: row.doc_type,
    version: row.version,
    accessTier: row.access_tier,
    content: row.content,
    createdAt: row.created_at,
    seq: row.seq ?? 0,
    previousDocumentId: row.previous_document_id ?? null,
  };
}

function rowToFinding(row: any): Finding {
  return {
    id: row.id,
    auditId: row.audit_id,
    type: row.type,
    docIds: JSON.parse(row.doc_ids),
    explanation: row.explanation,
    severity: row.severity,
    confidence: row.confidence,
    severityJustification: row.severity_justification,
    detectionMethod: row.detection_method ?? "semantic-llm",
    createdAt: row.created_at,
  };
}

function rowToAudit(row: any): Audit {
  return {
    id: row.id,
    docIds: JSON.parse(row.doc_ids),
    status: row.status,
    findingIds: JSON.parse(row.finding_ids),
    createdAt: row.created_at,
    completedAt: row.completed_at,
    progressDone: row.progress_done ?? 0,
    progressTotal: row.progress_total ?? 0,
    error: row.error ?? null,
  };
}

export function getAudit(id: string): Audit | null {
  const row = db.prepare(`SELECT * FROM audits WHERE id = ?`).get(id) as any;
  return row ? rowToAudit(row) : null;
}

export function listAudits(): Audit[] {
  return (db.prepare(`SELECT * FROM audits ORDER BY created_at DESC`).all() as any[]).map(rowToAudit);
}

export function getFindingsForAudit(auditId: string): Finding[] {
  return (db.prepare(`SELECT * FROM findings WHERE audit_id = ?`).all(auditId) as any[]).map(rowToFinding);
}

export function getFinding(id: string): Finding | null {
  const row = db.prepare(`SELECT * FROM findings WHERE id = ?`).get(id) as any;
  return row ? rowToFinding(row) : null;
}

function saveFinding(f: Finding): void {
  db.prepare(
    `INSERT INTO findings (id, audit_id, type, doc_ids, explanation, severity, confidence, severity_justification, detection_method, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    f.id,
    f.auditId,
    f.type,
    JSON.stringify(f.docIds),
    f.explanation,
    f.severity,
    f.confidence,
    f.severityJustification,
    f.detectionMethod,
    f.createdAt
  );
}

// ---------------------------------------------------------------------------
// Concurrency + progress helpers
// ---------------------------------------------------------------------------

/** Runs `fn` over `items` with at most `limit` in flight — speeds up the LLM-bound pipeline. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function setProgress(auditId: string, done: number, total: number): void {
  db.prepare(`UPDATE audits SET progress_done = ?, progress_total = ? WHERE id = ?`).run(done, total, auditId);
}

function bumpProgress(auditId: string): void {
  db.prepare(`UPDATE audits SET progress_done = progress_done + 1 WHERE id = ?`).run(auditId);
}

// ---------------------------------------------------------------------------
// Clause extraction (cheap pre-filter — NOT the judgment itself)
// ---------------------------------------------------------------------------

const OBLIGATION_KEYWORDS = /\b(must|shall|required|allowed|permitted|prohibited|not\s+permitted)\b/i;

function extractCandidateClauses(doc: Doc): string[] {
  return doc.content
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15 && OBLIGATION_KEYWORDS.test(s));
}

// ---------------------------------------------------------------------------
// Deterministic numeric-value conflict detection
//
// A negation-word engine misses "rotate passwords every 90 days" vs "every 180
// days" — both are affirmative, yet they contradict. We extract numeric facts
// tagged by unit, and when two topically-related clauses assert a different
// value for the SAME unit we flag a contradiction with the exact numbers shown,
// so the finding stays fully explainable (no opaque model call needed).
// ---------------------------------------------------------------------------

type Unit = "usd" | "percent" | "day" | "hour" | "week" | "month" | "year";

interface NumericFact {
  unit: Unit;
  value: number;
  raw: string;
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "at", "by", "with", "is", "are",
  "be", "must", "shall", "not", "no", "any", "all", "this", "that", "which", "within", "per",
  "used", "using", "may", "can", "will", "each", "every", "than", "least", "most", "up", "as",
]);

function extractNumericFacts(clause: string): NumericFact[] {
  const facts: NumericFact[] = [];
  const money = clause.matchAll(/\$\s?([\d,]+(?:\.\d+)?)/g);
  for (const m of money) facts.push({ unit: "usd", value: parseFloat(m[1].replace(/,/g, "")), raw: m[0] });
  const percent = clause.matchAll(/(\d+(?:\.\d+)?)\s?%/g);
  for (const m of percent) facts.push({ unit: "percent", value: parseFloat(m[1]), raw: m[0] });
  const durations = clause.matchAll(/(\d+(?:\.\d+)?)\s?(day|hour|week|month|year)s?\b/gi);
  for (const m of durations) {
    facts.push({ unit: m[2].toLowerCase() as Unit, value: parseFloat(m[1]), raw: m[0] });
  }
  return facts;
}

function significantTokens(clause: string): Set<string> {
  return new Set(
    clause
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t))
  );
}

/** Jaccard overlap of significant (topic) tokens — gates comparison to related clauses. */
function topicOverlap(clauseA: string, clauseB: string): number {
  const a = significantTokens(clauseA);
  const b = significantTokens(clauseB);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

/** Stable key from the topic two clauses share — used to dedupe the same conflict found across versions. */
function sharedTopicKey(clauseA: string, clauseB: string): string {
  const b = significantTokens(clauseB);
  const shared = [...significantTokens(clauseA)].filter((t) => b.has(t)).sort();
  return shared.slice(0, 4).join("-");
}

// Minimum topic overlap before we spend an LLM call comparing two clauses. Below
// this the clauses are about different things and "strict vs lax" is not a real
// contradiction, so we never ask.
const SEMANTIC_TOPIC_THRESHOLD = 0.12;

interface NumericConflict {
  explanation: string;
  unit: Unit;
  lo: number;
  hi: number;
}

/**
 * Returns a structured conflict if two clauses are topically related but assert
 * different values for the same unit; otherwise null. The (lo, hi) pair gives a
 * value-signature used to dedupe the same real conflict across document pairs.
 */
function detectNumericConflict(clauseA: string, clauseB: string): NumericConflict | null {
  if (topicOverlap(clauseA, clauseB) < 0.12) return null;
  const factsA = extractNumericFacts(clauseA);
  const factsB = extractNumericFacts(clauseB);
  for (const fa of factsA) {
    for (const fb of factsB) {
      if (fa.unit === fb.unit && fa.value !== fb.value) {
        return {
          explanation: `Conflicting ${fa.unit} value on the same requirement: one clause states "${fa.raw}" while the other states "${fb.raw}".`,
          unit: fa.unit,
          lo: Math.min(fa.value, fb.value),
          hi: Math.max(fa.value, fb.value),
        };
      }
    }
  }
  return null;
}

/** Extracts distinct numbers from free text (for cross-method dedupe of numeric changes). */
function numbersIn(text: string): number[] {
  const matches = text.match(/\d+(?:\.\d+)?/g) ?? [];
  return [...new Set(matches.map(Number))];
}

// ---------------------------------------------------------------------------
// ReasoningAgent — turns an LLM explanation into severity/confidence
// ---------------------------------------------------------------------------

interface ScoreResult {
  severity: Severity;
  confidence: Confidence;
  justification: string;
}

async function scoreFinding(auditId: string, type: string, explanation: string): Promise<ScoreResult> {
  const input = { type, explanation };
  const result = await completeJSON<ScoreResult>(
    `A document audit produced this ${type} finding:\n"${explanation}"\n\n` +
      `Assign a severity (low/medium/high) based on real-world impact if unresolved, and a confidence ` +
      `(low/medium/high) based on how clearly the evidence supports the finding. Return JSON exactly as: ` +
      `{"severity": "...", "confidence": "...", "justification": "one sentence"}`
  );
  logDecision({ auditId, agentName: "ReasoningAgent", input, output: result });
  return result;
}

// ---------------------------------------------------------------------------
// ContradictionAgent — semantic comparison via LLM
// ---------------------------------------------------------------------------

interface CompareResult {
  verdict: "consistent" | "contradictory" | "unrelated";
  explanation: string;
}

async function compareClausesSemantic(clauseA: string, clauseB: string): Promise<CompareResult> {
  return completeJSON<CompareResult>(
    `Statement A: "${clauseA}"\nStatement B: "${clauseB}"\n\n` +
      `Are these two policy statements consistent, contradictory, or unrelated? ` +
      `Return JSON exactly as: {"verdict": "consistent"|"contradictory"|"unrelated", "explanation": "one sentence"}`
  );
}

// ---------------------------------------------------------------------------
// Deduplication — the same real issue can surface from several clause pairs and
// from more than one detector (a 90→180 change is both a numeric conflict and a
// version change). A per-audit signature registry keeps exactly one finding per
// underlying issue. Reservation is synchronous, so it stays correct even while
// clause comparisons run concurrently.
// ---------------------------------------------------------------------------

const auditSignatures = new Map<string, Set<string>>();

function reserveSignature(auditId: string, sig: string): boolean {
  let set = auditSignatures.get(auditId);
  if (!set) {
    set = new Set();
    auditSignatures.set(auditId, set);
  }
  if (set.has(sig)) return false;
  set.add(sig);
  return true;
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function persistContradiction(
  auditId: string,
  docIds: string[],
  explanation: string,
  detectionMethod: DetectionMethod,
  signature: string
): Promise<Finding | null> {
  // Reserve synchronously (before any await) so concurrent workers can't both persist.
  if (!reserveSignature(auditId, signature)) return null;
  const score = await scoreFinding(auditId, "contradiction", explanation);
  const finding: Finding = {
    id: uuid(),
    auditId,
    type: "contradiction",
    docIds,
    explanation,
    severity: score.severity,
    confidence: score.confidence,
    severityJustification: score.justification,
    detectionMethod,
    createdAt: new Date().toISOString(),
  };
  saveFinding(finding);
  return finding;
}

interface ClausePair {
  docA: Doc;
  docB: Doc;
  clauseA: string;
  clauseB: string;
  sameLineage: boolean; // different versions of the same document family
}

/**
 * Builds the clause pairs the ContradictionAgent will judge: every obligation
 * clause of one document against every obligation clause of another (plus
 * self-pairs within a document). Consecutive-version semantics are the diff
 * agent's job, so same-lineage pairs are only numeric-checked, never sent to
 * the LLM here.
 */
function buildContradictionPairs(docs: Doc[]): ClausePair[] {
  const pairs: ClausePair[] = [];
  const clauses = docs.map(extractCandidateClauses);
  for (let i = 0; i < docs.length; i++) {
    for (let j = i; j < docs.length; j++) {
      const sameLineage = i !== j && docs[i].docType === docs[j].docType;
      for (let a = 0; a < clauses[i].length; a++) {
        const startB = i === j ? a + 1 : 0;
        for (let b = startB; b < clauses[j].length; b++) {
          pairs.push({ docA: docs[i], docB: docs[j], clauseA: clauses[i][a], clauseB: clauses[j][b], sameLineage });
        }
      }
    }
  }
  return pairs;
}

// Runs the deterministic numeric check on every pair and an LLM semantic check
// on cross-document / within-document pairs, with bounded concurrency.
async function findContradictions(auditId: string, pairs: ClausePair[]): Promise<Finding[]> {
  const results = await mapWithConcurrency(pairs, 5, async (pair): Promise<Finding | null> => {
    const { docA, docB, clauseA, clauseB, sameLineage } = pair;
    try {
      const numeric = detectNumericConflict(clauseA, clauseB);
      if (numeric) {
        logDecision({
          auditId,
          agentName: "ContradictionAgent",
          input: { docA: docA.id, docB: docB.id, clauseA, clauseB, detector: "numeric" },
          output: { verdict: "contradictory", explanation: numeric.explanation },
        });
        return await persistContradiction(
          auditId,
          [docA.id, docB.id],
          numeric.explanation,
          "numeric-value-conflict",
          `numv:${numeric.lo}:${numeric.hi}`
        );
      }

      // Same-lineage semantics are handled by the diff agent; skip the LLM here.
      if (sameLineage) return null;
      // Only ask the LLM about clauses that are actually about the same topic.
      if (topicOverlap(clauseA, clauseB) < SEMANTIC_TOPIC_THRESHOLD) return null;

      const result = await compareClausesSemantic(clauseA, clauseB);
      logDecision({
        auditId,
        agentName: "ContradictionAgent",
        input: { docA: docA.id, docB: docB.id, clauseA, clauseB, detector: "semantic" },
        output: result,
      });
      if (result.verdict === "contradictory") {
        // Dedupe by the document families + shared topic, so the same cross-document
        // conflict is reported once even when it recurs against several versions.
        const sig = `sem:${[docA.docType, docB.docType].sort().join("|")}:${sharedTopicKey(clauseA, clauseB)}`;
        return await persistContradiction(auditId, [docA.id, docB.id], result.explanation, "semantic-llm", sig);
      }
      return null;
    } finally {
      bumpProgress(auditId);
    }
  });
  return results.filter((f): f is Finding => f !== null);
}

// ---------------------------------------------------------------------------
// DisappearanceAgent — obligations present in OLD but missing/weakened in NEW
// ---------------------------------------------------------------------------

interface VersionDiffResult {
  // Obligation categories present in OLD but entirely absent from NEW.
  removed: { obligation: string; explanation: string }[];
  // Obligations that still exist but whose terms/wording materially changed.
  changed: { obligation: string; oldTerm: string; newTerm: string; explanation: string }[];
}

/**
 * Orders a set of documents into version lineages. Ordering is driven by the
 * monotonic ingestion `seq` (and explicit previousDocumentId links) — never by
 * parsing the version string, so "v1/v2" vs "1.0/1.10" naming can't break it.
 */
function buildVersionChains(docs: Doc[]): Doc[][] {
  const byType = new Map<string, Doc[]>();
  for (const d of docs) {
    const list = byType.get(d.docType) ?? [];
    list.push(d);
    byType.set(d.docType, list);
  }
  const chains: Doc[][] = [];
  for (const [, versions] of byType) {
    if (versions.length < 2) continue;
    chains.push([...versions].sort((a, b) => a.seq - b.seq));
  }
  return chains;
}

interface VersionPair {
  oldDoc: Doc;
  newDoc: Doc;
}

/** Consecutive version pairs across every lineage, ordered by ingestion seq. */
function buildVersionPairs(docs: Doc[]): VersionPair[] {
  const pairs: VersionPair[] = [];
  for (const chain of buildVersionChains(docs)) {
    for (let k = 1; k < chain.length; k++) {
      pairs.push({ oldDoc: chain[k - 1], newDoc: chain[k] });
    }
  }
  return pairs;
}

// Diffs consecutive versions. A category that vanished entirely is a
// disappearance; an obligation whose terms changed is routed to a cross-version
// contradiction — unless the change is purely numeric and already reported by
// the deterministic numeric detector, in which case it is deduped away.
async function findDisappearances(auditId: string, versionPairs: VersionPair[]): Promise<Finding[]> {
  const nested = await mapWithConcurrency(versionPairs, 3, async ({ oldDoc, newDoc }): Promise<Finding[]> => {
    const out: Finding[] = [];
    try {
      const input = { oldDoc: oldDoc.id, newDoc: newDoc.id };
      const result = await completeJSON<VersionDiffResult>(
        `OLD document version:\n"""${oldDoc.content}"""\n\nNEW document version:\n"""${newDoc.content}"""\n\n` +
          `Compare the two versions and classify each material difference into exactly one bucket:\n` +
          `- "removed": an obligation, risk factor, or commitment category that is present in OLD and ` +
          `ENTIRELY ABSENT from NEW (not merely reworded).\n` +
          `- "changed": an obligation that still appears in NEW but whose terms, thresholds, or strength ` +
          `materially changed. Include the OLD term and the NEW term.\n` +
          `Ignore pure copy-editing that does not change meaning. Return JSON exactly as: ` +
          `{"removed": [{"obligation": "...", "explanation": "..."}], ` +
          `"changed": [{"obligation": "...", "oldTerm": "...", "newTerm": "...", "explanation": "..."}]}`
      );
      logDecision({ auditId, agentName: "DisappearanceAgent", input, output: result });

      for (const d of result.removed ?? []) {
        if (!reserveSignature(auditId, `rem:${normalizeText(d.obligation)}`)) continue;
        const score = await scoreFinding(auditId, "disappearance", d.explanation);
        const finding: Finding = {
          id: uuid(),
          auditId,
          type: "disappearance",
          docIds: [oldDoc.id, newDoc.id],
          explanation: `${d.obligation} — ${d.explanation}`,
          severity: score.severity,
          confidence: score.confidence,
          severityJustification: score.justification,
          detectionMethod: "category-removed",
          createdAt: new Date().toISOString(),
        };
        saveFinding(finding);
        out.push(finding);
      }

      for (const c of result.changed ?? []) {
        // A purely numeric change is the deterministic detector's territory; if it
        // already reserved that value pair, don't double-report it here.
        const nums = numbersIn(`${c.oldTerm} ${c.newTerm}`);
        const signature =
          nums.length >= 2 ? `numv:${Math.min(...nums)}:${Math.max(...nums)}` : `cvs:${normalizeText(c.obligation)}`;
        const explanation = `${c.obligation}: "${c.oldTerm}" → "${c.newTerm}" — ${c.explanation}`;
        const finding = await persistContradiction(
          auditId,
          [oldDoc.id, newDoc.id],
          explanation,
          "cross-version-semantic",
          signature
        );
        if (finding) out.push(finding);
      }
      return out;
    } finally {
      bumpProgress(auditId);
    }
  });
  return nested.flat();
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

function createAuditRow(docIds: string[]): string {
  const auditId = uuid();
  db.prepare(
    `INSERT INTO audits (id, doc_ids, status, finding_ids, created_at, completed_at, progress_done, progress_total, error)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, NULL)`
  ).run(auditId, JSON.stringify(docIds), "running", JSON.stringify([]), new Date().toISOString(), null);
  return auditId;
}

async function runPipeline(auditId: string, docIds: string[]): Promise<void> {
  const docs = docIds.map(getDoc).filter((d): d is Doc => d !== null);

  logDecision({
    auditId,
    agentName: "IngestionAgent",
    input: { docIds },
    output: { ingestedCount: docs.length, titles: docs.map((d) => d.title) },
  });

  try {
    const contradictionPairs = buildContradictionPairs(docs);
    const versionPairs = buildVersionPairs(docs);
    setProgress(auditId, 0, contradictionPairs.length + versionPairs.length);

    const contradictions = await findContradictions(auditId, contradictionPairs);
    const disappearances = await findDisappearances(auditId, versionPairs);
    const allFindings = [...contradictions, ...disappearances];

    db.prepare(`UPDATE audits SET status = ?, finding_ids = ?, completed_at = ? WHERE id = ?`).run(
      "complete",
      JSON.stringify(allFindings.map((f) => f.id)),
      new Date().toISOString(),
      auditId
    );
  } catch (err: any) {
    db.prepare(`UPDATE audits SET status = ?, error = ? WHERE id = ?`).run("failed", String(err?.message ?? err), auditId);
    throw err;
  } finally {
    auditSignatures.delete(auditId);
  }
}

/** Runs the full pipeline to completion and returns the finished audit (used by the MCP tool). */
export async function analyzeDocuments(docIds: string[]): Promise<Audit> {
  const auditId = createAuditRow(docIds);
  await runPipeline(auditId, docIds);
  return getAudit(auditId)!;
}

/** Kicks off the pipeline in the background and returns the running audit immediately (used by REST for live progress). */
export function startAudit(docIds: string[]): Audit {
  const auditId = createAuditRow(docIds);
  void runPipeline(auditId, docIds).catch((err) => {
    console.error(`[audit ${auditId}] pipeline failed:`, err);
  });
  return getAudit(auditId)!;
}
