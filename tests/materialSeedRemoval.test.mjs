import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { mergeBomWorkspaceRecords } from '../src/components/material-requests/materialBomNoteSync.ts';
import { canReuseBomPayloadReference } from '../src/components/material-requests/materialBomPerformance.ts';

const source = fs.readFileSync(new URL('../src/components/material-requests/MaterialRequestPage.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('MaterialRequestPage.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map(), handlers = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(ast));
  if (ts.isVariableDeclaration(node) && node.initializer) handlers.set(node.name.getText(ast), node.initializer.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
const plain = value => JSON.parse(JSON.stringify(value));
function run(source, context) {
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
}
function localFactory(saved) {
  const raw = saved === undefined ? null : typeof saved === 'string' ? saved : JSON.stringify(saved);
  const reads = [], writes = [];
  const context = {
    window: { localStorage: {
      getItem(key) { reads.push(key); return raw; },
      setItem(...args) { writes.push(args); throw Error('Local records must not be overwritten'); },
      removeItem(...args) { writes.push(args); throw Error('Local records must not be removed'); },
    } },
    LOCAL_CHANGES_KEY: 'legacy-local-records', DEFAULT_BOM_ID: 'legacy-default-id',
    DEFAULT_BOM_TABLE_COLOR_THEME: { primary: '#123456' },
  };
  run(functions.get('loadSavedChanges') + '\n' + functions.get('createDefaultBomWorkspace'), context);
  return { workspace: plain(context.createDefaultBomWorkspace()), raw, reads, writes };
}
const row = (id, fields = {}) => ({ id, name: `Synthetic ${id}`, note: 'User note', trackingHistory: [{ id: 'history', note: 'Keep this' }], ...fields });
const workspace = (id, records = [row('one')]) => ({ id, name: id, payload: { sourceFile: 'Synthetic.xlsx', generatedAt: '2026-01-01T00:00:00.000Z', records, recordCount: records.length }, updatedAt: '2026-01-01T00:00:00.000Z' });
function pageHandler(name, overrides = {}) {
  let state = [workspace('existing')], active = 'existing';
  const writes = [], effects = [];
  const context = {
    user: { userId: 'owner' }, bomAccountRef: { current: { accountId: 'owner', generation: 0 } },
    useCallback: callback => callback,
    setBomWorkspaces(next) { state = typeof next === 'function' ? next(state) : next; effects.push('state'); },
    setActiveBomId(next) { active = typeof next === 'function' ? next(active) : next; effects.push('active'); },
    createDefaultBomWorkspace: () => localFactory().workspace,
    loadActiveBomId: () => 'existing', mergeBomWorkspaceRecords, canReuseBomPayloadReference,
    captureBomWrite: () => ({}), isBomWriteCurrent: () => true, assertBomWriteCurrent() {},
    saveBomWorkspace: async value => { writes.push(['save', value]); },
    isCollaborativeReady: true, bomWorkspaces: state, activeBomId: active,
    showCollaborativeUnavailableToast: () => effects.push('offline'),
    switchActiveBom: value => { active = value; },
    removeBomWorkspace: async id => { writes.push(['delete', id]); },
    logMaterialWorkspaceAction: async () => effects.push('audit'),
    reloadBomWorkspaces: async () => effects.push('reload'), toast: () => effects.push('toast'),
    ...overrides,
  };
  run('var action = ' + handlers.get(name), context);
  return { action: context.action, context, writes, effects, get state() { return state; }, get active() { return active; } };
}

test('real business seed is absent from source and the page has no bundled fallback import', () => {
  assert.equal(fs.existsSync(new URL('../src/data/materialRequestSeed.json', import.meta.url)), false);
  assert.doesNotMatch(source, /materialRequestSeed|loadDefaultBomWorkspace/);
  for (const file of ['materialWorkspaceMock.js', 'vendorMailFixture.jsx']) {
    const fixture = fs.readFileSync(new URL(`./support/${file}`, import.meta.url), 'utf8');
    assert.match(fixture, /materialWorkbook\.synthetic\.json/);
  }
});

test('a new browser gets an empty local placeholder, with no storage writes', () => {
  const result = localFactory();
  assert.equal(result.workspace.payload.recordCount, 0);
  assert.deepEqual(result.workspace.payload.records, []);
  assert.equal(result.workspace.name, '尚未匯入 BOM');
  assert.deepEqual(result.writes, []);
});

test('legacy local additions, edits, notes and history remain recoverable without altering storage', () => {
  const saved = { added: [row('added')], updated: { edited: row('edited', { note: 'Unsynced private edit' }) } };
  const original = JSON.stringify(saved), result = localFactory(saved);
  assert.equal(result.raw, original);
  assert.equal(JSON.stringify(saved), original);
  assert.deepEqual(result.workspace.payload.records, [saved.added[0], saved.updated.edited]);
  assert.equal(result.workspace.payload.recordCount, 2);
  assert.equal(result.workspace.name, '本機保留的 BOM 修改');
  assert.deepEqual(result.writes, []);
});

test('malformed legacy storage does not crash or get erased', () => {
  for (const saved of ['not JSON', { added: [null], updated: { bad: null } }]) {
    const result = localFactory(saved);
    assert.equal(result.workspace.payload.recordCount, 0);
    assert.deepEqual(result.writes, []);
  }
});

for (const editable of [true, false]) test(`empty remote directory never auto-creates or overwrites shared BOMs (${editable ? 'editor' : 'viewer'})`, async () => {
  const page = pageHandler('applyLoadedWorkspaces', {
    captureBomWrite() { if (!editable) throw Error('Viewer'); return {}; },
  });
  page.action([]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(page.writes, []);
  assert.equal(page.state[0].payload.recordCount, 0);
});

test('existing remote BOMs and their IDs, notes, tracking and preferred selection are preserved without writes', () => {
  const records = [row('original', { specDocuments: [{ path: 'private/original.pdf' }] }), row('added-later')];
  const remote = [workspace('existing', records), workspace('second', [row('other')])];
  const original = JSON.stringify(remote), page = pageHandler('applyLoadedWorkspaces');
  page.action(remote, 'second');
  assert.deepEqual(plain(page.state), remote);
  assert.equal(JSON.stringify(remote), original);
  assert.equal(page.active, 'second');
  assert.deepEqual(page.writes, []);
});

test('a late response from a previous account cannot replace the current BOMs', () => {
  const page = pageHandler('applyLoadedWorkspaces', { user: { userId: 'other-account' } });
  page.action([]);
  assert.equal(page.state[0].id, 'existing');
  assert.deepEqual(page.effects, []);
  assert.deepEqual(page.writes, []);
});

test('deleting the last selected QA BOM does not recreate or save a fallback dataset', async () => {
  const page = pageHandler('deleteBomWorkspaceById');
  await page.action('existing');
  assert.deepEqual(page.writes, [['delete', 'existing']]);
  assert.equal(page.state[0].payload.recordCount, 0);
  assert.ok(page.effects.includes('reload'));
});

test('deleting one selected QA BOM keeps the other complete BOM unchanged', async () => {
  const retained = workspace('retained', [row('kept')]);
  const page = pageHandler('deleteBomWorkspaceById', { bomWorkspaces: [workspace('existing'), retained] });
  await page.action('existing');
  assert.deepEqual(plain(page.state), [retained]);
  assert.deepEqual(page.writes, [['delete', 'existing']]);
});

test('a failed remote read preserves existing UI data and never applies an empty fallback', async () => {
  let applied = 0;
  const page = pageHandler('reloadBomWorkspaces', {
    workspaceSyncRequestRef: { current: 0 }, activeBomIdRef: { current: 'existing' },
    progressiveWorkspaceLoadsRef: { current: new Set() }, bomSyncRetryAttemptRef: { current: 0 },
    isLatestBomWorkspaceLoad: (completed, latest) => completed === latest,
    loadBomWorkspacesDetailed: async () => { throw Error('Network unavailable'); },
    applyLoadedWorkspaces: () => { applied += 1; },
    setCollaborationStatus() {}, setRemoteSyncFailed() {},
  });
  await assert.rejects(page.action('existing'), /Network unavailable/);
  assert.equal(applied, 0);
  assert.equal(page.state[0].id, 'existing');
  assert.deepEqual(page.writes, []);
});
