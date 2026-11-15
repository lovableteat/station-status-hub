import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const { React, create, act, loader, browser } = createRequire(import.meta.url)('../support/renderHarness.cjs');

function setup() {
  const load = loader({ window: browser(), mocks: { '@/hooks/use-toast': { toast() {} } } });
  const { BUILT_IN_COMPONENTS, createBlankProject } = load('src/components/pcb-designer/defaults.ts');
  const { createWorkspaceState, reduceWorkspaceState } = load('src/components/pcb-designer/core/workspace.ts');
  const { usePcbEditorActions } = load('src/components/pcb-designer/hooks/usePcbEditorActions.ts');
  const project = createBlankProject('檢查定位測試');
  project.components = ['A', 'B'].map((id, index) => ({ ...BUILT_IN_COMPONENTS[3], instanceId: id, reference: `U${index + 1}`,
    x: 30 + index, y: 20, rotation: 0, layer: 'bottom', locked: false }));
  project.keepouts = [{ id: 'K', name: '禁制區', x: 50, y: 50, width: 5, height: 5, color: '#fff' }];
  project.measurements = [{ id: 'M', x1: 30, y1: 10, x2: 40, y2: 10, color: '#fff' }];
  const data = { projects: [project], templates: [], library: [], activeProjectId: project.id, updatedAt: project.updatedAt };
  return { data, createWorkspaceState, reduceWorkspaceState, usePcbEditorActions };
}

test('centering a check reveals its hidden layer and selects every implicated object', async () => {
  const { data, createWorkspaceState, reduceWorkspaceState, usePcbEditorActions } = setup();
  let state = { ...createWorkspaceState(data, true), visibleLayer: 'top' }, editor, root;
  function Harness() { editor = usePcbEditorActions(state, action => { state = reduceWorkspaceState(state, action); }); return null; }
  await act(async () => { root = create(React.createElement(Harness)); });
  try {
    editor.centerDrcIssue(state.drcIssues.find(issue => issue.code === 'COMPONENT_COLLISION').id);
    assert.equal(state.visibleLayer, 'bottom');
    assert.deepEqual([...state.selectedObjects].sort(), ['A', 'B']);
    assert.equal(state.rightTab, 'objects');
    assert.deepEqual(state.viewCenter, { x: 30.5, y: 20 });
    assert.equal(state.zoom, 150);
  } finally { await act(async () => root.unmount()); }
});

test('object list navigation replaces prior selection and centers components, keepouts and measurements', async () => {
  const { data, createWorkspaceState, reduceWorkspaceState, usePcbEditorActions } = setup();
  let state = { ...createWorkspaceState(data, true), visibleLayer: 'top' }, editor, root;
  function Harness() { editor = usePcbEditorActions(state, action => { state = reduceWorkspaceState(state, action); }); return null; }
  await act(async () => { root = create(React.createElement(Harness)); });
  try {
    for (const [selection, center] of [[{ kind: 'component', id: 'A' }, { x: 30, y: 20 }], [{ kind: 'keepout', id: 'K' }, { x: 52.5, y: 52.5 }], [{ kind: 'measurement', id: 'M' }, { x: 35, y: 10 }]]) {
      editor.centerObject(selection);
      assert.deepEqual(state.selection, selection);
      assert.deepEqual(state.selectedObjects, [selection.id]);
      assert.deepEqual(state.viewCenter, center);
    }
    const previous = state;
    editor.centerObject({ kind: 'component', id: 'missing' });
    assert.equal(state, previous);
  } finally { await act(async () => root.unmount()); }
});

test('legacy right tabs normalize on load and hydration and selection opens objects', () => {
  const { data, createWorkspaceState, reduceWorkspaceState } = setup();
  for (const [legacy, expected] of [['selection', 'objects'], ['drc', 'checks'], ['objects', 'objects'], ['checks', 'checks'], ['unknown', 'board']]) {
    const initial = createWorkspaceState({ ...data, rightTab: legacy }, true);
    assert.equal(initial.rightTab, expected);
    const hydrated = reduceWorkspaceState(initial, { type: 'persistence/hydrate', data,
      preserveView: { ...initial, rightTab: legacy } });
    assert.equal(hydrated.rightTab, expected);
  }
  let state = createWorkspaceState(data, true);
  state = reduceWorkspaceState(state, { type: 'selection/toggle', objectId: 'A' });
  assert.equal(state.rightTab, 'objects');
  state = reduceWorkspaceState(state, { type: 'selection/set-many', objectIds: [] });
  assert.equal(state.selection, null);
  assert.equal(state.rightTab, 'objects');
  state = reduceWorkspaceState(state, { type: 'drc/run' });
  assert.equal(state.rightTab, 'checks');
});

test('shared rotation changes all selected kinds in one undo step and blocks the entire group when locked', async () => {
  for (const locked of [false, true]) {
    const { data, createWorkspaceState, reduceWorkspaceState, usePcbEditorActions } = setup();
    data.projects[0].components[0].locked = locked;
    let state = createWorkspaceState(data, true), editor, root;
    state = reduceWorkspaceState(state, { type: 'selection/set-many', objectIds: ['A', 'B', 'K', 'M'] });
    const baseline = state.activeProject;
    const undoLength = state.historyByProject[baseline.id].undo.length;
    function Harness() { editor = usePcbEditorActions(state, action => { state = reduceWorkspaceState(state, action); }); return null; }
    await act(async () => { root = create(React.createElement(Harness)); });
    try {
      assert.equal(editor.rotateSelected(), !locked);
      if (locked) {
        assert.equal(state.activeProject, baseline);
        assert.equal(state.historyByProject[baseline.id].undo.length, undoLength);
      } else {
        assert.deepEqual(state.activeProject.components.map(item => item.rotation), [90, 90]);
        assert.equal(state.activeProject.keepouts[0].rotation, 90);
        assert.deepEqual(state.activeProject.measurements[0], { ...baseline.measurements[0], x1: 35, y1: 5, x2: 35, y2: 15 });
        assert.equal(state.historyByProject[baseline.id].undo.length, undoLength + 1);
        state = reduceWorkspaceState(state, { type: 'history/undo' });
        assert.deepEqual(structuredClone(state.activeProject.components), structuredClone(baseline.components));
        assert.deepEqual(structuredClone(state.activeProject.keepouts), structuredClone(baseline.keepouts));
        assert.deepEqual(structuredClone(state.activeProject.measurements), structuredClone(baseline.measurements));
      }
    } finally { await act(async () => root.unmount()); }
  }
});
