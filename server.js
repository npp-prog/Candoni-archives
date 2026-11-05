const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');

const { db, reindexRecord, audit, transaction } = require('./src/db');
const auth = require('./src/auth');
const { DOC_TYPES, FUNDS, FIELD_LABELS, getType, missingFields } = require('./src/doctypes');

const PORT = Number(process.env.PORT || 3000);
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || path.join(__dirname, 'storage'));
const TMP_DIR = path.join(STORAGE_DIR, '.tmp');
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 200);
const SECURE_COOKIE = process.env.SECURE_COOKIE === '1';
fs.mkdirSync(TMP_DIR, { recursive: true });

auth.ensureAdmin();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));
app.use(auth.sessionMiddleware);
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ dest: TMP_DIR, limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 1 } });

// ---------- helpers ----------
const RECORD_FIELDS = ['ref_no', 'doc_date', 'payee', 'amount', 'particulars', 'ors_no', 'check_no', 'resp_center'];

function cleanStr(v, max = 500) {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/[\u0000-\u001f]/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

function cleanRecord(input) {
  const r = {};
  for (const k of RECORD_FIELDS) r[k] = cleanStr(input[k], k === 'particulars' ? 2000 : 200);
  if (r.amount !== null) {
    const n = Number(String(r.amount).replace(/[₱,\s]/g, ''));
    r.amount = Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }
  if (r.doc_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(r.doc_date)) r.doc_date = null;
  return r;
}

function intOrNull(v, min, max) {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function safeSegment(s) {
  const out = String(s)
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '_')
    .trim()
    .slice(0, 120);
  return out || '_';
}

function safeRelativePath(rel) {
  return String(rel || '')
    .split(/[\\/]+/)
    .filter((p) => p && p !== '.' && p !== '..')
    .map(safeSegment)
    .join('/');
}

function uniquePath(p) {
  if (!fs.existsSync(p)) return p;
  const ext = path.extname(p);
  const base = p.slice(0, p.length - ext.length);
  for (let i = 2; ; i++) {
    const c = `${base} (${i})${ext}`;
    if (!fs.existsSync(c)) return c;
  }
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

const INLINE_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/tiff', 'text/plain']);
const MIME_BY_EXT = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.tif': 'image/tiff', '.tiff': 'image/tiff', '.txt': 'text/plain',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
};

// Saves an uploaded temp file into permanent storage and indexes it.
async function storeFile(user, batch, recordId, tmp, relativePath) {
  const rel = safeRelativePath(relativePath) || safeSegment(tmp.originalname);
  const sha = await sha256File(tmp.path);
  const dir = path.join(STORAGE_DIR, String(batch.fiscal_year || 'undated'), safeSegment(batch.doc_type), `batch-${batch.id}`);
  const dest = uniquePath(path.join(dir, rel));
  if (!dest.startsWith(STORAGE_DIR + path.sep)) throw new Error('Invalid path');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(tmp.path, dest);

  const dup = db.prepare(
    `SELECT f.id, f.record_id, r.ref_no FROM files f JOIN records r ON r.id = f.record_id WHERE f.sha256 = ? LIMIT 1`,
  ).get(sha);
  const name = path.basename(rel);
  const mime = MIME_BY_EXT[path.extname(name).toLowerCase()] || 'application/octet-stream';
  const info = db.prepare(
    'INSERT INTO files (record_id, batch_id, original_name, relative_path, stored_path, mime, size, sha256) VALUES (?,?,?,?,?,?,?,?)',
  ).run(recordId, batch.id, name, rel, path.relative(STORAGE_DIR, dest), mime, tmp.size, sha);
  reindexRecord(recordId);
  audit(user, 'upload_file', 'file', Number(info.lastInsertRowid), { record_id: recordId, name: rel, sha256: sha });
  return { id: Number(info.lastInsertRowid), name, size: tmp.size, duplicate_of: dup || null };
}

function removeTmp(req) {
  if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
}

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const isOfficer = auth.requireRole('officer');
const isViewer = auth.requireRole('viewer');
const isAdmin = auth.requireRole('admin');

// ---------- auth ----------
const loginAttempts = new Map();
app.post('/api/login', (req, res) => {
  const key = req.ip;
  const a = loginAttempts.get(key) || { n: 0, until: 0 };
  if (a.until > Date.now()) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(String(username || ''));
  if (!user || !auth.verifyPassword(String(password || ''), user.password_hash)) {
    a.n += 1;
    if (a.n >= 5) { a.until = Date.now() + 5 * 60 * 1000; a.n = 0; }
    loginAttempts.set(key, a);
    audit(null, 'login_failed', 'user', null, { username: cleanStr(username, 60) });
    return res.status(401).json({ error: 'Wrong username or password.' });
  }
  loginAttempts.delete(key);
  const token = auth.createSession(user.id);
  auth.setCookie(res, token, SECURE_COOKIE);
  audit(user, 'login', 'user', user.id);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  if (req.sessionToken) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.sessionToken);
  auth.setCookie(res, '', SECURE_COOKIE);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not logged in' });
  const { id, username, full_name, role, must_change_password } = req.user;
  res.json({ id, username, full_name, role, must_change_password: !!must_change_password });
});

app.post('/api/me/password', isViewer, (req, res) => {
  const { current, next } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!auth.verifyPassword(String(current || ''), user.password_hash)) return res.status(400).json({ error: 'Current password is wrong.' });
  if (String(next || '').length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(auth.hashPassword(String(next)), user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?').run(user.id, req.sessionToken);
  audit(req.user, 'change_password', 'user', user.id);
  res.json({ ok: true });
});

// ---------- config & stats ----------
app.get('/api/config', isViewer, (_req, res) => {
  res.json({ docTypes: DOC_TYPES, funds: FUNDS, fieldLabels: FIELD_LABELS, maxFileMb: MAX_FILE_MB });
});

app.get('/api/stats', isViewer, (_req, res) => {
  const totals = db.prepare(`SELECT
      (SELECT COUNT(*) FROM records) AS records,
      (SELECT COUNT(*) FROM files) AS files,
      (SELECT COALESCE(SUM(size),0) FROM files) AS bytes,
      (SELECT COUNT(*) FROM batches) AS batches,
      (SELECT COALESCE(SUM(amount),0) FROM records WHERE doc_type = 'DV') AS dv_amount`).get();
  const byType = db.prepare('SELECT doc_type, COUNT(*) AS n FROM records GROUP BY doc_type ORDER BY n DESC').all();
  const byYear = db.prepare('SELECT fiscal_year, COUNT(*) AS n FROM records GROUP BY fiscal_year ORDER BY fiscal_year DESC LIMIT 10').all();
  const recent = db.prepare(`SELECT b.id, b.folder_name, b.doc_type, b.fiscal_year, b.status, b.created_at, u.full_name AS uploaded_by,
      (SELECT COUNT(*) FROM records r WHERE r.batch_id = b.id) AS records,
      (SELECT COUNT(*) FROM files f WHERE f.batch_id = b.id) AS files
    FROM batches b LEFT JOIN users u ON u.id = b.uploaded_by ORDER BY b.id DESC LIMIT 8`).all();
  res.json({ totals, byType, byYear, recent });
});

// ---------- batches (folder uploads) ----------

// Pre-upload check: which reference numbers already exist in the archive.
app.post('/api/batches/check', isOfficer, (req, res) => {
  const { doc_type, ref_nos } = req.body || {};
  const refs = (Array.isArray(ref_nos) ? ref_nos : []).map((r) => cleanStr(r, 200)).filter(Boolean).slice(0, 5000);
  const stmt = db.prepare('SELECT id, ref_no, payee, doc_date FROM records WHERE doc_type = ? AND ref_no = ? COLLATE NOCASE LIMIT 1');
  const existing = refs.map((r) => stmt.get(String(doc_type), r)).filter(Boolean);
  res.json({ existing });
});

app.post('/api/batches', isOfficer, (req, res) => {
  const { batch: b = {}, records = [] } = req.body || {};
  const docType = String(b.doc_type || '');
  if (!getType(docType)) return res.status(400).json({ error: 'Choose a valid document type.' });
  if (!cleanStr(b.folder_name)) return res.status(400).json({ error: 'Folder name is missing.' });
  if (!Array.isArray(records) || records.length === 0) return res.status(400).json({ error: 'There are no records to save.' });
  if (records.length > 5000) return res.status(400).json({ error: 'Too many records in one batch (max 5000).' });

  const fiscalYear = intOrNull(b.fiscal_year, 1900, 2200);
  const fund = cleanStr(b.fund, 100);
  const cleaned = records.map((r) => ({ ...cleanRecord(r), group_key: cleanStr(r.group_key, 500) }));
  const errors = [];
  cleaned.forEach((r, i) => {
    const miss = missingFields(docType, r);
    if (miss.length) errors.push({ row: i, missing: miss });
  });
  if (errors.length) return res.status(400).json({ error: `${errors.length} record(s) are missing required fields.`, errors });

  const out = transaction(() => {
    const info = db.prepare(
      'INSERT INTO batches (folder_name, doc_type, fiscal_year, month, fund, box_no, location, remarks, uploaded_by) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(cleanStr(b.folder_name), docType, fiscalYear, intOrNull(b.month, 1, 12), fund, cleanStr(b.box_no, 50),
      cleanStr(b.location, 200), cleanStr(b.remarks, 2000), req.user.id);
    const batchId = Number(info.lastInsertRowid);
    const ins = db.prepare(`INSERT INTO records (batch_id, doc_type, ref_no, doc_date, payee, amount, particulars, ors_no, check_no, resp_center, fund, fiscal_year, group_key)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const ids = cleaned.map((r) => {
      const year = fiscalYear || (r.doc_date ? Number(r.doc_date.slice(0, 4)) : null);
      const id = Number(ins.run(batchId, docType, r.ref_no, r.doc_date, r.payee, r.amount, r.particulars, r.ors_no, r.check_no,
        r.resp_center, fund, year, r.group_key).lastInsertRowid);
      reindexRecord(id);
      return { id, group_key: r.group_key };
    });
    audit(req.user, 'create_batch', 'batch', batchId, { folder: b.folder_name, records: ids.length });
    return { batch_id: batchId, records: ids };
  });
  res.json(out);
});

function loadWritableBatch(req, res) {
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(Number(req.params.id));
  if (!batch) { res.status(404).json({ error: 'Batch not found.' }); return null; }
  if (batch.uploaded_by !== req.user.id && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Only the uploader or an admin can add files to this batch.' }); return null;
  }
  return batch;
}

app.post('/api/batches/:id/files', isOfficer, upload.single('file'), wrap(async (req, res) => {
  try {
    const batch = loadWritableBatch(req, res);
    if (!batch) return;
    if (!req.file) return res.status(400).json({ error: 'No file received.' });
    const rec = db.prepare('SELECT id FROM records WHERE id = ? AND batch_id = ?').get(Number(req.body.record_id), batch.id);
    if (!rec) return res.status(400).json({ error: 'Record does not belong to this batch.' });
    const result = await storeFile(req.user, batch, rec.id, req.file, req.body.relative_path);
    res.json(result);
  } finally {
    removeTmp(req);
  }
}));

app.post('/api/batches/:id/finalize', isOfficer, (req, res) => {
  const batch = loadWritableBatch(req, res);
  if (!batch) return;
  const expected = Number(req.body?.expected_files) || 0;
  const actual = db.prepare('SELECT COUNT(*) AS n FROM files WHERE batch_id = ?').get(batch.id).n;
  const status = actual >= expected ? 'complete' : 'incomplete';
  db.prepare('UPDATE batches SET status = ? WHERE id = ?').run(status, batch.id);
  audit(req.user, 'finalize_batch', 'batch', batch.id, { expected, actual, status });
  res.json({ status, expected, actual });
});

app.get('/api/batches', isViewer, (_req, res) => {
  res.json(db.prepare(`SELECT b.*, u.full_name AS uploader,
      (SELECT COUNT(*) FROM records r WHERE r.batch_id = b.id) AS record_count,
      (SELECT COUNT(*) FROM files f WHERE f.batch_id = b.id) AS file_count,
      (SELECT COALESCE(SUM(size),0) FROM files f WHERE f.batch_id = b.id) AS bytes
    FROM batches b LEFT JOIN users u ON u.id = b.uploaded_by ORDER BY b.id DESC`).all());
});

app.get('/api/batches/:id', isViewer, (req, res) => {
  const batch = db.prepare('SELECT b.*, u.full_name AS uploader FROM batches b LEFT JOIN users u ON u.id = b.uploaded_by WHERE b.id = ?').get(Number(req.params.id));
  if (!batch) return res.status(404).json({ error: 'Batch not found.' });
  res.json(batch);
});

app.put('/api/batches/:id', isOfficer, (req, res) => {
  const b = req.body || {};
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(Number(req.params.id));
  if (!batch) return res.status(404).json({ error: 'Batch not found.' });
  db.prepare('UPDATE batches SET box_no = ?, location = ?, remarks = ? WHERE id = ?').run(
    cleanStr(b.box_no, 50), cleanStr(b.location, 200), cleanStr(b.remarks, 2000), batch.id);
  audit(req.user, 'edit_batch', 'batch', batch.id, { box_no: b.box_no, location: b.location });
  res.json({ ok: true });
});

// ---------- records ----------
const SORTABLE = { ref_no: 'r.ref_no', doc_date: 'r.doc_date', payee: 'r.payee', amount: 'r.amount', doc_type: 'r.doc_type', created_at: 'r.id' };

function ftsQuery(q) {
  // Turn free text into a safe FTS5 prefix query: "juan dela" -> "juan"* "dela"*
  const terms = String(q).match(/[\p{L}\p{N}]+/gu) || [];
  return terms.slice(0, 10).map((t) => `"${t}"*`).join(' ');
}

function searchRecords(qs, { limit, offset }) {
  const where = [];
  const params = [];
  if (qs.q && ftsQuery(qs.q)) { where.push('r.id IN (SELECT rowid FROM records_fts WHERE records_fts MATCH ?)'); params.push(ftsQuery(qs.q)); }
  if (qs.type) { where.push('r.doc_type = ?'); params.push(String(qs.type)); }
  if (qs.year) { where.push('r.fiscal_year = ?'); params.push(Number(qs.year)); }
  if (qs.fund) { where.push('r.fund = ?'); params.push(String(qs.fund)); }
  if (qs.from) { where.push('r.doc_date >= ?'); params.push(String(qs.from)); }
  if (qs.to) { where.push('r.doc_date <= ?'); params.push(String(qs.to)); }
  if (qs.min) { where.push('r.amount >= ?'); params.push(Number(qs.min)); }
  if (qs.max) { where.push('r.amount <= ?'); params.push(Number(qs.max)); }
  if (qs.batch) { where.push('r.batch_id = ?'); params.push(Number(qs.batch)); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sort = SORTABLE[qs.sort] || 'r.id';
  const dir = qs.dir === 'asc' ? 'ASC' : 'DESC';
  const total = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(r.amount),0) AS amount FROM records r ${w}`).get(...params);
  const rows = db.prepare(`SELECT r.*, b.folder_name, b.box_no, b.location,
      (SELECT COUNT(*) FROM files f WHERE f.record_id = r.id) AS file_count
    FROM records r JOIN batches b ON b.id = r.batch_id ${w}
    ORDER BY ${sort} ${dir} NULLS LAST, r.id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return { total: total.n, total_amount: total.amount, rows };
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // prevent spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

app.get('/api/records', isViewer, (req, res) => {
  if (req.query.format === 'csv') {
    const { rows } = searchRecords(req.query, { limit: 100000, offset: 0 });
    const cols = ['doc_type', 'ref_no', 'doc_date', 'payee', 'amount', 'particulars', 'ors_no', 'check_no', 'resp_center', 'fund', 'fiscal_year', 'box_no', 'location', 'folder_name', 'file_count'];
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\r\n');
    audit(req.user, 'export_csv', 'records', null, { query: req.query, rows: rows.length });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="archives-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send('﻿' + csv);
  }
  const limit = Math.min(Number(req.query.limit) || 25, 200);
  const page = Math.max(Number(req.query.page) || 1, 1);
  res.json({ ...searchRecords(req.query, { limit, offset: (page - 1) * limit }), page, limit });
});

app.get('/api/records/:id', isViewer, (req, res) => {
  const id = Number(req.params.id);
  const record = db.prepare(`SELECT r.*, b.folder_name, b.box_no, b.location, b.remarks AS batch_remarks, b.month, u.full_name AS uploader
    FROM records r JOIN batches b ON b.id = r.batch_id LEFT JOIN users u ON u.id = b.uploaded_by WHERE r.id = ?`).get(id);
  if (!record) return res.status(404).json({ error: 'Record not found.' });
  const files = db.prepare('SELECT id, original_name, relative_path, mime, size, sha256, created_at FROM files WHERE record_id = ? ORDER BY relative_path').all(id);
  const history = db.prepare(`SELECT username, action, details, at FROM audit_log
    WHERE (entity = 'record' AND entity_id = ?) OR (entity = 'file' AND entity_id IN (SELECT id FROM files WHERE record_id = ?))
    ORDER BY id DESC LIMIT 50`).all(id, id);
  audit(req.user, 'view_record', 'record', id);
  res.json({ record, files, history });
});

app.put('/api/records/:id', isOfficer, (req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM records WHERE id = ?').get(id);
  if (!old) return res.status(404).json({ error: 'Record not found.' });
  const r = cleanRecord({ ...old, ...req.body });
  const miss = missingFields(old.doc_type, r);
  if (miss.length) return res.status(400).json({ error: `Missing required: ${miss.map((k) => FIELD_LABELS[k]).join(', ')}` });
  db.prepare(`UPDATE records SET ref_no=?, doc_date=?, payee=?, amount=?, particulars=?, ors_no=?, check_no=?, resp_center=?, updated_at=datetime('now') WHERE id=?`)
    .run(r.ref_no, r.doc_date, r.payee, r.amount, r.particulars, r.ors_no, r.check_no, r.resp_center, id);
  reindexRecord(id);
  const changes = {};
  for (const k of RECORD_FIELDS) if (String(old[k] ?? '') !== String(r[k] ?? '')) changes[k] = { from: old[k], to: r[k] };
  audit(req.user, 'edit_record', 'record', id, changes);
  res.json({ ok: true });
});

app.post('/api/records/:id/files', isOfficer, upload.single('file'), wrap(async (req, res) => {
  try {
    const rec = db.prepare('SELECT * FROM records WHERE id = ?').get(Number(req.params.id));
    if (!rec) return res.status(404).json({ error: 'Record not found.' });
    if (!req.file) return res.status(400).json({ error: 'No file received.' });
    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(rec.batch_id);
    res.json(await storeFile(req.user, batch, rec.id, req.file, `added/${req.body.relative_path || req.file.originalname}`));
  } finally {
    removeTmp(req);
  }
}));

function deleteStoredFiles(rows) {
  for (const f of rows) {
    const p = path.join(STORAGE_DIR, f.stored_path);
    if (p.startsWith(STORAGE_DIR + path.sep) && fs.existsSync(p)) fs.unlinkSync(p);
  }
}

app.delete('/api/records/:id', isAdmin, (req, res) => {
  const id = Number(req.params.id);
  const rec = db.prepare('SELECT * FROM records WHERE id = ?').get(id);
  if (!rec) return res.status(404).json({ error: 'Record not found.' });
  const files = db.prepare('SELECT * FROM files WHERE record_id = ?').all(id);
  transaction(() => {
    db.prepare('DELETE FROM records WHERE id = ?').run(id);
    reindexRecord(id);
  });
  deleteStoredFiles(files);
  audit(req.user, 'delete_record', 'record', id, { ref_no: rec.ref_no, payee: rec.payee, files: files.length });
  res.json({ ok: true });
});

// ---------- files ----------
app.get('/api/files/:id', isViewer, (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id = ?').get(Number(req.params.id));
  if (!f) return res.status(404).json({ error: 'File not found.' });
  const p = path.join(STORAGE_DIR, f.stored_path);
  if (!p.startsWith(STORAGE_DIR + path.sep) || !fs.existsSync(p)) return res.status(410).json({ error: 'File is missing from storage.' });
  const download = req.query.download === '1' || !INLINE_TYPES.has(f.mime);
  // Avoid logging every range request a PDF viewer makes; log the first one only.
  if (!req.headers.range || /^bytes=0-/.test(req.headers.range)) audit(req.user, download ? 'download_file' : 'view_file', 'file', f.id, { name: f.relative_path });
  // PDFs are rendered by the browser's built-in viewer, which a sandbox CSP would block.
  if (f.mime !== 'application/pdf') res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.sendFile(p, {
    headers: {
      'Content-Type': f.mime,
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.original_name)}`,
    },
  });
});

app.delete('/api/files/:id', isAdmin, (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id = ?').get(Number(req.params.id));
  if (!f) return res.status(404).json({ error: 'File not found.' });
  db.prepare('DELETE FROM files WHERE id = ?').run(f.id);
  reindexRecord(f.record_id);
  deleteStoredFiles([f]);
  audit(req.user, 'delete_file', 'file', f.id, { record_id: f.record_id, name: f.relative_path });
  res.json({ ok: true });
});

// ---------- audit & users (admin) ----------
app.get('/api/audit', isAdmin, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const where = [];
  const params = [];
  if (req.query.user) { where.push('username = ?'); params.push(String(req.query.user)); }
  if (req.query.action) { where.push('action = ?'); params.push(String(req.query.action)); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  res.json(db.prepare(`SELECT * FROM audit_log ${w} ORDER BY id DESC LIMIT ?`).all(...params, limit));
});

app.get('/api/users', isAdmin, (_req, res) => {
  res.json(db.prepare('SELECT id, username, full_name, role, active, created_at FROM users ORDER BY id').all());
});

const ROLES = ['admin', 'officer', 'viewer'];
app.post('/api/users', isAdmin, (req, res) => {
  const { username, full_name, role, password } = req.body || {};
  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(String(username || ''))) return res.status(400).json({ error: 'Username: 3–40 letters, digits, . _ -' });
  if (!cleanStr(full_name)) return res.status(400).json({ error: 'Full name is required.' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  if (String(password || '').length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  try {
    const info = db.prepare('INSERT INTO users (username, full_name, role, password_hash, must_change_password) VALUES (?,?,?,?,1)')
      .run(username, cleanStr(full_name, 100), role, auth.hashPassword(String(password)));
    audit(req.user, 'create_user', 'user', Number(info.lastInsertRowid), { username, role });
    res.json({ id: Number(info.lastInsertRowid) });
  } catch {
    res.status(400).json({ error: 'That username is already taken.' });
  }
});

app.put('/api/users/:id', isAdmin, (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  const { role, active, password, full_name } = req.body || {};
  if (id === req.user.id && (role && role !== 'admin' || active === false)) return res.status(400).json({ error: 'You cannot demote or deactivate yourself.' });
  if (role && !ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  if (password && String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  db.prepare('UPDATE users SET role = ?, active = ?, full_name = ? WHERE id = ?').run(
    role || u.role, active === undefined ? u.active : (active ? 1 : 0), cleanStr(full_name, 100) || u.full_name, id);
  if (password) {
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(auth.hashPassword(String(password)), id);
  }
  if (active === false || password) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  audit(req.user, 'edit_user', 'user', id, { role, active, password_reset: !!password });
  res.json({ ok: true });
});

// ---------- errors ----------
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, _next) => {
  if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? `File is larger than ${MAX_FILE_MB} MB.` : err.message;
    return res.status(400).json({ error: msg });
  }
  console.error(err);
  res.status(500).json({ error: 'Server error. Please try again.' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Candoni Archives running at http://localhost:${PORT}`));
}

module.exports = app;
