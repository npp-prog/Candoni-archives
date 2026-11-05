import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from '../components/Icon.jsx';
import FilePreview from '../components/FilePreview.jsx';
import { addFiles, audit, auditOf, deleteFile, deleteRecord, downloadFile, fileUrl, getRecord, updateRecord } from '../lib/api.js';
import { FIELDS, fieldLabel, typeName, typeOf } from '../lib/doctypes.js';
import { bytes, day, isPreviewable, money, when } from '../lib/format.js';
import { MONTHS, formatAmount, rowProblems } from '../lib/names.js';

const ACTIONS = {
  upload_folder: 'uploaded the folder', view_record: 'viewed', edit_record: 'edited the details', view_file: 'previewed a file',
  download_file: 'downloaded a file', delete_file: 'deleted a file', add_files: 'added files', delete_record: 'deleted the record',
};

export default function RecordView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { actor, canUpload, isAdmin, readsAudit } = useAuth();
  const [r, setR] = useState(undefined);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(null);
  const [url, setUrl] = useState('');
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState('');
  const [history, setHistory] = useState([]);

  const load = async () => {
    const rec = await getRecord(id);
    setR(rec);
    if (rec) {
      const first = (rec.files || []).find((f) => isPreviewable(f.type)) || rec.files?.[0] || null;
      setCurrent((c) => (c && rec.files.some((f) => f.path === c.path) ? c : first));
      if (readsAudit) auditOf(id).then(setHistory).catch(() => {});
    }
  };
  useEffect(() => {
    load().catch((e) => setError(e.message));
    audit(actor, 'view_record', { entity: 'record', entityId: id });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setUrl('');
    // for "Open" (a new tab); the preview itself is FilePreview
    if (current && isPreviewable(current.type)) fileUrl(current.path).then(setUrl).catch(() => {});
  }, [current]);

  if (error) return <div className="alert">{error}</div>;
  if (r === undefined) return <div className="spinner" />;
  if (!r) return <div className="card empty">This record no longer exists. <Link to="/archive">Search the archives</Link></div>;
  const t = typeOf(r.docType);
  const L = (k) => fieldLabel(r.docType, k);
  const show = (k) => (k === 'amount' ? money(r.amount) : k === 'docDate' ? day(r.docDate) : r[k]) || '—';

  const startEdit = () => setEdit(Object.fromEntries(FIELDS.map((k) => [k, k === 'amount' ? formatAmount(r.amount) : r[k] ?? ''])));
  const problems = edit ? rowProblems(r.docType, edit) : [];
  const save = async () => {
    if (problems.length) return;
    setBusy('Saving…');
    try { await updateRecord(r, edit, actor); setEdit(null); await load(); } catch (e) { setError(e.message); } finally { setBusy(''); }
  };
  const onAdd = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    try {
      await addFiles(r, files, actor, (i, n, name) => setBusy(`Uploading ${i + 1} of ${n}: ${name}`));
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  };
  const onDelete = async () => {
    const want = r.refNo || 'DELETE';
    const typed = window.prompt(`This permanently deletes the record and its ${(r.files || []).length} file(s).\nType ${want} to confirm:`);
    if (typed === null) return;
    if (typed.trim() !== want) { window.alert('That did not match. Nothing was deleted.'); return; }
    setBusy('Deleting…');
    try { await deleteRecord(r, actor); navigate(`/folders/${r.batchId}`); } catch (e) { setError(e.message); setBusy(''); }
  };
  const onDeleteFile = async (f) => {
    if (!window.confirm(`Permanently delete ${f.rel}?`)) return;
    setBusy('Deleting…');
    try { await deleteFile(r, f, actor); await load(); } catch (e) { setError(e.message); } finally { setBusy(''); }
  };
  const open = (f) => { setCurrent(f); audit(actor, 'view_file', { entity: 'record', entityId: r.id, label: f.rel }); };
  const download = (f) => { downloadFile(f); audit(actor, 'download_file', { entity: 'record', entityId: r.id, label: f.rel }); };

  return (
    <div className="page">
      <div className="crumbs"><Link to={`/folders/${r.batchId}`}>{r.folderName}</Link></div>
      <div className="page-head">
        <div><h1>{t.code} {r.refNo || r.groupKey}</h1></div>
        <div className="row gap wrap">
          {canUpload && !edit && <button className="btn" onClick={startEdit}><Icon name="edit" />Edit details</button>}
          {canUpload && <label className="btn"><Icon name="plus" />Add files<input type="file" multiple hidden onChange={onAdd} /></label>}
          {isAdmin && <button className="btn btn-danger" onClick={onDelete}><Icon name="trash" />Delete</button>}
        </div>
      </div>
      {busy && <div className="alert alert-info">{busy}</div>}
      <div className="split">
        <div>
          <div className="card">
            <h3>{edit ? 'Edit details' : 'Details'}</h3>
            {edit ? (
              <>
                <div className="fields one-col">
                  {FIELDS.map((k) => (
                    <div key={k} className={`field${problems.includes(k) ? ' invalid' : ''}`}>
                      <label className="field-label" htmlFor={`e-${k}`}>{L(k)}{t.required.includes(k) && <span className="req"> *</span>}</label>
                      {k === 'particulars'
                        ? <textarea id={`e-${k}`} value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
                        : <input id={`e-${k}`} type={k === 'docDate' ? 'date' : 'text'} inputMode={k === 'amount' ? 'decimal' : undefined}
                          value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />}
                    </div>
                  ))}
                </div>
                {problems.length > 0 && <p className="help warn-text">Fill in or correct: {problems.map(L).join(', ')}.</p>}
                <div className="row gap"><button className="btn btn-primary" disabled={problems.length > 0 || Boolean(busy)} onClick={save}>Save changes</button>
                  <button className="btn" onClick={() => setEdit(null)}>Cancel</button></div>
              </>
            ) : (
              <dl className="details">
                <dt>Document type</dt><dd>{typeName(r.docType)}</dd>
                {FIELDS.map((k) => <FragmentRow key={k} label={L(k)} value={show(k)} />)}
                <dt>Fund</dt><dd>{r.fund || '—'}</dd>
                <dt>Fiscal year</dt><dd>{r.fiscalYear || '—'}{r.month ? ` · ${MONTHS[r.month - 1]}` : ''}</dd>
                <dt>Filed at</dt><dd>{[r.boxNo && `Box ${r.boxNo}`, r.location].filter(Boolean).join(' · ') || '—'}</dd>
                <dt>Uploaded</dt><dd>{when(r.createdAt)} · {r.createdByName}</dd>
                {r.updatedAt && <><dt>Last edited</dt><dd>{when(r.updatedAt)} · {r.updatedBy}</dd></>}
              </dl>
            )}
          </div>
          <div className="card">
            <h3>Files ({(r.files || []).length})</h3>
            {(r.files || []).length ? (
              <ul className="file-list">
                {r.files.map((f) => (
                  <li key={f.path} className={current?.path === f.path ? 'active' : ''}>
                    <button type="button" className="file-open" onClick={() => open(f)} title={f.rel}>
                      <Icon name="doc" /><span className="file-name">{f.name}</span><span className="muted xs">{bytes(f.size)}</span>
                    </button>
                    <button type="button" className="btn-icon" title="Download" onClick={() => download(f)}><Icon name="download" /></button>
                    {isAdmin && <button type="button" className="btn-icon danger" title="Delete file" onClick={() => onDeleteFile(f)}><Icon name="trash" /></button>}
                  </li>
                ))}
              </ul>
            ) : <div className="empty">No files yet.{canUpload && ' Use Add files.'}</div>}
          </div>
          {readsAudit && history.length > 0 && (
            <div className="card">
              <h3>History</h3>
              <ul className="history">
                {history.map((h) => (
                  <li key={h.id}><b>{h.name}</b> {ACTIONS[h.action] || h.action.replace(/_/g, ' ')}{h.label && h.action !== 'view_record' ? <span className="small"> · {h.label}</span> : null}
                    <div className="small muted">{when(h.at)}</div></li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="preview-col">
          <div className="pdf-viewer">
            <div className="pdf-viewer-head">
              <b className="clip">{current?.rel || 'No file'}</b>
              {current && <span className="row gap" style={{ marginLeft: 'auto' }}>
                {url && <a className="btn btn-sm" href={url} target="_blank" rel="noreferrer"><Icon name="eye" />Open</a>}
                <button className="btn btn-sm" onClick={() => download(current)}><Icon name="download" />Download</button>
              </span>}
            </div>
            <div className="viewer-body">
              {current ? <FilePreview key={current.path} file={current} path={current.path} /> : <div className="empty">No file to preview.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FragmentRow({ label, value }) {
  return <><dt>{label}</dt><dd>{value}</dd></>;
}
