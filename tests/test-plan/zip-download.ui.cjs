const assert = require('node:assert/strict');
const test = require('node:test');
const JSZip = require('jszip');
const { React, create, act, loader, browser, deferred } = require('../support/renderHarness.cjs');

const stamp = '2026-10-28T00:00:00.000Z';
const file = (id, folderId = null) => ({ id, spaceId: 's', folderId, originalName: `BOM-${id}.xlsx`, fileSize: 3, mimeType: 'application/octet-stream', extension: 'xlsx', category: 'spreadsheet', storagePath: id, uploadedBy: 'owner', createdAt: stamp, updatedAt: stamp });
function text(node) { return typeof node === 'string' ? node : (node.children ?? []).map(text).join(''); }
function fixture({ count = 9, withFolder = false, failure = null } = {}) {
  const window = browser();
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const saved = deferred();
  const chunks = [];
  const pickerNames = [];
  const notices = [];
  let directoryCalls = 0;
  let requests = 0;
  let aborts = 0;
  const space = { id: 's', ownerId: 'owner', name: '我的空間', description: '@owner', isPersonal: true, projectId: null, color: '#5fae94', createdAt: stamp, updatedAt: stamp };
  const folders = withFolder ? [{ id: 'f', spaceId: 's', parentId: null, name: 'Release', createdBy: 'owner', createdAt: stamp, updatedAt: stamp }] : [];
  const state = { spaces: [space], ownerId: 'owner', activeSpaceId: 's', activeSpace: space, folders, files: Array.from({ length: count }, (_, index) => file(String(index + 1), withFolder ? 'f' : null)), loading: false, busy: false, error: null, uploadProgress: null, canEdit: true, canEditSpace: () => true, isAuthenticated: true, async refreshWorkspace() {}, async getFileDownloadUrl(target) { return `https://storage.test/${target.id}`; }, async downloadFile() { throw new Error('signed-link download must stream'); } };
  const load = loader({ window, globals: {
    Error, TextEncoder, Blob,
    async fetch(url) { requests++; return failure === 'source' ? new Response(null, { status: 403 }) : new Response(new Uint8Array([Number(String(url).split('/').pop()), 7, 9])); },
    async showSaveFilePicker({ suggestedName }) {
      pickerNames.push(suggestedName);
      if (failure === 'cancel-picker') { saved.resolve(); throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); }
      return { async createWritable() { return { async write(chunk) { chunks.push(Buffer.from(chunk)); }, async close() { saved.resolve(); }, async abort() { aborts++; saved.resolve(); } }; } };
    },
    async showDirectoryPicker() { directoryCalls++; throw new Error('protected system folder'); },
  }, mocks: {
    './hooks/useTestPlanWorkspace': { useTestPlanWorkspace: () => state },
    './TestPlanInspector': { TestPlanInspector: () => null, FileTypeIcon: () => null, describeEntryType: () => '', formatEntryDate: () => '' },
    './TestPlanSpreadsheetEditor': { TestPlanSpreadsheetEditor: () => null },
    './TransferPanel': { TransferPanel: ({ downloads }) => React.createElement('transfer-test', { downloads }) },
    sonner: { toast: { success(message) { notices.push(message); }, error(message) { notices.push(message); }, warning() {}, info() {} } },
  } });
  return { Component: load('src/components/test-plan/TestPlanWorkspace.tsx').TestPlanWorkspace, state, chunks, pickerNames, saved, notices, directoryCalls: () => directoryCalls, requests: () => requests, aborts: () => aborts };
}
const host = node => typeof node.type === 'string';
async function mount(f) { let tree; await act(async () => { tree = create(React.createElement(f.Component)); }); return tree; }
async function check(tree, name) { await act(async () => { tree.root.find(node => host(node) && node.props['aria-label'] === `勾選 ${name}`).props.onChange(); }); }
function downloadButton(tree) {
  const toolbar = tree.root.find(node => host(node) && node.props.role === 'toolbar' && node.props['aria-label'] === '檔案操作');
  return toolbar.find(node => host(node) && typeof node.props.onClick === 'function' && text(node) === '下載');
}
async function download(tree, f, expectedStatus = 'done') {
  await act(async () => {
    downloadButton(tree).props.onClick();
    await Promise.race([f.saved.promise, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('download did not finish')), 2000); timer.unref(); })]);
  });
  assert.equal(tree.root.findByType('transfer-test').props.downloads.at(-1).status, expectedStatus);
}

test('nine selected Excel files use one ZIP save dialog without requesting directory permission', async () => {
  const f = fixture(); const tree = await mount(f);
  try {
    for (const target of f.state.files) await check(tree, target.originalName);
    await download(tree, f);
    assert.equal(f.directoryCalls(), 0);
    assert.equal(f.pickerNames.length, 1);
    assert.match(f.pickerNames[0], /\.zip$/);
    const zip = await JSZip.loadAsync(Buffer.concat(f.chunks), { checkCRC32: true });
    assert.equal(Object.keys(zip.files).length, 9);
    for (const target of f.state.files) assert.deepEqual([...await zip.file(target.originalName).async('uint8array')], [Number(target.id), 7, 9]);
    assert.ok(f.notices.some(message => /9 個檔案/.test(message)));
  } finally { await act(async () => tree.unmount()); }
});

test('a folder-only selection enables ZIP download with its nested files', async () => {
  const f = fixture({ count: 2, withFolder: true }); const tree = await mount(f);
  try {
    await check(tree, 'Release');
    assert.equal(downloadButton(tree).props.disabled, false);
    await download(tree, f);
    assert.deepEqual(f.pickerNames, ['Release.zip']);
    const zip = await JSZip.loadAsync(Buffer.concat(f.chunks), { checkCRC32: true });
    assert.ok(zip.file('Release/BOM-1.xlsx'));
    assert.ok(zip.file('Release/BOM-2.xlsx'));
    assert.equal(f.directoryCalls(), 0);
  } finally { await act(async () => tree.unmount()); }
});

test('one selected file still streams the original file through one save dialog', async () => {
  const f = fixture({ count: 1 }); const tree = await mount(f);
  try {
    await check(tree, 'BOM-1.xlsx');
    await download(tree, f);
    assert.deepEqual(f.pickerNames, ['BOM-1.xlsx']);
    assert.deepEqual([...Buffer.concat(f.chunks)], [1, 7, 9]);
    assert.equal(f.directoryCalls(), 0);
  } finally { await act(async () => tree.unmount()); }
});

test('cancelling the ZIP save dialog leaves source files untouched and reports cancelled', async () => {
  const f = fixture({ count: 2, failure: 'cancel-picker' }); const tree = await mount(f);
  try {
    for (const target of f.state.files) await check(tree, target.originalName);
    await download(tree, f, 'cancelled');
    assert.equal(f.requests(), 0);
    assert.equal(f.chunks.length, 0);
    assert.equal(f.state.files.length, 2);
    assert.equal(f.notices.length, 0);
  } finally { await act(async () => tree.unmount()); }
});

test('an inaccessible ZIP source aborts the archive and exposes the error without a success notice', async () => {
  const f = fixture({ count: 2, failure: 'source' }); const tree = await mount(f);
  try {
    for (const target of f.state.files) await check(tree, target.originalName);
    await download(tree, f, 'error');
    assert.equal(f.requests(), 1);
    assert.equal(f.aborts(), 1);
    assert.equal(f.state.files.length, 2);
    assert.ok(f.notices.some(message => /403/.test(message)));
    assert.ok(f.notices.every(message => !/已下載/.test(message)));
  } finally { await act(async () => tree.unmount()); }
});
