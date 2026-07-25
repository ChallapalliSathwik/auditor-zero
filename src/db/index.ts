import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = process.env.DATABASE_PATH || "./data/auditor-zero.db";
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'auditor',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  version TEXT NOT NULL,
  access_tier TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  seq INTEGER,                       -- monotonic ingestion order (reliable version ordering)
  previous_document_id TEXT          -- explicit prior-version link, if the caller supplied one
);

CREATE TABLE IF NOT EXISTS audits (
  id TEXT PRIMARY KEY,
  doc_ids TEXT NOT NULL,       -- JSON array
  status TEXT NOT NULL,
  finding_ids TEXT NOT NULL,   -- JSON array
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  audit_id TEXT NOT NULL REFERENCES audits(id),
  type TEXT NOT NULL,
  doc_ids TEXT NOT NULL,        -- JSON array
  explanation TEXT NOT NULL,
  severity TEXT NOT NULL,
  confidence TEXT NOT NULL,
  severity_justification TEXT NOT NULL,
  created_at TEXT NOT NULL,
  detection_method TEXT         -- how it was flagged: numeric-value-conflict | cross-version-semantic | semantic-llm
);

CREATE TABLE IF NOT EXISTS decision_records (
  id TEXT PRIMARY KEY,
  audit_id TEXT NOT NULL REFERENCES audits(id),
  finding_id TEXT,
  agent_name TEXT NOT NULL,
  input TEXT NOT NULL,          -- JSON
  output TEXT NOT NULL,         -- JSON
  timestamp TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  seq INTEGER NOT NULL           -- monotonic order within an audit's chain
);

CREATE INDEX IF NOT EXISTS idx_decision_records_audit ON decision_records(audit_id, seq);
CREATE INDEX IF NOT EXISTS idx_findings_audit ON findings(audit_id);
`);

// --- Lightweight migrations for databases created before these columns existed ---
function addColumnIfMissing(table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
addColumnIfMissing("docs", "seq", "INTEGER");
addColumnIfMissing("docs", "previous_document_id", "TEXT");
addColumnIfMissing("findings", "detection_method", "TEXT");
addColumnIfMissing("audits", "progress_done", "INTEGER");
addColumnIfMissing("audits", "progress_total", "INTEGER");
addColumnIfMissing("audits", "error", "TEXT");
// Backfill ingestion order for pre-existing rows so version ordering is deterministic.
db.exec(`UPDATE docs SET seq = rowid WHERE seq IS NULL`);

export default db;
