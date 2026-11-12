import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { React, create, act, loader, deferred, browser } = require('../support/renderHarness.cjs');
const setup = () => {
  const window = browser();
  window.localStorage.setItem = () => { throw new Error('unexpected storage write'); };
  window.sessionStorage.setItem = () => { throw new Error('unexpected storage write'); };
  const mocks = {}; let conflictChecks = 0;
  const load = loader({ window, mocks });
  const registry = load('src/lib/documentDrafts.ts'); registry.setDocumentDraftActor('A');
  const core = load('src/components/pcb-designer/core/projectSettingsDraft.ts');
  mocks['./core/projectSettingsDraft.ts'] = { ...core, projectSettingsConflict: (...args) => { conflictChecks++; return core.projectSettingsConflict(...args); } };
  const { createBlankProject } = load('src/components/pcb-designer/defaults.ts');
  const { PcbDialogs } = load('src/components/pcb-designer/PcbDialogs.tsx');
  const project = createBlankProject('Synthetic');
  let root, closes = 0, calls = [];
  let props = { dialog: { kind: 'project-settings', project }, draftActorId: 'A', projectSettingsReady: true,
    currentProjects: [project], onClose: () => { closes++; }, onUpdateProject: async (...args) => { calls.push(args); return true; },
    onCreateProject() {}, onSaveTemplate() {}, onRenameTemplate() {}, onSaveComponent() {} };
  const mount = async (next = {}) => { props = { ...props, ...next }; await act(async () => { root = create(React.createElement(PcbDialogs, props)); }); };
  const update = async next => { props = { ...props, ...next }; await act(async () => root.update(React.createElement(PcbDialogs, props))); };
  const field = label => root.root.findAllByType('label').find(node => node.children.some(child => typeof child === 'string' && child === label)).findAll(node => node.type === 'stub' && node.props.onChange)[0];
  const edit = (label, value) => field(label).props.onChange({ target: { value } });
  const submit = () => root.root.findByType('form').props.onSubmit({ preventDefault() {} });
  const cancel = () => root.root.findAll(node => node.type === 'stub' && node.props.onClick && node.children.includes('取消')).at(-1).props.onClick();
  return { load, registry, core, project, mount, update, field, edit, submit, cancel,
    get conflictChecks() { return conflictChecks; }, get root() { return root; }, get closes() { return closes; }, get calls() { return calls; },
    stop: async () => act(async () => root.unmount()) };
};
test('real dialog writes the last keystroke synchronously before an immediate gate unmount', async () => {
  const s = setup(); await s.mount();
  await act(async () => { s.edit('名稱', '  最後一字  '); s.edit('描述', '未儲存\n原始字'); s.root.unmount(); });
  await s.mount(); assert.equal(s.field('名稱').props.value, '  最後一字  '); assert.equal(s.field('描述').props.value, '未儲存\n原始字');
  assert.equal(s.calls.length, 0); await s.stop();
});
test('validation errors and raw invalid strings survive a real dialog remount', async () => {
  const s = setup(); await s.mount(); await act(async () => s.edit('寬度 (mm)', '1e'));
  await act(async () => s.submit()); assert.match(JSON.stringify(s.root.toJSON()), /板框尺寸/);
  await s.stop(); await s.mount(); assert.equal(s.field('寬度 (mm)').props.value, '1e'); assert.match(JSON.stringify(s.root.toJSON()), /板框尺寸/); await s.stop();
});
test('denied render exposes no draft and same actor restored authorization recovers it', async () => {
  const s = setup(); await s.mount(); await act(async () => s.edit('名稱', 'private draft'));
  await s.update({ projectSettingsReady: false }); assert.equal(s.root.toJSON(), null);
  await s.update({ projectSettingsReady: true }); assert.equal(s.field('名稱').props.value, 'private draft');
  s.registry.setDocumentDraftActor('B'); await s.update({ draftActorId: 'A' }); assert.equal(s.root.toJSON(), null);
  await s.update({ draftActorId: 'B' }); assert.equal(s.field('名稱').props.value, 'Synthetic'); await s.stop();
});
test('cancel discards explicitly, while a failed apply leaves the raw form and error', async () => {
  const s = setup(); await s.mount({ onUpdateProject: async () => false });
  await act(async () => s.edit('名稱', '  pending  ')); await act(async () => s.submit());
  assert.equal(s.closes, 0); assert.equal(s.field('名稱').props.value, '  pending  '); assert.match(JSON.stringify(s.root.toJSON()), /未套用設定/);
  await act(async () => s.cancel()); await s.stop(); await s.mount(); assert.equal(s.field('名稱').props.value, 'Synthetic'); await s.stop();
});
test('successful local apply clears only after receipt and does not call cancel', async () => {
  const s = setup(), result = deferred(); await s.mount({ onUpdateProject: () => result.promise });
  await act(async () => s.edit('名稱', 'pending')); await act(async () => s.submit());
  assert.equal(s.closes, 0); assert.equal(new s.core.ProjectSettingsSession('A', s.project).draft.values.name, 'pending');
  await act(async () => result.resolve(true)); assert.equal(s.closes, 1);
  assert.equal(new s.core.ProjectSettingsSession('A', s.project).draft.values.name, 'Synthetic'); await s.stop();
});
test('late success after unmount cannot clear a remounted newer draft', async () => {
  const s = setup(), result = deferred(); await s.mount({ onUpdateProject: () => result.promise });
  await act(async () => s.edit('名稱', 'submitted')); await act(async () => s.submit()); await s.stop();
  await s.mount(); await act(async () => s.edit('名稱', 'newer')); await act(async () => result.resolve(true));
  assert.equal(s.closes, 0); assert.equal(s.field('名稱').props.value, 'newer');
  assert.equal(new s.core.ProjectSettingsSession('A', s.project).draft.values.name, 'newer'); await s.stop();
});
test('late rejection after account switch never exposes prior actor error or draft', async () => {
  const s = setup(), result = deferred(); await s.mount({ onUpdateProject: () => result.promise });
  await act(async () => s.edit('名稱', 'actor A pending')); await act(async () => s.submit());
  s.registry.setDocumentDraftActor('B'); await s.update({ draftActorId: 'B' }); await act(async () => result.reject(new Error('old response')));
  assert.equal(s.field('名稱').props.value, 'Synthetic'); assert.doesNotMatch(JSON.stringify(s.root.toJSON()), /actor A pending|套用設定失敗/); await s.stop();
});
test('current project drift or deletion displays conflict, retains raw input, and never applies stale project', async () => {
  const s = setup(); await s.mount(); await act(async () => s.edit('名稱', 'pending'));
  await s.update({ currentProjects: [{ ...s.project, description: 'new server value' }] });
  assert.match(JSON.stringify(s.root.toJSON()), /專案內容已變更/); await act(async () => s.submit()); assert.equal(s.calls.length, 0);
  await s.update({ currentProjects: [] }); assert.match(JSON.stringify(s.root.toJSON()), /專案已不存在/); assert.equal(s.field('名稱').props.value, 'pending');
  await act(async () => s.submit()); assert.equal(s.calls.length, 0); await s.stop();
});

test('explicit cancel while apply is pending never resurrects on late rejection', async () => {
  const s = setup(), result = deferred(); await s.mount({ onUpdateProject: () => result.promise });
  await act(async () => s.edit('名稱', 'cancel pending')); await act(async () => s.submit());
  await act(async () => s.cancel()); await act(async () => result.reject(new Error('late failure')));
  assert.equal(s.closes, 1); assert.equal(new s.core.ProjectSettingsSession('A', s.project).draft.values.name, 'Synthetic'); await s.stop();
});
test('registry signout alone invalidates displayed form before consumer props can rerender', async () => {
  const s = setup(); await s.mount(); await act(async () => s.edit('名稱', 'private'));
  await act(async () => s.registry.setDocumentDraftActor(null)); assert.equal(s.root.toJSON(), null); await s.stop();
});

test('captured handlers after unmount cannot overwrite, cancel or submit a newer same-project draft', async () => {
  const s = setup(); await s.mount();
  const oldChange = s.field('名稱').props.onChange;
  const oldSubmit = s.root.root.findByType('form').props.onSubmit;
  const oldCancel = s.root.root.findAll(node => node.type === 'stub' && node.props.onClick && node.children.includes('取消')).at(-1).props.onClick;
  await s.stop(); await s.mount(); await act(async () => s.edit('名稱', 'new mount draft'));
  await act(async () => { oldChange({ target: { value: 'late old value' } }); oldCancel(); oldSubmit({ preventDefault() {} }); });
  assert.equal(s.field('名稱').props.value, 'new mount draft');
  assert.equal(new s.core.ProjectSettingsSession('A', s.project).draft.values.name, 'new mount draft');
  assert.equal(s.closes, 0); assert.equal(s.calls.length, 0); await s.stop();
});
test('captured handlers after switching the dialog cannot act on the new project', async () => {
  const s = setup(); await s.mount();
  const oldChange = s.field('名稱').props.onChange;
  const oldSubmit = s.root.root.findByType('form').props.onSubmit;
  const oldCancel = s.root.root.findAll(node => node.type === 'stub' && node.props.onClick && node.children.includes('取消')).at(-1).props.onClick;
  const next = { ...s.project, id: 'other-synthetic-project', name: 'Project B' };
  await s.update({ dialog: { kind: 'project-settings', project: next }, currentProjects: [s.project, next] });
  await act(async () => s.edit('名稱', 'new project draft'));
  await act(async () => { oldChange({ target: { value: 'late old project' } }); oldCancel(); oldSubmit({ preventDefault() {} }); });
  assert.equal(s.field('名稱').props.value, 'new project draft'); assert.equal(s.closes, 0); assert.equal(s.calls.length, 0); await s.stop();
});
test('raw incomplete settings numbers are text/decimal controls; other dialogs remain native number controls', async () => {
  const s = setup(); await s.mount();
  assert.equal(s.field('寬度 (mm)').props.type, 'text'); assert.equal(s.field('寬度 (mm)').props.inputMode, 'decimal');
  assert.equal(s.field('高度 (mm)').props.type, 'text');
  for (const raw of ['1e', '-', '12.']) {
    await act(async () => s.edit('寬度 (mm)', raw)); await act(async () => s.submit());
    await s.stop(); await s.mount(); assert.equal(s.field('寬度 (mm)').props.value, raw);
    assert.match(JSON.stringify(s.root.toJSON()), /板框尺寸/);
  }
  await s.update({ dialog: { kind: 'new-project' } });
  assert.equal(s.field('寬度 (mm)').props.type, 'number'); assert.equal(s.field('寬度 (mm)').props.inputMode, undefined);
  await s.stop();
});
test('typing does not recanonicalize a stable current project; new project reference still checks full content', async () => {
  const s = setup(); await s.mount(); const initial = s.conflictChecks;
  for (const value of ['a', 'ab', 'abc', 'abcd']) await act(async () => s.edit('名稱', value));
  assert.equal(s.conflictChecks, initial);
  await s.update({ currentProjects: [{ ...s.project, board: { ...s.project.board, gridSize: 7 } }] });
  assert.equal(s.conflictChecks, initial + 1); assert.match(JSON.stringify(s.root.toJSON()), /專案內容已變更/);
  await s.stop();
});

test('captured actor-A handlers cannot target actor-B session even if parent reuses the same dialog object', async () => {
  const s = setup(); await s.mount();
  const oldChange = s.field('名稱').props.onChange;
  const oldSubmit = s.root.root.findByType('form').props.onSubmit;
  const oldCancel = s.root.root.findAll(node => node.type === 'stub' && node.props.onClick && node.children.includes('取消')).at(-1).props.onClick;
  await act(async () => s.registry.setDocumentDraftActor('B')); await s.update({ draftActorId: 'B' });
  await act(async () => s.edit('名稱', 'actor B draft'));
  await act(async () => { oldChange({ target: { value: 'late A' } }); oldCancel(); oldSubmit({ preventDefault() {} }); });
  assert.equal(s.field('名稱').props.value, 'actor B draft');
  assert.equal(new s.core.ProjectSettingsSession('B', s.project).draft.values.name, 'actor B draft');
  assert.equal(s.calls.length, 0); assert.equal(s.closes, 0); await s.stop();
});
