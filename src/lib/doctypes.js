// Document types and the metadata each one must have. Keep the codes in sync with firestore.rules
// (records: docType). Field keys: refNo, docDate, payee, amount, particulars, orsNo, checkNo, respCenter.
export const STANDARD_TYPES = [
  // main documents
  { code: 'DV', name: 'Disbursement Voucher', refLabel: 'DV No.', required: ['refNo', 'docDate', 'payee', 'amount'] },
  { code: 'PAYROLL', name: 'Payroll', refLabel: 'Payroll No.', required: ['refNo', 'docDate', 'amount'] },
  { code: 'JEV', name: 'Journal Entry Voucher', refLabel: 'JEV No.', required: ['refNo', 'docDate'] },
  { code: 'LR', name: 'Liquidation Report', refLabel: 'LR No.', required: ['refNo', 'docDate', 'amount'] },
  { code: 'CONTRACT', name: 'Contract / MOA', refLabel: 'Contract No.', required: ['refNo', 'docDate', 'payee'] },
  { code: 'REPORT', name: 'Report (Financial / COA)', refLabel: 'Report No.', required: ['docDate', 'particulars'] },
  // supporting documents
  { code: 'OBR', name: 'Obligation Request (OBR / ORS)', refLabel: 'OBR No.', required: ['refNo', 'docDate', 'amount'], supporting: true },
  { code: 'PR', name: 'Purchase Request', refLabel: 'PR No.', required: ['refNo', 'docDate'], supporting: true },
  { code: 'RFQ', name: 'Request for Quotation', refLabel: 'RFQ No.', required: ['docDate'], supporting: true },
  { code: 'AOC', name: 'Abstract of Canvass / Bids', refLabel: 'Reference No.', required: ['docDate'], supporting: true },
  { code: 'PO', name: 'Purchase Order', refLabel: 'PO No.', required: ['refNo', 'docDate', 'payee'], supporting: true },
  { code: 'INVOICE', name: 'Invoice / Billing Statement', refLabel: 'Invoice No.', required: ['docDate', 'payee'], supporting: true },
  { code: 'DR', name: 'Delivery Receipt', refLabel: 'DR No.', required: ['docDate'], supporting: true },
  { code: 'IAR', name: 'Inspection and Acceptance Report', refLabel: 'IAR No.', required: ['docDate'], supporting: true },
  { code: 'OR', name: 'Official Receipt', refLabel: 'OR No.', required: ['refNo', 'docDate', 'payee', 'amount'], supporting: true },
  { code: 'TO', name: 'Travel Order / Itinerary', refLabel: 'TO No.', required: ['docDate'], supporting: true },
  { code: 'CERT', name: 'Certification', refLabel: 'Reference No.', required: ['docDate'], supporting: true },
  { code: 'OTHER', name: 'Other supporting document', refLabel: 'Reference No.', required: [], supporting: true },
];

// The list in use: the one an administrator saved (Administration → Document Types, kept in
// meta/settings.docTypes), or the standard list. A live binding: setDocTypes updates it for every module.
export let DOC_TYPES = STANDARD_TYPES;
export function setDocTypes(list) {
  DOC_TYPES = Array.isArray(list) && list.length ? list : STANDARD_TYPES;
}
// Offered when uploading or editing: the types not hidden, and the current one even if it is hidden.
export const typeChoices = (current = '') => DOC_TYPES.filter((t) => !t.hidden || t.code === current);

// A type code: 2 to 12 capital letters (the same check as isTypeCode in firestore.rules).
export const TYPE_CODE = /^[A-Z]{2,12}$/;
// What is wrong with a type about to be saved ('' when nothing): list is the list it goes into; isNew
// when it is added (its code must then be new).
export function typeProblem(t, list, isNew) {
  if (!TYPE_CODE.test(t.code || '')) return 'The code must be 2 to 12 capital letters, with no spaces.';
  if (isNew && list.some((x) => x.code === t.code)) return `The code ${t.code} is already used.`;
  if (!String(t.name || '').trim()) return 'Enter the name of the document type.';
  if (String(t.name).length > 80 || String(t.refLabel || '').length > 40) return 'The name or the reference no. label is too long.';
  if ((t.required || []).some((k) => !FIELDS.includes(k))) return 'Unknown required detail.';
  return '';
}

export const DEFAULT_FUNDS = ['General Fund', 'Special Education Fund', 'Trust Fund'];
export const fundsOf = (settings) => (settings?.funds?.length ? settings.funds : DEFAULT_FUNDS);

export const FIELDS = ['refNo', 'docDate', 'payee', 'amount', 'particulars', 'orsNo', 'checkNo', 'respCenter'];
export const FIELD_LABELS = {
  docType: 'Type', refNo: 'Reference No.', docDate: 'Date', payee: 'Payee', amount: 'Amount', particulars: 'Particulars',
  orsNo: 'OBR/ORS No.', checkNo: 'Check No.', respCenter: 'Resp. Center',
};

// A code no longer in the list (removed by an administrator) still shows, with nothing required.
export const typeOf = (code) => DOC_TYPES.find((t) => t.code === code) || { code: code || '', name: code || 'Unknown type', refLabel: 'Reference No.', required: [] };
export const typeName = (code) => typeOf(code).name;
export const fieldLabel = (code, key) => (key === 'refNo' ? typeOf(code).refLabel : FIELD_LABELS[key]);
