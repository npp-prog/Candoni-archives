import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import Select from '../../components/Select.jsx';
import { Avatar } from '../../components/Icon.jsx';
import { audit, listUsers, updateUser } from '../../lib/api.js';
import { ROLE_NAMES } from '../../lib/roles.js';
import { when } from '../../lib/format.js';

// Approve new accounts, give roles, deactivate. An Admin manages Records Officers and Viewers; the
// superadmin also Admins (firestore.rules).
export default function Users() {
  const { user, profile, actor } = useAuth();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('waiting');
  const [busy, setBusy] = useState('');
  const load = () => listUsers().then(setList).catch((e) => setError(e.message));
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

  const shown = groups[tab];
  return (
    <div className="page">
      <div className="page-head"><div><h1>Users</h1></div></div>
      <div className="tabs">
        <button className={tab === 'waiting' ? 'active' : ''} onClick={() => setTab('waiting')}>Waiting for approval ({groups.waiting.length})</button>
        <button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>Active ({groups.active.length})</button>
        <button className={tab === 'off' ? 'active' : ''} onClick={() => setTab('off')}>Deactivated ({groups.off.length})</button>
      </div>
      {error && <div className="alert">{error}</div>}
      {!list && !error && <div className="spinner" />}
      {list && (
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
      <p className="help">New people sign up on the sign-in page (Create an account or Continue with Google) and appear under <b>Waiting for approval</b>.
        <b> Records Officer</b>: uploads folders and edits details. <b>Viewer</b>: searches, previews and downloads. <b>Admin</b>: everything, including Users and Settings.</p>
    </div>
  );
}
