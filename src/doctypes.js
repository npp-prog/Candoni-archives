// Document types and their required record-level metadata.
// Edit this list to match the office's records classification.
// Field keys: ref_no, doc_date, payee, amount, particulars, ors_no, check_no, resp_center

const DOC_TYPES = [
  { code: 'DV', name: 'Disbursement Voucher', refLabel: 'DV No.', required: ['ref_no', 'doc_date', 'payee', 'amount'] },
  { code: 'PAYROLL', name: 'Payroll', refLabel: 'Payroll No.', required: ['ref_no', 'doc_date', 'amount'] },
  { code: 'PO', name: 'Purchase Order', refLabel: 'PO No.', required: ['ref_no', 'doc_date', 'payee'] },
  { code: 'PR', name: 'Purchase Request', refLabel: 'PR No.', required: ['ref_no', 'doc_date'] },
  { code: 'ORS', name: 'Obligation Request / ORS', refLabel: 'ORS/OBR No.', required: ['ref_no', 'doc_date', 'amount'] },
  { code: 'JEV', name: 'Journal Entry Voucher', refLabel: 'JEV No.', required: ['ref_no', 'doc_date'] },
  { code: 'LR', name: 'Liquidation Report', refLabel: 'LR No.', required: ['ref_no', 'doc_date', 'amount'] },
  { code: 'OR', name: 'Official Receipt', refLabel: 'OR No.', required: ['ref_no', 'doc_date', 'payee', 'amount'] },
  { code: 'CONTRACT', name: 'Contract / MOA', refLabel: 'Contract No.', required: ['ref_no', 'doc_date', 'payee'] },
  { code: 'REPORT', name: 'Report (Financial / COA)', refLabel: 'Report No.', required: ['doc_date', 'particulars'] },
  { code: 'OTHER', name: 'Other', refLabel: 'Reference No.', required: ['ref_no'] },
];

const FUNDS = ['General Fund', 'Special Education Fund', 'Trust Fund', '20% Development Fund', 'LDRRMF', 'Other'];

const FIELD_LABELS = {
  ref_no: 'Reference No.',
  doc_date: 'Date',
  payee: 'Payee',
  amount: 'Amount',
  particulars: 'Particulars',
  ors_no: 'ORS/OBR No.',
  check_no: 'Check No.',
  resp_center: 'Resp. Center',
};

function getType(code) {
  return DOC_TYPES.find((t) => t.code === code);
}

// Returns a list of missing required field keys for a record.
function missingFields(docType, rec) {
  const t = getType(docType);
  if (!t) return ['doc_type'];
  return t.required.filter((k) => rec[k] === undefined || rec[k] === null || String(rec[k]).trim() === '');
}

module.exports = { DOC_TYPES, FUNDS, FIELD_LABELS, getType, missingFields };
