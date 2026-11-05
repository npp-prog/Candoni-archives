import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { LandingBar } from './Login.jsx';
import Icon from '../components/Icon.jsx';
import { isOwnerEmail } from '../lib/owner.js';
import { myInvite } from '../lib/api.js';

// After signing in, until an administrator approves the account (or it cannot be loaded, or the
// owner's email is not verified yet).
export default function Pending({ error }) {
  const { user, profile, logout, refreshProfile, resendVerification } = useAuth();
  const [sent, setSent] = useState(false);
  const [checking, setChecking] = useState(false);
  // Added in advance by an administrator: only the email's verification is missing.
  const [invited, setInvited] = useState(false);
  useEffect(() => { if (user && !user.emailVerified) myInvite(user).then((i) => setInvited(Boolean(i))).catch(() => {}); }, [user]);
  const ownerUnverified = (isOwnerEmail(user?.email) || invited) && !user?.emailVerified;
  const check = async () => { setChecking(true); try { await refreshProfile(); } finally { setChecking(false); } };
  const steps = [
    ['Account created', user?.email || ''],
    ['An administrator approves it', 'and gives you your role'],
    ['Start using Candoni Archives', 'search, preview and upload records'],
  ];
  return (
    <div className="landing">
      <LandingBar>
        <button type="button" className="landing-link" onClick={logout}>Sign out</button>
      </LandingBar>
      <div className="pending">
        <span className={`pending-icon${error ? ' bad' : ''}`}><Icon name={error ? 'bell' : ownerUnverified ? 'send' : 'user'} /></span>
        <h1>{error ? 'Unable to load your account' : ownerUnverified ? 'Verify your email' : 'Waiting for approval'}</h1>
        {error ? (
          <>
            <div className="alert">{error}</div>
            {/permission/i.test(error) && (
              <p className="pending-text">The database rules are not published yet, or an older version is published.
                An administrator must open Firebase → Firestore Database → <b>Rules</b>, replace everything with the
                contents of <code>firestore.rules</code> from the Candoni Archives repository, and click <b>Publish</b>.
                Then click <b>Check again</b>.</p>
            )}
          </>
        ) : ownerUnverified ? (
          <>
            <p className="pending-text">{isOwnerEmail(user.email) ? `${user.email} is the Candoni Archives superadmin. To protect it,` : `An administrator added ${user.email} to Candoni Archives, with your role. To activate your account,`} Firebase must first confirm
              you own this address: open the verification link we emailed you (check Spam too), then click <b>Check again</b>.
              Or sign out and use <b>Continue with Google</b> with this account, which needs no link.</p>
            <p><button className="link" disabled={sent} onClick={() => resendVerification().then(() => setSent(true))}>
              {sent ? 'Verification email sent.' : 'Send the verification email again'}</button></p>
          </>
        ) : (
          <>
            <p className="pending-text">{profile?.deactivated
              ? <>Hi {profile?.displayName}. Your account was deactivated by an administrator. Ask them if you need access again.</>
              : <>Hi {profile?.displayName}. Your account has been created. An administrator must approve it before you can use Candoni Archives.</>}</p>
            <ol className="pending-steps">
              {steps.map(([t, d], i) => (
                <li key={t} className={i === 0 ? 'done' : i === 1 ? 'now' : ''}>
                  <span className="pending-dot">{i === 0 ? <Icon name="tick" /> : i + 1}</span>
                  <span><b>{t}</b><span className="small muted">{d}</span></span>
                </li>
              ))}
            </ol>
          </>
        )}
        <div className="row gap pending-actions">
          <button className="btn btn-primary" disabled={checking} onClick={check}>{checking ? 'Checking…' : 'Check again'}</button>
          <button className="btn" onClick={logout}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
