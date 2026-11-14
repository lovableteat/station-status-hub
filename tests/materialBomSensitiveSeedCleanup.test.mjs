import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/material-requests/MaterialRequestPage.tsx', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('function loadSavedChanges()'), source.indexOf('function createBomId('));
function load(stored) {
  const writes = [];
  const sandbox = {
    LOCAL_CHANGES_KEY: 'synthetic-only', DEFAULT_BOM_ID: 'default', DEFAULT_BOM_TABLE_COLOR_THEME: 'default',
    window: { localStorage: { getItem: () => stored, setItem: (...args) => writes.push(args), removeItem: (...args) => writes.push(args) } },
  };
  vm.createContext(sandbox);
  vm.runInContext(ts.transpileModule(helpers + '\nglobalThis.result = createDefaultBomWorkspace();', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText, sandbox);
  return {workspace: JSON.parse(JSON.stringify(sandbox.result)), writes};
}
test('empty or corrupt storage yields an empty read-only placeholder', () => {
  for (const stored of [null, '{broken']) {
    const {workspace, writes} = load(stored);
    assert.equal(workspace.payload.recordCount, 0);
    assert.equal(workspace.name, '尚未匯入 BOM');
    assert.deepEqual(writes, []);
  }
});
test('legacy additions and edits remain recoverable, edits win, storage stays intact', () => {
  const stored = JSON.stringify({added:[{id:'synthetic-a',note:'old'},{id:'synthetic-b',note:'added'}],updated:{a:{id:'synthetic-a',note:'edited'},c:{id:'synthetic-c',note:'updated-only'}}});
  const {workspace,writes} = load(stored);
  assert.deepEqual(workspace.payload.records,[{id:'synthetic-a',note:'edited'},{id:'synthetic-b',note:'added'},{id:'synthetic-c',note:'updated-only'}]);
  assert.equal(workspace.payload.recordCount, 3);
  assert.deepEqual(writes, []);
});
test('removed business seed is neither referenced nor automatically persisted', () => {
  assert.doesNotMatch(source, /materialRequestSeed|loadDefaultBomWorkspace/);
  const emptyLoad = source.slice(source.indexOf('if (storedWorkspaces.length === 0)'), source.indexOf('setBomWorkspaces((currentWorkspaces)'));
  assert.doesNotMatch(emptyLoad, /saveBomWorkspace|removeBomWorkspace/);
  const deletion = source.slice(source.indexOf('const deleteBomWorkspaceById'), source.indexOf('const confirmDeleteBom'));
  assert.doesNotMatch(deletion, /saveBomWorkspace\(fallbackWorkspace/);
});
