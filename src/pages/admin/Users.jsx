import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import Select from '../../components/Select.jsx';
import Icon, { Avatar } from '../../components/Icon.jsx';
import { addInvite, audit, listInvites, listUsers, removeInvite, updateUser } from '../../lib/api.js';
import { ROLE_NAMES } from '../../lib/roles.js';
import { when } from '../../lib/format.js';

// Add people in advance (they are approved, with their role, when they first sign in), approve new
// accounts, give roles, deactivate. An Admin manages Records Officers and Viewers; the
// superadmin also Admins (firestore.rules).
export default function Users() {
  const { user, profile, actor } = useAuth();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('waiting');
  const [busy, setBusy] = useState('');
  const [invites, setInvites] = useState([]);
  const [adding, setAdding] = useState(null); // the Add user form: { displayName, email, role }
  const [note, setNote] = useState('');
  const load = () => Promise.all([listUsers(), listInvites()]).then(([u, i]) => { setList(u); setInvites(i); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const isSuper = profile.role === 'superadmin';
  const roles = isSuper ? ['admin', 'records', 'user'] : ['records', 'user'];
  const canEdit = (u) => u.id !== user.uid && u.role !== 'superadmin' && (isSuper || u.role !== 'admin');

  const groups = useMemo(() => ({
    waiting: (list || []).filter((u) => !u.active && !u.deactivated),
    active: (list || []).filter((u) => u.active),
    off: (list || []).filter((u) => !u.active && u.deactivated),
  }), [list]);

  const change = async (u, patch, what) => {
    setBusy(u.id); setError('');
    try {
      await updateUser(u.id, patch);
      audit(actor, what, { entity: 'user', entityId: u.id, label: u.email, details: patch });
      await load();
    } catch (e) { setError(e.code === 'permission-denied' ? 'Not allowed: you cannot change this account.' : e.message); } finally { setBusy(''); }
  };
  const approve = (u, role) => change(u, { active: true, deactivated: false, role, approvedBy: actor.displayName || actor.email, approvedAt: new Date().toISOString() }, 'approve_user');

  const add = async (e) => {
    e.preventDefault();
    setError(''); setNote('');
    const email = adding.email.trim().toLowerCase();
    const known = (list || []).find((u) => String(u.email || '').toLowerCase() === email);
    if (known?.active) { setError(`${known.displayName || email} already has access (${ROLE_NAMES[known.role]}). Change their role under Active.`); return; }
    setBusy('add');
    try {
      if (known) {
        // signed up already: approve them now, with this role
        await updateUser(known.id, { active: true, deactivated: false, role: adding.role, approvedBy: actor.displayName || actor.email, approvedAt: new Date().toISOString() });
        audit(actor, 'approve_user', { entity: 'user', entityId: known.id, label: email, details: { role: adding.role } });
        setNote(`${known.displayName || email} had already signed up and is now approved as ${ROLE_NAMES[adding.role]}.`);
        setTab('active');
      } else {
        await addInvite({ ...adding, email }, actor);
        setNote(`${adding.displayName || email} is added as ${ROLE_NAMES[adding.role]}. When they sign in with ${email}, they have access at once.`);
        setTab('added');
      }
      setAdding(null);
      await load();
    } catch (err) { setError(err.code === 'permission-denied' ? 'Not allowed: an Admin adds Records Officers and Viewers; only the superadmin adds Admins.' : err.message); } finally { setBusy(''); }
  };
  const remove = async (i) => {
    if (!window.confirm(`Remove ${i.displayName || i.email}? They will not get access when they sign in.`)) return;
    setBusy(i.id);
    try { await removeInvite(i.id, actor); await load(); } catch (e) { setError(e.message); } finally { setBusy(''); }
  };

  const shown = groups[tab];
  return (
    <div className="page">
      <div className="page-head"><div><h1>Users</h1></div>
        {!adding && <button className="btn btn-primary" onClick={() => { setNote(''); setAdding({ displayName: '', email: '', role: 'records' }); }}><Icon name="plus" />Add user</button>}</div>
      {adding && (
        <form className="card" onSubmit={add}>
          <h3>Add user</h3>
          <div className="fields">
            <div><label className="field-label" htmlFor="au-name">Full name <span className="req">*</span></label>
              <input id="au-name" required value={adding.displayName} onChange={(e) => setAdding({ ...adding, displayName: e.target.value })} /></div>
            <div><label className="field-label" htmlFor="au-email">Email address <span className="req">*</span></label>
              <input id="au-email" type="email" required value={adding.email} onChange={(e) => setAdding({ ...adding, email: e.target.value })} /></div>
            <div><label className="field-label" htmlFor="au-role">Role <span className="req">*</span></label>
              <Select id="au-role" value={adding.role} onChange={(e) => setAdding({ ...adding, role: e.target.value })}>
                {roles.map((r) => <option key={r} value={r}>{ROLE_NAMES[r]}</option>)}
              </Select></div>
          </div>
          <p className="help">When they sign in with this email (Continue with Google, or Create an account and open the verification link Firebase emails them), they have access at once, with this role. Tell them the site's address: no email is sent from here.</p>
          <div className="row gap"><button className="btn btn-primary" disabled={busy === 'add'}>{busy === 'add' ? 'Adding…' : 'Add user'}</button>
            <button type="button" className="btn" onClick={() => setAdding(null)}>Cancel</button></div>
        </form>
      )}
      {note && <div className="alert alert-ok">{note}</div>}
      <div className="tabs">
        <button className={tab === 'waiting' ? 'active' : ''} onClick={() => setTab('waiting')}>Waiting for approval ({groups.waiting.length})</button>
        <button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>Active ({groups.active.length})</button>
        <button className={tab === 'off' ? 'active' : ''} onClick={() => setTab('off')}>Deactivated ({groups.off.length})</button>
        <button className={tab === 'added' ? 'active' : ''} onClick={() => setTab('added')}>Added, not signed in yet ({invites.length})</button>
      </div>
      {error && <div className="alert">{error}</div>}
      {!list && !error && <div className="spinner" />}
      {list && tab === 'added' && (
        <div className="card table-card">
          {invites.length ? (
            <ul className="user-list">
              {invites.map((i) => (
                <li key={i.id} className="user-row">
                  <div className="user-main archive-user">
                    <Avatar name={i.displayName || i.email} size="sm" />
                    <div className="user-who"><span className="user-name"><b>{i.displayName || i.email}</b></span><span className="small muted">{i.email}</span></div>
                    <div className="small muted">Added {when(i.at)}{i.byName ? ` by ${i.byName}` : ''}</div>
                    <div className="user-side">
                      <span className="badge badge-gold">{ROLE_NAMES[i.role]}</span>
                      <button className="btn btn-sm btn-danger" disabled={busy === i.id} onClick={() => remove(i)}>Remove</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : <div className="empty">No one is added and waiting to sign in. Use <b>Add user</b>.</div>}
        </div>
      )}
      {list && tab !== 'added' && (
        <div className="card table-card">
          {shown.length ? (
            <ul className="user-list">
              {shown.map((u) => (
                <li key={u.id} className="user-row">
                  <div className="user-main archive-user">
                    <Avatar name={u.displayName || u.email} size="sm" />
                    <div className="user-who"><span className="user-name"><b>{u.displayName || u.email}</b>{u.id === user.uid && <span className="muted"> (you)</span>}</span>
                      <span className="small muted">{u.email}{u.requestedOffice ? ` · ${u.requestedOffice}` : ''}</span></div>
                    <div className="small muted">{u.role === 'superadmin' ? 'Owner account' : u.active ? `Approved ${u.approvedAt ? when(u.approvedAt) : ''}${u.approvedBy ? ` by ${u.approvedBy}` : ''}` : `Signed up ${when(u.createdAt)}`}</div>
                    <div className="user-side">
                      {tab === 'waiting' && (
                        <>
                          <Select aria-label="Role" value={u.pick || 'user'} onChange={(e) => setList(list.map((x) => (x.id === u.id ? { ...x, pick: e.target.value } : x)))}>
                            {roles.map((r) => <option key={r} value={r}>{ROLE_NAMES[r]}</option>)}
                          </Select>
                          <button className="btn btn-primary btn-sm" disabled={busy === u.id} onClick={() => approve(u, u.pick || 'user')}>Approve</button>
                        </>
                      )}
                      {tab === 'active' && (canEdit(u) ? (
                        <>
                          <Select aria-label="Role" value={u.role} disabled={busy === u.id} onChange={(e) => change(u, { role: e.target.value }, 'change_role')}>
                            {[...new Set([...roles, u.role])].map((r) => <option key={r} value={r}>{ROLE_NAMES[r]}</option>)}
                          </Select>
                          <button className="btn btn-sm btn-danger" disabled={busy === u.id} onClick={() => window.confirm(`Deactivate ${u.displayName || u.email}? They can no longer sign in to the archives.`) && change(u, { active: false, deactivated: true }, 'deactivate_user')}>Deactivate</button>
                        </>
                      ) : <span className="badge badge-gold">{ROLE_NAMES[u.role]}</span>)}
                      {tab === 'off' && canEdit(u) && <button className="btn btn-sm" disabled={busy === u.id} onClick={() => change(u, { active: true, deactivated: false }, 'reactivate_user')}>Reactivate</button>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : <div className="empty">{tab === 'waiting' ? 'No one is waiting for approval.' : 'No one here.'}</div>}
        </div>
      )}
      <p className="help"><b>Add user</b> gives someone access before they sign in. People who sign up on their own (Create an account or Continue with Google) appear under <b>Waiting for approval</b>.
        <b> Records Officer</b>: uploads folders and edits details. <b>Viewer</b>: searches, previews and downloads. <b>Admin</b>: everything, including Users and Settings.</p>
    </div>
  );
}
