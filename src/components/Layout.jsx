import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Icon, { Avatar } from './Icon.jsx';
import { watchIdle } from '../lib/idle.js';
import { ROLE_NAMES } from '../lib/roles.js';

export default function Layout() {
  const { profile, canUpload, isAdmin, readsAudit, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  // Signed out after an hour without activity (Data Privacy Act: shared computers).
  useEffect(() => watchIdle(() => {
    try { sessionStorage.setItem('archives-signed-out', 'idle'); } catch { /* no notice then */ }
    logout();
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = [
    { items: [['/', 'home', 'Dashboard', true]] },
    {
      label: 'Archives',
      items: [
        ['/archive', 'search', 'Search Archives'],
        canUpload && ['/upload', 'upload', 'Upload Folder'],
        ['/folders', 'folder', 'Uploaded Folders'],
      ].filter(Boolean),
    },
    (readsAudit || isAdmin) && {
      label: 'Administration',
      items: [
        readsAudit && ['/admin/audit', 'log', 'Audit Log'],
        isAdmin && ['/admin/types', 'types', 'Document Types'],
        isAdmin && ['/admin/users', 'users', 'Users'],
        isAdmin && ['/admin/settings', 'settings', 'Settings'],
      ].filter(Boolean),
    },
  ].filter(Boolean);

  const titles = [...groups.flatMap((g) => g.items.map(([to, , label]) => [to, label])), ['/records', 'Search Archives']];
  const path = location.pathname;
  const title = path === '/' ? 'Dashboard'
    : titles.filter(([to]) => to !== '/' && (path === to || path.startsWith(`${to}/`))).sort((a, b) => b[0].length - a[0].length)[0]?.[1] || 'Candoni Archives';

  // The panel button hides the menu (remembered on this device); on a phone it opens it.
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('archives-side') === 'hidden'; } catch { return false; } });
  const togglePanel = () => {
    if (window.matchMedia('(max-width: 900px)').matches) { setOpen(!open); return; }
    setHidden(!hidden);
    try { localStorage.setItem('archives-side', hidden ? 'shown' : 'hidden'); } catch { /* not remembered */ }
  };
  const name = profile?.displayName || profile?.email;

  return (
    <div className={`shell${open ? ' nav-open' : ''}${hidden ? ' side-hidden' : ''}`}>
      <nav className="side" aria-label="Main">
        <Link to="/" className="side-brand">
          <img className="seal" src="/municipal-seal.png" alt="" />
          <span><b>Candoni Archives</b><small>Municipal Government of Candoni</small></span>
        </Link>
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.label && <div className="group">{g.label}</div>}
            {g.items.map(([to, icon, label, end]) => (
              <NavLink key={to} to={to} end={end}>
                <Icon name={icon} className="nav-ic" /><span className="lbl">{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
        <div className="side-foot">Candoni Archives · Records Management</div>
      </nav>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="shell-main">
        <header className="topbar">
          <button className="icon-btn panel-btn" aria-label="Show or hide the menu" aria-expanded={open || !hidden} onClick={togglePanel}>
            <Icon name="panel" />
          </button>
          <span className="top-title">{title}</span>
          <div className="spacer" />
          <span className="pill-btn hide-sm" title={name}>{ROLE_NAMES[profile?.role] || profile?.role}</span>
          <button className="pill-btn" title="Log out" onClick={logout}>
            <Icon name="logout" /><span className="lo-txt">Log out</span>
          </button>
          <span className="me" title={name}><Avatar name={name} size="sm" /></span>
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
