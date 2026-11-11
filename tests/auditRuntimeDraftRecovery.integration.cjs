const test = require('node:test');
const assert = require('node:assert/strict');
const { React, create, act, deferred, browser, loader, flush } = require('./support/renderHarness.cjs');

function fixture() {
  const win = browser(), replacements = [];
  win.location.replace = url => replacements.push(url);
  return { win, replacements, load: loader({ window: win }) };
}
async function until(predicate) { for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)); } assert.ok(predicate(), 'timed out waiting for simulated history traversal'); }
function button(root, text) { return root.root.find(node => node.type === 'button' && node.children.includes(text)); }

test('a nested chunk rejection/retry leaves the existing memory-only editor mounted and editable', async () => {
  const f = fixture();
  const { recoverableLazy } = f.load('src/components/common/recoverableLazy.tsx');
  let attempts = 0, unmounts = 0;
  const Module = recoverableLazy(async () => {
    if (++attempts < 2) throw new Error('Failed to fetch dynamically imported module');
    return { default: () => React.createElement('p', null, 'new feature loaded') };
  });
  function Editor() {
    const [draft, setDraft] = React.useState('original memory draft');
    const [open, setOpen] = React.useState(false);
    React.useEffect(() => () => { unmounts++; }, []);
    return React.createElement(React.Fragment, null,
      React.createElement('input', { value: draft, onChange: event => setDraft(event.target.value) }),
      React.createElement('button', { onClick: () => setOpen(true) }, 'open'),
      open && React.createElement(React.Suspense, { fallback: 'loading' }, React.createElement(Module)));
  }
  let root; await act(async () => { root = create(React.createElement(Editor)); });
  await act(async () => { button(root, 'open').props.onClick(); }); await flush();
  assert.equal(unmounts, 0); assert.equal(f.replacements.length, 0);
  assert.equal(root.root.findByType('input').props.value, 'original memory draft');
  await act(async () => root.root.findByType('input').props.onChange({ target: { value: 'edited while offline' } }));
  await act(async () => button(root, '重試載入此功能').props.onClick()); await flush();
  assert.equal(attempts, 2); assert.equal(unmounts, 0);
  assert.equal(root.root.findByType('input').props.value, 'edited while offline');
  assert.match(JSON.stringify(root.toJSON()), /new feature loaded/);
  await act(async () => root.unmount());
});

test('preloading rejects safely and successful imports are reused when a route commits', async () => {
  const f = fixture(); const { recoverableLazy } = f.load('src/components/common/recoverableLazy.tsx');
  let attempts = 0;
  const Module = recoverableLazy(async () => { if (++attempts === 1) throw new Error('offline'); return { default: () => React.createElement('p', null, 'ready') }; });
  await assert.rejects(Module.preload(), /offline/);
  await Module.preload(); let root;
  await act(async () => { root = create(React.createElement(React.Suspense, { fallback: 'loading' }, React.createElement(Module))); });
  assert.equal(attempts, 2); await act(async () => root.unmount());
});

test('failed navigation, cancel, and late results do not unmount the current draft or commit stale routes', async () => {
  const f = fixture(), { useModuleNavigation } = f.load('src/hooks/useModuleNavigation.ts');
  let api, root; const commits = [];
  function Editor() { api = useModuleNavigation(); const [draft] = React.useState('unsaved'); return React.createElement('input', { value: draft }); }
  await act(async () => { root = create(React.createElement(Editor)); });
  await act(async () => api.navigate(async () => { throw new Error('missing'); }, () => commits.push('failed')));
  assert.equal(typeof api.retry, 'function'); assert.equal(root.root.findByType('input').props.value, 'unsaved');
  await act(async () => api.cancel()); assert.equal(api.retry, null);
  const old = deferred(), latest = deferred(); let first, second;
  await act(async () => { first = api.navigate(() => old.promise, () => commits.push('old')); });
  await act(async () => { second = api.navigate(() => latest.promise, () => commits.push('latest')); });
  await act(async () => { latest.resolve(); await second; old.resolve(); await first; });
  assert.deepEqual(commits, ['latest']);
  const canceled = deferred(); let last;
  await act(async () => { last = api.navigate(() => canceled.promise, () => commits.push('canceled')); api.cancel(); });
  await act(async () => { canceled.resolve(); await last; });
  assert.deepEqual(commits, ['latest']); await act(async () => root.unmount());
});

test('updating requires an explicit warning and respects cancellation and dirty-work guards without clearing storage', () => {
  const f = fixture(); const { requestApplicationUpdate } = f.load('src/lib/applicationUpdate.ts');
  f.win.localStorage.setItem('user', 'session'); f.win.localStorage.setItem('draft', 'unsaved');
  let prompt; f.win.confirm = text => { prompt = text; return false; };
  assert.equal(requestApplicationUpdate(), false); assert.match(prompt, /尚未儲存.*遺失/); assert.equal(f.replacements.length, 0);
  const veto = event => event.preventDefault(); f.win.addEventListener('workspace-before-navigate', veto); f.win.confirm = () => true;
  assert.equal(requestApplicationUpdate(), false); assert.equal(f.replacements.length, 0);
  f.win.removeEventListener('workspace-before-navigate', veto);
  assert.equal(requestApplicationUpdate(), true); assert.equal(f.replacements.length, 1);
  assert.equal(f.win.localStorage.getItem('user'), 'session'); assert.equal(f.win.localStorage.getItem('draft'), 'unsaved');
});

test('test tracker render failure preserves non-JSON, partial, and valid stored bytes', async () => {
  const f = fixture(); const { TestTrackerErrorBoundary } = f.load('src/components/test-tracker/TestTrackerErrorBoundary.tsx');
  const records = { 'test-tracker-non-json': 'unsubmitted plain text', 'testtracker-partial': '{"draft":"unfinished', 'test-tracker-valid': '{"note":"saved"}' };
  for (const [key, value] of Object.entries(records)) f.win.localStorage.setItem(key, value);
  let root; const originalError = console.error; console.error = () => {};
  try {
    function Broken() { throw new Error('render failed'); }
    await act(async () => { root = create(React.createElement(TestTrackerErrorBoundary, null, React.createElement(Broken))); });
    for (const [key, value] of Object.entries(records)) assert.equal(f.win.localStorage.getItem(key), value);
    assert.doesNotMatch(JSON.stringify(root.toJSON()), /清理瀏覽器快取/);
  } finally { console.error = originalError; await act(async () => root?.unmount()); }
});

test('prepared popstate blocks earlier router/editor listeners until imports load and restores failed history without a second prompt', async () => {
  const { createRequire } = require('node:module'); const path = require('node:path');
  const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'));
  const { JSDOM } = qa('jsdom');
  const dom = new JSDOM('', { url: 'http://localhost/?workspace=home&project=A' });
  const win = dom.window;
  const { pushWorkspaceHistory, watchWorkspaceHistory } = loader({ window: win, globals: { Event: win.Event } })('src/lib/workspaceHistory.ts');
  const accepted = [], observed = []; let guards = 0, failureRetry;
  // Deliberately register Router-like listeners BEFORE the guarded watcher.
  win.addEventListener('popstate', () => observed.push(win.location.search));
  win.addEventListener('workspace-before-navigate', () => { guards++; });
  const pending = deferred(); let loadStarted = false; let load = () => { loadStarted = true; return pending.promise; };
  const stop = watchWorkspaceHistory(() => accepted.push(win.location.search), () => load(), retry => { failureRetry = retry; });
  pushWorkspaceHistory('?workspace=missing&project=B');
  pushWorkspaceHistory('?workspace=current&project=A');
  win.history.back(); await until(() => loadStarted && win.location.search.includes('workspace=current'));
  assert.equal(observed.length, 0); assert.equal(accepted.length, 0); assert.equal(guards, 0);
  assert.match(win.location.search, /workspace=current&project=A/, 'URL/project returns to the mounted workspace while loading');
  pending.reject(new Error('missing chunk')); await until(() => typeof failureRetry === 'function');
  assert.match(win.location.search, /workspace=current&project=A/);
  assert.equal(observed.length, 0); assert.equal(accepted.length, 0); assert.equal(guards, 0);
  load = async () => {}; failureRetry(); await until(() => accepted.length === 1);
  assert.deepEqual(observed, ['?workspace=missing&project=B']);
  assert.deepEqual(accepted, ['?workspace=missing&project=B']); assert.equal(guards, 1);
  stop(); dom.window.close();
});

test('the actual Index header, dock, and navigate event keep the prior editor during failed or canceled workspace loads', async () => {
  const { child } = require('./support/renderHarness.cjs');
  const win = browser(); win.location.href = 'http://localhost/?workspace=pcb-designer&project=A'; win.history.state = { workspaceHistoryIndex: 0 };
  const pending = deferred(); let unmounts = 0;
  function Draft() { const [draft, setDraft] = React.useState('memory-only PCB draft'); React.useEffect(() => () => { unmounts++; }, []); return React.createElement('input', { value: draft, onChange: event => setDraft(event.target.value) }); }
  const mocks = {
    '@/components/auth/UserContext': { useUser: () => ({ user: { userId: 'fixture', role: 'admin' }, logout() {} }) },
    '@/hooks/useUserPresence': { useUserPresence: () => ({ updateCurrentModule() {} }) },
    '@/hooks/useUnifiedData': { useUnifiedData: () => ({ isUpdating: false }) },
    '@/hooks/usePermissions': { usePermissions: () => ({ canViewModule: () => true, loading: false }) },
    '@/hooks/use-mobile': { useIsCompactLayout: () => false },
    '@/components/test-projects/TestProjectProvider': { useTestProject: () => ({ activeProjectId: 'A', isSwitchingProject: false }) },
    '@/components/layout/PermissionGuard': { PermissionGuard: ({ children }) => children },
    '@/components/pcb-designer/PcbDesignerWorkspace': { PcbDesignerWorkspace: Draft },
    '@/components/material-requests/MaterialRequestPage': { get MaterialRequestPage() { throw new Error('missing deployed chunk'); } },
    '@/components/api-management/ApiChatWorkspacePage': { get ApiChatWorkspacePage() { return pending.promise; } },
  };
  const stubs = {
    '@/components/account/PersonalProfileDialog': 'PersonalProfileDialog', '@/components/account/OwnCredentialsDialog': 'OwnCredentialsDialog',
    '@/components/collaboration/CollaborationCenter': 'CollaborationCenter', '@/components/common/UpdateIndicator': 'UpdateIndicator',
    '@/components/layout/MainWorkspaceHeader': 'MainWorkspaceHeader', '@/components/layout/MobileWorkspaceDock': 'MobileWorkspaceDock',
    '@/components/layout/Sidebar': 'Sidebar', '@/components/layout/WorkspaceEntrance': 'WorkspaceEntrance',
    '@/components/maintenance/MaintenanceLoading': 'MaintenanceLoading', '@/components/maintenance/MaintenanceFeedback': 'MaintenanceLoading',
    '@/components/test-projects/ProjectScopeBar': 'ProjectScopeBar', '@/components/performance/MyAssessmentBackupsDialog': 'MyAssessmentBackupsDialog',
  };
  for (const [path, name] of Object.entries(stubs)) mocks[path] = { [name]: props => React.createElement('stub', { ...props, 'data-component': name }) };
  mocks.react = { ...React, default: React };
  const { default: Index } = loader({ window: win, mocks })('src/pages/Index.tsx');
  let root; await act(async () => { root = create(React.createElement(Index)); }); await flush();
  const draft = () => root.root.findByType('input').props.value;
  assert.equal(draft(), 'memory-only PCB draft');
  for (const name of ['MainWorkspaceHeader', 'MobileWorkspaceDock']) {
    await act(async () => root.root.findByProps({ 'data-component': name }).props.onSelect('material-requests'));
    await flush(); assert.equal(draft(), 'memory-only PCB draft'); assert.equal(unmounts, 0);
    assert.match(win.location.search, /workspace=pcb-designer/);
    await act(async () => button(root, '留在目前畫面').props.onClick());
  }
  await act(async () => win.dispatchEvent(new CustomEvent('navigate', { detail: { module: 'material-requests' } })));
  await flush(); assert.equal(draft(), 'memory-only PCB draft'); assert.equal(unmounts, 0);
  await act(async () => button(root, '留在目前畫面').props.onClick());
  await act(async () => root.unmount());
});

test('pending and already queued history completions cannot override a newer push or replace', async () => {
  const { createRequire } = require('node:module'); const path = require('node:path');
  const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'));
  const { JSDOM } = qa('jsdom');
  for (const mode of ['push-pending', 'replace-pending', 'push-queued-resume', 'rapid-back-forward']) {
    const dom = new JSDOM('', { url: 'http://localhost/?workspace=home&project=A' });
    const win = dom.window;
    const history = loader({ window: win, globals: { Event: win.Event } })('src/lib/workspaceHistory.ts');
    const pending = deferred(), observed = [], accepted = [];
    win.addEventListener('popstate', () => observed.push(win.location.search));
    const stop = history.watchWorkspaceHistory(() => accepted.push(win.location.search), () => pending.promise);
    history.pushWorkspaceHistory('?workspace=target&project=B');
    history.pushWorkspaceHistory('?workspace=current&project=A');
    win.history.back();
    if (mode === 'rapid-back-forward') win.history.forward();
    await new Promise(resolve => setTimeout(resolve, 20));
    if (mode === 'push-queued-resume') {
      pending.resolve();
      for (let i = 0; i < 6; i++) await Promise.resolve();
    }
    if (mode === 'replace-pending') history.replaceWorkspaceHistory('?workspace=newest&project=A');
    else history.pushWorkspaceHistory('?workspace=newest&project=A');
    pending.resolve();
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.match(win.location.search, /workspace=newest&project=A/, mode);
    assert.deepEqual(observed, [], `${mode}: obsolete traversal never reaches Router/editor listeners`);
    assert.deepEqual(accepted, [], `${mode}: obsolete preparation never commits`);
    stop(); dom.window.close();
  }
});

test('history checks the latest React draft at final commit, veto retains the editor and a later accepted traversal prompts once', async () => {
  const { createRequire } = require('node:module'); const path = require('node:path');
  const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'));
  const { JSDOM } = qa('jsdom');
  const dom = new JSDOM('', { url: 'http://localhost/?workspace=home&project=A' });
  const win = dom.window;
  const history = loader({ window: win, globals: { Event: win.Event } })('src/lib/workspaceHistory.ts');
  const pending = deferred(), observed = [];
  let guards = 0, prompts = 0, unmounts = 0, loadStarted = false, allowLeave = false;
  win.addEventListener('popstate', () => observed.push(win.location.search));
  win.confirm = () => { prompts++; return allowLeave; };
  function Editor() {
    const [draft, setDraft] = React.useState('');
    React.useEffect(() => {
      const guard = event => { guards++; if (draft && !win.confirm('Discard latest draft?')) event.preventDefault(); };
      win.addEventListener('workspace-before-navigate', guard);
      return () => win.removeEventListener('workspace-before-navigate', guard);
    }, [draft]);
    React.useEffect(() => () => { unmounts++; }, []);
    return React.createElement('input', { value: draft, onChange: event => setDraft(event.target.value) });
  }
  function Shell() {
    const [current, setCurrent] = React.useState(true);
    React.useEffect(() => history.watchWorkspaceHistory(() => setCurrent(false), () => { loadStarted = true; return pending.promise; }), []);
    return current ? React.createElement(Editor) : React.createElement('p', null, 'destination');
  }
  let root;
  try {
    await act(async () => { root = create(React.createElement(Shell)); });
    history.pushWorkspaceHistory('?workspace=target&project=B');
    history.pushWorkspaceHistory('?workspace=current&project=A');
    win.history.back();
    await until(() => loadStarted && win.location.search.includes('workspace=current'));
    assert.equal(guards, 0, 'no stale or duplicate approval before the slow load');
    await act(async () => root.root.findByType('input').props.onChange({ target: { value: 'draft typed while destination was loading' } }));
    await act(async () => { pending.resolve(); await until(() => prompts === 1 && win.location.search.includes('workspace=current')); });
    assert.equal(root.root.findByType('input').props.value, 'draft typed while destination was loading');
    assert.equal(unmounts, 0); assert.equal(guards, 1); assert.equal(prompts, 1);
    assert.deepEqual(observed, []); assert.equal(win.history.length, 3, 'veto retains both navigation entries');
    allowLeave = true;
    await act(async () => { win.history.back(); await until(() => observed.length === 1); });
    assert.equal(unmounts, 1); assert.equal(guards, 2); assert.equal(prompts, 2, 'one current-state prompt for each final commit attempt');
    assert.deepEqual(observed, ['?workspace=target&project=B']);
    assert.match(JSON.stringify(root.toJSON()), /destination/);
  } finally { await act(async () => root?.unmount()); dom.window.close(); }
});

test('native hash entries without a workspace index stay with HashRouter instead of guessing a traversal distance', async () => {
  const { createRequire } = require('node:module'); const path = require('node:path');
  const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'));
  const { JSDOM } = qa('jsdom');
  const dom = new JSDOM('', { url: 'http://localhost/?workspace=current&project=A#/' });
  const win = dom.window;
  const history = loader({ window: win, globals: { Event: win.Event } })('src/lib/workspaceHistory.ts');
  const observed = []; let loads = 0, commits = 0, traversals = 0;
  win.addEventListener('popstate', () => observed.push(win.location.href));
  const originalGo = win.history.go.bind(win.history);
  win.history.go = delta => { traversals++; originalGo(delta); };
  const stop = history.watchWorkspaceHistory(() => { commits++; }, async () => { loads++; });
  try {
    history.pushWorkspaceHistory('?workspace=first&project=A#/');
    history.pushWorkspaceHistory('?workspace=current&project=A#/');
    assert.equal(win.history.state.workspaceHistoryIndex, 2);
    win.location.hash = '#/test-tracker?system=fixture';
    await until(() => observed.length === 1);
    assert.equal(traversals, 0); assert.equal(loads, 0); assert.equal(commits, 0);
    assert.equal(win.location.search, '?workspace=current&project=A');
    assert.equal(win.location.hash, '#/test-tracker?system=fixture');
    win.location.hash = '#/';
    await until(() => observed.length === 2);
    assert.equal(traversals, 0); assert.equal(win.location.search, '?workspace=current&project=A');
    win.history.back();
    await until(() => observed.length === 3);
    assert.equal(win.location.hash, '#/test-tracker?system=fixture');
    win.history.back();
    await until(() => observed.length === 4);
    assert.equal(win.location.hash, '#/');
    assert.equal(win.location.search, '?workspace=current&project=A');
    assert.equal(traversals, 0); assert.equal(loads, 0); assert.equal(commits, 0);
  } finally { stop(); dom.window.close(); }
});

test('unmanaged entries that change project/query retain the accepted editor context until explicit guarded retry', async () => {
  const { createRequire } = require('node:module'); const path = require('node:path');
  const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'));
  const { JSDOM } = qa('jsdom');
  const dom = new JSDOM('', { url: 'http://localhost/?workspace=current&project=A#/' });
  const win = dom.window;
  const history = loader({ window: win, globals: { Event: win.Event } })('src/lib/workspaceHistory.ts');
  const observed = []; let retry, loads = 0, commits = 0, guards = 0, allowed = false;
  win.addEventListener('popstate', () => observed.push(win.location.href));
  win.addEventListener('workspace-before-navigate', event => { guards++; if (!allowed) event.preventDefault(); });
  win.history.go = () => { throw new Error('unknown entry distance must never be guessed'); };
  const stop = history.watchWorkspaceHistory(() => { commits++; }, async () => { loads++; }, callback => { retry = callback; });
  try {
    history.pushWorkspaceHistory('?workspace=current&project=A#/');
    win.history.pushState(null, '', '?workspace=target&project=B#/');
    win.dispatchEvent(new win.PopStateEvent('popstate', { state: null }));
    assert.equal(win.location.search, '?workspace=current&project=A');
    assert.equal(observed.length, 0); assert.equal(loads, 0); assert.equal(commits, 0);
    assert.equal(typeof retry, 'function');
    retry(); await until(() => guards === 1);
    assert.equal(win.location.search, '?workspace=current&project=A'); assert.equal(commits, 0);
    allowed = true; retry(); await until(() => commits === 1);
    assert.equal(win.location.search, '?workspace=target&project=B'); assert.equal(observed.length, 1); assert.equal(guards, 2);
  } finally { stop(); dom.window.close(); }
});

test('a delegated hash rejected by the route guard never becomes the accepted fallback URL', async () => {
  const { createRequire } = require('node:module'); const path = require('node:path');
  const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'));
  const { JSDOM } = qa('jsdom');
  const dom = new JSDOM('', { url: 'http://localhost/?workspace=current&project=A#/' });
  const win = dom.window;
  const history = loader({ window: win, globals: { Event: win.Event } })('src/lib/workspaceHistory.ts');
  const observed = []; let retry;
  win.addEventListener('popstate', () => observed.push(win.location.href));
  const stop = history.watchWorkspaceHistory(() => {}, async () => {}, callback => { retry = callback; });
  try {
    history.pushWorkspaceHistory('?workspace=current&project=A#/');
    const originalUrl = win.location.href, originalState = win.history.state;
    win.location.hash = '#/test-tracker';
    await until(() => observed.length === 1);
    // PreparedRoutes rejected leaving the dirty editor and restored via Router,
    // which does not emit this helper's workspace-history-commit event.
    win.history.replaceState(originalState, '', originalUrl);
    win.history.pushState(null, '', '?workspace=foreign&project=B#/');
    win.dispatchEvent(new win.PopStateEvent('popstate', { state: null }));
    assert.equal(win.location.href, originalUrl, 'unknown-query recovery must not resurrect the vetoed hash');
    assert.equal(observed.length, 1); assert.equal(typeof retry, 'function');
  } finally { stop(); dom.window.close(); }
});
