import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const { React, create, act, loader, browser, deferred } = createRequire(import.meta.url)('../support/renderHarness.cjs');

async function setup({ localOnly = false, recovery = false } = {}) {
  const window = browser(), load = loader({ window, mocks: { '@/hooks/use-toast': { toast() {} } } });
  const { PcbLocalRepository } = load('src/components/pcb-designer/core/storage.ts');
  const { createBlankProject } = load('src/components/pcb-designer/defaults.ts');
  const repository = new PcbLocalRepository(window.localStorage);
  const a = createBlankProject('測試板 A'), b = createBlankProject('測試板 B');
  let cloud = { ...repository.load('test'), projects: [a, b], activeProjectId: a.id };
  let draft = structuredClone(cloud);
  if (recovery) { draft.projects.forEach(p => { p.description = '復原修改'; }); draft.updatedAt = '2099-01-01T00:00:00.000Z'; }
  repository.save(draft, 'test');
  if (recovery) repository.saveRecovery('test', draft, 'old', 'tab');
  let save = async () => true, calls = [], lease = null, read = async () => structuredClone(cloud);
  const client = {
    load: () => read(),
    acquireProjectLock: async ({ projectId }) => { lease = projectId; return { available: true, acquired: true, lock: null }; },
    releaseProjectLock: async id => { if (lease === id) lease = null; return true; },
    save: async snapshot => {
      calls.push(structuredClone(snapshot));
      if (!await save(snapshot)) return false;
      const project = snapshot.projects.find(p => p.id === snapshot.activeProjectId);
      assert.equal(lease, project.id, 'source lease must be held while saving');
      const old = cloud.projects.find(p => p.id === project.id);
      if (!old || old.updatedAt <= project.updatedAt) cloud.projects = [...cloud.projects.filter(p => p.id !== project.id), structuredClone(project)];
      return true;
    },
  };
  const { usePcbWorkspace } = load('src/components/pcb-designer/hooks/usePcbWorkspace.ts');
  let value, root, props = { canEdit: true, storage: window.localStorage, remoteClient: localOnly ? null : client,
    editor: { userId: 'test', username: 'Test', displayName: '測試者' }, recoveryClientId: 'tab' };
  function Harness() { value = usePcbWorkspace(props); return null; }
  await act(async () => { root = create(React.createElement(Harness)); });
  const run = async fn => { let result; await act(async () => { result = fn(); await Promise.resolve(); }); return result; };
  return { a, b, repository, load, run, calls, window, get value() { return value; }, get cloud() { return cloud; },
    read: fn => { read = fn; },
    fail: fn => { save = fn; }, setProps: async patch => { props = { ...props, ...patch }; await act(async () => root.update(React.createElement(Harness))); },
    stop: () => act(async () => root.unmount()) };
}

test('A edit → B → save → reopen A keeps the source board in the cloud', async () => {
  const s = await setup();
  try {
    await s.run(() => s.value.commitProject(p => ({ ...p, description: 'A 已修改' })));
    await s.run(() => s.value.openProject(s.b.id));
    assert.equal(s.value.activeProject.id, s.b.id);
    await s.run(() => s.value.saveNow());
    await s.run(() => s.value.openProject(s.a.id));
    assert.equal(s.cloud.projects.find(p => p.id === s.a.id).description, 'A 已修改');
    assert.equal(s.value.hasUnsavedChanges, false);
  } finally { await s.stop(); }
});

test('an edit queued in the same event as switch is saved before leaving', async () => {
  const s = await setup();
  try {
    let switching;
    await act(async () => {
      s.value.commitProject(p => ({ ...p, description: '同事件修改' }));
      switching = s.value.openProject(s.b.id);
    });
    assert.equal(await switching, true);
    assert.equal(s.cloud.projects.find(p => p.id === s.a.id).description, '同事件修改');
  } finally { await s.stop(); }
});

test('a newly leased clean B stays readonly until the latest cloud board is loaded', async () => {
  const s = await setup(), wait = deferred();
  try {
    await s.run(() => s.value.commitProject(p => ({ ...p, description: 'A修改' })));
    s.cloud.projects.find(p => p.id === s.b.id).description = '其他使用者的新內容';
    // Even a clock-ahead discarded local revision must not defeat this authoritative read.
    s.cloud.projects.find(p => p.id === s.b.id).updatedAt = '2020-01-01T00:00:00.000Z';
    s.read(() => wait.promise);
    await s.run(() => s.value.openProject(s.b.id));
    assert.equal(s.value.activeProject.id, s.b.id);
    assert.equal(s.value.canMutate, false);
    await act(async () => { wait.resolve(structuredClone(s.cloud)); });
    assert.equal(s.value.activeProject.description, '其他使用者的新內容');
    assert.equal(s.value.canMutate, true);
  } finally { await s.stop(); }
});

test('a late lease read cannot unlock B after B → A → B until the new read completes', async () => {
  const s = await setup(), stale = deferred(), fresh = deferred();
  let reads = 0;
  try {
    s.read(() => ++reads === 1 ? stale.promise : fresh.promise);
    await s.run(() => s.value.openProject(s.b.id));
    await s.run(() => s.value.openProject(s.a.id));
    await s.run(() => s.value.openProject(s.b.id));
    await act(async () => { stale.resolve(structuredClone(s.cloud)); });
    assert.equal(s.value.activeProject.id, s.b.id);
    assert.equal(s.value.canMutate, false);
    await act(async () => { fresh.resolve(structuredClone(s.cloud)); });
    assert.equal(s.value.canMutate, true);
  } finally { await s.stop(); }
});

test('an unsaved newly created board can be discarded without deleting another board or catalog', async () => {
  const s = await setup();
  try {
    await s.run(() => s.value.createProject({ name: '新板' }));
    const id = s.value.activeProject.id, library = structuredClone(s.value.data.library);
    s.fail(async () => false);
    await s.run(() => s.value.openProject(s.a.id));
    assert.equal(s.value.canDiscardProjectTransition, true);
    await s.run(() => s.value.discardProjectTransition());
    assert.equal(s.value.activeProject.id, s.a.id);
    assert.equal(s.value.data.projects.some(p => p.id === id), false);
    assert.deepEqual(s.value.data.library, library);
  } finally { await s.stop(); }
});

test('quota warning survives unmount after A saves while recovered B remains dirty', async () => {
  const s = await setup({ recovery: true });
  s.window.localStorage.setItem = () => { throw new Error('quota'); };
  await s.run(() => s.value.saveNow());
  assert.equal(s.value.hasUnsavedChanges, true);
  await s.stop();
  const event = new Event('beforeunload', { cancelable: true });
  s.window.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
});

test('failed save stays on A; cancel retains edits, retry saves then switches', async () => {
  const s = await setup();
  try {
    await s.run(() => s.value.commitProject(p => ({ ...p, description: '未儲存' })));
    s.fail(async () => false);
    await s.run(() => s.value.openProject(s.b.id));
    assert.equal(s.value.activeProject.id, s.a.id);
    assert.equal(s.value.projectTransition.status, 'failed');
    await s.run(() => s.value.cancelProjectTransition());
    assert.equal(s.value.activeProject.description, '未儲存');
    await s.run(() => s.value.openProject(s.b.id));
    s.fail(async () => true);
    await s.run(() => s.value.retryProjectTransition());
    assert.equal(s.value.activeProject.id, s.b.id);
  } finally { await s.stop(); }
});

test('a thrown cloud save is reported as a failed switch and keeps the source draft', async () => {
  const s = await setup();
  try {
    await s.run(() => s.value.commitProject(p => ({ ...p, description: '例外時保留' })));
    s.fail(async () => { throw new Error('synthetic offline'); });
    assert.equal(await s.run(() => s.value.openProject(s.b.id)), false);
    assert.equal(s.value.activeProject.id, s.a.id);
    assert.equal(s.value.projectTransition.status, 'failed');
    assert.equal(s.value.activeProject.description, '例外時保留');
  } finally { await s.stop(); }
});

test('rapid switches and edits during a save cannot replace its source snapshot', async () => {
  const s = await setup(), wait = deferred();
  try {
    await s.run(() => s.value.commitProject(p => ({ ...p, description: '確定快照' })));
    s.fail(() => wait.promise);
    let first;
    await act(async () => { first = s.value.openProject(s.b.id); });
    assert.equal(s.value.canMutate, false);
    await act(async () => { s.value.createProject({ name: '不得新增' }); s.value.commitProject(p => ({ ...p, description: '晚到修改' })); });
    assert.equal(s.value.activeProject.id, s.a.id);
    await act(async () => { wait.resolve(true); await first; });
    assert.equal(s.value.activeProject.id, s.b.id);
    assert.equal(s.value.data.projects.length, 2);
    assert.equal(s.cloud.projects.find(p => p.id === s.a.id).description, '確定快照');
  } finally { await s.stop(); }
});

test('discard restores only A; unsaved B from an old multi-board recovery stays recoverable', async () => {
  const s = await setup({ recovery: true });
  try {
    s.fail(async () => false);
    await s.run(() => s.value.openProject(s.b.id));
    await s.run(() => s.value.discardProjectTransition());
    assert.equal(s.value.activeProject.id, s.b.id);
    assert.equal(s.value.data.projects.find(p => p.id === s.a.id).description, '');
    assert.equal(s.value.activeProject.description, '復原修改');
    assert.equal(s.value.hasUnsavedChanges, true);
    assert.ok(s.repository.loadRecovery('test', 'tab'));
  } finally { await s.stop(); }
});

test('saving A does not clear another recovered board; local-only switching keeps its behavior', async () => {
  const s = await setup({ recovery: true }), local = await setup({ localOnly: true });
  try {
    await s.run(() => s.value.saveNow());
    assert.equal(s.value.hasUnsavedChanges, true);
    assert.ok(s.repository.loadRecovery('test', 'tab'));
    await local.run(() => local.value.commitProject(p => ({ ...p, description: '本機' })));
    await local.run(() => local.value.openProject(local.b.id));
    assert.equal(local.value.activeProject.id, local.b.id);
    assert.equal(local.calls.length, 0);
  } finally { await s.stop(); await local.stop(); }
});

test('lost edit permission during save leaves the draft on A', async () => {
  const s = await setup(), wait = deferred();
  try {
    await s.run(() => s.value.commitProject(p => ({ ...p, description: '保留草稿' })));
    s.fail(() => wait.promise);
    let saving;
    await act(async () => { saving = s.value.openProject(s.b.id); });
    await s.setProps({ canEdit: false });
    await act(async () => { wait.resolve(false); await saving; });
    assert.equal(s.value.activeProject.id, s.a.id);
    assert.equal(s.value.hasUnsavedChanges, true);
    assert.equal(s.value.projectTransition.status, 'failed');
  } finally { await s.stop(); }
});

test('STEP hook uses the actual reducer receipt and rejects a target from a previous board session', async () => {
  const s = await setup({ localOnly: true });
  const { BUILT_IN_COMPONENTS } = s.load('src/components/pcb-designer/defaults.ts');
  const metadata = { schemaVersion: 1, id: 'synthetic-model', fileName: 'test.step',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    dimensions: { widthMm: 10, depthMm: 8, heightMm: 2 }, calibratedDimensions: { widthMm: 10, depthMm: 8, heightMm: 2 },
    upAxis: 'z', bounds: { min: [0, 0, 0], max: [10, 8, 2] }, parts: [] };
  try {
    await s.run(() => s.value.commitProject(p => ({ ...p, components: [{ ...BUILT_IN_COMPONENTS[0],
      instanceId: 'test-component', reference: 'U1', x: 20, y: 20, rotation: 0, layer: 'top', locked: false }] })));
    const original = s.value.captureModelAssignment('test-component');
    assert.equal(await s.run(() => s.value.assignModelAsset(original, metadata)), true);
    assert.equal(s.value.activeProject.components[0].modelAssetId, metadata.id);
    const delayed = s.value.captureModelAssignment('test-component');
    await s.run(() => s.value.duplicateProject(s.a.id, true));
    assert.equal(await s.value.assignModelAsset(delayed, { ...metadata, id: 'wrong-model' }), false);
    assert.equal(s.value.activeProject.components[0].modelAssetId, metadata.id);
    await s.run(() => s.value.openProject(s.a.id));
    assert.equal(await s.value.assignModelAsset(delayed, { ...metadata, id: 'late-model' }), false);
    const beforeQueuedEdit = s.value.captureModelAssignment('test-component');
    let receipt;
    await act(async () => {
      s.value.commitProject(p => ({ ...p, description: '先排入的變更' }));
      receipt = s.value.assignModelAsset(beforeQueuedEdit, { ...metadata, id: 'queued-model' });
    });
    assert.equal(await receipt, false);
    assert.equal(s.value.activeProject.components[0].modelAssetId, metadata.id);
  } finally { await s.stop(); }
});
