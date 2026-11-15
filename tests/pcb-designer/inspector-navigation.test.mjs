import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const { React, create, act, loader, browser } = createRequire(import.meta.url)('../support/renderHarness.cjs');

async function setup() {
  const window = browser();
  const load = loader({ window, mocks: { '@/hooks/use-toast': { toast() {} } } });
  const { createBlankProject, BUILT_IN_COMPONENTS } = load('src/components/pcb-designer/defaults.ts');
  const { createWorkspaceState, reduceWorkspaceState } = load('src/components/pcb-designer/core/workspace.ts');
  const { usePcbEditorActions } = load('src/components/pcb-designer/hooks/usePcbEditorActions.ts');
  const { PcbInspector } = load('src/components/pcb-designer/PcbInspector.tsx');
  const project = createBlankProject('面板測試');
  project.components = ['A', 'B'].map((id, index) => ({ ...BUILT_IN_COMPONENTS[0], instanceId: id, reference: `C${index + 1}`, name: '測試電容',
    x: 20 + index, y: 20, width: 2, height: 2, rotation: 0, layer: 'bottom', locked: false }));
  const initial = createWorkspaceState({ projects: [project], library: [], templates: [], activeProjectId: project.id, updatedAt: project.updatedAt }, true);
  let state, dispatch, root;
  function Harness() {
    [state, dispatch] = React.useReducer(reduceWorkspaceState, { ...initial, rightTab: 'objects', visibleLayer: 'top' });
    const editor = usePcbEditorActions(state, dispatch);
    const workspace = { ...state, ...editor, canMutate: true, canEditBoard: true,
      selectedObject: state.activeProject.components.find(item => item.instanceId === state.selection?.id),
      setRightTab: tab => dispatch({ type: 'panel/right', tab }),
      selectObjects: objectIds => dispatch({ type: 'selection/set-many', objectIds }),
    };
    return React.createElement(PcbInspector, { workspace });
  }
  await act(async () => { root = create(React.createElement(Harness)); });
  return { get root() { return root; }, get state() { return state; }, window,
    dispatch: async action => act(async () => dispatch(action)),
    click: async node => act(async () => node.props.onClick()),
    stop: async () => act(async () => root.unmount()) };
}

test('check tab selects and reveals both objects; returning from multi-detail clears every selection and preserves list filters', async () => {
  const s = await setup();
  try {
    assert.equal(s.root.root.findAllByProps({ role: 'tab' }).length, 3);
    await act(async () => s.root.root.findByProps({ 'aria-label': '搜尋物件' }).props.onChange({ currentTarget: { value: 'C1' } }));
    await s.click(s.root.root.findAllByProps({ role: 'tab' })[2]);
    const issue = s.state.drcIssues[0];
    await s.click(s.root.root.findAllByType('button').find(node => node.children.includes(issue.message)));
    assert.equal(s.state.visibleLayer, 'bottom');
    assert.match(JSON.stringify(s.root.toJSON()), /已選/);
    assert.deepEqual([...s.state.selectedObjects].sort(), ['A', 'B']);
    await s.click(s.root.root.findByProps({ className: 'pcb-objects-back' }));
    assert.equal(s.state.selectedObjects.length, 0);
    assert.equal(s.state.selection, null);
    assert.equal(s.root.root.findByProps({ 'aria-label': '搜尋物件' }).props.value, 'C1');
    assert.equal(s.root.root.findAll(node => node.type === 'tr' && node.props['data-object-id']).length, 1);
  } finally { await s.stop(); }
});

test('canvas selection opens component detail with the same Chinese check issue; Escape returns to objects', async () => {
  const s = await setup();
  try {
    await s.dispatch({ type: 'selection/set-many', objectIds: ['A'] });
    assert.equal(s.state.rightTab, 'objects');
    assert.equal(s.root.root.findAllByProps({ 'data-selection-kind': 'component' }).length, 1);
    assert.equal(s.root.root.findAllByType('button').filter(node => node.children.includes(s.state.drcIssues[0].message)).length, 1);
    await act(async () => {
      const event = new Event('keydown', { cancelable: true });
      Object.defineProperties(event, { key: { value: 'Escape' }, target: { value: { closest: () => null } } });
      s.window.dispatchEvent(event);
    });
    assert.equal(s.state.selection, null);
    assert.equal(s.root.root.findAllByType('table').length, 1);
  } finally { await s.stop(); }
});

test('empty checks retain count zero and explain that this is a placement check', async () => {
  const s = await setup();
  try {
    await s.dispatch({ type: 'project/commit', update: { ...s.state.activeProject, components: [] } });
    await s.click(s.root.root.findAllByProps({ role: 'tab' })[2]);
    assert.equal(s.root.root.findByProps({ className: 'pcb-check-count' }).children.join(''), '0');
    assert.match(JSON.stringify(s.root.toJSON()), /沒有發現問題/);
    assert.match(JSON.stringify(s.root.toJSON()), /不是電氣設計規則檢查/);
  } finally { await s.stop(); }
});
