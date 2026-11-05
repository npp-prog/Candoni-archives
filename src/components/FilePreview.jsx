import { useEffect, useRef, useState } from 'react';
import { loadPdfjs } from '../lib/pdfjs.js';
import { contentTypeOf, fileBlob, fileUrl } from '../lib/api.js';

const kindOf = (type) => (type === 'application/pdf' ? 'pdf'
  : type.startsWith('image/') && type !== 'image/tiff' ? 'image'
    : type === 'text/plain' ? 'text' : 'none');

// Shows a file inside the page: a PDF drawn page by page with pdf.js, an image, or plain text.
// file: { name, type } and either local (a File chosen on this device, before upload) or path (in
// Storage). A file from Storage that the browser may not read (bucket CORS not set) is shown in a
// frame instead.
export default function FilePreview({ file, local = null, path = null }) {
  const type = file.type || contentTypeOf(file.name);
  const kind = kindOf(type);
  const [bytes, setBytes] = useState(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let made = '';
    setBytes(null); setUrl(''); setError(''); setFallback(false);
    (async () => {
      if (kind === 'none') return;
      if (local) {
        if (kind === 'pdf') { const b = await local.arrayBuffer(); if (!cancelled) setBytes(b); } else { made = URL.createObjectURL(local); if (!cancelled) setUrl(made); }
        return;
      }
      if (kind === 'pdf') {
        try { const b = await (await fileBlob(path)).arrayBuffer(); if (!cancelled) setBytes(b); return; } catch { if (!cancelled) setFallback(true); }
      }
      const u = await fileUrl(path);
      if (!cancelled) setUrl(u);
    })().catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; if (made) URL.revokeObjectURL(made); };
  }, [local, path, kind]);

  if (kind === 'none') return <div className="empty">No preview for this file type. Use <b>Download</b>.</div>;
  if (error) return <div className="alert">Could not show the file: {error}</div>;
  if (kind === 'pdf' && bytes) return <PdfPages bytes={bytes} />;
  if (kind === 'pdf' && fallback && url) return <iframe className="preview-frame" src={url} title={file.name} />;
  if (kind === 'image' && url) return <div className="preview-image"><img src={url} alt={file.name} /></div>;
  if (kind === 'text' && url) return <iframe className="preview-frame" src={url} title={file.name} />;
  return <div className="spinner" />;
}

// Every page of a PDF, as wide as the space it has (redrawn when that changes).
function PdfPages({ bytes }) {
  const host = useRef(null);
  const canvases = useRef([]);
  const [doc, setDoc] = useState(null);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setWidth(Math.round(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loaded = null;
    (async () => {
      const lib = await loadPdfjs();
      // pdf.js takes over the buffer it is given: pass a copy.
      loaded = await lib.getDocument({ data: new Uint8Array(bytes).slice() }).promise;
      if (!cancelled) setDoc(loaded);
    })().catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; loaded?.destroy(); };
  }, [bytes]);

  useEffect(() => {
    if (!doc || !width) return undefined;
    let cancelled = false;
    let task = null;
    (async () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2.5);
      for (let n = 1; n <= doc.numPages && !cancelled; n++) {
        const canvas = canvases.current[n - 1];
        if (!canvas) continue;
        const page = await doc.getPage(n);
        const vp = page.getViewport({ scale: (width / page.getViewport({ scale: 1 }).width) * ratio });
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
        await task.promise;
      }
    })().catch((e) => !cancelled && e?.name !== 'RenderingCancelledException' && setError(e.message));
    return () => { cancelled = true; task?.cancel(); };
  }, [doc, width]);

  if (error) return <div className="alert">Could not show the PDF: {error}</div>;
  return (
    <div className="pdf-pages" ref={host}>
      {!doc && <div className="spinner" />}
      {doc && Array.from({ length: doc.numPages }, (_, i) => (
        <div className="pdf-page" key={i}><canvas ref={(c) => { canvases.current[i] = c; }} aria-label={`Page ${i + 1} of ${doc.numPages}`} /></div>
      ))}
    </div>
  );
}
