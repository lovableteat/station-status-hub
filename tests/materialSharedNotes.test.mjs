import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const storage = await readFile(new URL('../src/components/material-requests/materialBomStorage.ts', import.meta.url), 'utf8');
const block = storage.slice(storage.indexOf('export async function saveBomWorkspaceNote('), storage.indexOf('export async function saveBomWorkspacePageTracker('));
const compiled = ts.transpileModule(block, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
class Conflict extends Error {}
function editor(response, assertWrite = () => {}) {
  const calls = [], caches = [], exports = {};
  new Function('supabaseClient', 'BomRecordConflictError', 'patchCachedWorkspace', 'exports', compiled)(
    { rpc: async (...args) => { calls.push(args); return response; } }, Conflict,
    (value) => { caches.push(value); }, exports,
  );
  const record = { id: 'r1', note: 'previous', name: 'stale name' };
  const workspace = { id: 'bom-a', payload: { records: [record, { id: 'r2' }] } };
  return { calls, caches, save: () => exports.saveBomWorkspaceNote(workspace, record, 'shared note', assertWrite) };
}

test('Note sends only its value and conflict baseline, and caches the server row', async () => {
  const saved = { id: 'r1', note: 'shared note', name: 'newer server name' };
  const e = editor({ data: { data: saved, updated_at: 'server-stamp' }, error: null });
  assert.deepEqual(await e.save(), { record: saved, recordMeta: { updatedAt: 'server-stamp' } });
  assert.deepEqual(e.calls, [['save_material_bom_note', { p_workspace_id: 'bom-a', p_record_id: 'r1', p_note: 'shared note', p_expected_note: 'previous' }]]);
  assert.deepEqual(e.caches[0].payload.records, [saved, { id: 'r2' }]);
  assert.equal(e.caches[0].updatedAt, 'server-stamp');
});

test('a newer Note is reported as a conflict and is never cached over', async () => {
  const e = editor({ data: null, error: { code: '40001' } });
  await assert.rejects(e.save(), Conflict);
  assert.equal(e.caches.length, 0);
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
