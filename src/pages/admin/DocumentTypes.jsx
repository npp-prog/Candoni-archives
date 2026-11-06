import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import Icon from '../../components/Icon.jsx';
import Select from '../../components/Select.jsx';
import { audit, saveSettings, typeUsage } from '../../lib/api.js';
import { DOC_TYPES, FIELDS, FIELD_LABELS, setDocTypes, typeProblem } from '../../lib/doctypes.js';

const blank = () => ({ code: '', name: '', refLabel: 'Reference No.', required: ['docDate'], supporting: true, hidden: false });

// The document types the archive offers (Administration → Document Types): the folder's main type and
// each document's type when uploading, with the details each one requires. Kept in meta/settings.docTypes.
// A type in use is hidden rather than removed, so the records that have it keep it.
export default function DocumentTypes() {
  const { settings, setSettings, actor } = useAuth();
  const [list, setList] = useState(DOC_TYPES);
  const [form, setForm] = useState(null); // { type, isNew }
  const [problem, setProblem] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');

  const save = async (next, what, label) => {
    setBusy(label); setMsg(null);
    try {
      await saveSettings({ docTypes: next }, actor);
      setDocTypes(next);
      setList(next);
      setSettings({ ...settings, docTypes: next });
      audit(actor, 'edit_document_types', { label, details: what });
      setMsg({ ok: true, text: 'Saved. Everyone sees the change the next time a page opens.' });
      return true;
    } catch (e) {
      setMsg({ text: e.code === 'permission-denied' ? 'Not allowed. Only administrators change document types, and the latest firestore.rules must be published.' : e.message });
      return false;
    } finally { setBusy(''); }
  };

  const submit = async (e) => {
    e.preventDefault();
    const t = { ...form.type, code: form.type.code.trim().toUpperCase(), name: form.type.name.trim(), refLabel: form.type.refLabel.trim() || 'Reference No.' };
    const p = typeProblem(t, list, form.isNew);
    if (p) { setProblem(p); return; }
    const entry = { code: t.code, name: t.name, refLabel: t.refLabel, required: FIELDS.filter((k) => t.required.includes(k)), supporting: Boolean(t.supporting), hidden: Boolean(t.hidden) };
    const next = form.isNew ? [...list, entry] : list.map((x) => (x.code === entry.code ? entry : x));
    if (await save(next, form.isNew ? `added ${entry.code}` : `edited ${entry.code}`, entry.code)) setForm(null);
  };

  const toggleHidden = (t) => save(list.map((x) => (x.code === t.code ? { ...x, hidden: !x.hidden } : x)), `${t.hidden ? 'showed' : 'hid'} ${t.code}`, t.code);

  const remove = async (t) => {
    setBusy(t.code); setMsg(null);
    try {
      const used = await typeUsage(t.code);
      if (used.records || used.folders) {
        setMsg({ text: `${t.name} is used by ${used.records} record${used.records === 1 ? '' : 's'} and ${used.folders} folder${used.folders === 1 ? '' : 's'}, so it cannot be removed. Hide it instead: it is then no longer offered, and those records keep it.` });
        setBusy('');
        return;
      }
    } catch (e) { setMsg({ text: e.message }); setBusy(''); return; }
    setBusy('');
    if (!window.confirm(`Remove ${t.name} (${t.code})? No record uses it.`)) return;
    save(list.filter((x) => x.code !== t.code), `removed ${t.code}`, t.code);
  };

  const set = (k) => (e) => setForm({ ...form, type: { ...form.type, [k]: e.target.value } });
  const toggleRequired = (k) => setForm({ ...form, type: { ...form.type, required: form.type.required.includes(k) ? form.type.required.filter((x) => x !== k) : [...form.type.required, k] } });

  const section = (title, rows) => (
    <div className="card table-card">
      <div className="card-head pad"><h3>{title}</h3></div>
      {rows.length ? (
        <table className="data-table">
          <thead><tr><th>Code</th><th>Name</th><th>Reference no. label</th><th>Required details</th><th>Status</th><th aria-label="Actions" /></tr></thead>
          <tbody>{rows.map((t) => (
            <tr key={t.code} className={t.hidden ? 'type-hidden' : ''}>
              <td><span className="badge badge-gold">{t.code}</span></td>
              <td><b>{t.name}</b></td>
              <td className="small">{t.refLabel}</td>
              <td className="small">{t.required.length ? t.required.map((k) => (k === 'refNo' ? t.refLabel : FIELD_LABELS[k])).join(', ') : 'None'}</td>
              <td>{t.hidden ? <span className="badge badge-gray">Hidden</span> : <span className="badge badge-green">Offered</span>}</td>
              <td><div className="row gap type-actions">
                <button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => { setProblem(''); setForm({ type: { ...t, required: [...t.required] }, isNew: false }); }}><Icon name="edit" />Edit</button>
                <button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => toggleHidden(t)}>{t.hidden ? 'Show' : 'Hide'}</button>
                <button className="btn-icon danger" title="Remove" aria-label={`Remove ${t.name}`} disabled={Boolean(busy)} onClick={() => remove(t)}><Icon name="trash" /></button>
              </div></td>
            </tr>
          ))}</tbody>
        </table>
      ) : <div className="empty">None.</div>}
    </div>
  );

  return (
    <div className="page">
      <div className="page-head"><div><h1>Document Types</h1></div>
        {!form && <button className="btn btn-primary" onClick={() => { setProblem(''); setForm({ type: blank(), isNew: true }); }}><Icon name="plus" />Add type</button>}</div>
      {form && (
        <form className="card" onSubmit={submit}>
          <h3>{form.isNew ? 'Add a document type' : `Edit ${form.type.code}`}</h3>
          <div className="fields">
            <div><label className="field-label" htmlFor="dt-code">Code <span className="req">*</span></label>
              <input id="dt-code" value={form.type.code} disabled={!form.isNew} onChange={set('code')} />
              <div className="help">2 to 12 capital letters. It cannot change once saved.</div></div>
            <div><label className="field-label" htmlFor="dt-name">Name <span className="req">*</span></label>
              <input id="dt-name" value={form.type.name} onChange={set('name')} /></div>
            <div><label className="field-label" htmlFor="dt-ref">Reference no. label</label>
              <input id="dt-ref" value={form.type.refLabel} onChange={set('refLabel')} />
              <div className="help">What its number is called on the upload form and the record.</div></div>
            <div><label className="field-label" htmlFor="dt-kind">Kind</label>
              <Select id="dt-kind" value={form.type.supporting ? 'supporting' : 'main'} onChange={(e) => setForm({ ...form, type: { ...form.type, supporting: e.target.value === 'supporting' } })}>
                <option value="main">Main document</option>
                <option value="supporting">Supporting document</option>
              </Select>
              <div className="help">Main documents come first in the lists; supporting documents are marked "(supporting)".</div></div>
            <div className="field-wide"><span className="field-label">Required details</span>
              <div className="check-grid">
                {FIELDS.map((k) => (
                  <label key={k} className="check"><input type="checkbox" checked={form.type.required.includes(k)} onChange={() => toggleRequired(k)} />
                    {k === 'refNo' ? (form.type.refLabel || 'Reference No.') : FIELD_LABELS[k]}</label>
                ))}
              </div>
              <div className="help">The uploader must fill these in for each document of this type.</div></div>
            <div className="field-wide"><label className="check"><input type="checkbox" checked={!form.type.hidden} onChange={(e) => setForm({ ...form, type: { ...form.type, hidden: !e.target.checked } })} />
              Offered when uploading and editing</label></div>
          </div>
          {problem && <div className="alert" role="alert">{problem}</div>}
          <div className="row gap"><button className="btn btn-primary" disabled={Boolean(busy)}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn" onClick={() => setForm(null)}>Cancel</button></div>
        </form>
      )}
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : ''}`} role="status">{msg.text}</div>}
      {section('Main documents', list.filter((t) => !t.supporting))}
      {section('Supporting documents', list.filter((t) => t.supporting))}
      <p className="help">Records keep their type when it is changed or hidden here. Search always lists every type, hidden ones included.</p>
    </div>
  );
}
