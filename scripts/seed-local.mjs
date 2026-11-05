// Loads demo accounts into the LOCAL emulators only (never a real project), through the real
// security rules. Safe to run more than once: it does nothing if the demo superadmin exists.
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getFirestore, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { pathToFileURL } from 'node:url';
import { OWNER_EMAILS } from '../src/lib/owner.js';

export const DEMO = {
  owner: { email: OWNER_EMAILS[0], password: 'admin123', displayName: 'Archives Superadmin' },
  records: { email: 'records@archives.local', password: 'records123', displayName: 'Rosa Records', role: 'records', active: true },
  viewer: { email: 'viewer@archives.local', password: 'viewer123', displayName: 'Victor Viewer', role: 'user', active: true },
  pending: { email: 'new@archives.local', password: 'new12345', displayName: 'Nina Newcomer', role: 'user', active: false },
};
const PROJECT = 'demo-archives';
const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);

async function main() {
  try {
    await signInWithEmailAndPassword(auth, DEMO.owner.email, DEMO.owner.password);
    console.log('[Archives] Demo accounts already loaded.');
    await signOut(auth);
    return;
  } catch { /* not seeded yet */ }

  // Everyone signs up (a Viewer waiting for approval)…
  const uids = {};
  for (const [key, u] of Object.entries(DEMO)) {
    const cred = await createUserWithEmailAndPassword(auth, u.email, u.password);
    await updateProfile(cred.user, { displayName: u.displayName });
    uids[key] = cred.user.uid;
    if (key === 'owner') {
      // the owner's email, marked verified (as after Google sign-in or the email link)
      await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ localId: cred.user.uid, emailVerified: true }),
      });
      await cred.user.reload();
      await cred.user.getIdToken(true);
    }
    const owner = key === 'owner';
    await setDoc(doc(db, 'users', cred.user.uid), {
      email: u.email, displayName: u.displayName, requestedOffice: 'Municipal Accounting Office',
      role: owner ? 'superadmin' : 'user', active: owner, createdAt: serverTimestamp(),
    });
    await signOut(auth);
  }
  // …and the superadmin approves them.
  await signInWithEmailAndPassword(auth, DEMO.owner.email, DEMO.owner.password);
  for (const key of ['records', 'viewer']) {
    await updateDoc(doc(db, 'users', uids[key]), { role: DEMO[key].role, active: true, approvedBy: DEMO.owner.displayName, approvedAt: new Date().toISOString() });
  }
  await signOut(auth);
  console.log('[Archives] Demo accounts loaded:');
  for (const u of Object.values(DEMO)) console.log(`  ${u.email} / ${u.password}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
