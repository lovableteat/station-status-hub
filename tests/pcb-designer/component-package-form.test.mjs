// The component form's 3D 示意外形 select, end to end through its submit (not just the reducer).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const { React, create, act, loader, browser } = createRequire(import.meta.url)('../support/renderHarness.cjs');

async function openForm(packageModel) {
  const load = loader({ window: browser(), mocks: {} });
  const { BUILT_IN_COMPONENTS } = load('src/components/pcb-designer/defaults.ts');
  const { PcbDialogs } = load('src/components/pcb-designer/PcbDialogs.tsx');
  const component = { ...BUILT_IN_COMPONENTS[0], id: 'mine', source: 'custom', type: 'Other', packageModel };
  const saved = [];
  let root;
  await act(async () => {
    root = create(React.createElement(PcbDialogs, {
      dialog: { kind: 'component', component }, draftActorId: 'A', projectSettingsReady: true, currentProjects: [],
      onClose() {}, onUpdateProject: async () => true, onCreateProject() {}, onSaveTemplate() {}, onRenameTemplate() {},
      onSaveComponent: (...args) => { saved.push(args); },
    }));
  });
  const select = () => root.root.findAll(node => node.type === 'select' && String(node.props.title ?? '').startsWith('3D 用哪個示意封裝'))[0];
  const submit = () => act(async () => root.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  return { select, submit, saved, close: () => act(async () => root.unmount()) };
}

test('choosing 自動 on a library part saves an explicit undefined, so the merge clears the old 3D 示意外形', async () => {
  const form = await openForm('qfn');
  try {
    assert.equal(form.select().props.value, 'qfn');
    await act(async () => form.select().props.onChange({ target: { value: '' } }));
    await form.submit();
    assert.equal(form.saved.length, 1);
    const [values, componentId] = form.saved[0];
    assert.equal(componentId, 'mine');
    assert.equal(Object.prototype.hasOwnProperty.call(values, 'packageModel'), true, 'the field is sent');
    assert.equal(values.packageModel, undefined, 'and it is empty');
  } finally { await form.close(); }
});

test('an imported invalid 3D 示意外形 shows as 自動 and is not saved back', async () => {
  const form = await openForm('__proto__');
  try {
    assert.equal(form.select().props.value, '');
    await form.submit();
    assert.equal(form.saved[0][0].packageModel, undefined);
  } finally { await form.close(); }
});

test('a real choice is saved as chosen', async () => {
  const form = await openForm(undefined);
  try {
    await act(async () => form.select().props.onChange({ target: { value: 'usb-c' } }));
    await form.submit();
    assert.equal(form.saved[0][0].packageModel, 'usb-c');
  } finally { await form.close(); }
});
