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

// Keep menus and dialogs closed until their actual controls are used. The
// shared harness otherwise renders every UI primitive's children at once.
const MenuContext = React.createContext(null);
const DialogContext = React.createContext(null);
const AlertContext = React.createContext(null);
const menuMocks = {
  DropdownMenu({ children }) {
    const [open, setOpen] = React.useState(false);
    return React.createElement(MenuContext.Provider, { value: { open, setOpen } }, children);
  },
  DropdownMenuTrigger({ children }) {
    const menu = React.useContext(MenuContext);
    const trigger = React.Children.only(children);
    return React.cloneElement(trigger, { onClick() { if (!trigger.props.disabled) menu.setOpen(value => !value); } });
  },
  DropdownMenuContent({ children, ...props }) {
    const menu = React.useContext(MenuContext);
    return menu.open ? React.createElement('stub', { ...props, role: 'menu' }, children) : null;
  },
  DropdownMenuItem({ children, disabled, onSelect, ...props }) {
    const menu = React.useContext(MenuContext);
    return React.createElement('stub', { ...props, role: 'menuitem', disabled, onSelect(event) {
      if (disabled) return;
      onSelect?.(event);
      menu.setOpen(false);
    } }, children);
  },
  DropdownMenuGroup: child, DropdownMenuLabel: child, DropdownMenuSeparator: child,
};
const dialogMocks = {
  Dialog: ({ open, onOpenChange, children }) => React.createElement(DialogContext.Provider, { value: { open, onOpenChange } }, children),
  DialogContent({ children, ...props }) {
    return React.useContext(DialogContext).open ? React.createElement('stub', { ...props, role: 'dialog' }, children) : null;
  },
  DialogHeader: child, DialogTitle: child, DialogDescription: child,
};
const alertMocks = {
  AlertDialog: ({ open, onOpenChange, children }) => React.createElement(AlertContext.Provider, { value: { open, onOpenChange } }, children),
  AlertDialogContent({ children, ...props }) {
    return React.useContext(AlertContext).open ? React.createElement('stub', { ...props, role: 'alertdialog' }, children) : null;
  },
  AlertDialogAction({ children, onClick, ...props }) {
    const dialog = React.useContext(AlertContext);
    return React.createElement('stub', { ...props, onClick(event) { onClick?.(event); dialog.onOpenChange(false); } }, children);
  },
  AlertDialogCancel({ children, ...props }) {
    const dialog = React.useContext(AlertContext);
    return React.createElement('stub', { ...props, onClick() { dialog.onOpenChange(false); } }, children);
  },
  AlertDialogDescription: child, AlertDialogFooter: child, AlertDialogHeader: child, AlertDialogTitle: child,
};

function fixture({ canvasBounds } = {}) {
  const window = browser();
  const body = { style: { overflow: 'auto' } };
  window.document = { body };
  const timers = new Map();
  let timerId = 0;
  window.setTimeout = callback => { const id = ++timerId; timers.set(id, callback); return id; };
  window.clearTimeout = id => timers.delete(id);
  window.requestAnimationFrame = () => 0;
  const records = new Map();
  const calls = [];
  const exports = [];
  const flowMounts = [];
  const viewportCalls = [];
  const pointerCaptures = new Set();
  const pointerTarget = {
    setPointerCapture: id => pointerCaptures.add(id),
    hasPointerCapture: id => pointerCaptures.has(id),
    releasePointerCapture: id => pointerCaptures.delete(id),
  };
  const pointerEvent = (x, y, extra = {}) => ({
    pointerId: 1, button: 0, isPrimary: true, clientX: x, clientY: y,
    currentTarget: pointerTarget, preventDefault() {}, stopPropagation() {}, ...extra,
  });
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
  const flow = { setViewport: async value => { viewportCalls.push(clone(value)); }, fitView: async () => {}, screenToFlowPosition: point => point };
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
    './diagramExport': { downloadDiagram: async (document, format) => { exports.push({ document: clone(document), format }); } },
    // Relocating the editor to a portal remounts its ReactFlow subtree in the
    // browser. A distinct wrapper models that lifecycle without a DOM renderer.
    'react-dom': { createPortal: (children, target) => {
      assert.equal(target, body);
      return React.createElement('portal', null, children);
    } },
    '@/components/ui/dropdown-menu': menuMocks,
    '@/components/ui/dialog': dialogMocks,
    '@/components/ui/alert-dialog': alertMocks,
    '@xyflow/react': {
      ReactFlowProvider: ({ children }) => children,
      ReactFlow: props => {
        React.useEffect(() => { flowMounts.push(clone(props.defaultViewport)); }, []);
        return React.createElement('flow', props, props.children);
      },
      useReactFlow: () => flow,
      Background: child, BaseEdge: child, Controls: child, Handle: child, NodeResizer: child,
      BackgroundVariant: { Dots: 'dots' }, ConnectionMode: { Loose: 'loose' }, MarkerType: { ArrowClosed: 'arrowclosed' },
      Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
    },
  } });
  const Editor = load('src/components/comparison/ComparisonDiagramEditor.tsx').default;
  const { DIAGRAM_APPEARANCE_KEY } = load('src/components/comparison/diagramTheme.ts');
  let tree;
  let props = { accountId: accountA, canEdit: true, session: null };
  const render = () => React.createElement(Editor, { ...props, key: props.accountId });
  return {
    records, calls, exports, timers, saveGates, deleteGates, flowMounts, viewportCalls, body, window, pointerCaptures, pointerEvent,
    appearance() { return window.localStorage.getItem(DIAGRAM_APPEARANCE_KEY); },
    seed(account, doc) { owner(account).set(doc.id, clone(doc)); },
    documents(account) { return [...owner(account).values()]; },
    get tree() { return tree; },
    async mount() {
      await act(async () => { tree = create(render(), { createNodeMock: element => canvasBounds && element.props.className === 'diagram-canvas' ? { getBoundingClientRect: () => canvasBounds } : null }); });
      await flush();
    },
    async update(next) { props = { ...props, ...next }; await act(async () => tree.update(render())); await flush(); },
    async unmount() { await act(async () => tree.unmount()); await flush(); },
    title() { return tree.root.findByProps({ id: 'diagram-title' }); },
    button(label) {
      const controls = tree.root.findAll(node => ['stub', 'button'].includes(node.type) && (typeof node.props.onClick === 'function' || typeof node.props.onSelect === 'function'));
      return controls.find(node => node.props['aria-label'] === label || text(node) === label)
        ?? controls.find(node => node.props.role === 'menuitem' && text(node).startsWith(label));
    },
    async edit(title) { await act(async () => this.title().props.onChange({ target: { value: title } })); },
    async click(label) {
      const button = this.button(label);
      assert.ok(button, `Control ${label} exists`);
      assert.ok(!button.props.disabled, `Control ${label} is enabled`);
      await act(async () => { (button.props.onSelect ?? button.props.onClick)(); });
    },
    async menuAction(menu, label) { await this.click(menu); await this.click(label); },
    async pointer(handler, x, y, extra) {
      const overlay = tree.root.findByProps({ 'aria-label': '箭頭繪製區' });
      await act(async () => overlay.props[handler](pointerEvent(x, y, extra)));
    },
    async open(id) {
      const saved = this.documents(props.accountId).find(item => item.id === id);
      assert.ok(saved, `Saved document ${id} exists`);
      await this.menuAction('檔案', '開啟已儲存圖稿');
      await this.click(`開啟圖稿：${saved.title}`);
    },
    async confirmDelete() {
      await this.menuAction('檔案', '刪除此圖稿');
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
  await f.menuAction('檔案', '空白圖稿');
  assert.equal(f.calls.filter(call => call.kind === 'save:start').length, 1);
  assert.equal(f.title().props.disabled, true, 'the switch waits for persistence with editing disabled');
  await f.click('檔案');
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
  await f.menuAction('檔案', '儲存');
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
  await f.menuAction('檔案', '儲存');
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
    await f.click('帶入比對結果');
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

test('read-only viewport survives full-canvas portal remounts without saving the viewing change', async () => {
  const f = fixture();
  const saved = document('readonly-viewport', '唯讀查看圖稿');
  f.seed(accountA, saved);
  await f.mount(); await f.open(saved.id);
  await f.update({ canEdit: false });
  const viewport = { x: -230, y: 185, zoom: 0.65 };
  await act(async () => f.tree.root.findByType('flow').props.onMoveEnd(null, viewport));
  assert.equal(f.timers.size, 0, 'viewing a read-only drawing must not schedule writes');
  assert.equal(text(f.tree.root.findByProps({ 'aria-label': '設為百分之百縮放' })), '65%');
  assert.deepEqual(f.documents(accountA), [saved], 'read-only viewing leaves the stored document unchanged');

  await f.click('展開全畫布');
  assert.equal(f.flowMounts.length, 2, 'moving into the portal remounts the canvas');
  assert.deepEqual(f.flowMounts.at(-1), viewport, 'the new canvas starts at the latest viewing position');
  assert.equal(f.body.style.overflow, 'hidden');
  assert.equal(f.title().props.value, saved.title);
  assert.equal(f.title().props.disabled, true);
  await f.click('離開全畫布');
  assert.equal(f.flowMounts.length, 3, 'moving back into the workspace remounts the canvas again');
  assert.deepEqual(f.flowMounts.at(-1), viewport);
  assert.equal(text(f.tree.root.findByProps({ 'aria-label': '設為百分之百縮放' })), '65%');
  assert.equal(f.body.style.overflow, 'auto', 'leaving full canvas restores page scrolling');
  await f.unmount();
  assert.deepEqual(f.documents(accountA), [saved]);
  assert.equal(f.calls.some(call => call.kind === 'save:start'), false);
});

test('the property panel follows selection and dismissing it preserves edited graph content', async () => {
  const f = fixture();
  await f.mount();
  const inspector = () => f.tree.root.findAll(node => node.type === 'aside' && node.props['aria-label'] === '圖形屬性');
  const flow = () => f.tree.root.findByType('flow');
  assert.equal(inspector().length, 0, 'the blank canvas keeps its space until an object is selected');
  await f.click('方框');
  assert.equal(inspector().length, 1);
  const label = f.tree.root.findByProps({ id: 'diagram-label' });
  await act(async () => label.props.onChange({ target: { value: '已編輯的控制器' } }));
  const selected = flow().props.nodes[0];
  const original = { id: selected.id, data: { label: selected.data.label } };
  await act(async () => flow().props.onPaneClick());
  assert.equal(inspector().length, 0);
  assert.equal(flow().props.nodes[0].data.label, '已編輯的控制器');
  await act(async () => flow().props.onNodeClick(null, flow().props.nodes[0]));
  assert.equal(inspector().length, 1);
  assert.equal(f.tree.root.findByProps({ id: 'diagram-label' }).props.value, original.data.label);
  const editor = f.tree.root.findByProps({ 'aria-label': '圖表編輯器' });
  await act(async () => editor.props.onKeyDown({ key: 'Escape', target: { closest: () => null } }));
  assert.equal(inspector().length, 0);
  assert.equal(flow().props.nodes[0].id, original.id);
  assert.equal(flow().props.nodes[0].data.label, original.data.label);
  await act(async () => flow().props.onNodeClick(null, flow().props.nodes[0]));
  await f.click('關閉屬性面板');
  assert.equal(inspector().length, 0);
  await f.unmount();
  assert.equal(f.documents(accountA)[0].nodes[0].label, original.data.label, 'dismissing UI preserves the content that is saved');
});

test('read-only mode preserves an unsaved drawing for export while rejecting current mutation callbacks', async () => {
  const f = fixture();
  await f.mount();
  await f.edit('權限變更前的未存草稿');
  await f.click('方框');
  await act(async () => f.tree.root.findByProps({ id: 'diagram-label' }).props.onChange({ target: { value: '仍可匯出的圖形' } }));
  const selected = f.tree.root.findByType('flow').props.nodes[0];
  const original = { id: selected.id, data: { label: selected.data.label }, position: clone(selected.position) };
  await f.update({ canEdit: false });
  assert.equal(f.timers.size, 0, 'permission changes cancel the pending write instead of discarding the draft');
  assert.equal(f.title().props.disabled, true);
  assert.equal(f.tree.root.findByProps({ id: 'diagram-label' }).props.disabled, true);
  assert.equal(f.button('方框').props.disabled, true);
  assert.equal(f.button('複製圖形').props.disabled, true);
  const flow = () => f.tree.root.findByType('flow');
  assert.equal(flow().props.nodesDraggable, false);
  assert.equal(flow().props.nodesConnectable, false);
  await f.edit('不應覆寫的名稱');
  await act(async () => {
    f.tree.root.findByProps({ id: 'diagram-label' }).props.onChange({ target: { value: '不應覆寫的圖形' } });
    flow().props.onNodesChange([{ id: original.id, type: 'position', position: { x: 999, y: 999 } }]);
  });
  assert.equal(f.title().props.value, '權限變更前的未存草稿');
  assert.equal(flow().props.nodes[0].data.label, original.data.label);
  assert.deepEqual(clone(flow().props.nodes[0].position), original.position);
  assert.ok(!f.button('匯出').props.disabled);
  await f.menuAction('匯出', '可編輯圖稿 JSON');
  assert.equal(f.exports.length, 1);
  assert.equal(f.exports[0].format, 'json');
  assert.equal(f.exports[0].document.title, '權限變更前的未存草稿');
  assert.equal(f.exports[0].document.nodes[0].id, original.id);
  assert.equal(f.exports[0].document.nodes[0].label, original.data.label);
  await f.click('檔案');
  assert.equal(f.button('儲存').props.disabled, true);
  assert.equal(f.button('空白圖稿').props.disabled, true);
  await f.unmount();
  assert.equal(f.documents(accountA).length, 0, 'read-only export does not write the draft into storage');
});

test('canvas appearance survives reopening without changing diagram content, undo history, or storage', async () => {
  const f = fixture();
  await f.mount();
  assert.equal(f.tree.root.findByType('flow').props.colorMode, 'dark', 'new browsers start with the requested dark canvas');
  assert.equal(f.button('復原').props.disabled, true);
  await f.click('切換淺色模式');
  assert.equal(f.tree.root.findByType('flow').props.colorMode, 'light');
  assert.equal(f.appearance(), 'light');
  assert.equal(f.timers.size, 0, 'appearance changes do not schedule a diagram autosave');
  assert.equal(f.button('復原').props.disabled, true, 'appearance is independent of the diagram undo history');
  await f.unmount();
  assert.equal(f.calls.some(call => call.kind === 'save:start'), false);
  await f.mount();
  assert.equal(f.tree.root.findByType('flow').props.colorMode, 'light', 'reopening reads the browser preference');
  await f.update({ canEdit: false });
  await f.click('切換深色模式');
  assert.equal(f.tree.root.findByType('flow').props.colorMode, 'dark', 'viewers can choose their own canvas appearance');
  assert.equal(f.appearance(), 'dark');
  assert.equal(f.timers.size, 0);
  await f.unmount();
  assert.equal(f.calls.some(call => call.kind === 'save:start'), false);
});

test('a free arrow previews without edits, supports one-step undo, and saves editable geometry without virtual nodes', async () => {
  const f = fixture();
  await f.mount();
  const flow = () => f.tree.root.findByType('flow');
  await f.click('畫箭頭');
  await f.pointer('onPointerDown', 40, 60);
  await f.pointer('onPointerMove', 260, 180);
  assert.equal(f.pointerCaptures.has(1), true);
  assert.equal(flow().props.edges.length, 0, 'pointer movement draws only a preview');
  assert.equal(f.timers.size, 0);
  assert.equal(f.button('復原').props.disabled, true);
  await f.pointer('onPointerUp', 260, 180);
  assert.equal(f.pointerCaptures.has(1), false);
  assert.equal(flow().props.edges.length, 1);
  const edge = clone(flow().props.edges[0].data.edge);
  assert.equal(edge.source, ''); assert.equal(edge.target, '');
  assert.deepEqual(edge.sourcePoint, { x: 40, y: 60 });
  assert.deepEqual(edge.targetPoint, { x: 260, y: 180 });
  assert.equal(edge.lineType, 'straight');
  assert.equal(edge.arrowhead, 'end');
  assert.equal(flow().props.nodes.filter(node => node.type === 'endpoint').length, 2, 'the canvas projects free endpoints without creating real shapes');
  assert.equal(f.button('畫箭頭').props['aria-pressed'], true, 'drawing remains active for the next arrow');
  await f.click('復原');
  assert.equal(flow().props.edges.length, 0, 'one undo removes the whole drag');
  assert.equal(flow().props.nodes.length, 0);
  await f.click('重做');
  assert.equal(flow().props.edges[0].id, edge.id);
  await f.runTimers(); await flush();
  assert.equal(text(f.tree.root.findByProps({ className: 'diagram-save-status' })), '已存於本機', 'saving a new arrow clears the pending state despite parser property normalization');
  assert.equal(f.timers.size, 0);
  assert.equal(f.calls.filter(call => call.kind === 'save:start').length, 1);
  await f.runTimers(); await flush();
  assert.equal(f.calls.filter(call => call.kind === 'save:start').length, 1, 'a completed arrow save does not start another autosave');
  await f.click('選取工具');
  for (const [id, value] of [['diagram-line-type', 'curve'], ['diagram-arrowhead', 'both'], ['diagram-line-style', 'dashed'], ['diagram-line-width', '4']]) {
    await act(async () => f.tree.root.findByProps({ id }).props.onChange({ target: { value } }));
  }
  await f.runTimers(); await flush();
  assert.equal(text(f.tree.root.findByProps({ className: 'diagram-save-status' })), '已存於本機', 'saving arrow property changes also clears the pending state');
  assert.equal(f.timers.size, 0);
  assert.equal(f.calls.filter(call => call.kind === 'save:start').length, 2);
  const saved = f.documents(accountA)[0];
  assert.equal(saved.nodes.length, 0, 'virtual endpoints never enter the stored document');
  assert.deepEqual(saved.edges[0], { ...edge, lineType: 'curve', arrowhead: 'both', style: 'dashed', width: 4 });
  await f.menuAction('匯出', '可編輯圖稿 JSON');
  assert.equal(f.exports[0].document.nodes.length, 0);
  assert.deepEqual(f.exports[0].document.edges, saved.edges);
  await f.unmount();
  assert.equal(f.calls.filter(call => call.kind === 'save:start').length, 2, 'leaving an already saved arrow does not flush a duplicate write');
  await f.mount(); await f.open(saved.id);
  assert.deepEqual(clone(flow().props.edges[0].data.edge), saved.edges[0], 'reopening restores both coordinates and the chosen arrow properties');
  assert.equal(flow().props.nodes.filter(node => node.type === 'diagram').length, 0);
  await f.unmount();
});

test('fitting the canvas contains distant free endpoints and outward curve control points', async () => {
  const canvasBounds = { width: 1000, height: 600, left: 0, top: 0, right: 1000, bottom: 600 };
  const free = document('fit-free', '遠距自由箭頭');
  free.edges = [{ id: 'free', source: '', sourcePoint: { x: -2500, y: -1200 }, target: '', targetPoint: { x: 3000, y: 1300 }, label: '', color: '#79a9e8', lineType: 'straight' }];
  const curve = document('fit-curve', '外彎曲線');
  curve.nodes = [
    { id: 'a', x: 0, y: 100, width: 80, height: 80, shape: 'rectangle', label: 'A', detail: '', color: '#79a9e8' },
    { id: 'b', x: 500, y: 100, width: 80, height: 80, shape: 'rectangle', label: 'B', detail: '', color: '#79a9e8' },
  ];
  curve.edges = [{ id: 'curve', source: 'a', sourcePort: 'left', target: 'b', targetPort: 'right', label: '', color: '#79a9e8', lineType: 'curve' }];
  for (const [saved, points] of [
    [free, [{ x: -2500, y: -1200 }, { x: 3000, y: 1300 }]],
    // These outward handles bend 160 px beyond the shape bounds. Fitting only
    // nodes clips the curve even though both rectangles appear to fit.
    [curve, [{ x: 0, y: 100 }, { x: 580, y: 180 }, { x: -160, y: 140 }, { x: 740, y: 140 }]],
  ]) {
    const f = fixture({ canvasBounds });
    f.seed(accountA, saved); await f.mount(); await f.open(saved.id);
    await f.click('適合畫布');
    assert.equal(f.viewportCalls.length, 1, `${saved.title} issues an actual camera update`);
    const viewport = f.viewportCalls[0];
    assert.ok(viewport.zoom >= 0.1 && viewport.zoom <= 1.2);
    for (const point of points) {
      const x = point.x * viewport.zoom + viewport.x;
      const y = point.y * viewport.zoom + viewport.y;
      assert.ok(x >= 24 && x <= canvasBounds.width - 24, `${saved.title} keeps x=${point.x} inside the canvas with usable margin`);
      assert.ok(y >= 24 && y <= canvasBounds.height - 24, `${saved.title} keeps y=${point.y} inside the canvas with usable margin`);
    }
    await f.unmount();
  }
});

test('cancelled gestures and short clicks do not leave arrows or autosave work behind', async () => {
  const f = fixture();
  await f.mount(); await f.click('畫箭頭');
  await f.pointer('onPointerDown', 40, 60);
  await f.pointer('onPointerMove', 240, 160);
  await f.pointer('onPointerCancel', 240, 160);
  await f.pointer('onPointerUp', 240, 160);
  assert.equal(f.tree.root.findByType('flow').props.edges.length, 0);
  await f.pointer('onPointerDown', 40, 60);
  await f.pointer('onPointerUp', 43, 61);
  assert.equal(f.tree.root.findByType('flow').props.edges.length, 0, 'a click without an intentional drag does not create a zero-length arrow');
  assert.equal(f.timers.size, 0);
  await f.unmount();
  assert.equal(f.documents(accountA).length, 0);
});

test('a long drag that snaps to one anchor reports the problem without creating an invisible arrow', async () => {
  const f = fixture();
  const saved = document('coincident-arrow', '重疊端點');
  saved.nodes = [{ id: 'controller', x: 100, y: 100, width: 160, height: 80, shape: 'rectangle', label: '控制器', detail: '', color: '#79a9e8' }];
  f.seed(accountA, saved); await f.mount(); await f.open(saved.id); await f.click('畫箭頭');
  await f.pointer('onPointerDown', 110, 140);
  await f.pointer('onPointerMove', 160, 140);
  await f.pointer('onPointerUp', 160, 140);
  assert.equal(f.tree.root.findByType('flow').props.edges.length, 0, 'an intentional drag inside one half of a shape must not create a zero-length snapped arrow');
  const alert = text(f.tree.root.findByProps({ role: 'alert' }));
  assert.match(alert, /(起點|終點|端點|兩端)/);
  assert.match(alert, /(重疊|相同|同一|太近|距離)/);
  assert.match(alert, /(請|移動|拉開|調整)/, 'the message tells the user how to make a visible arrow');
  assert.equal(f.timers.size, 0);
  await f.unmount();
  assert.deepEqual(f.documents(accountA), [saved]);
  assert.equal(f.calls.some(call => call.kind === 'save:start'), false);
});

test('Escape cancels both stale reconnection callbacks until another endpoint drag starts', async () => {
  const f = fixture();
  const saved = document('cancel-reconnect', '取消重接');
  saved.nodes = [{ id: 'controller', x: 400, y: 100, width: 160, height: 80, shape: 'rectangle', label: '控制器', detail: '', color: '#79a9e8' }];
  saved.edges = [{ id: 'free', source: '', sourcePoint: { x: 40, y: 60 }, target: '', targetPoint: { x: 260, y: 180 }, label: '', color: '#79a9e8', lineType: 'straight', arrowhead: 'end' }];
  f.seed(accountA, saved); await f.mount(); await f.open(saved.id);
  const flow = () => f.tree.root.findByType('flow');
  await act(async () => flow().props.onEdgeClick(null, flow().props.edges[0]));
  const pending = flow().props;
  await act(async () => pending.onReconnectStart());
  const editor = f.tree.root.findByProps({ 'aria-label': '圖表編輯器' });
  await act(async () => editor.props.onKeyDown({ key: 'Escape', target: { closest: () => null } }));
  await act(async () => pending.onReconnectEnd({ type: 'mouseup', clientX: 700, clientY: 400 }, pending.edges[0], 'source', { isValid: false, fromHandle: { id: 'center' }, toHandle: null }));
  assert.deepEqual(clone(flow().props.edges[0].data.edge), saved.edges[0], 'a cancelled mouseup cannot detach an endpoint');
  await act(async () => pending.onReconnect(pending.edges[0], { source: 'controller', sourceHandle: 'left', target: pending.edges[0].target, targetHandle: 'center' }));
  assert.deepEqual(clone(flow().props.edges[0].data.edge), saved.edges[0], 'a cancelled native handle candidate cannot attach an endpoint');
  assert.equal(f.timers.size, 0);
  await act(async () => flow().props.onEdgeClick(null, flow().props.edges[0]));
  const next = flow().props;
  await act(async () => {
    next.onReconnectStart();
    next.onReconnect(next.edges[0], { source: 'controller', sourceHandle: 'left', target: next.edges[0].target, targetHandle: 'center' });
    next.onReconnectEnd({ type: 'mouseup', clientX: 400, clientY: 140 }, next.edges[0], 'target', { isValid: true, fromHandle: { id: 'center' }, toHandle: { id: 'left' } });
  });
  const reconnected = clone(flow().props.edges[0].data.edge);
  assert.equal(reconnected.source, 'controller');
  assert.equal(reconnected.sourcePort, 'left');
  assert.equal(reconnected.sourcePoint, undefined);
  assert.deepEqual(reconnected.targetPoint, saved.edges[0].targetPoint, 'a fresh drag works and retains the opposite endpoint');
  await f.unmount();
});

test('reconnection can detach either endpoint and attach a free endpoint to a shape without moving the opposite end', async () => {
  const f = fixture();
  const saved = document('reconnect-arrow', '重接箭頭');
  saved.nodes = [
    { id: 'controller', x: 100, y: 100, width: 160, height: 80, shape: 'rectangle', label: '控制器', detail: '', color: '#79a9e8' },
    { id: 'load', x: 400, y: 100, width: 160, height: 80, shape: 'rectangle', label: '負載', detail: '', color: '#79a9e8' },
  ];
  saved.edges = [{ id: 'wire', source: 'controller', target: 'load', sourcePort: 'right', targetPort: 'left', label: '電源', color: '#79a9e8', lineType: 'elbow', arrowhead: 'both' }];
  f.seed(accountA, saved);
  await f.mount(); await f.open(saved.id);
  const flow = () => f.tree.root.findByType('flow');
  const edge = () => flow().props.edges[0];
  const endpointDrop = async (fixedHandle, x, y) => {
    const before = edge();
    await act(async () => {
      flow().props.onReconnectStart();
      // XYFlow reports the fixed, opposite handle: dragging the target gives source.
      flow().props.onReconnectEnd({ type: 'mouseup', clientX: x, clientY: y }, before, fixedHandle, { isValid: false, fromHandle: { id: fixedHandle }, toHandle: null });
    });
  };
  await endpointDrop('source', 660, 300);
  let current = clone(edge().data.edge);
  assert.equal(current.source, 'controller'); assert.equal(current.sourcePort, 'right');
  assert.equal(current.target, ''); assert.equal(current.targetPort, undefined);
  assert.deepEqual(current.targetPoint, { x: 660, y: 300 });
  await endpointDrop('target', 50, 340);
  current = clone(edge().data.edge);
  assert.equal(current.source, ''); assert.equal(current.sourcePort, undefined);
  assert.deepEqual(current.sourcePoint, { x: 50, y: 340 });
  assert.deepEqual(current.targetPoint, { x: 660, y: 300 });
  const beforeHandleReconnect = edge();
  await act(async () => {
    flow().props.onReconnectStart();
    flow().props.onReconnect(beforeHandleReconnect, { source: 'load', sourceHandle: 'bottom', target: beforeHandleReconnect.target, targetHandle: 'center' });
    flow().props.onReconnectEnd({ type: 'mouseup', clientX: 480, clientY: 180 }, beforeHandleReconnect, 'target', { isValid: true, fromHandle: { id: 'center' }, toHandle: { id: 'bottom' } });
  });
  current = clone(edge().data.edge);
  assert.equal(current.source, 'load'); assert.equal(current.sourcePort, 'bottom');
  assert.equal(current.sourcePoint, undefined);
  assert.deepEqual(current.targetPoint, { x: 660, y: 300 }, 'native handle reconnection preserves the virtual opposite endpoint');
  await endpointDrop('source', 140, 140);
  current = clone(edge().data.edge);
  assert.equal(current.target, 'controller', 'dropping on a shape body snaps without requiring a tiny handle');
  assert.equal(current.targetPort, 'right');
  assert.equal(current.targetPoint, undefined);
  assert.equal(current.source, 'load'); assert.equal(current.sourcePort, 'bottom');
  await f.runTimers(); await flush();
  const stored = f.documents(accountA).find(item => item.id === saved.id);
  assert.equal(stored.nodes.length, 2);
  assert.deepEqual(stored.edges[0], current);
  await f.unmount();
});

test('reversing attached, mixed, and free arrows swaps endpoints while retaining their styles', async () => {
  const f = fixture();
  const saved = document('reverse-arrows', '反轉測試');
  saved.nodes = [
    { id: 'a', x: 100, y: 100, width: 160, height: 80, shape: 'rectangle', label: 'A', detail: '', color: '#79a9e8' },
    { id: 'b', x: 400, y: 100, width: 160, height: 80, shape: 'rectangle', label: 'B', detail: '', color: '#79a9e8' },
  ];
  const style = { label: '保留樣式', color: '#d6ad65', style: 'dashed', lineType: 'curve', arrowhead: 'both', width: 5 };
  saved.edges = [
    { id: 'attached', source: 'a', sourcePort: 'top', target: 'b', targetPort: 'bottom', ...style },
    { id: 'mixed', source: 'a', sourcePort: 'left', target: '', targetPoint: { x: 0, y: 200 }, ...style },
    { id: 'free', source: '', sourcePoint: { x: 0, y: 300 }, target: '', targetPoint: { x: 600, y: 300 }, ...style },
  ];
  f.seed(accountA, saved); await f.mount(); await f.open(saved.id);
  const flow = () => f.tree.root.findByType('flow');
  for (const original of saved.edges) {
    await act(async () => flow().props.onEdgeClick(null, flow().props.edges.find(edge => edge.id === original.id)));
    await f.click('反轉方向');
    const reversed = clone(flow().props.edges.find(edge => edge.id === original.id).data.edge);
    assert.equal(reversed.source, original.target); assert.equal(reversed.target, original.source);
    assert.equal(reversed.sourcePort, original.targetPort); assert.equal(reversed.targetPort, original.sourcePort);
    assert.deepEqual(reversed.sourcePoint, original.targetPoint); assert.deepEqual(reversed.targetPoint, original.sourcePoint);
    for (const [property, value] of Object.entries(style)) assert.equal(reversed[property], value, `reversal retains ${property}`);
  }
  await f.runTimers(); await flush();
  assert.equal(f.documents(accountA).find(item => item.id === saved.id).edges.length, 3, 'all reversed endpoint combinations remain valid saved documents');
  await f.unmount();
});

test('reversing a legacy arrow preserves its physical anchors when its original ports were omitted', async () => {
  const f = fixture();
  const saved = document('legacy-reverse', '舊版預設端點');
  saved.nodes = [
    { id: 'a', x: 100, y: 100, width: 160, height: 80, shape: 'rectangle', label: 'A', detail: '', color: '#79a9e8' },
    { id: 'b', x: 400, y: 100, width: 160, height: 80, shape: 'rectangle', label: 'B', detail: '', color: '#79a9e8' },
  ];
  saved.edges = [{ id: 'legacy', source: 'a', target: 'b', label: '舊連線', color: '#79a9e8' }];
  f.seed(accountA, saved); await f.mount(); await f.open(saved.id);
  const flow = () => f.tree.root.findByType('flow');
  assert.equal(flow().props.edges[0].sourceHandle, 'right');
  assert.equal(flow().props.edges[0].targetHandle, 'left');
  await act(async () => flow().props.onEdgeClick(null, flow().props.edges[0]));
  await f.click('反轉方向');
  const reversed = clone(flow().props.edges[0].data.edge);
  assert.equal(reversed.source, 'b'); assert.equal(reversed.target, 'a');
  assert.equal(reversed.sourcePort, 'left', 'the old target keeps its physical left anchor after becoming the source');
  assert.equal(reversed.targetPort, 'right', 'the old source keeps its physical right anchor after becoming the target');
  assert.equal(flow().props.edges[0].sourceHandle, 'left');
  assert.equal(flow().props.edges[0].targetHandle, 'right');
  await f.runTimers(); await flush();
  assert.deepEqual(f.documents(accountA).find(item => item.id === saved.id).edges[0], JSON.parse(JSON.stringify(reversed)));
  await f.unmount();
});

test('revoking permission during a stroke blocks stale drawing and reconnection callbacks while retaining export', async () => {
  const f = fixture();
  const saved = document('readonly-arrow', '唯讀箭頭');
  saved.nodes = [{ id: 'controller', x: 400, y: 100, width: 160, height: 80, shape: 'rectangle', label: '控制器', detail: '', color: '#79a9e8' }];
  saved.edges = [{ id: 'free', source: '', sourcePoint: { x: 40, y: 60 }, target: '', targetPoint: { x: 260, y: 180 }, label: '', color: '#79a9e8', lineType: 'straight', arrowhead: 'end' }];
  f.seed(accountA, saved); await f.mount(); await f.open(saved.id); await f.click('畫箭頭');
  const overlay = f.tree.root.findByProps({ 'aria-label': '箭頭繪製區' }).props;
  const oldFlow = f.tree.root.findByType('flow').props;
  await f.pointer('onPointerDown', 400, 200);
  await f.update({ canEdit: false });
  assert.equal(f.button('畫箭頭').props.disabled, true);
  assert.equal(f.tree.root.findAllByProps({ 'aria-label': '箭頭繪製區' }).length, 0);
  const readOnlyFlow = f.tree.root.findByType('flow').props;
  assert.equal(readOnlyFlow.edgesReconnectable, false);
  assert.equal(readOnlyFlow.edges[0].reconnectable, false);
  await act(async () => {
    overlay.onPointerMove(f.pointerEvent(600, 320));
    overlay.onPointerUp(f.pointerEvent(600, 320));
    overlay.onPointerDown(f.pointerEvent(400, 200));
    overlay.onPointerUp(f.pointerEvent(600, 320));
    oldFlow.onReconnectStart();
    oldFlow.onReconnectEnd({ type: 'mouseup', clientX: 700, clientY: 400 }, oldFlow.edges[0], 'source', { isValid: false, fromHandle: { id: 'center' }, toHandle: null });
    oldFlow.onReconnect(oldFlow.edges[0], { source: 'controller', target: oldFlow.edges[0].target, sourceHandle: 'left', targetHandle: 'center' });
  });
  assert.equal(f.timers.size, 0);
  await f.menuAction('匯出', '可編輯圖稿 JSON');
  assert.deepEqual(f.exports[0].document.edges, saved.edges);
  assert.deepEqual(f.exports[0].document.nodes, saved.nodes);
  await f.unmount();
  assert.deepEqual(f.documents(accountA), [saved]);
  assert.equal(f.calls.some(call => call.kind === 'save:start'), false);
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
