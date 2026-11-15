import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const { React, create, act, loader, browser } = createRequire(import.meta.url)('../support/renderHarness.cjs');

async function setup() {
  const window = browser(), document = new EventTarget();
  document.visibilityState = 'visible';
  let now = 0, next = 0, writes = 0;
  const timers = new Map();
  window.setTimeout = (callback, delay) => { timers.set(++next, { callback, due: now + delay }); return next; };
  window.clearTimeout = id => timers.delete(id);
  const load = loader({ window, globals: { document } });
  const { PcbLocalRepository, PCB_STORAGE_KEY } = load('src/components/pcb-designer/core/storage.ts');
  const repository = new PcbLocalRepository(window.localStorage), initial = repository.load('test');
  const write = window.localStorage.setItem;
  window.localStorage.setItem = (key, value) => { if (key.includes(':draft:')) writes++; write(key, value); };
  let state = initial, value, root;
  const { usePcbPersistence } = load('src/components/pcb-designer/hooks/usePcbPersistence.ts');
  const editor = { userId: 'test', displayName: '測試者' };
  function Harness() { value = usePcbPersistence({ state, storage: window.localStorage, editor, recoveryClientId: 'tab' }); return null; }
  await act(async () => { root = create(React.createElement(Harness)); });
  writes = 0;
  return { window, document, repository, get value() { return value; }, get writes() { return writes; },
    raw: () => JSON.parse(window.localStorage.getItem(`${PCB_STORAGE_KEY}:draft:test:tab`) || 'null'),
    edit: async label => {
      state = { ...state, updatedAt: label, projects: state.projects.map(project => ({ ...project, name: label, updatedAt: label })) };
      await act(async () => root.update(React.createElement(Harness)));
    },
    advance: async ms => { now += ms; await act(async () => { for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.callback(); } }); },
    stop: async () => act(async () => root.unmount()),
  };
}

test('continuous edits keep a memory checkpoint and write only the latest draft after 400 ms', async () => {
  const s = await setup();
  try {
    for (let i = 0; i < 40; i++) { await s.edit(`修改${i}`); await s.advance(20); }
    assert.equal(s.writes, 0);
    assert.equal(s.repository.loadRecovery('test', 'tab').state.projects[0].name, '修改39');
    await s.advance(379); assert.equal(s.writes, 0);
    await s.advance(1); assert.equal(s.writes, 1);
    assert.equal(s.raw().state.projects[0].name, '修改39');
  } finally { await s.stop(); }
});

for (const event of ['pagehide', 'visibilitychange', 'beforeunload', 'save', 'unmount']) {
  test(`${event} flushes the latest pending recovery synchronously`, async () => {
    const s = await setup();
    try {
      await s.edit('最後一次修改');
      assert.equal(s.writes, 0);
      if (event === 'visibilitychange') { s.document.visibilityState = 'hidden'; s.document.dispatchEvent(new Event(event)); }
      else if (event === 'save') {
        let saving;
        await act(async () => { saving = s.value.saveNow(); assert.ok(s.writes > 0); });
        assert.equal(await saving, true);
      } else if (event === 'unmount') await s.stop();
      else s.window.dispatchEvent(new Event(event, { cancelable: true }));
      if (event !== 'save') assert.equal(s.raw().state.projects[0].name, '最後一次修改');
      assert.ok(s.writes > 0);
    } finally { if (event !== 'unmount') await s.stop(); }
  });
}

test('failed debounce flush preserves memory-only recovery and its warning after unmount', async () => {
  const s = await setup();
  await s.edit('磁碟不可用');
  s.window.localStorage.setItem = () => { throw new Error('quota'); };
  await s.advance(400);
  await s.stop();
  assert.equal(s.repository.loadRecovery('test', 'tab').state.projects[0].name, '磁碟不可用');
  const event = new Event('beforeunload', { cancelable: true }); s.window.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  s.repository.clearRecovery('test', 'tab');
});
