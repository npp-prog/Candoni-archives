import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDate, parseAmount, parseName, detectYear, detectMonth, cellInvalid, rowProblems, groupKey, keywordsOf, matchesWords, csvCell, safePath,
} from './names.js';

test('normalizeDate', () => {
  assert.equal(normalizeDate('2026-01-15'), '2026-01-15');
  assert.equal(normalizeDate('01/15/2026'), '2026-01-15');
  assert.equal(normalizeDate('Jan 5, 2026'), '2026-01-05');
  assert.equal(normalizeDate('2026-02-30'), null);
  assert.equal(normalizeDate('13/01/2026'), null);
  assert.equal(normalizeDate(''), null);
});

test('parseAmount', () => {
  assert.equal(parseAmount('12,500.00'), 12500);
  assert.equal(parseAmount('₱ 3,250.5'), 3250.5);
  assert.equal(parseAmount('PHP 1,000'), 1000);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount(''), null);
});

test('parseName reads DV No., date, amount and payee', () => {
  assert.deepEqual(parseName('100-2026-01-0001_Juan Dela Cruz_12,500.00'), { refNo: '100-2026-01-0001', amount: '12,500.00', payee: 'Juan Dela Cruz' });
  assert.deepEqual(parseName('100-2026-01-0003_2026-01-28_XYZ Hardware_4,200.50.pdf'),
    { refNo: '100-2026-01-0003', docDate: '2026-01-28', amount: '4,200.50', payee: 'XYZ Hardware' });
  assert.deepEqual(parseName('DV No. 2026-145 - ABC Trading.pdf'), { refNo: '2026-145', payee: 'ABC Trading' });
  assert.deepEqual(parseName('01-15-2026_Maria Santos_P 3,250.00.pdf'), { docDate: '2026-01-15', amount: '3,250.00', payee: 'Maria Santos' });
  assert.deepEqual(parseName('scan001.pdf'), {});
  assert.deepEqual(parseName('ORS.pdf'), {});
});

test('detect year and month from a folder name', () => {
  assert.equal(detectYear('FY2026 January DVs'), 2026);
  assert.equal(detectMonth('FY2026 January DVs'), 1);
  assert.equal(detectMonth('03-Mar'), 3);
  assert.equal(detectMonth('Payroll'), null);
});

test('required and malformed cells', () => {
  assert.equal(cellInvalid('DV', { payee: '' }, 'payee'), true);
  assert.equal(cellInvalid('DV', { particulars: '' }, 'particulars'), false);
  assert.equal(cellInvalid('DV', { docDate: '2026-13-01' }, 'docDate'), true);
  assert.equal(cellInvalid('DV', { amount: '1,000' }, 'amount'), false);
  assert.equal(cellInvalid('JEV', { amount: '' }, 'amount'), false);
  assert.equal(cellInvalid('DR', { refNo: '' }, 'refNo'), false);
  assert.deepEqual(rowProblems('', { docDate: 'x' }), ['docType', 'docDate']);
  assert.deepEqual(rowProblems('OTHER', {}), []);
});

test('grouping files into records', () => {
  assert.equal(groupKey('Jan/DV-1/a.pdf', 'deepest', 'root'), 'Jan/DV-1');
  assert.equal(groupKey('Jan/DV-1/a.pdf', 'top', 'root'), 'Jan');
  assert.equal(groupKey('Jan/DV-1/a.pdf', 'file', 'root'), 'Jan/DV-1/a.pdf');
  assert.equal(groupKey('a.pdf', 'deepest', 'root'), 'a.pdf');
  assert.equal(groupKey('Jan/a.pdf', 'whole', 'root'), 'root');
});

test('search words', () => {
  const r = { refNo: '100-2026-01-0001', payee: 'Juan Dela Cruz', particulars: 'Office supplies', files: [{ name: 'DV.pdf' }] };
  const k = keywordsOf(r);
  assert.ok(k.includes('ju') && k.includes('juan') && k.includes('100-2026-01-0001') && k.includes('0001'));
  assert.ok(matchesWords({ ...r, keywords: k }, 'juan supp'));
  assert.ok(!matchesWords({ ...r, keywords: k }, 'juan pedro'));
  assert.ok(matchesWords({ ...r, keywords: k }, ''));
});

test('csv and paths are safe', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(safePath('a/../../b:c/d.pdf'), 'a/b c/d.pdf');
});
