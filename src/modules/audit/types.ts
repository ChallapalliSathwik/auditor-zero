export type Severity = "low" | "medium" | "high";
export type Confidence = "low" | "medium" | "high";
export type FindingType = "contradiction" | "disappearance";

/** How a finding was flagged — surfaced in the UI so every finding is explainable. */
export type DetectionMethod =
  | "numeric-value-conflict" // deterministic: same-topic clauses with differing numbers
  | "cross-version-semantic" // an obligation's wording materially changed between versions
  | "semantic-llm" // LLM judged two clauses contradictory
  | "category-removed"; // an obligation category present in an older version is gone entirely

export interface Doc {
  id: string;
  title: string;
  docType: string; // e.g. "policy", "risk-factor-filing"
  version: string; // e.g. "v1", "v2"
  accessTier: string; // e.g. "tier-1"
  content: string;
  createdAt: string;
  seq: number; // monotonic ingestion order — the source of truth for version ordering
  previousDocumentId: string | null; // explicit prior-version link, if supplied at ingest time
}

export interface Finding {
  id: string;
  auditId: string;
  type: FindingType;
  docIds: string[];
  explanation: string;
  severity: Severity;
  confidence: Confidence;
  severityJustification: string;
  detectionMethod: DetectionMethod;
  createdAt: string;
}

export interface Audit {
  id: string;
  docIds: string[];
  status: "pending" | "running" | "complete" | "failed";
  findingIds: string[];
  createdAt: string;
  completedAt: string | null;
  progressDone: number;
  progressTotal: number;
  error: string | null;
}

/** A single cryptographically-chained entry in the Black Box ledger. */
export interface DecisionRecord {
  id: string;
  auditId: string;
  findingId: string | null;
  agentName: string; // "IngestionAgent" | "ContradictionAgent" | "DisappearanceAgent" | "ReasoningAgent"
  input: unknown;
  output: unknown;
  timestamp: string;
  prevHash: string; // "GENESIS" for the first record in a chain
  hash: string;
}

export interface ReplayResult {
  auditId: string;
  findingId: string | null;
  records: DecisionRecord[];
  verified: boolean;
  brokenAt: string | null; // record id where the chain first breaks, if any
}
