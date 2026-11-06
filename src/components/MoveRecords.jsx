import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from './Icon.jsx';
import Select from './Select.jsx';
import { createFolder, listBatches, moveRecords } from '../lib/api.js';
import { fundsOf, typeChoices, typeName } from '../lib/doctypes.js';
import { MONTHS } from '../lib/names.js';

const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

// The other folders, newest first (the folder records would leave is not one of them).
function useFolders(exceptId) {
  const [list, setList] = useState(null);
  useEffect(() => { listBatches().then((l) => setList(l.filter((b) => b.id !== exceptId))).catch(() => setList([])); }, [exceptId]);
  return list;
}

// Move records to another folder, or to a new folder made for them. mode: 'move' | 'new'.
// onDone(folder) after moving.
export function MoveDialog({ records, from, mode: startMode = 'move', onDone, onClose }) {
  const { actor, settings } = useAuth();
  const folders = useFolders(from.id);
  const [mode, setMode] = useState(startMode);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [existing, setExisting] = useState(null); // the folder a new one would duplicate
  const [nf, setNf] = useState({
    folderName: '', docType: from.docType, fiscalYear: String(from.fiscalYear || ''), month: String(from.month || ''),
    fund: from.fund || '', boxNo: from.boxNo || '', location: from.location || '', remarks: '',
  });
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [busy, onClose]);

  const shown = useMemo(() => (folders || []).filter((b) => `${b.folderName} ${b.docType} ${b.fiscalYear} ${b.fund} ${b.byName}`
    .toLowerCase().includes(q.toLowerCase())), [folders, q]);

  const moveTo = async (to) => {
    setBusy(true); setError('');
    try { await moveRecords(records, from, to, actor); onDone(to); } catch (e) {
      setError(e.code === 'permission-denied' ? 'Not allowed: only the person who uploaded this folder, or an administrator, may move its records.' : e.message);
      setBusy(false);
    }
  };
  const makeAndMove = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setExisting(null);
    try {
      const to = await createFolder(nf, actor);
      await moveRecords(records, from, to, actor);
      onDone(to);
    } catch (err) {
      if (err.code === 'folder-exists') { setExisting(err.folder); setError(err.message); } else setError(err.code === 'permission-denied' ? 'Not allowed.' : err.message);
      setBusy(false);
    }
  };
  const set = (k) => (e) => setNf({ ...nf, [k]: e.target.value });
  const years = Array.from({ length: 40 }, (_, i) => String(new Date().getFullYear() + 1 - i));
  const funds = [...new Set([...fundsOf(settings), ...(nf.fund ? [nf.fund] : [])])];

  return (
    <div className="peek-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <div className="move-dialog" role="dialog" aria-modal="true" aria-label="Move to another folder" onClick={(e) => e.stopPropagation()}>
        <div className="peek-head">
          <div className="grow"><b>Move {plural(records.length, 'record')}</b>
            <span className="small muted clip-line">{records.map((r) => r.refNo || r.groupKey).join(', ')}</span></div>
          <button type="button" className="btn-icon peek-close" aria-label="Close" disabled={busy} onClick={onClose}>×</button>
        </div>
        <div className="move-body">
          <div className="tabs">
            <button type="button" className={mode === 'move' ? 'active' : ''} onClick={() => setMode('move')}>To a folder</button>
            <button type="button" className={mode === 'new' ? 'active' : ''} onClick={() => setMode('new')}>To a new folder</button>
          </div>
          {mode === 'move' ? (
            <>
              <input type="search" placeholder="Search…" aria-label="Find a folder" value={q} onChange={(e) => setQ(e.target.value)} />
              {!folders && <div className="spinner" />}
              {folders && (shown.length ? (
                <ul className="move-list">
                  {shown.map((b) => (
                    <li key={b.id}><button type="button" disabled={busy} onClick={() => moveTo(b)}>
                      <Icon name="folder" /><span className="grow"><b>{b.folderName}</b>
                        <span className="small muted">{typeName(b.docType)}{b.fund ? ` · ${b.fund}` : ''}{b.fiscalYear ? ` · FY ${b.fiscalYear}` : ''} · {plural(b.recordCount || 0, 'record')}</span></span>
                      <span className="small move-here">Move here</span>
                    </button></li>
                  ))}
                </ul>
              ) : <div className="empty">No other folder matches.</div>)}
            </>
          ) : (
            <form onSubmit={makeAndMove}>
              <div className="fields">
                <div className="field-wide"><label className="field-label" htmlFor="nf-name">Folder name <span className="req">*</span></label>
                  <input id="nf-name" required value={nf.folderName} onChange={set('folderName')} /></div>
                <div><label className="field-label" htmlFor="nf-type">Main document type <span className="req">*</span></label>
                  <Select id="nf-type" value={nf.docType} onChange={set('docType')}>{typeChoices(nf.docType).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</Select></div>
                <div><label className="field-label" htmlFor="nf-year">Fiscal year</label>
                  <Select id="nf-year" value={nf.fiscalYear} onChange={set('fiscalYear')}><option value="">None</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</Select></div>
                <div><label className="field-label" htmlFor="nf-month">Month</label>
                  <Select id="nf-month" value={nf.month} onChange={set('month')}><option value="">Whole year or mixed</option>{MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}</Select></div>
                <div><label className="field-label" htmlFor="nf-fund">Fund</label>
                  <Select id="nf-fund" value={nf.fund} onChange={set('fund')}><option value="">None</option>{funds.map((f) => <option key={f}>{f}</option>)}</Select></div>
                <div><label className="field-label" htmlFor="nf-box">Box no.</label><input id="nf-box" value={nf.boxNo} onChange={set('boxNo')} /></div>
                <div><label className="field-label" htmlFor="nf-loc">Shelf / location</label><input id="nf-loc" value={nf.location} onChange={set('location')} /></div>
              </div>
              <p className="help">The details start as this folder's; change what differs. No two folders may have the same name, main type and fund.</p>
              <button className="btn btn-primary" disabled={busy || !nf.folderName.trim()}>{busy ? 'Moving…' : `Create the folder and move ${plural(records.length, 'record')}`}</button>
            </form>
          )}
          {error && <div className="alert" role="alert">{error}
            {existing && <div style={{ marginTop: '.5rem' }}><button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => moveTo(existing)}>Move into {existing.folderName} instead</button></div>}
          </div>}
          {busy && <div className="alert alert-info">Moving…</div>}
        </div>
      </div>
    </div>
  );
}

// While records are dragged: folders to drop them on, and New folder. onDrop(folder) or onDrop('new').
export function DropPanel({ count, from, onDrop }) {
  const folders = useFolders(from.id);
  const [over, setOver] = useState('');
  const zone = (key, onIt) => ({
    onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(key); },
    onDragLeave: () => setOver((o) => (o === key ? '' : o)),
    onDrop: (e) => { e.preventDefault(); setOver(''); onIt(); },
  });
  return (
    <aside className="drop-panel" aria-label="Drop on a folder">
      <b>Move {plural(count, 'record')}: drop on a folder</b>
      <div className={`drop-target new${over === 'new' ? ' over' : ''}`} {...zone('new', () => onDrop('new'))}><Icon name="plus" />New folder</div>
      {!folders && <div className="spinner" />}
      {(folders || []).slice(0, 12).map((b) => (
        <div key={b.id} className={`drop-target${over === b.id ? ' over' : ''}`} {...zone(b.id, () => onDrop(b))}>
          <Icon name="folder" /><span className="grow"><b>{b.folderName}</b><span className="xs muted">{b.docType}{b.fund ? ` · ${b.fund}` : ''}{b.fiscalYear ? ` · FY ${b.fiscalYear}` : ''}</span></span>
        </div>
      ))}
      {folders && folders.length > 12 && <span className="xs muted">More folders: let go, then use Move to folder.</span>}
    </aside>
  );
}
