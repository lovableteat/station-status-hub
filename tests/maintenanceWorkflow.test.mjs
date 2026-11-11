import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/components/maintenance/maintenanceModel.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const model = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const issue = (id, extra = {}) => ({ id, title: '無法開機', description: '', status: 'open', assigned_to: null, assignee_user_ids: [], asset_identifier: 'GB300-021', system_id: null, category: null, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-10T00:00:00Z', ...extra });

test('controlled report closure returns focus to its real opener without moving the page', async () => {
  const report = await readFile(new URL('../src/components/maintenance/MaintenanceReport.tsx', import.meta.url), 'utf8');
  const workspace = await readFile(new URL('../src/components/maintenance/MaintenanceWorkspace.tsx', import.meta.url), 'utf8');
  assert.match(report, /onCloseAutoFocus=\{event => \{ event\.preventDefault\(\); onExited\(\); \}\}/);
  assert.match(workspace, /<Button ref=\{reportTriggerRef\} onClick=\{\(\) => setReport/);
  assert.match(workspace, /reportTriggerRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(workspace, /previous\.session === report\.session && !previous\.open/);
});

test('old issue statuses and old assignee text remain visible without inventing identities', () => {
  assert.equal(model.getFaultStatus(issue('A')), 'pending');
  assert.equal(model.getFaultStatus(issue('B', { status: 'closed' })), 'resolved');
  assert.equal(model.getFaultStatus(issue('C', { status: 'in_progress' })), 'repairing');
  assert.equal(model.getFaultStatus(issue('D', { maintenance_status: 'waiting_parts' })), 'waiting_parts');
  assert.equal(model.ownerLabel(issue('E', { assigned_to: '舊工程師' }), []), '舊工程師');
  assert.equal(model.ownerLabel(issue('F'), []), '未分派');
  assert.equal(model.ownerLabel(issue('G', { assigned_to: '停用前姓名', assignee_user_ids: ['disabled'] }), []), '停用前姓名');
});

test('same-machine rows stay together, secondary assignees match mine and resolved issues are excluded by default', () => {
  const rows = [issue('A', { asset_identifier: 'GB300-10' }), issue('B', { assignee_user_ids: ['A', 'B'] }), issue('C', { status: 'resolved' }), issue('D', { asset_identifier: 'GB300-10' })];
  assert.deepEqual(model.filterFaults(rows, model.readFaultFilters(''), { userId: 'B', displayName: 'B', username: 'b' }).map(x => x.id), ['A', 'D', 'B']);
  assert.deepEqual(model.filterFaults(rows, { ...model.readFaultFilters(''), owner: 'me' }, { userId: 'B' }).map(x => x.id), ['B']);
});

test('filter links restore every condition and clearing retains project and navigation context', () => {
  const url = new URL('https://example.test/?workspace=station-status&module=issues&project=P&openIssue=A&faultStatus=waiting_parts&faultOwner=unassigned&faultQuery=PSU');
  const filters = model.readFaultFilters(url.search);
  assert.equal(filters.status, 'waiting_parts'); assert.equal(filters.owner, 'unassigned'); assert.equal(filters.query, 'PSU');
  model.writeFaultFilters(url, { query: '', status: 'all', owner: 'all', category: '', machine: '' });
  assert.equal(url.searchParams.get('project'), 'P'); assert.equal(url.searchParams.get('module'), 'issues');
  assert.equal(url.searchParams.has('faultStatus'), false); assert.equal(url.searchParams.has('faultOwner'), false); assert.equal(url.searchParams.has('openIssue'), true);
});

test('unknown machine identifiers group consistently and dashboard includes completed fault history', () => {
  const rows = [issue('A'), issue('B', { asset_identifier: ' gb300-021 ', status: 'resolved', category: '電源' }), issue('C', { asset_identifier: 'GB300-034', category: '電源' })];
  const stats = model.buildFaultStatistics(rows);
  assert.equal(stats.machines[0].total, 2); assert.equal(stats.machines[0].open, 1);
  assert.equal(stats.categories.find(x => x.name === '電源').total, 2);
  assert.equal(stats.categories.find(x => x.name === '未分類').total, 1);
  assert.equal(rows[1].asset_identifier, ' gb300-021 ');
  const unknown = model.buildFaultStatistics([issue('D', { asset_identifier: null }), issue('E', { asset_identifier: null })]);
  assert.equal(unknown.machines.length, 0); assert.equal(unknown.unidentified, 2);
  assert.equal(model.readFaultFilters('?issueSearch=SSD&issueStatus=in_progress').status, 'repairing');
  assert.equal(model.readFaultFilters('?issueSearch=SSD').query, 'SSD');
});
