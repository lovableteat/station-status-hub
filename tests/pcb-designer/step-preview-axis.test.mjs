// The STEP preview's 朝上方向 choice: shown only before a library part is saved, marks the suggestion, reports the pick.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const { React, create, act, loader, browser } = createRequire(import.meta.url)('../support/renderHarness.cjs');

const asset = upAxis => ({
  metadata: {
    id: 'step-a', fileName: 'TO-220-3_Vertical.step', importedAt: '2026-11-15T00:00:00.000Z', sourceUnit: 'millimeter', upAxis,
    bounds: { min: [-2.59, -1.29, -9.75], max: [7.66, 3.16, 18.77] },
    parts: [{ id: 'p', name: 'body' }],
    dimensions: { widthMm: 10.3, depthMm: 4.5, heightMm: 28.5 }, calibratedDimensions: { widthMm: 10.3, depthMm: 4.5, heightMm: 28.5 },
  },
  parts: [{ id: 'p', position: [0, 0, 0, 1, 0, 0, 0, 1, 0], index: [0, 1, 2] }],
});

async function open(props) {
  const mocks = { './core/modelProjection.ts': { getPcbModelTopViewImage: () => 'data:image/png;base64,' } };
  const { PcbStepModelDialog } = loader({ window: browser(), mocks })('src/components/pcb-designer/PcbStepModelDialog.tsx');
  let root;
  await act(async () => { root = create(React.createElement(PcbStepModelDialog, { onClose() {}, ...props })); });
  const group = () => root.root.findAll(node => node.props?.role === 'group' && node.props['aria-label'] === '模型朝上方向')[0];
  const buttons = () => group()?.findAll(node => node.type === 'button') ?? [];
  const text = node => node.children.map(child => typeof child === 'string' ? child : text(child)).join('');
  return { group, buttons, text, close: () => act(async () => root.unmount()) };
}

test('before adding to the library the preview offers Z, Y and X as up, marks the suggestion and reports the pick', async () => {
  const picks = [];
  const view = await open({ asset: asset('z'), onConfirm() {}, confirmLabel: '加入元件庫', suggestedUpAxis: 'z', onUpAxisChange: axis => picks.push(axis) });
  try {
    assert.ok(view.group(), 'the choice is shown');
    const buttons = view.buttons();
    assert.equal(buttons.length, 3);
    assert.equal(view.text(buttons[0]), 'Z 軸朝上', 'one short label per button');
    assert.match(view.text(view.group()), /建議 Z 軸/, 'the suggestion is named in the heading');
    assert.equal(buttons[0].props['data-suggested'], true);
    assert.match(buttons[0].props.title, /建議/);
    assert.equal(buttons[0].props['aria-pressed'], true, 'the current axis is pressed');
    assert.equal(buttons[1].props['aria-pressed'], false);
    assert.equal(buttons[1].props['data-suggested'], undefined);
    await act(async () => buttons[1].props.onClick());
    assert.deepEqual(picks, ['y']);
  } finally { await view.close(); }
});

test('a model already bound to a part (view only) shows no up-axis choice', async () => {
  const view = await open({ asset: asset('z') });
  try { assert.equal(view.group(), undefined); } finally { await view.close(); }
});

test('while saving, the choice cannot be changed', async () => {
  const view = await open({ asset: asset('y'), busy: true, onConfirm() {}, suggestedUpAxis: 'z', onUpAxisChange() {} });
  try {
    assert.equal(view.buttons().length, 3, 'the choice is there');
    assert.ok(view.buttons().every(button => button.props.disabled === true));
  } finally { await view.close(); }
});
