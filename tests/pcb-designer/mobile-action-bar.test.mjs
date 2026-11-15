import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const { React, create, act, loader, browser } = createRequire(import.meta.url)('../support/renderHarness.cjs');

/** The bar runs in the harness realm; compare plain copies. */
const plain = value => JSON.parse(JSON.stringify(value));
const ARRANGEMENT_KEYS = ['align-left', 'align-horizontal-center', 'align-right', 'align-top',
  'align-vertical-center', 'align-bottom', 'distribute-horizontal', 'distribute-vertical'];

async function render(overrides = {}) {
  const calls = { clearGroup: 0, select: [], active: [], visible: [], arranged: [] };
  const components = ['c1', 'c2', 'c3'].map(instanceId => ({ instanceId }));
  const workspace = {
    activeProject: { components }, selectedObjects: [], selection: null, canEditBoard: true, canMutate: true,
    activeLayer: 'top', visibleLayer: 'all', tool: 'select', canUndo: false, canRedo: false, documentLocked: false, drcIssues: [],
    clearObjectSelection() { calls.clearGroup++; }, selectObject(value) { calls.select.push(value); },
    setActiveLayer(layer) { calls.active.push(layer); }, setVisibleLayer(layer) { calls.visible.push(layer); },
    rotateSelected() {}, deleteSelected() {}, setTool() {}, resetView() {}, undo() {}, redo() {}, toggleDocumentLock() {},
    ...overrides,
  };
  const mocks = { '@/components/layout/mobile': { MobileToolsSheet: props => React.createElement('tools-sheet', props) } };
  const { PcbMobileActionBar } = loader({ window: browser(), mocks })('src/components/pcb-designer/PcbMobileActionBar.tsx');
  const noop = () => {};
  let root;
  await act(async () => {
    root = create(React.createElement(PcbMobileActionBar, {
      workspace, viewMode: '2d', placing: false, onViewModeChange: noop, onCancelPlacement: noop, onOpenBoards: noop,
      onOpenLibrary: noop, onOpenPanel: noop, onImportProject: noop, onExportProject: noop, onExportBomCsv: noop,
      onExportBomXlsx: noop, onExportPng: noop, onArrange: value => calls.arranged.push(value),
    }));
  });
  const buttons = () => root.root.findAllByType('button');
  const labelOf = button => button.findByType('span').props.children;
  const button = label => buttons().find(item => labelOf(item) === label);
  const sections = () => root.root.findByType('tools-sheet').props.sections;
  const item = (section, key) => sections().find(entry => entry.key === section).items.find(entry => entry.key === key);
  return { calls, buttons, labelOf, button, sections, item, close: () => act(async () => root.unmount()) };
}

test('with a selection the phone bar keeps 更多, and 取消選取 also clears the group selection', async () => {
  const view = await render({ selectedObjects: ['c1', 'c2'], selection: { kind: 'component', id: 'c1' } });
  try {
    assert.deepEqual(plain(view.buttons().map(view.labelOf)), ['屬性', '旋轉', '刪除', '取消選取', '更多']);
    await act(async () => view.button('取消選取').props.onClick());
    assert.equal(view.calls.clearGroup, 1, 'group selection cleared');
    assert.deepEqual(view.calls.select, [null], 'single selection cleared');
  } finally { await view.close(); }
});

test('更多 lists all eight arrangements, enabled by how many components are selected', async () => {
  const two = await render({ selectedObjects: ['c1', 'c2'] });
  try {
    const section = two.sections().find(entry => entry.key === 'arrange');
    assert.deepEqual(plain(section.items.map(entry => entry.key)), ARRANGEMENT_KEYS);
    assert.equal(two.item('arrange', 'align-right').disabled, false, 'two components can align');
    assert.equal(two.item('arrange', 'distribute-vertical').disabled, true, 'distribute needs three');
    two.item('arrange', 'align-bottom').onSelect();
    assert.deepEqual(two.calls.arranged, ['align-bottom']);
  } finally { await two.close(); }
  const three = await render({ selectedObjects: ['c1', 'c2', 'c3'] });
  try { assert.equal(three.item('arrange', 'distribute-horizontal').disabled, false); } finally { await three.close(); }
  const locked = await render({ selectedObjects: ['c1', 'c2', 'c3'], canEditBoard: false });
  try { assert.ok(locked.sections().find(entry => entry.key === 'arrange').items.every(entry => entry.disabled), 'read-only boards cannot arrange'); }
  finally { await locked.close(); }
});

test('switching the placement side on the phone also shows that side when only the other one is visible', async () => {
  const onlyTop = await render({ visibleLayer: 'top' });
  try {
    onlyTop.item('view', 'layer').onSelect();
    assert.deepEqual(onlyTop.calls.active, ['bottom']);
    assert.deepEqual(onlyTop.calls.visible, ['bottom'], 'new parts stay visible');
  } finally { await onlyTop.close(); }
  const all = await render({ visibleLayer: 'all' });
  try {
    all.item('view', 'layer').onSelect();
    assert.deepEqual(all.calls.visible, [], '「全部」 stays as it is');
  } finally { await all.close(); }
});
