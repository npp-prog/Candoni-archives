import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Select from '../components/Select.jsx';
import Icon from '../components/Icon.jsx';
import { SEARCH_LIMIT, audit, saveBlob, searchRecords } from '../lib/api.js';
import { DOC_TYPES, fundsOf } from '../lib/doctypes.js';
import { day, money } from '../lib/format.js';
import { toCsv } from '../lib/names.js';

const PAGE = 50;
const KEYS = ['q', 'type', 'year', 'fund', 'from', 'to', 'min', 'max'];
const SORTS = { refNo: 'Reference No.', docDate: 'Date', payee: 'Payee', amount: 'Amount' };

export default function Search() {
  const { settings, actor } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const f = Object.fromEntries(KEYS.map((k) => [k, params.get(k) || '']));
  const [q, setQ] = useState(f.q);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [sort, setSort] = useState({ key: 'docDate', dir: -1 });
  const [page, setPage] = useState(1);
  const key = KEYS.map((k) => f[k]).join('|');

  useEffect(() => {
    setResult(null); setError(''); setPage(1); setQ(f.q);
    searchRecords(f).then(setResult).catch((e) => setError(e.message));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p); };
  const rows = useMemo(() => {
    const list = [...(result?.rows || [])];
    const v = (r) => r[sort.key] ?? (sort.key === 'amount' ? -Infinity : '');
    return list.sort((a, b) => (typeof v(a) === 'number' && typeof v(b) === 'number' ? v(a) - v(b) : String(v(a)).localeCompare(String(v(b)), undefined, { numeric: true })) * sort.dir);
  }, [result, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const years = Array.from({ length: 40 }, (_, i) => new Date().getFullYear() + 1 - i);
  const filtered = KEYS.some((k) => f[k]);

  const exportCsv = () => {
    const head = ['Type', 'Reference No.', 'Date', 'Payee', 'Amount', 'Particulars', 'OBR/ORS No.', 'Check No.', 'Resp. Center', 'Fund', 'Fiscal Year', 'Box No.', 'Location', 'Folder', 'Files'];
    const body = rows.map((r) => [r.docType, r.refNo, r.docDate, r.payee, r.amount, r.particulars, r.orsNo, r.checkNo, r.respCenter, r.fund, r.fiscalYear, r.boxNo, r.location, r.folderName, r.fileCount]);
    saveBlob(new Blob([toCsv([head, ...body])], { type: 'text/csv;charset=utf-8' }), `archives-${new Date().toISOString().slice(0, 10)}.csv`);
    audit(actor, 'export_csv', { label: `${rows.length} records`, details: f });
  };

  const th = (k) => (
    <th className="sortable" onClick={() => setSort({ key: k, dir: sort.key === k ? -sort.dir : 1 })}>
      {SORTS[k]}{sort.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  );

  return (
    <div className="page">
      <div className="page-head"><div><h1>Search Archives</h1></div>
        {rows.length > 0 && <button className="btn" onClick={exportCsv}><Icon name="download" />Export CSV</button>}</div>
      <form className="filters" onSubmit={(e) => { e.preventDefault(); set('q', q.trim()); }}>
        <input type="search" className="search grow-search" placeholder="Search…" aria-label="Reference no., payee, particulars or file name"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-primary"><Icon name="search" />Search</button>
        <Select value={f.type} onChange={(e) => set('type', e.target.value)} aria-label="Document type">
          <option value="">All types</option>
          {DOC_TYPES.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
        </Select>
        <Select value={f.year} onChange={(e) => set('year', e.target.value)} aria-label="Fiscal year">
          <option value="">All years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </Select>
        <Select value={f.fund} onChange={(e) => set('fund', e.target.value)} aria-label="Fund">
          <option value="">All funds</option>
          {fundsOf(settings).map((x) => <option key={x}>{x}</option>)}
        </Select>
      </form>
      <div className="filters filters-more">
        <label><span className="field-label">Date from</span><input type="date" value={f.from} onChange={(e) => set('from', e.target.value)} /></label>
        <label><span className="field-label">Date to</span><input type="date" value={f.to} onChange={(e) => set('to', e.target.value)} /></label>
        <label><span className="field-label">Amount from</span><input type="number" step="0.01" value={f.min} onChange={(e) => set('min', e.target.value)} /></label>
        <label><span className="field-label">Amount to</span><input type="number" step="0.01" value={f.max} onChange={(e) => set('max', e.target.value)} /></label>
        {filtered && <button type="button" className="btn btn-sm" onClick={() => setParams({})}>Clear</button>}
      </div>
      <p className="help">Search by reference no., payee, particulars, OBR or check no., or file name. Every word must match.</p>

      {error && <div className="alert">{error}</div>}
      {!result && !error && <div className="spinner" />}
      {result && (
        <>
          <div className="result-bar">
            <span><b>{rows.length.toLocaleString()}</b> record{rows.length === 1 ? '' : 's'}</span>
            {result.capped && <span className="badge badge-yellow">Showing the first {SEARCH_LIMIT.toLocaleString()} matches: add a filter</span>}
          </div>
          {rows.length ? (
            <div className="card table-card">
              <table className="data-table clickable-rows">
                <thead><tr><th>Type</th>{th('refNo')}{th('docDate')}{th('payee')}<th>Particulars</th>{th('amount')}<th>Filed at</th><th className="right">Files</th></tr></thead>
                <tbody>{rows.slice((page - 1) * PAGE, page * PAGE).map((r) => (
                  <tr key={r.id} onClick={() => navigate(`/records/${r.id}`)}>
                    <td><span className="badge badge-gold">{r.docType}</span></td>
                    <td><Link to={`/records/${r.id}`} onClick={(e) => e.stopPropagation()}>{r.refNo || '—'}</Link></td>
                    <td className="nowrap">{day(r.docDate)}</td>
                    <td>{r.payee}</td>
                    <td className="small clip">{r.particulars}</td>
                    <td className="right nowrap num">{money(r.amount)}</td>
                    <td className="small">{[r.boxNo && `Box ${r.boxNo}`, r.location].filter(Boolean).join(' · ')}</td>
                    <td className="right">{r.fileCount}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <div className="card empty">No records match your search.</div>}
          {pages > 1 && (
            <div className="pager">
              <span className="muted small">Page {page} of {pages}</span>
              <div className="row gap">
                <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                <button className="btn btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
