import { z } from "zod";
import {
  getAudit,
  getDoc,
  getFindingsForAudit,
  ingestDocument,
  listAudits,
  listDocs,
  startAudit,
} from "../modules/audit/audit.service";
import { _debugTamperRecord, getLedger, verifyReplayChain } from "../modules/audit/blackbox.service";
import { seedDemoDocuments } from "../db/demo-docs";

export const IngestDocumentInput = z.object({
  title: z.string().min(1),
  docType: z.string().min(1),
  version: z.string().min(1),
  accessTier: z.string().min(1),
  content: z.string().min(1),
  previousDocumentId: z.string().uuid().nullish(),
});

export const AnalyzeDocumentInput = z.object({
  docIds: z.array(z.string().uuid()).min(1),
});

export const GetAuditResultInput = z.object({
  auditId: z.string().uuid(),
});

export const ListAuditsInput = z.object({});

export const ListDocumentsInput = z.object({});

export const SeedDemoDocumentsInput = z.object({});

export const VerifyReplayChainInput = z.object({
  auditId: z.string().uuid(),
  findingId: z.string().uuid().optional(),
});

export const GetDecisionTrailInput = z.object({
  auditId: z.string().uuid(),
  findingId: z.string().uuid().optional(),
});

export const TamperRecordInput = z.object({
  recordId: z.string().uuid(),
  newOutput: z.unknown(),
});

/** The tamper tool is a demo affordance and must never be reachable in production. */
function tamperAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_TAMPER_DEMO === "true";
}

/**
 * The Auditor Zero tools. Each entry has a Zod schema for input validation
 * (used by both the MCP tool registration and the REST layer) and a `handler`
 * with the actual business logic — one source of truth for MCP and REST.
 */
export const tools = {
  ingest_document: {
    description:
      "Ingest a document into Auditor Zero for later analysis. Optionally link it to a previous " +
      "version via previousDocumentId so it participates in cross-version comparison.",
    schema: IngestDocumentInput,
    handler: async (input: z.infer<typeof IngestDocumentInput>) => {
      if (input.previousDocumentId && !getDoc(input.previousDocumentId)) {
        throw new Error(`Unknown previousDocumentId: ${input.previousDocumentId}`);
      }
      const doc = ingestDocument(input);
      return { doc };
    },
  },

  list_documents: {
    description: "List all ingested documents, oldest first.",
    schema: ListDocumentsInput,
    handler: async (_input: z.infer<typeof ListDocumentsInput>) => {
      return { docs: listDocs() };
    },
  },

  seed_demo_documents: {
    description:
      "Ingest the built-in demo document set (a v1/v2/v3 policy lineage plus a contradicting BYOD " +
      "policy and an unrelated noise policy) and return their ids. One-click demo data.",
    schema: SeedDemoDocumentsInput,
    handler: async (_input: z.infer<typeof SeedDemoDocumentsInput>) => {
      const { docs } = seedDemoDocuments();
      return { docs };
    },
  },

  analyze_document: {
    description:
      "Start the audit pipeline (numeric + semantic contradiction detection across and within " +
      "documents, version-lineage disappearance detection, severity/confidence scoring, Black Box " +
      "sealing) over a set of previously-ingested document IDs. Returns immediately with a 'running' " +
      "audit; poll get_audit_result for progress and findings as they complete.",
    schema: AnalyzeDocumentInput,
    handler: async (input: z.infer<typeof AnalyzeDocumentInput>) => {
      for (const id of input.docIds) {
        if (!getDoc(id)) throw new Error(`Unknown docId: ${id}`);
      }
      const audit = startAudit(input.docIds);
      const findings = getFindingsForAudit(audit.id);
      return { audit, findings };
    },
  },

  get_audit_result: {
    description: "Fetch a completed (or in-progress) audit by ID, including its findings.",
    schema: GetAuditResultInput,
    handler: async (input: z.infer<typeof GetAuditResultInput>) => {
      const audit = getAudit(input.auditId);
      if (!audit) throw new Error(`Unknown auditId: ${input.auditId}`);
      const findings = getFindingsForAudit(audit.id);
      return { audit, findings };
    },
  },

  list_audits: {
    description: "List all audits, most recent first.",
    schema: ListAuditsInput,
    handler: async (_input: z.infer<typeof ListAuditsInput>) => {
      return { audits: listAudits() };
    },
  },

  get_decision_trail: {
    description:
      "Return the Black Box decision ledger for an audit (optionally scoped to one finding) — every " +
      "sealed agent step with its input, output, and hash, in chain order. Read-only: shows the " +
      "receipts without recomputing them.",
    schema: GetDecisionTrailInput,
    handler: async (input: z.infer<typeof GetDecisionTrailInput>) => {
      if (!getAudit(input.auditId)) throw new Error(`Unknown auditId: ${input.auditId}`);
      const records = getLedger(input.auditId, input.findingId);
      return { auditId: input.auditId, findingId: input.findingId ?? null, records };
    },
  },

  verify_replay_chain: {
    description:
      "Recompute the SHA-256 hash chain for an audit (optionally scoped to one finding) from GENESIS " +
      "forward and verify every stored DecisionRecord's hash matches. Returns verified=false and the " +
      "breaking record id if any record was tampered with.",
    schema: VerifyReplayChainInput,
    handler: async (input: z.infer<typeof VerifyReplayChainInput>) => {
      if (!getAudit(input.auditId)) throw new Error(`Unknown auditId: ${input.auditId}`);
      return verifyReplayChain(input.auditId, input.findingId);
    },
  },

  debug_tamper_record: {
    description:
      "DEMO ONLY: overwrite a stored decision record's output WITHOUT recomputing its hash, so " +
      "verify_replay_chain can be shown catching the tamper. Disabled when NODE_ENV=production " +
      "unless ALLOW_TAMPER_DEMO=true.",
    schema: TamperRecordInput,
    handler: async (input: z.infer<typeof TamperRecordInput>) => {
      if (!tamperAllowed()) throw Object.assign(new Error("Tamper demo is disabled"), { status: 403 });
      _debugTamperRecord(input.recordId, input.newOutput);
      return { tampered: true, recordId: input.recordId };
    },
  },
} as const;

export type ToolName = keyof typeof tools;
