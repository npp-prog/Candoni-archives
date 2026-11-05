import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from '../components/Icon.jsx';
import { audit, ensureFolderLocks, fileBlob, getBatch, listBatches, recordsOfBatch, saveBlob, updateBatchLocation } from '../lib/api.js';
import { typeName } from '../lib/doctypes.js';
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
  const { canUpload, actor } = useAuth();
  const [b, setB] = useState(null);
  const [recs, setRecs] = useState(null);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState(null);
  const [zip, setZip] = useState('');
  const [zipping, setZipping] = useState(false);
  const load = () => Promise.all([getBatch(id), recordsOfBatch(id)]).then(([bb, rr]) => { setB(bb); setRecs(rr); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="alert">{error}</div>;
  if (!b || !recs) return b === null && recs ? <div className="card empty">This folder no longer exists.</div> : <div className="spinner" />;

  const save = async () => {
    try { await updateBatchLocation(b, edit, actor); setEdit(null); load(); } catch (e) { setError(e.message); }
  };

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
        try { z.file(`${dir}/${f.rel.split('/').map(safeName).join('/')}`, await fileBlob(f.path)); } catch (e) { failed.push(`${f.rel}: ${e.message}`); }
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
            {canUpload && !edit && <button className="btn btn-sm" onClick={() => setEdit({ boxNo: b.boxNo || '', location: b.location || '', remarks: b.remarks || '' })}><Icon name="edit" />Edit where filed</button>}</div>
          {edit ? (
            <div className="fields one-col">
              <div><label className="field-label" htmlFor="bx">Box no.</label><input id="bx" value={edit.boxNo} onChange={(e) => setEdit({ ...edit, boxNo: e.target.value })} /></div>
              <div><label className="field-label" htmlFor="lc">Shelf / location</label><input id="lc" value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} /></div>
              <div><label className="field-label" htmlFor="rm">Remarks</label><textarea id="rm" value={edit.remarks} onChange={(e) => setEdit({ ...edit, remarks: e.target.value })} /></div>
              <div className="row gap"><button className="btn btn-primary" onClick={save}>Save</button><button className="btn" onClick={() => setEdit(null)}>Cancel</button></div>
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
        <div className="card-head pad"><h3>Records in this folder</h3></div>
        {recs.length ? (
          <table className="data-table clickable-rows">
            <thead><tr><th>Type</th><th>Reference No.</th><th>Date</th><th>Payee</th><th>Particulars</th><th className="right">Amount</th><th className="right">Files</th></tr></thead>
            <tbody>{recs.map((r) => (
              <tr key={r.id} onClick={() => navigate(`/records/${r.id}`)}>
                <td><span className="badge badge-gold" title={typeName(r.docType)}>{r.docType}</span></td>
                <td><Link to={`/records/${r.id}`} onClick={(e) => e.stopPropagation()}>{r.refNo || r.groupKey}</Link></td>
                <td className="nowrap">{day(r.docDate)}</td><td>{r.payee}</td><td className="small clip">{r.particulars}</td>
                <td className="right nowrap num">{money(r.amount)}</td><td className="right">{r.fileCount}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : <div className="empty">No records.</div>}
      </div>
    </div>
  );
}
