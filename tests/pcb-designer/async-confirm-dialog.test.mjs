import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const { React, create, act, loader, deferred } = createRequire(import.meta.url)('../support/renderHarness.cjs');

async function setup(onConfirm) {
  const { PcbDialogs } = loader()('src/components/pcb-designer/PcbDialogs.tsx');
  let closes = 0, root;
  let props = { dialog: { kind: 'confirm', title: '刪除測試板', description: '測試確認', onConfirm },
    onClose: () => { closes++; }, onCreateProject() {}, onUpdateProject: async () => true,
    onSaveTemplate() {}, onRenameTemplate() {}, onSaveComponent() {} };
  await act(async () => { root = create(React.createElement(PcbDialogs, props)); });
  const button = label => root.root.findAll(node => node.type === 'stub' && node.props.onClick && node.children.includes(label))[0];
  return { root, button, get closes() { return closes; },
    update: async dialog => { props = { ...props, dialog }; await act(async () => root.update(React.createElement(PcbDialogs, props))); },
    close: async () => act(async () => root.unmount()) };
}

test('delete confirmation waits, rejects duplicate clicks and closing, then keeps false result visible for retry', async () => {
  const pending = deferred(); let calls = 0;
  const s = await setup(() => ++calls === 1 ? pending.promise : true);
  try {
    const confirm = s.button('刪除').props.onClick;
    await act(async () => { void confirm(); void confirm(); });
    assert.equal(calls, 1);
    assert.equal(s.closes, 0);
    assert.equal(s.button('取消').props.disabled, true);
    await act(async () => s.button('取消').props.onClick());
    assert.equal(s.closes, 0);
    await act(async () => pending.resolve(false));
    assert.equal(s.closes, 0);
    assert.match(JSON.stringify(s.root.toJSON()), /操作未完成/);
    await act(async () => s.button('刪除').props.onClick());
    assert.equal(calls, 2);
    assert.equal(s.closes, 1);
  } finally { await s.close(); }
});

test('delete rejection remains in the dialog and can be cancelled', async () => {
  const s = await setup(async () => { throw new Error('synthetic outage'); });
  try {
    await act(async () => s.button('刪除').props.onClick());
    assert.equal(s.closes, 0);
    assert.match(JSON.stringify(s.root.toJSON()), /操作未完成/);
    await act(async () => s.button('取消').props.onClick());
    assert.equal(s.closes, 1);
  } finally { await s.close(); }
});

test('late confirmation result never closes a replacement dialog', async () => {
  const pending = deferred();
  const s = await setup(() => pending.promise);
  try {
    await act(async () => { void s.button('刪除').props.onClick(); });
    await s.update({ kind: 'confirm', title: '另一個確認', description: '保留', onConfirm() {} });
    await act(async () => pending.resolve(true));
    assert.equal(s.closes, 0);
    assert.match(JSON.stringify(s.root.toJSON()), /另一個確認/);
  } finally { await s.close(); }
});

test('captured confirmation handlers cannot delete or close a replacement dialog', async () => {
  let calls = 0;
  const s = await setup(() => { calls++; });
  try {
    const confirm = s.button('刪除').props.onClick, cancel = s.button('取消').props.onClick;
    await s.update({ kind: 'confirm', title: '另一個確認', description: '保留', onConfirm() {} });
    await act(async () => { await confirm(); cancel(); });
    assert.equal(calls, 0);
    assert.equal(s.closes, 0);
  } finally { await s.close(); }
});

test('confirmation completion after unmount does not close another screen', async () => {
  const pending = deferred();
  const s = await setup(() => pending.promise);
  await act(async () => { void s.button('刪除').props.onClick(); });
  await s.close();
  await act(async () => pending.resolve(true));
  assert.equal(s.closes, 0);
});
