import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { ALLOWED, config } from './storage-file.js';

const file = `${ALLOWED}archives%2Fb1%2Fr1%2FDV.pdf?alt=media&token=abc`;
const call = (u, method = 'GET') => handler(new Request(`https://archives.mgocandoni.com/storage-file?u=${encodeURIComponent(u)}`, { method }));

test('forwards a file of this archive from the site\'s own address', async (t) => {
  const asked = [];
  t.mock.method(globalThis, 'fetch', async (u) => {
    asked.push(u);
    return new Response(new Uint8Array([37, 80, 68, 70]), { status: 200, headers: { 'content-type': 'application/pdf', 'content-length': '4' } });
  });
  const r = await call(file);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), new Uint8Array([37, 80, 68, 70]));
  assert.deepEqual(asked, [file]);
  assert.equal(config.path, '/storage-file');
});

test('refuses anything else', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not be called'); });
  assert.equal((await call('https://example.com/x?alt=media')).status, 400);
  assert.equal((await call('https://firebasestorage.googleapis.com/v0/b/another-bucket/o/x?alt=media')).status, 400);
  assert.equal((await call(`${ALLOWED}x`)).status, 400); // not a download (no alt=media)
  assert.equal((await call(file, 'POST')).status, 405);
});

test('passes Firebase\'s refusal on', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('denied', { status: 403, headers: { 'content-type': 'text/plain' } }));
  assert.equal((await call(file)).status, 403);
});
