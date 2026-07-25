import crypto from "crypto";
import { v4 as uuid } from "uuid";
import { db } from "../../db";
import { DecisionRecord, ReplayResult } from "./types";

const GENESIS = "GENESIS";

/**
 * The ledger is keyed with an HMAC secret held only by the server. Because each
 * link is HMAC-SHA256(secret, prevHash + payload) — not a plain hash — an
 * attacker who edits a stored record CANNOT recompute a valid chain to cover
 * their tracks without the secret. That is what makes the Black Box
 * tamper-proof rather than merely tamper-evident.
 */
function ledgerSecret(): string {
  const secret = process.env.LEDGER_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("LEDGER_SECRET (or JWT_SECRET) must be set to seal the Black Box ledger.");
  }
  return secret;
}

function hmac(input: string): string {
  return crypto.createHmac("sha256", ledgerSecret()).update(input).digest("hex");
}

function computeHash(prevHash: string, agentName: string, input: unknown, output: unknown, timestamp: string): string {
  const payload = JSON.stringify({ agentName, input, output, timestamp });
  return hmac(prevHash + payload);
}

/** Returns the hash of the most recent record in this audit's chain, or GENESIS if empty. */
function getLastHash(auditId: string): string {
  const row = db
    .prepare(`SELECT hash FROM decision_records WHERE audit_id = ? ORDER BY seq DESC LIMIT 1`)
    .get(auditId) as { hash: string } | undefined;
  return row ? row.hash : GENESIS;
}

function getNextSeq(auditId: string): number {
  const row = db
    .prepare(`SELECT COALESCE(MAX(seq), -1) as maxSeq FROM decision_records WHERE audit_id = ?`)
    .get(auditId) as { maxSeq: number };
  return row.maxSeq + 1;
}

/**
 * Seals a single agent decision into the hash chain.
 * Every agent-producing step in the pipeline (ingestion, contradiction
 * detection, disappearance detection, scoring) must call this — never write
 * a Finding without a corresponding DecisionRecord.
 */
export function logDecision(params: {
  auditId: string;
  findingId?: string | null;
  agentName: string;
  input: unknown;
  output: unknown;
}): DecisionRecord {
  const { auditId, agentName, input, output } = params;
  const findingId = params.findingId ?? null;
  const timestamp = new Date().toISOString();
  const prevHash = getLastHash(auditId);
  const hash = computeHash(prevHash, agentName, input, output, timestamp);
  const record: DecisionRecord = {
    id: uuid(),
    auditId,
    findingId,
    agentName,
    input,
    output,
    timestamp,
    prevHash,
    hash,
  };

  db.prepare(
    `INSERT INTO decision_records (id, audit_id, finding_id, agent_name, input, output, timestamp, prev_hash, hash, seq)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    record.id,
    record.auditId,
    record.findingId,
    record.agentName,
    JSON.stringify(record.input),
    JSON.stringify(record.output),
    record.timestamp,
    record.prevHash,
    record.hash,
    getNextSeq(auditId)
  );

  return record;
}

/** Convenience wrapper: run `fn`, log its input/output as a DecisionRecord, return fn's result. */
export async function withBlackBox<T>(
  params: { auditId: string; findingId?: string | null; agentName: string; input: unknown },
  fn: () => Promise<T> | T
): Promise<T> {
  const output = await fn();
  logDecision({ ...params, output });
  return output;
}

function rowToRecord(row: any): DecisionRecord {
  return {
    id: row.id,
    auditId: row.audit_id,
    findingId: row.finding_id,
    agentName: row.agent_name,
    input: JSON.parse(row.input),
    output: JSON.parse(row.output),
    timestamp: row.timestamp,
    prevHash: row.prev_hash,
    hash: row.hash,
  };
}

export function getLedger(auditId: string, findingId?: string | null): DecisionRecord[] {
  const rows = findingId
    ? db
        .prepare(
          `SELECT * FROM decision_records WHERE audit_id = ? AND (finding_id = ? OR finding_id IS NULL) ORDER BY seq ASC`
        )
        .all(auditId, findingId)
    : db.prepare(`SELECT * FROM decision_records WHERE audit_id = ? ORDER BY seq ASC`).all(auditId);
  return rows.map(rowToRecord);
}

/**
 * Recomputes the hash chain for an audit (optionally scoped to a finding)
 * from GENESIS forward and checks every stored hash against the
 * recomputed one. Returns false the moment any record's stored hash
 * doesn't match what its (prevHash, agentName, input, output, timestamp)
 * would actually produce — i.e. the record or something before it was
 * tampered with.
 */
export function verifyReplayChain(auditId: string, findingId?: string | null): ReplayResult {
  const records = getLedger(auditId, findingId);
  let expectedPrev = GENESIS;
  let brokenAt: string | null = null;

  for (const record of records) {
    const recomputed = computeHash(expectedPrev, record.agentName, record.input, record.output, record.timestamp);
    if (record.prevHash !== expectedPrev || recomputed !== record.hash) {
      brokenAt = record.id;
      break;
    }
    expectedPrev = record.hash;
  }

  return {
    auditId,
    findingId: findingId ?? null,
    records,
    verified: brokenAt === null && records.length > 0,
    brokenAt,
  };
}

/** TEST/DEMO ONLY: tampers with a stored record's output without recomputing its hash, to prove verify_replay_chain catches it. */
export function _debugTamperRecord(recordId: string, newOutput: unknown): void {
  db.prepare(`UPDATE decision_records SET output = ? WHERE id = ?`).run(JSON.stringify(newOutput), recordId);
}
