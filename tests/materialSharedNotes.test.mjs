import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const storage = await readFile(new URL('../src/components/material-requests/materialBomStorage.ts', import.meta.url), 'utf8');
const block = storage.slice(storage.indexOf('export async function saveBomWorkspaceNote('), storage.indexOf('export async function saveBomWorkspacePageTracker('));
const compiled = ts.transpileModule(block, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const noteSync = await readFile(new URL('../src/components/material-requests/materialBomNoteSync.ts', import.meta.url), 'utf8');
const syncExports = {};
new Function('exports', ts.transpileModule(noteSync, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(syncExports);
const { applyBomNoteSnapshot, applyRealtimeBomRecords, mergeBomWorkspaceRecords } = syncExports;
class Conflict extends Error {}
function editor(response, assertWrite = () => {}) {
  const calls = [], caches = [], exports = {};
  const record = { id: 'r1', note: 'previous', name: 'stale name' };
  const workspace = { id: 'bom-a', updatedAt: 'cached-workspace-revision', payload: { records: [record, { id: 'r2' }] } };
  new Function('supabaseClient', 'BomRecordConflictError', 'patchCachedWorkspaceFields', 'applyBomNoteSnapshot', 'exports', compiled)(
    { rpc: async (...args) => { calls.push(args); return response; } }, Conflict,
    (id, patch) => { assert.equal(id, workspace.id); caches.push(patch(workspace)); }, applyBomNoteSnapshot, exports,
  );
  return { calls, caches, save: () => exports.saveBomWorkspaceNote(workspace.id, record.id, 'shared note', record.note, assertWrite) };
}

test('Note sends only its value and conflict baseline, and caches the server row', async () => {
  const saved = { id: 'r1', note: 'shared note', name: 'newer server name' };
  const e = editor({ data: { data: saved, updated_at: 'server-stamp' }, error: null });
  assert.deepEqual(await e.save(), { record: saved, recordMeta: { updatedAt: 'server-stamp' } });
  assert.deepEqual(e.calls, [['save_material_bom_note', { p_workspace_id: 'bom-a', p_record_id: 'r1', p_note: 'shared note', p_expected_note: 'previous' }]]);
  assert.deepEqual(e.caches[0].payload.records, [saved, { id: 'r2' }]);
  assert.equal(e.caches[0].updatedAt, 'cached-workspace-revision');
});

test('a newer Note is reported as a conflict and is never cached over', async () => {
  const e = editor({ data: null, status: 409, error: { code: '40001' } });
  await assert.rejects(e.save(), Conflict);
  assert.equal(e.caches.length, 0);
});

test('Realtime applies Note and other record fields in place and ignores a late response for the same row', () => {
  const first = { id: 'r1', name: 'original A', note: 'previous' };
  const second = { id: 'r2', name: 'original B', note: 'unchanged' };
  const workspace = { id: 'bom-a', payload: { records: [first, second] },
    recordMeta: { r1: { updatedAt: '2026-11-07T01:02:03.000011+00:00' } } };
  const update = (record, orderIndex, updatedAt) => ({
    workspaceId: 'bom-a', recordId: record.id, orderIndex, snapshot: { record, recordMeta: { updatedAt } },
  });
  const note = update({ ...first, note: 'shared immediately' }, 0, '2026-11-07T01:02:03.000013Z');
  const other = update({ ...second, name: 'other fields changed' }, 1, '2026-11-07T01:02:04Z');
  const merged = applyRealtimeBomRecords(workspace, [note, other]);
  assert.deepEqual(merged.workspace.payload.records, [note.snapshot.record, other.snapshot.record]);
  assert.deepEqual(merged.pendingRecordIds, []);
  const late = update({ ...first, note: 'stale response' }, 0, '2026-11-07T01:02:03.000012+00:00');
  assert.equal(applyBomNoteSnapshot(merged.workspace, late.snapshot), merged.workspace);
  assert.deepEqual(applyRealtimeBomRecords(merged.workspace, [late]), { workspace: merged.workspace, pendingRecordIds: [] });
});

test('structural or incomplete changes request a background read; other BOMs and untouched rows retain identity', () => {
  const first = { id: 'r1', partNumber: 'old' }, second = { id: 'r2' };
  const workspace = { id: 'bom-a', payload: { records: [first, second] } };
  const change = { workspaceId: 'bom-a', recordId: first.id, orderIndex: 0, snapshot: { record: { ...first, partNumber: 'new' }, recordMeta: { updatedAt: '2026-11-08T01:00:00Z' } } };
  const merged = applyRealtimeBomRecords(workspace, [change]);
  assert.equal(merged.workspace.payload.records[1], second);
  assert.equal(applyRealtimeBomRecords(workspace, [{ ...change, workspaceId: 'bom-b' }]).workspace, workspace);
  for (const unresolved of [{ ...change, snapshot: undefined }, { ...change, orderIndex: 1 }, { ...change, recordId: 'new' }]) {
    assert.deepEqual(applyRealtimeBomRecords(workspace, [unresolved]), { workspace, pendingRecordIds: [unresolved.recordId] });
  }
});

test('background reads preserve newer live rows but discard unsaved optimistic data at the same revision', () => {
  const old = '2026-11-08T01:00:00.000001Z', newer = '2026-11-08T01:00:00.000002Z';
  const loaded = { id: 'bom-a', updatedAt: 'loaded', payload: { records: [{ id: 'r1', partNumber: 'server' }] }, recordMeta: { r1: { updatedAt: old } } };
  const current = { ...loaded, payload: { records: [{ id: 'r1', partNumber: 'live' }] }, recordMeta: { r1: { updatedAt: newer } } };
  assert.equal(mergeBomWorkspaceRecords(loaded, current).payload.records[0], current.payload.records[0]);
  assert.equal(mergeBomWorkspaceRecords(loaded, current).updatedAt, loaded.updatedAt);
  assert.equal(mergeBomWorkspaceRecords(loaded, { ...current, recordMeta: loaded.recordMeta }), loaded);
});

test('revoked account scope prevents writes and discards late responses', async () => {
  const rejected = editor({}, () => { throw new Error('scope changed'); });
  await assert.rejects(rejected.save(), /scope changed/);
  assert.equal(rejected.calls.length, 0);
  let checks = 0;
  const late = editor({ data: { data: { id: 'r1', note: 'shared note' }, updated_at: 'stamp' } }, () => { if (++checks > 1) throw new Error('scope changed'); });
  await assert.rejects(late.save(), /scope changed/);
  assert.equal(late.caches.length, 0);
});
