import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const { React, create, act, loader, browser } = createRequire(import.meta.url)('../support/renderHarness.cjs');

test('pointer and property coordinate updates are rounded while unrelated component settings keep their precision', async () => {
  const load = loader({ window: browser(), mocks: { '@/hooks/use-toast': { toast() {} } } });
  const { BUILT_IN_COMPONENTS, createBlankProject } = load('src/components/pcb-designer/defaults.ts');
  const { createWorkspaceState } = load('src/components/pcb-designer/core/workspace.ts');
  const { usePcbEditorActions } = load('src/components/pcb-designer/hooks/usePcbEditorActions.ts');
  const project = createBlankProject('座標更新測試');
  project.components = [{ ...BUILT_IN_COMPONENTS[3], instanceId: 'U1', reference: 'U1', x: 30.111111, y: 20,
    rotation: 0, layer: 'top', locked: false }];
  project.keepouts = [{ id: 'K1', name: '禁制區', x: 50, y: 50, width: 5, height: 5, color: '#fff' }];
  project.measurements = [{ id: 'M1', x1: 30, y1: 10, x2: 40, y2: 10, color: '#fff' }];
  const state = createWorkspaceState({ projects: [project], templates: [], library: [], activeProjectId: project.id, updatedAt: project.updatedAt }, true);
  const actions = []; let editor, root;
  function Harness() { editor = usePcbEditorActions(state, action => actions.push(action)); return null; }
  await act(async () => { root = create(React.createElement(Harness)); });
  try {
    assert.equal(editor.updateComponent('U1', { x: 30.123456, y: 20.654321 }), true);
    assert.deepEqual([actions.at(-1).update.components[0].x, actions.at(-1).update.components[0].y], [30.1235, 20.6543]);
    assert.equal(editor.updateKeepout('K1', { x: 50.123456, y: 50.654321 }), true);
    assert.deepEqual([actions.at(-1).update.keepouts[0].x, actions.at(-1).update.keepouts[0].y], [50.1235, 50.6543]);
    assert.equal(editor.updateMeasurement('M1', { x1: 30.123456, y1: 10.654321, x2: 40.654321, y2: 10.123456 }), true);
    const line = actions.at(-1).update.measurements[0];
    assert.deepEqual([line.x1, line.y1, line.x2, line.y2], [30.1235, 10.6543, 40.6543, 10.1235]);
    assert.equal(editor.updateComponent('U1', { insertionDepth: 0.123456 }), true);
    assert.equal(actions.at(-1).update.components[0].x, 30.111111);
    assert.equal(actions.at(-1).update.components[0].insertionDepth, 0.123456);
  } finally { await act(async () => root.unmount()); }
});
