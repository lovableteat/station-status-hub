const assert = require('node:assert/strict');
const test = require('node:test');
const { React, create, act, loader, browser } = require('../support/renderHarness.cjs');

function fixture(folder = null) {
  const window = browser();
  window.requestAnimationFrame = () => 0;
  window.cancelAnimationFrame = () => {};
  const entries = [{ url: 'http://localhost/?workspace=material-requests&project=A', state: { workspaceHistoryIndex: 0, routerMarker: 'preserved' } }];
  let cursor = 0;
  window.location.href = entries[0].url;
  const go = delta => {
    const next = cursor + delta;
    if (next < 0 || next >= entries.length) return;
    cursor = next;
    window.location.href = entries[cursor].url;
    window.dispatchEvent(new Event('popstate'));
  };
  window.history = {
    get state() { return entries[cursor].state; },
    get length() { return entries.length; },
    replaceState(state, _, url) {
      entries[cursor] = { state, url: url ? new URL(url, window.location.href).href : window.location.href };
      window.location.href = entries[cursor].url;
    },
    pushState(state, _, url) {
      entries.splice(cursor + 1);
      entries.push({ state, url: new URL(url, window.location.href).href });
      cursor++;
      window.location.href = entries[cursor].url;
    },
    back: () => go(-1), forward: () => go(1), go,
  };
  const space = { id: 'space-me', name: 'QA 同仁', ownerId: 'me', isPersonal: true };
  const state = {
    spaces: [space], activeSpace: space, activeSpaceId: space.id, folders: [
      { id: 'parent', parentId: null, spaceId: space.id, name: '工程文件' },
      { id: 'child', parentId: 'parent', spaceId: space.id, name: '規格書' },
    ], files: [], ownerId: 'me', loading: false, busy: false, error: null, uploadProgress: null,
    canEdit: true, canEditSpace: () => true, isAuthenticated: true,
    async openSpace() {}, async refreshWorkspace() {},
  };
  const load = loader({ window, globals: { HTMLElement: class {} }, mocks: {
    './hooks/useTestPlanWorkspace': { useTestPlanWorkspace: () => state },
    './TestPlanInspector': { TestPlanInspector: () => null, FileTypeIcon: () => null },
    './TestPlanSpreadsheetEditor': { TestPlanSpreadsheetEditor: () => null },
    sonner: { toast: { success() {}, error() {}, warning() {} } },
  } });
  const history = load('src/lib/workspaceHistory.ts');
  history.pushWorkspaceHistory(`?workspace=file-uploads&module=test-plan&project=A&fileSpace=space-me&fileScope=folder${folder ? `&fileFolder=${folder}` : ''}`);
  const accepted = [];
  const stop = history.watchWorkspaceHistory(() => accepted.push(window.location.search));
  const { TestPlanWorkspace } = load('src/components/test-plan/TestPlanWorkspace.tsx');
  let tree;
  const render = () => React.createElement(TestPlanWorkspace);
  return {
    window, state, entries, accepted,
    async mount() { await act(async () => { tree = create(render()); }); },
    async refresh() { await act(async () => tree.unmount()); await this.mount(); },
    async update() { await act(async () => tree.update(render())); },
    async click(label) { await act(async () => tree.root.find(node => node.type === 'stub' && node.props['aria-label'] === label).props.onClick()); },
    async open(id) { await act(async () => tree.root.find(node => typeof node.type === 'string' && node.props['data-entry-key'] === `folder:${id}`).props.onDoubleClick()); },
    async back() { await act(async () => window.history.back()); },
    async forward() { await act(async () => window.history.forward()); },
    folder() { return new URL(window.location.href).searchParams.get('fileFolder'); },
    visible(id) { return tree.root.findAll(node => typeof node.type === 'string' && node.props['data-entry-key'] === `folder:${id}`).length > 0; },
    async close() { await act(async () => tree.unmount()); stop(); },
  };
}

test('browser Back traverses folders before leaving the file workspace, and Forward restores them', async () => {
  const f = fixture();
  await f.mount();
  try {
    await f.open('parent');
    await f.open('child');
    assert.equal(f.entries.length, 4, 'each folder has its own browser entry');
    await f.back();
    assert.equal(f.folder(), 'parent');
    assert.equal(f.window.history.state.workspaceHistoryIndex, 2);
    assert.ok(f.visible('child'), 'browser Back restores the parent listing');
    assert.equal(new URL(f.window.location.href).searchParams.get('workspace'), 'file-uploads');
    await f.back();
    assert.equal(f.folder(), null);
    assert.ok(f.visible('parent'));
    await f.forward();
    assert.equal(f.folder(), 'parent');
    await f.forward();
    assert.equal(f.folder(), 'child');
    assert.equal(new URL(f.window.location.href).searchParams.get('project'), 'A');
    assert.equal(new URL(f.window.location.href).searchParams.get('fileScope'), 'folder');
    assert.ok(f.entries.every(entry => entry.state.routerMarker === 'preserved'));
    await f.back();
    await f.back();
    await f.back();
    assert.equal(new URL(f.window.location.href).searchParams.get('workspace'), 'material-requests', 'Back at the root can still return to the previous workspace');
  } finally { await f.close(); }
});

test('a direct nested-folder link gets parent history once, including after refresh', async () => {
  const f = fixture('child');
  await f.mount();
  try {
    assert.equal(f.entries.length, 4);
    assert.equal(f.folder(), 'child');
    await f.refresh();
    assert.equal(f.entries.length, 4, 'refresh does not duplicate parent entries');
    await f.click('返回（Alt+←）');
    assert.equal(f.folder(), 'parent');
    assert.ok(f.visible('child'));
    await f.click('前進（Alt+→）');
    assert.equal(f.folder(), 'child');
    await f.click('上一層（Alt+↑）');
    assert.equal(f.folder(), 'parent');
    assert.ok(f.visible('child'));
  } finally { await f.close(); }
});

test('busy uploads reject browser navigation without changing the folder or losing Forward history', async () => {
  const f = fixture();
  await f.mount();
  try {
    await f.open('parent');
    await f.open('child');
    f.state.busy = true;
    await f.update();
    await f.back();
    assert.equal(f.folder(), 'child');
    assert.equal(f.accepted.length, 0);
    f.state.busy = false;
    await f.update();
    await f.back();
    assert.equal(f.folder(), 'parent');
    await f.forward();
    assert.equal(f.folder(), 'child');
  } finally { await f.close(); }
});
