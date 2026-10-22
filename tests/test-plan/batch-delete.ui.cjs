const assert = require('node:assert/strict');
const test = require('node:test');
const { React, create, act, loader, browser, deferred } = require('../support/renderHarness.cjs');

// Selection and deletion safety for the File-Explorer-style 檔案上傳 page.
// Selection rules: click / Ctrl / Shift / keyboard (core/selection.ts); read-only rows can be selected;
// 刪除 and the Delete key only target editable entries and confirm before anything is removed.

const stamp = '2026-10-15T00:00:00.000Z';
const key = entry => `${entry.kind}:${entry.id}`;
const entryName = entry => entry.kind === 'folder' ? entry.name : entry.originalName;
function file(id, name, spaceId = 'space-a', folderId = null) {
  return { id, originalName: name, spaceId, folderId, storagePath: `${spaceId}/${id}`, mimeType: 'text/plain', extension: 'txt', category: 'document', fileSize: 100, description: null, uploadedBy: 'owner-a', createdAt: stamp, updatedAt: stamp };
}
function folder(id, name, parentId = null, spaceId = 'space-a') {
  return { id, spaceId, parentId, name, createdBy: 'owner-a', createdAt: stamp, updatedAt: stamp };
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node.children ?? []).map(text).join('');
}

/**
 * `space`: the space the page shows when it mounts (null = 所有檔案（所有人）).
 * The mocked hook only lists the open space's folders and files, like the real one.
 */
function fixture({ space = null } = {}) {
  const window = browser();
  // Desktop layout: a plain click selects (a touch-sized layout opens on tap instead).
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.requestAnimationFrame = callback => setTimeout(callback, 0);
  const calls = [];
  const singles = [];
  const notices = [];
  const spaces = ['a', 'b'].map(id => ({ id: `space-${id}`, ownerId: `owner-${id}`, name: `使用者 ${id}`, description: `@user-${id}`, isPersonal: true, projectId: null, color: '#5fae94', createdAt: stamp, updatedAt: stamp }));
  const state = {
    spaces, ownerId: 'owner-a', activeSpaceId: space, activeSpace: spaces.find(candidate => candidate.id === space) ?? null,
    folders: [folder('folder-a', 'Release')],
    files: [file('file-a', 'Alpha.txt'), file('file-b', 'Beta.txt'), file('file-readonly', '唯讀.txt', 'space-b')],
    loading: false, busy: false, error: null, uploadProgress: null, canEdit: true, isAuthenticated: true,
    canEditSpace: id => id === 'space-a',
    async openSpace(id) { state.activeSpaceId = id; state.activeSpace = spaces.find(candidate => candidate.id === id) ?? null; },
    async refreshWorkspace() {},
    async deleteEntries(entries) { calls.push(entries); return { deletedKeys: entries.map(key), failures: [], cleanupPending: false }; },
    async deleteFile(target) { singles.push(`file:${target.id}`); return { cleanupPending: false }; },
    async deleteFolder(id) { singles.push(`folder:${id}`); return { cleanupPending: false }; },
  };
  const child = ({ children, ...props }) => React.createElement('stub', props, children);
  const notify = level => (message, options) => notices.push({ level, message: String(message), description: options?.description });
  const toast = Object.assign(notify('info'), { success: notify('success'), warning: notify('warning'), error: notify('error'), info: notify('info') });
  const load = loader({ window, globals: { Error, HTMLElement: class HTMLElement {} }, mocks: {
    './hooks/useTestPlanWorkspace': { useTestPlanWorkspace: () => {
      const [, rerender] = React.useReducer(count => count + 1, 0);
      const inSpace = item => state.activeSpaceId === null || item.spaceId === state.activeSpaceId;
      const busyWhile = run => async (...args) => {
        state.busy = true; rerender();
        try { return await run(...args); }
        finally { state.busy = false; rerender(); }
      };
      return {
        ...state,
        folders: state.folders.filter(inSpace),
        files: state.files.filter(inSpace),
        async openSpace(id) { await state.openSpace(id); rerender(); },
        deleteEntries: busyWhile(entries => state.deleteEntries(entries)),
        deleteFile: busyWhile(target => state.deleteFile(target)),
        deleteFolder: busyWhile(id => state.deleteFolder(id)),
      };
    } },
    './TestPlanInspector': {
      TestPlanInspector: ({ entry, selectedEntries }) => React.createElement('aside', { 'data-inspector': entry ? key(entry) : 'none', 'data-selected-count': selectedEntries.length }),
      FileTypeIcon: () => null,
      describeEntryType: entry => entry.kind === 'folder' ? '檔案資料夾' : '文件',
      formatEntryDate: value => value,
    },
    './TestPlanSpreadsheetEditor': { TestPlanSpreadsheetEditor: () => null },
    '@/components/ui/alert-dialog': {
      AlertDialog: ({ open, children, ...props }) => open ? React.createElement('section', { ...props, role: 'alertdialog' }, children) : null,
      AlertDialogAction: ({ children, ...props }) => React.createElement('button', { ...props, 'data-confirm': true }, children),
      AlertDialogCancel: ({ children, ...props }) => React.createElement('button', { ...props, 'data-cancel': true }, children),
      AlertDialogContent: child, AlertDialogDescription: child, AlertDialogFooter: child, AlertDialogHeader: child, AlertDialogTitle: child,
    },
    '@/components/ui/dialog': {
      Dialog: ({ open, children, ...props }) => open ? React.createElement('section', { ...props, role: 'dialog' }, children) : null,
      DialogContent: child, DialogDescription: child, DialogFooter: child, DialogHeader: child, DialogTitle: child,
    },
    sonner: { toast },
  } });
  return { state, window, calls, singles, notices, Component: load('src/components/test-plan/TestPlanWorkspace.tsx').TestPlanWorkspace };
}

// ----- queries ----------------------------------------------------------------
const host = node => typeof node.type === 'string';
function control(tree, label) {
  const matches = tree.root.findAll(node => host(node) && node.props['aria-label'] === label);
  assert.equal(matches.length, 1, `one accessible control: ${label}`);
  return matches[0];
}
/** A command-bar button, found by its visible label inside the 檔案操作 toolbar. */
function button(tree, label) {
  const toolbar = tree.root.find(node => host(node) && node.props.role === 'toolbar' && node.props['aria-label'] === '檔案操作');
  const matches = toolbar.findAll(node => host(node) && ['button', 'stub'].includes(node.type) && typeof node.props.onClick === 'function' && text(node) === label);
  assert.equal(matches.length, 1, `one action: ${label}`);
  return matches[0];
}
function selectFor(tree, label) {
  let node = control(tree, label);
  while (node && typeof node.props.onValueChange !== 'function') node = node.parent;
  assert.ok(node, `select change handler for ${label}`);
  return node;
}
/** The radio groups inside the dropdown menu opened by the command-bar button `label`. */
function menuGroups(tree, label) {
  let node = control(tree, label);
  const groups = candidate => candidate.findAll(item => host(item) && typeof item.props.onValueChange === 'function');
  while (node && groups(node).length === 0) node = node.parent;
  assert.ok(node, `menu for ${label}`);
  return groups(node);
}
function checkbox(tree, name) { return control(tree, `勾選 ${name}`); }
const hasCheckbox = (tree, name) => tree.root.findAll(node => host(node) && node.props['aria-label'] === `勾選 ${name}`).length > 0;
function row(tree, name) {
  let node = checkbox(tree, name);
  while (node && node.props['data-entry-key'] === undefined) node = node.parent;
  assert.ok(node, `row for ${name}`);
  return node;
}
const explorer = tree => tree.root.find(node => node.type === 'section' && typeof node.props.onKeyDown === 'function');
const selected = tree => tree.root.findAll(node => host(node) && node.props['aria-label']?.startsWith('勾選 ') && node.props.checked === true).map(node => node.props['aria-label'].slice(3)).sort();
const dialog = tree => tree.root.findAll(node => node.type === 'section' && node.props.role === 'alertdialog')[0];
const confirm = tree => dialog(tree).findByProps({ 'data-confirm': true });
const cancel = tree => dialog(tree).findByProps({ 'data-cancel': true });
const preview = tree => tree.root.find(node => node.type === 'aside' && node.props['data-inspector'] !== undefined).props['data-inspector'];
const status = tree => tree.root.findAll(node => node.props.role === 'status' && host(node)).map(text).join(' ');
const batchNames = calls => calls.map(entries => Array.from(entries, entryName).sort());

// ----- interactions -----------------------------------------------------------
// A DOM-like event target: not a text field and not inside a menu or dialog.
const element = () => ({ closest: () => null, classList: { contains: () => false } });
// A focused element inside the file list: shortcuts only act on keys pressed there (or in the command bar).
const listElement = () => ({ closest: selector => selector.includes('.test-plan-dropzone') ? {} : null, classList: { contains: () => false } });
async function check(node, checked = true) {
  await act(async () => node.props.onChange({ target: { checked }, currentTarget: { checked } }));
}
/** Dispatches `handler` from `node` up through its host ancestors until one stops propagation. */
async function bubble(node, handler, details = {}) {
  let stopped = false;
  const event = {
    ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...details,
    target: details.target ?? element(), currentTarget: element(), defaultPrevented: false,
    preventDefault() { event.defaultPrevented = true; }, stopPropagation() { stopped = true; },
  };
  await act(async () => {
    for (let cursor = node; cursor && !stopped; cursor = cursor.parent) {
      if (host(cursor) && typeof cursor.props[handler] === 'function') cursor.props[handler](event);
    }
  });
  return stopped;
}
const click = (tree, name, modifiers = {}) => bubble(row(tree, name), 'onClick', modifiers);
const doubleClick = (tree, name) => bubble(row(tree, name), 'onDoubleClick');
/** A key pressed in the file list (the focused row bubbles it to the explorer). */
const press = (tree, keyName, modifiers = {}) => bubble(explorer(tree), 'onKeyDown', { key: keyName, ...modifiers, target: listElement() });
const search = (tree, value) => act(async () => control(tree, '搜尋檔案與資料夾').props.onChange({ target: { value } }));
const confirmDelete = tree => act(async () => confirm(tree).props.onClick({ preventDefault() {} }));
const rerender = async (tree, f) => act(async () => tree.update(React.createElement(f.Component)));
async function mount(f) { let tree; await act(async () => { tree = create(React.createElement(f.Component)); }); return tree; }
async function unmount(tree) { await act(async () => tree.unmount()); }

// Old: "list and card selection stay independent from preview and select-all excludes read-only entries".
test('checkboxes toggle membership without opening rows, read-only rows can be selected, and the view switch keeps the selection', async () => {
  const f = fixture(); const tree = await mount(f);
  assert.equal(checkbox(tree, '唯讀.txt').props.disabled, false, 'read-only rows are selectable for download and preview');
  assert.equal(await bubble(checkbox(tree, 'Release'), 'onClick'), true, 'a checkbox click never reaches the row');
  assert.equal(await bubble(checkbox(tree, 'Release'), 'onDoubleClick'), true, 'double-clicking a checkbox does not open its folder');
  assert.equal(await bubble(checkbox(tree, 'Release'), 'onKeyDown', { key: 'Enter' }), true, 'Enter on a checkbox does not open its row');
  assert.equal(f.state.activeSpaceId, null, 'no checkbox gesture navigated away');
  assert.ok(hasCheckbox(tree, 'Alpha.txt'));

  await check(checkbox(tree, '唯讀.txt'));
  assert.deepEqual(selected(tree), ['唯讀.txt']);
  assert.equal(button(tree, '刪除').props.disabled, true, 'a read-only selection cannot be deleted');
  assert.equal(button(tree, '下載').props.disabled, false, 'a read-only selection can still be downloaded');
  await press(tree, 'Delete');
  assert.equal(dialog(tree), undefined, 'the Delete key does not open a confirmation for read-only items');
  assert.ok(f.notices.some(notice => notice.level === 'error' && /唯讀/.test(notice.message)));

  await check(checkbox(tree, 'Alpha.txt'));
  assert.deepEqual(selected(tree), ['Alpha.txt', '唯讀.txt']);
  assert.match(status(tree), /已選取 2 個項目/);
  await check(checkbox(tree, '唯讀.txt'), false);
  assert.deepEqual(selected(tree), ['Alpha.txt']);
  assert.equal(preview(tree), 'file:file-a', 'the preview pane follows the single selected file');
  assert.equal(dialog(tree), undefined);

  await check(control(tree, '全選目前清單'));
  assert.deepEqual(selected(tree), ['Alpha.txt', 'Beta.txt', 'Release', '唯讀.txt']);
  assert.equal(control(tree, '全選目前清單').props.checked, true);
  await act(async () => menuGroups(tree, '檢視方式')[0].props.onValueChange('grid'));
  assert.deepEqual(selected(tree), ['Alpha.txt', 'Beta.txt', 'Release', '唯讀.txt'], 'large icons keep the selection');
  assert.equal(checkbox(tree, '唯讀.txt').props.disabled, false);
  await check(checkbox(tree, 'Beta.txt'), false);
  assert.deepEqual(selected(tree), ['Alpha.txt', 'Release', '唯讀.txt']);
  await press(tree, 'Escape');
  assert.deepEqual(selected(tree), []);
  assert.equal(f.calls.length + f.singles.length, 0);
  await unmount(tree);
});

// Old: "... select-all excludes read-only entries" (the deletion half).
test('select-all includes read-only rows, but the confirmation targets only editable ones and states how many are skipped', async () => {
  const f = fixture(); const tree = await mount(f);
  await check(control(tree, '全選目前清單'));
  assert.deepEqual(selected(tree), ['Alpha.txt', 'Beta.txt', 'Release', '唯讀.txt']);
  assert.equal(button(tree, '刪除').props.disabled, false);
  await act(async () => button(tree, '刪除').props.onClick());
  assert.equal(f.calls.length, 0, 'nothing is deleted before confirmation');
  const description = text(dialog(tree));
  assert.match(description, /3 項/);
  assert.match(description, /另有 1 個唯讀項目不會刪除/);
  const listed = dialog(tree).findByProps({ 'aria-label': '待刪除項目' }).findAllByType('li').map(text).sort();
  assert.deepEqual(listed, ['Alpha.txt', 'Beta.txt', 'Release']);
  await confirmDelete(tree);
  assert.deepEqual(batchNames(f.calls), [['Alpha.txt', 'Beta.txt', 'Release']]);
  assert.deepEqual(Array.from(f.calls[0], entry => entry.spaceId), ['space-a', 'space-a', 'space-a'], 'no read-only target reaches the delete call');
  assert.deepEqual(selected(tree), ['唯讀.txt'], 'the skipped read-only item stays selected');
  assert.equal(dialog(tree), undefined);
  await unmount(tree);
});

// Old: "batch delete waits for confirmation, lists exact targets, and cancellation leaves files untouched".
test('batch delete waits for confirmation, lists exact targets, and cancellation leaves files untouched', async () => {
  const f = fixture(); const tree = await mount(f);
  await check(checkbox(tree, 'Alpha.txt'));
  await check(checkbox(tree, 'Release'));
  await act(async () => button(tree, '刪除').props.onClick());
  assert.equal(f.calls.length, 0);
  assert.ok(dialog(tree));
  assert.match(text(dialog(tree)), /2 項/);
  assert.match(text(dialog(tree)), /Alpha\.txt/);
  assert.match(text(dialog(tree)), /Release/);
  assert.match(text(dialog(tree)), /永久刪除/);
  assert.match(text(dialog(tree)), /資料夾裡的所有子資料夾與檔案/);
  assert.doesNotMatch(text(dialog(tree)), /唯讀項目/, 'no skipped count when every target is editable');
  await act(async () => dialog(tree).props.onOpenChange(false));
  assert.equal(dialog(tree), undefined);
  assert.deepEqual(selected(tree), ['Alpha.txt', 'Release']);
  assert.equal(f.calls.length, 0);
  await act(async () => button(tree, '刪除').props.onClick());
  await confirmDelete(tree);
  assert.deepEqual(batchNames(f.calls), [['Alpha.txt', 'Release']]);
  assert.deepEqual(selected(tree), []);
  assert.equal(dialog(tree), undefined);
  assert.equal(f.singles.length, 0);
  await unmount(tree);
});

// New: Ctrl/Shift click and the keyboard build the same selection the toolbar deletes.
test('click, Ctrl+click, Shift+click and arrow keys select like File Explorer, and the Delete key confirms the same targets', async () => {
  const f = fixture({ space: 'space-a' });
  f.state.files.push(file('file-c', 'Gamma.txt'));
  const tree = await mount(f);
  await click(tree, 'Alpha.txt');
  assert.deepEqual(selected(tree), ['Alpha.txt']);
  await click(tree, 'Gamma.txt', { shiftKey: true });
  assert.deepEqual(selected(tree), ['Alpha.txt', 'Beta.txt', 'Gamma.txt'], 'Shift selects the range from the anchor');
  await click(tree, 'Beta.txt', { ctrlKey: true });
  assert.deepEqual(selected(tree), ['Alpha.txt', 'Gamma.txt'], 'Ctrl toggles one row');
  await click(tree, 'Release', { ctrlKey: true, shiftKey: true });
  assert.deepEqual(selected(tree), ['Alpha.txt', 'Beta.txt', 'Gamma.txt', 'Release'], 'Ctrl+Shift adds the range to the selection');
  await click(tree, 'Release');
  assert.deepEqual(selected(tree), ['Release'], 'a plain click selects only that row');
  assert.ok(hasCheckbox(tree, 'Alpha.txt'), 'a single click on a folder does not open it');
  await press(tree, 'ArrowDown', { shiftKey: true });
  await press(tree, 'ArrowDown', { shiftKey: true });
  assert.deepEqual(selected(tree), ['Alpha.txt', 'Beta.txt', 'Release']);
  await press(tree, 'a', { ctrlKey: true });
  assert.deepEqual(selected(tree), ['Alpha.txt', 'Beta.txt', 'Gamma.txt', 'Release']);
  await press(tree, 'Escape');
  assert.deepEqual(selected(tree), []);
  await press(tree, 'Delete');
  assert.equal(dialog(tree), undefined, 'Delete with nothing selected does nothing');

  await click(tree, 'Beta.txt');
  await press(tree, 'ArrowDown', { shiftKey: true });
  assert.deepEqual(selected(tree), ['Beta.txt', 'Gamma.txt']);
  await press(tree, 'Delete');
  assert.equal(f.calls.length, 0, 'the Delete key asks first');
  assert.deepEqual(dialog(tree).findByProps({ 'aria-label': '待刪除項目' }).findAllByType('li').map(text).sort(), ['Beta.txt', 'Gamma.txt']);
  await confirmDelete(tree);
  assert.deepEqual(batchNames(f.calls), [['Beta.txt', 'Gamma.txt']]);
  assert.deepEqual(selected(tree), []);
  await unmount(tree);
});

// New: exactly one selected item goes through the single-item confirmation.
test('deleting exactly one selected file names it and calls the single-file delete', async () => {
  const f = fixture({ space: 'space-a' }); const tree = await mount(f);
  await click(tree, 'Alpha.txt');
  await press(tree, 'Delete');
  assert.match(text(dialog(tree)), /「Alpha\.txt」將從儲存空間永久刪除/);
  assert.equal(f.singles.length, 0);
  await confirmDelete(tree);
  assert.deepEqual(f.singles, ['file:file-a']);
  assert.equal(f.calls.length, 0);
  await unmount(tree);
});

// Old: "partial failures stay checked for retry while successfully deleted entries are cleared".
test('partial failures stay selected for retry while successfully deleted entries are cleared', async () => {
  const f = fixture();
  f.state.deleteEntries = async entries => {
    f.calls.push(entries);
    return f.calls.length === 1
      ? { deletedKeys: ['file:file-a'], failures: [{ key: 'file:file-b', name: 'Beta.txt', message: '刪除權限已變更' }, { key: 'folder:folder-a', name: 'Release', message: '刪除權限已變更' }], cleanupPending: true }
      : { deletedKeys: entries.map(key), failures: [], cleanupPending: false };
  };
  const tree = await mount(f);
  await check(checkbox(tree, 'Alpha.txt')); await check(checkbox(tree, 'Beta.txt')); await check(checkbox(tree, 'Release'));
  await act(async () => button(tree, '刪除').props.onClick());
  await confirmDelete(tree);
  assert.deepEqual(selected(tree), ['Beta.txt', 'Release']);
  assert.match(JSON.stringify(tree.toJSON()), /Beta\.txt/);
  assert.ok(f.notices.some(notice => notice.level === 'error' && /刪除權限已變更/.test(notice.message) && /保留選取/.test(notice.message)));
  assert.ok(f.notices.some(notice => /清理/.test(notice.message)), 'storage cleanup retry warning is retained for successful metadata deletions');
  assert.equal(dialog(tree), undefined);
  await act(async () => button(tree, '刪除').props.onClick());
  await confirmDelete(tree);
  assert.deepEqual(Array.from(f.calls[1], key).sort(), ['file:file-b', 'folder:folder-a'], 'the retry targets exactly the failed entries');
  assert.deepEqual(selected(tree), []);
  await unmount(tree);
});

// Old: "a pending deletion blocks another submission and changes to selected targets".
test('a pending deletion blocks another submission and changes to its targets', async () => {
  const f = fixture(); const pending = deferred();
  f.state.deleteEntries = entries => { f.calls.push(entries); return pending.promise; };
  const tree = await mount(f);
  await check(checkbox(tree, 'Alpha.txt')); await check(checkbox(tree, 'Release'));
  await act(async () => button(tree, '刪除').props.onClick());
  const action = confirm(tree);
  await act(async () => { action.props.onClick({ preventDefault() {} }); });
  assert.equal(f.calls.length, 1);
  assert.equal(checkbox(tree, 'Beta.txt').props.disabled, true);
  assert.equal(control(tree, '全選目前清單').props.disabled, true);
  assert.equal(button(tree, '刪除').props.disabled, true);
  assert.equal(control(tree, '上傳資料夾').props.disabled, true);
  assert.equal(control(tree, '搜尋檔案與資料夾').props.disabled, true);
  assert.ok(dialog(tree), 'the confirmation stays open while the deletion runs');
  assert.equal(cancel(tree).props.disabled, true);
  await act(async () => dialog(tree).props.onOpenChange(false));
  assert.ok(dialog(tree), 'the confirmation cannot be dismissed mid-deletion');
  await click(tree, 'Beta.txt');
  await click(tree, 'Beta.txt', { ctrlKey: true });
  assert.deepEqual(selected(tree), ['Alpha.txt', 'Release'], 'rows cannot change the selection while deleting');
  await press(tree, 'Delete');
  assert.deepEqual(dialog(tree).findByProps({ 'aria-label': '待刪除項目' }).findAllByType('li').map(text).sort(), ['Alpha.txt', 'Release'], 'the Delete key cannot replace the pending confirmation');
  await act(async () => { action.props.onClick({ preventDefault() {} }); });
  assert.equal(f.calls.length, 1, 'a stale action callback or the Delete key cannot duplicate the operation');
  const beforeUnload = new Event('beforeunload', { cancelable: true }); f.window.dispatchEvent(beforeUnload);
  assert.equal(beforeUnload.defaultPrevented, true);
  await act(async () => pending.resolve({ deletedKeys: ['file:file-a', 'folder:folder-a'], failures: [], cleanupPending: false }));
  assert.deepEqual(batchNames(f.calls), [['Alpha.txt', 'Release']], 'the in-flight targets never changed');
  assert.deepEqual(selected(tree), []);
  assert.equal(dialog(tree), undefined);
  assert.equal(checkbox(tree, 'Beta.txt').props.disabled, false);
  const afterUnload = new Event('beforeunload', { cancelable: true }); f.window.dispatchEvent(afterUnload);
  assert.equal(afterUnload.defaultPrevented, false, 'leaving the page is allowed again once the deletion settles');
  await unmount(tree);
});

// Old: "sorting and switching list/card views preserve selection, but search and category changes clear it".
test('sorting and switching views preserve the selection, but search, format and search-scope changes clear it', async () => {
  const f = fixture({ space: 'space-a' }); const tree = await mount(f);
  await check(checkbox(tree, 'Alpha.txt')); await check(checkbox(tree, 'Beta.txt'));
  const [sortGroup, directionGroup] = menuGroups(tree, '排序方式');
  await act(async () => sortGroup.props.onValueChange('name'));
  assert.deepEqual(selected(tree), ['Alpha.txt', 'Beta.txt']);
  await act(async () => directionGroup.props.onValueChange('reverse'));
  assert.deepEqual(selected(tree), ['Alpha.txt', 'Beta.txt']);
  const nameHeader = tree.root.find(node => node.type === 'button' && node.props['data-sort'] === 'name');
  await act(async () => nameHeader.props.onClick());
  assert.deepEqual(selected(tree), ['Alpha.txt', 'Beta.txt'], 'a column-header sort keeps the selection');
  await act(async () => menuGroups(tree, '檢視方式')[0].props.onValueChange('grid'));
  assert.deepEqual(selected(tree), ['Alpha.txt', 'Beta.txt']);
  await act(async () => menuGroups(tree, '檢視方式')[0].props.onValueChange('list'));
  assert.deepEqual(selected(tree), ['Alpha.txt', 'Beta.txt']);
  await search(tree, 'a');
  assert.deepEqual(selected(tree), []);
  await check(checkbox(tree, 'Alpha.txt'));
  await act(async () => selectFor(tree, '檔案格式').props.onValueChange('image'));
  assert.deepEqual(selected(tree), []);
  await act(async () => selectFor(tree, '檔案格式').props.onValueChange('all'));
  await check(checkbox(tree, 'Alpha.txt'));
  await act(async () => selectFor(tree, '搜尋範圍').props.onValueChange('folder'));
  assert.deepEqual(selected(tree), []);
  assert.equal(f.calls.length + f.singles.length, 0);
  await unmount(tree);
});

// Old: "changing account|space|folder clears selections and invalidates an already open confirmation".
for (const context of ['account', 'space', 'folder', 'search', 'format', 'search scope']) {
  test(`changing ${context} clears selections and invalidates an already open confirmation`, async () => {
    const f = fixture({ space: 'space-a' }); const tree = await mount(f);
    await check(checkbox(tree, 'Alpha.txt')); await check(checkbox(tree, 'Beta.txt'));
    await act(async () => button(tree, '刪除').props.onClick());
    assert.ok(dialog(tree));
    const oldConfirm = confirm(tree).props.onClick;
    if (context === 'account') { f.state.ownerId = 'owner-b'; await rerender(tree, f); }
    else if (context === 'space') await act(async () => control(tree, '開啟 使用者 b（@user-b） 的檔案空間').props.onClick());
    else if (context === 'folder') await doubleClick(tree, 'Release');
    else if (context === 'search') await search(tree, 'Al');
    else if (context === 'format') await act(async () => selectFor(tree, '檔案格式').props.onValueChange('document'));
    else await act(async () => selectFor(tree, '搜尋範圍').props.onValueChange('folder'));
    assert.deepEqual(selected(tree), []);
    assert.equal(dialog(tree), undefined);
    await act(async () => oldConfirm({ preventDefault() {} }));
    assert.equal(f.calls.length + f.singles.length, 0, 'confirmation captured in an older context cannot delete anything');
    await unmount(tree);
  });
}

// Old: "deleted records and revoked edit capability cannot stay selected for a future batch".
test('deleted records leave the selection, and revoked edit capability blocks deleting entries that stay selected', async () => {
  const f = fixture(); const tree = await mount(f);
  await check(checkbox(tree, 'Alpha.txt')); await check(checkbox(tree, 'Beta.txt')); await check(checkbox(tree, 'Release'));
  await act(async () => button(tree, '刪除').props.onClick());
  const oldConfirm = confirm(tree).props.onClick;
  f.state.files = f.state.files.filter(candidate => candidate.id !== 'file-a');
  await rerender(tree, f);
  assert.deepEqual(selected(tree), ['Beta.txt', 'Release']);
  assert.equal(dialog(tree), undefined, 'a confirmation whose target disappeared is withdrawn');
  await act(async () => oldConfirm({ preventDefault() {} }));
  assert.equal(f.calls.length, 0, 'its stale callback deletes nothing');

  f.state.canEditSpace = () => false; f.state.canEdit = false;
  await rerender(tree, f);
  assert.deepEqual(selected(tree), ['Beta.txt', 'Release'], 'read-only entries may stay selected for download and preview');
  assert.equal(checkbox(tree, 'Beta.txt').props.disabled, false);
  assert.equal(button(tree, '刪除').props.disabled, true);
  await press(tree, 'Delete');
  assert.equal(dialog(tree), undefined);
  assert.ok(f.notices.some(notice => notice.level === 'error' && /唯讀/.test(notice.message)));
  assert.equal(f.calls.length + f.singles.length, 0);
  await unmount(tree);
});

// Old: "restoring edit permission does not silently restore the selections discarded on revocation".
test('revoking edit permission withdraws an open confirmation, and restoring it needs a fresh confirmation', async () => {
  const f = fixture(); const tree = await mount(f);
  await check(checkbox(tree, 'Alpha.txt')); await check(checkbox(tree, 'Beta.txt'));
  await act(async () => button(tree, '刪除').props.onClick());
  const oldConfirm = confirm(tree).props.onClick;
  f.state.canEditSpace = () => false; f.state.canEdit = false;
  await rerender(tree, f);
  assert.equal(dialog(tree), undefined);
  await act(async () => oldConfirm({ preventDefault() {} }));
  assert.equal(f.calls.length, 0, 'a confirmation opened before revocation cannot delete');
  assert.equal(button(tree, '刪除').props.disabled, true);
  f.state.canEditSpace = id => id === 'space-a'; f.state.canEdit = true;
  await rerender(tree, f);
  assert.equal(dialog(tree), undefined, 'granting permission again does not reopen the withdrawn confirmation');
  assert.deepEqual(selected(tree), ['Alpha.txt', 'Beta.txt']);
  assert.equal(f.calls.length, 0);
  await act(async () => button(tree, '刪除').props.onClick());
  assert.deepEqual(dialog(tree).findByProps({ 'aria-label': '待刪除項目' }).findAllByType('li').map(text).sort(), ['Alpha.txt', 'Beta.txt']);
  await confirmDelete(tree);
  assert.deepEqual(batchNames(f.calls), [['Alpha.txt', 'Beta.txt']]);
  await unmount(tree);
});

// Old: "a rejected batch keeps its targets selected and reports the failure for retry".
test('a rejected batch keeps its targets selected and reports the failure for retry', async () => {
  const f = fixture();
  f.state.deleteEntries = async entries => { f.calls.push(entries); throw new Error('暫時無法連線，請重試'); };
  const tree = await mount(f);
  await check(checkbox(tree, 'Beta.txt')); await check(checkbox(tree, 'Release'));
  await act(async () => button(tree, '刪除').props.onClick());
  await confirmDelete(tree);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(selected(tree), ['Beta.txt', 'Release']);
  assert.ok(f.notices.some(notice => notice.level === 'error' && /暫時無法連線/.test(notice.message)));
  assert.equal(f.notices.some(notice => notice.level === 'success'), false);
  assert.equal(checkbox(tree, 'Alpha.txt').props.disabled, false);
  assert.equal(button(tree, '刪除').props.disabled, false, 'the user can retry');
  await unmount(tree);
});

// Old: "a late response from the previous account cannot restore its selections or expose its failure details".
for (const outcome of ['resolve', 'reject']) {
  test(`a late ${outcome === 'resolve' ? 'response' : 'rejection'} from the previous account cannot restore its selections or expose its failure details`, async () => {
    const f = fixture(); const pending = deferred();
    f.state.deleteEntries = entries => { f.calls.push(entries); return pending.promise; };
    const tree = await mount(f);
    await check(checkbox(tree, 'Alpha.txt')); await check(checkbox(tree, 'Beta.txt'));
    await act(async () => button(tree, '刪除').props.onClick());
    await act(async () => { confirm(tree).props.onClick({ preventDefault() {} }); });
    f.state.ownerId = 'owner-b'; await rerender(tree, f);
    await act(async () => outcome === 'resolve'
      ? pending.resolve({ deletedKeys: [], failures: [{ key: 'file:file-a', name: 'Alpha.txt', message: '上一個帳號的私密錯誤' }], cleanupPending: false })
      : pending.reject(new Error('上一個帳號的私密錯誤')));
    assert.deepEqual(selected(tree), []);
    assert.equal(dialog(tree), undefined);
    assert.doesNotMatch(JSON.stringify(tree.toJSON()), /上一個帳號的私密錯誤/);
    assert.equal(f.notices.some(notice => /上一個帳號的私密錯誤/.test(notice.message)), false);
    await unmount(tree);
  });
}

// Old: "deleting the ancestor|current folder from search returns to the space root".
function nestedFixture(target, { companion }) {
  const f = fixture({ space: 'space-a' });
  f.state.folders.push(folder('folder-child', 'Specs', 'folder-a'));
  f.state.files.push(file('file-nested', 'Inside.txt', 'space-a', 'folder-child'));
  if (companion) f.state.files.push(file('file-notes', `${target} notes.txt`));
  const removed = target === 'Release' ? ['folder-a', 'folder-child'] : ['folder-child'];
  const removeTree = () => {
    f.state.folders = f.state.folders.filter(candidate => !removed.includes(candidate.id));
    f.state.files = f.state.files.filter(candidate => !removed.includes(candidate.folderId) && candidate.id !== 'file-notes');
  };
  f.state.deleteEntries = async entries => { f.calls.push(entries); removeTree(); return { deletedKeys: Array.from(entries, key), failures: [], cleanupPending: false }; };
  f.state.deleteFolder = async id => { f.singles.push(`folder:${id}`); removeTree(); return { cleanupPending: false }; };
  return f;
}
async function deleteFromSearch(f, target, names) {
  const tree = await mount(f);
  await doubleClick(tree, 'Release');
  await doubleClick(tree, 'Specs');
  assert.ok(hasCheckbox(tree, 'Inside.txt'), 'the current location starts in the nested folder');
  assert.equal(f.window.location.searchParams.get('fileFolder'), 'folder-child');
  await search(tree, target);
  for (const name of names) await check(checkbox(tree, name));
  await act(async () => button(tree, '刪除').props.onClick());
  await confirmDelete(tree);
  await search(tree, '');
  return tree;
}
function assertAtSpaceRoot(tree, f) {
  assert.ok(hasCheckbox(tree, 'Alpha.txt'), 'root files are visible after the deleted folder location is cleared');
  assert.equal(hasCheckbox(tree, 'Inside.txt'), false);
  assert.equal(control(tree, '上一層（Alt+↑）').props.disabled, true, 'the location is the space root');
  assert.equal(f.window.location.searchParams.get('fileFolder'), null, 'the address bar no longer names the deleted folder');
}
for (const target of ['Release', 'Specs']) {
  const label = target === 'Release' ? 'ancestor' : 'current';
  test(`deleting the ${label} folder from search in a batch returns to the space root`, async () => {
    const f = nestedFixture(target, { companion: true });
    const tree = await deleteFromSearch(f, target, [target, `${target} notes.txt`]);
    assert.deepEqual(batchNames(f.calls), [[target, `${target} notes.txt`].sort()]);
    assertAtSpaceRoot(tree, f);
    await unmount(tree);
  });
}

test('deleting the current folder alone from search returns to the space root', async () => {
  const f = nestedFixture('Specs', { companion: false });
  const tree = await deleteFromSearch(f, 'Specs', ['Specs']);
  assert.deepEqual(f.singles, ['folder:folder-child']);
  assertAtSpaceRoot(tree, f);
  await unmount(tree);
});

// ----- single-item path guards ---------------------------------------------------
// With exactly one item selected, 刪除 / Delete use the single-item confirmation (deleteFile/deleteFolder);
// it has the batch path's ancestor-folder, account-scope and stale-callback guards.
test('deleting the ancestor folder alone from search returns to the space root', async () => {
  const f = nestedFixture('Release', { companion: false });
  const tree = await deleteFromSearch(f, 'Release', ['Release']);
  assert.deepEqual(f.singles, ['folder:folder-a']);
  assertAtSpaceRoot(tree, f);
  await unmount(tree);
});

test('a late single-item rejection from the previous account does not expose its failure details', async () => {
  const f = fixture(); const pending = deferred();
  f.state.deleteFile = target => { f.singles.push(`file:${target.id}`); return pending.promise; };
  const tree = await mount(f);
  await check(checkbox(tree, 'Alpha.txt'));
  await act(async () => button(tree, '刪除').props.onClick());
  await act(async () => { confirm(tree).props.onClick({ preventDefault() {} }); });
  f.state.ownerId = 'owner-b'; await rerender(tree, f);
  await act(async () => pending.reject(new Error('上一個帳號的私密錯誤')));
  assert.equal(f.notices.some(notice => /上一個帳號的私密錯誤/.test(notice.message)), false);
  await unmount(tree);
});

test('a single-item confirmation captured before an account change cannot delete', async () => {
  const f = fixture(); const tree = await mount(f);
  await check(checkbox(tree, 'Alpha.txt'));
  await act(async () => button(tree, '刪除').props.onClick());
  const oldConfirm = confirm(tree).props.onClick;
  f.state.ownerId = 'owner-b'; await rerender(tree, f);
  assert.equal(dialog(tree), undefined);
  await act(async () => oldConfirm({ preventDefault() {} }));
  assert.equal(f.singles.length, 0);
  await unmount(tree);
});
