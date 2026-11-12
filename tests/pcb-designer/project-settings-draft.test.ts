import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlankProject } from '../../src/components/pcb-designer/defaults.ts';
import { setDocumentDraftActor } from '../../src/lib/documentDrafts.ts';
import { ProjectSettingsSession, initialProjectSettings, projectSettingsConflict, projectSettingsRevision, parseProjectSettings, applyProjectSettings } from '../../src/components/pcb-designer/core/projectSettingsDraft.ts';
import { createWorkspaceState, reduceWorkspaceState } from '../../src/components/pcb-designer/core/workspace.ts';

let beforeUnload: ((event: { preventDefault: () => void; returnValue: string | null }) => void) | undefined;
const setup = () => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    addEventListener(_type: string, handler: typeof beforeUnload) { beforeUnload = handler; },
    get localStorage() { throw new Error('No localStorage'); }, get sessionStorage() { throw new Error('No sessionStorage'); },
  } });
  setDocumentDraftActor('actor-A');
  return createBlankProject('Synthetic project');
};
const settings = (project: ReturnType<typeof createBlankProject>) => {
  const result = parseProjectSettings({ ...initialProjectSettings(project).values, name: 'Updated', width: '120' });
  if (typeof result === 'string') throw new Error(result);
  return result;
};

test('last raw keystroke and validation error survive immediate unmount/recreate without a flush', () => {
  const project = setup(), first = new ProjectSettingsSession('actor-A', project);
  const raw = { ...first.draft.values, name: '  pending  ', width: 'not-a-number', description: '\n最後一字\n' };
  first.write(raw, 'exact validation error');
  const reopened = new ProjectSettingsSession('actor-A', project);
  assert.deepEqual(reopened.draft.values, raw);
  assert.equal(reopened.draft.error, 'exact validation error');
  assert.equal(reopened.draft.kind, 'project-settings');
  assert.equal(reopened.draft.projectId, project.id);
  assert.equal(reopened.draft.baselineRevision, projectSettingsRevision(project));
});
test('project A/B recovery is separate and a remount uses no client random identifier', () => {
  const a = setup(), b = createBlankProject('B');
  const sa = new ProjectSettingsSession('actor-A', a), sb = new ProjectSettingsSession('actor-A', b);
  sa.write({ ...sa.draft.values, name: 'draft A' }); sb.write({ ...sb.draft.values, name: 'draft B' });
  assert.equal(new ProjectSettingsSession('actor-A', a).draft.values.name, 'draft A');
  assert.equal(new ProjectSettingsSession('actor-A', b).draft.values.name, 'draft B');
});
test('denied actor has no readable or writable draft and switching actors invalidates old callbacks', () => {
  const project = setup(), a = new ProjectSettingsSession('actor-A', project);
  a.write({ ...a.draft.values, name: 'private A' });
  assert.equal(new ProjectSettingsSession('actor-B', project).current, false);
  setDocumentDraftActor('actor-B');
  assert.equal(a.current, false); assert.equal(a.write({ name: 'late A' }), false); assert.equal(a.clear(), false);
  const b = new ProjectSettingsSession('actor-B', project); assert.equal(b.draft.values.name, project.name);
  setDocumentDraftActor('actor-A');
  assert.equal(new ProjectSettingsSession('actor-A', project).draft.values.name, project.name);
});
test('signout and full document replacement clear memory; same actor refresh does not', () => {
  const project = setup(), a = new ProjectSettingsSession('actor-A', project);
  a.write({ ...a.draft.values, name: 'same document only' });
  setDocumentDraftActor('actor-A'); assert.equal(new ProjectSettingsSession('actor-A', project).draft.values.name, 'same document only');
  setDocumentDraftActor(null); setDocumentDraftActor('actor-A');
  assert.equal(new ProjectSettingsSession('actor-A', project).draft.values.name, project.name);
  const last = new ProjectSettingsSession('actor-A', project); last.write({ name: 'reload clears' });
  setup(); assert.equal(new ProjectSettingsSession('actor-A', project).draft.values.name, project.name);
});
test('explicit cancel clears only its current generation', () => {
  const project = setup(), s = new ProjectSettingsSession('actor-A', project);
  s.write({ ...s.draft.values, name: 'cancel me' }); assert.equal(s.clear(), true);
  assert.equal(new ProjectSettingsSession('actor-A', project).draft.values.name, project.name);
});
test('late success cannot clear a newer same-project draft', () => {
  const project = setup(), first = new ProjectSettingsSession('actor-A', project);
  first.write({ ...first.draft.values, name: 'submitted' }); const submitted = first.generation;
  const second = new ProjectSettingsSession('actor-A', project); second.write({ ...second.draft.values, name: 'newer' });
  assert.equal(first.clear(submitted), false);
  assert.equal(new ProjectSettingsSession('actor-A', project).draft.values.name, 'newer');
});
test('baseline drift and disappearance retain exact raw values and report conflict', () => {
  const project = setup(), s = new ProjectSettingsSession('actor-A', project);
  s.write({ ...s.draft.values, width: '1e', description: 'pending' });
  assert.equal(projectSettingsConflict(s.draft, project), '');
  assert.match(projectSettingsConflict(s.draft, undefined), /不存在/);
  assert.match(projectSettingsConflict(s.draft, { ...project, description: 'remote change' }), /已變更/);
  assert.deepEqual(new ProjectSettingsSession('actor-A', project).draft.values, s.draft.values);
});
test('baseline detects same-time CAD changes but is insensitive to object key order', () => {
  const project = setup();
  assert.equal(projectSettingsRevision(project), projectSettingsRevision(Object.fromEntries(Object.entries(project).reverse()) as typeof project));
  assert.notEqual(projectSettingsRevision(project), projectSettingsRevision({ ...project, board: { ...project.board, gridSize: 7 } }));
});
test('raw values are not parsed until apply and invalid fields do not mutate inputs', () => {
  const project = setup(), raw = initialProjectSettings(project).values, before = structuredClone(raw);
  for (const update of [{ name: ' ' }, { width: '1e' }, { width: 'Infinity' }, { height: '1001' }, { status: 'unknown' }]) assert.equal(typeof parseProjectSettings({ ...raw, ...update }), 'string');
  assert.deepEqual(raw, before);
});
test('apply changes settings on the latest validated project only, keeping all other CAD fields', () => {
  const project = setup(), before = structuredClone(project), input = settings(project);
  const result = applyProjectSettings(project, projectSettingsRevision(project), input)!;
  assert.equal(result.name, 'Updated'); assert.equal(result.board.width, 120);
  assert.deepEqual(result.components, project.components); assert.deepEqual(result.keepouts, project.keepouts);
  assert.equal(result.createdAt, project.createdAt); assert.deepEqual(project, before);
  assert.equal(applyProjectSettings({ ...project, description: 'new server content' }, projectSettingsRevision(project), input), null);
});
test('reducer enforces permission, lock, active project and exact baseline even after the UI check', () => {
  const project = setup();
  const initial = createWorkspaceState({ projects: [project], activeProjectId: project.id, templates: [], library: [], updatedAt: project.updatedAt }, true);
  const action = { type: 'project/settings' as const, requestToken: 'synthetic-settings-request', projectId: project.id, baselineRevision: projectSettingsRevision(initial.activeProject), settings: settings(project) };
  const updated = reduceWorkspaceState(initial, action); assert.equal(updated.activeProject.name, 'Updated');
  const stale = reduceWorkspaceState(updated, { ...action, requestToken: 'stale' });
  assert.equal(stale.data, updated.data); assert.deepEqual(stale.projectSettingsReceipt, { requestToken: 'stale', accepted: false });
  for (const blocked of [{ ...initial, canEdit: false }, { ...initial, documentLocked: true }]) {
    const denied = reduceWorkspaceState(blocked, action);
    assert.equal(denied.data, blocked.data); assert.equal(denied.historyByProject, blocked.historyByProject);
    assert.deepEqual(denied.projectSettingsReceipt, { requestToken: action.requestToken, accepted: false });
  }
  const missing = reduceWorkspaceState(initial, { ...action, projectId: 'other-project' });
  assert.equal(missing.data, initial.data); assert.equal(missing.projectSettingsReceipt?.accepted, false);
  assert.equal(initial.activeProject.name, 'Synthetic project');
});

test('opening without editing creates no dirty checkpoint; cancel keeps other project draft', () => {
  const a = setup(), b = createBlankProject('B');
  const sa = new ProjectSettingsSession('actor-A', a), sb = new ProjectSettingsSession('actor-A', b);
  assert.equal(sa.generation, null);
  assert.equal(new ProjectSettingsSession('actor-A', a).generation, null);
  sa.write({ ...sa.draft.values, name: 'cancel A' }); sb.write({ ...sb.draft.values, name: 'keep B' });
  sa.cancel(); assert.equal(sa.write({ name: 'late callback' }), false);
  assert.equal(new ProjectSettingsSession('actor-A', a).generation, null);
  assert.equal(new ProjectSettingsSession('actor-A', b).draft.values.name, 'keep B');
});

test('gate-external unload warning is clean on open and ends only after explicit discard', () => {
  const project = setup(), s = new ProjectSettingsSession('actor-A', project);
  const warned = () => { let prevented = false; beforeUnload?.({ preventDefault: () => { prevented = true; }, returnValue: null }); return prevented; };
  assert.equal(warned(), false);
  s.write({ ...s.draft.values, name: 'unsaved dialog' }); assert.equal(warned(), true);
  const remounted = new ProjectSettingsSession('actor-A', project); assert.equal(warned(), true);
  remounted.cancel(); assert.equal(warned(), false);
});

test('exact action tokens distinguish accepted settings from a timestamp-only queued update', () => {
  const p = { ...setup(), name: 'Synthetic', updatedAt: '2026-01-01T00:00:00.000Z', projectGroup: '', revision: '1' };
  const prev = createWorkspaceState({ projects: [p], activeProjectId: p.id, templates: [], library: [], updatedAt: p.updatedAt }, true);
  const parsed = parseProjectSettings({ ...initialProjectSettings(prev.activeProject).values, name: '  Synthetic  ' });
  assert.notEqual(typeof parsed, 'string'); if (typeof parsed === 'string') return;
  const action = { type: 'project/settings' as const, requestToken: 'exact-request', projectId: p.id, baselineRevision: projectSettingsRevision(prev.activeProject), settings: parsed };
  const queued = reduceWorkspaceState(prev, { type: 'project/commit', update: { ...prev.activeProject } });
  const denied = reduceWorkspaceState(queued, action);
  assert.equal(denied.data, queued.data); assert.equal(denied.historyByProject, queued.historyByProject);
  assert.deepEqual(denied.projectSettingsReceipt, { requestToken: 'exact-request', accepted: false });
  assert.equal('projectSettingsReceipt' in denied.data, false);
  const accepted = reduceWorkspaceState(prev, action);
  assert.deepEqual(accepted.projectSettingsReceipt, { requestToken: 'exact-request', accepted: true });
  const hydrated = reduceWorkspaceState(accepted, { type: 'persistence/hydrate', data: prev.data });
  assert.deepEqual(hydrated.projectSettingsReceipt, { requestToken: 'exact-request', accepted: false });
  assert.equal(hydrated.activeProject.name, prev.activeProject.name);
  assert.equal('projectSettingsReceipt' in hydrated.data, false);
});
test('stale sessions cannot overwrite a newer generation or resurrect an explicitly cleared draft', () => {
  const project = setup(), old = new ProjectSettingsSession('actor-A', project);
  old.write({ ...old.draft.values, name: 'old' });
  const current = new ProjectSettingsSession('actor-A', project); current.write({ ...current.draft.values, name: 'new' });
  assert.equal(old.write({ ...old.draft.values, name: 'stale callback' }), false);
  assert.equal(new ProjectSettingsSession('actor-A', project).draft.values.name, 'new');
  current.cancel(); assert.equal(old.write({ ...old.draft.values, name: 'resurrection' }), false);
  assert.equal(new ProjectSettingsSession('actor-A', project).generation, null);
});
