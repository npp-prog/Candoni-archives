import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Select from '../components/Select.jsx';
import Icon from '../components/Icon.jsx';
import FilePreview from '../components/FilePreview.jsx';
import { createBatch, existingRefs, finishBatch, uploadFile } from '../lib/api.js';
import { DOC_TYPES, FIELDS, fieldLabel, fundsOf, typeOf } from '../lib/doctypes.js';
import { bytes } from '../lib/format.js';
import {
  MONTHS, SKIP_FILE, cellInvalid, detectMonth, detectYear, formatAmount, groupKey, normalizeDate, parseAmount, parseName, rowProblems,
} from '../lib/names.js';

const MAX_MB = 200;
const STEPS = ['Select folder', 'Folder details', 'Group files', 'Fill in details', 'Upload'];
const GRID = ['refNo', 'docDate', 'payee', 'amount', 'particulars', 'orsNo', 'checkNo'];
const WIDTH = { refNo: 160, docDate: 120, payee: 180, amount: 120, particulars: 240, orsNo: 130, checkNo: 120 };

// The wizard and the upload in progress outlive the page (the upload goes on while the Records
// Officer looks at another page, and is there when they come back).
const fresh = () => ({ step: 0, root: '', files: [], skipped: [], batch: {}, mode: 'deepest', rows: [], dups: [] });
let kept = fresh();
let job = null; // { batchId, recordFor: [], status: [], loaded: [], errors: [], dupOf: [], running, result }

export default function Upload() {
  const { settings, actor } = useAuth();
  const [w, setW] = useState(kept);
  const update = (patch) => setW((cur) => { kept = { ...cur, ...patch }; return kept; });
  const [, setTick] = useState(0);
  // Redraw while files are uploading.
  useEffect(() => {
    const t = setInterval(() => { if (job?.running) setTick((n) => n + 1); }, 300);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const warn = (e) => { if (job?.running) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const go = (step) => { update({ step }); window.scrollTo(0, 0); };
  const restart = () => { if (job?.running) return; job = null; kept = fresh(); setW(kept); };

  return (
    <div className="page">
      <div className="page-head"><div><h1>Upload Folder</h1></div>
        {w.step > 0 && !job?.running && <button className="btn" onClick={() => { if (job || window.confirm('Discard this upload and start over?')) restart(); }}>Start over</button>}</div>
      <ol className="stepper">
        {STEPS.map((s, i) => (
          <li key={s} className={i < w.step ? 'done' : i === w.step ? 'current' : ''}>
            <button type="button" disabled={i >= w.step || Boolean(job)} onClick={() => go(i)}>
              <span className="dot">{i < w.step ? '✓' : i + 1}</span>{s}
            </button>
          </li>
        ))}
      </ol>
      {w.step === 0 && <StepSelect onFiles={(list) => accept(list, update, go)} />}
      {w.step === 1 && <StepDetails w={w} update={update} go={go} funds={fundsOf(settings)} />}
      {w.step === 2 && <StepGroup w={w} update={update} go={go} />}
      {w.step === 3 && <StepGrid w={w} update={update} go={go} />}
      {w.step === 4 && <StepUpload w={w} go={go} actor={actor} restart={restart} redraw={() => setTick((n) => n + 1)} />}
    </div>
  );
}

// ---------- step 1: the folder ----------
function StepSelect({ onFiles }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const [reading, setReading] = useState(false);
  useEffect(() => { input.current?.setAttribute('webkitdirectory', ''); input.current?.setAttribute('directory', ''); }, []);
  const onDrop = async (e) => {
    e.preventDefault(); setOver(false);
    const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
    if (!entries.length) return;
    setReading(true);
    const list = [];
    for (const en of entries) await walk(en, '', list);
    setReading(false);
    onFiles(list);
  };
  return (
    <div className="card">
      <label className={`drop-zone big-drop${over ? ' over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)} onDrop={onDrop}>
        <span className="drop-icon"><Icon name="folder" /></span>
        <b>{reading ? 'Reading the folder…' : 'Drop a folder here, or click to choose one'}</b>
        <span className="small muted">Every file in it is uploaded, keeping its subfolders. Up to {MAX_MB} MB a file.</span>
        <input ref={input} type="file" multiple hidden onChange={(e) => onFiles([...e.target.files].map((f) => ({ file: f, path: f.webkitRelativePath || f.name })))} />
      </label>
      <p className="help">Name scanned files with the DV No., payee and amount, for example <span className="mono">100-2026-01-0001_Payee Name_12,500.00.pdf</span>,
        and the details are filled in for you. Hidden and system files (Thumbs.db, desktop.ini) are left out.</p>
    </div>
  );
}

async function walk(entry, prefix, out) {
  if (entry.isFile) out.push({ file: await new Promise((res, rej) => entry.file(res, rej)), path: prefix + entry.name });
  else if (entry.isDirectory) {
    const reader = entry.createReader();
    for (;;) {
      const chunk = await new Promise((res, rej) => reader.readEntries(res, rej));
      if (!chunk.length) break;
      for (const c of chunk) await walk(c, `${prefix}${entry.name}/`, out);
    }
  }
}

function accept(list, update, go) {
  if (!list.length) { window.alert('That folder is empty.'); return; }
  const firsts = new Set(list.map((x) => x.path.split('/')[0]));
  const hasRoot = firsts.size === 1 && list.every((x) => x.path.includes('/'));
  const root = hasRoot ? [...firsts][0] : 'Uploaded files';
  const files = [];
  const skipped = [];
  for (const x of list) {
    const rel = hasRoot ? x.path.split('/').slice(1).join('/') : x.path;
    if (rel.split('/').some((seg) => SKIP_FILE.test(seg))) skipped.push({ rel, reason: 'hidden or system file' });
    else if (x.file.size > MAX_MB * 1024 * 1024) skipped.push({ rel, reason: `larger than ${MAX_MB} MB` });
    else if (x.file.size === 0) skipped.push({ rel, reason: 'empty file' });
    else files.push({ file: x.file, rel, name: rel.split('/').pop(), size: x.file.size });
  }
  files.sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true }));
  if (!files.length) { window.alert('No files that can be uploaded were found in that folder.'); return; }
  const ref = (files.map((f) => parseName(f.name).refNo).find(Boolean) || '').split('-');
  const dvNo = ref.length === 4;
  update({
    root, files, skipped, rows: [], dups: [],
    mode: files.some((f) => f.rel.includes('/')) ? 'deepest' : 'file',
    batch: {
      folderName: root,
      docType: /payroll/i.test(root) ? 'PAYROLL' : /\bjev\b/i.test(root) ? 'JEV' : /\b(po|purchase order)\b/i.test(root) ? 'PO' : 'DV',
      fiscalYear: String(detectYear(root) || (dvNo ? Number(ref[1]) : '') || new Date().getFullYear()),
      month: String(detectMonth(root) || (dvNo ? Number(ref[2]) : '') || ''),
      fund: dvNo ? ({ 100: 'General Fund', 200: 'Special Education Fund', 300: 'Trust Fund' }[ref[0]] || '') : '',
      boxNo: '', location: '', remarks: '',
    },
  });
  go(1);
}

function Summary({ w }) {
  const total = w.files.reduce((s, f) => s + f.size, 0);
  const exts = {};
  w.files.forEach((f) => { const e = (f.name.split('.').pop() || '?').toUpperCase(); exts[e] = (exts[e] || 0) + 1; });
  return (
    <div className="card folder-summary">
      <span className="drop-icon"><Icon name="folder" /></span>
      <div className="grow"><b>{w.root}</b><div className="small muted">{w.files.length} files · {bytes(total)}</div></div>
      <div className="row gap wrap">
        {Object.entries(exts).map(([e, n]) => <span key={e} className="badge badge-gray">{e} × {n}</span>)}
        {w.skipped.length > 0 && <span className="badge badge-yellow" title={w.skipped.map((s) => `${s.rel}: ${s.reason}`).join('\n')}>{w.skipped.length} left out</span>}
      </div>
    </div>
  );
}

// ---------- step 2: details of the whole folder ----------
function Tree({ files }) {
  const tree = useMemo(() => {
    const t = {};
    files.forEach((f) => {
      let node = t;
      f.rel.split('/').slice(0, -1).forEach((p) => { node[p] = node[p] || {}; node = node[p]; });
      (node['\u0000files'] = node['\u0000files'] || []).push(f);
    });
    return t;
  }, [files]);
  const render = (node) => (
    <ul>
      {Object.keys(node).filter((k) => k !== '\u0000files').sort().map((k) => (
        <li key={k}><details open={Object.keys(node).length < 6}><summary><Icon name="folder" /> {k}</summary>{render(node[k])}</details></li>
      ))}
      {(node['\u0000files'] || []).map((f) => <li key={f.rel} className="tree-file"><Icon name="doc" /> {f.name} <span className="muted xs">{bytes(f.size)}</span></li>)}
    </ul>
  );
  return <div className="tree">{render(tree)}</div>;
}

function StepDetails({ w, update, go, funds }) {
  const b = w.batch;
  const set = (k) => (e) => update({ batch: { ...b, [k]: e.target.value } });
  const years = Array.from({ length: 40 }, (_, i) => String(new Date().getFullYear() + 1 - i));
  const ok = b.docType && b.fiscalYear && String(b.folderName || '').trim();
  return (
    <>
      <Summary w={w} />
      <div className="grid-2">
        <div className="card">
          <h3>Folder details</h3>
          <p className="help" style={{ marginTop: '-.5rem', marginBottom: '1rem' }}>These apply to every record in this folder.</p>
          <div className="fields">
            <div><label className="field-label" htmlFor="dt">Document type <span className="req">*</span></label>
              <Select id="dt" value={b.docType} onChange={set('docType')}>{DOC_TYPES.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</Select></div>
            <div><label className="field-label" htmlFor="fy">Fiscal year <span className="req">*</span></label>
              <Select id="fy" value={b.fiscalYear} onChange={set('fiscalYear')}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</Select></div>
            <div><label className="field-label" htmlFor="mo">Month</label>
              <Select id="mo" value={b.month} onChange={set('month')}><option value="">Whole year or mixed</option>{MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}</Select></div>
            <div><label className="field-label" htmlFor="fd">Fund</label>
              <Select id="fd" value={b.fund} onChange={set('fund')}><option value="">None</option>{funds.map((f) => <option key={f}>{f}</option>)}</Select></div>
            <div><label className="field-label" htmlFor="bx">Box no.</label><input id="bx" value={b.boxNo} onChange={set('boxNo')} /></div>
            <div><label className="field-label" htmlFor="lc">Shelf / location</label><input id="lc" value={b.location} onChange={set('location')} />
              <div className="help">Where the paper copies are kept.</div></div>
            <div className="field-wide"><label className="field-label" htmlFor="rm">Remarks</label><textarea id="rm" value={b.remarks} onChange={set('remarks')} /></div>
            <div className="field-wide"><label className="field-label" htmlFor="fn">Folder name <span className="req">*</span></label><input id="fn" value={b.folderName} onChange={set('folderName')} /></div>
          </div>
        </div>
        <div className="card">
          <h3>Folder contents</h3>
          <Tree files={w.files} />
          {w.skipped.length > 0 && (
            <details className="small" style={{ marginTop: '.8rem' }}><summary className="muted">{w.skipped.length} file(s) left out</summary>
              <ul>{w.skipped.map((s) => <li key={s.rel}>{s.rel}: <span className="muted">{s.reason}</span></li>)}</ul></details>
          )}
        </div>
      </div>
      <div className="row wizard-nav">
        <button className="btn" onClick={() => { if (window.confirm('Choose a different folder?')) { kept = fresh(); update(fresh()); } }}>Back</button>
        <button className="btn btn-primary" disabled={!ok} onClick={() => go(2)}>Next: Group files</button>
      </div>
    </>
  );
}

// ---------- step 3: files into records ----------
function buildRows(w, mode) {
  const groups = new Map();
  w.files.forEach((f) => { const k = groupKey(f.rel, mode, w.root); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); });
  const prev = new Map(w.rows.map((r) => [r.key, r]));
  return [...groups.entries()].map(([key, files]) => {
    if (prev.has(key)) return { ...prev.get(key), files };
    const row = { key, files, auto: {} };
    FIELDS.forEach((k) => { row[k] = ''; });
    for (const src of [key.split('/').pop(), ...files.map((f) => f.name)]) {
      for (const [k, v] of Object.entries(parseName(src))) if (!row[k] && v) { row[k] = v; row.auto[k] = true; }
    }
    return row;
  });
}

const MODES = [
  ['deepest', 'Each subfolder is one record', 'The files in one folder (the DV, OBR, receipts…) stay together.'],
  ['top', 'Each top-level subfolder is one record', 'Everything inside a first-level subfolder, nested folders included.'],
  ['file', 'Each file is one record', 'Best when each DV is scanned as one PDF.'],
  ['whole', 'The whole folder is one record', 'The entire folder is one document.'],
];

function StepGroup({ w, update, go }) {
  const rows = useMemo(() => buildRows(w, w.mode), [w.files, w.mode]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <Summary w={w} />
      <div className="card">
        <h3>How should the files become records?</h3>
        <p className="help" style={{ marginTop: '-.5rem', marginBottom: '1rem' }}>A record is one document or transaction, such as one DV with its attachments. Each record gets its own details.</p>
        <div className="choice-grid">
          {MODES.map(([v, title, desc]) => (
            <label key={v} className={`choice${w.mode === v ? ' on' : ''}`}>
              <input type="radio" name="mode" checked={w.mode === v} onChange={() => update({ mode: v })} />
              <span><b>{title}</b><span className="small muted">{desc}</span></span>
            </label>
          ))}
        </div>
        <p style={{ margin: '1.2rem 0 .6rem' }}><b>{rows.length}</b> record{rows.length === 1 ? '' : 's'} from <b>{w.files.length}</b> files.</p>
        <div className="card table-card inner">
          <table className="data-table">
            <thead><tr><th>#</th><th>Record</th><th>Files</th></tr></thead>
            <tbody>
              {rows.slice(0, 8).map((r, i) => <tr key={r.key}><td className="muted">{i + 1}</td><td>{r.key}</td><td className="small">{r.files.map((f) => f.name).join(', ')}</td></tr>)}
              {rows.length > 8 && <tr><td /><td colSpan={2} className="muted">and {rows.length - 8} more</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className="row wizard-nav">
        <button className="btn" onClick={() => go(1)}>Back</button>
        <button className="btn btn-primary" onClick={() => { update({ rows }); go(3); }}>Next: Fill in details</button>
      </div>
    </>
  );
}

// ---------- step 4: the details of each record ----------
function StepGrid({ w, update, go }) {
  const t = typeOf(w.batch.docType);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [peek, setPeek] = useState(null); // { row, file }: the pop-up showing a record's files
  const rows = w.rows;
  const setRows = (list) => update({ rows: list });
  const issues = rows.map((r, i) => ({ i, bad: rowProblems(w.batch.docType, r) })).filter((x) => x.bad.length);
  const autoCount = rows.reduce((s, r) => s + Object.keys(r.auto).length, 0);
  const refCounts = {};
  rows.forEach((r) => { const k = String(r.refNo).trim().toLowerCase(); if (k) refCounts[k] = (refCounts[k] || 0) + 1; });

  const setCell = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v, auto: { ...r.auto, [k]: false } } : r)));
  const tidy = (i, k) => {
    const v = rows[i][k];
    if (k === 'docDate' && normalizeDate(v) && normalizeDate(v) !== v) setCell(i, k, normalizeDate(v));
    if (k === 'amount' && parseAmount(v) !== null && formatAmount(parseAmount(v)) !== v) setCell(i, k, formatAmount(parseAmount(v)));
  };
  const fillDown = (k) => {
    let last = '';
    setRows(rows.map((r) => { if (String(r[k]).trim()) { last = r[k]; return r; } return last ? { ...r, [k]: last, auto: { ...r.auto, [k]: false } } : r; }));
  };
  const onPaste = (e, i, k) => {
    const text = e.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(text.trim())) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
    const c0 = GRID.indexOf(k);
    const next = rows.map((r) => ({ ...r, auto: { ...r.auto } }));
    lines.forEach((cells, dr) => cells.forEach((v, dc) => {
      const row = next[i + dr]; const key = GRID[c0 + dc];
      if (row && key) { row[key] = v.trim(); row.auto[key] = false; }
    }));
    setRows(next);
  };
  const onKey = (e, i, k) => {
    if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const el = document.getElementById(`c-${i + (e.key === 'ArrowUp' ? -1 : 1)}-${k}`);
    if (el) { e.preventDefault(); el.focus(); el.select(); }
  };
  const next = async () => {
    if (issues.length) { document.getElementById(`c-${issues[0].i}-${issues[0].bad[0]}`)?.focus(); return; }
    setChecking(true); setError('');
    try { update({ dups: await existingRefs(w.batch.docType, rows.map((r) => r.refNo)) }); go(4); } catch (e) { setError(e.message); } finally { setChecking(false); }
  };
  const dupSet = new Set(w.dups.map((d) => d.refKey));

  return (
    <>
      <Summary w={w} />
      <div className="card">
        <div className="card-head"><h3>Details: {t.name}</h3><span className="small muted">Required: {t.required.map((k) => fieldLabel(t.code, k)).join(', ')}</span></div>
        <div className="alert alert-info small">
          {autoCount > 0 && <><b>{autoCount}</b> value{autoCount === 1 ? ' was' : 's were'} read from the file and folder names and {autoCount === 1 ? 'is' : 'are'} shown in <span className="auto-sample">blue italics</span>: please check them. </>}
          Click a record's name to see its file while you type. Click a cell to type; Enter moves down. <b>⇩</b> fills the empty cells below with the value above. You can paste rows copied from Excel. Dates: YYYY-MM-DD or MM/DD/YYYY.
        </div>
        {issues.length ? <div className="alert small">{issues.length} record{issues.length === 1 ? '' : 's'} still need{issues.length === 1 ? 's' : ''} a required or valid value (in red).</div>
          : <div className="alert alert-ok small">All {rows.length} records have their required details.</div>}
        <div className="meta-grid">
          <table>
            <thead><tr><th>#</th><th>Record</th>{GRID.map((k) => (
              <th key={k} style={{ minWidth: WIDTH[k] }}>{fieldLabel(t.code, k)}{t.required.includes(k) && <span className="req"> *</span>}
                <button type="button" className="fill-down" title="Fill the empty cells below" onClick={() => fillDown(k)}>⇩</button></th>
            ))}</tr></thead>
            <tbody>{rows.map((r, i) => {
              const rk = String(r.refNo).trim().toLowerCase();
              const dup = rk && (dupSet.has(rk) || refCounts[rk] > 1);
              return (
                <tr key={r.key} className={dup ? 'dup' : ''} title={dup ? 'This reference no. is already in the archive or repeated in this folder' : undefined}>
                  <td className="idx">{i + 1}</td>
                  <td className="group">
                    <button type="button" className="peek-open" title="See the file" onClick={() => setPeek({ row: i, file: 0 })}>
                      <Icon name="eye" /><b>{r.key.split('/').pop()}</b></button>
                    <span className="files-mini">{r.files.length} file{r.files.length === 1 ? '' : 's'}:{' '}
                      {r.files.map((f, j) => (
                        <span key={f.rel}>{j ? ', ' : ''}<button type="button" className="link file-link" title={f.rel} onClick={() => setPeek({ row: i, file: j })}>{f.name}</button></span>
                      ))}</span>
                  </td>
                  {GRID.map((k) => (
                    <td key={k}><input id={`c-${i}-${k}`} value={r[k]} aria-label={`${fieldLabel(t.code, k)}, row ${i + 1}`}
                      className={`${r.auto[k] ? 'auto' : ''} ${cellInvalid(t.code, r, k) ? 'missing' : ''}`}
                      onChange={(e) => setCell(i, k, e.target.value)} onBlur={() => tidy(i, k)}
                      onPaste={(e) => onPaste(e, i, k)} onKeyDown={(e) => onKey(e, i, k)} /></td>
                  ))}
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        {error && <div className="alert" style={{ marginTop: '1rem' }}>{error}</div>}
      </div>
      {peek && <FilePeek rows={rows} docType={t.code} peek={peek} setPeek={setPeek} setCell={setCell} tidy={tidy} />}
      <div className="row wizard-nav">
        <button className="btn" onClick={() => go(2)}>Back</button>
        <button className="btn btn-primary" disabled={checking} onClick={next}>{checking ? 'Checking…' : 'Next: Review and upload'}</button>
      </div>
    </>
  );
}

// The files of one record in a pop-up, beside its details: read the scanned DV and type what it
// says. Previous / Next go through the records; Escape closes.
function FilePeek({ rows, docType, peek, setPeek, setCell, tidy }) {
  const r = rows[peek.row];
  const f = r.files[peek.file] || r.files[0];
  const go = (row) => setPeek({ row, file: 0 });
  const close = () => setPeek(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const problems = rowProblems(docType, r);
  return (
    <div className="peek-backdrop" role="presentation" onClick={close}>
      <div className="peek" role="dialog" aria-modal="true" aria-label={`Record ${peek.row + 1}: ${r.key}`} onClick={(e) => e.stopPropagation()}>
        <div className="peek-head">
          <div className="grow"><b className="clip-line">{r.key.split('/').pop()}</b>
            <span className="small muted">Record {peek.row + 1} of {rows.length}</span></div>
          <button type="button" className="btn btn-sm" disabled={peek.row === 0} onClick={() => go(peek.row - 1)}>Previous</button>
          <button type="button" className="btn btn-sm" disabled={peek.row === rows.length - 1} onClick={() => go(peek.row + 1)}>Next</button>
          <button type="button" className="btn-icon peek-close" aria-label="Close" onClick={close}>×</button>
        </div>
        <div className="peek-body">
          <div className="peek-file">
            {r.files.length > 1 && (
              <div className="tabs peek-tabs">
                {r.files.map((x, j) => <button key={x.rel} type="button" className={x === f ? 'active' : ''} onClick={() => setPeek({ ...peek, file: j })}>{x.name}</button>)}
              </div>
            )}
            <div className="peek-viewer"><FilePreview key={f.rel} file={{ name: f.name, type: f.file.type }} local={f.file} /></div>
          </div>
          <div className="peek-fields">
            {GRID.map((k) => (
              <div key={k} className={`field${cellInvalid(docType, r, k) ? ' invalid' : ''}`}>
                <label className="field-label" htmlFor={`p-${k}`}>{fieldLabel(docType, k)}{typeOf(docType).required.includes(k) && <span className="req"> *</span>}</label>
                {k === 'particulars'
                  ? <textarea id={`p-${k}`} value={r[k]} onChange={(e) => setCell(peek.row, k, e.target.value)} />
                  : <input id={`p-${k}`} value={r[k]} className={r.auto[k] ? 'auto-input' : ''} onChange={(e) => setCell(peek.row, k, e.target.value)} onBlur={() => tidy(peek.row, k)} />}
              </div>
            ))}
            {problems.length > 0
              ? <p className="help warn-text">Still needed: {problems.map((k) => fieldLabel(docType, k)).join(', ')}.</p>
              : <p className="help">This record has its required details.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- step 5: review and upload ----------
function StepUpload({ w, go, actor, restart, redraw }) {
  const t = typeOf(w.batch.docType);
  const totalBytes = w.files.reduce((s, f) => s + f.size, 0);
  const repeated = Object.entries(w.rows.reduce((m, r) => { const k = String(r.refNo).trim(); if (k) m[k] = (m[k] || 0) + 1; return m; }, {})).filter(([, n]) => n > 1);
  const [error, setError] = useState('');

  const run = async (indexes) => {
    job.running = true;
    indexes.forEach((i) => { job.status[i] = 'waiting'; job.errors[i] = ''; job.loaded[i] = 0; });
    redraw();
    const queue = [...indexes];
    const worker = async () => {
      while (queue.length) {
        const i = queue.shift();
        const f = w.files[i];
        job.status[i] = 'sending';
        try {
          const r = await uploadFile({ batchId: job.batchId, recordId: job.recordFor[i], refNo: job.refFor[i], file: f.file, rel: f.rel }, (n) => { job.loaded[i] = n; });
          job.status[i] = 'done'; job.dupOf[i] = r.duplicateOf;
        } catch (e) {
          job.status[i] = 'failed'; job.errors[i] = e.code === 'storage/unauthorized' ? 'Not allowed (check storage.rules)' : e.message;
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    try { job.result = await finishBatch(job.batchId); } catch (e) { setError(e.message); }
    job.running = false;
    redraw();
  };

  const start = async () => {
    setError('');
    job = { batchId: null, recordFor: [], refFor: [], status: w.files.map(() => 'waiting'), loaded: [], errors: [], dupOf: [], running: true, result: null };
    redraw();
    try {
      const { batchId, ids } = await createBatch(w.batch, w.rows, w.files.length, actor);
      job.batchId = batchId;
      const refs = Object.fromEntries(w.rows.map((r) => [r.key, r.refNo]));
      job.recordFor = w.files.map((f) => ids[groupKey(f.rel, w.mode, w.root)]);
      job.refFor = w.files.map((f) => refs[groupKey(f.rel, w.mode, w.root)]);
    } catch (e) {
      job = null;
      setError(e.code === 'permission-denied' ? 'Not allowed. Is your role Records Officer or Admin, and are the latest firestore.rules published?' : e.message);
      redraw();
      return;
    }
    await run(w.files.map((_, i) => i));
  };

  const sent = job ? w.files.reduce((s, f, i) => s + (job.status[i] === 'done' ? f.size : job.status[i] === 'sending' ? job.loaded[i] || 0 : 0), 0) : 0;
  const done = job ? job.status.filter((x) => x === 'done').length : 0;
  const failed = job ? job.status.map((x, i) => (x === 'failed' ? i : -1)).filter((i) => i >= 0) : [];
  const dupFiles = job ? job.dupOf.filter(Boolean).length : 0;
  const finished = job && !job.running && job.batchId;
  const LABEL = { waiting: ['badge-gray', 'Waiting'], sending: ['badge-yellow', 'Uploading'], done: ['badge-green', 'Done'], failed: ['badge-red', 'Failed'] };

  return (
    <>
      <div className="grid-2">
        <div className="card">
          <h3>Review</h3>
          <dl className="details">
            <dt>Folder</dt><dd>{w.batch.folderName}</dd>
            <dt>Document type</dt><dd>{t.name}</dd>
            <dt>Fiscal year</dt><dd>{w.batch.fiscalYear}{w.batch.month ? ` · ${MONTHS[w.batch.month - 1]}` : ''}</dd>
            <dt>Fund</dt><dd>{w.batch.fund || '—'}</dd>
            <dt>Filed at</dt><dd>{[w.batch.boxNo && `Box ${w.batch.boxNo}`, w.batch.location].filter(Boolean).join(' · ') || '—'}</dd>
            <dt>Records</dt><dd>{w.rows.length}</dd>
            <dt>Files</dt><dd>{w.files.length} ({bytes(totalBytes)})</dd>
          </dl>
        </div>
        <div>
          {w.dups.length > 0 && (
            <div className="alert alert-warn"><b>{w.dups.length} reference no{w.dups.length === 1 ? '. is' : 's. are'} already in the archive:</b>{' '}
              {w.dups.slice(0, 10).map((d, i) => <span key={d.id}>{i ? ', ' : ''}<Link to={`/records/${d.id}`} target="_blank">{d.refNo}</Link></span>)}{w.dups.length > 10 && ' …'}.
              You may still upload (for example additional attachments), or go back and correct them.</div>
          )}
          {repeated.length > 0 && <div className="alert alert-warn">Repeated in this folder: {repeated.map(([k, n]) => `${k} (×${n})`).join(', ')}.</div>}
          {!job && (
            <div className="card">
              <p>Everything is ready. The files are uploaded three at a time; keep this window open until it finishes.</p>
              {error && <div className="alert">{error}</div>}
              <div className="row gap"><button className="btn" onClick={() => go(3)}>Back</button>
                <button className="btn btn-primary" onClick={start}><Icon name="upload" />Upload {w.files.length} files</button></div>
            </div>
          )}
        </div>
      </div>
      {job && (
        <div className="card">
          <div className="card-head">
            <h3>{finished ? (failed.length ? 'Upload finished with problems' : 'Upload complete') : 'Uploading…'}</h3>
            <div className="row gap wrap">
              {finished && failed.length > 0 && <button className="btn" onClick={() => run(failed)}>Retry {failed.length} failed</button>}
              {finished && <Link className="btn btn-primary" to={`/folders/${job.batchId}`}>Open the folder</Link>}
              {finished && <button className="btn" onClick={restart}>Upload another folder</button>}
            </div>
          </div>
          <div className="row gap small"><b>{done} of {w.files.length} files</b><span className="muted">{bytes(sent)} of {bytes(totalBytes)}</span></div>
          <div className="progress big"><div style={{ width: `${totalBytes ? (sent / totalBytes) * 100 : 0}%` }} /></div>
          {finished && (failed.length
            ? <div className="alert">{failed.length} file{failed.length === 1 ? '' : 's'} could not be uploaded. Click <b>Retry</b>. The folder shows as <b>Incomplete</b> until every file is in.</div>
            : <div className="alert alert-ok">{w.rows.length} records and {w.files.length} files were archived.</div>)}
          {dupFiles > 0 && <div className="alert alert-warn">{dupFiles} file{dupFiles === 1 ? ' is' : 's are'} identical to a file already in the archive (same SHA-256 checksum).</div>}
          {error && <div className="alert">{error}</div>}
          <ul className="upload-list">
            {w.files.map((f, i) => (
              <li key={f.rel}><Icon name="doc" /><span className="file-name" title={f.rel}>{f.rel}</span>
                {job.errors[i] && <span className="xs warn-text">{job.errors[i]}</span>}
                {job.dupOf[i] && <Link className="badge badge-yellow" to={`/records/${job.dupOf[i].recordId}`} target="_blank">same as {job.dupOf[i].refNo || job.dupOf[i].name}</Link>}
                <span className="muted xs">{bytes(f.size)}</span>
                <span className={`badge ${LABEL[job.status[i]][0]}`}>{LABEL[job.status[i]][1]}</span></li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
