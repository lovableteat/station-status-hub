// 專案總料表 view: a hand-picked category is only sent for boards that are all loaded from their current version.
// Synthetic QA data only (public repository).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const { React, create, act, loader } = createRequire(import.meta.url)('./support/renderHarness.cjs');
const load = loader({
  window: { requestAnimationFrame: callback => { callback(); return 1; }, cancelAnimationFrame() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) },
  globals: { Blob },
  mocks: {
    './bomVersioning': { bomFileBaseName: name => String(name).replace(/\.xlsx$/i, '') },
    './materialRequestExport': { downloadBlob() {} },
  },
});
const { ProjectPartsView } = load('src/components/material-requests/ProjectPartsView.tsx');

let next = 0;
const row = (ref, overrides = {}) => ({
  id: `QA-${next++}`, sourceGroupKey: ref, refGroup: ref, refDes: ref, isGroupStart: true, level: 2, qty: 1, sectionName: 'QA', assemblyName: 'QA',
  name: `QA PART ${ref}`, manufacturer: 'QA MAKER', manufacturerPartNumber: `QA-MPN-${ref}`, manufacturerPartNumberAlt: '', virtualAlternative: '', partNumber: '', ...overrides,
});
const series = (id, name, workspaceId) => ({ id, name, current: { displayNumber: 'V1', workspace: { id: workspaceId, name, updatedAt: `${workspaceId}-stamp`, payload: { records: [], recordCount: 1 } } }, versions: [] });
const flush = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));
const pickers = root => root.root.findAll(node => node.type === 'stub' && typeof node.props.onValueChange === 'function' && ['auto', 'connector', 'ic', 'rlc', 'other'].includes(node.props.value));
const textOf = node => (typeof node === 'string' ? node : (node.children ?? []).map(textOf).join(''));
const noticeText = root => root.root.findAll(node => node.props['data-testid'] === 'project-parts-notice').map(textOf).join(' ');

test('a category change is sent with each board\'s current BOM and the rows it showed, and refused while a board loads a new version', async () => {
  const records = { 'ws-a1': [row('U1')], 'ws-b1': [row('U2', { manufacturerPartNumber: 'QA-MPN-U1' })] };
  const sent = [];
  const pending = new Set();
  const loadVersion = version => (records[version.workspace.id] ? Promise.resolve(records[version.workspace.id]) : new Promise(() => { pending.add(version.workspace.id); }));
  const onSetCategory = async (targets, category) => { sent.push({ targets, category }); return { saved: targets.reduce((sum, target) => sum + target.rows.length, 0), boards: targets.length }; };
  const props = { projectName: 'QA 專案', loadVersion, exportedBy: 'QA', compact: false, onBack() {}, onSetCategory };
  let root;
  const boards = [series('s-a', 'QA Board A.xlsx', 'ws-a1'), series('s-b', 'QA Board B.xlsx', 'ws-b1')];
  await act(async () => { root = create(React.createElement(ProjectPartsView, { ...props, series: boards })); });
  await flush();

  // Both boards in: the shared part's category goes to both BOMs with the rows' fingerprints.
  const [shared] = pickers(root);
  await act(async () => { shared.props.onValueChange('other'); });
  await flush();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].category, 'other');
  // The view runs in its own realm: compare as JSON.
  assert.equal(JSON.stringify(sent[0].targets.map(target => [target.workspace.id, target.rows.map(item => item.id)])), JSON.stringify([['ws-a1', [records['ws-a1'][0].id]], ['ws-b1', [records['ws-b1'][0].id]]]));
  assert.ok(sent[0].targets.every(target => target.rows.every(item => item.signature.includes('QA-MPN-U1'))), 'each row carries what it was shown as');
  assert.match(noticeText(root), /已寫回 2 塊板子/);

  // Board B gets a new current version: until it is loaded, nothing is sent.
  const moved = [boards[0], series('s-b', 'QA Board B.xlsx', 'ws-b2')];
  await act(async () => { root.update(React.createElement(ProjectPartsView, { ...props, series: moved })); });
  await flush();
  assert.ok(pending.has('ws-b2'), 'the new version is loading');
  await act(async () => { pickers(root)[0].props.onValueChange('ic'); });
  await flush();
  assert.equal(sent.length, 1, 'no write while a board loads its new version');
  assert.match(noticeText(root), /沒有載入好/);
  act(() => root.unmount());
});
