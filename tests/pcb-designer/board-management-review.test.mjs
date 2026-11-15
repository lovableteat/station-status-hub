// Behaviour checks for the issues Codex found reviewing Phase 3 (board list, owner, approval).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { React, create, act, loader, browser } = require('../support/renderHarness.cjs');

const plain = value => JSON.parse(JSON.stringify(value));
const board = (load, id, patch = {}) => ({ ...load('src/components/pcb-designer/defaults.ts').createBlankProject(`板 ${id}`), id, boardFamilyId: id, ...patch });

test('a malformed 負責人 in stored projects and templates is dropped by the shared workspace normalisation', () => {
  const load = loader({ window: browser(), mocks: {} });
  const { normalizePcbSaveState } = load('src/components/pcb-designer/core/validation.ts');
  const { isPcbSaveState } = load('src/components/pcb-designer/core/storage.ts');
  const { BUILT_IN_COMPONENTS, BUILT_IN_TEMPLATES } = load('src/components/pcb-designer/defaults.ts');
  const { boardOwnerName, buildBoardList } = load('src/components/pcb-designer/core/boardList.ts');
  const bad = board(load, 'p', { owner: { displayName: 42 } });
  const template = { ...BUILT_IN_TEMPLATES[0], project: { ...BUILT_IN_TEMPLATES[0].project, owner: { displayName: ['x'] } } };
  const state = { projects: [bad], templates: [template], library: BUILT_IN_COMPONENTS, activeProjectId: 'p', updatedAt: bad.updatedAt };
  assert.equal(isPcbSaveState(JSON.parse(JSON.stringify(state))), true, 'one bad field never rejects the stored workspace');
  const normalized = normalizePcbSaveState(state);
  assert.equal('owner' in normalized.projects[0], false);
  assert.equal('owner' in normalized.templates[0].project, false);
  // Even an unnormalised value cannot crash the list.
  assert.equal(boardOwnerName(bad), '未指派');
  assert.equal(buildBoardList([bad], { query: '42', status: 'all', owner: 'all', sort: 'updated' }, 'p').length, 0);
});

test('a family is led by its newest version, keeps that version\'s 大專案, and sorts by its latest edit', () => {
  const load = loader({ window: browser(), mocks: {} });
  const { buildBoardList, isBoardFamilyOpen } = load('src/components/pcb-designer/core/boardList.ts');
  const r1 = board(load, 'r1', { boardFamilyId: 'F', revision: '1', projectGroup: '舊', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-11-14T00:00:00.000Z' });
  const r2 = board(load, 'r2', { boardFamilyId: 'F', revision: '2', projectGroup: '新', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z' });
  const other = board(load, 'o', { projectGroup: '新', createdAt: '2026-11-05T00:00:00.000Z', updatedAt: '2026-11-10T00:00:00.000Z' });
  const groups = buildBoardList([r1, r2, other], { query: '', status: 'all', owner: 'all', sort: 'updated' }, 'o');
  assert.deepEqual(plain(groups.map(group => group.name)), ['新'], 'editing the old version does not move the family back to 舊');
  const family = groups[0].families.find(item => item.id === 'F');
  assert.equal(family.lead.id, 'r2', 'newest version leads even when the old one was edited last');
  assert.deepEqual(plain(groups[0].families.map(item => item.id)), ['F', 'o'], '最近更新 uses the latest edit of any version');
  // Open state: an explicit choice survives switching boards; otherwise open when the family holds the open board.
  assert.equal(isBoardFamilyOpen(family, 'o', new Map()), false);
  const openFamily = buildBoardList([r1, r2, other], { query: '', status: 'all', owner: 'all', sort: 'updated' }, 'r1')[0].families.find(item => item.id === 'F');
  assert.equal(isBoardFamilyOpen(openFamily, 'r1', new Map()), true, 'the open old version shows its family expanded');
  assert.equal(isBoardFamilyOpen(openFamily, 'r1', new Map([['F', true]])), true, 'expanded then opened an old version: stays open');
  assert.equal(isBoardFamilyOpen(openFamily, 'r1', new Map([['F', false]])), false);
});

test('on an approved board the editor actions refuse and never report a success', async () => {
  const window = browser();
  const toasts = [];
  const mocks = { '@/hooks/use-toast': { toast: value => { toasts.push(value); } } };
  const load = loader({ window, mocks });
  const { createWorkspaceState, reduceWorkspaceState } = load('src/components/pcb-designer/core/workspace.ts');
  const { BUILT_IN_COMPONENTS } = load('src/components/pcb-designer/defaults.ts');
  const { usePcbEditorActions } = load('src/components/pcb-designer/hooks/usePcbEditorActions.ts');
  const part = { ...BUILT_IN_COMPONENTS[3], instanceId: 'c1', reference: 'R1', x: 20, y: 20, rotation: 0, layer: 'top', locked: false };
  const part2 = { ...part, instanceId: 'c2', reference: 'R2', x: 40 };
  const approved = board(load, 'p', { status: 'approved', components: [part, part2] });
  let state = createWorkspaceState({ projects: [approved], templates: [], library: BUILT_IN_COMPONENTS, activeProjectId: 'p', updatedAt: approved.updatedAt }, true);
  state = reduceWorkspaceState(state, { type: 'selection/set-many', selections: [{ kind: 'component', id: 'c1' }, { kind: 'component', id: 'c2' }] });
  const dispatched = [];
  let api;
  const Probe = () => { api = usePcbEditorActions(state, action => { dispatched.push(action.type); }); return null; };
  let root; await act(async () => { root = create(React.createElement(Probe)); });
  const results = {
    delete: api.deleteSelected(), duplicate: api.duplicateSelected(), paste: (api.copySelected(), api.pasteCopied()),
    nudge: api.nudgeSelected(1, 0), align: api.arrangeSelectedComponents('align-left'), rotate: api.rotateSelected(),
  };
  for (const [name, value] of Object.entries(results)) assert.equal(Boolean(value && value !== true ? value.ok : value), false, `${name} must refuse`);
  assert.deepEqual(plain(dispatched.filter(type => !type.startsWith('selection/set'))), [], 'nothing that edits the board is dispatched');
  assert.equal(toasts.some(item => /^已/.test(item.title ?? '')), false, 'no success toast');
  await act(async () => root.unmount());
});

test('an old settings draft without owner fields shows the board\'s owner, and choosing 未指派 clears it', async () => {
  const window = browser();
  const mocks = {};
  const load = loader({ window, mocks });
  const registry = load('src/lib/documentDrafts.ts'); registry.setDocumentDraftActor('A');
  const core = load('src/components/pcb-designer/core/projectSettingsDraft.ts');
  const { PcbDialogs } = load('src/components/pcb-designer/PcbDialogs.tsx');
  const project = board(load, 'p', { owner: { userId: 'u-1', displayName: '王工程師' } });
  const session = new core.ProjectSettingsSession('A', project);
  const { ownerId, ownerName, ...oldValues } = session.draft.values;
  session.write({ ...oldValues, name: '舊草稿' });
  const calls = [];
  const props = { dialog: { kind: 'project-settings', project }, draftActorId: 'A', projectSettingsReady: true, currentProjects: [project],
    onClose() {}, onUpdateProject: async (...args) => { calls.push(args); return true; }, onCreateProject() {}, onSaveTemplate() {}, onRenameTemplate() {}, onSaveComponent() {} };
  let root; await act(async () => { root = create(React.createElement(PcbDialogs, props)); });
  const ownerSelect = () => root.root.findAll(node => node.type === 'select' && String(node.props.title ?? '').startsWith('誰負責這塊板'))[0];
  assert.equal(ownerSelect().props.value, 'id:u-1', 'shows the owner that will be applied');
  await act(async () => root.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.deepEqual(plain(calls[0][2].owner), { userId: 'u-1', displayName: '王工程師' });
  await act(async () => root.unmount());
  // A fresh form: choosing 未指派 clears the owner.
  const fresh = new core.ProjectSettingsSession('A', project);
  fresh.write({ ...fresh.draft.values, name: '新草稿' });
  await act(async () => { root = create(React.createElement(PcbDialogs, props)); });
  await act(async () => ownerSelect().props.onChange({ target: { value: '' } }));
  assert.equal(ownerSelect().props.value, '');
  await act(async () => root.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(calls.at(-1)[2].owner, undefined, 'choosing 未指派 clears the owner');
  await act(async () => root.unmount());
});
