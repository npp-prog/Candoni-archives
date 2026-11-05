import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from './Icon.jsx';
import FilePreview from './FilePreview.jsx';
import SideNav from './SideNav.jsx';
import { audit, downloadFile, fileUrl, prefetchFile } from '../lib/api.js';
import { FIELDS, fieldLabel, typeName } from '../lib/doctypes.js';
import { bytes, day, money } from '../lib/format.js';

// A record's documents in a pop-up, beside its details, from a list of records (a folder, search
// results). Previous / Next go through the list; Escape closes. Each file shown is logged.
export default function RecordPeek({ records, index, onIndex, onClose }) {
  const { actor } = useAuth();
  const r = records[index];
  const files = [...(r.files || [])].sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true }));
  const [fileIndex, setFileIndex] = useState(0);
  const f = files[fileIndex] || files[0];

  useEffect(() => { setFileIndex(0); }, [index]);
  // read the next and previous records' first files ahead, so Next and Previous open at once
  useEffect(() => {
    const first = (x) => [...(x?.files || [])].sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true }))[0]?.path;
    const t = setTimeout(() => { prefetchFile(first(records[index + 1])); prefetchFile(first(records[index - 1])); }, 400);
    return () => clearTimeout(t);
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps
  // the other files of this record too
  useEffect(() => { files.forEach((x, j) => { if (j !== fileIndex) prefetchFile(x.path); }); }, [r.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [openUrl, setOpenUrl] = useState('');
  useEffect(() => { setOpenUrl(''); if (f) fileUrl(f.path).then(setOpenUrl).catch(() => {}); }, [f?.path]);
  useEffect(() => {
    if (f) audit(actor, 'view_file', { entity: 'record', entityId: r.id, label: f.rel });
  }, [r.id, f?.path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); }; // ← → : SideNav
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [index, records.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = (k) => (k === 'amount' ? money(r.amount) : k === 'docDate' ? day(r.docDate) : r[k]);
  const download = () => { downloadFile(f); audit(actor, 'download_file', { entity: 'record', entityId: r.id, label: f.rel }); };

  return (
    <div className="peek-backdrop" role="presentation" onClick={onClose}>
      <div className="peek" role="dialog" aria-modal="true" aria-label={`${typeName(r.docType)} ${r.refNo || ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="peek-head">
          <div className="grow"><b className="clip-line"><span className="badge badge-gold">{r.docType}</span> {r.refNo || r.groupKey}</b>
            <span className="small muted">{index + 1} of {records.length}{r.payee ? ` · ${r.payee}` : ''}</span></div>
          <button type="button" className="btn btn-sm" disabled={index === 0} onClick={() => onIndex(index - 1)}>Previous</button>
          <button type="button" className="btn btn-sm" disabled={index === records.length - 1} onClick={() => onIndex(index + 1)}>Next</button>
          <button type="button" className="btn-icon peek-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="peek-body">
          <div className="peek-file">
            {files.length > 1 && (
              <div className="tabs peek-tabs">
                {files.map((x, j) => <button key={x.path} type="button" className={x === f ? 'active' : ''} onClick={() => setFileIndex(j)}>{x.name}</button>)}
              </div>
            )}
            <SideNav onPrev={index > 0 ? () => onIndex(index - 1) : null} onNext={index < records.length - 1 ? () => onIndex(index + 1) : null}>
              <div className="peek-viewer">
                {f ? <FilePreview key={f.path} file={f} path={f.path} /> : <div className="empty">This record has no files yet.</div>}
              </div>
            </SideNav>
          </div>
          <div className="peek-fields">
            <dl className="details">
              <dt>Type</dt><dd>{typeName(r.docType)}</dd>
              {FIELDS.filter((k) => r[k] != null && r[k] !== '').map((k) => <FieldRow key={k} label={fieldLabel(r.docType, k)} value={value(k)} />)}
              <dt>Folder</dt><dd>{r.folderName}</dd>
            </dl>
            {f && <p className="small muted">{f.rel} · {bytes(f.size)}</p>}
            <div className="row gap wrap">
              <Link className="btn btn-primary btn-sm" to={`/records/${r.id}`}><Icon name="eye" />Open record</Link>
              {openUrl && <a className="btn btn-sm" href={openUrl} target="_blank" rel="noreferrer"
                onClick={() => audit(actor, 'view_file', { entity: 'record', entityId: r.id, label: `${f.rel} (new tab)` })}><Icon name="eye" />Open in new tab</a>}
              {f && <button type="button" className="btn btn-sm" onClick={download}><Icon name="download" />Download</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, value }) {
  return <><dt>{label}</dt><dd>{value}</dd></>;
}
