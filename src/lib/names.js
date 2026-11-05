// Reading metadata out of file and folder names, and checking what the Records Officer typed.
// No Firebase here (tested by names.test.js).
import { FIELDS, typeOf } from './doctypes.js';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// YYYY-MM-DD from 2026-01-15, 01/15/2026 (month first, as in the Philippines) or Jan 15, 2026.
export function normalizeDate(s) {
  s = String(s ?? '').trim();
  let m = s.match(/^((?:19|20)\d{2})[-/._](\d{1,2})[-/._](\d{1,2})$/);
  let y; let mo; let d;
  if (m) [, y, mo, d] = m;
  else if ((m = s.match(/^(\d{1,2})[-/._](\d{1,2})[-/._]((?:19|20)\d{2})$/))) [, mo, d, y] = m;
  else if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+((?:19|20)\d{2})$/))) {
    const i = MONTHS.findIndex((x) => x.toLowerCase().startsWith(m[1].toLowerCase().slice(0, 3)));
    if (i < 0) return null;
    [y, mo, d] = [m[3], i + 1, m[2]];
  } else return null;
  mo = Number(mo); d = Number(d);
  if (mo < 1 || mo > 12 || d < 1 || d > new Date(Number(y), mo, 0).getDate()) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// 12,500.00 / ₱ 12500 / PHP 3,000 → a number; '' or text → null.
export function parseAmount(s) {
  const t = String(s ?? '').replace(/₱|PHP/gi, '').replace(/[,\s]/g, '');
  if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Math.round(Number(t) * 100) / 100;
}

export const formatAmount = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const NOISE = /^(scan(ned)?|img|image|page|doc(ument)?s?|attachments?|copy|file|new folder|supporting( docs?)?)\s*\d*$/i;
const TYPE_PREFIX = /^(DV|PO|PR|ORS|OBR|JEV|LR|OR|PAYROLL)\b[\s._#-]*(No\.?)?[\s._#-]*/i;

// The DV No., date, amount and payee in a name like 100-2026-01-0001_Juan Dela Cruz_12,500.00.pdf.
// Underscores count as separators (\b does not see them as one, so lookarounds are used).
export function parseName(name) {
  const out = {};
  let rest = String(name).replace(/\.[a-z0-9]{2,5}$/i, '');
  let m = rest.match(/(?<!\d)\d{2,3}-\d{4}-\d{2}-\d{3,5}(?!\d)/); // fund-year-month-series
  if (m) { out.refNo = m[0]; rest = rest.replace(m[0], ' '); } else if ((m = rest.match(/(?<![A-Za-z])(?:DV|PO|PR|ORS|OBR|JEV|LR|OR|PAYROLL)[\s._#-]*(?:No\.?)?[\s._#-]*([A-Za-z0-9]*\d[A-Za-z0-9-]*)/i))) {
    out.refNo = m[1]; rest = rest.replace(m[0], ' ');
  }
  m = rest.match(/(?<!\d)((?:19|20)\d{2}[-.]\d{1,2}[-.]\d{1,2}|\d{1,2}[-.]\d{1,2}[-.](?:19|20)\d{2})(?!\d)/);
  if (m && normalizeDate(m[1])) { out.docDate = normalizeDate(m[1]); rest = rest.replace(m[0], ' '); }
  m = rest.match(/(?:₱|PHP|(?<![A-Za-z])P)?\s?(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})(?![\d.])/i);
  if (m) { out.amount = formatAmount(parseAmount(m[1])); rest = rest.replace(m[0], ' '); }
  const payee = rest.replace(TYPE_PREFIX, '').replace(/_+/g, ' ').replace(/\s*[-–]\s*/g, ' ').replace(/\s{2,}/g, ' ')
    .trim().replace(/^[\s.,;-]+|[\s.,;-]+$/g, '');
  if (/[a-z]{3,}/i.test(payee) && !NOISE.test(payee) && (out.refNo || out.docDate || out.amount)) out.payee = payee;
  return out;
}

export const detectYear = (s) => { const m = String(s).match(/(?<!\d)((?:19|20)\d{2})(?!\d)/); return m ? Number(m[1]) : null; };
export function detectMonth(s) {
  const lower = String(s).toLowerCase();
  const i = MONTHS.findIndex((mo) => new RegExp(`(^|[^a-z])${mo.slice(0, 3).toLowerCase()}`).test(lower));
  return i >= 0 ? i + 1 : null;
}

// A cell is wrong when a required value is missing, or a date or amount cannot be read.
// With no type chosen yet, nothing else counts as required (the type comes first).
export function cellInvalid(docType, row, key) {
  const v = String(row[key] ?? '').trim();
  if (!v) return Boolean(docType) && typeOf(docType).required.includes(key);
  if (key === 'docDate') return !normalizeDate(v);
  if (key === 'amount') return parseAmount(v) === null;
  return false;
}
// 'docType' first when the record's type is not chosen yet.
export const rowProblems = (docType, row) => [...(docType ? [] : ['docType']), ...FIELDS.filter((k) => cellInvalid(docType, row, k))];

// Files skipped when a folder is read: hidden and system files.
export const SKIP_FILE = /^(\.|~\$)|^(thumbs\.db|desktop\.ini)$/i;

// A file or folder name safe for Storage paths and ZIP folders.
export const safeName = (s) => String(s || '').normalize('NFC').replace(/[\\/:*?"<>|#[\]\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file';
export const safePath = (rel) => String(rel || '').split(/[\\/]+/).filter((p) => p && p !== '.' && p !== '..').map(safeName).join('/');

// How files become records: each deepest folder, each top-level folder, each file, or the whole folder.
export function groupKey(rel, mode, root) {
  const parts = rel.split('/');
  if (mode === 'whole') return root;
  if (mode === 'file' || parts.length === 1) return rel;
  if (mode === 'top') return parts[0];
  return parts.slice(0, -1).join('/');
}

// The search words of a record: each word of its reference no., payee, particulars, OBR and check
// nos. and file names, and the start of each (so "jua" finds Juan), lower case. Firestore finds a
// record by one of them (array-contains); the other words are checked in the browser.
export function wordsOf(text) {
  return String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9ñ]+/g) || [];
}
export function keywordsOf(r) {
  const out = new Set();
  const add = (w) => { for (let n = 2; n <= Math.min(w.length, 20); n++) out.add(w.slice(0, n)); };
  const fields = [r.refNo, r.payee, r.orsNo, r.checkNo, r.respCenter, String(r.particulars || '').slice(0, 300), ...(r.files || []).map((f) => f.name)];
  fields.forEach((f) => wordsOf(f).forEach(add));
  // the whole reference no. as typed (with its dashes), lower case
  for (const ref of [r.refNo, r.orsNo, r.checkNo]) if (ref) out.add(String(ref).toLowerCase().trim().slice(0, 60));
  return [...out].slice(0, 600);
}

// Does a record match the words searched for (all of them)?
export function matchesWords(r, q) {
  const words = wordsOf(q);
  if (!words.length) return true;
  const hay = new Set(r.keywords || keywordsOf(r));
  return words.every((w) => hay.has(w.slice(0, 20)));
}

// One CSV cell: quoted, and a leading = + - @ made harmless for spreadsheets.
export function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
export const toCsv = (rows) => `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
