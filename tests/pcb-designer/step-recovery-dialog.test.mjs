import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const { React, create, act, loader, browser, deferred } = createRequire(import.meta.url)('../support/renderHarness.cjs');

const metadata = id => ({ id, fileName: `${id}.step`, calibratedDimensions: { widthMm: 10, depthMm: 8, heightMm: 2 } });
async function setup({ initialList } = {}) {
  const load = loader({ window: browser() });
  const { PcbStepRecoveryDialog } = load('src/components/pcb-designer/PcbStepRecoveryDialog.tsx');
  let loads = 0, closes = 0, calls = [], recover = async () => true, list = initialList ?? (async () => [metadata('one'), metadata('two')]);
  let props = { canEdit: true, onClose: () => closes++, loadAssets: async () => { loads++; return list(); },
    onRecover: async selected => { calls.push(selected); return recover(); } };
  let root; await act(async () => { root = create(React.createElement(PcbStepRecoveryDialog, props)); });
  const button = text => root.root.findAll(node => node.type === 'stub' && node.props.onClick && node.children.join('').includes(text)).at(-1);
  return { get loads() { return loads; }, get closes() { return closes; }, calls, root, button,
    select: async index => act(async () => root.root.findAllByType('input')[index].props.onChange({ target: { checked: true } })),
    recover: fn => { recover = fn; }, list: fn => { list = fn; },
    rerender: async patch => { props = { ...props, ...patch }; await act(async () => root.update(React.createElement(PcbStepRecoveryDialog, props))); },
    close: () => act(async () => root.unmount()) };
}

test('manual recovery starts unselected and imports only explicitly checked assets', async () => {
  const s = await setup();
  try {
    assert.equal(s.loads, 1);
    assert.equal(s.calls.length, 0);
    assert.ok(s.button('找回並同步').props.disabled);
    await s.select(1);
    await act(async () => s.button('找回並同步').props.onClick());
    assert.deepEqual(s.calls[0].map(item => item.id), ['two']);
    assert.equal(s.closes, 1);
  } finally { await s.close(); }
});

test('a load failure is visible and retry loads candidates without importing', async () => {
  const s = await setup({ initialList: async () => { throw new Error('synthetic offline'); } });
  try {
    assert.match(JSON.stringify(s.root.toJSON()), /無法讀取雲端模型/);
    assert.equal(s.calls.length, 0);
    s.list(async () => [metadata('retry')]);
    await act(async () => s.button('重試載入').props.onClick());
    assert.equal(s.loads, 2);
    assert.equal(s.root.root.findAllByType('input').length, 1);
    assert.equal(s.root.root.findAllByType('input')[0].props.checked, false);
    assert.equal(s.calls.length, 0);
  } finally { await s.close(); }
});

test('permission lost while recovery is pending cannot turn its response into success', async () => {
  const s = await setup(), wait = deferred();
  try {
    await s.select(0); s.recover(() => wait.promise);
    await act(async () => { void s.button('找回並同步').props.onClick(); });
    await s.rerender({ canEdit: false });
    await act(async () => wait.resolve(true));
    assert.equal(s.closes, 0);
    assert.match(JSON.stringify(s.root.toJSON()), /尚未同步完成/);
    assert.equal(s.root.root.findAllByType('input')[0].props.checked, true);
  } finally { await s.close(); }
});

test('failed sync keeps selection and allows retry; pending recovery blocks closing and duplicates', async () => {
  const s = await setup(), wait = deferred();
  try {
    await s.select(0); s.recover(() => wait.promise);
    await act(async () => { void s.button('找回並同步').props.onClick(); });
    assert.ok(s.button('取消').props.disabled);
    assert.equal(s.calls.length, 1);
    await act(async () => wait.resolve(false));
    assert.equal(s.closes, 0);
    assert.equal(s.root.root.findAllByType('input')[0].props.checked, true);
    assert.match(JSON.stringify(s.root.toJSON()), /尚未同步完成/);
    s.recover(async () => true);
    await act(async () => s.button('找回並同步').props.onClick());
    assert.equal(s.calls.length, 2);
    assert.equal(s.closes, 1);
  } finally { await s.close(); }
});

test('lost edit permission prevents recovery and an unmounted request cannot close a later view', async () => {
  const s = await setup(), wait = deferred();
  let closed = false;
  try {
    await s.select(0);
    await s.rerender({ canEdit: false });
    await act(async () => s.button('找回並同步').props.onClick());
    assert.equal(s.calls.length, 0);
    await s.rerender({ canEdit: true }); s.recover(() => wait.promise);
    await act(async () => { void s.button('找回並同步').props.onClick(); });
    await s.close(); closed = true;
    await act(async () => wait.resolve(true));
    assert.equal(s.closes, 0);
  } finally { if (!closed) await s.close(); }
});
