// pdf.js (as in DMS), loaded the first time a PDF is shown. It draws the pages itself, so PDFs show
// on every device: Chrome on Android does not display a PDF inside a page.
let pdfjs = null;
export async function loadPdfjs() {
  if (!pdfjs) {
    const [lib, worker] = await Promise.all([
      import('pdfjs-dist/build/pdf.min.mjs'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    pdfjs = lib;
  }
  return pdfjs;
}
