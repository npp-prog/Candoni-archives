import {
  addDoc, arrayUnion, collection, deleteDoc, doc, getAggregateFromServer, getCountFromServer, getDoc, getDocs, increment,
  limit, orderBy, query, serverTimestamp, setDoc, sum, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { deleteObject, getBlob, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from '../firebase.js';
import { DOC_TYPES, FIELDS } from './doctypes.js';
import { isOwnerEmail } from './owner.js';
import { keywordsOf, matchesWords, normalizeDate, parseAmount, safePath, wordsOf } from './names.js';

const nowIso = () => new Date().toISOString();
const clean = (v, max = 200) => { const s = String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim(); return s ? s.slice(0, max) : null; };

// ---------- accounts ----------

// The user's profile; made on their first sign-in (a Viewer waiting for approval, or the owner as
// superadmin once their email is verified).
export async function ensureUserProfile(user, extra = {}) {
  const r = doc(db, 'users', user.uid);
  const owner = isOwnerEmail(user.email) && user.emailVerified;
  const snap = await getDoc(r);
  if (snap.exists()) {
    const p = snap.data();
    if (owner && (p.role !== 'superadmin' || !p.active)) {
      await updateDoc(r, { role: 'superadmin', active: true });
      return { id: user.uid, ...p, role: 'superadmin', active: true };
    }
    return { id: user.uid, ...p };
  }
  const profile = {
    email: user.email,
    displayName: clean(extra.displayName || user.displayName || user.email, 120),
    requestedOffice: clean(extra.office, 120) || '',
    role: owner ? 'superadmin' : 'user',
    active: owner,
    createdAt: serverTimestamp(),
  };
  await setDoc(r, profile);
  return { id: user.uid, ...profile };
}

export async function listUsers() {
  const snap = await getDocs(collection(db, 'users'));
  const rank = { superadmin: 0, admin: 1, records: 2, user: 3 };
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (rank[a.role] ?? 9) - (rank[b.role] ?? 9) || String(a.displayName || a.email).localeCompare(String(b.displayName || b.email)));
}

export const updateUser = (uid, patch) => updateDoc(doc(db, 'users', uid), patch);

// ---------- settings ----------
export async function getSettings() {
  const s = await getDoc(doc(db, 'meta', 'settings'));
  return s.exists() ? s.data() : {};
}
export const saveSettings = (settings, actor) => setDoc(doc(db, 'meta', 'settings'), { funds: settings.funds, updatedAt: nowIso(), updatedBy: actor.uid });

// ---------- audit log ----------
export function audit(actor, action, { entity = null, entityId = null, label = '', details = null } = {}) {
  return addDoc(collection(db, 'audit'), {
    action, entity, entityId, label: String(label || '').slice(0, 300),
    details: details == null ? null : (typeof details === 'string' ? details : JSON.stringify(details)).slice(0, 2000),
    uid: actor.uid, name: actor.displayName || actor.email, at: serverTimestamp(),
  }).catch(() => {}); // never block the work on the log
}

export async function listAudit(max = 300) {
  const snap = await getDocs(query(collection(db, 'audit'), orderBy('at', 'desc'), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function auditOf(entityId) {
  const snap = await getDocs(query(collection(db, 'audit'), where('entityId', '==', entityId), limit(200)));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.at?.toMillis?.() || 0) - (a.at?.toMillis?.() || 0));
  // the same person doing the same thing again in a row counts once (opening a record twice)
  return list.filter((a, i) => !i || a.uid !== list[i - 1].uid || a.action !== list[i - 1].action || a.label !== list[i - 1].label);
}

// ---------- the record a row of the metadata grid becomes ----------
function recordFields(row) {
  const out = {};
  for (const k of FIELDS) out[k] = clean(row[k], k === 'particulars' ? 2000 : 200);
  out.amount = out.amount == null ? null : parseAmount(out.amount);
  out.docDate = out.docDate == null ? null : normalizeDate(out.docDate);
  out.refKey = out.refNo ? out.refNo.toLowerCase() : null;
  return out;
}

// ---------- uploading a folder ----------

// Reference nos. already in the archive (to warn before uploading).
// rows: [{ docType, refNo }]; a match is the same reference no. on a record of the same type.
export async function existingRefs(rows) {
  const want = new Set(rows.filter((r) => String(r.refNo || '').trim()).map((r) => `${r.docType}|${String(r.refNo).trim().toLowerCase()}`));
  const keys = [...new Set([...want].map((k) => k.slice(k.indexOf('|') + 1)))];
  const found = [];
  for (let i = 0; i < keys.length; i += 30) {
    const snap = await getDocs(query(collection(db, 'records'), where('refKey', 'in', keys.slice(i, i + 30))));
    snap.docs.forEach((d) => { if (want.has(`${d.data().docType}|${d.data().refKey}`)) found.push({ id: d.id, ...d.data() }); });
  }
  return found;
}

// The same folder: same name (ignoring capitals and spaces), same main document type and same fund.
const folderKey = (name) => String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
export async function findSameFolder(batch) {
  const name = clean(batch.folderName);
  const queries = [query(collection(db, 'batches'), where('folderName', '==', name))];
  // the same name typed with other capitals or spaces: among the folders of that fiscal year
  if (Number(batch.fiscalYear)) queries.push(query(collection(db, 'batches'), where('fiscalYear', '==', Number(batch.fiscalYear))));
  const found = new Map();
  for (const snap of await Promise.all(queries.map((q) => getDocs(q)))) snap.docs.forEach((d) => found.set(d.id, withId(d)));
  return [...found.values()].find((b) => folderKey(b.folderName) === folderKey(name) && b.docType === batch.docType
    && (b.fund || '') === (clean(batch.fund, 100) || '')) || null;
}

// The records of a folder, before any file is sent: one per row. Returns { groupKey: recordId }.
async function writeRecords(batchId, b, rows, actor) {
  const ids = {};
  for (let i = 0; i < rows.length; i += 400) {
    const wb = writeBatch(db);
    for (const row of rows.slice(i, i + 400)) {
      const r = doc(collection(db, 'records'));
      const f = recordFields(row);
      wb.set(r, {
        batchId, folderName: b.folderName, groupKey: clean(row.key, 500), docType: row.docType, ...f,
        fund: b.fund || null, fiscalYear: b.fiscalYear || (f.docDate ? Number(f.docDate.slice(0, 4)) : null), month: b.month || null,
        boxNo: b.boxNo || null, location: b.location || null, files: [], fileCount: 0, keywords: keywordsOf(f),
        createdBy: actor.uid, createdByName: actor.displayName || actor.email, createdAt: serverTimestamp(),
      });
      ids[row.key] = r.id;
    }
    await wb.commit();
  }
  return ids;
}

// A new folder and its records. Refused when the same folder already exists (findSameFolder):
// the files then go into that folder (addToBatch). Returns { batchId, ids }.
export async function createBatch(batch, rows, expectedFiles, actor) {
  const same = await findSameFolder(batch);
  if (same) {
    const e = new Error(`The folder "${same.folderName}" (${same.docType}${same.fund ? `, ${same.fund}` : ''}) already exists. Add the files to it instead.`);
    e.code = 'folder-exists'; e.folder = same;
    throw e;
  }
  const b = {
    folderName: clean(batch.folderName), docType: batch.docType, fiscalYear: Number(batch.fiscalYear) || null, month: Number(batch.month) || null,
    fund: clean(batch.fund, 100), boxNo: clean(batch.boxNo, 60), location: clean(batch.location, 200), remarks: clean(batch.remarks, 2000),
    status: 'uploading', expectedFiles, fileCount: 0, recordCount: rows.length, totalBytes: 0,
    by: actor.uid, byName: actor.displayName || actor.email, createdAt: serverTimestamp(),
  };
  const batchRef = doc(collection(db, 'batches'));
  await setDoc(batchRef, b);
  const ids = await writeRecords(batchRef.id, b, rows, actor);
  audit(actor, 'upload_folder', { entity: 'batch', entityId: batchRef.id, label: b.folderName, details: { records: rows.length, files: expectedFiles } });
  return { batchId: batchRef.id, ids };
}

// More records and files for a folder already in the archive: they take its year, fund and filing
// location. Returns { batchId, ids }.
export async function addToBatch(batch, rows, expectedFiles, actor) {
  const ids = await writeRecords(batch.id, batch, rows, actor);
  await updateDoc(doc(db, 'batches', batch.id), {
    recordCount: increment(rows.length), expectedFiles: increment(expectedFiles), status: 'uploading', updatedAt: nowIso(),
  });
  audit(actor, 'add_to_folder', { entity: 'batch', entityId: batch.id, label: batch.folderName, details: { records: rows.length, files: expectedFiles } });
  return { batchId: batch.id, ids };
}

async function sha256(file) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// One file into its record: Storage, then the record's file list, then the folder's totals.
// onProgress(bytesSent). Returns { duplicateOf } (a record that already holds the same file).
export async function uploadFile({ batchId, recordId, refNo, file, rel }, onProgress = () => {}) {
  const hash = await sha256(file);
  const known = await getDoc(doc(db, 'hashes', hash));
  const duplicateOf = known.exists() && known.data().recordId !== recordId ? known.data() : null;
  const path = `archives/${batchId}/${recordId}/${safePath(rel)}`;
  const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type || contentTypeOf(rel), customMetadata: { sha256: hash } });
  await new Promise((resolve, reject) => {
    task.on('state_changed', (s) => onProgress(s.bytesTransferred), reject, resolve);
  });
  const name = rel.split('/').pop();
  const entry = { name, rel, path, size: file.size, type: file.type || contentTypeOf(rel), sha256: hash, at: nowIso() };
  await updateDoc(doc(db, 'records', recordId), {
    files: arrayUnion(entry), fileCount: increment(1), keywords: arrayUnion(...keywordsOf({ files: [{ name }] }).slice(0, 100)),
  });
  await updateDoc(doc(db, 'batches', batchId), { fileCount: increment(1), totalBytes: increment(file.size) });
  if (!known.exists()) await setDoc(doc(db, 'hashes', hash), { recordId, refNo: refNo || '', name, path, at: nowIso() }).catch(() => {});
  return { duplicateOf };
}

export async function finishBatch(batchId) {
  const b = (await getDoc(doc(db, 'batches', batchId))).data();
  const status = b.fileCount >= b.expectedFiles ? 'complete' : 'incomplete';
  await updateDoc(doc(db, 'batches', batchId), { status, updatedAt: nowIso() });
  return { status, ...b };
}

// Files added later to a record (e.g. a missing attachment).
export async function addFiles(record, files, actor, onProgress = () => {}) {
  const results = [];
  for (const [i, file] of files.entries()) {
    onProgress(i, files.length, file.name);
    results.push(await uploadFile({ batchId: record.batchId, recordId: record.id, refNo: record.refNo, file, rel: `added/${file.name}` }));
  }
  await updateDoc(doc(db, 'batches', record.batchId), { expectedFiles: increment(files.length) }).catch(() => {});
  audit(actor, 'add_files', { entity: 'record', entityId: record.id, label: record.refNo, details: files.map((f) => f.name).join(', ') });
  return results;
}

const EXT_TYPES = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  tif: 'image/tiff', tiff: 'image/tiff', txt: 'text/plain', csv: 'text/csv',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
export const contentTypeOf = (name) => EXT_TYPES[String(name).split('.').pop().toLowerCase()] || 'application/octet-stream';

// ---------- reading ----------
const withId = (d) => ({ id: d.id, ...d.data() });

export async function getRecord(id) {
  const s = await getDoc(doc(db, 'records', id));
  if (!s.exists()) return null;
  const r = withId(s);
  // files arrive in the order their uploads finished: show them in folder order
  r.files = [...(r.files || [])].sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true }));
  return r;
}
export async function getBatch(id) {
  const s = await getDoc(doc(db, 'batches', id));
  return s.exists() ? withId(s) : null;
}
export async function listBatches(max = 500) {
  const snap = await getDocs(query(collection(db, 'batches'), orderBy('createdAt', 'desc'), limit(max)));
  return snap.docs.map(withId);
}
export async function recordsOfBatch(batchId) {
  const snap = await getDocs(query(collection(db, 'records'), where('batchId', '==', batchId)));
  return snap.docs.map(withId).sort((a, b) => String(a.refNo || a.groupKey).localeCompare(String(b.refNo || b.groupKey), undefined, { numeric: true }));
}

export const SEARCH_LIMIT = 2000;

// Search: Firestore narrows by one condition (a search word, else the year, else the type), so no
// composite index is needed; every other filter is applied here. f: { q, type, year, fund, from, to, min, max }.
export async function searchRecords(f) {
  const words = wordsOf(f.q);
  let q;
  if (words.length) {
    const longest = [...words].sort((a, b) => b.length - a.length)[0].slice(0, 20);
    q = query(collection(db, 'records'), where('keywords', 'array-contains', longest), limit(SEARCH_LIMIT));
  } else if (f.year) q = query(collection(db, 'records'), where('fiscalYear', '==', Number(f.year)), limit(SEARCH_LIMIT));
  else if (f.type) q = query(collection(db, 'records'), where('docType', '==', f.type), limit(SEARCH_LIMIT));
  else q = query(collection(db, 'records'), orderBy('createdAt', 'desc'), limit(SEARCH_LIMIT));
  const snap = await getDocs(q);
  const rows = snap.docs.map(withId).filter((r) => matchesWords(r, f.q)
    && (!f.type || r.docType === f.type)
    && (!f.year || r.fiscalYear === Number(f.year))
    && (!f.fund || r.fund === f.fund)
    && (!f.from || (r.docDate && r.docDate >= f.from))
    && (!f.to || (r.docDate && r.docDate <= f.to))
    && (f.min === '' || f.min == null || (r.amount != null && r.amount >= Number(f.min)))
    && (f.max === '' || f.max == null || (r.amount != null && r.amount <= Number(f.max))));
  return { rows, capped: snap.size >= SEARCH_LIMIT };
}

// Dashboard figures. Each query filters or sums one field only, so Firestore's automatic indexes
// serve them all (no composite index to create). A figure that cannot be read shows as null
// instead of failing the dashboard.
export async function stats() {
  const recs = collection(db, 'records');
  const batches = collection(db, 'batches');
  const year = new Date().getFullYear();
  const years = Array.from({ length: 8 }, (_, i) => year - i);
  const soft = (p) => p.catch(() => null);
  const count = (q) => soft(getCountFromServer(q).then((s) => s.data().count));
  const total = (q, field) => soft(getAggregateFromServer(q, { t: sum(field) }).then((s) => s.data().t || 0));
  const [records, batchCount, bytes, files, byType, byYear, recent] = await Promise.all([
    count(recs),
    count(batches),
    total(batches, 'totalBytes'),
    total(batches, 'fileCount'),
    Promise.all(DOC_TYPES.map((t) => count(query(recs, where('docType', '==', t.code))).then((n) => ({ code: t.code, n })))),
    Promise.all(years.map((y) => count(query(recs, where('fiscalYear', '==', y))).then((n) => ({ year: y, n })))),
    soft(listBatches(6)),
  ]);
  return {
    records, batches: batchCount, bytes, files,
    byType: byType.filter((x) => x.n).sort((a, b) => b.n - a.n), byYear: byYear.filter((x) => x.n), recent: recent || [],
  };
}

// ---------- changing ----------
export async function updateRecord(record, row, actor) {
  const f = recordFields(row);
  const changes = {};
  const docType = row.docType || record.docType;
  if (docType !== record.docType) changes.docType = { from: record.docType, to: docType };
  for (const k of [...FIELDS]) if (String(record[k] ?? '') !== String(f[k] ?? '')) changes[k] = { from: record[k] ?? null, to: f[k] };
  await updateDoc(doc(db, 'records', record.id), {
    docType, ...f, keywords: keywordsOf({ ...f, files: record.files }), updatedAt: nowIso(), updatedBy: actor.displayName || actor.email,
  });
  audit(actor, 'edit_record', { entity: 'record', entityId: record.id, label: f.refNo || record.refNo, details: changes });
}

export async function updateBatchLocation(batch, patch, actor) {
  const p = { boxNo: clean(patch.boxNo, 60), location: clean(patch.location, 200), remarks: clean(patch.remarks, 2000) };
  await updateDoc(doc(db, 'batches', batch.id), { ...p, updatedAt: nowIso() });
  // the records keep a copy (shown in search results)
  const recs = await recordsOfBatch(batch.id);
  for (let i = 0; i < recs.length; i += 400) {
    const wb = writeBatch(db);
    recs.slice(i, i + 400).forEach((r) => wb.update(doc(db, 'records', r.id), { boxNo: p.boxNo, location: p.location, updatedAt: nowIso() }));
    await wb.commit();
  }
  audit(actor, 'edit_folder', { entity: 'batch', entityId: batch.id, label: batch.folderName, details: p });
}

export async function deleteRecord(record, actor) {
  for (const f of record.files || []) {
    await deleteObject(ref(storage, f.path)).catch((e) => { if (e.code !== 'storage/object-not-found') throw e; });
    const h = await getDoc(doc(db, 'hashes', f.sha256)).catch(() => null);
    if (h?.exists() && h.data().recordId === record.id) await deleteDoc(h.ref);
  }
  await deleteDoc(doc(db, 'records', record.id));
  const size = (record.files || []).reduce((s, f) => s + (f.size || 0), 0);
  await updateDoc(doc(db, 'batches', record.batchId), {
    recordCount: increment(-1), fileCount: increment(-(record.files || []).length),
    totalBytes: increment(-size), expectedFiles: increment(-(record.files || []).length),
  }).catch(() => {});
  audit(actor, 'delete_record', { entity: 'record', entityId: record.id, label: record.refNo, details: { payee: record.payee, files: (record.files || []).length } });
}

export async function deleteFile(record, file, actor) {
  await deleteObject(ref(storage, file.path)).catch((e) => { if (e.code !== 'storage/object-not-found') throw e; });
  const h = await getDoc(doc(db, 'hashes', file.sha256)).catch(() => null);
  if (h?.exists() && h.data().recordId === record.id) await deleteDoc(h.ref);
  const files = (record.files || []).filter((f) => f.path !== file.path);
  await updateDoc(doc(db, 'records', record.id), { files, fileCount: files.length, updatedAt: nowIso(), updatedBy: actor.displayName || actor.email });
  await updateDoc(doc(db, 'batches', record.batchId), { fileCount: increment(-1), totalBytes: increment(-(file.size || 0)), expectedFiles: increment(-1) }).catch(() => {});
  audit(actor, 'delete_file', { entity: 'record', entityId: record.id, label: file.rel });
}

// ---------- files ----------
export const fileUrl = (path) => getDownloadURL(ref(storage, path));
export const fileBlob = (path) => getBlob(ref(storage, path));

// Saves a file: through the browser's download (needs the bucket's CORS, see README); if that is
// not set up, the file opens in a new tab instead.
export async function downloadFile(file) {
  try {
    const blob = await fileBlob(file.path);
    saveBlob(blob, file.name);
  } catch {
    window.open(await fileUrl(file.path), '_blank', 'noopener');
  }
}

export function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
