import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const { React, create, act, loader, browser } = createRequire(import.meta.url)('../support/renderHarness.cjs');

async function setup(locked = false) {
  const load = loader({ window: browser(), mocks: { '@/hooks/use-toast': { toast() {} } } });
  const { createBlankProject, BUILT_IN_COMPONENTS } = load('src/components/pcb-designer/defaults.ts');
  const { createWorkspaceState, reduceWorkspaceState } = load('src/components/pcb-designer/core/workspace.ts');
  const { usePcbEditorActions } = load('src/components/pcb-designer/hooks/usePcbEditorActions.ts');
  const { PcbComponentCoordinates } = load('src/components/pcb-designer/PcbComponentCoordinates.tsx');
  const project = createBlankProject('座標測試');
  project.components = [{ ...BUILT_IN_COMPONENTS[0], instanceId: 'U1', reference: 'U1',
    width: 2, height: 2, x: 20, y: 20, rotation: 0, layer: 'top', locked }];
  let state, dispatch, root;
  function Harness() {
    [state, dispatch] = React.useReducer(reduceWorkspaceState, createWorkspaceState({ projects: [project], templates: [], library: [], activeProjectId: project.id, updatedAt: project.updatedAt }, true));
    const actions = usePcbEditorActions(state, dispatch);
    return React.createElement(PcbComponentCoordinates, { component: state.activeProject.components[0], workspace: { ...state, ...actions, canMutate: state.canEdit && !state.documentLocked } });
  }
  await act(async () => { root = create(React.createElement(Harness)); });
  return { get state() { return state; }, get root() { return root; },
    input: axis => root.root.findAllByType('input')[axis === 'x' ? 0 : 1],
    edit: async (axis, value) => act(async () => root.root.findAllByType('input')[axis === 'x' ? 0 : 1].props.onChange({ currentTarget: { value } })),
    undo: async () => act(async () => dispatch({ type: 'history/undo' })),
    stop: async () => act(async () => root.unmount()) };
}

test('coordinate Enter and immediate blur commit once with four decimals; undo restores original position', async () => {
  const s = await setup();
  try {
    await s.edit('x', '21.123456');
    await act(async () => {
      const props = s.input('x').props;
      props.onKeyDown({ key: 'Enter', preventDefault() {} });
      props.onBlur();
    });
    assert.equal(s.state.activeProject.components[0].x, 21.1235);
    assert.equal(s.state.historyByProject[s.state.activeProject.id].undo.length, 1);
    await s.undo();
    assert.equal(s.state.activeProject.components[0].x, 20);
  } finally { await s.stop(); }
});

test('coordinate blur accepts out-of-board positions exactly like dragging and explains the placement warning', async () => {
  const s = await setup();
  try {
    await s.edit('y', '-5');
    await act(async () => s.input('y').props.onBlur());
    assert.equal(s.state.activeProject.components[0].y, -5);
    assert.equal(s.state.drcIssues[0].code, 'OUT_OF_BOUNDS');
    assert.match(JSON.stringify(s.root.toJSON()), /與畫布拖曳相同，允許超出板框/);
  } finally { await s.stop(); }
});

test('blank input stays visible with an error and locked coordinates cannot commit', async () => {
  const editable = await setup();
  try {
    await editable.edit('x', '');
    await act(async () => editable.input('x').props.onBlur());
    assert.equal(editable.input('x').props['aria-invalid'], true);
    assert.equal(editable.state.historyByProject[editable.state.activeProject.id].undo.length, 0);
    assert.equal(editable.state.activeProject.components[0].x, 20);
    await editable.edit('x', '1e308');
    await act(async () => editable.input('x').props.onBlur());
    assert.match(JSON.stringify(editable.root.toJSON()), /座標數值過大/);
    assert.equal(editable.state.activeProject.components[0].x, 20);
    assert.equal(editable.state.historyByProject[editable.state.activeProject.id].undo.length, 0);
  } finally { await editable.stop(); }
  const locked = await setup(true);
  try {
    assert.equal(locked.input('x').props.disabled, true);
    assert.equal(locked.input('x').props.title, '元件已鎖定，先解除鎖定才能移動');
    await locked.edit('x', '44');
    await act(async () => locked.input('x').props.onBlur());
    assert.equal(locked.state.activeProject.components[0].x, 20);
    assert.equal(locked.state.historyByProject[locked.state.activeProject.id].undo.length, 0);
  } finally { await locked.stop(); }
});
