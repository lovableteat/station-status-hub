import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const { React, create, act, loader } = createRequire(import.meta.url)('../support/renderHarness.cjs');

async function setup() {
  const load = loader();
  const { PcbObjectsList } = load('src/components/pcb-designer/PcbObjectsList.tsx');
  const selected = [];
  const workspace = { activeProject: { id: 'board', components: [
    { instanceId: 'u1', reference: 'U1', name: '控制器', layer: 'top', locked: true, modelAssetId: 'model' },
    { instanceId: 'c2', reference: 'C2', name: '電容', layer: 'bottom', locked: false },
  ], keepouts: [{ id: 'k1', name: '螺絲孔禁制區' }], measurements: [{ id: 'm1', x1: 0, y1: 0, x2: 3, y2: 4 }] },
  centerObject: selection => selected.push(selection) };
  let props = { workspace }, root;
  await act(async () => { root = create(React.createElement(PcbObjectsList, props)); });
  return { root, selected,
    rows: () => root.root.findAll(node => node.type === 'tr' && node.props['data-object-id']),
    input: () => root.root.findByProps({ 'aria-label': '搜尋物件' }),
    filter: label => root.root.findByProps({ 'aria-label': label }),
    change: async (label, value) => act(async () => root.root.findByProps({ 'aria-label': label }).props.onChange({ currentTarget: { value } })),
    click: async label => act(async () => root.root.findByProps({ 'aria-label': label }).props.onClick()),
    rerender: async patch => { props = { ...props, ...patch }; await act(async () => root.update(React.createElement(PcbObjectsList, props))); },
    close: () => act(async () => root.unmount()) };
}

test('objects list shows each kind and component layer/lock/model; row click selects and centres its own object', async () => {
  const s = await setup();
  try {
    assert.deepEqual(s.rows().map(row => row.props['data-object-id']), ['u1', 'c2', 'k1', 'm1']);
    const rendered = JSON.stringify(s.root.toJSON());
    for (const label of ['控制器', 'Top', 'Bottom', '鎖定', '3D', '禁制區', '量測', '不分層']) assert.ok(rendered.includes(label), label);
    await act(async () => s.rows()[2].props.onClick());
    assert.deepEqual(JSON.parse(JSON.stringify(s.selected)), [{ kind: 'keepout', id: 'k1' }]);
    assert.equal(s.root.root.findAllByType('th').length, 3);
  } finally { await s.close(); }
});

test('search, layer and kind combine with reversible chips; zero results retain the table skeleton', async () => {
  const s = await setup();
  try {
    await s.change('搜尋物件', 'u1');
    assert.deepEqual(s.rows().map(row => row.props['data-object-id']), ['u1']);
    await s.change('物件層', 'bottom');
    await s.change('物件類別', 'component');
    assert.equal(s.rows().length, 0);
    assert.equal(s.root.root.findAllByType('th').length, 3);
    assert.match(JSON.stringify(s.root.toJSON()), /目前篩選條件沒有符合的物件/);
    await s.click('清除搜尋：u1');
    assert.deepEqual(s.rows().map(row => row.props['data-object-id']), ['c2']);
    await s.click('清除層：Bottom');
    assert.equal(s.rows().length, 2);
    await s.click('全部清除物件篩選');
    assert.equal(s.rows().length, 4);
    assert.equal(s.filter('物件類別').props.value, 'all');
    await s.change('搜尋物件', '螺絲');
    assert.deepEqual(s.rows().map(row => row.props['data-object-id']), ['k1']);
  } finally { await s.close(); }
});

test('unlayered objects remain in layer filters; drill-in hiding keeps filters and returning restores them', async () => {
  const s = await setup();
  try {
    await s.change('物件層', 'top');
    assert.deepEqual(s.rows().map(row => row.props['data-object-id']), ['u1', 'k1', 'm1']);
    await s.change('物件類別', 'measurement');
    await s.rerender({ hidden: true });
    assert.equal(s.root.root.findByProps({ 'data-testid': 'pcb-objects-list' }).props.hidden, true);
    await s.rerender({ hidden: false });
    assert.equal(s.filter('物件層').props.value, 'top');
    assert.equal(s.filter('物件類別').props.value, 'measurement');
    assert.deepEqual(s.rows().map(row => row.props['data-object-id']), ['m1']);
  } finally { await s.close(); }
});
