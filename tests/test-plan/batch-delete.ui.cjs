const assert = require('node:assert/strict');
const test = require('node:test');
const { React, create, act, loader, browser, deferred } = require('../support/renderHarness.cjs');

const stamp = '2026-10-15T00:00:00.000Z';
const key = entry => `${entry.kind}:${entry.id}`;
const entryName = entry => entry.kind === 'folder' ? entry.name : entry.originalName;
function file(id, name, spaceId = 'space-a', folderId = null) {
  return { id, originalName: name, spaceId, folderId, storagePath: `${spaceId}/${id}`, mimeType: 'text/plain', extension: 'txt', category: 'document', fileSize: 100, description: null, uploadedBy: 'owner-a', createdAt: stamp, updatedAt: stamp };
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node.children ?? []).map(text).join('');
}
function fixture() {
  const window = browser();
  const calls = [];
  const notices = [];
  const spaces = ['a', 'b'].map(id => ({ id: `space-${id}`, ownerId: `owner-${id}`, name: `使用者 ${id}`, description: `@user-${id}`, isPersonal: true, projectId: null, color: '#5fae94', createdAt: stamp, updatedAt: stamp }));
  const state = {
    spaces, ownerId: 'owner-a', activeSpaceId: null, activeSpace: null,
    folders: [{ id: 'folder-a', spaceId: 'space-a', parentId: null, name: 'Release', createdBy: 'owner-a', createdAt: stamp, updatedAt: stamp }],
    files: [file('file-a', 'Alpha.txt'), file('file-b', 'Beta.txt'), file('file-readonly', '唯讀.txt', 'space-b')],
    loading: false, busy: false, error: null, uploadProgress: null, canEdit: true, isAuthenticated: true,
    canEditSpace: id => id === 'space-a',
    async openSpace(id) { state.activeSpaceId = id; state.activeSpace = spaces.find(space => space.id === id) ?? null; },
    async refreshWorkspace() {},
    async deleteEntries(entries) { calls.push(entries); return { deletedKeys: entries.map(key), failures: [], cleanupPending: false }; },
  };
  const child = ({ children, ...props }) => React.createElement('stub', props, children);
  const load = loader({ window, globals: { Error }, mocks: {
    './hooks/useTestPlanWorkspace': { useTestPlanWorkspace: () => {
      const [, rerender] = React.useReducer(count => count + 1, 0);
      return { ...state, async deleteEntries(entries) {
        state.busy = true; rerender();
        try { return await state.deleteEntries(entries); }
        finally { state.busy = false; rerender(); }
      } };
    } },
    './TestPlanInspector': { TestPlanInspector: ({ entry }) => React.createElement('aside', { 'data-inspector': entry.id }) },
    './TestPlanSpreadsheetEditor': { TestPlanSpreadsheetEditor: () => null },
    '@/components/ui/alert-dialog': {
      AlertDialog: ({ open, children, ...props }) => open ? React.createElement('section', { ...props, role: 'alertdialog' }, children) : null,
      AlertDialogAction: ({ children, ...props }) => React.createElement('button', { ...props, 'data-confirm': true }, children),
      AlertDialogCancel: ({ children, ...props }) => React.createElement('button', { ...props, 'data-cancel': true }, children),
      AlertDialogContent: child, AlertDialogDescription: child, AlertDialogFooter: child, AlertDialogHeader: child, AlertDialogTitle: child,
    },
    sonner: { toast: Object.fromEntries(['success', 'warning', 'error'].map(level => [level, message => notices.push({ level, message })])) },
  } });
  return { state, window, calls, notices, Component: load('src/components/test-plan/TestPlanWorkspace.tsx').TestPlanWorkspace };
}
const host = node => typeof node.type === 'string';
function control(tree, label) {
  const matches = tree.root.findAll(node => host(node) && node.props['aria-label'] === label);
  assert.equal(matches.length, 1, `one accessible control: ${label}`);
  return matches[0];
}
function button(tree, label) {
  const matches = tree.root.findAll(node => host(node) && ['button', 'stub'].includes(node.type) && typeof node.props.onClick === 'function' && text(node) === label);
  assert.equal(matches.length, 1, `one action: ${label}`);
  return matches[0];
}
function selectFor(tree, label) {
  let node = control(tree, label);
  while (node && typeof node.props.onValueChange !== 'function') node = node.parent;
  assert.ok(node, `select change handler for ${label}`);
  return node;
}
function checkbox(tree, name) { return control(tree, `勾選 ${name}`); }
async function check(node, checked = true) {
  await act(async () => {
    if (node.props.onCheckedChange) node.props.onCheckedChange(checked);
    else node.props.onChange({ target: { checked }, currentTarget: { checked } });
  });
}
async function bubble(node, handler, details = {}) {
  let stopped = false;
  await act(async () => {
    const event = { ...details, target: node, stopPropagation() { stopped = true; } };
    for (let cursor = node; cursor && !stopped; cursor = cursor.parent) {
      if (host(cursor) && typeof cursor.props[handler] === 'function') cursor.props[handler](event);
    }
  });
  return stopped;
}
const selected = tree => tree.root.findAll(node => host(node) && node.props['aria-label']?.startsWith('勾選 ') && node.props.checked === true).map(node => node.props['aria-label'].slice(3)).sort();
const dialog = tree => tree.root.findAll(node => node.type === 'section' && node.props.role === 'alertdialog')[0];
const confirm = tree => dialog(tree).findByProps({ 'data-confirm': true });
const rerender = async (tree, f) => act(async () => tree.update(React.createElement(f.Component)));
async function mount(f) { let tree; await act(async () => { tree = create(React.createElement(f.Component)); }); return tree; }
async function unmount(tree) { await act(async () => tree.unmount()); }

test('list and card selection stay independent from preview and select-all excludes read-only entries', async () => {
  const f = fixture(); const tree = await mount(f);
  assert.equal(checkbox(tree, '唯讀.txt').props.disabled, true);
  await check(checkbox(tree, '唯讀.txt'));
  assert.deepEqual(selected(tree), [], 'even a stale checkbox callback cannot add a read-only target');
  assert.equal(await bubble(checkbox(tree, 'Alpha.txt'), 'onClick'), true);
  assert.equal(await bubble(checkbox(tree, 'Alpha.txt'), 'onDoubleClick'), true);
  assert.equal(await bubble(checkbox(tree, 'Alpha.txt'), 'onKeyDown', { key: 'Enter' }), true, 'Enter on a checkbox does not open its row');
  await check(checkbox(tree, 'Alpha.txt'));
  assert.deepEqual(selected(tree), ['Alpha.txt']);
  assert.equal(tree.root.findAll(node => node.type === 'aside' && node.props['data-inspector']).length, 0, 'checking a file does not open its preview');
  assert.match(text(tree.root), /已勾選 1 項/);
  await check(control(tree, '全選目前清單可刪除項目'));
  assert.deepEqual(selected(tree), ['Alpha.txt', 'Beta.txt', 'Release']);
  assert.equal(control(tree, '全選目前清單可刪除項目').props.checked, true);
  await act(async () => button(tree, '卡片檢視').props.onClick());
  assert.deepEqual(selected(tree), ['Alpha.txt', 'Beta.txt', 'Release']);
  assert.equal(checkbox(tree, '唯讀.txt').props.disabled, true);
  await check(checkbox(tree, 'Beta.txt'), false);
  assert.deepEqual(selected(tree), ['Alpha.txt', 'Release']);
  await act(async () => button(tree, '取消勾選').props.onClick());
  assert.deepEqual(selected(tree), []);
  assert.equal(f.calls.length, 0);
  await unmount(tree);
});

test('batch delete waits for confirmation, lists exact targets, and cancellation leaves files untouched', async () => {
  const f = fixture(); const tree = await mount(f);
  await check(checkbox(tree, 'Alpha.txt'));
  await check(checkbox(tree, 'Release'));
  await act(async () => button(tree, '刪除已選項目').props.onClick());
  assert.equal(f.calls.length, 0);
  assert.ok(dialog(tree));
  assert.match(text(dialog(tree)), /2/);
  assert.match(text(dialog(tree)), /Alpha\.txt/);
  assert.match(text(dialog(tree)), /Release/);
  assert.match(text(dialog(tree)), /永久刪除/);
  assert.match(text(dialog(tree)), /(?:資料夾.*所有|所有.*檔案)/);
  await act(async () => dialog(tree).props.onOpenChange(false));
  assert.equal(dialog(tree), undefined);
  assert.deepEqual(selected(tree), ['Alpha.txt', 'Release']);
  assert.equal(f.calls.length, 0);
  await act(async () => button(tree, '刪除已選項目').props.onClick());
  await act(async () => confirm(tree).props.onClick({ preventDefault() {} }));
  assert.deepEqual(f.calls.map(entries => Array.from(entries, entryName).sort()), [['Alpha.txt', 'Release']]);
  assert.deepEqual(selected(tree), []);
  assert.equal(dialog(tree), undefined);
  await unmount(tree);
});

test('partial failures stay checked for retry while successfully deleted entries are cleared', async () => {
  const f = fixture();
  f.state.deleteEntries = async entries => {
    f.calls.push(entries);
    return f.calls.length === 1
      ? { deletedKeys: ['file:file-a'], failures: [{ key: 'file:file-b', name: 'Beta.txt', message: '刪除權限已變更' }], cleanupPending: true }
      : { deletedKeys: entries.map(key), failures: [], cleanupPending: false };
  };
  const tree = await mount(f);
  await check(checkbox(tree, 'Alpha.txt')); await check(checkbox(tree, 'Beta.txt'));
  await act(async () => button(tree, '刪除已選項目').props.onClick());
  await act(async () => confirm(tree).props.onClick({ preventDefault() {} }));
  assert.deepEqual(selected(tree), ['Beta.txt']);
  assert.match(JSON.stringify(tree.toJSON()), /Beta\.txt/);
  assert.ok(f.notices.some(notice => notice.level === 'error' && /刪除權限已變更/.test(notice.message)));
  assert.ok(f.notices.some(notice => /清理/.test(notice.message)), 'storage cleanup retry warning is retained for successful metadata deletions');
  await act(async () => button(tree, '刪除已選項目').props.onClick());
  await act(async () => confirm(tree).props.onClick({ preventDefault() {} }));
  assert.deepEqual(Array.from(f.calls[1], key), ['file:file-b']);
  assert.deepEqual(selected(tree), []);
  await unmount(tree);
});

test('a pending deletion blocks another submission and changes to selected targets', async () => {
  const f = fixture(); const pending = deferred();
  f.state.deleteEntries = entries => { f.calls.push(entries); return pending.promise; };
  const tree = await mount(f);
  await check(checkbox(tree, 'Alpha.txt'));
  await act(async () => button(tree, '刪除已選項目').props.onClick());
  const action = confirm(tree);
  await act(async () => { action.props.onClick({ preventDefault() {} }); });
  assert.equal(f.calls.length, 1);
  assert.equal(checkbox(tree, 'Beta.txt').props.disabled, true);
  assert.equal(control(tree, '全選目前清單可刪除項目').props.disabled, true);
  assert.equal(button(tree, '取消勾選').props.disabled, true);
  assert.equal(control(tree, '上傳資料夾').props.disabled, true);
  await act(async () => { action.props.onClick({ preventDefault() {} }); });
  assert.equal(f.calls.length, 1, 'a stale action callback cannot duplicate the operation');
  const beforeUnload = new Event('beforeunload', { cancelable: true }); f.window.dispatchEvent(beforeUnload);
  assert.equal(beforeUnload.defaultPrevented, true);
  await act(async () => pending.resolve({ deletedKeys: ['file:file-a'], failures: [], cleanupPending: false }));
  assert.deepEqual(selected(tree), []);
  assert.equal(checkbox(tree, 'Beta.txt').props.disabled, false);
  await unmount(tree);
});

test('sorting and switching list/card views preserve selection, but search and category changes clear it', async () => {
  const f = fixture(); const tree = await mount(f);
  await check(checkbox(tree, 'Alpha.txt'));
  await act(async () => selectFor(tree, '排序方式').props.onValueChange('name'));
  assert.deepEqual(selected(tree), ['Alpha.txt']);
  await act(async () => button(tree, '卡片檢視').props.onClick());
  assert.deepEqual(selected(tree), ['Alpha.txt']);
  await act(async () => button(tree, '清單檢視').props.onClick());
  assert.deepEqual(selected(tree), ['Alpha.txt']);
  const search = tree.root.findAll(node => host(node) && node.props.placeholder === '搜尋檔案與資料夾')[0];
  await act(async () => search.props.onChange({ target: { value: 'Alpha' } }));
  assert.deepEqual(selected(tree), []);
  await check(checkbox(tree, 'Alpha.txt'));
  await act(async () => selectFor(tree, '檔案格式').props.onValueChange('image'));
  assert.deepEqual(selected(tree), []);
  assert.equal(f.calls.length, 0);
  await unmount(tree);
});

for (const context of ['account', 'space', 'folder']) {
  test(`changing ${context} clears selections and invalidates an already open confirmation`, async () => {
    const f = fixture(); const tree = await mount(f);
    await check(checkbox(tree, 'Alpha.txt'));
    await act(async () => button(tree, '刪除已選項目').props.onClick());
    const oldConfirm = confirm(tree).props.onClick;
    if (context === 'account') { f.state.ownerId = 'owner-b'; await rerender(tree, f); }
    else if (context === 'space') { f.state.activeSpaceId = 'space-a'; f.state.activeSpace = f.state.spaces[0]; await rerender(tree, f); }
    else {
      const folder = tree.root.findAll(node => node.type === 'article' && text(node).includes('Release'))[0];
      await act(async () => folder.props.onDoubleClick());
      await rerender(tree, f);
    }
    assert.deepEqual(selected(tree), []);
    assert.equal(dialog(tree), undefined);
    await act(async () => oldConfirm({ preventDefault() {} }));
    assert.equal(f.calls.length, 0, 'confirmation captured in an older context cannot delete anything');
    await unmount(tree);
  });
}

test('deleted records and revoked edit capability cannot stay selected for a future batch', async () => {
  const f = fixture(); const tree = await mount(f);
  await check(checkbox(tree, 'Alpha.txt')); await check(checkbox(tree, 'Beta.txt'));
  f.state.files = f.state.files.filter(candidate => candidate.id !== 'file-a');
  await rerender(tree, f);
  assert.deepEqual(selected(tree), ['Beta.txt']);
  f.state.canEditSpace = () => false; f.state.canEdit = false;
  await rerender(tree, f);
  assert.deepEqual(selected(tree), []);
  assert.equal(checkbox(tree, 'Beta.txt').props.disabled, true);
  assert.equal(control(tree, '全選目前清單可刪除項目').props.disabled, true);
  assert.equal(f.calls.length, 0);
  await unmount(tree);
});

test('restoring edit permission does not silently restore the selections discarded on revocation', async () => {
  const f = fixture(); const tree = await mount(f);
  await check(checkbox(tree, 'Alpha.txt')); await check(checkbox(tree, 'Beta.txt'));
  f.state.canEditSpace = () => false; f.state.canEdit = false;
  await rerender(tree, f);
  assert.deepEqual(selected(tree), []);
  assert.equal(checkbox(tree, 'Alpha.txt').props.disabled, true);
  f.state.canEditSpace = id => id === 'space-a'; f.state.canEdit = true;
  await rerender(tree, f);
  assert.equal(checkbox(tree, 'Alpha.txt').props.disabled, false);
  assert.deepEqual(selected(tree), [], 'granting permission again requires the user to make a fresh selection');
  await check(checkbox(tree, 'Beta.txt'));
  assert.deepEqual(selected(tree), ['Beta.txt']);
  assert.equal(f.calls.length, 0);
  await unmount(tree);
});

test('a rejected batch keeps its targets selected and reports the failure for retry', async () => {
  const f = fixture();
  f.state.deleteEntries = async entries => { f.calls.push(entries); throw new Error('暫時無法連線，請重試'); };
  const tree = await mount(f);
  await check(checkbox(tree, 'Beta.txt'));
  await act(async () => button(tree, '刪除已選項目').props.onClick());
  await act(async () => confirm(tree).props.onClick({ preventDefault() {} }));
  assert.deepEqual(selected(tree), ['Beta.txt']);
  assert.ok(f.notices.some(notice => notice.level === 'error' && /暫時無法連線/.test(notice.message)));
  assert.equal(f.notices.some(notice => notice.level === 'success'), false);
  assert.equal(checkbox(tree, 'Alpha.txt').props.disabled, false);
  await unmount(tree);
});

test('a late response from the previous account cannot restore its selections or expose its failure details', async () => {
  const f = fixture(); const pending = deferred();
  f.state.deleteEntries = entries => { f.calls.push(entries); return pending.promise; };
  const tree = await mount(f);
  await check(checkbox(tree, 'Alpha.txt'));
  await act(async () => button(tree, '刪除已選項目').props.onClick());
  await act(async () => { confirm(tree).props.onClick({ preventDefault() {} }); });
  f.state.ownerId = 'owner-b'; await rerender(tree, f);
  await act(async () => pending.resolve({ deletedKeys: [], failures: [{ key: 'file:file-a', name: 'Alpha.txt', message: '上一個帳號的私密錯誤' }], cleanupPending: false }));
  assert.deepEqual(selected(tree), []);
  assert.equal(dialog(tree), undefined);
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /上一個帳號的私密錯誤/);
  assert.equal(f.notices.some(notice => /上一個帳號的私密錯誤/.test(notice.message)), false);
  await unmount(tree);
});

for (const target of ['Release', 'Specs']) {
  test(`deleting the ${target === 'Release' ? 'ancestor' : 'current'} folder from search returns to the space root`, async () => {
    const f = fixture();
    f.state.activeSpaceId = 'space-a'; f.state.activeSpace = f.state.spaces[0];
    f.state.folders.push({ ...f.state.folders[0], id: 'folder-child', parentId: 'folder-a', name: 'Specs' });
    f.state.files.push(file('file-nested', 'Inside.txt', 'space-a', 'folder-child'));
    f.state.deleteEntries = async entries => {
      f.calls.push(entries);
      const removed = target === 'Release' ? ['folder-a', 'folder-child'] : ['folder-child'];
      f.state.folders = f.state.folders.filter(folder => !removed.includes(folder.id));
      f.state.files = f.state.files.filter(candidate => !removed.includes(candidate.folderId));
      return { deletedKeys: Array.from(entries, key), failures: [], cleanupPending: false };
    };
    const tree = await mount(f);
    const row = name => tree.root.findAll(node => node.type === 'article' && node.findAll(child => child.type === 'strong' && text(child) === name).length > 0)[0];
    await act(async () => row('Release').props.onDoubleClick());
    await act(async () => row('Specs').props.onDoubleClick());
    assert.ok(checkbox(tree, 'Inside.txt'), 'the current location starts in the nested folder');
    const search = () => tree.root.findAll(node => host(node) && node.props.placeholder === '搜尋檔案與資料夾')[0];
    await act(async () => search().props.onChange({ target: { value: target } }));
    await check(checkbox(tree, target));
    await act(async () => button(tree, '刪除已選項目').props.onClick());
    await act(async () => confirm(tree).props.onClick({ preventDefault() {} }));
    await act(async () => search().props.onChange({ target: { value: '' } }));
    assert.ok(checkbox(tree, 'Alpha.txt'), 'root files are visible after the deleted folder location is cleared');
    assert.equal(tree.root.findAll(node => host(node) && node.props['aria-label'] === '勾選 Inside.txt').length, 0);
    assert.equal(f.calls.length, 1);
    await unmount(tree);
  });
}
