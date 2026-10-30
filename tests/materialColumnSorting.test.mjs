import assert from 'node:assert/strict';
import test from 'node:test';
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
