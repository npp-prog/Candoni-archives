const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(process.env.DB_PATH || path.join(DATA_DIR, 'archives.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','officer','viewer')),
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY,
  folder_name TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  fiscal_year INTEGER,
  month INTEGER,
  fund TEXT,
  box_no TEXT,
  location TEXT,
  remarks TEXT,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','complete','incomplete')),
  uploaded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  ref_no TEXT,
  doc_date TEXT,
  payee TEXT,
  amount REAL,
  particulars TEXT,
  ors_no TEXT,
  check_no TEXT,
  resp_center TEXT,
  fund TEXT,
  fiscal_year INTEGER,
  group_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_records_ref ON records(ref_no);
CREATE INDEX IF NOT EXISTS idx_records_type_year ON records(doc_type, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_records_date ON records(doc_date);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY,
  record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime TEXT,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_files_sha ON files(sha256);
CREATE INDEX IF NOT EXISTS idx_files_record ON files(record_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  details TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);

CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(
  ref_no, payee, particulars, ors_no, check_no, filenames,
  tokenize='unicode61'
);
`);

// Keeps the full-text index for a record up to date.
function reindexRecord(id) {
  db.prepare('DELETE FROM records_fts WHERE rowid = ?').run(id);
  const r = db.prepare('SELECT * FROM records WHERE id = ?').get(id);
  if (!r) return;
  const names = db.prepare('SELECT relative_path FROM files WHERE record_id = ?').all(id).map((f) => f.relative_path).join(' ');
  db.prepare('INSERT INTO records_fts(rowid, ref_no, payee, particulars, ors_no, check_no, filenames) VALUES (?,?,?,?,?,?,?)').run(
    id, r.ref_no || '', r.payee || '', r.particulars || '', r.ors_no || '', r.check_no || '', names,
  );
}

function audit(user, action, entity, entityId, details) {
  db.prepare('INSERT INTO audit_log (user_id, username, action, entity, entity_id, details) VALUES (?,?,?,?,?,?)').run(
    user ? user.id : null,
    user ? user.username : null,
    action,
    entity || null,
    entityId ?? null,
    details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null,
  );
}

function transaction(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { db, DATA_DIR, reindexRecord, audit, transaction };
