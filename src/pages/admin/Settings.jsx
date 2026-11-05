import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import Icon from '../../components/Icon.jsx';
import { audit, saveSettings } from '../../lib/api.js';
import { fundsOf } from '../../lib/doctypes.js';

// The funds offered in Upload and Search.
export default function Settings() {
  const { settings, setSettings, actor } = useAuth();
  const [funds, setFunds] = useState(fundsOf(settings));
  const [add, setAdd] = useState('');
  const [msg, setMsg] = useState(null);
  const save = async () => {
    const list = funds.map((f) => f.trim()).filter(Boolean);
    try {
      await saveSettings({ funds: list }, actor);
      setSettings({ ...settings, funds: list });
      audit(actor, 'edit_settings', { label: 'Funds', details: list.join(', ') });
      setMsg({ ok: true, text: 'Saved.' });
    } catch (e) { setMsg({ text: e.message }); }
  };
  return (
    <div className="page">
      <div className="page-head"><div><h1>Settings</h1></div></div>
      <div className="card narrow-card">
        <h3>Funds</h3>
        <ul className="fund-list">
          {funds.map((f, i) => (
            <li key={i}><input value={f} aria-label={`Fund ${i + 1}`} onChange={(e) => setFunds(funds.map((x, j) => (j === i ? e.target.value : x)))} />
              <button className="btn-icon danger" title="Remove" onClick={() => setFunds(funds.filter((_, j) => j !== i))}><Icon name="trash" /></button></li>
          ))}
        </ul>
        <form className="row gap" onSubmit={(e) => { e.preventDefault(); if (add.trim()) { setFunds([...funds, add.trim()]); setAdd(''); } }}>
          <input value={add} aria-label="New fund" onChange={(e) => setAdd(e.target.value)} />
          <button className="btn"><Icon name="plus" />Add</button>
        </form>
        <p className="help">The funds offered when uploading a folder and when searching.</p>
        {msg && <div className={`alert ${msg.ok ? 'alert-ok' : ''}`}>{msg.text}</div>}
        <button className="btn btn-primary" onClick={save}>Save</button>
      </div>
    </div>
  );
}
