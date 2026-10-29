import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createSupplierContactMatcher } from '../src/components/material-requests/supplierSearch.ts';
import { supplierSearchContacts as contacts } from './support/supplierSearchCases.js';

const found = (query, scope) => contacts.filter(createSupplierContactMatcher(query, scope)).map(contact => contact.id);

test('ACES matches actual companies, aliases and represented brands, not ACESCONN email domains or raw Excel cells', () => {
  assert.deepEqual(found('aces'), ['search-case-2', 'search-case-4']);
  assert.deepEqual(found('ＡＣＥＳ'), found('aces'));
  assert.deepEqual(found(' ACES  Electronics '), ['search-case-2']);
  assert.deepEqual(found('acesconn'), ['search-case-3']);
  assert.deepEqual(found('宏致'), ['search-case-2']);
  assert.deepEqual(found('連接'), ['search-case-3']);
  assert.deepEqual(found('aces', 'all'), ['search-case-2', 'search-case-4']);
  assert.deepEqual(found('未對應欄位', 'all'), []);
});

test('dedicated name, Email and phone scopes retain their useful partial searches', () => {
  assert.deepEqual(found('ton', 'person'), ['search-case-0']);
  assert.deepEqual(found('王', 'person'), ['search-case-2']);
  assert.deepEqual(found('TONY.CHO@ACESCONN.EXAMPLE.INVALID', 'email'), ['search-case-0']);
  assert.deepEqual(found('acesconn', 'email'), ['search-case-0', 'search-case-1', 'search-case-3']);
  assert.deepEqual(found('0988981318', 'phone'), ['search-case-2']);
  assert.deepEqual(found('(02) 1234 5678 #0123', 'phone'), ['search-case-0']);
  assert.deepEqual(found('0123', 'phone'), ['search-case-0']);
  assert.deepEqual(found('Tony', 'phone'), []);
});

test('all-contact search combines words across current fields without crossing into source metadata', () => {
  assert.deepEqual(found('aces jane', 'all'), ['search-case-2']);
  assert.deepEqual(found('tony.cho@acesconn.example.invalid', 'all'), ['search-case-0']);
  assert.deepEqual(found('0988981318', 'all'), ['search-case-2']);
  assert.deepEqual(found('definitely absent', 'all'), []);
  assert.deepEqual(found('***', 'all'), []);
  assert.equal(found('  ').length, contacts.length);
});

test('directory defaults to company search, combines source filtering, and clears the visible scope chip', () => {
  const { React, create, act, loader } = createRequire(import.meta.url)('./support/renderHarness.cjs');
  const book = { contacts, accountId: 'QA', canEdit: false, loading: false, busy: false, error: null, reload: async () => {} };
  const load = loader({ mocks: { './useCompanySuppliers': { useCompanySuppliers: () => book }, './SupplierImportPanel': { SupplierImportPanel: () => null } } });
  const { SupplierDirectoryDialog } = load('src/components/material-requests/SupplierDirectoryDialog.tsx');
  let root; act(() => { root = create(React.createElement(SupplierDirectoryDialog, { open: true, onOpenChange() {} })); });
  const query = () => root.root.find(node => node.type === 'stub' && node.props['aria-label'] === '搜尋供應商聯絡資料');
  const scope = () => root.root.find(node => node.type === 'select' && node.props['aria-label'] === '搜尋範圍');
  const rows = () => root.root.findAll(node => node.type === 'stub' && node.props['data-testid'] === 'supplier-search-row');
  act(() => query().props.onChange({ target: { value: 'aces' } }));
  assert.equal(scope().props.value, 'company'); assert.equal(rows().length, 2);
  act(() => root.root.find(node => node.type === 'select' && node.props['aria-label'] === '聯絡資料來源').props.onChange({ target: { value: 'QA 來源 A' } }));
  assert.equal(rows().length, 1);
  act(() => scope().props.onChange({ target: { value: 'email' } }));
  assert.equal(rows().length, 2);
  act(() => root.root.find(node => node.type === 'stub' && node.props['aria-label'] === '清除搜尋範圍條件').props.onClick());
  assert.equal(scope().props.value, 'company'); assert.equal(rows().length, 1);
  act(() => root.root.find(node => node.type === 'stub' && node.props.children === '全部清除').props.onClick());
  assert.equal(query().props.value, ''); assert.equal(scope().props.value, 'company'); assert.equal(rows().length, contacts.length);
  act(() => root.unmount());
});
