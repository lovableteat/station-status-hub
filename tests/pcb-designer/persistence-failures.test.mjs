import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const { React, create, act, loader, browser } = createRequire(import.meta.url)('../support/renderHarness.cjs');

for (const remote of [false, true]) test(`failed browser storage never reports a durable local save (cloud=${remote})`, async () => {
  const window = browser();
  const load = loader({ window });
  const { PcbLocalRepository } = load('src/components/pcb-designer/core/storage.ts');
  const repository = new PcbLocalRepository(window.localStorage);
  const initial = repository.load('synthetic');
  const state = { ...initial, updatedAt: '2099-01-01T00:00:00.000Z' };
  window.localStorage.setItem = () => { throw new Error('quota'); };
  const { usePcbPersistence } = load('src/components/pcb-designer/hooks/usePcbPersistence.ts');
  const remoteClient = remote ? { save: async () => false } : null;
  let value, root;
  function Harness() { value = usePcbPersistence({ state, storage: window.localStorage,
    initialSavedRevision: initial.updatedAt, editor: { userId: 'synthetic' }, recoveryClientId: 'test',
    remoteClient, allowRemoteSync: remote }); return null; }
  await act(async () => { root = create(React.createElement(Harness)); });
  try {
    await act(async () => assert.equal(await value.saveNow(), false));
    assert.equal(value.hasUnsavedChanges, true);
    assert.equal(value.status, 'unsaved');
    assert.match(value.saveError, /記憶體|關閉/);
    assert.ok(repository.loadRecovery('synthetic', 'test'));
  } finally { await act(async () => root.unmount()); }
});
