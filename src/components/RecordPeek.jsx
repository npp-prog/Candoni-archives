import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from './Icon.jsx';
import FilePreview from './FilePreview.jsx';
import { audit, downloadFile } from '../lib/api.js';
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
  useEffect(() => {
    if (f) audit(actor, 'view_file', { entity: 'record', entityId: r.id, label: f.rel });
  }, [r.id, f?.path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && e.altKey && index > 0) onIndex(index - 1);
      else if (e.key === 'ArrowRight' && e.altKey && index < records.length - 1) onIndex(index + 1);
    };
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
            <div className="peek-viewer">
              {f ? <FilePreview key={f.path} file={f} path={f.path} /> : <div className="empty">This record has no files yet.</div>}
            </div>
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
