import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';

const { loader } = createRequire(import.meta.url)('./support/renderHarness.cjs');
const load = loader();
const utils = load('src/components/material-requests/materialRequestUtils.ts');
const { buildMaterialMainGroups, filterMaterialMainGroup, searchMaterialMainGroup, getMaterialMarkKeys, sortMaterialAlternatives } = load('src/components/material-requests/materialMainRows.ts');
const search = load('src/components/material-requests/materialSearch.ts');
const { normalizeMaterialTrackingStatus, MATERIAL_TRACKING_STATUS_OPTIONS } = load('src/components/material-requests/materialTrackingStatus.ts');
const { sortMaterialTableRows } = load('src/components/material-requests/materialTableSort.ts');

const raw = (id, ref, extra = {}) => ({
  id, sourceGroupKey: ref, refGroup: ref, refDes: ref, isGroupStart: false, name: 'Synthetic resistor',
  qty: 1, level: 2, sectionName: 'Synthetic board', assemblyName: 'Synthetic module',
  manufacturer: 'TARGET', manufacturerPartNumber: `MPN-${id}`, manufacturerPartNumberAlt: '', virtualAlternative: '',
  sourcingStatus: 'Approved', lv: '', remark: '', partNumber: `PHYSICAL-${id}`, partName: '', partSpec: '10K 1% 0402',
  schematicPart: 'RES', pcbFootprint: 'R0402', trackingHistory: [], ...extra,
});
const display = records => buildMaterialMainGroups(utils.buildMaterialDataset({
  sourceFile: 'synthetic-column-filter.xlsx', sheetName: 'QA', generatedAt: '2026-11-05T00:00:00Z', recordCount: records.length, records,
}).groups);
const ids = rows => Array.from(rows, row => row.id);
const blankVirtual = record => !(record.virtualAlternative ?? '').trim();

test('a blank alternative never makes a numbered fixed main satisfy the blank virtual-number filter', () => {
  const [group] = display([
    raw('numbered-main', 'R1', { isGroupStart: true, virtualAlternative: 'VIRTUAL-MAIN' }),
    raw('blank-alternate', 'R1'),
  ]);
  const before = JSON.stringify(group);
  assert.equal(group.primaryRecord.id, 'numbered-main');
  assert.equal(filterMaterialMainGroup(group, blankVirtual), null);
  assert.equal(JSON.stringify(group), before);
});

test('a matching blank main keeps only matching alternatives and never promotes a filtered-out numbered vendor', () => {
  const [group] = display([
    raw('blank-main', 'R1', { isGroupStart: true }),
    raw('blank-alternate', 'R1'),
    raw('numbered-risk-alternate', 'R1', { virtualAlternative: 'VIRTUAL-OTHER', partUsageStatus: '禁用' }),
  ]);
  const before = JSON.stringify(group);
  const filtered = filterMaterialMainGroup(group, blankVirtual);
  assert.equal(filtered.primaryRecord, group.primaryRecord);
  assert.deepEqual(ids(filtered.records), ['blank-main', 'blank-alternate']);
  assert.deepEqual(ids(sortMaterialAlternatives(filtered.locations[0])), ['blank-main', 'blank-alternate']);
  assert.equal(filtered.key, group.key);
  assert.equal(JSON.stringify(group), before);
  assert.equal(filterMaterialMainGroup(group, () => true), group, 'a clear filter retains the original full cohort');
});

test('all column predicates must match the same main and the same retained alternative', () => {
  const [group] = display([
    raw('main', 'R1', { isGroupStart: true }),
    raw('keep', 'R1'),
    raw('wrong-maker', 'R1', { manufacturer: 'OTHER' }),
    raw('wrong-number', 'R1', { virtualAlternative: 'VIRTUAL', partUsageStatus: '禁用' }),
  ]);
  const filtered = filterMaterialMainGroup(group, record => blankVirtual(record) && record.manufacturer === 'TARGET');
  assert.deepEqual(ids(filtered.records), ['main', 'keep']);
  const [crossRowOnly] = display([
    raw('main-numbered', 'R2', { isGroupStart: true, virtualAlternative: 'VIRTUAL' }),
    raw('other-blank', 'R2', { manufacturer: 'OTHER' }),
  ]);
  assert.equal(filterMaterialMainGroup(crossRowOnly, record => blankVirtual(record) && record.manufacturer === 'TARGET'), null);
});

function mergedLocations() {
  return display([
    raw('source-A', 'R1', { isGroupStart: true, qty: 2, manufacturer: 'ORIGINAL', pcbFootprint: '', schematicPart: '' }),
    raw('selected-A', 'R1', { qty: 2, manufacturerPartNumber: 'SHARED-MPN', partNumber: 'SHARED-PHYSICAL' }),
    raw('source-B', 'R2', { isGroupStart: true, qty: 3, manufacturer: 'ORIGINAL', pcbFootprint: '', schematicPart: '' }),
    raw('selected-B', 'R2', { qty: 3, manufacturerPartNumber: 'SHARED-MPN', partNumber: 'SHARED-PHYSICAL' }),
  ]);
}

test('filtering merged locations recalculates refs and quantity while retaining the source mark identity', () => {
  const [group] = mergedLocations();
  assert.equal(group.locations.length, 2);
  const before = JSON.stringify(group);
  const filtered = filterMaterialMainGroup(group, (record, location) => location.displayRef === 'R1' && record.manufacturer === 'TARGET');
  assert.equal(filtered.key, group.key);
  assert.equal(filtered.displayRef, 'R1');
  assert.equal(String(filtered.qty), '2');
  assert.equal(filtered.locations.length, 1);
  assert.deepEqual(ids(filtered.records), ['selected-A']);
  assert.equal(filtered.locations[0].sourcePrimaryRecord, group.locations[0].sourcePrimaryRecord);
  assert.deepEqual(Array.from(getMaterialMarkKeys(filtered)), ['record::source-A']);
  assert.equal(JSON.stringify(group), before);
});

// Execute the real page's cache, predicates and row/export projections together.
// Only React's memo/callback containers are replaced with direct evaluation.
const pageSource = await readFile(new URL('../src/components/material-requests/MaterialRequestPage.tsx', import.meta.url), 'utf8');
const pageAst = ts.createSourceFile('MaterialRequestPage.tsx', pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const pageFunction = pageAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'MaterialRequestPage');
function variable(name) {
  let match;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(pageAst) === name) match = node;
    if (!match) ts.forEachChild(node, visit);
  }
  visit(['COLUMN_FILTER_LABELS', 'EMPTY_COLUMN_FILTERS', 'FILTER_KEYS'].includes(name) ? pageAst : pageFunction);
  assert.ok(match, `The production ${name} projection must remain under test`);
  return `const ${match.getText(pageAst)};`;
}
const helperNames = ['parseSearchTokens', 'splitRefDesignators', 'getUniqueMpnCountForRecords', 'getUniqueMpnCount', 'getRecordColumnValues',
  'normalizeFilterValue', 'uniqueNormalizedValues', 'createCachedColumnValues', 'normalizeColumnFilterSelection',
  'normalizeTrackingWorkflowStatus', 'getTrackingWorkflowStatus', 'inferFilterOptionTone', 'buildExcelFilterOptions',
  'getTrackingStatusDisplayLabel', 'buildTrackingStatusFilterOptions'];
const helpers = helperNames.map(name => {
  const match = pageAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(match, `Production helper ${name} is required`);
  return match.getText(pageAst);
}).join('\n');
const projections = ['searchTokens', 'hasActiveColumnFilters', 'groupRuntimeIndex', 'columnFilterSets', 'matchesRecordSearch', 'matchesSearch',
  'matchesAvailability', 'markedGroupKeySet', 'markedFilterSet', 'markedLocationFilterSet', 'matchesMarkedState', 'getMatchingGroup',
  'searchAvailabilityGroups', 'getColumnFilterOptions', 'filteredGroups', 'filteredMarkKeysByGroup', 'toggleMarkedGroup',
  'orderedRecordRows', 'visibleGroups', 'visibleGroupRows', 'createExportSnapshot'];
const compiled = ts.transpileModule([
  variable('COLUMN_FILTER_LABELS'), variable('EMPTY_COLUMN_FILTERS'), variable('FILTER_KEYS'), helpers,
  'columnFilters = { ...EMPTY_COLUMN_FILTERS, ...columnFilters };',
  ...projections.map(variable),
  'return { groupRuntimeIndex, getMatchingGroup, getColumnFilterOptions, filteredGroups, filteredMarkKeysByGroup, toggleMarkedGroup, orderedRecordRows, visibleGroupRows, snapshot: () => createExportSnapshot(false) };',
].join('\n'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function pagePipeline(displayGroups, { filters = {}, query = '', searchColumn = 'all', showMarkedOnly = false, markedKeys = [] } = {}) {
  const markWrites = [];
  const bindings = {
    ...utils, ...search, normalizeMaterialTrackingStatus, MATERIAL_TRACKING_STATUS_OPTIONS, sortMaterialTableRows,
    filterMaterialMainGroup, searchMaterialMainGroup, getMaterialMarkKeys, getSortedAlternatives: sortMaterialAlternatives,
    displayGroups, columnFilters: filters, deferredQuery: query, searchColumn, availability: 'all',
    showMarkedOnly, personalMarks: { keys: new Set(markedKeys), toggle: keys => markWrites.push(Array.from(keys)) },
    markKeysByGroup: new Map(displayGroups.map(group => [group.key, getMaterialMarkKeys(group)])),
    sortMode: 'reference', columnSort: null,
    page: 1, pageSize: 25, isFullDatasetLoaded: true, REF_COLLATOR: new Intl.Collator(undefined, { numeric: true }),
    useMemo: fn => fn(), useCallback: fn => fn,
    getBestTrackingRecord: (_records, fallback) => fallback,
    getMaterialSpecDocuments: () => [], getTrackingRequestMeta: () => ({ ticket: '', url: '' }),
    getGroupItemValue: (_group, fallback) => fallback,
    activeFilterChips: [{ label: 'Synthetic active column filter' }], sortLabel: 'Ref', user: { displayName: 'Synthetic tester' },
    activeWorkspace: { name: 'Synthetic BOM' }, dataset: { meta: { sheetName: 'QA', sourceFile: 'synthetic.xlsx' } },
    getMaterialExportScopeLabel: labels => labels.join(' · '), setExportSnapshot() {}, setExportProgress() {}, setExportDialogOpen() {},
    toast() {},
  };
  return { ...new Function(...Object.keys(bindings), compiled)(...Object.values(bindings)), markWrites };
}

test('the actual page cache and matching-group predicate exclude numbered mains and nonmatching alternatives for blank virtual PN', () => {
  const groups = display([
    raw('numbered-main', 'R1', { isGroupStart: true, virtualAlternative: 'VIRTUAL-MAIN' }), raw('blank-alt', 'R1'),
    raw('blank-main', 'R2', { isGroupStart: true }), raw('blank-keep', 'R2'),
    raw('numbered-risk-alt', 'R2', { virtualAlternative: 'VIRTUAL-OTHER', partUsageStatus: '禁用' }),
  ]);
  const result = pagePipeline(groups, { filters: { virtualAlternative: ['(空白)'] } });
  assert.equal(result.filteredGroups.length, 1);
  assert.equal(result.filteredGroups[0].primaryRecord.id, 'blank-main');
  assert.deepEqual(ids(result.filteredGroups[0].records), ['blank-main', 'blank-keep']);
  assert.deepEqual(result.orderedRecordRows.map(row => row.record.id), ['blank-main', 'blank-keep']);
  for (const row of result.visibleGroupRows) {
    assert.deepEqual(ids(row.matchingRecords), ['blank-main', 'blank-keep']);
    assert.ok(row.locations.every(location => location.records.every(blankVirtual)));
  }
});

test('the actual physical-PN cache does not mistake a blank footprint or symbol for a blank physical number', () => {
  const groups = display([
    raw('has-number-blank-cad', 'R1', { isGroupStart: true, schematicPart: '', pcbFootprint: '' }),
    raw('no-number', 'R2', { isGroupStart: true, partNumber: '', schematicPart: 'RES', pcbFootprint: 'R0402' }),
  ]);
  const result = pagePipeline(groups, { filters: { internal: ['(空白)'] } });
  assert.deepEqual(result.filteredGroups.map(group => group.primaryRecord.id), ['no-number']);
  assert.deepEqual(Array.from(result.groupRuntimeIndex.recordColumnsByRecordId.get('has-number-blank-cad').internal.raw), ['PHYSICAL-has-number-blank-cad']);
});

test('real page AND column predicates and field-specific search use one row cohort through expansion and export', () => {
  const groups = display([
    raw('main', 'R1', { isGroupStart: true, name: 'RES 10K' }), raw('keep', 'R1', { name: 'RES 10K' }),
    raw('wrong-maker', 'R1', { manufacturer: 'OTHER', name: 'RES 10K' }),
    raw('wrong-name', 'R1', { name: 'CAP 1uF' }),
    raw('wrong-number', 'R1', { virtualAlternative: 'VIRTUAL', partUsageStatus: '禁用', name: 'RES 10K' }),
  ]);
  const result = pagePipeline(groups, { filters: { virtualAlternative: ['(空白)'], manufacturer: ['TARGET'] }, searchColumn: 'material', query: 'RES' });
  const cohort = ['main', 'keep'];
  assert.deepEqual(ids(result.filteredGroups[0].records), cohort);
  assert.deepEqual(result.orderedRecordRows.map(row => row.record.id), cohort);
  const expansion = result.visibleGroupRows.flatMap(row => row.locations.flatMap(location => Array.from(sortMaterialAlternatives(location))));
  assert.deepEqual(ids(expansion), cohort, 'desktop and mobile expansion receive only scoped location records');
  assert.deepEqual(result.snapshot().rows.map(row => row.manufacturerPartNumber), ['MPN-main', 'MPN-keep']);
});

test('merged refs, per-location quantities, mark provenance and actual export rows stay in the same filtered cohort', () => {
  const groups = mergedLocations();
  const before = JSON.stringify(groups);
  const result = pagePipeline(groups, { filters: { virtualAlternative: ['(空白)'], manufacturer: ['TARGET'], qty: ['2'] } });
  assert.equal(result.filteredGroups.length, 1);
  const [group] = result.filteredGroups;
  assert.equal(group.key, groups[0].key);
  assert.equal(group.displayRef, 'R1');
  assert.equal(String(group.qty), '2');
  assert.deepEqual(ids(group.records), ['selected-A']);
  assert.deepEqual(Array.from(getMaterialMarkKeys(group)), ['record::source-A']);
  const [exported] = result.snapshot().rows;
  assert.equal(result.snapshot().rows.length, 1);
  assert.equal(exported.refDes, 'R1');
  assert.equal(exported.qty, '2');
  assert.equal(exported.manufacturerPartNumber, 'SHARED-MPN');
  assert.equal(exported.tx, '');
  assert.equal(JSON.stringify(groups), before);
});

test('an explicitly empty column selection produces no display or export rows, and clearing it restores the full cohort', () => {
  const groups = display([raw('main', 'R1', { isGroupStart: true }), raw('alt', 'R1')]);
  const empty = pagePipeline(groups, { filters: { virtualAlternative: [] } });
  assert.equal(empty.filteredGroups.length, 0);
  assert.equal(empty.orderedRecordRows.length, 0);
  assert.equal(empty.snapshot(), null);
  const restored = pagePipeline(groups);
  assert.deepEqual(restored.orderedRecordRows.map(row => row.record.id), ['main', 'alt']);
});

test('column facets ignore only their own selection and retain the other column predicates', () => {
  const groups = display([
    raw('numbered-main', 'R1', { isGroupStart: true, virtualAlternative: 'VIRTUAL-MAIN' }), raw('blank-alt', 'R1'),
    raw('other-blank-main', 'R2', { isGroupStart: true }),
    raw('selected-blank-main', 'R3', { isGroupStart: true }),
  ]);
  const result = pagePipeline(groups, { filters: { virtualAlternative: ['(空白)'], refDes: ['R3'] } });
  assert.deepEqual(result.getColumnFilterOptions('virtualAlternative').map(({ value, count }) => ({ value, count })),
    [{ value: '(空白)', count: 1 }], 'ignoring virtual-number selection still respects Ref R3');
  assert.deepEqual(result.getColumnFilterOptions('refDes').map(({ value, count }) => ({ value, count })),
    [{ value: 'R2', count: 1 }, { value: 'R3', count: 1 }], 'ignoring Ref does not admit a numbered main through its blank alternative');
  assert.deepEqual(result.orderedRecordRows.map(row => row.record.id), ['selected-blank-main']);
});

test('facets count only the retained merged locations and use their per-location quantity', () => {
  const result = pagePipeline(mergedLocations(), { filters: { manufacturer: ['TARGET'], refDes: ['R1'] } });
  assert.deepEqual(result.getColumnFilterOptions('qty').map(({ value, count }) => ({ value, count })), [{ value: '2', count: 1 }]);
  assert.deepEqual(result.getColumnFilterOptions('refDes').map(({ value, count }) => ({ value, count })),
    [{ value: 'R1', count: 1 }, { value: 'R2', count: 1 }]);
});

test('a star on hidden merged location R2 does not make filtered unmarked R1 appear in marked-only rows or facets', () => {
  const result = pagePipeline(mergedLocations(), {
    filters: { refDes: ['R1'] }, showMarkedOnly: true, markedKeys: ['record::source-B'],
  });
  assert.equal(result.filteredGroups.length, 0);
  assert.equal(result.orderedRecordRows.length, 0);
  assert.equal(result.snapshot(), null);
  assert.deepEqual(result.getColumnFilterOptions('qty'), []);
  assert.deepEqual(result.getColumnFilterOptions('refDes').map(({ value, count }) => ({ value, count })), [{ value: 'R2', count: 1 }]);
});

test('toggling a filtered merged R1 row writes only the original source-A star identity', () => {
  const groups = mergedLocations();
  const result = pagePipeline(groups, { filters: { refDes: ['R1'] } });
  const [group] = result.filteredGroups;
  assert.deepEqual(Array.from(result.filteredMarkKeysByGroup.get(group.key)), ['record::source-A']);
  result.toggleMarkedGroup(group.key);
  assert.deepEqual(result.markWrites, [['record::source-A']], 'the hidden source-B location must not be marked or unmarked');
  const markedOnly = pagePipeline(groups, { filters: { refDes: ['R1'] }, showMarkedOnly: true, markedKeys: ['record::source-A'] });
  assert.deepEqual(markedOnly.orderedRecordRows.map(row => row.record.id), ['selected-A', 'source-A']);
  assert.equal(markedOnly.filteredGroups[0].displayRef, 'R1');
});


function alternativeSearchFixture() {
  return display([
    raw('main', 'R1', { isGroupStart: true, virtualAlternative: 'VIRTUAL-MAIN', manufacturer: 'Primary Corp' }),
    raw('hit', 'R1', { manufacturer: 'AlternateVendor', manufacturerPartNumber: 'ALT-0482-XYZ', partNumber: 'COMPANY-829', virtualAlternative: 'VIRTUAL-ALT', note: 'thermal approval' }),
    raw('unrelated', 'R1', { manufacturer: 'OtherVendor' }),
  ]);
}

test('alternate MPN, vendor, company number and Note searches retain the fixed main only as context and export only matches', () => {
  const groups = alternativeSearchFixture();
  const original = JSON.stringify(groups);
  for (const query of ['ALT-0482', 'alternatevendor', 'COMPANY-829', 'VIRTUAL-ALT', 'thermal approval']) {
    const result = pagePipeline(groups, { query });
    assert.equal(result.filteredGroups.length, 1, query);
    const group = result.filteredGroups[0];
    assert.equal(group.primaryRecord.id, 'main');
    assert.deepEqual(ids(group.records), ['main', 'hit']);
    assert.deepEqual(Array.from(group.searchMatchIds), ['hit']);
    assert.equal(result.visibleGroupRows[0].searchAlternativeCount, 1);
    assert.deepEqual(ids(result.visibleGroupRows[0].secondaryAlternatives), ['hit']);
    assert.deepEqual(result.snapshot().rows.map(row => row.manufacturerPartNumber), ['ALT-0482-XYZ']);
  }
  assert.equal(JSON.stringify(groups), original, 'search never mutates the source BOM');
  assert.deepEqual(pagePipeline(groups).orderedRecordRows.map(row => row.record.id), ['main', 'hit', 'unrelated']);
});

test('alternate search never bypasses the fixed-main blank virtual-PN rule or combines tokens from different vendors', () => {
  const groups = alternativeSearchFixture();
  assert.equal(pagePipeline(groups, { query: 'ALT-0482', filters: { virtualAlternative: ['(空白)'] } }).filteredGroups.length, 0);
  assert.equal(pagePipeline(groups, { query: 'AlternateVendor OtherVendor' }).filteredGroups.length, 0);
  assert.deepEqual(pagePipeline(groups, { query: 'alternatevendor', searchColumn: 'manufacturer' }).orderedRecordRows.map(row => row.record.id), ['hit']);
  assert.equal(pagePipeline(groups, { query: 'ALT-0482', searchColumn: 'manufacturer' }).filteredGroups.length, 0);
});

test('alternate-only matches in merged locations keep the matching location refs and quantities', () => {
  const groups = display([
    raw('main-A', 'R1', { isGroupStart: true, qty: 2, manufacturerPartNumber: 'SHARED', partNumber: 'PHYSICAL' }),
    raw('alt-A', 'R1', { qty: 2, manufacturerPartNumber: 'UNIQUE-ALT-A' }),
    raw('main-B', 'R2', { isGroupStart: true, qty: 3, manufacturerPartNumber: 'SHARED', partNumber: 'PHYSICAL' }),
    raw('alt-B', 'R2', { qty: 3, manufacturerPartNumber: 'UNIQUE-ALT-B' }),
  ]);
  assert.equal(groups.length, 1);
  const result = pagePipeline(groups, { query: 'UNIQUE-ALT-B' });
  const group = result.filteredGroups[0];
  assert.equal(group.primaryRecord.id, 'main-B');
  assert.equal(group.displayRef, 'R2');
  assert.equal(String(group.qty), '3');
  assert.deepEqual(ids(group.records), ['main-B', 'alt-B']);
  assert.deepEqual(Array.from(getMaterialMarkKeys(group)), ['record::main-B']);
  assert.equal(result.snapshot().rows[0].refDes, 'R2');
  assert.equal(result.snapshot().rows[0].qty, '3');
});

test('exact reference search stays exact while an MPN shaped like a designator remains searchable', () => {
  const groups = display([
    raw('main', 'R1', { isGroupStart: true }),
    raw('alternate', 'R1', { manufacturerPartNumber: 'ABC123' }),
    raw('R10', 'R10', { isGroupStart: true }), raw('PR1', 'PR1', { isGroupStart: true }),
  ]);
  assert.deepEqual(pagePipeline(groups, { query: 'R1' }).filteredGroups.map(group => group.displayRef), ['R1']);
  assert.deepEqual(pagePipeline(groups, { query: 'abc123' }).orderedRecordRows.map(row => row.record.id), ['alternate']);
});
