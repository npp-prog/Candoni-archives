import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from '../components/Icon.jsx';
import RecordPeek from '../components/RecordPeek.jsx';
import { DropPanel, MoveDialog } from '../components/MoveRecords.jsx';
import { audit, deleteFolder, ensureFolderLocks, fileBytes, getBatch, listBatches, moveRecords, recordsOfBatch, saveBlob, updateFolder } from '../lib/api.js';
import { fundsOf, typeChoices, typeName } from '../lib/doctypes.js';
import Select from '../components/Select.jsx';
import { bytes, day, money, when } from '../lib/format.js';
import { MONTHS, safeName, toCsv } from '../lib/names.js';

export function StatusBadge({ status }) {
  if (status === 'complete') return <span className="badge badge-green">Complete</span>;
  if (status === 'incomplete') return <span className="badge badge-red">Incomplete</span>;
  return <span className="badge badge-yellow">Uploading</span>;
}

// Every uploaded folder.
export default function Folders() {
  const { canUpload } = useAuth();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    listBatches().then((l) => {
      setList(l);
      // folders uploaded before folder locks existed get theirs (rules: one folder per name, type and fund)
      if (canUpload) ensureFolderLocks(l).catch(() => {});
    }).catch((e) => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => (list || []).filter((b) => `${b.folderName} ${b.docType} ${b.fiscalYear} ${b.fund} ${b.boxNo} ${b.location} ${b.byName}`
    .toLowerCase().includes(q.toLowerCase())), [list, q]);
  return (
    <div className="page">
      <div className="page-head"><div><h1>Uploaded Folders</h1></div>
        {canUpload && <Link className="btn btn-primary" to="/upload"><Icon name="upload" />Upload folder</Link>}</div>
      <div className="filters"><input type="search" className="search" placeholder="Search…" aria-label="Filter folders" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {error && <div className="alert">{error}</div>}
      {!list && !error && <div className="spinner" />}
      {list && (shown.length ? (
        <div className="card table-card">
          <table className="data-table">
            <thead><tr><th>Folder</th><th>Main type</th><th>FY</th><th>Fund</th><th>Filed at</th><th className="right">Records</th><th className="right">Files</th><th className="right">Size</th><th>Status</th><th>Uploaded</th></tr></thead>
            <tbody>{shown.map((b) => (
              <tr key={b.id}>
                <td><Link to={`/folders/${b.id}`}>{b.folderName}</Link></td><td>{b.docType}</td><td>{b.fiscalYear || ''}</td><td className="small">{b.fund}</td>
                <td className="small">{[b.boxNo && `Box ${b.boxNo}`, b.location].filter(Boolean).join(' · ')}</td>
                <td className="right">{b.recordCount}</td><td className="right">{b.fileCount}</td><td className="right nowrap">{bytes(b.totalBytes)}</td>
                <td><StatusBadge status={b.status} /></td><td className="small">{when(b.createdAt)}<div className="muted">{b.byName}</div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <div className="card empty">{list.length ? 'No folder matches.' : 'No folders uploaded yet.'}</div>)}
    </div>
  );
}

// One uploaded folder: its details, where the paper is filed, and its records.
export function FolderView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, canUpload, isAdmin, actor, settings } = useAuth();
  const [b, setB] = useState(null);
  const [recs, setRecs] = useState(null);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState(null);
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);
  const [zip, setZip] = useState('');
  const [zipping, setZipping] = useState(false);
  const [peek, setPeek] = useState(null); // index of the record previewed
  const [picked, setPicked] = useState(() => new Set()); // records chosen to move
  const [dragging, setDragging] = useState(null); // ids of the records being dragged
  const [moving, setMoving] = useState(null); // { ids, mode } : the Move dialog
  const [moved, setMoved] = useState(null); // { n, to } : after moving
  const load = () => Promise.all([getBatch(id), recordsOfBatch(id)]).then(([bb, rr]) => { setB(bb); setRecs(rr); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="alert">{error}</div>;
  if (!b || !recs) return b === null && recs ? <div className="card empty">This folder no longer exists.</div> : <div className="spinner" />;

  // Edit folder: the person who uploaded it, or an administrator (firestore.rules)
  const canEdit = canUpload && (b.by === user.uid || isAdmin);
  // moving records out: the same people as Edit folder (firestore.rules)
  const canMove = canEdit;
  const pick = (id) => setPicked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allPicked = recs.length > 0 && recs.every((r) => picked.has(r.id));
  const recsOf = (ids) => recs.filter((r) => ids.includes(r.id));
  const afterMove = async (to, n) => { setMoving(null); setDragging(null); setPicked(new Set()); await load(); setMoved({ n, to }); };
  const dropOn = async (target) => {
    const ids = dragging;
    setDragging(null);
    if (!ids?.length) return;
    if (target === 'new') { setMoving({ ids, mode: 'new' }); return; }
    if (!window.confirm(`Move ${ids.length} record${ids.length === 1 ? '' : 's'} to ${target.folderName}?`)) return;
    try { await moveRecords(recsOf(ids), b, target, actor); await afterMove(target, ids.length); } catch (e) {
      setMoved({ error: e.code === 'permission-denied' ? 'Not allowed to move these records.' : e.message });
    }
  };
  const removeEmpty = async () => {
    if (!window.confirm(`Delete the empty folder ${b.folderName}?`)) return;
    try { await deleteFolder(b, actor); navigate('/folders'); } catch (e) { setMoved({ error: e.message }); }
  };
  const startEdit = () => {
    setEditError('');
    setEdit({
      folderName: b.folderName || '', docType: b.docType, fiscalYear: String(b.fiscalYear || ''), month: String(b.month || ''),
      fund: b.fund || '', boxNo: b.boxNo || '', location: b.location || '', remarks: b.remarks || '',
    });
  };
  const save = async () => {
    setSaving(true); setEditError('');
    try { await updateFolder(b, edit, actor); setEdit(null); await load(); } catch (e) {
      setEditError(e.code === 'permission-denied' ? 'Not allowed: only the person who uploaded this folder, or an administrator, may edit it.' : e.message);
    } finally { setSaving(false); }
  };
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });
  const years = Array.from({ length: 40 }, (_, i) => String(new Date().getFullYear() + 1 - i));
  const funds = [...new Set([...fundsOf(settings), ...(b.fund ? [b.fund] : [])])];

  // The whole folder as one ZIP: a folder per record, and index.csv.
  const downloadZip = async () => {
    setZipping(true);
    try { await buildZip(); } catch (e) { setZip(e.message); } finally { setZipping(false); }
  };
  const buildZip = async () => {
    const { default: JSZip } = await import('jszip');
    const z = new JSZip();
    const failed = [];
    let n = 0;
    const count = recs.reduce((s, r) => s + (r.files || []).length, 0);
    for (const r of recs) {
      const dir = safeName(`${r.refNo || r.groupKey || r.id}${r.payee ? ` ${r.payee}` : ''}`);
      for (const f of r.files || []) {
        setZip(`Adding ${++n} of ${count}: ${f.name}`);
        try { z.file(`${dir}/${f.rel.split('/').map(safeName).join('/')}`, await fileBytes(f.path)); } catch (e) { failed.push(`${f.rel}: ${e.message}`); }
      }
    }
    z.file('index.csv', toCsv([['Reference No.', 'Date', 'Payee', 'Amount', 'Particulars', 'Files'],
      ...recs.map((r) => [r.refNo, r.docDate, r.payee, r.amount, r.particulars, (r.files || []).map((f) => f.rel).join('; ')])]));
    if (failed.length) z.file('could-not-be-added.txt', failed.join('\r\n'));
    setZip('Making the ZIP…');
    saveBlob(await z.generateAsync({ type: 'blob' }), `${safeName(b.folderName)}.zip`);
    audit(actor, 'download_folder', { entity: 'batch', entityId: b.id, label: b.folderName, details: { files: n, failed: failed.length } });
    setZip(failed.length ? `Downloaded. ${failed.length} file(s) could not be added: Storage CORS may not be set up (see the README).` : '');
  };

  return (
    <div className="page">
      <div className="crumbs"><Link to="/folders">Uploaded Folders</Link></div>
      <div className="page-head">
        <div><h1><Icon name="folder" className="h-ic" />{b.folderName} <StatusBadge status={b.status} /></h1></div>
        <div className="row gap wrap">
          {canUpload && <Link className="btn btn-primary" to={`/upload?into=${b.id}`}><Icon name="upload" />Upload more files</Link>}
          <Link className="btn" to={`/archive?type=${b.docType}${b.fiscalYear ? `&year=${b.fiscalYear}` : ''}`}><Icon name="search" />Same type and year</Link>
          <button className="btn" disabled={zipping} onClick={downloadZip}><Icon name="download" />{zipping ? 'Preparing ZIP…' : 'Download ZIP'}</button>
        </div>
      </div>
      {zip && <div className="alert alert-info">{zip}</div>}
      {b.status !== 'complete' && (
        <div className="alert alert-warn">Not every file of this folder was received ({b.fileCount} of {b.expectedFiles}). Open the records
          with fewer files than expected and use <b>Add files</b>, or upload the folder again.</div>
      )}
      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Folder details</h3>
            {canEdit && !edit && <button className="btn btn-sm" onClick={startEdit}><Icon name="edit" />Edit folder</button>}</div>
          {edit ? (
            <div className="fields one-col">
              <div><label className="field-label" htmlFor="ef-name">Folder name <span className="req">*</span></label><input id="ef-name" value={edit.folderName} onChange={set('folderName')} /></div>
              <div><label className="field-label" htmlFor="ef-type">Main document type <span className="req">*</span></label>
                <Select id="ef-type" value={edit.docType} onChange={set('docType')}>{typeChoices(edit.docType).map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</Select></div>
              <div><label className="field-label" htmlFor="ef-year">Fiscal year</label>
                <Select id="ef-year" value={edit.fiscalYear} onChange={set('fiscalYear')}><option value="">None</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</Select></div>
              <div><label className="field-label" htmlFor="ef-month">Month</label>
                <Select id="ef-month" value={edit.month} onChange={set('month')}><option value="">Whole year or mixed</option>{MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}</Select></div>
              <div><label className="field-label" htmlFor="ef-fund">Fund</label>
                <Select id="ef-fund" value={edit.fund} onChange={set('fund')}><option value="">None</option>{funds.map((f) => <option key={f}>{f}</option>)}</Select></div>
              <div><label className="field-label" htmlFor="bx">Box no.</label><input id="bx" value={edit.boxNo} onChange={set('boxNo')} /></div>
              <div><label className="field-label" htmlFor="lc">Shelf / location</label><input id="lc" value={edit.location} onChange={set('location')} /></div>
              <div><label className="field-label" htmlFor="rm">Remarks</label><textarea id="rm" value={edit.remarks} onChange={set('remarks')} /></div>
              <p className="help">The records in this folder take its new name, year, month, fund and filing location. No two folders may have the same name, main type and fund.</p>
              {editError && <div className="alert" role="alert">{editError}</div>}
              <div className="row gap"><button className="btn btn-primary" disabled={saving || !edit.folderName.trim()} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
                <button className="btn" disabled={saving} onClick={() => setEdit(null)}>Cancel</button></div>
            </div>
          ) : (
            <dl className="details">
              <dt>Main document type</dt><dd>{typeName(b.docType)}</dd>
              <dt>Fiscal year</dt><dd>{b.fiscalYear || '—'}{b.month ? ` · ${MONTHS[b.month - 1]}` : ''}</dd>
              <dt>Fund</dt><dd>{b.fund || '—'}</dd>
              <dt>Box no.</dt><dd>{b.boxNo || '—'}</dd>
              <dt>Shelf / location</dt><dd>{b.location || '—'}</dd>
              <dt>Remarks</dt><dd>{b.remarks || '—'}</dd>
              <dt>Uploaded</dt><dd>{when(b.createdAt)} · {b.byName}</dd>
            </dl>
          )}
        </div>
        <div className="card">
          <h3>Summary</h3>
          <ul className="glance">
            <li><span>Records</span><b>{recs.length}</b></li>
            <li><span>Files</span><b>{b.fileCount}</b></li>
            <li><span>Size</span><b>{bytes(b.totalBytes)}</b></li>
          </ul>
        </div>
      </div>
      <div className="card table-card">
        <div className="card-head pad"><h3>Records in this folder</h3>
          {canMove && recs.length > 0 && <span className="small muted hide-sm">Drag records onto another folder, or tick them and use Move.</span>}</div>
        {moved && (moved.error ? <div className="alert pad-x">{moved.error}</div>
          : <div className="alert alert-ok pad-x">Moved {moved.n} record{moved.n === 1 ? '' : 's'} to <Link to={`/folders/${moved.to.id}`}>{moved.to.folderName}</Link>.</div>)}
        {canMove && picked.size > 0 && (
          <div className="pick-bar">
            <b>{picked.size} selected</b>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setMoving({ ids: [...picked], mode: 'move' })}><Icon name="folder" />Move to folder…</button>
            <button type="button" className="btn btn-sm" onClick={() => setMoving({ ids: [...picked], mode: 'new' })}><Icon name="plus" />New folder from these</button>
            <button type="button" className="btn btn-sm" onClick={() => setPicked(new Set())}>Clear</button>
          </div>
        )}
        {recs.length ? (
          <table className="data-table clickable-rows">
            <thead><tr>{canMove && <th className="pick-cell"><input type="checkbox" aria-label="Select all" checked={allPicked}
              onChange={() => setPicked(allPicked ? new Set() : new Set(recs.map((r) => r.id)))} /></th>}<th aria-label="Preview" /><th>Type</th><th>Reference No.</th><th>Date</th><th>Payee</th><th>Particulars</th><th className="right">Amount</th><th className="right">Files</th></tr></thead>
            <tbody>{recs.map((r) => (
              <tr key={r.id} onClick={() => navigate(`/records/${r.id}`)} className={`${picked.has(r.id) ? 'picked' : ''}${dragging?.includes(r.id) ? ' dragged' : ''}`}
                draggable={canMove} onDragStart={(e) => {
                  const ids = picked.has(r.id) ? [...picked] : [r.id];
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', ids.join(','));
                  setDragging(ids);
                }} onDragEnd={() => setTimeout(() => setDragging(null), 0)}>
                {canMove && <td className="pick-cell" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${r.refNo || 'record'}`} checked={picked.has(r.id)} onChange={() => pick(r.id)} /></td>}
                <td className="peek-cell"><button type="button" className="btn-icon" title="Preview the documents" aria-label={`Preview ${r.refNo || 'record'}`}
                  onClick={(e) => { e.stopPropagation(); setPeek(recs.indexOf(r)); }}><Icon name="eye" /></button></td>
                <td><span className="badge badge-gold" title={typeName(r.docType)}>{r.docType}</span></td>
                <td><Link to={`/records/${r.id}`} onClick={(e) => e.stopPropagation()}>{r.refNo || r.groupKey}</Link></td>
                <td className="nowrap">{day(r.docDate)}</td><td>{r.payee}</td><td className="small clip">{r.particulars}</td>
                <td className="right nowrap num">{money(r.amount)}</td><td className="right">{r.fileCount}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : (
          <div className="empty">No records.{isAdmin && <div style={{ marginTop: '.7rem' }}><button className="btn btn-sm btn-danger" onClick={removeEmpty}><Icon name="trash" />Delete this empty folder</button></div>}</div>
        )}
      </div>
      {peek != null && <RecordPeek records={recs} index={peek} onIndex={setPeek} onClose={() => setPeek(null)} />}
      {dragging && <DropPanel count={dragging.length} from={b} onDrop={dropOn} />}
      {moving && <MoveDialog records={recsOf(moving.ids)} from={b} mode={moving.mode} onClose={() => setMoving(null)} onDone={(to) => afterMove(to, moving.ids.length)} />}
    </div>
  );
}
