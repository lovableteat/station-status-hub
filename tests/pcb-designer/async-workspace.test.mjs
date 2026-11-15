import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const { React, create, act, loader, deferred, browser } = createRequire(import.meta.url)('../support/renderHarness.cjs');

async function setup() {
  const window = browser(), parse = deferred(), assignment = deferred();
  const asset = { metadata: { id: 'synthetic-asset', fileName: 'synthetic.step', parts: [],
    calibratedDimensions: { widthMm: 10, depthMm: 10, heightMm: 2 } }, parts: [] };
  const calls = { list: 0, imported: 0, targets: [], deleted: [], saved: 0 };
  const project = { id: 'synthetic-a', name: '測試板 A', status: 'draft', components: [{ instanceId: 'synthetic-component', locked: false }],
    keepouts: [], measurements: [], board: { width: 100, height: 80, gridSize: 1 } };
  const target = { projectId: project.id, componentId: 'synthetic-component', generation: 1 };
  const remote = { listModelAssets: async () => { calls.list++; return [asset.metadata]; }, saveModelAsset: async () => true };
  const workspace = { activeProject: project, data: { projects: [project], library: [], templates: [], updatedAt: 'synthetic' },
    remoteReady: true, remoteAccessStatus: 'ready', canMutate: true, canEdit: true, selectedObjects: [], selection: null,
    projectLock: {}, activeLayer: 'top', tool: 'select', zoom: 100, persistenceStatus: 'synced', dirtyProjectIds: [],
    saveNow: async () => { calls.saved++; return true; }, setTool() {}, importLibraryModel() { calls.imported++; },
    captureModelAssignment: () => target,
    assignModelAsset: (...args) => { calls.targets.push(args); return assignment.promise; }, deleteProject: async () => false };
  const stub = name => props => React.createElement(name, props);
  const mocks = {
    '@/components/common/recoverableLazy': { recoverableLazy: () => stub('three-canvas') },
    '@/hooks/usePermissions': { usePermissions: () => ({ canEditModule: () => true }) },
    '@/hooks/use-toast': { toast() {} }, '@/lib/utils': { cn: (...names) => names.filter(Boolean).join(' ') },
    '@/components/auth/UserContext': { useUser: () => ({ user: null }) },
    '@/integrations/supabase/client': { supabase: { schema() {} } },
    './core/accountRemoteSync.ts': { createPcbAccountRemoteClient: () => remote, isDatabaseUserId: () => false },
    './hooks/usePcbWorkspace.ts': { usePcbWorkspace: () => workspace },
    './hooks/usePcbProjectPresence.ts': { usePcbProjectPresence: () => ({ broadcastProjectSaved: async () => undefined }) },
    '../data-center/stepImport.ts': { importStepModel: () => parse.promise },
    './core/modelAssets.ts': { PCB_MODEL_FILE_ACCEPT: '.step,.stp', MAX_PCB_MODEL_FILE_BYTES: 1000,
      isStepModelFile: () => true, toPcbModelAsset: () => asset, toStepLibraryComponent: () => ({ name: 'Synthetic' }),
      getDefaultPcbModelAssetStore: () => ({ put: async () => undefined, delete: async id => { calls.deleted.push(id); } }) },
  };
  for (const [file, name] of [['PcbLeftRail', 'left-rail'], ['PcbToolbar', 'toolbar'], ['PcbCanvas', 'canvas'],
    ['PcbCollaborators', 'collaborators'], ['PcbInspector', 'inspector'], ['PcbDialogs', 'dialogs'],
    ['PcbStepModelDialog', 'step-preview'], ['PcbStepRecoveryDialog', 'step-recovery'], ['PcbResearchDialog', 'research']]) mocks[`./${file}.tsx`] = { [file]: stub(name) };
  const { PcbDesignerWorkspace } = loader({ window, mocks })('src/components/pcb-designer/PcbDesignerWorkspace.tsx');
  let root; await act(async () => { root = create(React.createElement(PcbDesignerWorkspace)); });
  return { calls, workspace, target, asset, root, parse, assignment,
    rerender: async () => act(async () => root.update(React.createElement(PcbDesignerWorkspace))),
    close: async () => act(async () => root.unmount()) };
}

test('STEP application carries its captured board generation and waits for a successful reducer receipt', async () => {
  const s = await setup(); let result, settled = false;
  try {
    await act(async () => { result = s.root.root.findByType('inspector').props.onImportModel({ name: 'synthetic.step', size: 1 }, 'synthetic-component'); result.then(() => { settled = true; }); });
    await act(async () => s.parse.resolve({}));
    assert.equal(settled, false);
    assert.equal(s.calls.targets[0][0], s.target);
    assert.equal(s.root.root.findByType('step-preview').props.asset, null);
    await act(async () => { s.assignment.resolve(true); await result; });
    assert.equal(s.root.root.findByType('step-preview').props.asset, s.asset);
  } finally { await s.close(); }
});

test('rejected STEP receipt after a board switch reports failure and never opens success preview', async () => {
  const s = await setup(); let result;
  try {
    await act(async () => { result = s.root.root.findByType('inspector').props.onImportModel({ name: 'synthetic.step', size: 1 }, 'synthetic-component'); });
    s.workspace.activeProject = { ...s.workspace.activeProject, id: 'synthetic-b' };
    await s.rerender();
    await act(async () => s.parse.resolve({}));
    await act(async () => { s.assignment.resolve(false); await assert.rejects(result, /未套用/); });
    assert.equal(s.root.root.findByType('step-preview').props.asset, null);
    assert.deepEqual(s.calls.deleted, ['synthetic-asset']);
  } finally { await s.close(); }
});

test('mounting a workspace does not resurrect or publish a deliberately removed STEP library record', async () => {
  const s = await setup();
  try {
    await s.rerender();
    assert.equal(s.calls.list, 0);
    assert.equal(s.calls.imported, 0);
    assert.equal(s.calls.saved, 0);
  } finally { await s.close(); }
});

test('delete callback exposes the failed remote result to its confirmation dialog', async () => {
  const s = await setup();
  try {
    await act(async () => s.root.root.findByType('left-rail').props.onDeleteProject(s.workspace.activeProject));
    assert.equal(await s.root.root.findByType('dialogs').props.dialog.onConfirm(), false);
  } finally { await s.close(); }
});

test('manual STEP recovery saves only after chosen records are adopted and retry does not duplicate them', async () => {
  const s = await setup();
  try {
    assert.equal(s.calls.list, 0);
    await act(async () => s.root.root.findByType('left-rail').props.onRecoverCloudModels());
    const picker = s.root.root.findByType('step-recovery');
    const candidates = await picker.props.loadAssets();
    assert.equal(s.calls.list, 1);
    assert.equal(s.calls.imported, 0);
    s.workspace.importLibraryModel = (_component, metadata) => { s.calls.imported++; s.workspace.data.library = [...s.workspace.data.library, { modelAssetId: metadata.id }]; };
    s.workspace.saveNow = async () => { s.calls.saved++; return s.calls.saved > 1; };
    let result;
    await act(async () => { result = picker.props.onRecover(candidates); });
    assert.equal(await result, false);
    assert.equal(s.calls.imported, 1);
    await act(async () => { result = picker.props.onRecover(candidates); });
    assert.equal(await result, true);
    assert.equal(s.calls.imported, 1);
    assert.equal(s.calls.saved, 2);
  } finally { await s.close(); }
});

test('rejected manual library imports never trigger a sync or report success', async () => {
  const s = await setup();
  try {
    await act(async () => s.root.root.findByType('left-rail').props.onRecoverCloudModels());
    const picker = s.root.root.findByType('step-recovery');
    const candidates = await picker.props.loadAssets();
    let result;
    await act(async () => { result = picker.props.onRecover(candidates); });
    assert.equal(await result, false);
    assert.equal(s.calls.saved, 0);
  } finally { await s.close(); }
});
