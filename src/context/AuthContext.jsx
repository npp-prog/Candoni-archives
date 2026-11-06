import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  GoogleAuthProvider, createUserWithEmailAndPassword, getRedirectResult, onAuthStateChanged, sendEmailVerification,
  sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut, updateProfile,
} from 'firebase/auth';
import { auth } from '../firebase.js';
import { ensureUserProfile, getSettings } from '../lib/api.js';
import { canUpload, isAdminRole, readsAudit } from '../lib/roles.js';
import { setDocTypes } from '../lib/doctypes.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Registration details waiting for the auth listener to create the profile.
  const pendingProfile = useRef(null);

  const loadProfile = useCallback(async (firebaseUser) => {
    const p = await ensureUserProfile(firebaseUser, pendingProfile.current || {});
    pendingProfile.current = null;
    setProfile(p);
    if (p.active) {
      const s = await getSettings().catch(() => ({}));
      setDocTypes(s.docTypes); // the document types an administrator set, or the standard list
      setSettings(s);
    }
    return p;
  }, []);

  // Finish a Google sign-in that fell back to a full-page redirect.
  useEffect(() => { getRedirectResult(auth).catch((e) => setError(e.message)); }, []);

  useEffect(() => onAuthStateChanged(auth, async (firebaseUser) => {
    setLoading(true);
    setUser(firebaseUser);
    setError('');
    if (!firebaseUser) { setProfile(null); setLoading(false); return; }
    try { await loadProfile(firebaseUser); } catch (e) { setError(e.message); } finally { setLoading(false); }
  }), [loadProfile]);

  const active = Boolean(profile?.active);
  const value = {
    user,
    profile,
    settings,
    setSettings,
    loading,
    error,
    // Upload folders and edit metadata: the Records Officer and administrators.
    canUpload: active && canUpload(profile.role),
    // Approve users, delete records, Settings.
    isAdmin: active && isAdminRole(profile.role),
    readsAudit: active && readsAudit(profile.role),
    actor: user && profile ? { uid: user.uid, email: user.email, displayName: profile.displayName } : null,
    login: (email, password) => signInWithEmailAndPassword(auth, email, password),
    loginWithGoogle: async () => {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        // Popups can be blocked (some phones, in-app browsers): use a full-page redirect instead.
        if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) {
          await signInWithRedirect(auth, provider);
        } else if (e.code !== 'auth/popup-closed-by-user') throw e;
      }
    },
    register: async ({ email, password, displayName, office }) => {
      pendingProfile.current = { displayName, office };
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName });
      sendEmailVerification(cred.user).catch(() => {});
    },
    resendVerification: () => (user ? sendEmailVerification(user) : Promise.resolve()),
    resetPassword: (email) => sendPasswordResetEmail(auth, email),
    logout: () => signOut(auth),
    refreshProfile: async () => {
      if (!user) return;
      setError('');
      try {
        // Pick up a just-verified email in both the user and its ID token (the rules read the token).
        await user.reload();
        await user.getIdToken(true);
        await loadProfile(user);
      } catch (e) { setError(e.message); }
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
