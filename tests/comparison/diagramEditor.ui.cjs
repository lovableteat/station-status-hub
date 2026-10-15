const assert = require('node:assert/strict');
const test = require('node:test');
const { React, create, act, loader, browser, child, deferred, flush } = require('../support/renderHarness.cjs');

const accountA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const accountB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const clone = value => structuredClone(value);
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.children ? text(node.children) : '';
const document = (id = 'diagram-saved', title = '原圖稿') => ({
  version: 1, id, title, createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z',
  nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 },
});

function fixture() {
  const window = browser();
  const timers = new Map();
  let timerId = 0;
  window.setTimeout = callback => { const id = ++timerId; timers.set(id, callback); return id; };
  window.clearTimeout = id => timers.delete(id);
  window.requestAnimationFrame = () => 0;
  const records = new Map();
  const calls = [];
  const saveGates = [], deleteGates = [];
  const owner = id => {
    if (!records.has(id)) records.set(id, new Map());
    return records.get(id);
  };
  const storage = {
    async listDiagrams(account) { calls.push({ kind: 'list', account }); return clone([...owner(account).values()]); },
    async saveDiagram(account, doc) {
      const snapshot = clone(doc);
      calls.push({ kind: 'save:start', account, document: snapshot });
      const gate = saveGates.shift();
      if (gate) await gate.promise;
      owner(account).set(snapshot.id, snapshot);
      calls.push({ kind: 'save:complete', account, id: snapshot.id });
    },
    async deleteDiagram(account, id) {
      calls.push({ kind: 'delete:start', account, id });
      const gate = deleteGates.shift();
      if (gate) await gate.promise;
      owner(account).delete(id);
      calls.push({ kind: 'delete:complete', account, id });
    },
  };
  const flow = { setViewport: async () => {}, fitView: async () => {}, screenToFlowPosition: point => point };
  // renderHarness isolates each module in its own VM realm. JSON bridges keep
  // the real model's plain-object validation intact across that test boundary.
  const loadModel = loader({ transform(source, file) {
    return file.endsWith('diagramModel.ts') ? `${source}\nexport const parseTestJson = (value: string) => parseDiagramDocument(JSON.parse(value));\nexport const layoutTestJson = (value: string) => autoLayoutDiagram(JSON.parse(value));` : source;
  } });
  const model = loadModel('src/components/comparison/diagramModel.ts');
  const load = loader({ window, mocks: {
    './diagramModel': { ...model,
      parseDiagramDocument: value => model.parseTestJson(JSON.stringify(value)),
      autoLayoutDiagram: value => model.layoutTestJson(JSON.stringify(value)),
    },
    './diagramStorage': storage,
    './diagramExport': { downloadDiagram: async () => {} },
    '@xyflow/react': {
      ReactFlowProvider: ({ children }) => children,
      ReactFlow: props => React.createElement('flow', props, props.children),
      useReactFlow: () => flow,
      Background: child, Controls: child, Handle: child, NodeResizer: child,
      BackgroundVariant: { Dots: 'dots' }, ConnectionMode: { Loose: 'loose' }, MarkerType: { ArrowClosed: 'arrowclosed' },
      Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
    },
  } });
  const Editor = load('src/components/comparison/ComparisonDiagramEditor.tsx').default;
  let tree;
  let props = { accountId: accountA, canEdit: true, session: null };
  const render = () => React.createElement(Editor, { ...props, key: props.accountId });
  return {
    records, calls, timers, saveGates, deleteGates,
    seed(account, doc) { owner(account).set(doc.id, clone(doc)); },
    documents(account) { return [...owner(account).values()]; },
    get tree() { return tree; },
    async mount() { await act(async () => { tree = create(render()); }); await flush(); },
    async update(next) { props = { ...props, ...next }; await act(async () => tree.update(render())); await flush(); },
    async unmount() { await act(async () => tree.unmount()); await flush(); },
    title() { return tree.root.findByProps({ id: 'diagram-title' }); },
    button(label) { return tree.root.findAll(node => node.type === 'stub' && typeof node.props.onClick === 'function' && text(node) === label)[0]; },
    async edit(title) { await act(async () => this.title().props.onChange({ target: { value: title } })); },
    async click(label) { const button = this.button(label); assert.ok(button, `Button ${label} exists`); await act(async () => { button.props.onClick(); }); },
    async open(id) {
      const select = tree.root.findByProps({ 'aria-label': '開啟已儲存圖稿' });
      await act(async () => { select.props.onChange({ target: { value: id } }); });
    },
    async confirmDelete() {
      const button = tree.root.findAll(node => node.type === 'stub' && node.props['aria-label'] === '刪除此圖稿')[0];
      assert.ok(button && !button.props.disabled);
      await act(async () => { button.props.onClick(); });
      await this.click('刪除圖稿');
    },
    async runTimers() {
      const pending = [...timers]; timers.clear();
      await act(async () => { for (const [, callback] of pending) callback(); });
    },
  };
}

test('the final edit flushes to its original account when the editor immediately unmounts for another account', async () => {
  const f = fixture();
  await f.mount();
  await f.edit('帳號 A 最後一秒的修改');
  assert.equal(f.timers.size, 1, 'the autosave debounce has not fired');
  assert.equal(f.documents(accountA).length, 0);
  await f.update({ accountId: accountB });
  assert.equal(f.timers.size, 0, 'the previous editor timer is cancelled on unmount');
  assert.deepEqual(f.documents(accountA).map(item => item.title), ['帳號 A 最後一秒的修改']);
  assert.equal(f.documents(accountB).length, 0);
  assert.notEqual(f.title().props.value, '帳號 A 最後一秒的修改');
  await f.edit('帳號 B 草稿');
  await f.unmount();
  assert.deepEqual(f.documents(accountB).map(item => item.title), ['帳號 B 草稿']);
  const writes = f.calls.filter(call => call.kind === 'save:start');
  assert.deepEqual(writes.map(call => [call.account, call.document.title]), [
    [accountA, '帳號 A 最後一秒的修改'], [accountB, '帳號 B 草稿'],
  ]);
});

test('switching documents locks edits until the previous snapshot commits', async () => {
  const f = fixture();
  await f.mount();
  await f.edit('切換前需要保存的版本');
  const pending = deferred(); f.saveGates.push(pending);
  await f.click('空白圖稿');
  assert.equal(f.calls.filter(call => call.kind === 'save:start').length, 1);
  assert.equal(f.title().props.disabled, true, 'the switch waits for persistence with editing disabled');
  assert.equal(f.button('空白圖稿').props.disabled, true);
  await f.edit('等待期間不應寫入的內容');
  assert.equal(f.title().props.value, '切換前需要保存的版本', 'the mutation guard also rejects stale input callbacks');
  await act(async () => pending.resolve()); await flush();
  assert.notEqual(f.title().props.value, '切換前需要保存的版本');
  assert.equal(f.title().props.disabled, false);
  assert.deepEqual(f.documents(accountA).map(item => item.title), ['切換前需要保存的版本']);
  await f.unmount();
});

test('deleting joins the pending write queue and an overdue autosave cannot resurrect the document', async () => {
  const f = fixture(); const saved = document();
  f.seed(accountA, saved);
  await f.mount(); await f.open(saved.id); await f.edit('已進入儲存中的版本');
  const pendingSave = deferred(); f.saveGates.push(pendingSave);
  await f.click('儲存');
  await f.edit('刪除前的新修改');
  const overdueAutosave = [...f.timers.values()][0];
  assert.ok(overdueAutosave);
  const pendingDelete = deferred(); f.deleteGates.push(pendingDelete);
  await f.confirmDelete();
  assert.equal(f.calls.some(call => call.kind === 'delete:start'), false, 'delete waits for the earlier write');
  assert.equal(f.title().props.disabled, true);
  assert.equal(f.timers.size, 0, 'deletion cancels the pending debounce');
  // A callback already dispatched by the browser can outlive clearTimeout.
  await act(async () => { overdueAutosave(); });
  await act(async () => pendingSave.resolve()); await flush();
  assert.equal(f.calls.filter(call => call.kind === 'delete:start').length, 1);
  assert.equal(f.calls.filter(call => call.kind === 'save:start' && call.document.id === saved.id).length, 1);
  await act(async () => pendingDelete.resolve()); await flush();
  assert.equal(f.documents(accountA).some(item => item.id === saved.id), false);
  await f.runTimers(); await f.unmount();
  assert.equal(f.documents(accountA).some(item => item.id === saved.id), false, 'later timers and unmount flush also honor the deleted id');
  const operations = f.calls.filter(call => ['save:start', 'save:complete', 'delete:start', 'delete:complete'].includes(call.kind));
  assert.deepEqual(operations.slice(0, 4).map(call => call.kind), ['save:start', 'save:complete', 'delete:start', 'delete:complete']);
});

test('revoking edit permission before a queued delete starts preserves the saved document', async () => {
  const f = fixture(); const saved = document();
  f.seed(accountA, saved);
  await f.mount(); await f.open(saved.id); await f.edit('已授權開始的保存');
  const pending = deferred(); f.saveGates.push(pending);
  await f.click('儲存');
  await f.confirmDelete();
  await f.update({ canEdit: false });
  await act(async () => pending.resolve()); await flush();
  assert.equal(f.calls.some(call => call.kind === 'delete:start'), false, 'permission is checked again when the queued delete reaches storage');
  assert.deepEqual(f.documents(accountA).map(item => item.title), ['已授權開始的保存']);
  assert.match(JSON.stringify(f.tree.toJSON()), /編輯權限已變更，圖稿未刪除/);
  assert.equal(f.title().props.disabled, true);
  await f.unmount();
});

test('importing an empty source reports its revision and preserves the existing draft and node', async () => {
  for (const [kind, label] of [['power', 'Power Tree'], ['i2c', 'I²C Map']]) {
    const f = fixture();
    await f.mount();
    await f.update({ session: {
      id: 'qa-empty-source', projectName: '空來源測試',
      result: { meta: { a: { label: 'EVT' }, b: { label: 'DVT' }, generated: '2026-10-15 00:00:00' }, powerTree: {}, powerTreeA: {}, i2cMap: {}, i2cMapA: {} },
    } });
    await f.edit(`保留原有 ${kind} 草稿`);
    await f.click('方框');
    const before = f.tree.root.findByType('flow').props.nodes;
    assert.equal(before.length, 1);
    const revision = f.tree.root.findByProps({ 'aria-label': '來源版本' });
    await act(async () => revision.props.onChange({ target: { value: 'a' } }));
    await f.click(`帶入 ${label}`); await flush();
    const alert = f.tree.root.findByProps({ role: 'alert' });
    assert.ok(text(alert).includes(`A 版沒有可帶入的 ${label} 資料`));
    assert.equal(f.title().props.value, `保留原有 ${kind} 草稿`);
    const after = f.tree.root.findByType('flow').props.nodes;
    assert.equal(after.length, 1);
    assert.equal(after[0].id, before[0].id);
    assert.equal(after[0].data.label, before[0].data.label);
    assert.equal(f.title().props.disabled, false, 'a failed source import releases the operation lock');
    assert.equal(f.documents(accountA).length, 1, 'the original draft was safely saved before trying the source');
    assert.equal(f.documents(accountA)[0].nodes[0].id, before[0].id);
    await f.unmount();
  }
});

test('moving the canvas alone schedules autosave with the current viewport', async () => {
  const f = fixture();
  await f.mount();
  assert.equal(f.timers.size, 0);
  const viewport = { x: 145, y: -42, zoom: 0.75 };
  await act(async () => f.tree.root.findByType('flow').props.onMoveEnd(null, viewport));
  assert.equal(f.timers.size, 1, 'viewport changes are persisted even without another content edit');
  assert.equal(text(f.tree.root.findByProps({ 'aria-label': '設為百分之百縮放' })), '75%');
  await f.runTimers(); await flush();
  assert.equal(f.documents(accountA).length, 1);
  assert.deepEqual(f.documents(accountA)[0].viewport, viewport);
  await f.unmount();
});

test('workspace permission refresh keeps the same mounted draft available in read-only mode', async () => {
  let editable = true;
  let pendingRefresh;
  let mounts = 0, unmounts = 0;
  function DraftProbe({ accountId, canEdit }) {
    const [draft, setDraft] = React.useState('');
    React.useEffect(() => { mounts++; return () => { unmounts++; }; }, []);
    return React.createElement('section', { 'data-account': accountId },
      React.createElement('input', { 'aria-label': '待保存圖稿', value: draft, disabled: !canEdit, onChange: event => setDraft(event.target.value) }),
      React.createElement('button', { 'aria-label': '匯出草稿', disabled: false }, draft));
  }
  const load = loader({ mocks: {
    '@/components/auth/UserContext': { useUser: () => ({ user: { userId: accountA, displayName: 'QA' } }) },
    '@/hooks/usePermissions': { usePermissions: () => ({ canEditModule: () => editable }) },
    '@/hooks/useWorkspaceMutationScope': { useWorkspaceMutationScope: () => ({}) },
    '@/components/maintenance/MaintenancePageHeader': { MaintenancePageHeader: () => null },
    './useComparisonFilters': { useComparisonFilters: () => ({ filters: { tab: 'diagram' }, update() {}, clear() {} }) },
    './runtime': { ComparisonRuntime: class { cancel() {} } },
    './storage': { listSessions: () => pendingRefresh?.promise ?? Promise.resolve([]), readLibrary: async () => 'devices: []\n' },
    './files': { inspectRevision: () => ({}), validateRevision: () => [], formatBytes: value => String(value) },
    './ComparisonInputs': { ComparisonInputs: () => null },
    './ComparisonResults': { ComparisonResults: () => null },
    './ComparisonLibrary': { ComparisonLibrary: () => null },
    './DatasheetFiles': { DatasheetFiles: () => null },
    './ComparisonCharts': { ComparisonCharts: () => null },
    './ComparisonGuide': { ComparisonGuide: () => null },
    './feedback/ComparisonFeedback': { ComparisonFeedback: () => null },
    './ComparisonDiagramEditor': { default: DraftProbe },
    './downloads': {}, './backup': {}, './datasheetSelection': {},
  } });
  const Workspace = load('src/components/comparison/ComparisonWorkspace.tsx').default;
  let tree;
  await act(async () => { tree = create(React.createElement(Workspace)); }); await flush();
  const input = () => tree.root.findByProps({ 'aria-label': '待保存圖稿' });
  await act(async () => input().props.onChange({ target: { value: '還沒保存的中文草稿' } }));
  assert.equal(mounts, 1);
  pendingRefresh = deferred(); editable = false;
  await act(async () => tree.update(React.createElement(Workspace))); await flush();
  assert.match(JSON.stringify(tree.toJSON()), /正在讀取本機比對紀錄/);
  assert.equal(input().props.value, '還沒保存的中文草稿');
  assert.equal(input().props.disabled, true);
  assert.equal(tree.root.findByProps({ 'aria-label': '匯出草稿' }).props.disabled, false);
  assert.equal(mounts, 1, 'permission refresh must preserve the existing editor instance');
  assert.equal(unmounts, 0);
  await act(async () => pendingRefresh.resolve([])); await flush();
  assert.equal(input().props.value, '還沒保存的中文草稿');
  assert.equal(mounts, 1);
  assert.equal(unmounts, 0);
  await act(async () => tree.unmount());
  assert.equal(unmounts, 1);
});
