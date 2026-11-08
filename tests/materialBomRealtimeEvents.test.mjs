import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { RealtimeClient } from '@supabase/realtime-js';

const source = await readFile(new URL('../src/components/material-requests/materialBomStorage.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source.slice(source.indexOf('export function subscribeBomWorkspaceChanges(')), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tables = ['material_bom_workspaces', 'material_bom_records', 'ui_table_preferences'];
const prefixes = ['material-bom-project:', 'material-bom-page-tracker:', 'material-bom-table-color-theme:'];

function loadSubscribe(client, schedule = setTimeout, cancel = clearTimeout) {
  const exports = {};
  new Function('supabaseClient', 'supabase', 'WORKSPACE_TABLE', 'RECORD_TABLE', 'PREFERENCE_TABLE',
    'BOM_PREFERENCE_KEY_PREFIXES', 'getBomPreferenceWorkspaceId', 'setTimeout', 'clearTimeout', 'exports', compiled)(
    client, client, ...tables, prefixes,
    (key, candidates) => { const prefix = candidates.find(value => key.startsWith(value)); return prefix ? key.slice(prefix.length) : null; },
    schedule, cancel, exports,
  );
  return exports.subscribeBomWorkspaceChanges;
}

function subscription() {
  const handlers = new Map(), changes = [], removed = [], statuses = [];
  let timer, notifyStatus;
  const channel = { on(_event, { table }, callback) { handlers.set(table, callback); return this; }, subscribe(callback) { notifyStatus = callback; return this; } };
  const client = { channel: () => channel, removeChannel: value => removed.push(value) };
  const subscribe = loadSubscribe(client, callback => { timer = callback; return 1; }, () => { timer = undefined; });
  const unsubscribe = subscribe(change => changes.push(change), (status, error) => statuses.push({ status, error }));
  return { changes, removed, statuses, unsubscribe, status: (status, error) => notifyStatus?.(status, error), emit: (table, payload) => handlers.get(table)(payload),
    flush() { const callback = timer; timer = undefined; callback?.(); } };
}

const header = id => ({ id, name: 'QA BOM', source_file: 'QA.xlsx', sheet_name: 'BOM',
  generated_at: '2026-11-08T00:00:00Z', record_count: 3000, updated_at: '2026-11-08T01:00:00Z' });

test('revision touches, complete record snapshots and preferences remain distinct in one realtime batch', () => {
  const s = subscription();
  s.emit(tables[0], { eventType: 'UPDATE', old: { id: 'bom-a' }, new: header('bom-a') });
  s.emit(tables[0], { eventType: 'UPDATE', old: { id: 'bom-a' }, new: { ...header('bom-a'), updated_at: '2026-11-08T01:00:01Z' } });
  const record = { id: 'r1', note: 'shared', trackingStatus: '已完成', requestOwnerName: 'CE' };
  s.emit(tables[1], { eventType: 'UPDATE', new: { workspace_id: 'bom-a', record_id: 'r1',
    order_index: 4, data: record, updated_at: '2026-11-08T01:00:01.000013Z' } });
  s.emit(tables[2], { eventType: 'UPDATE', new: { table_key: 'material-bom-page-tracker:bom-a' } });
  s.flush();
  assert.equal(s.changes.length, 1);
  assert.deepEqual(s.changes[0], { workspaceIds: ['bom-a'], records: [{ workspaceId: 'bom-a', recordId: 'r1', orderIndex: 4,
    snapshot: { record, recordMeta: { updatedAt: '2026-11-08T01:00:01.000013Z' } } }],
    workspaceHeaders: [{ id: 'bom-a', name: 'QA BOM', sourceFile: 'QA.xlsx', sheetName: 'BOM',
      generatedAt: '2026-11-08T00:00:00Z', recordCount: 3000 }], preferenceWorkspaceIds: ['bom-a'], invalidatedWorkspaceIds: [] });
  s.unsubscribe();
  assert.equal(s.removed.length, 1);
});

test('subscription status is forwarded only while its listener is active', () => {
  const s = subscription(), error = new Error('isolated join failure');
  s.status('SUBSCRIBED');
  s.status('CHANNEL_ERROR', error);
  s.status('TIMED_OUT');
  assert.deepEqual(s.statuses, [{ status: 'SUBSCRIBED', error: undefined }, { status: 'CHANNEL_ERROR', error }, { status: 'TIMED_OUT', error: undefined }]);
  s.unsubscribe();
  s.status('CLOSED');
  assert.equal(s.statuses.length, 3, 'a delayed cleanup acknowledgement must not update the next subscription');
});

test('the installed SDK reuses a leaving fixed-topic channel; each BOM subscription must get a fresh channel', () => {
  const sdk = new RealtimeClient('ws://127.0.0.1:9/realtime/v1', { params: { apikey: 'isolated-no-network-check' } });
  sdk.isConnected = () => true;
  const old = sdk.channel('material_bom_workspace_changes');
  old.state = 'leaving';
  const reused = sdk.channel('material_bom_workspace_changes');
  let callbacks = 0;
  reused.subscribe(() => { callbacks += 1; });
  assert.equal(reused, old);
  assert.equal(reused.state, 'leaving');
  assert.equal(callbacks, 0, 'the installed SDK silently skips joining the leaving instance');

  const channels = [], getChannel = sdk.channel.bind(sdk);
  sdk.channel = topic => {
    const channel = getChannel(topic);
    channels.push(channel);
    channel.subscribe = () => channel;
    return channel;
  };
  sdk.removeChannel = async channel => { channel.state = 'leaving'; };
  const subscribe = loadSubscribe(sdk);
  const firstCleanup = subscribe(() => {});
  firstCleanup();
  const secondCleanup = subscribe(() => {});
  try {
    assert.ok(channels[0] !== channels[1], 'the second subscription must not reuse the leaving channel');
    assert.notEqual(channels[0].topic, channels[1].topic);
    assert.equal(channels[1].state, 'closed');
  } finally { secondCleanup(); }
});

test('structural or incomplete changes invalidate only their BOM and do not leak into the next batch', () => {
  const s = subscription();
  s.emit(tables[0], { eventType: 'INSERT', new: header('created') });
  s.emit(tables[0], { eventType: 'DELETE', old: { id: 'removed' } });
  s.emit(tables[0], { eventType: 'UPDATE', new: { id: 'incomplete' } });
  s.emit(tables[1], { eventType: 'INSERT', new: { workspace_id: 'new-row', record_id: 'r2' } });
  s.emit(tables[1], { eventType: 'DELETE', old: { workspace_id: 'deleted-row', record_id: 'r3' } });
  s.emit(tables[1], { eventType: 'UPDATE', new: { workspace_id: 'missing-payload', record_id: 'r4' } });
  s.emit(tables[1], { eventType: 'UPDATE', new: { workspace_id: 'missing-id' } });
  s.emit(tables[2], { eventType: 'UPDATE', new: { table_key: 'material-bom-project:prefs-only' } });
  s.flush();
  assert.deepEqual(s.changes[0].invalidatedWorkspaceIds,
    ['created', 'removed', 'incomplete', 'new-row', 'deleted-row', 'missing-payload', 'missing-id']);
  assert.deepEqual(s.changes[0].preferenceWorkspaceIds, ['prefs-only']);
  assert.deepEqual(s.changes[0].workspaceHeaders, []);
  s.emit(tables[0], { eventType: 'UPDATE', new: header('next') });
  s.flush();
  assert.deepEqual(s.changes[1].workspaceIds, ['next']);
  assert.deepEqual(s.changes[1].records, []);
  assert.deepEqual(s.changes[1].invalidatedWorkspaceIds, []);
  assert.deepEqual(s.changes[1].preferenceWorkspaceIds, []);
  s.emit(tables[0], { eventType: 'UPDATE', new: header('cancelled') });
  s.unsubscribe();
  s.flush();
  s.emit(tables[0], { eventType: 'UPDATE', new: header('after-cleanup') });
  s.flush();
  assert.equal(s.changes.length, 2, 'unsubscribing discards the pending debounce');
});
