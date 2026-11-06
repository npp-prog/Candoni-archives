import test from 'node:test';
import assert from 'node:assert/strict';
import { DOC_TYPES, STANDARD_TYPES, setDocTypes, typeChoices, typeOf, typeProblem } from './doctypes.js';
import { rowProblems } from './names.js';

test('the list an administrator saved replaces the standard one, everywhere', () => {
  const mine = [
    { code: 'DV', name: 'Disbursement Voucher', refLabel: 'DV No.', required: ['refNo', 'docDate'] },
    { code: 'SOA', name: 'Statement of Account', refLabel: 'SOA No.', required: ['payee'], supporting: true },
    { code: 'OLD', name: 'Old form', refLabel: 'No.', required: [], hidden: true },
  ];
  setDocTypes(mine);
  assert.equal(DOC_TYPES, mine);
  assert.equal(typeOf('SOA').name, 'Statement of Account');
  assert.deepEqual(rowProblems('SOA', {}), ['payee']);
  assert.deepEqual(rowProblems('DV', { refNo: '1', docDate: '2026-01-01' }), []);
  assert.deepEqual(typeChoices().map((t) => t.code), ['DV', 'SOA']);
  assert.deepEqual(typeChoices('OLD').map((t) => t.code), ['DV', 'SOA', 'OLD']);
  // a code no longer in the list still shows, requiring nothing
  assert.equal(typeOf('PAYROLL').name, 'PAYROLL');
  assert.deepEqual(rowProblems('PAYROLL', {}), []);
  setDocTypes(null);
  assert.equal(DOC_TYPES, STANDARD_TYPES);
});

test('a type is checked before it is saved', () => {
  const list = STANDARD_TYPES;
  assert.match(typeProblem({ code: 'dv', name: 'x' }, list, true), /capital letters/);
  assert.match(typeProblem({ code: 'DV', name: 'x' }, list, true), /already used/);
  assert.equal(typeProblem({ code: 'DV', name: 'Disbursement Voucher' }, list, false), '');
  assert.match(typeProblem({ code: 'SOA', name: ' ' }, list, true), /name/);
  assert.match(typeProblem({ code: 'SOA', name: 'x', required: ['nope'] }, list, true), /Unknown/);
  assert.equal(typeProblem({ code: 'SOA', name: 'Statement of Account', required: ['payee'] }, list, true), '');
});
