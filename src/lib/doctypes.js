// Document types and the metadata each one must have. Keep the codes in sync with firestore.rules
// (records: docType). Field keys: refNo, docDate, payee, amount, particulars, orsNo, checkNo, respCenter.
export const DOC_TYPES = [
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
export const MAIN_TYPES = DOC_TYPES.filter((t) => !t.supporting);
export const isType = (code) => DOC_TYPES.some((t) => t.code === code);

export const DEFAULT_FUNDS = ['General Fund', 'Special Education Fund', 'Trust Fund'];
export const fundsOf = (settings) => (settings?.funds?.length ? settings.funds : DEFAULT_FUNDS);

export const FIELDS = ['refNo', 'docDate', 'payee', 'amount', 'particulars', 'orsNo', 'checkNo', 'respCenter'];
export const FIELD_LABELS = {
  docType: 'Type', refNo: 'Reference No.', docDate: 'Date', payee: 'Payee', amount: 'Amount', particulars: 'Particulars',
  orsNo: 'OBR/ORS No.', checkNo: 'Check No.', respCenter: 'Resp. Center',
};

export const typeOf = (code) => DOC_TYPES.find((t) => t.code === code) || DOC_TYPES[DOC_TYPES.length - 1];
export const typeName = (code) => typeOf(code).name;
export const fieldLabel = (code, key) => (key === 'refNo' ? typeOf(code).refLabel : FIELD_LABELS[key]);
