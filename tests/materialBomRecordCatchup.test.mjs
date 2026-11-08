import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const storage = await readFile(new URL('../src/components/material-requests/materialBomStorage.ts', import.meta.url), 'utf8');
const start = storage.indexOf('export async function loadBomWorkspaceRecordChanges(');
const compiled = start < 0 ? '' : ts.transpileModule(storage.slice(start, storage.indexOf('export async function removeBomWorkspace(', start)), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sync = {};
new Function('exports', ts.transpileModule(await readFile(new URL('../src/components/material-requests/materialBomNoteSync.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(sync);

const stamp = '2026-11-08T01:00:00.000001Z';
function fixture(count = 3) {
  const records = Array.from({ length: count }, (_, index) => ({ id: `r${index}`, partNumber: `PN-${index}` }));
  return { id: 'qa-bom', updatedAt: 'complete-cache-revision', payload: { recordCount: count, records },
    recordMeta: Object.fromEntries(records.map(record => [record.id, { updatedAt: stamp }])) };
}
const database = workspace => workspace.payload.records.map((data, order_index) => ({ record_id: data.id, order_index, data, updated_at: stamp }));
function reader(rows, failAt = 0) {
  const calls = [], exports = {}, failure = new Error('isolated database read failed');
  const client = { from(table) {
    const call = { table, orders: [] };
    return { select(columns) { call.columns = columns; return this; }, eq(key, value) { call[key] = value; return this; },
      order(key) { call.orders.push(key); return this; }, range(from, to) { call.range = [from, to]; return this; },
      in(key, values) { call.ids = values; assert.equal(key, 'record_id'); return this; },
      abortSignal(signal) { call.signal = signal; return this; },
      then(resolve, reject) {
        calls.push(call);
        const data = call.ids ? rows.filter(row => call.ids.includes(row.record_id)) : rows.slice(call.range[0], call.range[1] + 1)
          .map(({ record_id, order_index, updated_at }) => ({ record_id, order_index, updated_at }));
        return Promise.resolve({ data: calls.length === failAt ? null : data, error: calls.length === failAt ? failure : null }).then(resolve, reject);
      } };
  } };
  new Function('supabaseClient', 'RECORD_TABLE', 'REMOTE_RECORD_FETCH_BATCH_SIZE', 'RECORD_BATCH_SIZE', 'timestampMicros', 'exports', compiled)(client, 'material_bom_records', 1000, 200, sync.timestampMicros, exports);
  return { calls, failure, read: workspace => exports.loadBomWorkspaceRecordChanges(workspace) };
}

test('unchanged or equivalent UTC row versions use only the lightweight metadata read', async () => {
  const workspace = fixture(), rows = database(workspace);
  rows[0].updated_at = '2026-11-08T01:00:00.000001+00:00';
  const e = reader(rows);
  assert.deepEqual(await e.read(workspace), { workspaceIds: [workspace.id], records: [] });
  assert.equal(e.calls.length, 1);
  assert.equal(e.calls[0].columns, 'record_id, updated_at, order_index');
  assert.equal(e.calls[0].workspace_id, workspace.id);
  assert.deepEqual(e.calls[0].orders, ['order_index', 'record_id']);
  assert.ok(e.calls[0].signal instanceof AbortSignal);
});

test('a missed single-row update fetches only its full row and does not advance the whole cache revision', async () => {
  const workspace = fixture(), rows = database(workspace), original = JSON.stringify(workspace);
  rows[1] = { ...rows[1], data: { ...rows[1].data, partNumber: 'LIVE-PN' }, updated_at: '2026-11-08T01:00:00.000002Z' };
  const e = reader(rows), change = await e.read(workspace);
  assert.deepEqual(e.calls[1].ids, ['r1']);
  assert.equal(e.calls.length, 2);
  assert.equal(e.calls[0].signal, e.calls[1].signal);
  assert.deepEqual(change.records, [{ workspaceId: workspace.id, recordId: 'r1', orderIndex: 1,
    snapshot: { record: rows[1].data, recordMeta: { updatedAt: rows[1].updated_at } } }]);
  assert.equal(JSON.stringify(workspace), original);
});

test('an invalid local revision is read again instead of being treated as an unchanged row', async () => {
  const workspace = fixture(), rows = database(workspace);
  workspace.recordMeta.r1.updatedAt = 'invalid';
  const e = reader(rows);
  assert.equal((await e.read(workspace)).records.length, 1);
  assert.deepEqual(e.calls[1].ids, ['r1']);
});

test('record count, identity or order changes invalidate the BOM without reading full rows', async () => {
  const workspace = fixture(), rows = database(workspace);
  for (const changed of [rows.slice(1), rows.map((row, i) => i === 1 ? { ...row, record_id: 'new-row' } : row), [{ ...rows[1], order_index: 0 }, { ...rows[0], order_index: 1 }, rows[2]]]) {
    const e = reader(changed);
    assert.deepEqual(await e.read(workspace), { workspaceIds: [workspace.id], records: [], invalidatedWorkspaceIds: [workspace.id] });
    assert.equal(e.calls.length, 1);
  }
});

test('duplicate or non-contiguous source order indexes do not invalidate a BOM whose ordered IDs are unchanged', async () => {
  const workspace = fixture(), rows = database(workspace).map((row, index) => ({ ...row, order_index: [7, 7, 15][index] }));
  const unchanged = reader(rows);
  assert.deepEqual(await unchanged.read(workspace), { workspaceIds: [workspace.id], records: [] });
  assert.equal(unchanged.calls.length, 1);
  rows[1] = { ...rows[1], data: { ...rows[1].data, partNumber: 'DUPLICATE-ORDER-LIVE' }, updated_at: '2026-11-08T02:00:00Z' };
  const changed = reader(rows), result = await changed.read(workspace);
  assert.equal(result.invalidatedWorkspaceIds, undefined);
  assert.equal(result.records[0].recordId, 'r1');
  assert.equal(result.records[0].snapshot.record.partNumber, 'DUPLICATE-ORDER-LIVE');
  assert.deepEqual(changed.calls[1].ids, ['r1']);
});

test('large BOM metadata is paginated and changed full rows stay in bounded batches', async () => {
  const workspace = fixture(1005), rows = database(workspace);
  for (let index = 0; index < 201; index++) rows[index].updated_at = '2026-11-08T02:00:00Z';
  const e = reader(rows), change = await e.read(workspace);
  assert.deepEqual(e.calls.slice(0, 2).map(call => call.range), [[0, 999], [1000, 1999]]);
  assert.deepEqual(e.calls.slice(2).map(call => call.ids.length), [200, 1]);
  assert.equal(change.records.length, 201);
});

test('metadata and changed-row read errors propagate for the caller to retry', async () => {
  const workspace = fixture(), rows = database(workspace);
  rows[0].updated_at = '2026-11-08T02:00:00Z';
  for (const failAt of [1, 2]) {
    const e = reader(rows, failAt);
    await assert.rejects(e.read(workspace), error => error === e.failure);
  }
});
