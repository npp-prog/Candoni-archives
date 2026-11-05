// Checks firestore.rules and storage.rules against the local emulators (npm run emulators, then
// node scripts/seed-local.mjs, then npm run test:rules). Each role may do what it should, and no more.
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  addDoc, collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { connectStorageEmulator, deleteObject, getStorage, ref, uploadBytes } from 'firebase/storage';
import { DEMO } from './seed-local.mjs';
import { folderLockId } from '../src/lib/names.js';

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

const RUN = `Test ${Date.now()}`; // a folder name of its own each run
const batchData = (uid, extra = {}) => ({
  folderName: RUN, docType: 'DV', fiscalYear: 2026, month: 1, fund: 'General Fund', boxNo: null, location: null, remarks: null,
  status: 'uploading', expectedFiles: 1, fileCount: 0, recordCount: 1, totalBytes: 0, by: uid, byName: 'x', createdAt: serverTimestamp(), ...extra,
});
// A folder as the app makes it: the folder and its lock in one write. lockId overrides the lock's name.
async function createFolder(db, data, lockId = folderLockId(data)) {
  const ref = doc(collection(db, 'batches'));
  const wb = writeBatch(db);
  wb.set(ref, data);
  wb.set(doc(db, 'folderLocks', lockId), { batchId: ref.id, at: new Date().toISOString() });
  await wb.commit();
  return ref;
}
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
await denied(createFolder(viewer.db, batchData(viewer.uid)), 'Viewer uploads');
await denied(createFolder(records.db, batchData(owner.uid)), 'upload in someone else\'s name');
await denied(addDoc(collection(records.db, 'batches'), batchData(records.uid)), 'a folder without its lock');
await denied(createFolder(records.db, batchData(records.uid), 'made-up|DV|key'), 'a folder with a lock under another name');
const b = await ok(createFolder(records.db, batchData(records.uid)), 'Records Officer creates a folder');

// One folder per name, type and fund
await denied(createFolder(records.db, batchData(records.uid)), 'the same folder again');
await denied(createFolder(owner.db, batchData(owner.uid, { folderName: `  ${RUN.toUpperCase()} `, fund: 'GENERAL  FUND' })), 'the same folder with other capitals and spaces');
await denied(setDoc(doc(records.db, 'folderLocks', folderLockId(batchData(records.uid))), { batchId: 'other', at: 'x' }), 'replace a folder\'s lock');
const other = await ok(createFolder(records.db, batchData(records.uid, { fund: 'Trust Fund' })), 'same name, another fund');
await denied(updateDoc(doc(records.db, 'batches', other.id), { fund: 'General Fund' }), 'change a folder\'s fund');
// a folder made before the locks: an admin frees the lock, then it is added again (as the app does)
await ok(deleteDoc(doc(owner.db, 'folderLocks', folderLockId(batchData(records.uid, { fund: 'Trust Fund' })))), 'admin removes a lock');
await denied(setDoc(doc(records.db, 'folderLocks', 'wrong|DV|'), { batchId: other.id, at: 'x' }), 'a lock not named after its folder');
await ok(setDoc(doc(records.db, 'folderLocks', folderLockId(batchData(records.uid, { fund: 'Trust Fund' }))), { batchId: other.id, at: 'x' }), 'lock added for an existing folder');
await denied(deleteDoc(doc(records.db, 'folderLocks', folderLockId(batchData(records.uid)))), 'Records Officer removes a lock');
await denied(addDoc(collection(records.db, 'records'), { ...recordData(records.uid, b.id), docType: 'not a type' }), 'malformed document type');
const r = await ok(addDoc(collection(records.db, 'records'), recordData(records.uid, b.id)), 'Records Officer creates a record');
await denied(updateDoc(doc(records.db, 'records', r.id), { createdBy: viewer.uid }), 'change who uploaded');
await ok(updateDoc(doc(records.db, 'records', r.id), { payee: 'Edited' }), 'Records Officer edits details');
await ok(updateDoc(doc(records.db, 'records', r.id), { docType: 'OBR' }), 'Records Officer changes the document type');
await denied(updateDoc(doc(records.db, 'records', r.id), { docType: 'bad type' }), 'malformed type on edit');
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
