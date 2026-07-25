export type Severity = "low" | "medium" | "high";
export type Confidence = "low" | "medium" | "high";
export type DetectionMethod =
  | "numeric-value-conflict"
  | "cross-version-semantic"
  | "semantic-llm"
  | "category-removed";

export interface Doc {
  id: string;
  title: string;
  docType: string;
  version: string;
  accessTier: string;
  content: string;
  createdAt: string;
  seq: number;
  previousDocumentId: string | null;
}

export interface Finding {
  id: string;
  auditId: string;
  type: "contradiction" | "disappearance";
  docIds: string[];
  explanation: string;
  severity: Severity;
  confidence: Confidence;
  severityJustification: string;
  detectionMethod: DetectionMethod;
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

export interface DecisionRecord {
  id: string;
  agentName: string;
  input: unknown;
  output: unknown;
  timestamp: string;
  hash: string;
}

export interface ReplayResult {
  auditId: string;
  findingId: string | null;
  records: DecisionRecord[];
  verified: boolean;
  brokenAt: string | null;
}

export const DETECTION_LABELS: Record<DetectionMethod, string> = {
  "numeric-value-conflict": "Numeric conflict",
  "cross-version-semantic": "Cross-version change",
  "semantic-llm": "Semantic (LLM)",
  "category-removed": "Category removed",
};
