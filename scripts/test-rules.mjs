// Checks firestore.rules and storage.rules against the local emulators (npm run emulators, then
// node scripts/seed-local.mjs, then npm run test:rules). Each role may do what it should, and no more.
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  addDoc, collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';
import { connectStorageEmulator, deleteObject, getStorage, ref, uploadBytes } from 'firebase/storage';
import { DEMO } from './seed-local.mjs';

let n = 0;
async function as(who) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: 'demo-archives', storageBucket: 'demo-archives.appspot.com' }, `app${n++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const st = getStorage(app);
  connectStorageEmulator(st, '127.0.0.1', 9199);
  const cred = who.create ? await createUserWithEmailAndPassword(auth, who.email, who.password) : await signInWithEmailAndPassword(auth, who.email, who.password);
  return { db, st, uid: cred.user.uid };
}
const denied = async (p, what) => {
  try { await p; } catch (e) { if (/permission|unauthorized/i.test(e.code || e.message)) return; throw e; }
  throw new Error(`should be denied: ${what}`);
};
const ok = async (p, what) => { try { return await p; } catch (e) { throw new Error(`should be allowed: ${what} (${e.code})`); } };

const batchData = (uid) => ({
  folderName: 'Test', docType: 'DV', fiscalYear: 2026, month: 1, fund: 'General Fund', boxNo: null, location: null, remarks: null,
  status: 'uploading', expectedFiles: 1, fileCount: 0, recordCount: 1, totalBytes: 0, by: uid, byName: 'x', createdAt: serverTimestamp(),
});
const recordData = (uid, batchId) => ({
  batchId, folderName: 'Test', groupKey: 'g', docType: 'DV', refNo: '100-2026-01-9999', refKey: '100-2026-01-9999', docDate: '2026-01-15',
  payee: 'Rule Test', amount: 100, particulars: null, orsNo: null, checkNo: null, respCenter: null, fund: null, fiscalYear: 2026, month: 1,
  boxNo: null, location: null, files: [], fileCount: 0, keywords: ['rule'], createdBy: uid, createdByName: 'x', createdAt: serverTimestamp(),
});

const stamp = Date.now();
const owner = await as(DEMO.owner);
const records = await as(DEMO.records);
const viewer = await as(DEMO.viewer);
const pending = await as(DEMO.pending);
const stranger = await as({ email: `s${stamp}@archives.local`, password: 'pass1234', create: true });

// Accounts
await denied(setDoc(doc(stranger.db, 'users', stranger.uid), { email: `s${stamp}@archives.local`, displayName: 'S', role: 'superadmin', active: true, createdAt: serverTimestamp() }), 'sign up as superadmin');
await denied(setDoc(doc(stranger.db, 'users', stranger.uid), { email: `s${stamp}@archives.local`, displayName: 'S', role: 'user', active: true, createdAt: serverTimestamp() }), 'sign up already approved');
await ok(setDoc(doc(stranger.db, 'users', stranger.uid), { email: `s${stamp}@archives.local`, displayName: 'S', requestedOffice: '', role: 'user', active: false, createdAt: serverTimestamp() }), 'sign up');
await denied(updateDoc(doc(stranger.db, 'users', stranger.uid), { active: true }), 'approve oneself');
await denied(updateDoc(doc(records.db, 'users', stranger.uid), { active: true }), 'Records Officer approves');
await denied(getDocs(collection(viewer.db, 'users')), 'Viewer lists users');
await denied(updateDoc(doc(owner.db, 'users', owner.uid), { role: 'user' }), 'superadmin demoted by own edit');

// Reading the archive
await denied(getDocs(collection(pending.db, 'records')), 'unapproved user reads records');
await ok(getDocs(collection(viewer.db, 'records')), 'Viewer reads records');

// Uploading
await denied(addDoc(collection(viewer.db, 'batches'), batchData(viewer.uid)), 'Viewer uploads');
await denied(addDoc(collection(records.db, 'batches'), batchData(owner.uid)), 'upload in someone else\'s name');
const b = await ok(addDoc(collection(records.db, 'batches'), batchData(records.uid)), 'Records Officer creates a folder');
await denied(addDoc(collection(records.db, 'records'), { ...recordData(records.uid, b.id), docType: 'HACK' }), 'unknown document type');
const r = await ok(addDoc(collection(records.db, 'records'), recordData(records.uid, b.id)), 'Records Officer creates a record');
await denied(updateDoc(doc(records.db, 'records', r.id), { createdBy: viewer.uid }), 'change who uploaded');
await ok(updateDoc(doc(records.db, 'records', r.id), { payee: 'Edited' }), 'Records Officer edits details');
await denied(updateDoc(doc(viewer.db, 'records', r.id), { payee: 'Viewer edit' }), 'Viewer edits details');

const path = `archives/${b.id}/${r.id}/test.pdf`;
await denied(uploadBytes(ref(viewer.st, path), new Uint8Array([1, 2, 3]), { contentType: 'application/pdf' }), 'Viewer uploads a file');
await ok(uploadBytes(ref(records.st, path), new Uint8Array([1, 2, 3]), { contentType: 'application/pdf' }), 'Records Officer uploads a file');
await denied(uploadBytes(ref(records.st, 'elsewhere/x.pdf'), new Uint8Array([1]), { contentType: 'application/pdf' }), 'file outside archives/');
await denied(deleteObject(ref(records.st, path)), 'Records Officer deletes a file');

// Audit log: written as oneself, never changed, read by the Records Officer and admins
const a = await ok(addDoc(collection(viewer.db, 'audit'), { action: 'view_record', entity: 'record', entityId: r.id, label: '', details: null, uid: viewer.uid, name: 'V', at: serverTimestamp() }), 'Viewer logs a view');
await denied(addDoc(collection(viewer.db, 'audit'), { action: 'x', entity: null, entityId: null, label: '', details: null, uid: records.uid, name: 'R', at: serverTimestamp() }), 'log in someone else\'s name');
await denied(getDocs(collection(viewer.db, 'audit')), 'Viewer reads the audit log');
await denied(deleteDoc(doc(owner.db, 'audit', a.id)), 'delete from the audit log');
await ok(getDoc(doc(records.db, 'audit', a.id)), 'Records Officer reads the audit log');

// Deleting: administrators only
await denied(deleteDoc(doc(records.db, 'records', r.id)), 'Records Officer deletes a record');
await ok(deleteObject(ref(owner.st, path)), 'superadmin deletes a file');
await ok(deleteDoc(doc(owner.db, 'records', r.id)), 'superadmin deletes a record');
await ok(deleteDoc(doc(owner.db, 'batches', b.id)), 'superadmin deletes a folder');

// Settings
await denied(setDoc(doc(records.db, 'meta', 'settings'), { funds: ['X'] }), 'Records Officer edits settings');
await ok(setDoc(doc(owner.db, 'meta', 'settings'), { funds: ['General Fund', 'Special Education Fund', 'Trust Fund'] }), 'superadmin edits settings');

assert.ok(true);
console.log('All rules checks passed.');
process.exit(0);
