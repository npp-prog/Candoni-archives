import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar } from '../components/Icon.jsx';
import Icon from '../components/Icon.jsx';
import { stats } from '../lib/api.js';
import { typeName } from '../lib/doctypes.js';
import { bytes, greeting, when } from '../lib/format.js';
import { ROLE_NAMES } from '../lib/roles.js';
import { StatusBadge } from './Folders.jsx';

const num = (n) => (n == null ? '—' : n.toLocaleString());

export default function Dashboard() {
  const { profile, canUpload } = useAuth();
  const navigate = useNavigate();
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { stats().then(setS).catch((e) => setError(e.message)); }, []);
  const first = String(profile.displayName || '').split(' ')[0];
  const maxType = Math.max(1, ...(s?.byType || []).map((x) => x.n));

  return (
    <div className="page">
      <div className="home-head">
        <Avatar name={profile.displayName || profile.email} size="lg" />
        <div className="grow">
          <h1>{greeting()}, {first}</h1>
          <p>{ROLE_NAMES[profile.role]}{profile.requestedOffice ? ` · ${profile.requestedOffice}` : ''}</p>
        </div>
        {canUpload && <Link className="btn btn-primary" to="/upload"><Icon name="upload" />Upload folder</Link>}
      </div>

      <form className="home-search-bar" onSubmit={(e) => { e.preventDefault(); navigate(`/archive?q=${encodeURIComponent(q)}`); }}>
        <input type="search" placeholder="Search…" aria-label="Search the archives" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-primary"><Icon name="search" />Search</button>
      </form>

      {error && <div className="alert">{error}</div>}
      {!s && !error && <div className="spinner" />}
      {s && (
        <>
          <div className="stats">
            <Link className="stat" to="/archive"><span className="n">{num(s.records)}</span><span className="l">Records</span></Link>
            <div className="stat"><span className="n">{num(s.files)}</span><span className="l">Files</span></div>
            <Link className="stat" to="/folders"><span className="n">{num(s.batches)}</span><span className="l">Folders uploaded</span></Link>
            <div className="stat"><span className="n">{s.bytes == null ? '—' : bytes(s.bytes)}</span><span className="l">Storage used</span></div>
          </div>
          <div className="grid-2">
            <div className="card">
              <div className="card-head"><h3>Records by document type</h3><Link className="btn btn-sm" to="/archive">Search</Link></div>
              {s.byType.length ? (
                <ul className="bars">
                  {s.byType.map((t) => (
                    <li key={t.code}><Link to={`/archive?type=${t.code}`}>
                      <span className="bar-label">{typeName(t.code)}</span>
                      <span className="bar-track"><span style={{ width: `${(t.n / maxType) * 100}%` }} /></span>
                      <b>{t.n.toLocaleString()}</b>
                    </Link></li>
                  ))}
                </ul>
              ) : <div className="empty">Nothing archived yet.{canUpload && <> <Link to="/upload">Upload the first folder</Link>.</>}</div>}
            </div>
            <div className="card">
              <div className="card-head"><h3>By fiscal year</h3><span className="muted small">{new Date().toLocaleDateString('en-PH', { dateStyle: 'long' })}</span></div>
              {s.byYear.length ? (
                <ul className="glance">
                  {s.byYear.map((y) => <li key={y.year}><Link to={`/archive?year=${y.year}`}><span>FY {y.year}</span></Link><b>{y.n.toLocaleString()}</b></li>)}
                </ul>
              ) : <div className="empty">No records yet.</div>}
            </div>
          </div>
          <div className="card table-card">
            <div className="card-head pad"><h3>Recent uploads</h3><Link className="btn btn-sm" to="/folders">All folders</Link></div>
            {s.recent.length ? (
              <table className="data-table">
                <thead><tr><th>Folder</th><th>Main type</th><th>FY</th><th className="right">Records</th><th className="right">Files</th><th>Status</th><th>Uploaded</th></tr></thead>
                <tbody>{s.recent.map((b) => (
                  <tr key={b.id}>
                    <td><Link to={`/folders/${b.id}`}>{b.folderName}</Link></td><td>{b.docType}</td><td>{b.fiscalYear || ''}</td>
                    <td className="right">{b.recordCount}</td><td className="right">{b.fileCount}</td><td><StatusBadge status={b.status} /></td>
                    <td className="small">{when(b.createdAt)}<div className="muted">{b.byName}</div></td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <div className="empty">No folders uploaded yet.</div>}
          </div>
        </>
      )}
    </div>
  );
}
