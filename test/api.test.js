// End-to-end API test: login → create batch → upload files → search → preview → edit → audit.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archives-test-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.STORAGE_DIR = path.join(tmp, 'storage');
process.env.ADMIN_PASSWORD = 'admin-pass-123';

const app = require('../server');

let base;
let server;
let cookie = '';

async function call(method, url, body, { form } = {}) {
  const headers = { cookie };
  let payload;
  if (form) payload = form;
  else if (body) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(base + url, { method, headers, body: payload });
  const setCookie = r.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const type = r.headers.get('content-type') || '';
  return { status: r.status, headers: r.headers, data: type.includes('json') ? await r.json() : await r.text() };
}

test.before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('archive workflow', async () => {
  assert.equal((await call('GET', '/api/stats')).status, 401, 'requires login');
  assert.equal((await call('POST', '/api/login', { username: 'admin', password: 'wrong' })).status, 401);
  assert.equal((await call('POST', '/api/login', { username: 'admin', password: 'admin-pass-123' })).status, 200);
  assert.equal((await call('GET', '/api/me')).data.must_change_password, true);

  // Missing required metadata is rejected.
  const bad = await call('POST', '/api/batches', { batch: { folder_name: 'X', doc_type: 'DV' }, records: [{ ref_no: '1' }] });
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.data.errors[0].missing, ['doc_date', 'payee', 'amount']);

  const created = await call('POST', '/api/batches', {
    batch: { folder_name: 'FY2026 January DVs', doc_type: 'DV', fiscal_year: 2026, month: 1, fund: 'General Fund', box_no: 'B-01' },
    records: [
      { group_key: '100-2026-01-0001', ref_no: '100-2026-01-0001', doc_date: '2026-01-15', payee: 'Juan Dela Cruz', amount: '12,500.00', particulars: 'Office supplies' },
      { group_key: '100-2026-01-0002', ref_no: '100-2026-01-0002', doc_date: '2026-01-20', payee: 'ABC Trading', amount: '3000', particulars: 'Fuel' },
    ],
  });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const { batch_id: batchId, records } = created.data;

  const upload = (recordId, rel, content) => {
    const fd = new FormData();
    fd.append('record_id', String(recordId));
    fd.append('relative_path', rel);
    fd.append('file', new Blob([content], { type: 'application/pdf' }), rel.split('/').pop());
    return call('POST', `/api/batches/${batchId}/files`, null, { form: fd });
  };
  const u1 = await upload(records[0].id, '100-2026-01-0001/DV.pdf', '%PDF-1.4 one');
  assert.equal(u1.status, 200, JSON.stringify(u1.data));
  assert.equal(u1.data.duplicate_of, null);
  const u2 = await upload(records[1].id, '100-2026-01-0002/../../evil.pdf', '%PDF-1.4 one');
  assert.equal(u2.status, 200);
  assert.equal(u2.data.duplicate_of.ref_no, '100-2026-01-0001', 'duplicate content detected');

  // Path traversal was neutralised: everything stays inside storage.
  const all = fs.readdirSync(process.env.STORAGE_DIR, { recursive: true });
  assert.ok(all.some((p) => p.endsWith(path.join('batch-' + batchId, '100-2026-01-0002', 'evil.pdf'))), all.join('\n'));

  const fin = await call('POST', `/api/batches/${batchId}/finalize`, { expected_files: 3 });
  assert.equal(fin.data.status, 'incomplete');

  // Search: full text, filters, amount totals.
  let s = await call('GET', '/api/records?q=juan');
  assert.equal(s.data.total, 1);
  assert.equal(s.data.rows[0].amount, 12500);
  s = await call('GET', '/api/records?q=2026-01-0002');
  assert.equal(s.data.total, 1);
  s = await call('GET', '/api/records?type=DV&year=2026&min=5000');
  assert.equal(s.data.total, 1);
  s = await call('GET', `/api/records?batch=${batchId}`);
  assert.equal(s.data.total_amount, 15500);

  const dup = await call('POST', '/api/batches/check', { doc_type: 'DV', ref_nos: ['100-2026-01-0001', 'new'] });
  assert.equal(dup.data.existing.length, 1);

  // Record detail + file preview.
  const rec = await call('GET', `/api/records/${records[0].id}`);
  assert.equal(rec.data.files.length, 1);
  const file = await call('GET', `/api/files/${rec.data.files[0].id}`);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'application/pdf');
  assert.match(file.headers.get('content-disposition'), /^inline/);

  // Edit, then the change is searchable.
  assert.equal((await call('PUT', `/api/records/${records[0].id}`, { payee: 'Maria Santos' })).status, 200);
  assert.equal((await call('GET', '/api/records?q=maria')).data.total, 1);
  assert.equal((await call('GET', '/api/records?q=juan')).data.total, 0);
  assert.equal((await call('PUT', `/api/records/${records[0].id}`, { payee: '' })).status, 400, 'required stays required');

  // CSV export guards against formula injection.
  await call('PUT', `/api/records/${records[1].id}`, { particulars: '=HYPERLINK("x")' });
  const csv = await call('GET', '/api/records?format=csv');
  assert.match(csv.data, /'=HYPERLINK/);

  // Roles: viewer cannot upload.
  assert.equal((await call('POST', '/api/users', { username: 'viewer1', full_name: 'View Only', role: 'viewer', password: 'viewerpass' })).status, 200);
  assert.equal((await call('POST', '/api/login', { username: 'viewer1', password: 'viewerpass' })).status, 200);
  assert.equal((await call('POST', '/api/batches', { batch: {}, records: [] })).status, 403);
  assert.equal((await call('GET', '/api/records')).data.total, 2);
  assert.equal((await call('DELETE', `/api/records/${records[1].id}`)).status, 403);

  // Admin deletes a record; files are removed and the audit log shows it all.
  await call('POST', '/api/login', { username: 'admin', password: 'admin-pass-123' });
  assert.equal((await call('DELETE', `/api/records/${records[1].id}`)).status, 200);
  assert.equal((await call('GET', '/api/records?q=fuel')).data.total, 0);
  const log = (await call('GET', '/api/audit')).data.map((a) => a.action);
  for (const a of ['create_batch', 'upload_file', 'view_file', 'edit_record', 'export_csv', 'delete_record']) assert.ok(log.includes(a), a);
});
