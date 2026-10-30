import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { sortMaterialTableRows, restoreMaterialColumnSort } from '../src/components/material-requests/materialTableSort.ts';

test('Manufacturer sorting brings vendors from different components and alternates together before pagination', () => {
  const groups = [
    { ref: 'C1', records: [{ id: 'C1-main', manufacturer: 'ZETA' }, { id: 'C1-alt', manufacturer: 'ACES' }] },
    { ref: 'J1', records: [{ id: 'J1-main', manufacturer: 'aces' }, { id: 'J1-alt', manufacturer: 'TE' }] },
    { ref: 'U1', records: [{ id: 'U1-main', manufacturer: 'TE' }, { id: 'U1-alt', manufacturer: '' }] },
  ];
  const rows = groups.flatMap(group => group.records.map(record => ({ group, record })));
  const before = JSON.stringify(rows);
  const sorted = sortMaterialTableRows(rows, 'asc', row => row.record.manufacturer);
  assert.deepEqual(sorted.map(row => row.record.id), ['C1-alt', 'J1-main', 'J1-alt', 'U1-main', 'C1-main', 'U1-alt']);
  assert.deepEqual(sorted.slice(0, 2).map(row => row.group.ref), ['C1', 'J1']);
  assert.deepEqual(sorted.slice(2, 4).map(row => row.record.manufacturer), ['TE', 'TE']);
  assert.deepEqual(sortMaterialTableRows(rows, 'desc', row => row.record.manufacturer).map(row => row.record.id), ['C1-main', 'J1-alt', 'U1-main', 'C1-alt', 'J1-main', 'U1-alt']);
  assert.equal(JSON.stringify(rows), before, 'sorting never mutates the BOM or group relationships');
});

test('column sorting is natural, stable, normalized and leaves blanks last in both directions', () => {
  const rows = ['MPN10', ' ＭＰＮ２ ', 'mpn2', '', undefined, 'MPN1'];
  assert.deepEqual(sortMaterialTableRows(rows, 'asc', value => value), ['MPN1', ' ＭＰＮ２ ', 'mpn2', 'MPN10', '', undefined]);
  assert.deepEqual(sortMaterialTableRows([10, 2, 0, null, 1], 'asc', value => value), [0, 1, 2, 10, null]);
  assert.deepEqual(sortMaterialTableRows([10, 2, 0, null, 1], 'desc', value => value), [10, 2, 1, 0, null]);
});

test('saved column sort restores only a supported column and direction', () => {
  assert.deepEqual(restoreMaterialColumnSort({ key: 'manufacturer', direction: 'desc' }, ['manufacturer', 'mpn']), { key: 'manufacturer', direction: 'desc' });
  for (const value of [null, [], 'manufacturer', { key: 'removed', direction: 'asc' }, { key: 'manufacturer', direction: 'invalid' }]) {
    assert.equal(restoreMaterialColumnSort(value, ['manufacturer']), null);
  }
});

test('the real table header renders with no selected sort, including columns without a filter', async () => {
  const source = await readFile(new URL('../src/components/material-requests/MaterialRequestPage.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'sortDirection' && ts.isJsxExpression(node.initializer)) expression = node.initializer.expression.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(expression, 'the live ResizableHeader sort binding must be exercised');
  const direction = new Function('columnSort', 'column', 'MATERIAL_COLUMN_FILTER_KEYS', `return (${expression});`);
  const mapping = { manufacturer: 'manufacturer', actions: 'trackingStatus' };
  for (const key of ['item', 'name', 'manufacturer', 'actions', 'note']) {
    assert.equal(direction(null, { key }, mapping), undefined);
  }
  assert.equal(direction({ key: 'manufacturer', direction: 'asc' }, { key: 'manufacturer' }, mapping), 'asc');
  assert.equal(direction({ key: 'manufacturer', direction: 'desc' }, { key: 'manufacturer' }, mapping), 'desc');
  assert.equal(direction({ key: 'manufacturer', direction: 'asc' }, { key: 'item' }, mapping), undefined);
});
