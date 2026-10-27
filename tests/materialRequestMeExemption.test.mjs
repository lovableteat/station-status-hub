import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildMaterialDataset, isMeManufacturedRecord } from '../src/components/material-requests/materialRequestUtils.ts';
import { buildPendingApplications } from '../src/components/material-requests/materialRequestPresentation.ts';
import { buildVendorMailSections } from '../src/components/material-requests/materialRequestExport.ts';
const seed = JSON.parse(await readFile(new URL('../src/data/materialRequestSeed.json', import.meta.url), 'utf8'));
const record = (id, refDes, extra = {}) => ({ ...seed.records[0], id, sourceGroupKey: id, isGroupStart: true, refDes, refGroup: refDes,
  name: 'Part ' + id, partNumber: '', virtualAlternative: '', manufacturer: 'Example', manufacturerPartNumber: id,
  remark: 'Part/Symbol', trackingStatus: '已完成', trackingNote: '保留人工追蹤', trackingHistory: [], ...extra });
const dataset = records => buildMaterialDataset({ ...seed, records, recordCount: records.length });

test('only an actual ME reference is exempt; names, ME1 and mixed electrical references are not', () => {
  for (const refDes of ['ME', ' me ', 'ＭＥ']) assert.equal(isMeManufacturedRecord({ refDes, refGroup: '' }), true, refDes);
  for (const refDes of ['ME1', 'MEM1', 'R1', 'ME, R1', 'MECHANICAL']) assert.equal(isMeManufacturedRecord({ refDes, refGroup: 'ME' }), false, refDes);
  assert.equal(isMeManufacturedRecord({ refDes: '', refGroup: 'ME' }), true);
  assert.equal(isMeManufacturedRecord({ refDes: 'R1', refGroup: 'R1', name: 'ME COVER' }), false);
});

test('ME records stay in the BOM with their original metadata but leave application counts, lists and mail', () => {
  const input = [record('cover', 'ME'), record('screw', 'ME'), record('resistor', 'R1')];
  const original = structuredClone(input);
  const result = dataset(input);
  assert.deepEqual(input, original);
  assert.equal(result.records.length, 3);
  const me = result.records.filter(row => row.refDes === 'ME');
  assert.ok(me.every(row => row.applicationExempt && !row.needsApplication));
  assert.ok(me.every(row => row.trackingStatus === '已完成' && row.trackingNote === '保留人工追蹤' && !row.isReady));
  assert.equal(result.stats.pendingGroups, 1);
  assert.equal(result.stats.pendingRecords, 1);
  assert.ok(result.groups.filter(group => group.records.every(row => row.applicationExempt)).every(group => group.pendingCount === 0));
  for (const includeAlternates of [false, true]) assert.deepEqual(buildPendingApplications(result.groups, { includeAlternates }).map(item => item.record.id), ['resistor']);
  assert.deepEqual(buildVendorMailSections(result.groups, 'BOM').flatMap(section => section.items).map(item => item.manufacturerPartNumber), ['resistor']);
});

test('an exempt ME row does not hide a normal missing-number row in the same source group', () => {
  const result = dataset([record('me', 'ME', { sourceGroupKey: 'shared' }), record('electrical', 'R1', { sourceGroupKey: 'shared', isGroupStart: false })]);
  assert.equal(result.records.find(row => row.id === 'electrical').needsApplication, true);
  assert.ok(buildPendingApplications(result.groups).some(item => item.record.id === 'electrical'));
});
