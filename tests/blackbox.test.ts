import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";

process.env.DATABASE_PATH = "./data/test-blackbox.db";
if (fs.existsSync(process.env.DATABASE_PATH)) fs.unlinkSync(process.env.DATABASE_PATH);

import { db } from "../src/db";
import { logDecision, verifyReplayChain, _debugTamperRecord, getLedger } from "../src/modules/audit/blackbox.service";

describe("Black Box decision ledger", () => {
  const auditId = "test-audit-1";

  beforeAll(() => {
    db.prepare(
      `INSERT INTO audits (id, doc_ids, status, finding_ids, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(auditId, "[]", "running", "[]", new Date().toISOString(), null);

    logDecision({ auditId, agentName: "IngestionAgent", input: { docIds: ["a", "b"] }, output: { count: 2 } });
    logDecision({ auditId, agentName: "ContradictionAgent", input: { a: "x", b: "y" }, output: { verdict: "contradictory" } });
    logDecision({ auditId, agentName: "ReasoningAgent", input: { explanation: "..." }, output: { severity: "high" } });
  });

  it("chains records with prevHash -> hash correctly", () => {
    const ledger = getLedger(auditId);
    expect(ledger).toHaveLength(3);
    expect(ledger[0].prevHash).toBe("GENESIS");
    expect(ledger[1].prevHash).toBe(ledger[0].hash);
    expect(ledger[2].prevHash).toBe(ledger[1].hash);
  });

  it("verifies an untampered chain as PASSED", () => {
    const result = verifyReplayChain(auditId);
    expect(result.verified).toBe(true);
    expect(result.brokenAt).toBeNull();
  });

  it("detects tampering and returns FAILED", () => {
    const ledger = getLedger(auditId);
    const targetId = ledger[1].id; // tamper with the middle record
    _debugTamperRecord(targetId, { verdict: "consistent" }); // silently changed without recomputing hash

    const result = verifyReplayChain(auditId);
    expect(result.verified).toBe(false);
    expect(result.brokenAt).toBe(targetId);
  });
});
