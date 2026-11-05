// Document types and the metadata each one must have. Keep the codes in sync with firestore.rules
// (records: docType). Field keys: refNo, docDate, payee, amount, particulars, orsNo, checkNo, respCenter.
export const DOC_TYPES = [
  { code: 'DV', name: 'Disbursement Voucher', refLabel: 'DV No.', required: ['refNo', 'docDate', 'payee', 'amount'] },
  { code: 'PAYROLL', name: 'Payroll', refLabel: 'Payroll No.', required: ['refNo', 'docDate', 'amount'] },
  { code: 'PO', name: 'Purchase Order', refLabel: 'PO No.', required: ['refNo', 'docDate', 'payee'] },
  { code: 'PR', name: 'Purchase Request', refLabel: 'PR No.', required: ['refNo', 'docDate'] },
  { code: 'OBR', name: 'Obligation Request (OBR / ORS)', refLabel: 'OBR No.', required: ['refNo', 'docDate', 'amount'] },
  { code: 'JEV', name: 'Journal Entry Voucher', refLabel: 'JEV No.', required: ['refNo', 'docDate'] },
  { code: 'LR', name: 'Liquidation Report', refLabel: 'LR No.', required: ['refNo', 'docDate', 'amount'] },
  { code: 'OR', name: 'Official Receipt', refLabel: 'OR No.', required: ['refNo', 'docDate', 'payee', 'amount'] },
  { code: 'CONTRACT', name: 'Contract / MOA', refLabel: 'Contract No.', required: ['refNo', 'docDate', 'payee'] },
  { code: 'REPORT', name: 'Report (Financial / COA)', refLabel: 'Report No.', required: ['docDate', 'particulars'] },
  { code: 'OTHER', name: 'Other', refLabel: 'Reference No.', required: ['refNo'] },
];

export const DEFAULT_FUNDS = ['General Fund', 'Special Education Fund', 'Trust Fund'];
export const fundsOf = (settings) => (settings?.funds?.length ? settings.funds : DEFAULT_FUNDS);

export const FIELDS = ['refNo', 'docDate', 'payee', 'amount', 'particulars', 'orsNo', 'checkNo', 'respCenter'];
export const FIELD_LABELS = {
  refNo: 'Reference No.', docDate: 'Date', payee: 'Payee', amount: 'Amount', particulars: 'Particulars',
  orsNo: 'OBR/ORS No.', checkNo: 'Check No.', respCenter: 'Resp. Center',
};

export const typeOf = (code) => DOC_TYPES.find((t) => t.code === code) || DOC_TYPES[DOC_TYPES.length - 1];
export const typeName = (code) => typeOf(code).name;
export const fieldLabel = (code, key) => (key === 'refNo' ? typeOf(code).refLabel : FIELD_LABELS[key]);
