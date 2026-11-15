import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const { React, create, act, loader, browser } = createRequire(import.meta.url)('../support/renderHarness.cjs');

test('canvas DRC outlines follow visible layers and rotated keepout handles follow the actual corners', async () => {
  const load = loader({ window: browser(), mocks: { '@/hooks/use-toast': { toast() {} } },
    globals: { requestAnimationFrame: () => 1, cancelAnimationFrame() {} } });
  const { PcbCanvas } = load('src/components/pcb-designer/PcbCanvas.tsx');
  const { createBlankProject, BUILT_IN_COMPONENTS } = load('src/components/pcb-designer/defaults.ts');
  const { createWorkspaceState } = load('src/components/pcb-designer/core/workspace.ts');
  const { getKeepoutCorners } = load('src/components/pcb-designer/core/keepoutGeometry.ts');
  const project = createBlankProject('旋轉禁制區測試');
  const keepout = { id: 'K1', name: '測試禁制區', x: 30, y: 30, width: 20, height: 10, rotation: 30, color: '#fff' };
  project.keepouts = [keepout];
  project.components = [
    { ...BUILT_IN_COMPONENTS[3], width: 2, height: 2, instanceId: 'U1', reference: 'U1', x: 40, y: 35, rotation: 0, layer: 'bottom', locked: false },
    { ...BUILT_IN_COMPONENTS[3], width: 2, height: 2, instanceId: 'U2', reference: 'U2', x: 0, y: 10, rotation: 0, layer: 'top', locked: false },
  ];
  const state = createWorkspaceState({ projects: [project], templates: [], library: [], activeProjectId: project.id, updatedAt: project.updatedAt }, true);
  const commits = [];
  const workspace = { ...state, canMutate: true, selection: { kind: 'keepout', id: 'K1' }, selectedObject: keepout, selectedObjects: ['K1'],
    updateKeepout(id, patch) { commits.push({ id, patch }); return true; } };
  const svgNode = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    viewBox: { baseVal: { x: 0, y: 0, width: 100, height: 100 } }, setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {} };
  let root;
  const render = async layer => act(async () => {
    const element = React.createElement(PcbCanvas, { workspace, visibleLayer: layer });
    if (root) root.update(element); else root = create(element, { createNodeMock: node => node.type === 'svg' ? svgNode : null });
  });
  const drcIds = () => root.root.findAll(node => typeof node.type === 'string' && node.props['data-drc-object-id'])
    .map(node => node.props['data-drc-object-id']).sort();
  try {
    await render('top');
    assert.deepEqual(drcIds(), ['U2']);
    await render('bottom');
    assert.deepEqual(drcIds(), ['K1', 'U1']);
    const outline = root.root.find(node => node.type === 'rect' && node.props['data-drc-object-id'] === 'K1');
    assert.equal(outline.props.transform, 'rotate(30 40 35)');
    const corners = getKeepoutCorners(keepout);
    for (const [handle, point] of Object.entries(corners)) {
      const circle = root.root.find(node => node.type === 'circle' && node.props['data-keepout-resize-corner'] === handle);
      assert.equal(circle.props.cx, point.x);
      assert.equal(circle.props.cy, point.y);
      assert.ok(circle.findByType('title').children.join('').includes('對角保持固定'));
    }
    const selection = root.root.find(node => node.type === 'polygon' && node.props['data-keepout-selection-outline'] === 'K1');
    assert.equal(selection.props.points, ['nw', 'ne', 'se', 'sw'].map(handle => `${corners[handle].x},${corners[handle].y}`).join(' '));
    await render('all');
    assert.deepEqual(drcIds(), ['K1', 'U1', 'U2']);
    const event = { pointerId: 7, button: 0, altKey: true, preventDefault() {}, stopPropagation() {}, currentTarget: svgNode };
    await act(async () => root.root.find(node => node.type === 'circle' && node.props['data-keepout-resize-corner'] === 'se').props.onPointerDown(event));
    const target = { x: corners.nw.x + 25 * Math.cos(Math.PI / 6) - 12 * Math.sin(Math.PI / 6),
      y: corners.nw.y + 25 * Math.sin(Math.PI / 6) + 12 * Math.cos(Math.PI / 6) };
    await act(async () => root.root.findByType('svg').props.onPointerMove({ ...event, clientX: target.x, clientY: target.y }));
    await act(async () => root.root.findByType('svg').props.onPointerUp(event));
    assert.equal(commits.length, 1);
    assert.equal(commits[0].id, 'K1');
    assert.ok(Math.abs(commits[0].patch.width - 25) < 0.0001);
    assert.ok(Math.abs(commits[0].patch.height - 12) < 0.0001);
    const fixedCorner = getKeepoutCorners({ ...keepout, ...commits[0].patch }).nw;
    assert.ok(Math.abs(fixedCorner.x - corners.nw.x) < 0.0001);
    assert.ok(Math.abs(fixedCorner.y - corners.nw.y) < 0.0001);
  } finally { if (root) await act(async () => root.unmount()); }
});
