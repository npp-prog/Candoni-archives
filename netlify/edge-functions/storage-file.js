// /storage-file?u=<a Firebase Storage download URL of the candoni-archives bucket>
// Fetches the file and passes it back from the site's own address, so the page can read it (to draw a
// PDF with pdf.js, to download, to make a ZIP) whatever the bucket's CORS allows: the browser asks the
// site, not Firebase. Only download URLs of this bucket are forwarded. A download URL carries its own
// access token, as Firebase issues it to signed-in users the storage rules allow; this adds no access.
// Keep the bucket in sync with src/firebase-config.js.
export const ALLOWED = 'https://firebasestorage.googleapis.com/v0/b/candoni-archives.firebasestorage.app/o/';

export default async function handler(request) {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const target = new URL(request.url).searchParams.get('u') || '';
  if (!target.startsWith(ALLOWED) || !/[?&]alt=media(&|$)/.test(target)) {
    return new Response('Not a file of this archive', { status: 400 });
  }
  const upstream = await fetch(target);
  const headers = new Headers({
    'content-type': upstream.headers.get('content-type') || 'application/octet-stream',
    'cache-control': 'private, max-age=3600',
    'x-content-type-options': 'nosniff',
  });
  const length = upstream.headers.get('content-length');
  if (length) headers.set('content-length', length);
  return new Response(upstream.body, { status: upstream.status, headers });
}

export const config = { path: '/storage-file' };
