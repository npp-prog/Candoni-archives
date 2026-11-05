/* Candoni Archives: single-page frontend (no build step). */
'use strict';

// ---------- tiny templating (auto-escapes interpolated values) ----------
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const renderVal = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(renderVal).join('') : v === false || v == null ? '' : esc(v));
function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += renderVal(vals[i]); });
  return new Raw(out);
}
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
function mount(el, tpl) { el.innerHTML = tpl.s; return el; }

// ---------- state & api ----------
const state = { user: null, config: null };
let wiz = null; // upload wizard state survives navigation

async function api(path, opts = {}) {
  const o = { method: 'GET', headers: {}, ...opts };
  if (o.body && !(o.body instanceof FormData)) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(o.body); }
  const r = await fetch('/api' + path, o);
  const data = (r.headers.get('content-type') || '').includes('json') ? await r.json() : null;
  if (r.status === 401 && path !== '/login' && path !== '/me') { state.user = null; renderLogin(); throw new Error('Your session expired. Please log in again.'); }
  if (!r.ok) { const e = new Error((data && data.error) || 'Request failed'); e.data = data; throw e; }
  return data;
}

function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3500);
}

// ---------- formatting ----------
const money = (n) => (n == null || n === '' ? '' : '₱ ' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const bytes = (n) => { if (!n) return '0 B'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), 4); return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`; };
const when = (s) => (s ? new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z')).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const dateStr = (s) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const typeName = (code) => (state.config.docTypes.find((t) => t.code === code) || {}).name || code;
const typeOf = (code) => state.config.docTypes.find((t) => t.code === code);
const can = (role) => ({ viewer: 1, officer: 2, admin: 3 })[state.user.role] >= ({ viewer: 1, officer: 2, admin: 3 })[role];
const ROLE_NAMES = { admin: 'Admin', officer: 'Records Officer', viewer: 'Viewer' };
const fileIcon = (name) => { const e = (name.split('.').pop() || '').toLowerCase(); return e === 'pdf' ? '📕' : ['jpg', 'jpeg', 'png', 'tif', 'tiff', 'gif', 'webp'].includes(e) ? '🖼️' : ['xls', 'xlsx', 'csv'].includes(e) ? '📊' : ['doc', 'docx'].includes(e) ? '📝' : '📄'; };

// ---------- login ----------
function renderLogin() {
  mount($('#app'), html`
    <div class="login"><div class="card">
      <div class="brand" style="color:var(--text);padding:0 0 12px"><span style="font-size:30px">🗄️</span><div>Candoni Archives<small class="muted">MGO Candoni · Records Management</small></div></div>
      <form id="login-form">
        <label class="field">Username<input name="username" autocomplete="username" required autofocus></label>
        <label class="field">Password<input name="password" type="password" autocomplete="current-password" required></label>
        <div id="login-err"></div>
        <button class="btn primary" type="submit">Log in</button>
      </form>
    </div></div>`);
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/login', { method: 'POST', body: { username: f.get('username'), password: f.get('password') } });
      await boot();
    } catch (err) {
      mount($('#login-err'), html`<div class="alert err">${err.message}</div>`);
    }
  });
}

// ---------- shell & router ----------
const NAV = [
  { href: '#/dashboard', icon: '📊', label: 'Dashboard', role: 'viewer' },
  { href: '#/upload', icon: '⬆️', label: 'Upload Folder', role: 'officer' },
  { href: '#/search', icon: '🔎', label: 'Search Archives', role: 'viewer' },
  { href: '#/batches', icon: '🗂️', label: 'Uploaded Folders', role: 'viewer' },
  { sep: true, role: 'admin' },
  { href: '#/audit', icon: '🧾', label: 'Audit Log', role: 'admin' },
  { href: '#/users', icon: '👥', label: 'Users', role: 'admin' },
];

function renderShell() {
  mount($('#app'), html`
    <div class="layout">
      <aside class="side" id="side">
        <div class="brand"><span style="font-size:24px">🗄️</span><div>Candoni Archives<small>Records Management</small></div></div>
        <nav class="nav">${NAV.filter((n) => can(n.role)).map((n) => (n.sep ? html`<div class="sep"></div>` : html`<a href="${n.href}" data-nav="${n.href}"><span>${n.icon}</span>${n.label}</a>`))}</nav>
        <div class="user"><b>${state.user.full_name}</b>${ROLE_NAMES[state.user.role]}
          <div class="row" style="margin-top:6px"><a href="#/account" style="color:inherit">Account</a> · <a href="#" id="logout" style="color:inherit">Log out</a></div></div>
      </aside>
      <main class="main">
        <button class="btn menu-btn" id="menu-btn" style="margin-bottom:12px">☰ Menu</button>
        ${state.user.must_change_password ? html`<div class="alert warn">Please <a href="#/account">change your password</a> before continuing.</div>` : ''}
        <div id="view"></div>
      </main>
    </div>`);
  $('#logout').addEventListener('click', async (e) => { e.preventDefault(); await api('/logout', { method: 'POST' }); state.user = null; renderLogin(); });
  $('#menu-btn').addEventListener('click', () => $('#side').classList.toggle('open'));
}

const ROUTES = [
  [/^#\/(dashboard)?$/, () => dashboardPage()],
  [/^#\/upload$/, () => uploadPage()],
  [/^#\/search(?:\?(.*))?$/, (m) => searchPage(new URLSearchParams(m[1] || ''))],
  [/^#\/record\/(\d+)$/, (m) => recordPage(Number(m[1]))],
  [/^#\/batches$/, () => batchesPage()],
  [/^#\/batch\/(\d+)$/, (m) => batchPage(Number(m[1]))],
  [/^#\/audit$/, () => auditPage()],
  [/^#\/users$/, () => usersPage()],
  [/^#\/account$/, () => accountPage()],
];

async function route() {
  if (!state.user) return;
  const hash = location.hash || '#/dashboard';
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', hash.startsWith(a.dataset.nav)));
  $('#side')?.classList.remove('open');
  const view = $('#view');
  for (const [re, fn] of ROUTES) {
    const m = hash.match(re);
    if (m) {
      try { await fn(m); } catch (err) { mount(view, html`<div class="alert err">${err.message}</div>`); }
      return;
    }
  }
  mount(view, html`<div class="empty">Page not found. <a href="#/dashboard">Go to dashboard</a></div>`);
}

window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', (e) => { if (wiz && wiz.uploading) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && state.user) {
    e.preventDefault();
    if (!location.hash.startsWith('#/search')) location.hash = '#/search';
    setTimeout(() => $('#q')?.focus(), 50);
  }
});

async function boot() {
  try { state.user = await api('/me'); } catch { return renderLogin(); }
  state.config = await api('/config');
  renderShell();
  route();
}

// ---------- dashboard ----------
async function dashboardPage() {
  const view = $('#view');
  const s = await api('/stats');
  const maxType = Math.max(1, ...s.byType.map((x) => x.n));
  const maxYear = Math.max(1, ...s.byYear.map((x) => x.n));
  mount(view, html`
    <div class="page-head">
      <div><h1>Dashboard</h1><div class="muted">Overview of the digital archive</div></div>
      <div class="row">
        <form id="quick" class="row"><input id="quick-q" placeholder="Quick search: DV No., payee…" style="width:260px"><button class="btn">Search</button></form>
        ${can('officer') ? html`<a class="btn primary" href="#/upload">⬆️ Upload Folder</a>` : ''}
      </div>
    </div>
    <div class="tiles">
      <div class="tile"><div class="label">Records</div><div class="value">${s.totals.records.toLocaleString()}</div></div>
      <div class="tile"><div class="label">Files</div><div class="value">${s.totals.files.toLocaleString()}</div></div>
      <div class="tile"><div class="label">Folders uploaded</div><div class="value">${s.totals.batches.toLocaleString()}</div></div>
      <div class="tile"><div class="label">Storage used</div><div class="value">${bytes(s.totals.bytes)}</div></div>
      <div class="tile"><div class="label">Total DV amount</div><div class="value" style="font-size:19px">${money(s.totals.dv_amount)}</div></div>
    </div>
    <div class="grid cols-2">
      <div class="card"><h2>Records by document type</h2>
        ${s.byType.length ? html`<div class="bars">${s.byType.map((t) => html`
          <a class="bar" href="#/search?type=${t.doc_type}" style="color:inherit;text-decoration:none" title="Show ${typeName(t.doc_type)}">
            <span>${typeName(t.doc_type)}</span><span class="track"><span class="fill" style="display:block;width:${(t.n / maxType) * 100}%"></span></span><span class="num">${t.n}</span></a>`)}</div>`
          : html`<div class="empty">No records yet.</div>`}
      </div>
      <div class="card"><h2>Records by fiscal year</h2>
        ${s.byYear.length ? html`<div class="bars">${s.byYear.map((t) => html`
          <a class="bar" href="#/search?year=${t.fiscal_year ?? ''}" style="color:inherit;text-decoration:none">
            <span>${t.fiscal_year ? 'FY ' + t.fiscal_year : 'No year'}</span><span class="track"><span class="fill" style="display:block;width:${(t.n / maxYear) * 100}%"></span></span><span class="num">${t.n}</span></a>`)}</div>`
          : html`<div class="empty">No records yet.</div>`}
      </div>
    </div>
    <div class="card"><h2>Recent uploads</h2>${batchTable(s.recent, true)}</div>`);
  $('#quick').addEventListener('submit', (e) => { e.preventDefault(); location.hash = `#/search?q=${encodeURIComponent($('#quick-q').value)}`; });
  bindRowLinks(view);
}

function statusBadge(st) {
  return st === 'complete' ? html`<span class="badge ok">Complete</span>` : st === 'incomplete' ? html`<span class="badge err">Incomplete</span>` : html`<span class="badge warn">Uploading</span>`;
}

function batchTable(rows, compact) {
  if (!rows.length) return html`<div class="empty">No folders uploaded yet.${can('officer') ? html` <a href="#/upload">Upload the first folder →</a>` : ''}</div>`;
  return html`<div class="table-wrap"><table>
    <thead><tr><th>Folder</th><th>Type</th><th>FY</th>${compact ? '' : html`<th>Fund</th><th>Box / Location</th>`}<th class="num">Records</th><th class="num">Files</th>${compact ? '' : html`<th class="num">Size</th>`}<th>Status</th><th>Uploaded</th></tr></thead>
    <tbody>${rows.map((b) => html`<tr class="clickable" data-href="#/batch/${b.id}">
      <td><b>📁 ${b.folder_name}</b></td><td>${typeName(b.doc_type)}</td><td>${b.fiscal_year || ''}</td>
      ${compact ? '' : html`<td>${b.fund || ''}</td><td>${[b.box_no && 'Box ' + b.box_no, b.location].filter(Boolean).join(' · ')}</td>`}
      <td class="num">${b.records ?? b.record_count}</td><td class="num">${b.files ?? b.file_count}</td>${compact ? '' : html`<td class="num">${bytes(b.bytes)}</td>`}
      <td>${statusBadge(b.status)}</td><td class="small">${when(b.created_at)}<br><span class="muted">${b.uploaded_by || b.uploader || ''}</span></td></tr>`)}</tbody></table></div>`;
}

function bindRowLinks(root) {
  $$('tr[data-href]', root).forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
}

// ---------- name parsing (auto-detect metadata from file/folder names) ----------
function normalizeDate(s) {
  s = String(s || '').trim();
  let m = s.match(/^((?:19|20)\d{2})[-/._](\d{1,2})[-/._](\d{1,2})$/);
  let y, mo, d;
  if (m) [, y, mo, d] = m;
  else if ((m = s.match(/^(\d{1,2})[-/._](\d{1,2})[-/._]((?:19|20)\d{2})$/))) [, mo, d, y] = m;
  else if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+((?:19|20)\d{2})$/))) {
    const idx = MONTHS.findIndex((x) => x.toLowerCase().startsWith(m[1].toLowerCase().slice(0, 3)));
    if (idx < 0) return null;
    [y, mo, d] = [m[3], idx + 1, m[2]];
  } else return null;
  mo = Number(mo); d = Number(d);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseAmount(s) {
  const n = Number(String(s ?? '').replace(/[₱,\s]|PHP/gi, ''));
  return String(s ?? '').trim() !== '' && Number.isFinite(n) ? n : null;
}

const NOISE = /^(scan(ned)?|img|image|page|doc(ument)?|attachments?|copy|file|new folder|supporting|docs?)\s*\d*$/i;
const TYPE_PREFIX = /^(DV|PO|PR|ORS|OBR|JEV|LR|OR|PAYROLL)\b[\s._#-]*(No\.?)?[\s._#-]*/i;

function parseName(name) {
  const out = {};
  let rest = String(name).replace(/\.[a-z0-9]{2,5}$/i, '');
  let m = rest.match(/(?<!\d)\d{2,3}-\d{4}-\d{2}-\d{3,5}(?!\d)/); // e.g. 100-2026-01-0001
  if (m) { out.ref_no = m[0]; rest = rest.replace(m[0], ' '); }
  else if ((m = rest.match(/(?<![A-Za-z])(?:DV|PO|PR|ORS|OBR|JEV|LR|OR|PAYROLL)[\s._#-]*(?:No\.?)?[\s._#-]*([A-Za-z0-9]*\d[A-Za-z0-9-]*)/i))) { out.ref_no = m[1]; rest = rest.replace(m[0], ' '); }
  m = rest.match(/(?<!\d)((?:19|20)\d{2}[-.]\d{1,2}[-.]\d{1,2}|\d{1,2}[-.]\d{1,2}[-.](?:19|20)\d{2})(?!\d)/);
  if (m && normalizeDate(m[1])) { out.doc_date = normalizeDate(m[1]); rest = rest.replace(m[0], ' '); }
  m = rest.match(/(?:₱|PHP|(?<![A-Za-z])P)?\s?(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})(?![\d.])/i);
  if (m) { out.amount = Number(m[1].replace(/,/g, '')).toLocaleString('en-PH', { minimumFractionDigits: 2 }); rest = rest.replace(m[0], ' '); }
  let payee = rest.replace(TYPE_PREFIX, '').replace(/[_]+/g, ' ').replace(/\s*[-–]\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  payee = payee.replace(/^[\s.,;-]+|[\s.,;-]+$/g, '');
  if (/[a-z]{3,}/i.test(payee) && !NOISE.test(payee) && (out.ref_no || out.doc_date || out.amount)) out.payee = payee;
  return out;
}

function detectYear(s) { const m = String(s).match(/(?<!\d)((?:19|20)\d{2})(?!\d)/); return m ? Number(m[1]) : null; }
function detectMonth(s) {
  const lower = String(s).toLowerCase();
  const i = MONTHS.findIndex((mo) => new RegExp(`\\b${mo.slice(0, 3).toLowerCase()}`).test(lower));
  return i >= 0 ? i + 1 : null;
}

// ---------- upload wizard ----------
const SKIP = /^(\.|~\$)|^(thumbs\.db|desktop\.ini)$/i;
const GRID_FIELDS = ['ref_no', 'doc_date', 'payee', 'amount', 'particulars', 'ors_no', 'check_no'];
const STEP_NAMES = ['Select folder', 'Folder details', 'Group files', 'Fill in metadata', 'Upload'];

function newWizard() {
  return { step: 0, root: '', files: [], skipped: [], batch: {}, groupMode: 'deepest', rows: [], dups: [], uploading: false, batchId: null, results: null };
}

async function uploadPage() {
  if (!can('officer')) { mount($('#view'), html`<div class="alert err">Only Records Officers can upload.</div>`); return; }
  if (!wiz) wiz = newWizard();
  renderWizard();
}

function renderWizard() {
  const view = $('#view');
  mount(view, html`
    <div class="page-head">
      <div><h1>Upload Folder</h1><div class="muted">Upload a whole folder of scanned archives with its metadata.</div></div>
      ${wiz.step > 0 && !wiz.uploading ? html`<button class="btn" id="wiz-reset">Start over</button>` : ''}
    </div>
    <div class="steps">${STEP_NAMES.map((n, i) => html`<div class="step ${i < wiz.step ? 'done' : i === wiz.step ? 'current' : ''}">${n}</div>`)}</div>
    <div id="wiz-body"></div>`);
  $('#wiz-reset')?.addEventListener('click', () => { if (confirm('Discard this upload and start over?')) { wiz = newWizard(); renderWizard(); } });
  [stepSelect, stepDetails, stepGroup, stepMetadata, stepUpload][wiz.step]($('#wiz-body'));
}

function go(step) { wiz.step = step; renderWizard(); window.scrollTo(0, 0); }

// Step 1: pick folder
function stepSelect(body) {
  mount(body, html`
    <div class="card">
      <div class="dropzone" id="drop">
        <div class="big">📂</div>
        <h2 style="margin-top:10px">Drag and drop a folder here</h2>
        <p class="muted">or</p>
        <label class="btn primary">Select folder…<input type="file" id="pick" webkitdirectory directory multiple hidden></label>
        <p class="small muted" style="margin-top:16px">Tip: name files like <span class="mono">100-2026-01-0001_Juan Dela Cruz_12,500.00.pdf</span> so the DV No., payee and amount are filled in automatically.<br>
        Max ${state.config.maxFileMb} MB per file. Hidden and system files (Thumbs.db, desktop.ini) are skipped.</p>
      </div>
    </div>`);
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', async (e) => {
    const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    if (!entries.length) return toast('Your browser could not read that folder. Use "Select folder…" instead.', 'err');
    mount(drop, html`<div class="big">⏳</div><p>Reading folder…</p>`);
    const list = [];
    for (const en of entries) await walkEntry(en, '', list);
    acceptFiles(list);
  });
  $('#pick').addEventListener('change', (e) => acceptFiles([...e.target.files].map((f) => ({ file: f, path: f.webkitRelativePath || f.name }))));
}

async function walkEntry(entry, prefix, out) {
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    out.push({ file, path: prefix + entry.name });
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    let chunk;
    do {
      chunk = await new Promise((res, rej) => reader.readEntries(res, rej));
      for (const c of chunk) await walkEntry(c, `${prefix}${entry.name}/`, out);
    } while (chunk.length);
  }
}

function acceptFiles(list) {
  if (!list.length) { toast('That folder is empty.', 'err'); return renderWizard(); }
  const firsts = new Set(list.map((x) => x.path.split('/')[0]));
  const hasRoot = firsts.size === 1 && list.every((x) => x.path.includes('/'));
  const root = hasRoot ? [...firsts][0] : 'Uploaded files';
  const maxBytes = state.config.maxFileMb * 1024 * 1024;
  const files = [];
  const skipped = [];
  for (const x of list) {
    const rel = hasRoot ? x.path.split('/').slice(1).join('/') : x.path;
    const name = rel.split('/').pop();
    if (rel.split('/').some((seg) => SKIP.test(seg))) skipped.push({ rel, reason: 'hidden/system file' });
    else if (x.file.size > maxBytes) skipped.push({ rel, reason: `larger than ${state.config.maxFileMb} MB` });
    else if (x.file.size === 0) skipped.push({ rel, reason: 'empty file' });
    else files.push({ file: x.file, rel, name, size: x.file.size });
  }
  files.sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true }));
  if (!files.length) { toast('No usable files found in that folder.', 'err'); return renderWizard(); }
  const firstRef = files.map((f) => parseName(f.name).ref_no).find(Boolean) || '';
  const refParts = firstRef.split('-');
  wiz.root = root;
  wiz.files = files;
  wiz.skipped = skipped;
  wiz.batch = {
    folder_name: root,
    doc_type: /payroll/i.test(root) ? 'PAYROLL' : /\bjev\b/i.test(root) ? 'JEV' : 'DV',
    fiscal_year: detectYear(root) || (refParts.length === 4 ? Number(refParts[1]) : '') || new Date().getFullYear(),
    month: detectMonth(root) || (refParts.length === 4 ? Number(refParts[2]) : '') || '',
    fund: refParts[0] === '100' ? 'General Fund' : refParts[0] === '200' ? 'Special Education Fund' : refParts[0] === '300' ? 'Trust Fund' : '',
    box_no: '', location: '', remarks: '',
  };
  wiz.groupMode = files.some((f) => f.rel.includes('/')) ? 'deepest' : 'file';
  wiz.rows = [];
  go(1);
}

function folderSummary() {
  const total = wiz.files.reduce((s, f) => s + f.size, 0);
  const exts = {};
  wiz.files.forEach((f) => { const e = (f.name.split('.').pop() || '?').toUpperCase(); exts[e] = (exts[e] || 0) + 1; });
  return html`<div class="row" style="gap:16px">
    <span>📁 <b>${wiz.root}</b></span><span>${wiz.files.length} files</span><span>${bytes(total)}</span>
    <span>${Object.entries(exts).map(([e, n]) => html`<span class="badge" style="margin-right:4px">${e} × ${n}</span>`)}</span>
    ${wiz.skipped.length ? html`<span class="badge warn" title="${wiz.skipped.map((s) => `${s.rel}: ${s.reason}`).join('\n')}">${wiz.skipped.length} skipped</span>` : ''}
  </div>`;
}

function fileTree() {
  const tree = {};
  wiz.files.forEach((f) => {
    const parts = f.rel.split('/');
    let node = tree;
    parts.slice(0, -1).forEach((p) => { node[p] = node[p] || {}; node = node[p]; });
    (node.__files = node.__files || []).push(f);
  });
  const renderNode = (node) => html`<ul>${Object.keys(node).filter((k) => k !== '__files').sort().map((k) => html`<li><details ${Object.keys(node).length < 6 ? 'open' : ''}><summary>📁 ${k}</summary>${renderNode(node[k])}</details></li>`)}
    ${(node.__files || []).map((f) => html`<li>${fileIcon(f.name)} ${f.name} <span class="muted small">${bytes(f.size)}</span></li>`)}</ul>`;
  return html`<div class="tree">${renderNode(tree)}</div>`;
}

// Step 2: batch-level details
function stepDetails(body) {
  const b = wiz.batch;
  const years = []; for (let y = new Date().getFullYear() + 1; y >= 1990; y--) years.push(y);
  mount(body, html`
    <div class="card">${folderSummary()}</div>
    <div class="grid cols-2">
      <div class="card">
        <h2>Folder details</h2>
        <p class="muted small" style="margin-top:-6px">These apply to every document in this folder.</p>
        <form id="details" class="form-grid">
          <label class="field">Document type <span class="req">*</span>
            <select name="doc_type" required>${state.config.docTypes.map((t) => html`<option value="${t.code}" ${t.code === b.doc_type ? 'selected' : ''}>${t.name}</option>`)}</select></label>
          <label class="field">Fiscal year <span class="req">*</span>
            <select name="fiscal_year" required>${years.map((y) => html`<option ${Number(b.fiscal_year) === y ? 'selected' : ''}>${y}</option>`)}</select></label>
          <label class="field">Month
            <select name="month"><option value="">— Whole year / mixed —</option>${MONTHS.map((m, i) => html`<option value="${i + 1}" ${Number(b.month) === i + 1 ? 'selected' : ''}>${m}</option>`)}</select></label>
          <label class="field">Fund
            <select name="fund"><option value="">—</option>${state.config.funds.map((f) => html`<option ${b.fund === f ? 'selected' : ''}>${f}</option>`)}</select></label>
          <label class="field">Box no.<input name="box_no" value="${b.box_no}" placeholder="e.g. 2026-DV-03"></label>
          <label class="field">Shelf / location<input name="location" value="${b.location}" placeholder="e.g. Records Room, Shelf B2"></label>
          <label class="field wide">Remarks<textarea name="remarks" placeholder="Optional notes about this folder">${b.remarks}</textarea></label>
          <label class="field wide">Folder name (as it will appear in the archive)<input name="folder_name" value="${b.folder_name}" required></label>
        </form>
      </div>
      <div class="card"><h2>Folder contents</h2>${fileTree()}
        ${wiz.skipped.length ? html`<details style="margin-top:10px"><summary class="small muted">${wiz.skipped.length} file(s) will be skipped</summary>
          <ul class="small">${wiz.skipped.map((s) => html`<li>${s.rel}: <span class="muted">${s.reason}</span></li>`)}</ul></details>` : ''}
      </div>
    </div>
    <div class="row end"><button class="btn" id="back">← Back</button><button class="btn primary" id="next">Next: Group files →</button></div>`);
  const save = () => { const f = new FormData($('#details')); for (const [k, v] of f) wiz.batch[k] = v; };
  $('#details').addEventListener('change', save);
  $('#back').addEventListener('click', () => { if (confirm('Choose a different folder? The current selection will be cleared.')) { wiz = newWizard(); renderWizard(); } });
  $('#next').addEventListener('click', () => {
    if (!$('#details').reportValidity()) return;
    save();
    go(2);
  });
}

function groupKey(f, mode) {
  const parts = f.rel.split('/');
  if (mode === 'whole') return wiz.root;
  if (mode === 'file' || parts.length === 1) return f.rel;
  if (mode === 'top') return parts[0];
  return parts.slice(0, -1).join('/'); // deepest folder
}

function buildRows() {
  const groups = new Map();
  wiz.files.forEach((f) => {
    const k = groupKey(f, wiz.groupMode);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  });
  const prev = new Map(wiz.rows.map((r) => [r.key, r]));
  wiz.rows = [...groups.entries()].map(([key, files]) => {
    if (prev.has(key)) return { ...prev.get(key), files };
    const row = { key, files, auto: {} };
    GRID_FIELDS.forEach((k) => { row[k] = ''; });
    const sources = [key.split('/').pop(), ...files.map((f) => f.name)];
    for (const src of sources) {
      const p = parseName(src);
      for (const [k, v] of Object.entries(p)) if (!row[k] && v) { row[k] = v; row.auto[k] = true; }
    }
    return row;
  });
}

// Step 3: how files become records
function stepGroup(body) {
  const preview = () => {
    buildRows();
    const sample = wiz.rows.slice(0, 8);
    mount($('#group-preview'), html`
      <p><b>${wiz.rows.length}</b> record(s) will be created from <b>${wiz.files.length}</b> file(s).</p>
      <div class="table-wrap"><table><thead><tr><th>#</th><th>Record (group)</th><th>Files</th></tr></thead><tbody>
      ${sample.map((r, i) => html`<tr><td class="muted">${i + 1}</td><td>${r.key}</td><td class="small">${r.files.map((f) => f.name).join(', ')}</td></tr>`)}
      ${wiz.rows.length > sample.length ? html`<tr><td></td><td colspan="2" class="muted">…and ${wiz.rows.length - sample.length} more</td></tr>` : ''}
      </tbody></table></div>`);
  };
  const opt = (v, title, desc) => html`<label><input type="radio" name="mode" value="${v}" ${wiz.groupMode === v ? 'checked' : ''}><span><b>${title}</b><span class="small muted">${desc}</span></span></label>`;
  mount(body, html`
    <div class="card">${folderSummary()}</div>
    <div class="card">
      <h2>How should files become records?</h2>
      <p class="muted small" style="margin-top:-6px">A record is one document or transaction (for example one DV and its attachments). Each record gets its own metadata.</p>
      <div class="choice">
        ${opt('deepest', 'Each subfolder = one record', 'Files in the same folder (e.g. DV + ORS + receipts) are kept together.')}
        ${opt('top', 'Each top-level subfolder = one record', 'Everything inside a first-level subfolder, including nested folders.')}
        ${opt('file', 'Each file = one record', 'Best when every DV is scanned as a single PDF.')}
        ${opt('whole', 'Whole folder = one record', 'The entire folder is one document.')}
      </div>
      <div id="group-preview" style="margin-top:16px"></div>
    </div>
    <div class="row end"><button class="btn" id="back">← Back</button><button class="btn primary" id="next">Next: Fill in metadata →</button></div>`);
  $$('input[name=mode]').forEach((r) => r.addEventListener('change', () => { wiz.groupMode = r.value; preview(); }));
  preview();
  $('#back').addEventListener('click', () => go(1));
  $('#next').addEventListener('click', () => go(3));
}

// Step 4: metadata grid
function fieldLabel(k) {
  if (k === 'ref_no') return typeOf(wiz.batch.doc_type).refLabel;
  return state.config.fieldLabels[k];
}

function cellInvalid(row, k) {
  const req = typeOf(wiz.batch.doc_type).required.includes(k);
  const v = String(row[k] ?? '').trim();
  if (!v) return req;
  if (k === 'doc_date') return !normalizeDate(v);
  if (k === 'amount') return parseAmount(v) === null;
  return false;
}

function rowIssues() {
  return wiz.rows.map((r, i) => ({ i, bad: GRID_FIELDS.filter((k) => cellInvalid(r, k)) })).filter((x) => x.bad.length);
}

function stepMetadata(body) {
  const t = typeOf(wiz.batch.doc_type);
  const dupSet = new Set(wiz.dups.map((d) => d.ref_no.toLowerCase()));
  const refCounts = {};
  wiz.rows.forEach((r) => { const k = String(r.ref_no).trim().toLowerCase(); if (k) refCounts[k] = (refCounts[k] || 0) + 1; });
  const autoCount = wiz.rows.reduce((s, r) => s + Object.keys(r.auto).length, 0);
  mount(body, html`
    <div class="card">${folderSummary()}</div>
    <div class="card">
      <div class="row" style="margin-bottom:10px">
        <h2 style="margin:0">Metadata: ${t.name}</h2><span class="spacer"></span>
        <span class="small muted">Required: ${t.required.map((k) => fieldLabel(k)).join(', ')}</span>
      </div>
      <div class="alert info small">
        ${autoCount ? html`<b>${autoCount}</b> value(s) were detected from file/folder names and are shown in <i style="color:var(--primary)">blue italics</i>. Please check them. ` : ''}
        Click a cell to type. <b>⇩</b> fills empty cells below with the value above. You can also <b>paste rows from Excel</b> into the grid. Dates: YYYY-MM-DD or MM/DD/YYYY.
      </div>
      <div id="grid-status"></div>
      <div class="meta-grid"><table>
        <thead><tr><th>#</th><th>Record / files</th>
          ${GRID_FIELDS.map((k) => html`<th>${fieldLabel(k)}${t.required.includes(k) ? html` <span style="color:var(--err)">*</span>` : ''}
            <button class="btn link fill-down" data-fill="${k}" title="Fill empty cells down">⇩</button></th>`)}</tr></thead>
        <tbody>${wiz.rows.map((r, i) => {
          const refKey = String(r.ref_no).trim().toLowerCase();
          const isDup = refKey && (dupSet.has(refKey) || refCounts[refKey] > 1);
          return html`<tr class="${isDup ? 'dup' : ''}" title="${isDup ? 'This reference number already exists or is repeated' : ''}">
            <td class="idx">${i + 1}</td>
            <td class="group"><b>${r.key.split('/').pop()}</b><span class="files-mini" title="${r.files.map((f) => f.rel).join('\n')}">${r.files.length} file(s): ${r.files.map((f) => f.name).join(', ')}</span></td>
            ${GRID_FIELDS.map((k) => html`<td><input data-row="${i}" data-field="${k}" value="${r[k]}" class="${r.auto[k] ? 'auto' : ''} ${cellInvalid(r, k) ? 'missing' : ''}"
              style="min-width:${k === 'particulars' ? 220 : k === 'payee' ? 170 : k === 'ref_no' ? 160 : 120}px" ${k === 'doc_date' ? html`placeholder="YYYY-MM-DD"` : ''}></td>`)}
          </tr>`;
        })}</tbody></table></div>
    </div>
    <div class="row end"><button class="btn" id="back">← Back</button><button class="btn primary" id="next">Review &amp; upload →</button></div>`);

  const updateStatus = () => {
    const issues = rowIssues();
    mount($('#grid-status'), issues.length
      ? html`<div class="alert err small">${issues.length} record(s) still need required or valid values (highlighted in red).</div>`
      : html`<div class="alert ok small">✓ All ${wiz.rows.length} records have the required metadata.</div>`);
  };
  updateStatus();

  const grid = $('.meta-grid');
  grid.addEventListener('input', (e) => {
    const inp = e.target.closest('input[data-field]');
    if (!inp) return;
    const row = wiz.rows[Number(inp.dataset.row)];
    row[inp.dataset.field] = inp.value;
    delete row.auto[inp.dataset.field];
    inp.classList.remove('auto');
    inp.classList.toggle('missing', cellInvalid(row, inp.dataset.field));
  });
  grid.addEventListener('focusout', (e) => {
    const inp = e.target.closest('input[data-field]');
    if (!inp) return;
    const row = wiz.rows[Number(inp.dataset.row)];
    const k = inp.dataset.field;
    if (k === 'doc_date' && normalizeDate(inp.value)) row[k] = inp.value = normalizeDate(inp.value);
    if (k === 'amount' && parseAmount(inp.value) !== null) row[k] = inp.value = parseAmount(inp.value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    inp.classList.toggle('missing', cellInvalid(row, k));
    updateStatus();
  });
  grid.addEventListener('keydown', (e) => {
    const inp = e.target.closest('input[data-field]');
    if (!inp || !['Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const next = Number(inp.dataset.row) + (e.key === 'ArrowUp' ? -1 : 1);
    const target = $(`input[data-row="${next}"][data-field="${inp.dataset.field}"]`, grid);
    if (target) { e.preventDefault(); target.focus(); target.select(); }
  });
  grid.addEventListener('paste', (e) => {
    const inp = e.target.closest('input[data-field]');
    const text = e.clipboardData.getData('text/plain');
    if (!inp || !/[\t\n]/.test(text.trim())) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
    const r0 = Number(inp.dataset.row);
    const c0 = GRID_FIELDS.indexOf(inp.dataset.field);
    lines.forEach((cells, dr) => cells.forEach((v, dc) => {
      const row = wiz.rows[r0 + dr];
      const k = GRID_FIELDS[c0 + dc];
      if (row && k) { row[k] = v.trim(); delete row.auto[k]; }
    }));
    toast(`Pasted ${lines.length} row(s).`, 'ok');
    stepMetadata(body);
  });
  $$('[data-fill]', body).forEach((btn) => btn.addEventListener('click', () => {
    const k = btn.dataset.fill;
    let last = '';
    let n = 0;
    wiz.rows.forEach((r) => { if (String(r[k]).trim()) last = r[k]; else if (last) { r[k] = last; n++; } });
    toast(n ? `Filled ${n} empty cell(s).` : 'Nothing to fill. Type a value in a row first.');
    stepMetadata(body);
  }));
  $('#back').addEventListener('click', () => go(2));
  $('#next').addEventListener('click', async () => {
    const issues = rowIssues();
    if (issues.length) {
      toast(`Fix the highlighted cells first (row ${issues[0].i + 1}).`, 'err');
      $(`input[data-row="${issues[0].i}"][data-field="${issues[0].bad[0]}"]`)?.focus();
      return;
    }
    try {
      const res = await api('/batches/check', { method: 'POST', body: { doc_type: wiz.batch.doc_type, ref_nos: wiz.rows.map((r) => r.ref_no) } });
      wiz.dups = res.existing;
    } catch (err) { return toast(err.message, 'err'); }
    go(4);
  });
}

// Step 5: review & upload
function stepUpload(body) {
  const totalBytes = wiz.files.reduce((s, f) => s + f.size, 0);
  const t = typeOf(wiz.batch.doc_type);
  const repeated = Object.entries(wiz.rows.reduce((m, r) => { const k = String(r.ref_no).trim(); if (k) m[k] = (m[k] || 0) + 1; return m; }, {})).filter(([, n]) => n > 1);
  const totalAmount = wiz.rows.reduce((s, r) => s + (parseAmount(r.amount) || 0), 0);
  mount(body, html`
    <div class="card">
      <h2>Review</h2>
      <dl class="meta">
        <dt>Folder</dt><dd>📁 ${wiz.batch.folder_name}</dd>
        <dt>Document type</dt><dd>${t.name}</dd>
        <dt>Fiscal year / month</dt><dd>${wiz.batch.fiscal_year}${wiz.batch.month ? ' · ' + MONTHS[wiz.batch.month - 1] : ''}</dd>
        <dt>Fund</dt><dd>${wiz.batch.fund || '—'}</dd>
        <dt>Box / location</dt><dd>${[wiz.batch.box_no, wiz.batch.location].filter(Boolean).join(' · ') || '—'}</dd>
        <dt>Records</dt><dd>${wiz.rows.length}</dd>
        <dt>Files</dt><dd>${wiz.files.length} (${bytes(totalBytes)})</dd>
        ${totalAmount ? html`<dt>Total amount</dt><dd>${money(totalAmount)}</dd>` : ''}
      </dl>
    </div>
    ${wiz.dups.length ? html`<div class="alert warn"><b>${wiz.dups.length} reference number(s) already exist in the archive:</b>
      ${wiz.dups.slice(0, 10).map((d) => html` <a href="#/record/${d.id}" target="_blank">${d.ref_no}</a>`)}${wiz.dups.length > 10 ? ' …' : ''}.
      You can still upload (e.g. additional attachments), or go back and correct them.</div>` : ''}
    ${repeated.length ? html`<div class="alert warn">These reference numbers appear more than once in this folder: ${repeated.map(([k, n]) => `${k} (×${n})`).join(', ')}</div>` : ''}
    <div class="card" id="upload-card">
      ${wiz.results ? '' : html`<div class="row end"><button class="btn" id="back" ${wiz.uploading ? 'disabled' : ''}>← Back</button>
        <button class="btn primary" id="start" ${wiz.uploading ? 'disabled' : ''}>⬆️ Upload ${wiz.files.length} files</button></div>`}
      <div id="progress-area"></div>
    </div>`);
  $('#back')?.addEventListener('click', () => go(3));
  $('#start')?.addEventListener('click', startUpload);
  if (wiz.results) renderProgress();
}

function renderProgress() {
  const area = $('#progress-area');
  if (!area) return;
  const res = wiz.results;
  const total = wiz.files.reduce((s, f) => s + f.size, 0);
  const sent = wiz.files.reduce((s, f, i) => s + (res.status[i] === 'done' ? f.size : res.status[i] === 'uploading' ? res.loaded[i] || 0 : 0), 0);
  const done = res.status.filter((s) => s === 'done').length;
  const failed = res.status.map((s, i) => (s === 'error' ? i : -1)).filter((i) => i >= 0);
  const dupFiles = res.dupOf.filter(Boolean).length;
  const finished = !wiz.uploading;
  const label = { pending: html`<span class="badge">Waiting</span>`, uploading: html`<span class="badge warn">Uploading</span>`, done: html`<span class="badge ok">Done</span>`, error: html`<span class="badge err">Failed</span>` };
  mount(area, html`
    <div class="row" style="margin:8px 0"><b>${done} / ${wiz.files.length} files</b><span class="muted">${bytes(sent)} of ${bytes(total)}</span><span class="spacer"></span>
      ${finished && failed.length ? html`<button class="btn" id="retry">↻ Retry ${failed.length} failed</button>` : ''}
      ${finished && wiz.batchId ? html`<a class="btn primary" href="#/batch/${wiz.batchId}">Open uploaded folder →</a><button class="btn" id="another">Upload another folder</button>` : ''}</div>
    <div class="progress"><div style="width:${total ? (sent / total) * 100 : 0}%"></div></div>
    ${finished ? (failed.length
      ? html`<div class="alert err" style="margin-top:12px">${failed.length} file(s) failed to upload. Click <b>Retry</b>. The batch is marked <b>Incomplete</b> until all files are uploaded.</div>`
      : html`<div class="alert ok" style="margin-top:12px">✓ Upload complete. ${wiz.rows.length} records and ${wiz.files.length} files were archived.</div>`) : ''}
    ${dupFiles ? html`<div class="alert warn">${dupFiles} file(s) have identical content to files already in the archive (same SHA-256 checksum).</div>` : ''}
    <div class="upload-list" style="margin-top:10px">${wiz.files.map((f, i) => html`<div class="item">${fileIcon(f.name)}<span class="name" title="${f.rel}">${f.rel}</span>
      ${res.errors[i] ? html`<span class="small" style="color:var(--err)">${res.errors[i]}</span>` : ''}
      ${res.dupOf[i] ? html`<a class="badge warn" href="#/record/${res.dupOf[i].record_id}" target="_blank">duplicate of ${res.dupOf[i].ref_no || 'record ' + res.dupOf[i].record_id}</a>` : ''}
      <span class="muted small">${bytes(f.size)}</span>${label[res.status[i]]}</div>`)}</div>`);
  $('#retry')?.addEventListener('click', () => runUploads(failed));
  $('#another')?.addEventListener('click', () => { wiz = newWizard(); renderWizard(); });
}

async function startUpload() {
  wiz.uploading = true;
  wiz.results = { status: wiz.files.map(() => 'pending'), loaded: [], errors: [], dupOf: [] };
  stepUpload($('#wiz-body'));
  try {
    const payload = {
      batch: wiz.batch,
      records: wiz.rows.map((r) => ({ group_key: r.key, ...Object.fromEntries(GRID_FIELDS.map((k) => [k, k === 'doc_date' ? normalizeDate(r[k]) || '' : r[k]])) })),
    };
    const res = await api('/batches', { method: 'POST', body: payload });
    wiz.batchId = res.batch_id;
    const idByKey = new Map(res.records.map((r) => [r.group_key, r.id]));
    wiz.recordIdForFile = wiz.files.map((f) => idByKey.get(groupKey(f, wiz.groupMode)));
  } catch (err) {
    wiz.uploading = false;
    wiz.results = null;
    toast(err.message, 'err');
    stepUpload($('#wiz-body'));
    return;
  }
  await runUploads(wiz.files.map((_, i) => i));
}

function uploadOne(i) {
  return new Promise((resolve) => {
    const f = wiz.files[i];
    const fd = new FormData();
    fd.append('record_id', wiz.recordIdForFile[i]);
    fd.append('relative_path', f.rel);
    fd.append('file', f.file, f.name);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/batches/${wiz.batchId}/files`);
    xhr.upload.onprogress = (e) => { wiz.results.loaded[i] = e.loaded; throttledProgress(); };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status === 200) { wiz.results.status[i] = 'done'; wiz.results.errors[i] = null; wiz.results.dupOf[i] = data.duplicate_of; }
      else { wiz.results.status[i] = 'error'; wiz.results.errors[i] = data.error || `HTTP ${xhr.status}`; }
      resolve();
    };
    xhr.onerror = () => { wiz.results.status[i] = 'error'; wiz.results.errors[i] = 'Network error'; resolve(); };
    wiz.results.status[i] = 'uploading';
    xhr.send(fd);
  });
}

let progressTimer = null;
function throttledProgress() {
  if (progressTimer) return;
  progressTimer = setTimeout(() => { progressTimer = null; renderProgress(); }, 250);
}

async function runUploads(indexes) {
  wiz.uploading = true;
  indexes.forEach((i) => { wiz.results.status[i] = 'pending'; wiz.results.errors[i] = null; });
  renderProgress();
  const queue = [...indexes];
  const worker = async () => { while (queue.length) { await uploadOne(queue.shift()); throttledProgress(); } };
  await Promise.all([worker(), worker(), worker()]);
  try {
    const fin = await api(`/batches/${wiz.batchId}/finalize`, { method: 'POST', body: { expected_files: wiz.files.length } });
    toast(fin.status === 'complete' ? 'Folder archived successfully.' : 'Some files failed. Please retry.', fin.status === 'complete' ? 'ok' : 'err');
  } catch (err) { toast(err.message, 'err'); }
  wiz.uploading = false;
  if (location.hash === '#/upload') stepUpload($('#wiz-body'));
}

// ---------- search ----------
async function searchPage(params) {
  const view = $('#view');
  const p = Object.fromEntries(params);
  const years = []; for (let y = new Date().getFullYear() + 1; y >= 1990; y--) years.push(y);
  mount(view, html`
    <div class="page-head"><div><h1>Search Archives</h1>${p.batch ? html`<div class="badge" style="margin-bottom:4px">Within folder #${p.batch} · <a href="#/search">clear</a></div>` : ''}<div class="muted">Find records by reference no., payee, particulars or file name. Press <kbd>/</kbd> to search from any page.</div></div></div>
    <form class="card" id="sform">
      <div class="row" style="margin-bottom:12px">
        <input id="q" name="q" value="${p.q || ''}" placeholder="e.g. 100-2026-01-0001, Juan Dela Cruz, office supplies…" style="flex:1;min-width:240px;font-size:15px;padding:9px 12px">
        <button class="btn primary">Search</button>
        <button class="btn" type="button" id="clear">Clear</button>
      </div>
      <div class="form-grid">
        <label class="field">Document type<select name="type"><option value="">All types</option>${state.config.docTypes.map((t) => html`<option value="${t.code}" ${p.type === t.code ? 'selected' : ''}>${t.name}</option>`)}</select></label>
        <label class="field">Fiscal year<select name="year"><option value="">All years</option>${years.map((y) => html`<option ${String(y) === p.year ? 'selected' : ''}>${y}</option>`)}</select></label>
        <label class="field">Fund<select name="fund"><option value="">All funds</option>${state.config.funds.map((f) => html`<option ${p.fund === f ? 'selected' : ''}>${f}</option>`)}</select></label>
        <label class="field">Date from<input type="date" name="from" value="${p.from || ''}"></label>
        <label class="field">Date to<input type="date" name="to" value="${p.to || ''}"></label>
        <label class="field">Amount from<input type="number" step="0.01" name="min" value="${p.min || ''}"></label>
        <label class="field">Amount to<input type="number" step="0.01" name="max" value="${p.max || ''}"></label>
      </div>
      <input type="hidden" name="batch" value="${p.batch || ''}"><input type="hidden" name="sort" value="${p.sort || ''}"><input type="hidden" name="dir" value="${p.dir || ''}">
    </form>
    <div id="results"></div>`);
  const form = $('#sform');
  const toHash = (extra = {}) => {
    const fd = new FormData(form);
    const q = new URLSearchParams();
    for (const [k, v] of fd) if (v) q.set(k, v);
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v); else q.delete(k);
    location.hash = `#/search?${q}`;
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); toHash({ page: '' }); });
  $$('select, input[type=date]', form).forEach((el) => el.addEventListener('change', () => toHash({ page: '' })));
  $('#clear').addEventListener('click', () => { location.hash = '#/search'; });

  const data = await api(`/records?${new URLSearchParams({ ...p, limit: 25 })}`);
  const sortTh = (k, label, cls = '') => {
    const active = p.sort === k;
    const nextDir = active && p.dir === 'asc' ? 'desc' : 'asc';
    return html`<th class="sortable ${cls}" data-sort="${k}" data-dir="${nextDir}">${label}${active ? (p.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`;
  };
  const pages = Math.max(1, Math.ceil(data.total / data.limit));
  const csvQs = new URLSearchParams({ ...p, format: 'csv' });
  csvQs.delete('page');
  mount($('#results'), html`
    <div class="pager">
      <div><b>${data.total.toLocaleString()}</b> record(s)${data.total_amount ? html` · total ${money(data.total_amount)}` : ''}</div>
      <div class="row">${data.total ? html`<a class="btn small" href="/api/records?${csvQs}">⬇ Export CSV</a>` : ''}</div>
    </div>
    ${data.rows.length ? html`<div class="table-wrap"><table>
      <thead><tr>${sortTh('doc_type', 'Type')}${sortTh('ref_no', 'Reference No.')}${sortTh('doc_date', 'Date')}${sortTh('payee', 'Payee')}<th>Particulars</th>${sortTh('amount', 'Amount', 'num')}<th>Box / Location</th><th class="num">Files</th></tr></thead>
      <tbody>${data.rows.map((r) => html`<tr class="clickable" data-href="#/record/${r.id}">
        <td><span class="badge">${r.doc_type}</span></td><td><b>${r.ref_no || '—'}</b></td><td style="white-space:nowrap">${dateStr(r.doc_date)}</td>
        <td>${r.payee || ''}</td><td class="small">${(r.particulars || '').slice(0, 90)}${(r.particulars || '').length > 90 ? '…' : ''}</td>
        <td class="num" style="white-space:nowrap">${money(r.amount)}</td>
        <td class="small">${[r.box_no && 'Box ' + r.box_no, r.location].filter(Boolean).join(' · ')}</td><td class="num">${r.file_count}</td></tr>`)}</tbody>
    </table></div>
    <div class="pager"><span class="muted">Page ${data.page} of ${pages}</span>
      <div class="row"><button class="btn small" id="prev" ${data.page <= 1 ? 'disabled' : ''}>← Previous</button><button class="btn small" id="nextp" ${data.page >= pages ? 'disabled' : ''}>Next →</button></div></div>`
    : html`<div class="card empty">No records match your search.</div>`}`);
  bindRowLinks($('#results'));
  $$('th[data-sort]').forEach((th) => th.addEventListener('click', () => {
    form.sort.value = th.dataset.sort; form.dir.value = th.dataset.dir; toHash({ page: '' });
  }));
  $('#prev')?.addEventListener('click', () => toHash({ page: data.page - 1 }));
  $('#nextp')?.addEventListener('click', () => toHash({ page: data.page + 1 }));
}

// ---------- record detail ----------
const ACTION_LABELS = {
  upload_file: 'uploaded file', view_record: 'viewed', edit_record: 'edited metadata', view_file: 'previewed file', download_file: 'downloaded file', delete_file: 'deleted file',
};

async function recordPage(id) {
  const view = $('#view');
  const { record: r, files, history } = await api(`/records/${id}`);
  const t = typeOf(r.doc_type) || { refLabel: 'Reference No.', required: [] };
  let current = files.find((f) => f.mime === 'application/pdf' || f.mime.startsWith('image/')) || files[0];
  const L = (k) => (k === 'ref_no' ? t.refLabel : state.config.fieldLabels[k]);
  mount(view, html`
    <div class="page-head">
      <div><div class="muted small"><a href="#/batch/${r.batch_id}">📁 ${r.folder_name}</a></div>
        <h1>${typeName(r.doc_type)} ${r.ref_no || ''}</h1>
        <div class="muted">${r.payee || ''}${r.amount != null ? ' · ' + money(r.amount) : ''}${r.doc_date ? ' · ' + dateStr(r.doc_date) : ''}</div></div>
      <div class="row">
        <button class="btn" onclick="history.back()">← Back</button>
        ${can('officer') ? html`<button class="btn" id="edit">✏️ Edit metadata</button><label class="btn">➕ Add files<input type="file" id="add-files" multiple hidden></label>` : ''}
        ${can('admin') ? html`<button class="btn danger" id="del">Delete record</button>` : ''}
      </div>
    </div>
    <div class="record-layout">
      <div>
        <div class="card" id="meta-card">
          <h2>Metadata</h2>
          <dl class="meta">
            <dt>Document type</dt><dd>${typeName(r.doc_type)}</dd>
            ${['ref_no', 'doc_date', 'payee', 'amount', 'particulars', 'ors_no', 'check_no', 'resp_center'].map((k) => html`<dt>${L(k)}</dt>
              <dd>${k === 'amount' ? money(r.amount) || '—' : k === 'doc_date' ? dateStr(r.doc_date) || '—' : r[k] || '—'}</dd>`)}
            <dt>Fund</dt><dd>${r.fund || '—'}</dd>
            <dt>Fiscal year</dt><dd>${r.fiscal_year || '—'}${r.month ? ' · ' + MONTHS[r.month - 1] : ''}</dd>
            <dt>Physical location</dt><dd>${[r.box_no && 'Box ' + r.box_no, r.location].filter(Boolean).join(' · ') || '—'}</dd>
            <dt>Uploaded</dt><dd>${when(r.created_at)}<br><span class="muted small">${r.uploader || ''}</span></dd>
            ${r.updated_at ? html`<dt>Last edited</dt><dd>${when(r.updated_at)}</dd>` : ''}
          </dl>
        </div>
        <div class="card"><h2>Files (${files.length})</h2>
          <div class="file-list">${files.map((f) => html`<button data-file="${f.id}"><span>${fileIcon(f.original_name)}</span><span class="fname" title="${f.relative_path}">${f.original_name}</span><span class="muted small">${bytes(f.size)}</span></button>`)}</div>
          ${files.length ? '' : html`<div class="empty">No files.</div>`}
        </div>
        <div class="card"><h2>History</h2><div class="timeline">${history.map((h) => html`<div><b>${h.username || 'system'}</b> ${ACTION_LABELS[h.action] || h.action}
          ${h.action === 'edit_record' && h.details ? html`<span class="muted">(${Object.keys(JSON.parse(h.details)).map((k) => L(k)).join(', ')})</span>` : ''}<br><span class="muted">${when(h.at)}</span></div>`)}</div></div>
      </div>
      <div class="card" style="padding:12px">
        <div class="row" style="margin-bottom:8px"><b id="viewer-name" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis"></b><span id="viewer-actions" class="row"></span></div>
        <div class="viewer" id="viewer"></div>
      </div>
    </div>`);

  const show = (f) => {
    current = f;
    $$('[data-file]').forEach((b) => b.classList.toggle('active', Number(b.dataset.file) === (f && f.id)));
    const viewer = $('#viewer');
    if (!f) { mount(viewer, html`<div class="empty">No file to preview.</div>`); return; }
    $('#viewer-name').textContent = f.relative_path;
    mount($('#viewer-actions'), html`<a class="btn small" href="/api/files/${f.id}" target="_blank">Open in new tab</a><a class="btn small" href="/api/files/${f.id}?download=1">⬇ Download</a>
      ${can('admin') ? html`<button class="btn small danger" id="del-file">Delete file</button>` : ''}`);
    $('#del-file')?.addEventListener('click', async () => {
      if (!confirm(`Permanently delete "${f.relative_path}"?`)) return;
      try { await api(`/files/${f.id}`, { method: 'DELETE' }); toast('File deleted.', 'ok'); recordPage(id); } catch (err) { toast(err.message, 'err'); }
    });
    if (f.mime === 'application/pdf' || f.mime === 'text/plain') mount(viewer, html`<iframe src="/api/files/${f.id}" title="${f.original_name}"></iframe>`);
    else if (f.mime.startsWith('image/') && f.mime !== 'image/tiff') mount(viewer, html`<img src="/api/files/${f.id}" alt="${f.original_name}">`);
    else mount(viewer, html`<div class="empty"><div style="font-size:40px">${fileIcon(f.original_name)}</div>No preview for this file type.<br><br><a class="btn primary" href="/api/files/${f.id}?download=1">⬇ Download</a></div>`);
  };
  $$('[data-file]').forEach((b) => b.addEventListener('click', () => show(files.find((f) => f.id === Number(b.dataset.file)))));
  show(current);

  $('#edit')?.addEventListener('click', () => {
    const fields = ['ref_no', 'doc_date', 'payee', 'amount', 'particulars', 'ors_no', 'check_no', 'resp_center'];
    mount($('#meta-card'), html`<h2>Edit metadata</h2>
      <form id="edit-form" class="form-grid" style="grid-template-columns:1fr">
        ${fields.map((k) => html`<label class="field">${L(k)}${t.required.includes(k) ? html` <span class="req">*</span>` : ''}
          ${k === 'particulars' ? html`<textarea name="${k}">${r[k] || ''}</textarea>`
            : html`<input name="${k}" value="${r[k] ?? ''}" ${k === 'doc_date' ? 'type=date' : k === 'amount' ? 'type=number step=0.01' : ''} ${t.required.includes(k) ? 'required' : ''}>`}</label>`)}
        <div class="row end"><button class="btn" type="button" id="cancel">Cancel</button><button class="btn primary">Save changes</button></div>
      </form>`);
    $('#cancel').addEventListener('click', () => recordPage(id));
    $('#edit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api(`/records/${id}`, { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('Saved.', 'ok'); recordPage(id); } catch (err) { toast(err.message, 'err'); }
    });
  });
  $('#add-files')?.addEventListener('change', async (e) => {
    const list = [...e.target.files];
    for (const [n, file] of list.entries()) {
      toast(`Uploading ${n + 1} of ${list.length}: ${file.name}`);
      const fd = new FormData();
      fd.append('relative_path', file.name);
      fd.append('file', file);
      try { await api(`/records/${id}/files`, { method: 'POST', body: fd }); } catch (err) { toast(`${file.name}: ${err.message}`, 'err'); }
    }
    toast('Files added.', 'ok');
    recordPage(id);
  });
  $('#del')?.addEventListener('click', async () => {
    const typed = prompt(`This permanently deletes the record and its ${files.length} file(s).\nType the reference number "${r.ref_no || 'DELETE'}" to confirm:`);
    if (typed === null) return;
    if (typed.trim() !== (r.ref_no || 'DELETE')) return toast('Reference number did not match. Nothing was deleted.', 'err');
    try { await api(`/records/${id}`, { method: 'DELETE' }); toast('Record deleted.', 'ok'); location.hash = `#/batch/${r.batch_id}`; } catch (err) { toast(err.message, 'err'); }
  });
}

// ---------- batches ----------
async function batchesPage() {
  const view = $('#view');
  const rows = await api('/batches');
  mount(view, html`
    <div class="page-head"><div><h1>Uploaded Folders</h1><div class="muted">Every folder uploaded to the archive.</div></div>
      <div class="row"><input id="filter" placeholder="Filter folders…" style="width:220px">${can('officer') ? html`<a class="btn primary" href="#/upload">⬆️ Upload Folder</a>` : ''}</div></div>
    <div id="blist">${batchTable(rows, false)}</div>`);
  bindRowLinks(view);
  $('#filter').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    $$('#blist tbody tr').forEach((tr) => { tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none'; });
  });
}

async function batchPage(id) {
  const view = $('#view');
  const [b, recs] = await Promise.all([api(`/batches/${id}`), api(`/records?batch=${id}&limit=200&sort=ref_no&dir=asc`)]);
  mount(view, html`
    <div class="page-head">
      <div><div class="muted small"><a href="#/batches">Uploaded Folders</a></div><h1>📁 ${b.folder_name}</h1>
        <div class="muted">${typeName(b.doc_type)} · FY ${b.fiscal_year || '—'}${b.month ? ' · ' + MONTHS[b.month - 1] : ''} ${statusBadge(b.status)}</div></div>
      <div class="row"><a class="btn" href="#/search?batch=${id}">🔎 Search in folder</a><a class="btn" href="/api/records?batch=${id}&format=csv">⬇ Export CSV</a></div>
    </div>
    ${b.status !== 'complete' ? html`<div class="alert warn">This upload is <b>${b.status}</b>: not every file was received. ${wiz && wiz.batchId === id ? html`<a href="#/upload">Return to the upload to retry →</a>` : 'Add the missing files from each record page.'}</div>` : ''}
    <div class="grid cols-2">
      <div class="card" id="bmeta"><h2>Folder details</h2><dl class="meta">
        <dt>Fund</dt><dd>${b.fund || '—'}</dd><dt>Box no.</dt><dd>${b.box_no || '—'}</dd><dt>Location</dt><dd>${b.location || '—'}</dd>
        <dt>Remarks</dt><dd>${b.remarks || '—'}</dd><dt>Uploaded by</dt><dd>${b.uploader || '—'}</dd><dt>Uploaded</dt><dd>${when(b.created_at)}</dd></dl>
        ${can('officer') ? html`<div class="row end" style="margin-top:10px"><button class="btn small" id="bedit">✏️ Edit location</button></div>` : ''}</div>
      <div class="card"><h2>Summary</h2><dl class="meta"><dt>Records</dt><dd>${recs.total}</dd><dt>Total amount</dt><dd>${money(recs.total_amount) || '—'}</dd></dl></div>
    </div>
    <div class="card"><h2>Records in this folder</h2>
      ${recs.rows.length ? html`<div class="table-wrap"><table><thead><tr><th>Reference No.</th><th>Date</th><th>Payee</th><th>Particulars</th><th class="num">Amount</th><th class="num">Files</th></tr></thead>
      <tbody>${recs.rows.map((r) => html`<tr class="clickable" data-href="#/record/${r.id}"><td><b>${r.ref_no || '—'}</b></td><td>${dateStr(r.doc_date)}</td><td>${r.payee || ''}</td>
        <td class="small">${(r.particulars || '').slice(0, 80)}</td><td class="num">${money(r.amount)}</td><td class="num">${r.file_count}</td></tr>`)}</tbody></table></div>
      ${recs.total > recs.rows.length ? html`<p class="muted">Showing ${recs.rows.length} of ${recs.total}. <a href="#/search?batch=${id}">See all →</a></p>` : ''}`
      : html`<div class="empty">No records.</div>`}</div>`);
  bindRowLinks(view);
  $('#bedit')?.addEventListener('click', () => {
    mount($('#bmeta'), html`<h2>Edit folder location</h2><form id="bform" class="form-grid" style="grid-template-columns:1fr">
      <label class="field">Box no.<input name="box_no" value="${b.box_no || ''}"></label>
      <label class="field">Location<input name="location" value="${b.location || ''}"></label>
      <label class="field">Remarks<textarea name="remarks">${b.remarks || ''}</textarea></label>
      <div class="row end"><button type="button" class="btn" id="bcancel">Cancel</button><button class="btn primary">Save</button></div></form>`);
    $('#bcancel').addEventListener('click', () => batchPage(id));
    $('#bform').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api(`/batches/${id}`, { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('Saved.', 'ok'); batchPage(id); } catch (err) { toast(err.message, 'err'); }
    });
  });
}

// ---------- audit ----------
async function auditPage() {
  const view = $('#view');
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const rows = await api(`/audit?limit=300`);
  mount(view, html`
    <div class="page-head"><div><h1>Audit Log</h1><div class="muted">Latest 300 actions: who uploaded, viewed, downloaded, edited or deleted what.</div></div>
      <input id="afilter" placeholder="Filter by user, action, file…" value="${params.get('q') || ''}" style="width:260px"></div>
    <div class="table-wrap"><table><thead><tr><th>When</th><th>User</th><th>Action</th><th>Item</th><th>Details</th></tr></thead>
    <tbody>${rows.map((a) => html`<tr><td class="small" style="white-space:nowrap">${when(a.at)}</td><td>${a.username || '—'}</td><td><span class="badge ${/delete|failed/.test(a.action) ? 'err' : ''}">${a.action.replace(/_/g, ' ')}</span></td>
      <td>${a.entity === 'record' && a.entity_id ? html`<a href="#/record/${a.entity_id}">record #${a.entity_id}</a>` : a.entity === 'batch' ? html`<a href="#/batch/${a.entity_id}">folder #${a.entity_id}</a>` : `${a.entity || ''} ${a.entity_id ?? ''}`}</td>
      <td class="mono" style="max-width:420px;word-break:break-all">${a.details || ''}</td></tr>`)}</tbody></table></div>`);
  const filter = () => { const q = $('#afilter').value.toLowerCase(); $$('tbody tr', view).forEach((tr) => { tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none'; }); };
  $('#afilter').addEventListener('input', filter);
  filter();
}

// ---------- users ----------
async function usersPage() {
  const view = $('#view');
  const users = await api('/users');
  mount(view, html`
    <div class="page-head"><div><h1>Users</h1><div class="muted">Give each person their own account. No shared logins.</div></div></div>
    <div class="grid cols-2">
      <div class="table-wrap" style="align-self:start"><table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>${users.map((u) => html`<tr><td>${u.full_name}</td><td class="mono">${u.username}</td>
          <td><select data-role="${u.id}" ${u.id === state.user.id ? 'disabled' : ''}>${Object.entries(ROLE_NAMES).map(([k, v]) => html`<option value="${k}" ${u.role === k ? 'selected' : ''}>${v}</option>`)}</select></td>
          <td>${u.active ? html`<span class="badge ok">Active</span>` : html`<span class="badge err">Disabled</span>`}</td>
          <td class="row">${u.id !== state.user.id ? html`<button class="btn small" data-toggle="${u.id}" data-active="${u.active}">${u.active ? 'Disable' : 'Enable'}</button>` : ''}
            <button class="btn small" data-reset="${u.id}" data-name="${u.username}">Reset password</button></td></tr>`)}</tbody></table></div>
      <div class="card"><h2>Add user</h2>
        <form id="uform" class="form-grid" style="grid-template-columns:1fr 1fr">
          <label class="field">Full name<input name="full_name" required></label>
          <label class="field">Username<input name="username" required pattern="[a-zA-Z0-9._-]{3,40}"></label>
          <label class="field">Role<select name="role">${Object.entries(ROLE_NAMES).map(([k, v]) => html`<option value="${k}" ${k === 'officer' ? 'selected' : ''}>${v}</option>`)}</select></label>
          <label class="field">Temporary password<input name="password" type="text" minlength="8" required></label>
          <p class="small muted wide" style="margin:0">The user must change this password on first login.<br><b>Records Officer</b>: upload and edit · <b>Viewer</b>: search and view only · <b>Admin</b>: everything</p>
          <div class="row end wide"><button class="btn primary">Add user</button></div>
        </form></div>
    </div>`);
  $('#uform').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/users', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('User added.', 'ok'); usersPage(); } catch (err) { toast(err.message, 'err'); }
  });
  $$('[data-role]').forEach((s) => s.addEventListener('change', async () => {
    try { await api(`/users/${s.dataset.role}`, { method: 'PUT', body: { role: s.value } }); toast('Role updated.', 'ok'); } catch (err) { toast(err.message, 'err'); usersPage(); }
  }));
  $$('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
    try { await api(`/users/${b.dataset.toggle}`, { method: 'PUT', body: { active: b.dataset.active !== '1' } }); usersPage(); } catch (err) { toast(err.message, 'err'); }
  }));
  $$('[data-reset]').forEach((b) => b.addEventListener('click', async () => {
    const pw = prompt(`New temporary password for ${b.dataset.name} (at least 8 characters):`);
    if (!pw) return;
    try { await api(`/users/${b.dataset.reset}`, { method: 'PUT', body: { password: pw } }); toast('Password reset. The user must change it at next login.', 'ok'); } catch (err) { toast(err.message, 'err'); }
  }));
}

// ---------- account ----------
function accountPage() {
  mount($('#view'), html`
    <div class="page-head"><div><h1>My Account</h1><div class="muted">${state.user.full_name} · ${ROLE_NAMES[state.user.role]}</div></div></div>
    <div class="card" style="max-width:420px"><h2>Change password</h2>
      <form id="pform" class="form-grid" style="grid-template-columns:1fr">
        <label class="field">Current password<input type="password" name="current" required autocomplete="current-password"></label>
        <label class="field">New password (min. 8 characters)<input type="password" name="next" minlength="8" required autocomplete="new-password"></label>
        <label class="field">Repeat new password<input type="password" name="next2" minlength="8" required autocomplete="new-password"></label>
        <div class="row end"><button class="btn primary">Change password</button></div>
      </form></div>`);
  $('#pform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (f.next !== f.next2) return toast('The new passwords do not match.', 'err');
    try {
      await api('/me/password', { method: 'POST', body: { current: f.current, next: f.next } });
      toast('Password changed.', 'ok');
      state.user.must_change_password = false;
      renderShell();
      location.hash = '#/dashboard';
      route();
    } catch (err) { toast(err.message, 'err'); }
  });
}

boot();
