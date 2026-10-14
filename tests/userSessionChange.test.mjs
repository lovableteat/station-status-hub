import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = ts.createSourceFile('UserContext.tsx', readFileSync(new URL('../src/components/auth/UserContext.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const store = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'storeUser');
assert.ok(store);
const compiled = ts.transpileModule(store.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;

function fixture(blockStorage = false) {
  const events = [];
  const sessionStorage = {
    setItem() { if (blockStorage) throw Error('Blocked'); },
    removeItem() { if (blockStorage) throw Error('Blocked'); },
  };
  class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  const context = vm.createContext({ window: { sessionStorage, dispatchEvent(event) { events.push(event); } }, CustomEvent });
  vm.runInContext(compiled, context);
  return { events, storeUser: context.storeUser };
}

test('storing a user synchronously announces only their application identity', () => {
  const state = fixture();
  state.storeUser({ userId: 'owner-a', username: 'A', role: 'admin', privateValue: 'must-not-be-in-event' });
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].type, 'station-user-changed');
  assert.equal(state.events[0].detail, 'owner-a');
});

test('local logout announces null without relying on a successful remote sign-out', () => {
  const state = fixture();
  state.storeUser(null);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].type, 'station-user-changed');
  assert.equal(state.events[0].detail, null);
});

test('blocked browser storage cannot prevent the local account-change notification', () => {
  const state = fixture(true);
  assert.doesNotThrow(() => state.storeUser(null));
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].detail, null);
});
