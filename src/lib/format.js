// Display formats (Philippine conventions).
const toDate = (v) => (!v ? null : v.toDate ? v.toDate() : new Date(v));
export const money = (n) => (n == null || n === '' ? '' : `₱ ${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const bytes = (n) => {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), 4);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
};
export const day = (s) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '');
export const when = (v) => { const d = toDate(v); return d ? d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : ''; };
export const greeting = (d = new Date()) => (d.getHours() < 12 ? 'Good morning' : d.getHours() < 18 ? 'Good afternoon' : 'Good evening');
export const isPreviewable = (type = '') => type === 'application/pdf' || (type.startsWith('image/') && type !== 'image/tiff') || type === 'text/plain';
