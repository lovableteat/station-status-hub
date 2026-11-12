import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const modelSource = await readFile(new URL('../src/components/maintenance/maintenanceModel.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(modelSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const model = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
let fixtureVersion = 0;
async function fixture(t) {
  const original = globalThis.window;
  globalThis.window = { location: { origin: 'http://127.0.0.1:12345' } };
  t.after(() => { if (original === undefined) delete globalThis.window; else globalThis.window = original; });
  const { supabase, SUPABASE_URL } = await import(`./support/mobileAppMock.mjs?test=${++fixtureVersion}`);
  return { supabase, SUPABASE_URL, db: window.__AUDIT_DB__, calls: window.__AUDIT_CALLS__ };
}

test('full-app maintenance fixture fulfills the current workspace/model contract', async t => {
  const { supabase, db, calls, SUPABASE_URL } = await fixture(t);
  const projectId = db.test_projects[0].id;
  const { data, error } = await supabase.rpc('maintenance_workspace', { p_project_id: projectId });
  assert.equal(error, null);
  assert.deepEqual(Object.keys(data).sort(), ['categories', 'issues', 'people', 'systems']);
  assert.equal(data.issues.length, 12);
  assert.equal(data.systems.length, 14);
  assert.equal(data.people.length, 12);
  assert.deepEqual(data.categories.sort(), ['電源', '韌體']);
  for (const issue of data.issues) {
    assert.equal(issue.project_id, projectId);
    assert.ok(Array.isArray(issue.assignee_user_ids));
    assert.ok(data.systems.some(system => system.id === issue.system_id));
    assert.match(model.assetLabel(issue), /^AUDIT-SERIAL-\d+$/);
    assert.equal(model.ownerLabel(issue, data.people), '陳工程師');
  }
  assert.equal(model.filterFaults(data.issues, model.readFaultFilters('')).length, 12);
  const stats = model.buildFaultStatistics(data.issues);
  assert.equal(stats.machines.length, 12);
  assert.equal(stats.unidentified, 0);
  assert.equal(stats.categories.reduce((total, category) => total + category.total, 0), 12);
  assert.equal(SUPABASE_URL, 'http://127.0.0.1:12345/mock-only');
  assert.deepEqual(calls, [{ rpc: 'maintenance_workspace', args: { p_project_id: projectId } }]);
});

test('maintenance RPC scopes projects and returns independent snapshots', async t => {
  const { supabase, db } = await fixture(t);
  const projectId = db.test_projects[0].id;
  db.issues.push({ ...db.issues[0], id: 'other-issue', project_id: 'other-project', category: '其他專案分類' });
  db.test_systems.push({ ...db.test_systems[0], id: 'other-system', project_id: 'other-project' });
  db.system_users.push({ ...db.system_users[0], id: 'disabled-person', status: 'inactive' });
  const first = await supabase.rpc('maintenance_workspace', { p_project_id: projectId });
  assert.equal(first.data.issues.length, 12);
  assert.equal(first.data.systems.length, 14);
  assert.equal(first.data.people.length, 12);
  assert.ok(!first.data.categories.includes('其他專案分類'));
  first.data.issues[0].title = 'Client-only edit';
  const second = await supabase.rpc('maintenance_workspace', { p_project_id: projectId });
  assert.notEqual(second.data.issues[0].title, 'Client-only edit');
  const other = await supabase.rpc('maintenance_workspace', { p_project_id: 'other-project' });
  assert.deepEqual(other.data.issues.map(issue => issue.id), ['other-issue']);
  assert.deepEqual(other.data.systems.map(system => system.id), ['other-system']);
  const missing = await supabase.rpc('maintenance_workspace', { p_project_id: 'missing' });
  assert.deepEqual(missing.data.issues, []);
  assert.deepEqual(missing.data.systems, []);
  assert.deepEqual(missing.data.categories, []);
});

test('maintenance threads return scoped messages and attachments, including empty threads', async t => {
  const { supabase, db } = await fixture(t);
  assert.deepEqual((await supabase.rpc('maintenance_thread', { p_issue_id: 'issue-0' })).data, { messages: [], attachments: [] });
  db.maintenance_messages.push({ id: 'note-0', issue_id: 'issue-0', body: '隔離記錄' }, { id: 'note-1', issue_id: 'issue-1', body: '其他故障' });
  db.issue_attachments.push({ id: 'file-0', issue_id: 'issue-0', file_name: 'audit.png' }, { id: 'file-1', issue_id: 'issue-1', file_name: 'other.png' });
  const { data, error } = await supabase.rpc('maintenance_thread', { p_issue_id: 'issue-0' });
  assert.equal(error, null);
  assert.deepEqual(data.messages.map(message => message.id), ['note-0']);
  assert.deepEqual(data.attachments.map(file => file.id), ['file-0']);
});

test('project summaries remain compatible and unimplemented maintenance RPCs fail explicitly', async t => {
  const { supabase, db } = await fixture(t);
  const { data, error } = await supabase.rpc('get_test_project_summaries');
  assert.equal(error, null);
  assert.deepEqual(data, [{ project_id: db.test_projects[0].id, machine_count: 14, active_machine_count: 9, open_issue_count: 12, flow_version_label: 'Audit flow' }]);
  const unknown = await supabase.rpc('maintenance_unimplemented', { p_project_id: db.test_projects[0].id });
  assert.equal(unknown.data, null);
  assert.equal(unknown.error.code, 'AUDIT_FIXTURE_UNIMPLEMENTED');
  assert.match(unknown.error.message, /maintenance_unimplemented/);
  assert.deepEqual((await supabase.from('issues').select('*')).data.map(issue => issue.id), db.issues.map(issue => issue.id));
});
