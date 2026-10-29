import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { React, create, act, loader } = require("../../../tests/support/renderHarness.cjs");

function findJsonByTestId(node, testId) {
  if (!node || typeof node !== "object") return null;
  if (node.props?.["data-testid"] === testId) return node;
  for (const child of Array.isArray(node.children) ? node.children : []) {
    const match = findJsonByTestId(child, testId);
    if (match) return match;
  }
  return null;
}

function mountEditor(overrides = {}) {
  const readers = [];
  class FileReader {
    readAsDataURL() { readers.push(this); }
    finish() { this.result = "data:image/png;base64,new"; this.onload(); }
  }
  const load = loader({ globals: { FileReader, File } });
  const { MaterialTrackingEditor } = load("src/components/material-requests/MaterialTrackingEditor.tsx");
  const { createMaterialTrackingDraft } = load("src/components/material-requests/materialTrackingDraft.ts");
  let record = { id: "record-A", requestTicket: "A-1", trackingStatus: "處理中", trackingNote: "原有備註", ...overrides };
  let draft = createMaterialTrackingDraft(record);
  let root;
  let disabled = false;
  const render = () => React.createElement(MaterialTrackingEditor, {
    record, draft, disabled,
    onDraftChange: (next) => { draft = next; root.update(render()); },
  });
  act(() => { root = create(render()); });
  return {
    root, readers,
    draft: () => draft,
    readImage() { act(() => root.root.findByProps({ type: "file" }).props.onChange({ target: { files: [new File(["image"], "screen.png", { type: "image/png" })], value: "" } })); },
    replaceRecord() { act(() => { record = { id: "record-B", requestTicket: "B-2" }; draft = createMaterialTrackingDraft(record); root.update(render()); }); },
    replaceSession() { act(() => { draft = createMaterialTrackingDraft(record); root.update(render()); }); },
    disable() { act(() => { disabled = true; root.update(render()); }); },
  };
}

test("image reads remain pending and keep notes typed while they load", async () => {
  const editor = mountEditor();
  editor.readImage();
  assert.equal(editor.draft().pendingImageReads, 1);
  act(() => editor.root.root.findAllByProps({ placeholder: "這次做了什麼、卡在哪、下一步" }).find((node) => node.type === "stub").props.onChange({ target: { value: "讀圖時繼續填寫" } }));
  await act(async () => editor.readers[0].finish());
  assert.equal(editor.draft().pendingImageReads, 0);
  assert.equal(editor.draft().note, "讀圖時繼續填寫");
  assert.equal(editor.draft().images.length, 1);
  act(() => editor.root.unmount());
});

test("saved status and history show explicit status, author, time and request information", () => {
  const editor = mountEditor({ trackingHistory: [{ id: 'past', status: '新增追蹤', createdAt: '2026-10-27T02:13:40Z', createdBy: 'CE', requestInfo: '已發信', note: '等候廠商回覆' }] });
  const text = JSON.stringify(editor.root.toJSON());
  assert.match(text, /目前狀態/);
  assert.match(text, /最新紀錄/);
  assert.match(text, /更新人/);
  assert.match(text, /更新時間/);
  assert.match(text, /已發信/);
  const badges = editor.root.root.findAllByProps({ 'data-testid': 'tracking-status-badge' }).filter(node => node.type === 'span');
  assert.ok(badges.some(node => node.props['data-status'] === '新增追蹤'));
  act(() => editor.root.unmount());
});

test("current summary shows only request information while the full note remains in history", () => {
  const editor = mountEditor({
    requestTicket: 'REQ-88',
    requestUrl: 'https://example.invalid/request/88',
    trackingHistory: [{
      id: 'latest',
      status: '已發信',
      createdAt: '2026-10-29T06:37:54Z',
      createdBy: 'Vincent',
      requestInfo: '已申請 REALTEK 帳號，等待授權',
      note: '此內容只應出現在歷史紀錄',
      requestTicket: 'REQ-88',
      requestUrl: 'https://example.invalid/request/88',
    }],
  });
  const rendered = editor.root.toJSON();
  const summaryText = JSON.stringify(findJsonByTestId(rendered, 'tracking-current-summary'));
  assert.match(summaryText, /申請狀態資訊/);
  assert.match(summaryText, /已申請 REALTEK 帳號.*等待授權/);
  assert.doesNotMatch(summaryText, /此內容只應出現在歷史紀錄/);
  assert.doesNotMatch(summaryText, /REQ-88/);
  const historyText = JSON.stringify(findJsonByTestId(rendered, 'tracking-history-panel'));
  assert.match(historyText, /此內容只應出現在歷史紀錄/);
  act(() => editor.root.unmount());
});

test("an unknown or negative status keeps its source wording instead of becoming completed", () => {
  const editor = mountEditor({ trackingHistory: [{ id: 'unknown', status: '未完成', createdAt: '', note: '' }] });
  const badges = editor.root.root.findAllByProps({ 'data-testid': 'tracking-status-badge' }).filter(node => node.type === 'span');
  assert.ok(badges.length > 0);
  assert.ok(badges.every(node => node.props['data-status'] === '未完成'));
  act(() => editor.root.unmount());
});

test("selecting a new status labels the draft as unsaved and leaves the saved summary unchanged", () => {
  const editor = mountEditor();
  act(() => editor.root.root.findAll(node => node.type === 'stub' && typeof node.props.onValueChange === 'function')[0].props.onValueChange('已完成'));
  assert.equal(editor.draft().status, '已完成');
  assert.match(JSON.stringify(editor.root.toJSON()), /尚未儲存/);
  const current = editor.root.root.findByProps({ 'data-testid': 'tracking-current-summary' });
  assert.equal(current.findAllByProps({ 'data-testid': 'tracking-status-badge' }).find(node => node.type === 'span').props['data-status'], '處理中');
  assert.equal(editor.root.root.findAllByType('details').length, 1);
  act(() => editor.root.unmount());
});

test("image reads from the old record or replaced account session never enter the next draft", async () => {
  for (const replacement of ["replaceRecord", "replaceSession"]) {
    const editor = mountEditor();
    editor.readImage();
    editor[replacement]();
    await act(async () => editor.readers[0].finish());
    assert.equal(editor.draft().images.length, 0);
    assert.equal(editor.draft().pendingImageReads, 0);
    act(() => editor.root.unmount());
  }
});

test("Ctrl+V adds a named screenshot and a failed read releases the save blocker", async () => {
  const editor = mountEditor();
  let prevented = false;
  act(() => editor.root.root.findByProps({ "data-testid": "material-tracking-editor" }).props.onPaste({
    preventDefault() { prevented = true; },
    clipboardData: { items: [{ kind: "file", type: "image/png", getAsFile: () => new File(["screen"], "image.png", { type: "image/png" }) }] },
  }));
  assert.equal(prevented, true);
  assert.equal(editor.draft().pendingImageReads, 1);
  await act(async () => editor.readers[0].finish());
  assert.match(editor.draft().images[0].name, /^clipboard-.*\.png$/);
  editor.readImage();
  await act(async () => editor.readers[1].onerror());
  assert.equal(editor.draft().pendingImageReads, 0);
  assert.equal(editor.draft().images.length, 1);
  assert.match(JSON.stringify(editor.root.toJSON()), /讀取失敗/);
  act(() => editor.root.unmount());
});

test("read-only tracking disables editing while the legacy history stays visible", () => {
  const editor = mountEditor();
  editor.disable();
  assert.equal(editor.root.root.findByType("fieldset").props.disabled, true);
  assert.equal(editor.root.root.findByProps({ type: "file" }).props.disabled, true);
  assert.equal(editor.root.root.findAllByType("details").length, 1);
  assert.match(JSON.stringify(editor.root.toJSON()), /原有備註/);
  editor.readImage();
  assert.equal(editor.readers.length, 0);
  act(() => editor.root.unmount());
});
