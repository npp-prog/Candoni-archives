import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { IDLE_MINUTES } from '../lib/idle.js';

const MESSAGES = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/configuration-not-found': 'Sign-in is not set up yet in Firebase. An administrator must open Firebase → Authentication → Get started and enable Email/Password.',
  'auth/operation-not-allowed': 'This sign-in method is turned off in Firebase. An administrator must enable it under Firebase → Authentication → Sign-in method.',
  'auth/network-request-failed': 'Cannot reach the server. Check your internet connection and try again.',
  'auth/unauthorized-domain': 'This website address is not yet allowed to sign in. An administrator must add it in Firebase → Authentication → Settings → Authorized domains.',
  'auth/account-exists-with-different-credential': 'This email already has an account with a password. Sign in with your email and password instead.',
};

// The sign-in pages' top bar: seal and name.
export function LandingBar({ children }) {
  return (
    <header className="landing-bar">
      <a className="landing-brand" href="/" title="Home">
        <img src="/municipal-seal.png" alt="Municipal seal" />
        <span><b>Candoni Archives</b><span>Municipal Government of Candoni</span></span>
      </a>
      {children}
    </header>
  );
}

const GOOGLE = (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

export default function Login() {
  const { login, loginWithGoogle, register, resetPassword } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', displayName: '', office: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(() => {
    try {
      if (sessionStorage.getItem('archives-signed-out') !== 'idle') return null;
      sessionStorage.removeItem('archives-signed-out');
      return { ok: true, text: `You were signed out after ${IDLE_MINUTES} minutes without activity. Sign in again to continue.` };
    } catch { return null; }
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else if (mode === 'register') await register(form);
      else {
        await resetPassword(form.email);
        setMessage({ ok: true, text: `If an account exists for ${form.email}, a reset link has been sent. Check Spam too.` });
      }
    } catch (err) {
      setMessage({ text: MESSAGES[err.code] || err.message });
    } finally {
      setBusy(false);
    }
  };

  const titles = { login: 'Sign in', register: 'Create your account', reset: 'Reset your password' };
  const subs = {
    login: '',
    register: 'After creating your account, an administrator approves your access.',
    reset: 'Enter the email address of your account.',
  };

  return (
    <div className="landing">
      <LandingBar />
      <div className="landing-hero">
        <div className="landing-copy">
          <h1>Every record, kept and found.</h1>
          <p>The records of the Municipal Government of Candoni, preserved in one secure place: filed folder by folder,
            kept with their details, and found in seconds whenever they are needed.</p>
          <div className="pillars"><span>ACCOUNTABILITY.</span><span>TRANSPARENCY.</span><span>SERVICE.</span></div>
        </div>
        <section className="auth-panel">
          <div className="auth-box">
            <h2>{titles[mode]}</h2>
            {subs[mode] && <p className="muted small">{subs[mode]}</p>}
            {mode !== 'reset' && (
              <>
                <button type="button" className="gbtn" disabled={busy} onClick={async () => {
                  setBusy(true);
                  setMessage(null);
                  try { await loginWithGoogle(); } catch (err) { setMessage({ text: MESSAGES[err.code] || err.message }); } finally { setBusy(false); }
                }}>{GOOGLE} Continue with Google</button>
                <div className="or">or use your email</div>
              </>
            )}
            <form onSubmit={submit}>
              {mode === 'register' && (
                <>
                  <div><label className="field-label" htmlFor="nm">Full name</label>
                    <input id="nm" required value={form.displayName} onChange={set('displayName')} /></div>
                  <div><label className="field-label" htmlFor="of">Office / Department</label>
                    <input id="of" value={form.office} onChange={set('office')} /></div>
                </>
              )}
              <div><label className="field-label" htmlFor="em">Email address</label>
                <input id="em" type="email" required value={form.email} onChange={set('email')} autoComplete="email" /></div>
              {mode !== 'reset' && (
                <div><label className="field-label" htmlFor="pw">Password</label>
                  <input id="pw" type="password" required minLength={6} value={form.password} onChange={set('password')}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></div>
              )}
              {message && <div className={`alert ${message.ok ? 'alert-ok' : ''}`} role="alert">{message.text}</div>}
              <button className="btn btn-primary btn-block" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}
              </button>
            </form>
            <div className="auth-links">
              {mode !== 'login' && <button type="button" className="link" onClick={() => setMode('login')}>I already have an account</button>}
              {mode === 'login' && <button type="button" className="link" onClick={() => setMode('register')}>Create an account</button>}
              {mode === 'login' && <button type="button" className="link" onClick={() => setMode('reset')}>Forgot password?</button>}
            </div>
            <p className="xs muted" style={{ marginTop: '1.4rem' }}>For official use of the Municipal Government of Candoni. Personal information is
              processed under the Data Privacy Act of 2012 (RA 10173).</p>
          </div>
        </section>
      </div>
    </div>
  );
}
