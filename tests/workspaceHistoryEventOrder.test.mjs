import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/workspaceHistory.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { for (let i = 0; i < 12; i++) await tick(); }
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  // Node's EventTarget deliberately invokes capture/bubble listeners in their
  // registration order, matching window AT_TARGET behavior that JSDOM masks.
  const win = new EventTarget();
  win.location = new URL('https://example.test/?workspace=home&project=A');
  const entries = [{ url: win.location.href, state: null }];
  let cursor = 0;
  win.history = {
    get state() { return entries[cursor].state; },
    replaceState(state, _, url) {
      if (url !== undefined) win.location.href = new URL(url, win.location.href).href;
      entries[cursor] = { state, url: win.location.href };
    },
    pushState(state, _, url) {
      win.location.href = new URL(url, win.location.href).href;
      entries.splice(++cursor, entries.length, { state, url: win.location.href });
    },
    go(delta) {
      setImmediate(() => {
        const next = cursor + delta;
        if (next < 0 || next >= entries.length) return;
        cursor = next;
        win.location.href = entries[cursor].url;
        win.dispatchEvent(new Event('popstate'));
      });
    },
  };
  const exports = {};
  vm.runInNewContext(code, { exports, window: win, Event, URL });
  return { win, history: exports };
}

test('window-target test model does not give later capture listeners priority', () => {
  const win = new EventTarget(), seen = [];
  win.addEventListener('popstate', () => seen.push('router'));
  win.addEventListener('popstate', event => { seen.push('late guard'); event.stopImmediatePropagation(); }, true);
  win.dispatchEvent(new Event('popstate'));
  assert.deepEqual(seen, ['router', 'late guard']);
});

test('entrypoint installs history interception before importing React or application code', () => {
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.match(main, /^import ['"]\.\/lib\/workspaceHistory['"]/);
});

test('early dispatcher hides unapproved, restore, and failed events from listeners registered before watcher activation', async () => {
  const { win, history } = fixture();
  const observed = [], accepted = [];
  // Same ordering as HashRouter then lazy Index's useEffect in production.
  win.addEventListener('popstate', () => observed.push(win.location.search));
  let guards = 0, retry;
  win.addEventListener('workspace-before-navigate', () => guards++);
  const pending = deferred();
  let load = () => pending.promise;
  const stop = history.watchWorkspaceHistory(() => accepted.push(win.location.search), () => load(), callback => { retry = callback; });
  history.pushWorkspaceHistory('?workspace=target&project=B');
  history.pushWorkspaceHistory('?workspace=current&project=A');
  win.history.go(-1); await settle();
  assert.equal(win.location.search, '?workspace=current&project=A');
  assert.deepEqual(observed, []); assert.deepEqual(accepted, []); assert.equal(guards, 0);
  pending.reject(new Error('missing chunk')); await settle();
  assert.equal(typeof retry, 'function'); assert.deepEqual(observed, []);
  load = async () => {}; retry(); await settle();
  assert.deepEqual(observed, ['?workspace=target&project=B']);
  assert.deepEqual(accepted, ['?workspace=target&project=B']); assert.equal(guards, 1);
  stop();
});

test('dispatcher keeps its early position through cleanup/remount and checks final dirty state', async () => {
  const { win, history } = fixture();
  const observed = [];
  win.addEventListener('popstate', () => observed.push(win.location.search));
  const stopOld = history.watchWorkspaceHistory(() => {}); stopOld();
  const pending = deferred(); let dirty = false, allow = false, guards = 0, commits = 0;
  win.addEventListener('workspace-before-navigate', event => { guards++; if (dirty && !allow) event.preventDefault(); });
  const stop = history.watchWorkspaceHistory(() => commits++, () => pending.promise);
  stopOld(); // A stale cleanup must not remove the current delegate.
  history.pushWorkspaceHistory('?workspace=target'); history.pushWorkspaceHistory('?workspace=current');
  win.history.go(-1); await settle(); dirty = true; pending.resolve(); await settle();
  assert.equal(win.location.search, '?workspace=current');
  assert.deepEqual(observed, []); assert.equal(commits, 0); assert.equal(guards, 1);
  allow = true; win.history.go(-1); await settle();
  assert.deepEqual(observed, ['?workspace=target']); assert.equal(commits, 1); assert.equal(guards, 2);
  stop();
  win.dispatchEvent(new Event('popstate'));
  assert.equal(observed.length, 2, 'without an active watcher native events pass through');
});

test('a newer commit invalidates pending preparation without leaking traversal events', async () => {
  const { win, history } = fixture(); const pending = deferred(), observed = [];
  win.addEventListener('popstate', () => observed.push(win.location.search));
  let commits = 0;
  const stop = history.watchWorkspaceHistory(() => commits++, () => pending.promise);
  history.pushWorkspaceHistory('?workspace=target'); history.pushWorkspaceHistory('?workspace=current');
  win.history.go(-1); await settle();
  history.replaceWorkspaceHistory('?workspace=newest'); pending.resolve(); await settle();
  assert.equal(win.location.search, '?workspace=newest'); assert.equal(commits, 0); assert.deepEqual(observed, []);
  stop();
});

test('early dispatcher delegates unknown hashes but blocks unknown project changes until guarded retry', async () => {
  const { win, history } = fixture(); const observed = [];
  win.addEventListener('popstate', () => observed.push(win.location.href));
  let retry, commits = 0, loads = 0;
  const stop = history.watchWorkspaceHistory(() => commits++, async () => { loads++; }, callback => { retry = callback; });
  history.pushWorkspaceHistory('?workspace=current&project=A#/');
  const acceptedUrl = win.location.href, acceptedState = win.history.state;
  win.history.pushState(null, '', '#/other'); win.dispatchEvent(new Event('popstate'));
  assert.equal(observed.length, 1); assert.equal(loads, 0); assert.equal(commits, 0);
  // Simulate a rejected native hash route restoring its accepted location.
  win.history.replaceState(acceptedState, '', acceptedUrl);
  win.history.pushState(null, '', '?workspace=foreign&project=B#/');
  win.dispatchEvent(new Event('popstate'));
  assert.equal(win.location.href, acceptedUrl); assert.equal(observed.length, 1);
  assert.equal(typeof retry, 'function'); retry(); await settle();
  assert.equal(win.location.search, '?workspace=foreign&project=B');
  assert.equal(observed.length, 2); assert.equal(loads, 1); assert.equal(commits, 1);
  stop();
});

test('cleanup cancels a pending load without committing or replaying to a replacement watcher', async () => {
  const { win, history } = fixture(); const pending = deferred(), observed = [];
  win.addEventListener('popstate', () => observed.push(win.location.search));
  let commits = 0;
  const stop = history.watchWorkspaceHistory(() => commits++, () => pending.promise);
  history.pushWorkspaceHistory('?workspace=target'); history.pushWorkspaceHistory('?workspace=current');
  win.history.go(-1); await settle(); stop();
  const stopNext = history.watchWorkspaceHistory(() => commits++, async () => {});
  pending.resolve(); await settle();
  assert.equal(commits, 0); assert.deepEqual(observed, []); assert.equal(win.location.search, '?workspace=current');
  stopNext();
});
