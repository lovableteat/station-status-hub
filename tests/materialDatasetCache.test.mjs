import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const { loader } = createRequire(import.meta.url)('./support/renderHarness.cjs');
const { buildMaterialDataset } = loader()('src/components/material-requests/materialRequestUtils.ts');
const record = (id, overrides = {}) => ({
  id, sectionName: 'Board', assemblyName: 'Module', level: 1, name: 'Resistor', qty: 1,
  refDes: id, refGroup: id, manufacturerPartNumber: `MPN-${id}`, manufacturerPartNumberAlt: '',
  manufacturer: 'Maker', sourcingStatus: 'Approved', lv: '', remark: '', partNumber: `P-${id}`,
  partName: '', partSpec: '', schematicPart: '', pcbFootprint: '', ...overrides,
});
const payload = records => ({ sourceFile: 'cache.xlsx', sheetName: 'BOM', generatedAt: '', recordCount: records.length, records });

test('a caller-owned cache reuses unchanged rows while Note and material edits refresh derived data', () => {
  const cache = new WeakMap();
  const groupCache = new Map();
  const original = [record('R1', { note: 'old-note' }), record('R2')];
  const first = buildMaterialDataset(payload(original), cache, groupCache);
  const noteRows = [{ ...original[0], note: 'new-note' }, original[1]];
  const second = buildMaterialDataset(payload(noteRows), cache, groupCache);

  assert.notEqual(second.records[0], first.records[0]);
  assert.equal(second.records[1], first.records[1]);
  assert.equal(second.records[0].note, 'new-note');
  assert.match(second.records[0].searchText, /new-note/);
  assert.doesNotMatch(second.records[0].searchText, /old-note/);
  const groupFor = (dataset, id) => dataset.groups.find(group => group.records[0].id === id);
  assert.notEqual(groupFor(second, 'R1'), groupFor(first, 'R1'));
  assert.equal(groupFor(second, 'R2'), groupFor(first, 'R2'));
  assert.match(groupFor(second, 'R1').searchText, /new-note/);

  const editedRows = [noteRows[0], { ...original[1], partNumber: 'UPDATED-PART', pcbFootprint: 'R0402', sourcingStatus: 'Obsolete' }];
  const third = buildMaterialDataset(payload(editedRows), cache, groupCache);
  assert.equal(third.records[0], second.records[0]);
  assert.notEqual(third.records[1], second.records[1]);
  assert.equal(third.records[1].partNumber, 'UPDATED-PART');
  assert.equal(third.records[1].isRisk, true);
  assert.match(third.records[1].searchText, /updated-part/);
  assert.equal(groupFor(third, 'R1'), groupFor(second, 'R1'));
  assert.notEqual(groupFor(third, 'R2'), groupFor(second, 'R2'));
  assert.equal(groupFor(third, 'R2').footprint, 'R0402');
  assert.equal(original[0].note, 'old-note');
  assert.equal(original[1].partNumber, 'P-R2');

  const removed = buildMaterialDataset(payload([editedRows[0]]), cache, groupCache);
  assert.equal(removed.groups.length, 1);
  assert.equal(removed.groups[0], groupFor(third, 'R1'));
  assert.equal(groupCache.size, 1);
  assert.equal(groupCache.has(groupFor(third, 'R2').key), false);
});

test('the default dataset builder refreshes callers that mutate raw rows in place', () => {
  const source = payload([record('R1', { note: 'old-note' })]);
  const first = buildMaterialDataset(source);
  source.records[0].note = 'mutated-note';
  const second = buildMaterialDataset(source);
  assert.notEqual(second.records[0], first.records[0]);
  assert.equal(second.records[0].note, 'mutated-note');
  assert.match(second.records[0].searchText, /mutated-note/);
});

test('cached groups refresh when their ordered member records change', () => {
  const cache = new WeakMap();
  const groupCache = new Map();
  const rows = [record('vendor-a'), record('vendor-b')].map(row => ({ ...row, refDes: 'R1', refGroup: 'R1' }));
  const first = buildMaterialDataset(payload(rows), cache, groupCache);
  const reordered = buildMaterialDataset(payload([rows[1], rows[0]]), cache, groupCache);
  assert.notEqual(reordered.groups[0], first.groups[0]);
  assert.deepEqual([...reordered.groups[0].records.map(row => row.id)], ['vendor-b', 'vendor-a']);
  const removed = buildMaterialDataset(payload([rows[1]]), cache, groupCache);
  assert.notEqual(removed.groups[0], reordered.groups[0]);
  assert.equal(removed.groups[0].totalCount, 1);
});
