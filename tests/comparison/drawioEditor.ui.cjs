const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const test = require('node:test');
const { React, create, act, loader, browser, child, deferred, flush } = require('../support/renderHarness.cjs');
const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'));
const { JSDOM } = qa('jsdom');
const xmlBrowser = new JSDOM();
test.after(() => xmlBrowser.window.close());

const accountA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const accountB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const origin = 'https://embed.diagrams.net';
const stamp = '2026-10-15T00:00:00.000Z';
const baseXml = '<mxfile host="test"><diagram id="one" name="Circuit">compressed+/==</diagram><diagram id="two"><mxGraphModel><root><mxCell id="0"/></root></mxGraphModel></diagram></mxfile>';
const changedXml = baseXml.replace('compressed+/==', 'changed-compressed+/==');
const doc = (id = 'drawio-saved', title = '原生電路圖', xml = baseXml) => ({ version: 1, id, title, xml, createdAt: stamp, updatedAt: stamp });
const clone = value => structuredClone(value);
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.children ? text(node.children) : '';
const DialogContext = React.createContext(null);
const dialogs = {
  Dialog: ({ open, onOpenChange, children }) => React.createElement(DialogContext.Provider, { value: { open, onOpenChange } }, children),
  DialogContent: ({ children, ...props }) => React.useContext(DialogContext).open ? React.createElement('stub', { ...props, role: 'dialog' }, children) : null,
  DialogHeader: child, DialogTitle: child, DialogDescription: child,
};

function fixture({ initialDocument, canEdit = true, keyAccounts = true, capturePersistence } = {}) {
  const window = browser();
  const body = { style: { overflow: 'auto' } };
  window.document = { body };
  const frames = [], messages = [], calls = [], downloads = [], saveGates = [], listGates = [], timers = new Map();
  const records = new Map();
  let nextTimer = 0, tree, quick = 0, consumed = 0;
  const owner = account => { if (!records.has(account)) records.set(account, new Map()); return records.get(account); };
  const timeout = (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; };
  const clearTimeout = id => timers.delete(id);
  const storage = {
    async listDrawioDocuments(account) { calls.push({ kind: 'list', account }); const gate = listGates.shift(); if (gate) await gate.promise; return clone([...owner(account).values()]); },
    async saveDrawioDocument(account, document) { const snapshot = clone(document); calls.push({ kind: 'save:start', account, document: snapshot }); const gate = saveGates.shift(); if (gate) await gate.promise; owner(account).set(snapshot.id, snapshot); calls.push({ kind: 'save:complete', account, document: snapshot }); },
  };
  const load = loader({ window, globals: { Error, TextEncoder, TextDecoder, DOMParser: xmlBrowser.window.DOMParser, setTimeout: timeout, clearTimeout }, mocks: {
    './drawioStorage': storage,
    './downloads': { downloadLocal: (xml, filename, mime) => downloads.push({ xml, filename, mime }) },
    '@/components/ui/dialog': dialogs,
    'react-dom': { createPortal: (children, target) => { assert.equal(target, body); return React.createElement('portal', null, children); } },
  } });
  const Editor = load('src/components/comparison/DrawioDiagramEditor.tsx').default;
  let props = { accountId: accountA, canEdit, initialDocument, capturePersistence, onQuickEditor: () => { quick++; }, onInitialConsumed: () => { consumed++; } };
  const render = () => React.createElement(Editor, { ...props, key: keyAccounts ? props.accountId : undefined });
  return {
    calls, frames, messages, downloads, records, saveGates, listGates, timers, body,
    seed(account, document) { owner(account).set(document.id, clone(document)); },
    saved(account = props.accountId) { return [...owner(account).values()]; },
    get tree() { return tree; }, get quick() { return quick; }, get consumed() { return consumed; },
    async mount() { await act(async () => { tree = create(render(), { createNodeMock(element) { if (element.type === 'iframe') { const contentWindow = { postMessage(data, target) { messages.push({ frame: contentWindow, target, value: JSON.parse(data) }); } }; frames.push(contentWindow); return { contentWindow }; } if (element.type === 'input') return { click() {} }; return null; } }); }); await flush(); },
    async update(next) { props = { ...props, ...next }; await act(async () => tree.update(render())); await flush(); },
    async unmount() { await act(async () => tree.unmount()); await flush(); },
    frame() { return frames.at(-1); },
    iframe() { return tree.root.findAllByType('iframe')[0]; },
    title() { return tree.root.findByProps({ id: 'drawio-title' }); },
    button(label) { return tree.root.findAll(node => ['stub', 'button'].includes(node.type) && typeof node.props.onClick === 'function').find(node => node.props['aria-label'] === label || text(node) === label); },
    async click(label) { const button = this.button(label); assert.ok(button, `Control ${label} exists`); assert.ok(!button.props.disabled, `Control ${label} enabled`); await act(async () => { button.props.onClick(); }); await flush(); },
    async receive(value, options = {}) { const event = new Event('message'); Object.defineProperties(event, { origin: { value: options.origin ?? origin }, source: { value: options.source ?? this.frame() }, data: { value: options.raw ?? JSON.stringify(value) } }); await act(async () => window.dispatchEvent(event)); await flush(); },
    async ready() { await this.receive({ event: 'configure' }); await this.receive({ event: 'init' }); await this.receive({ event: 'load' }); },
    sent(action) { return messages.filter(message => message.value.action === action); },
    async exportResponse(xml = changedXml, extra = {}) { const request = this.sent('export').at(-1)?.value; assert.ok(request, 'Export request exists'); await this.receive({ event: 'export', format: 'xml', xml, message: { requestId: request.requestId }, ...extra }); },
    async importFile(file) { const target = { files: [file], value: 'selected file' }; await act(async () => tree.root.findByProps({ 'aria-label': '開啟 DRAWIO 檔案' }).props.onChange({ target })); await flush(); assert.equal(target.value, ''); },
    async timersAt(delay) { const due = [...timers].filter(([, item]) => item.delay === delay); await act(async () => { for (const [id, item] of due) { timers.delete(id); item.callback(); } }); await flush(); },
    alerts() { return tree.root.findAll(node => node.props.role === 'alert').map(text); },
    status() { return tree.root.findAll(node => node.props.role === 'status').map(text).join(' '); },
    appearance() { return window.localStorage.getItem('autocheck-diagram-appearance'); },
    beforeUnload() { const event = new Event('beforeunload', { cancelable: true }); Object.defineProperty(event, 'returnValue', { configurable: true, writable: true, value: undefined }); window.dispatchEvent(event); return { prevented: event.defaultPrevented, returnValue: event.returnValue }; },
  };
}

test('official iframe configure/init/load preserves native multi-page XML and scopes every outbound message', async () => {
  const f = fixture(); f.seed(accountA, doc()); await f.mount();
  assert.equal(f.title().props.value, '原生電路圖');
  assert.equal(f.iframe().props.referrerPolicy, 'no-referrer');
  assert.match(f.iframe().props.sandbox, /allow-scripts/);
  await f.ready();
  assert.equal(f.sent('configure')[0].value.config.darkColor, '#1c1c1e');
  assert.equal(f.sent('load')[0].value.xml, baseXml);
  assert.equal(f.sent('load')[0].value.autosave, 1);
  assert.equal(f.iframe().parent.props['aria-busy'], false);
  assert.ok(f.messages.every(message => message.target === origin));
  await f.unmount();
});

test('foreign origins, old frames, non-JSON and invalid native XML cannot overwrite stored documents', async () => {
  const f = fixture(); f.seed(accountA, doc()); await f.mount(); await f.ready();
  const before = f.calls.length;
  await f.receive({ event: 'autosave', xml: changedXml }, { origin: `${origin}.evil.test` });
  await f.receive({ event: 'autosave', xml: changedXml }, { source: {} });
  await f.receive({}, { raw: '{' });
  assert.equal(f.calls.length, before);
  await f.receive({ event: 'autosave', xml: '<mxfile>' });
  assert.equal(f.saved()[0].xml, baseXml);
  assert.match(f.alerts().join(' '), /XML 格式錯誤/);
  await f.receive({ event: 'autosave', xml: changedXml });
  assert.equal(f.saved()[0].xml, changedXml);
  assert.equal(f.alerts().length, 0);
  await f.unmount();
});

test('autosave and explicit save persist exact XML, serialize writes and warn while a write is pending', async () => {
  const f = fixture(); f.seed(accountA, doc()); await f.mount(); await f.ready();
  const gate = deferred(); f.saveGates.push(gate);
  await f.receive({ event: 'autosave', xml: changedXml });
  const finalXml = changedXml.replace('changed-compressed', 'final-compressed');
  await f.receive({ event: 'save', xml: finalXml });
  assert.equal(f.calls.filter(item => item.kind === 'save:start').length, 1);
  assert.match(f.status(), /儲存中/);
  assert.deepEqual(f.beforeUnload(), { prevented: true, returnValue: '' });
  gate.resolve(); await flush(); await flush();
  assert.deepEqual(f.calls.filter(item => item.kind === 'save:complete').map(item => item.document.xml), [changedXml, finalXml]);
  assert.equal(f.saved()[0].xml, finalXml);
  assert.match(f.status(), /已存於本機/);
  assert.equal(f.sent('status').at(-1).value.modified, false);
  assert.equal(f.beforeUnload().prevented, false);
  await f.unmount();
});

test('permission revocation rejects pending exports and ignores stale frame events', async () => {
  const f = fixture(); f.seed(accountA, doc()); await f.mount(); await f.ready();
  const old = f.frame();
  await f.click('下載 .drawio');
  await f.update({ canEdit: false });
  await f.receive({ event: 'autosave', xml: changedXml }, { source: old });
  assert.equal(f.downloads.length, 0);
  assert.equal(f.saved()[0].xml, baseXml);
  assert.equal(f.iframe(), undefined);
  assert.match(f.alerts().join(' '), /編輯權限已變更/);
  await f.click('下載 .drawio');
  assert.equal(f.downloads[0].xml, baseXml);
  await f.unmount();
});

test('account remount cannot accept previous frame messages or write their contents into the next account', async () => {
  const f = fixture(); f.seed(accountA, doc('a', 'Account A')); f.seed(accountB, doc('b', 'Account B')); await f.mount(); await f.ready();
  const old = f.frame();
  await f.click('下載 .drawio');
  await f.update({ accountId: accountB });
  await f.receive({ event: 'autosave', xml: changedXml }, { source: old });
  await f.receive({ event: 'load' }, { source: old });
  assert.equal(f.title().props.value, 'Account B');
  assert.equal(f.saved(accountB)[0].xml, baseXml);
  assert.equal(f.calls.filter(item => item.kind === 'save:start').length, 0);
  assert.equal(f.downloads.length, 0);
  await f.unmount();
});

test('downloads accept only the correlated XML response and preserve original page payloads', async () => {
  const f = fixture(); f.seed(accountA, doc('one', '電路圖 / A')); await f.mount(); await f.ready();
  await f.click('下載 .drawio');
  const request = f.sent('export').at(-1).value;
  assert.equal(request.format, 'xml');
  assert.ok(request.requestId);
  await f.receive({ event: 'export', format: 'xml', xml: changedXml, message: { requestId: 'different' } });
  assert.equal(f.downloads.length, 0);
  assert.equal(f.button('下載 .drawio').props.disabled, true);
  await f.exportResponse();
  assert.deepEqual(f.downloads, [{ xml: changedXml, filename: '電路圖 _ A.drawio', mime: 'application/vnd.jgraph.mxfile' }]);
  assert.equal(f.saved()[0].xml, changedXml);
  assert.equal(f.button('下載 .drawio').props.disabled, false);
  await f.unmount();
});

test('a timed out export unlocks controls and retains the previous document for retry', async () => {
  const f = fixture(); f.seed(accountA, doc()); await f.mount(); await f.ready();
  await f.click('下載 .drawio'); await f.timersAt(12000);
  assert.equal(f.button('下載 .drawio').props.disabled, false);
  assert.match(f.alerts().join(' '), /DRAWIO 沒有回應/);
  assert.equal(f.saved()[0].xml, baseXml);
  await f.click('下載 .drawio'); await f.exportResponse();
  assert.equal(f.downloads[0].xml, changedXml);
  await f.unmount();
});

test('malformed correlated export responses reject their request and release the busy state', async () => {
  const f = fixture(); f.seed(accountA, doc()); await f.mount(); await f.ready();
  await f.click('下載 .drawio'); await f.exportResponse('<mxfile>');
  assert.match(f.alerts().join(' '), /XML 格式錯誤/);
  assert.equal(f.button('下載 .drawio').props.disabled, false);
  assert.equal(f.downloads.length, 0);
  assert.equal(f.saved()[0].xml, baseXml);
  await f.unmount();
});

test('a quota failure still allows a backup of the newest in-frame XML', async () => {
  const f = fixture(); f.seed(accountA, doc()); await f.mount(); await f.ready();
  const gate = deferred(); f.saveGates.push(gate);
  await f.receive({ event: 'autosave', xml: changedXml }); gate.reject(new Error('Quota exceeded')); await flush();
  assert.match(f.alerts().join(' '), /Quota exceeded/);
  assert.equal(f.saved()[0].xml, baseXml);
  await f.click('下載 .drawio'); await f.exportResponse(changedXml);
  assert.equal(f.downloads[0].xml, changedXml);
  await f.unmount();
});

test('theme changes flush current editor XML and wait for storage before remounting the official iframe', async () => {
  const f = fixture(); f.seed(accountA, doc()); await f.mount(); await f.ready();
  const old = f.frame();
  const gate = deferred(); f.saveGates.push(gate);
  await f.click('切換淺色模式');
  assert.equal(f.frame(), old); assert.equal(f.appearance(), null);
  await f.exportResponse();
  assert.equal(f.frame(), old); assert.equal(f.appearance(), null);
  gate.resolve(); await flush(); await flush();
  assert.equal(f.saved()[0].xml, changedXml);
  assert.equal(f.appearance(), 'light');
  assert.notEqual(f.frame(), old);
  assert.equal(new URL(f.iframe().props.src).searchParams.get('ui'), 'kennedy');
  await f.receive({ event: 'autosave', xml: baseXml }, { source: old });
  assert.equal(f.saved()[0].xml, changedXml);
  await f.unmount();
});

test('switching to the quick editor waits for correlated export and the final XML save', async () => {
  const f = fixture(); f.seed(accountA, doc()); await f.mount(); await f.ready();
  const gate = deferred(); f.saveGates.push(gate);
  await f.click('快速繪圖'); assert.equal(f.quick, 0);
  await f.exportResponse(); assert.equal(f.quick, 0);
  gate.resolve(); await flush(); await flush();
  assert.equal(f.quick, 1); assert.equal(f.saved()[0].xml, changedXml);
  await f.unmount();
});

test('provided native source XML is loaded unchanged and failure to read local storage still permits backup', async () => {
  const source = doc('source', '來源 Power Tree', `\uFEFF<?xml version="1.0"?>\n${baseXml}\n`);
  const f = fixture({ initialDocument: source }); const read = deferred(); f.listGates.push(read);
  await f.mount(); read.reject(new Error('Storage blocked')); await flush();
  assert.equal(f.title().props.value, source.title);
  await f.ready(); assert.equal(f.sent('load')[0].value.xml, source.xml);
  await f.click('下載 .drawio'); await f.exportResponse(source.xml);
  assert.equal(f.downloads[0].xml, source.xml);
  await f.unmount();
});

test('a newer native source arriving during the initial IndexedDB read wins over the stale initial source', async () => {
  const first = doc('first-source', 'First source');
  const latest = doc('latest-source', 'Latest source', changedXml);
  const f = fixture({ initialDocument: first }); const gate = deferred(); f.listGates.push(gate);
  await f.mount(); await f.update({ initialDocument: latest });
  gate.resolve(); await flush(); await flush();
  assert.equal(f.title().props.value, latest.title);
  assert.equal(f.consumed, 1);
  assert.deepEqual(f.calls.filter(item => item.kind === 'save:start').map(item => item.document.id), [latest.id]);
  await f.ready(); assert.equal(f.sent('load').at(-1).value.xml, latest.xml);
  await f.unmount();
});

test('a native source received during an export waits for the current operation then replaces the document', async () => {
  const f = fixture(); f.seed(accountA, doc()); await f.mount(); await f.ready();
  await f.click('下載 .drawio');
  const latest = doc('incoming-source', 'Incoming native source', baseXml.replace('compressed+/==', 'incoming-compressed+/=='));
  await f.update({ initialDocument: latest });
  assert.equal(f.title().props.value, '原生電路圖');
  assert.equal(f.consumed, 0);
  await f.exportResponse(changedXml);
  assert.equal(f.downloads[0].xml, changedXml);
  assert.equal(f.sent('export').length, 2, 'replacement flush starts after download completes');
  await f.exportResponse(changedXml);
  assert.equal(f.title().props.value, latest.title);
  assert.equal(f.consumed, 1);
  assert.equal(f.saved().find(item => item.id === latest.id).xml, latest.xml);
  await f.ready(); assert.equal(f.sent('load').at(-1).value.xml, latest.xml);
  await f.unmount();
});

test('a failed incoming-source replacement retains the previous document and does not start an automatic retry loop', async () => {
  const f = fixture(); f.seed(accountA, doc()); await f.mount(); await f.ready();
  const gate = deferred(); f.saveGates.push(gate);
  await f.update({ initialDocument: doc('cannot-save', 'Source blocked by quota') });
  await f.exportResponse(baseXml);
  gate.reject(new Error('Quota exceeded')); await flush(); await flush();
  assert.equal(f.title().props.value, '原生電路圖');
  assert.equal(f.consumed, 0);
  assert.equal(f.sent('export').length, 1, 'failed source requires a deliberate retry or new source');
  assert.equal(f.button('下載 .drawio').props.disabled, false);
  const retryFailure = deferred(); f.saveGates.push(retryFailure);
  await f.click('重試帶入圖稿');
  assert.equal(f.sent('export').length, 2);
  await f.exportResponse(baseXml);
  retryFailure.reject(new Error('Quota still exceeded')); await flush(); await flush();
  assert.equal(f.sent('export').length, 2, 'a failed user retry also stops after one attempt');
  assert.equal(f.title().props.value, '原生電路圖');
  assert.equal(f.button('下載 .drawio').props.disabled, false);
  await f.click('重試帶入圖稿');
  assert.equal(f.sent('export').length, 3);
  await f.exportResponse(baseXml);
  assert.equal(f.title().props.value, 'Source blocked by quota', 'a transient quota failure can recover with an explicit retry');
  assert.equal(f.consumed, 1);
  assert.equal(f.saved().find(item => item.id === 'cannot-save').xml, baseXml);
  await f.unmount();
});

test('opening a native .drawio file flushes the old document and keeps all imported pages unchanged', async () => {
  const f = fixture(); f.seed(accountA, doc()); await f.mount(); await f.ready();
  const importedXml = `\uFEFF<?xml version="1.0"?>\n${baseXml.replace('compressed+/==', 'external compressed+/==')}\n`;
  await f.importFile({ name: '批次電路圖.drawio', size: Buffer.byteLength(importedXml), text: async () => importedXml });
  assert.equal(f.title().props.value, '原生電路圖');
  await f.exportResponse(changedXml);
  assert.equal(f.title().props.value, '批次電路圖');
  assert.equal(f.saved().find(item => item.title === '批次電路圖').xml, importedXml);
  assert.equal(f.saved().find(item => item.id === 'drawio-saved').xml, changedXml);
  await f.ready(); assert.equal(f.sent('load').at(-1).value.xml, importedXml);
  await f.unmount();
});

test('oversized and malformed file imports preserve the current XML without requesting a replacement', async () => {
  const f = fixture(); f.seed(accountA, doc()); await f.mount(); await f.ready();
  let read = false;
  await f.importFile({ name: 'too-large.drawio', size: 20 * 1024 * 1024 + 1, text: async () => { read = true; return baseXml; } });
  assert.equal(read, false); assert.match(f.alerts().join(' '), /20 MiB/);
  await f.importFile({ name: 'broken.xml', size: 8, text: async () => '<mxfile>' });
  assert.match(f.alerts().join(' '), /XML 格式錯誤/);
  assert.equal(f.sent('export').length, 0);
  assert.equal(f.saved()[0].xml, baseXml);
  await f.unmount();
});

test('unavailable external editor offers reload and a local native XML download', async () => {
  const f = fixture(); f.seed(accountA, doc()); await f.mount();
  await f.timersAt(25000);
  assert.match(f.status(), /無法連上 DRAWIO/);
  await f.click('下載 .drawio'); assert.equal(f.downloads[0].xml, baseXml);
  const old = f.frame(); await f.click('重新載入'); assert.notEqual(f.frame(), old);
  await f.ready(); assert.equal(f.sent('load').at(-1).value.xml, baseXml);
  await f.unmount();
});

test('accepted queued autosaves finish after a tab unmount when the captured workspace scope remains valid', async () => {
  let epoch = 1;
  const capturePersistence = () => { const captured = epoch; return () => { if (captured !== epoch) throw new Error('Expired persistence scope'); }; };
  const f = fixture({ capturePersistence }); f.seed(accountA, doc()); await f.mount(); await f.ready();
  const gate = deferred(); f.saveGates.push(gate);
  await f.receive({ event: 'autosave', xml: changedXml });
  const finalXml = changedXml.replace('changed-compressed', 'accepted-final-compressed');
  await f.receive({ event: 'autosave', xml: finalXml });
  await f.unmount(); gate.resolve(); await flush(); await flush();
  assert.equal(f.saved(accountA)[0].xml, finalXml);
  assert.equal(f.calls.filter(item => item.kind === 'save:complete').length, 2);
  epoch++;
});

test('an account or permission epoch change rejects a queued save even after the child editor unmounts', async () => {
  let epoch = 1;
  const capturePersistence = () => { const captured = epoch; return () => { if (captured !== epoch) throw new Error('Expired persistence scope'); }; };
  const f = fixture({ capturePersistence }); f.seed(accountA, doc()); await f.mount(); await f.ready();
  const gate = deferred(); f.saveGates.push(gate);
  await f.receive({ event: 'autosave', xml: changedXml });
  await f.receive({ event: 'autosave', xml: changedXml.replace('changed-compressed', 'must-not-start') });
  await f.unmount(); epoch++; gate.resolve(); await flush(); await flush();
  assert.equal(f.calls.filter(item => item.kind === 'save:start').length, 1);
  assert.equal(f.saved(accountA)[0].xml, changedXml);
  assert.deepEqual(f.saved(accountB), []);
});

function workspaceFixture() {
  let tree, consumed = 0;
  const converted = [];
  const load = loader({ globals: { TextDecoder }, mocks: {
    './ComparisonDiagramEditor': { default: props => React.createElement('quick-editor', props) },
    './DrawioDiagramEditor': { default: props => React.createElement('drawio-editor', props) },
    './drawioDocument': {
      validateDrawioXml: xml => { if (!xml.startsWith('<mxfile')) throw new Error('Invalid'); return xml; },
      createBlankDrawioDocument: title => doc('converted-document', title),
    },
    './diagramDrawioExport': { diagramToDrawioXml: document => { converted.push(document); return '<mxfile><diagram>converted native XML</diagram></mxfile>'; } },
  } });
  const Workspace = load('src/components/comparison/ComparisonDiagramWorkspace.tsx').default;
  let props = { accountId: accountA, canEdit: true, session: null, onSourceConsumed: () => { consumed++; } };
  return {
    converted, get consumed() { return consumed; },
    async mount(next = {}) { props = { ...props, ...next }; await act(async () => { tree = create(React.createElement(Workspace, props)); }); },
    async update(next) { props = { ...props, ...next }; await act(async () => tree.update(React.createElement(Workspace, props))); },
    editor(type) { return tree.root.findAllByType(type)[0]; },
    async call(type, name, ...args) { await act(async () => this.editor(type).props[name](...args)); },
    async unmount() { await act(async () => tree.unmount()); },
  };
}
const nativeSession = xml => ({ projectName: 'Board A', result: { artifacts: [{ key: 'power_drawio_a', bytes: new TextEncoder().encode(xml).buffer }], meta: { a: { label: 'EVT' }, b: { label: 'DVT' } } } });

test('the diagram workspace opens DRAWIO by default and consumes native comparison artifacts without conversion', async () => {
  const f = workspaceFixture(); await f.mount(); assert.ok(f.editor('drawio-editor'));
  const source = { kind: 'power', revision: 'a' };
  await f.update({ initialSource: source, session: nativeSession(baseXml) });
  assert.equal(f.editor('drawio-editor').props.initialDocument.xml, baseXml);
  assert.equal(f.editor('drawio-editor').props.initialDocument.title, 'Board A · Power Tree · EVT');
  await f.call('drawio-editor', 'onInitialConsumed');
  assert.equal(f.consumed, 1); assert.equal(f.converted.length, 0);
  await f.unmount();
});

test('legacy comparison artifacts stay in quick drawing, which can convert an existing drawing into native DRAWIO', async () => {
  const f = workspaceFixture();
  await f.mount({ initialSource: { kind: 'power', revision: 'a' }, session: nativeSession('malformed XML') });
  assert.ok(f.editor('quick-editor')); assert.equal(f.editor('drawio-editor'), undefined);
  await f.call('quick-editor', 'onSourceConsumed');
  const drawing = { title: 'Existing user drawing', nodes: [], edges: [] };
  await f.call('quick-editor', 'onOpenDrawio', drawing);
  assert.ok(f.editor('drawio-editor'));
  assert.equal(f.editor('drawio-editor').props.initialDocument.title, drawing.title);
  assert.equal(f.converted[0], drawing);
  await f.unmount();
});
