import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAudit } from '../../lib/api.js';
import { when } from '../../lib/format.js';

const RED = /delete|deactivate/;

// Who uploaded, viewed, downloaded, edited or deleted what (the latest 500 actions).
export default function AuditLog() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { listAudit(500).then(setList).catch((e) => setError(e.message)); }, []);
  const shown = useMemo(() => (list || []).filter((a) => `${a.name} ${a.action} ${a.label} ${a.details}`.toLowerCase().includes(q.toLowerCase())), [list, q]);
  const link = (a) => (a.entity === 'record' && a.entityId ? <Link to={`/records/${a.entityId}`}>{a.label || 'record'}</Link>
    : a.entity === 'batch' && a.entityId ? <Link to={`/folders/${a.entityId}`}>{a.label || 'folder'}</Link> : a.label);
  return (
    <div className="page">
      <div className="page-head"><div><h1>Audit Log</h1></div></div>
      <div className="filters"><input type="search" className="search" placeholder="Search…" aria-label="Filter the log" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {error && <div className="alert">{error}</div>}
      {!list && !error && <div className="spinner" />}
      {list && (
        <div className="card table-card">
          {shown.length ? (
            <table className="data-table">
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Item</th><th>Details</th></tr></thead>
              <tbody>{shown.map((a) => (
                <tr key={a.id}>
                  <td className="small nowrap">{when(a.at)}</td><td>{a.name}</td>
                  <td><span className={`badge ${RED.test(a.action) ? 'badge-red' : 'badge-gray'}`}>{a.action.replace(/_/g, ' ')}</span></td>
                  <td className="small">{link(a)}</td><td className="xs mono clip-wide">{a.details}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <div className="empty">Nothing logged yet.</div>}
        </div>
      )}
    </div>
  );
}
