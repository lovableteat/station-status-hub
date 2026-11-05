const assert = require('node:assert/strict');
const test = require('node:test');
const ts = require('typescript');
const { React, act, create, deferred, loader, browser, ui } = require('./support/renderHarness.cjs');

const part = (id, ref = 'U1') => ({
  id, name: `Synthetic part ${id}`, refDes: ref, manufacturerPartNumber: `QA-MPN-${id}`,
  manufacturer: 'Synthetic vendor', needsApplication: true, trackingStatus: '未處理', trackingHistory: [],
  specDocuments: [{ name: `${id}.pdf`, path: `synthetic/${id}.pdf`, size: 20 }],
});
const table = (title = 'Initial result') => ({
  templateId: 'template-1', templateName: 'form.png', title, columns: ['Voltage'],
  rows: [[{ value: '1.20 V', kind: 'label' }]], warnings: [], partMatch: 'matched',
});
const text = node => React.Children.toArray(node.props.children).filter(child => typeof child === 'string' || typeof child === 'number').join('');
const button = (root, name) => root.root.findAll(node => node.type === 'stub' && node.props.onClick && (node.props['aria-label'] === name || text(node).includes(name)))[0];

async function specFixture() {
  const calls = [], jobs = [], questions = [], questionJobs = [], exports = [], downloads = [];
  const source = part('1');
  const service = {
    loadSpecFillModels: async () => [{ id: 'qa-model', label: 'Synthetic AI', record: {} }, { id: 'qa-model-2', label: 'Synthetic second AI', record: {} }],
    downloadSpecForFill: async () => new Blob(['Synthetic SPEC']),
    canReadSpecForFill: () => true, SPEC_FILL_ACCEPT: '.pdf', SPEC_FILL_MAX_BYTES: 18 * 1024 * 1024, SPEC_FILL_MAX_PHOTOS: 20,
    analyzeSpecFillConversation(input) { calls.push(input); const job = deferred(); jobs.push(job); return job.promise; },
    askSpecFillQuestion(input) { questions.push(input); const job = deferred(); questionJobs.push(job); return job.promise; },
  };
  const load = loader({ mocks: {
    './materialSpecFillService': service,
    './materialSpecFillExport': { createSpecFillPhotosWorkbook: async (tables, sources, mpn, model) => {
      exports.push({ tables, sources, mpn, model });
      return { xlsx: { writeBuffer: async () => new Uint8Array([1, 2, 3]) } };
    } },
    './materialRequestExport': { downloadBlob: (...args) => downloads.push(args) },
  }, globals: {
    Blob, File, URL: { createObjectURL: () => 'blob:synthetic-photo', revokeObjectURL() {} },
  } });
  const { MaterialSpecFillDialog } = load('src/components/material-requests/MaterialSpecFillDialog.tsx');
  let root;
  const props = { records: [source], workspaceName: 'Synthetic BOM', open: true, onOpenChange() {} };
  await act(async () => { root = create(React.createElement(MaterialSpecFillDialog, props)); });
  return {
    root, calls, jobs, questions, exports, downloads,
    button: name => button(root, name),
    async setOpen(open) { await act(async () => { root.update(React.createElement(MaterialSpecFillDialog, { ...props, open })); }); },
    async prepare() {
      await act(async () => {
        root.root.findByProps({ 'aria-label': '選擇表格照片檔案' }).props.onChange({ target: { files: [new File(['synthetic'], 'form.png', { type: 'image/png' })], value: '' } });
        root.root.findAllByType('input').find(node => node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
      });
    },
    async start() { await act(async () => { button(root, '開始依照片填表').props.onClick(); }); },
    async answer(index, title = 'Initial result') {
      const input = calls[index];
      await act(async () => { jobs[index].resolve({
        tables: [table(title)], reply: `Synthetic reply ${index + 1}`, warnings: [],
        sources: input.sources.map(({ id, name }) => ({ id, name })), preparedSources: input.sources,
      }); });
    },
    async ask(question) {
      await act(async () => { root.root.findByProps({ 'aria-label': '接續提問' }).props.onChange({ target: { value: question } }); });
    },
    async answerQuestion(index, reply = `Synthetic grounded answer ${index + 1}: 1.20 V`) {
      const input = questions[index];
      await act(async () => { questionJobs[index].resolve({
        tables: [], reply, warnings: [],
        sources: input.sources.map(({ id, name }) => ({ id, name })), preparedSources: input.sources,
        citations: [{ sourceId: 'spec-1', page: '2', quote: 'Synthetic operating voltage 1.20 V' }],
      }); });
    },
    async send() { await act(async () => { button(root, '送出追問').props.onClick(); }); },
    async unmount() { await act(async () => { root.unmount(); }); },
  };
}

// Load the actual exported dialog without instantiating the unrelated BOM page,
// storage, presence or editors. Its filtering and view-restoration code remains real.
async function pendingFixture() {
  const frames = new Map(); let nextFrame = 0;
  const list = { scrollTop: 0 };
  const componentNames = ['PendingMaterialsDialog', 'getPendingGroupUpdatedAt'];
  const noop = () => null;
  const load = loader({
    transform(source, file) {
      if (!file.endsWith('MaterialRequestPage.tsx')) return source;
      const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const extracted = componentNames.map(name => {
        const node = parsed.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
        assert.ok(node, `The production ${name} component must remain available`);
        return node.getText(parsed);
      }).join('\n');
      return `import { useState, useEffect, useMemo, useRef } from "react";
        import { Button } from "@/components/ui/button";
        import { Input } from "@/components/ui/input";
        import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
        import { Search, ScanText, FileSpreadsheet, Download, FileCode2, Factory, Check, X, Star, Copy, TriangleAlert } from "lucide-react";
        import { buildPendingApplications, groupPendingMaterials } from "./materialRequestPresentation";
        import { isTrackedMaterialApplication, materialTrackingStatusTone, getMaterialTrackingStatusMeaning } from "./materialTrackingStatus";
        import { describeMaterialApplicationTiming, formatMaterialApplicationDays, getMaterialApplicationTiming } from "./materialApplicationTiming";
        const STALE_PENDING_MS = 3 * 86400000;
        ${extracted}`;
    },
    globals: {
      MaterialNoteCell: ui.Input, cn: (...values) => values.filter(Boolean).join(' '),
      useMaterialRequestOwners: () => ({ owners: [], error: '' }),
      getTrackingWorkflowStatus: record => record.trackingStatus || '未處理',
      toWorkbookRecord: record => record,
      PendingMailDialog: noop, SupplierDirectoryDialog: noop, PendingCategoryPicker: noop, MaterialRequestOwnerPicker: noop,
      CHIP_BASE: '', CHIP_TONES: { danger: '' },
      requestAnimationFrame: callback => { const id = ++nextFrame; frames.set(id, callback); return id; },
      cancelAnimationFrame: id => frames.delete(id),
    },
  });
  const { PendingMaterialsDialog } = load('src/components/material-requests/MaterialRequestPage.tsx');
  const records = [part('IC', 'U1'), part('R', 'R1')];
  const groups = records.map(record => ({ key: record.id, displayRef: record.refDes, name: record.name, searchText: `${record.refDes} ${record.name}`.toLowerCase(), primaryRecord: record, records: [record] }));
  const opened = [];
  const props = {
    groups, open: true, canEdit: true, workspaceName: 'Synthetic BOM', exportedBy: 'Synthetic tester',
    markedGroupKeys: new Set(), onOpenChange() {}, onOpenTracking() {}, onCopy() {},
    onSetCategory() {}, onSetOwner: async () => {}, onToggleMarked() {}, onOpenSpecFill: records => opened.push(records),
  };
  let root;
  await act(async () => { root = create(React.createElement(PendingMaterialsDialog, props), {
    createNodeMock: element => element.props['data-testid'] === 'pending-materials-list' ? list : null,
  }); });
  return {
    root, opened, list,
    async update(next) {
      await act(async () => { root.update(React.createElement(PendingMaterialsDialog, { ...props, ...next })); });
      await act(async () => { for (const [id, callback] of [...frames]) { frames.delete(id); callback(); } });
    },
    async unmount() { await act(async () => { root.unmount(); }); },
  };
}

async function navigationFixture() {
  const window = browser();
  const entries = [
    { url: 'http://localhost/previous-page', state: { workspaceHistoryIndex: 6, idx: 2, key: 'outer-router', usr: { staleRouterProject: 'before' }, unrelated: 'keep' } },
    { url: 'http://localhost/station-status-hub/?workspace=material-requests&project=project-A&fileSpace=space-A#qa', state: { workspaceHistoryIndex: 7, idx: 2, key: 'outer-router', usr: { staleRouterProject: 'before' }, unrelated: 'keep' } },
  ];
  let position = 1, action = '';
  window.location.href = entries[position].url;
  window.history = {
    get state() { return entries[position].state; },
    replaceState(state, _title, url) { action = 'REPLACE'; entries[position] = { state: structuredClone(state), url: String(url || window.location.href) }; window.location.href = entries[position].url; },
    pushState(state, _title, url) { action = 'PUSH'; entries.splice(position + 1); entries.push({ state: structuredClone(state), url: String(url) }); position += 1; window.location.href = entries[position].url; },
    go(delta) {
      const next = position + delta;
      if (next < 0 || next >= entries.length) return;
      action = 'POP'; position = next; window.location.href = entries[position].url;
      window.dispatchEvent(new Event('popstate'));
    },
    back() { this.go(-1); }, forward() { this.go(1); },
  };
  const load = loader({ window });
  const { watchWorkspaceHistory } = load('src/lib/workspaceHistory.ts');
  const stopWatcher = watchWorkspaceHistory(() => {});
  const { useSpecFillNavigation } = load('src/components/material-requests/useSpecFillNavigation.ts');
  const opens = [], returns = [];
  let navigation, changeScope, changeLabel;
  function Probe() {
    const [scopeKey, setScopeKey] = React.useState('account-A:bom-A');
    const [label, setLabel] = React.useState('initial');
    changeScope = setScopeKey; changeLabel = setLabel;
    navigation = useSpecFillNavigation({ scopeKey,
      onOpenSpecFill: () => opens.push(`${scopeKey}/${label}`),
      onReturnToPending: () => returns.push(`${scopeKey}/${label}`),
    });
    return null;
  }
  let root;
  await act(async () => { root = create(React.createElement(Probe)); });
  return {
    opens, returns, window,
    get location() { return { ...Object.fromEntries(['pathname', 'search', 'hash'].map(key => [key, window.location[key]])), state: window.history.state }; },
    get action() { return action; },
    async open() { await act(async () => { navigation.openSpecFill(); }); },
    async close() { await act(async () => { navigation.closeSpecFill(); }); },
    async back() { await act(async () => { window.history.back(); }); },
    async forward() { await act(async () => { window.history.forward(); }); },
    async scope(scopeKey) { await act(async () => { changeScope(scopeKey); }); },
    async label(label) { await act(async () => { changeLabel(label); }); },
    async unmount() { await act(async () => { root.unmount(); }); stopWatcher(); },
  };
}

test('workspace Back, Forward and explicit return navigate AI/pending without changing the live URL or outer router state', async t => {
  const f = await navigationFixture(); t.after(() => f.unmount());
  const originalUrl = `${f.location.pathname}${f.location.search}${f.location.hash}`;
  await f.open();
  assert.equal(f.opens.length, 1);
  assert.equal(`${f.location.pathname}${f.location.search}${f.location.hash}`, originalUrl);
  assert.equal(f.location.state.unrelated, 'keep');
  assert.equal(f.location.state.workspaceHistoryIndex, 8);
  assert.equal(f.location.state.idx, 2);
  assert.deepEqual(f.location.state.usr, { staleRouterProject: 'before' });
  await f.back();
  assert.equal(f.returns.length, 1);
  assert.equal(`${f.location.pathname}${f.location.search}${f.location.hash}`, originalUrl);
  assert.equal(f.location.state.unrelated, 'keep');
  assert.equal(f.location.state.workspaceHistoryIndex, 7);
  await f.forward();
  assert.equal(f.opens.length, 2, 'Forward may reopen only the retained same-scope dialog');
  assert.equal(f.location.state.workspaceHistoryIndex, 8);
  await f.close();
  assert.equal(f.returns.length, 2);
  assert.equal(f.location.state.workspaceHistoryIndex, 7);
  await f.close();
  assert.equal(f.returns.length, 2, 'repeated return cannot pop the page beneath the pending list');
  assert.equal(f.location.pathname, '/station-status-hub/');
});

test('opening an already open AI dialog adds no duplicate history entry and return uses the latest UI callbacks', async t => {
  const f = await navigationFixture(); t.after(() => f.unmount());
  await f.open(); await f.open();
  assert.equal(f.opens.length, 1);
  await f.label('latest');
  await f.back();
  assert.deepEqual(f.returns, ['account-A:bom-A/latest']);
  await f.back();
  assert.equal(f.location.pathname, '/previous-page', 'one AI entry sits above the original page history');
  assert.equal(f.returns.length, 1);
});

for (const nextScope of ['account-B:bom-A', 'account-A:bom-B', null]) {
  test(`changing scope to ${nextScope} invalidates stale AI history without opening another account or BOM`, async t => {
    const f = await navigationFixture(); t.after(() => f.unmount());
    await f.open();
    await f.scope(nextScope);
    await f.back(); await f.forward();
    assert.equal(f.opens.length, 1);
    assert.equal(f.returns.length, 0);
    assert.equal(f.location.state.unrelated, 'keep');
    if (nextScope) {
      await f.open(); await f.back();
      assert.deepEqual(f.returns, [`${nextScope}/initial`]);
    } else {
      await f.open();
      assert.equal(f.opens.length, 1, 'a missing account/BOM scope cannot create AI history');
    }
  });
}

test('AI history stores navigation markers only and never serializes retained files, prompts or answers', async t => {
  const f = await navigationFixture(); t.after(() => f.unmount());
  await f.open();
  const state = f.location.state;
  assert.deepEqual(Object.keys(state).sort(), ['idx', 'key', 'station:material-spec-fill', 'unrelated', 'usr', 'workspaceHistoryIndex']);
  assert.deepEqual(Object.keys(state['station:material-spec-fill']).sort(), ['scopeKey', 'token', 'version', 'view']);
});

test('the existing workspace leave guard can cancel Back without reopening the pending list', async t => {
  const f = await navigationFixture(); t.after(() => f.unmount());
  await f.open();
  const cancel = event => event.preventDefault();
  f.window.addEventListener('workspace-before-navigate', cancel);
  await f.back();
  assert.equal(f.location.state.workspaceHistoryIndex, 8);
  assert.equal(f.returns.length, 0);
  f.window.removeEventListener('workspace-before-navigate', cancel);
  await f.back();
  assert.equal(f.location.state.workspaceHistoryIndex, 7);
  assert.equal(f.returns.length, 1);
});

test('explicit return closes the same-scope UI safely when another workspace control replaces its URL or marker', async t => {
  const f = await navigationFixture(); t.after(() => f.unmount());
  await f.open();
  const state = { ...f.window.history.state };
  delete state['station:material-spec-fill'];
  const updated = new URL(f.window.location.href);
  updated.searchParams.set('fileSpace', 'space-new');
  f.window.history.replaceState(state, '', updated);
  await f.close();
  assert.deepEqual(f.returns, ['account-A:bom-A/initial']);
  assert.equal(f.location.state.workspaceHistoryIndex, 8, 'fallback closes UI without popping unrelated history');
  assert.equal(f.window.location.search.includes('space-new'), true);
  await f.close();
  assert.equal(f.returns.length, 1);
});

test('explicit return cannot reopen a pending list from a stale account scope', async t => {
  const f = await navigationFixture(); t.after(() => f.unmount());
  await f.open();
  await f.scope('account-B:bom-A');
  await f.close();
  assert.equal(f.returns.length, 0);
  assert.equal(f.location.state.workspaceHistoryIndex, 8);
});

test('returning from AI restores the pending list category, search, alternate choice and scroll; a fresh open resets category/search', async t => {
  const f = await pendingFixture(); t.after(() => f.unmount());
  const search = () => f.root.root.findByProps({ 'aria-label': '搜尋待處理料' });
  const tabs = () => f.root.root.findAll(node => node.type === 'button' && node.props.role === 'tab');
  await act(async () => {
    search().props.onChange({ target: { value: 'QA-MPN-IC' } });
    tabs().find(node => text(node).startsWith('IC')).props.onClick();
    f.root.root.findAll(node => node.type === 'stub' && node.props['data-testid'] === 'pending-include-alternates')[0].props.onClick();
  });
  await act(async () => {
    f.root.root.findByProps({ 'data-testid': 'pending-materials-list' }).props.onScroll({ currentTarget: { scrollTop: 340 } });
    f.root.root.findAll(node => node.type === 'stub' && node.props['data-testid'] === 'pending-spec-fill-button')[0].props.onClick();
  });
  assert.equal(f.opened.length, 1);
  await f.update({ open: false });
  f.list.scrollTop = 0;
  await f.update({ open: true, restoreView: true });
  assert.equal(search().props.value, 'QA-MPN-IC');
  assert.ok(text(tabs().find(node => node.props['aria-selected'])).startsWith('IC'));
  assert.equal(f.root.root.findAll(node => node.type === 'stub' && node.props['data-testid'] === 'pending-include-alternates')[0].props['aria-pressed'], true);
  assert.equal(f.list.scrollTop, 340);
  await f.update({ open: false });
  await f.update({ open: true, restoreView: false });
  assert.equal(search().props.value, '');
  assert.ok(text(tabs().find(node => node.props['aria-selected'])).startsWith('全部'));
});

test('returning to the pending list and reopening the same AI task retains photos, SPEC, results and follow-up draft', async t => {
  const f = await specFixture(); t.after(() => f.unmount());
  await f.prepare(); await f.start(); await f.answer(0);
  await f.ask('Preserve this unfinished question');
  await f.setOpen(false); await f.setOpen(true);
  assert.equal(f.root.root.findAllByProps({ 'aria-label': '依照片填表結果' }).length, 1);
  assert.equal(f.root.root.findByProps({ 'aria-label': '接續提問' }).props.value, 'Preserve this unfinished question');
  assert.ok(f.button('查看第 1 次結果'));
  await f.send();
  assert.equal(f.calls.length, 1, 'composer chat does not regenerate an existing table');
  assert.equal(f.questions.length, 1);
  assert.equal(f.questions[0].photos[0].name, 'form.png');
  assert.equal(f.questions[0].sources[0].name, '1.pdf');
  assert.equal(f.questions[0].history.length, 1);
  assert.equal(f.questions[0].history[0].tables[0].rows[0][0].value, '1.20 V');
});

test('the first screen can answer questions from a selected SPEC without requiring a template photo', async t => {
  const f = await specFixture(); t.after(() => f.unmount());
  assert.equal(f.root.root.findAllByProps({ 'aria-label': '接續提問' }).length > 0, true);
  await f.ask('What is the operating voltage?');
  assert.equal(f.button('送出問題').props.disabled, true, 'a question needs an explicitly selected SPEC');
  await act(async () => { f.root.root.findAllByType('input').find(node => node.props.type === 'checkbox').props.onChange({ target: { checked: true } }); });
  await f.ask('What is the operating voltage?');
  assert.equal(f.button('送出問題').props.disabled, false);
  await act(async () => { f.button('送出問題').props.onClick(); });
  assert.equal(f.calls.length, 0, 'SPEC questions must not force photo-table regeneration');
  assert.equal(f.questions.length, 1);
  assert.equal(f.questions[0].question, 'What is the operating voltage?');
  assert.equal(f.questions[0].part.manufacturerPartNumber, 'QA-MPN-1');
  assert.equal(f.questions[0].photos.length, 0);
  assert.equal(f.questions[0].sources[0].name, '1.pdf');
  await f.answerQuestion(0);
  assert.match(JSON.stringify(f.root.toJSON()), /Synthetic grounded answer 1: 1.20 V/);
  assert.equal(f.root.root.findAllByProps({ 'aria-label': '依照片填表結果' }).length, 0);
  const citation = f.root.root.findAll(node => node.type === 'button' && node.props.className === 'spec-fill-citation')[0];
  assert.ok(citation, 'a SPEC answer must expose its page and quoted source');
  await act(async () => { citation.props.onClick(); });
  assert.match(JSON.stringify(f.root.toJSON()), /Synthetic operating voltage 1.20 V/);
  await f.ask('Keep this SPEC question draft');
  await f.setOpen(false); await f.setOpen(true);
  assert.match(JSON.stringify(f.root.toJSON()), /Synthetic grounded answer 1: 1.20 V/);
  assert.equal(f.root.root.findByProps({ 'aria-label': '接續提問' }).props.value, 'Keep this SPEC question draft');
  await f.send();
  assert.equal(f.questions.length, 2);
  assert.equal(f.questions[1].history.length, 1);
  assert.equal(f.questions[1].history[0].reply, 'Synthetic grounded answer 1: 1.20 V');
});

test('leaving AI aborts an in-flight follow-up without deleting the previous result or accepting its late reply', async t => {
  const f = await specFixture(); t.after(() => f.unmount());
  await f.prepare(); await f.start(); await f.answer(0);
  await f.ask('Pending follow-up'); await f.send();
  await f.setOpen(false);
  assert.equal(f.questions[0].signal.aborted, true);
  await f.answerQuestion(0, 'Late discarded result');
  await f.setOpen(true);
  assert.equal(f.root.root.findAllByProps({ 'aria-label': '依照片填表結果' }).length, 1);
  assert.match(JSON.stringify(f.root.toJSON()), /Initial result/);
  assert.doesNotMatch(JSON.stringify(f.root.toJSON()), /Late discarded result/);
  assert.equal(f.root.root.findByProps({ 'aria-label': '接續提問' }).props.value, 'Pending follow-up');
});

test('explicit refill appends a table turn while retaining previous chat, original photos and SPEC', async t => {
  const f = await specFixture(); t.after(() => f.unmount());
  await f.prepare(); await f.start(); await f.answer(0);
  await f.ask('Explain the unit'); await f.send(); await f.answerQuestion(0);
  await f.ask('Use this explanation in the table');
  await act(async () => { f.button('依問題更新表格').props.onClick(); });
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].history.length, 2);
  assert.equal(f.calls[1].history[1].tables.length, 0);
  assert.equal(f.calls[1].photos.length, 1);
  assert.equal(f.calls[1].sources.length, 1);
  await f.answer(1, 'Explicitly updated table');
  assert.ok(f.button('查看第 1 次結果'));
  assert.ok(f.button('查看第 3 次結果'));
  assert.match(JSON.stringify(f.root.toJSON()), /Explicitly updated table/);
});

test('photo-backed chat keeps the existing filled table and its original model attribution when exporting', async t => {
  const f = await specFixture(); t.after(() => f.unmount());
  await f.prepare(); await f.start(); await f.answer(0);
  await act(async () => {
    f.root.root.findAllByType('select').find(node => node.props.id?.endsWith('-model')).props.onChange({ target: { value: 'qa-model-2' } });
  });
  await f.ask('Explain where this voltage comes from'); await f.send(); await f.answerQuestion(0);
  assert.equal(f.calls.length, 1);
  assert.equal(f.questions[0].model.label, 'Synthetic second AI');
  assert.equal(f.questions[0].photos.length, 1);
  assert.equal(f.root.root.findByProps({ 'aria-label': '第 1 張填表結果' }).findByType('h3').props.children, 'Initial result');
  assert.ok(f.button('查看第 1 次結果'));
  assert.equal(f.button('查看第 2 次結果'), undefined);
  await act(async () => { f.button('下載 Excel').props.onClick(); });
  assert.equal(f.exports.length, 1);
  assert.equal(f.exports[0].tables[0].title, 'Initial result');
  assert.equal(f.exports[0].model, 'Synthetic AI', 'chat model changes cannot rewrite the filled table author');
  assert.equal(f.downloads.length, 1);
  await f.ask('Update the table with this explanation');
  await act(async () => { f.button('依問題更新表格').props.onClick(); });
  await f.answer(1, 'Second-model filled table');
  await act(async () => { f.button('下載 Excel').props.onClick(); });
  assert.equal(f.exports[1].tables[0].title, 'Second-model filled table');
  assert.equal(f.exports[1].model, 'Synthetic second AI');
  await act(async () => { f.button('查看第 1 次結果').props.onClick(); });
  await act(async () => { f.button('下載 Excel').props.onClick(); });
  assert.equal(f.exports[2].tables[0].title, 'Initial result');
  assert.equal(f.exports[2].model, 'Synthetic AI', 'reopening a historical table restores its original model attribution');
});
