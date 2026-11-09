import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const require = createRequire(import.meta.url);
const { React, create, act, loader, browser } = require("../../../tests/support/renderHarness.cjs");
const content = (title, patch = {}) => ({ title, reason: "改善負載", description: "調整接法", refs: "R1", net: "VCC", page: "2", owner: "工程師甲", images: [], ...patch });
const item = (id, number, status, title, patch) => ({ id, setId: "set", number, status, content: content(title, patch), revision: 3, createdAt: "2026-11-09T01:00:00Z", updatedAt: "2026-11-09T02:00:00Z", createdBy: "a", updatedBy: "a" });
// Rendered text of a test instance; props.children would drag React's own circular bookkeeping into JSON.
const textOf = node => typeof node === "string" ? node : node.children.map(textOf).join("");
const picture = (id, side, name = `${id}.png`) => ({ id, name, path: `set/one/${id}.png`, mime: "image/png", size: 10, width: 640, height: 360, side, caption: "", marks: [], uploadedAt: "2026-11-09T01:00:00Z", uploadedBy: "a" });
function mount(overrides = {}, search = "?workspace=material-requests&project=A", props = {}) {
  const calls = [], window = browser(); window.location.search = search;
  const first = item("one", 1, "in_review", "修改降壓線路"), second = item("two", 2, "draft", "調整 LED 阻值");
  const set = { id: "set", seriesId: "board", workspaceId: "bom", title: "Rev B", fromLabel: "V1", toLabel: "V2", projectId: "A", createdAt: first.createdAt, updatedAt: first.updatedAt, createdBy: "a" };
  const event = { id: "event", itemId: first.id, setId: "set", type: "submitted", actorId: "a", actorName: "工程師甲", revision: 2, note: "請確認", createdAt: first.updatedAt };
  const done = name => async (...args) => { calls.push([name, ...args]); };
  // The PDF pane is replaced by a stub here; its own behaviour is tested with a real PDF in the browser.
  const origins = new WeakMap();
  const pdfs = { documents: [], show: (documentId, page) => { calls.push(["show", documentId, page]); return documentId !== "gone"; }, upload: done("uploadPdf") };
  const model = { sets: [set], selectedSetId: "set", items: [first, second], selectedItemId: first.id, selectedItem: first, draft: first.content, events: [event], loading: false, saving: false, uploading: false, switching: false, dirty: false, conflict: false, error: "", saveError: "", uploadProgress: { completed: 0, total: 0 }, uploadFailures: [], uploadWarnings: [], selectSet: done("set"), selectItem: done("select"), createSet: done("createSet"), createItem: done("createItem"), updateDraft: patch => calls.push(["draft", patch]), saveDraft: done("save"), review: done("review"), addImages: done("images"), retryUploads: done("retry"), dismissUploadFailures: () => calls.push(["dismiss"]), reload: done("reload"), adoptRemote: () => calls.push(["adopt"]), saveMyRevision: done("mine"), loadEvent: async id => { calls.push(["event", id]); return { ...event, snapshot: { ...first, revision: 2, content: content("歷史線路內容") } }; }, ...overrides };
  const { CircuitChangesDialog } = loader({ window, globals: { Error }, mocks: { "./CircuitPdfPanel": { CircuitPdfPanel: props => React.createElement("stub", { "data-testid": "circuit-pdf-panel", pdfprops: props }) }, "./files": { circuitImageOrigins: origins, CIRCUIT_IMAGE_URL_REUSE_MS: 1500000, createCircuitImageUrls: async () => ({}), downloadCircuitImage: done("download") }, "./export": { exportCircuitChangeList: done("export") }, "./CircuitChangeImageViewer": { CircuitChangeImageViewer: () => null } } })("src/components/circuit-changes/CircuitChangesDialog.tsx");
  const all = { open: true, onOpenChange: value => calls.push(["open", value]), context: { seriesId: "board", workspaceId: "bom", workspaceName: "Board.xlsx", versionLabel: "V1" }, canEdit: true, model, pdfs, ...props };
  let root; act(() => { root = create(React.createElement(CircuitChangesDialog, all)); });
  const text = () => JSON.stringify(root.toJSON());
  const button = label => root.root.findAll(node => node.type === "stub" && typeof node.props.onClick === "function" && node.props.children === label)[0];
  const pane = side => root.root.findByProps({ "data-side": side, className: "circuit-image-column" });
  const update = patch => act(() => root.update(React.createElement(CircuitChangesDialog, { ...all, model: { ...model, ...patch } })));
  return { root, model, props: all, calls, window, text, button, pane, update, origins };
}
test("filters stay visible, reversible and scoped to their URL keys", async () => {
  const { root, window, calls } = mount({}, "?workspace=material-requests&project=A&circuitStatus=draft");
  try {
    assert.equal(root.root.findAllByProps({ "data-testid": "circuit-change-item" }).length, 1);
    assert.equal(root.root.findByProps({ "aria-label": "移除篩選：狀態：編輯中" }).props.children[0], "狀態：編輯中");
    act(() => root.root.findByProps({ "aria-label": "移除篩選：狀態：編輯中" }).props.onClick());
    assert.equal(root.root.findAllByProps({ "data-testid": "circuit-change-item" }).length, 2);
    assert.equal(window.location.search, "?workspace=material-requests&project=A");
    act(() => root.root.findByProps({ "aria-label": "搜尋線路修改" }).props.onChange({ target: { value: "不存在" } }));
    assert.equal(root.root.findAllByProps({ "data-testid": "circuit-change-item" }).length, 0);
    assert.ok(JSON.stringify(root.toJSON()).includes("目前篩選條件沒有符合的修改項目"));
    assert.equal(window.location.search, "?workspace=material-requests&project=A&circuitQuery=%E4%B8%8D%E5%AD%98%E5%9C%A8");
    // Closing takes the dialog's own keys out of the address bar so they cannot narrow another board's list later.
    await act(async () => { root.root.findByProps({ "aria-label": "關閉線路修改" }).props.onClick(); });
    assert.equal(window.location.search, "?workspace=material-requests&project=A");
    assert.ok(calls.some(call => call[0] === "open" && call[1] === false));
  } finally { act(() => root.unmount()); }
});
test("the filters sit directly above the list, and creating a change shows its row by clearing them", async () => {
  const { root, calls } = mount({}, "?workspace=material-requests&circuitStatus=approved");
  try {
    const panel = root.root.findByProps({ className: "circuit-list-panel" });
    const order = panel.findAll(node => ["circuit-new-item", "circuit-filter-bar", "circuit-active-filters", "circuit-item-list"].includes(node.props.className)).map(node => node.props.className);
    assert.deepEqual([...new Set(order)], ["circuit-new-item", "circuit-filter-bar", "circuit-active-filters", "circuit-item-list"]);
    await act(async () => { panel.findByProps({ className: "circuit-new-item" }).props.onClick(); });
    assert.ok(calls.some(call => call[0] === "createItem"));
    assert.equal(root.root.findAllByProps({ "data-testid": "circuit-active-filters" }).length, 0);
    assert.equal(root.root.findAllByProps({ "data-testid": "circuit-change-item" }).length, 2);
  } finally { act(() => root.unmount()); }
});
test("review validates return reason, retains per-item action and opens immutable history", async () => {
  const { root, calls, button, text } = mount();
  try {
    // The reason box sits with the decision buttons, not at the far end of the form.
    const bar = root.root.findByProps({ className: "circuit-review-bar" });
    assert.equal(bar.findAllByProps({ "aria-label": "Review 意見或退回原因" }, { deep: false }).length, 1);
    await act(async () => { button("退回補充").props.onClick(); });
    assert.equal(calls.filter(call => call[0] === "review").length, 0);
    assert.ok(text().includes("請先填寫退回原因"));
    act(() => root.root.findByProps({ "aria-label": "Review 意見或退回原因" }).props.onChange({ target: { value: "請補修改後圖" } }));
    await act(async () => { button("退回補充").props.onClick(); });
    assert.deepEqual(calls.find(call => call[0] === "review"), ["review", "request_changes", "請補修改後圖"]);
    act(() => root.root.findAll(node => node.type === "stub" && node.props["aria-pressed"] === false && Array.isArray(node.props.children) && node.props.children[0] === "歷史 ")[0].props.onClick());
    await act(async () => { button("查看此修訂").props.onClick(); });
    assert.equal(root.root.findByProps({ "aria-label": "修改標題" }).props.value, "歷史線路內容");
    assert.equal(root.root.findByProps({ "aria-label": "修改標題" }).props.disabled, true);
    assert.equal(calls.filter(call => call[0] === "draft").length, 0);
  } finally { act(() => root.unmount()); }
});
test("a returned change shows its reason first and cannot be sent until the required content is there", async () => {
  const returned = item("one", 1, "needs_changes", "", { description: "" });
  const events = [{ id: "back", itemId: "one", setId: "set", type: "request_changes", actorId: "b", actorName: "審查主管", revision: 3, note: "請補量測波形", createdAt: returned.updatedAt }];
  const { root, calls, button, text } = mount({ items: [returned], selectedItem: returned, draft: returned.content, events });
  try {
    const reason = root.root.findByProps({ className: "circuit-returned" });
    assert.ok(textOf(reason).includes("請補量測波形") && textOf(reason).includes("審查主管"));
    assert.ok(text().includes("送出前還缺：") && text().includes("修改標題") && text().includes("修改說明或修改後圖片"));
    assert.equal(button("送出 Review").props.disabled, true);
    await act(async () => { button("送出 Review").props.onClick(); });
    assert.equal(calls.filter(call => call[0] === "review").length, 0, "an incomplete change never reaches the server");
  } finally { act(() => root.unmount()); }
});
test("a pasted screenshot goes to the marked pane, pasted cell text stays text, and a failed close keeps the draft", async () => {
  const { root, calls, pane, text, button } = mount({ dirty: true, saveDraft: async () => { throw new Error("儲存失敗，草稿保留"); } });
  try {
    assert.equal(button("不儲存，直接關閉"), undefined);
    const files = Array.from({ length: 12 }, (_, id) => ({ name: "image.png", type: "image/png", id })); let prevented = false;
    const dialog = root.root.findByProps({ "data-testid": "circuit-changes-dialog" });
    assert.equal(pane("before").props["data-active"], true, "a change without a before picture takes the first paste as before");
    await act(async () => { dialog.props.onPaste({ clipboardData: { files }, preventDefault() { prevented = true; } }); });
    assert.ok(prevented);
    const upload = calls.find(call => call[0] === "images"); assert.equal(upload[1].length, 12); assert.equal(upload[2], "before");
    // Clicking the other pane moves the target, and the tag that says so moves with it.
    act(() => pane("after").props.onPointerDown());
    assert.equal(pane("after").props["data-active"], true);
    assert.ok(textOf(pane("after")).includes("貼上會加到這裡") && !textOf(pane("before")).includes("貼上會加到這裡"));
    await act(async () => { dialog.props.onPaste({ clipboardData: { files: files.slice(0, 1) }, preventDefault() {} }); });
    assert.equal(calls.filter(call => call[0] === "images")[1][2], "after");
    // Excel puts a picture of the copied cells beside their text; in a text field the text must win.
    let hijacked = false; const before = calls.filter(call => call[0] === "images").length;
    await act(async () => { dialog.props.onPaste({ target: { closest: selector => selector.includes("textarea") ? {} : null }, clipboardData: { files: files.slice(0, 1), getData: () => "R2301 10K -> 4.7K" }, preventDefault() { hijacked = true; } }); });
    assert.equal(hijacked, false); assert.equal(calls.filter(call => call[0] === "images").length, before);
    await act(async () => { root.root.findByProps({ "aria-label": "關閉線路修改" }).props.onClick(); });
    assert.equal(calls.some(call => call[0] === "open" && call[1] === false), false);
    assert.ok(text().includes("儲存失敗，草稿保留"));
    // A save that keeps failing must not hold the user in the dialog: the way out is offered only after a close was refused.
    act(() => button("不儲存，直接關閉").props.onClick());
    assert.equal(calls.some(call => call[0] === "open" && call[1] === false), true);
  } finally { act(() => root.unmount()); }
});
test("a file dropped on a pane is added to that pane, and a removed picture can be put back where it was", async () => {
  const withImages = item("one", 1, "draft", "含圖片", { images: [picture("b1", "before"), picture("a1", "after"), picture("a2", "after")] });
  const { root, calls, pane, update } = mount({ items: [withImages], selectedItem: withImages, draft: withImages.content });
  try {
    assert.equal(pane("after").props["data-active"], true, "with a before picture present the next paste belongs to after");
    const file = { name: "drop.png", type: "image/png" }; let stopped = false;
    const drag = { dataTransfer: { types: ["Files"], files: [file] }, preventDefault() {}, stopPropagation() { stopped = true; } };
    await act(async () => { pane("before").props.onDrop(drag); });
    assert.ok(stopped, "the dialog-wide drop handler must not add the same file a second time");
    const dropped = calls.find(call => call[0] === "images");
    assert.equal(dropped[1].length, 1); assert.equal(dropped[1][0], file); assert.equal(dropped[2], "before", "not the pane that happened to be the paste target");
    assert.equal(pane("before").props["data-image-count"], 1); assert.equal(pane("after").props["data-image-count"], 2);
    act(() => root.root.findByProps({ "aria-label": "移除圖片 a1.png" }).props.onClick());
    const removal = calls.find(call => call[0] === "draft")[1];
    assert.equal(removal.images.map(image => image.id).join(), "b1,a2");
    update({ draft: { ...withImages.content, ...removal } });
    const undo = root.root.findByProps({ className: "circuit-upload-undo" });
    assert.ok(textOf(undo).includes("已移除 a1.png"));
    act(() => undo.findAll(node => node.type === "stub" && node.props.children === "復原")[0].props.onClick());
    assert.equal(calls.filter(call => call[0] === "draft")[1][1].images.map(image => image.id).join(), "b1,a1,a2", "restored at its old position, not appended");
  } finally { act(() => root.unmount()); }
});
test("with nothing recorded an editor gets the form straight away and a viewer gets an honest empty state", () => {
  const blank = { ...item("new", 1, "draft", "", { reason: "", description: "", refs: "", net: "", page: "" }), revision: 0 };
  const editor = mount({ sets: [], selectedSetId: "", items: [], selectedItemId: blank.id, selectedItem: blank, draft: blank.content, events: [] });
  try {
    assert.equal(editor.root.root.findAllByProps({ "data-testid": "circuit-change-item" }).length, 0);
    assert.equal(editor.root.root.findAllByProps({ "aria-label": "修改標題" }, { deep: false }).length, 1, "the form is there on first open");
    assert.equal(editor.pane("before").findAllByProps({ "aria-label": "加入修改前圖片" }).length, 1, "and so is a visible place to add pictures");
    assert.equal(editor.root.root.findAllByProps({ "data-testid": "circuit-change-unsaved" }).length, 1);
    assert.ok(editor.text().includes("V1 → V2 線路修改") && editor.text().includes("記錄第一項時自動建立"));
    assert.ok(editor.text().includes("輸入後自動儲存"));
    assert.equal(editor.root.root.findAll(node => node.type === "stub" && typeof node.props.onClick === "function" && Array.isArray(node.props.children) && node.props.children.includes("新增修改")).length, 1, "one way to start a change");
  } finally { act(() => editor.root.unmount()); }
  const viewer = mount({ sets: [], selectedSetId: "", items: [], selectedItemId: "", selectedItem: null, draft: null, events: [] }, undefined, { canEdit: false });
  try {
    assert.ok(viewer.text().includes("這塊板子還沒有線路修改紀錄") && viewer.text().includes("檢視權限"));
    assert.equal(viewer.root.root.findAllByProps({ className: "circuit-new-item" }).length, 0, "a viewer is not offered an action that would be refused");
    assert.equal(viewer.root.root.findAllByProps({ "aria-label": "修改標題" }).length, 0);
  } finally { act(() => viewer.root.unmount()); }
});
test("a change that waits for review or is approved is locked until the user chooses to edit it", async () => {
  const view = mount();
  try {
    const titleField = () => view.root.root.findByProps({ "aria-label": "修改標題" });
    assert.equal(titleField().props.disabled, true, "a stray keystroke from the reviewer must not withdraw the review");
    assert.ok(textOf(view.root.root.findByProps({ className: "circuit-locked" })).includes("正在等待 Review"));
    assert.equal(view.pane("before").props["data-active"], false);
    await act(async () => { view.root.root.findByProps({ "data-testid": "circuit-changes-dialog" }).props.onPaste({ clipboardData: { files: [{ name: "a.png", type: "image/png" }] }, preventDefault() {} }); });
    assert.equal(view.calls.filter(call => call[0] === "images").length, 0);
    assert.ok(view.text().includes("內容已鎖定"));
    assert.equal(view.root.root.findAllByProps({ className: "circuit-review-bar" }).length, 1, "reviewing itself stays available");
    act(() => view.button("修改內容").props.onClick());
    assert.equal(titleField().props.disabled, false);
    assert.equal(view.root.root.findAllByProps({ className: "circuit-locked" }).length, 0);
    assert.ok(view.text().includes("會撤回送審"));
    act(() => titleField().props.onChange({ target: { value: "改標題" } }));
    assert.equal(view.calls.filter(call => call[0] === "draft").length, 1);
  } finally { act(() => view.root.unmount()); }
  const approved = item("one", 1, "approved", "已確認的修改");
  const done = mount({ items: [approved], selectedItem: approved, draft: approved.content });
  try {
    assert.ok(textOf(done.root.root.findByProps({ className: "circuit-locked" })).includes("已確認"));
    assert.equal(done.root.root.findByProps({ "aria-label": "修改說明" }).props.disabled, true);
    act(() => done.button("修改內容").props.onClick());
    assert.equal(done.root.root.findByProps({ "aria-label": "修改說明" }).props.disabled, false);
    assert.ok(done.text().includes("建立需要重新 Review 的修訂"));
  } finally { act(() => done.root.unmount()); }
});
test("once the before picture is in, the next paste belongs to after", async () => {
  const draft = item("one", 1, "draft", "只有文字");
  let view;
  view = mount({ items: [draft], selectedItem: draft, draft: draft.content, addImages: async (files, side) => {
    view.calls.push(["images", files, side]);
    view.update({ items: [draft], selectedItem: draft, draft: { ...draft.content, images: [picture("b1", side)] } });
  } });
  try {
    const dialog = view.root.root.findByProps({ "data-testid": "circuit-changes-dialog" });
    assert.equal(view.pane("before").props["data-active"], true);
    await act(async () => { dialog.props.onPaste({ clipboardData: { files: [{ name: "before.png", type: "image/png" }] }, preventDefault() {} }); });
    assert.equal(view.pane("before").props["data-image-count"], 1);
    assert.equal(view.pane("after").props["data-active"], true, "the tag moves to 修改後 without a click");
    assert.ok(textOf(view.pane("after")).includes("貼上會加到這裡"));
    await act(async () => { dialog.props.onPaste({ clipboardData: { files: [{ name: "after.png", type: "image/png" }] }, preventDefault() {} }); });
    assert.equal(view.calls.filter(call => call[0] === "images")[1][2], "after");
  } finally { act(() => view.root.unmount()); }
});
test("a framed PDF area goes into the change on screen: its source is kept, sides stay apart, and an empty 頁碼 is filled", async () => {
  const draft = item("two", 2, "draft", "調整 LED 阻值", { page: "" });
  const view = mount({ selectedItemId: "two", selectedItem: draft, draft: draft.content });
  try {
    const pane = view.root.root.findByProps({ "data-testid": "circuit-pdf-panel" }).props.pdfprops;
    assert.equal(pane.captureBlocked, "", "an editable change accepts framed areas");
    assert.equal(pane.targetLabel, "#002 調整 LED 阻值");
    const file = name => new File(["png"], name, { type: "image/png" });
    const source = (date, page) => ({ kind: "pdf", documentId: date, name: `${date}.pdf`, date, label: "", page, rect: { x: .1, y: .1, width: .2, height: .2 } });
    const before = file("before.png"), after = file("after.png");
    await act(async () => { await pane.onCapture([{ side: "before", file: before, page: 4, caption: "舊版第 4 頁", source: source("2026-11-08", 4) }, { side: "after", file: after, page: 5, caption: "新版第 5 頁", source: source("2026-11-09", 5) }]); });
    assert.deepEqual(view.calls.filter(call => call[0] === "draft").map(call => call[1].page), ["5"], "頁碼 takes the page of the after picture");
    const added = view.calls.filter(call => call[0] === "images");
    assert.equal(added.length, 2);
    assert.equal(added[0][2], "before"); assert.equal(added[0][1][0], before);
    assert.equal(added[1][2], "after"); assert.equal(added[1][1][0], after);
    assert.equal(view.origins.get(before).source.date, "2026-11-08"); assert.equal(view.origins.get(before).caption, "舊版第 4 頁");
    assert.equal(view.origins.get(after).source.page, 5, "each picture carries its own PDF page into the upload");
  } finally { act(() => view.root.unmount()); }
});

test("a written 頁碼 is left alone, and a locked change or an old revision refuses framed areas with the reason", async () => {
  const draft = item("two", 2, "draft", "調整 LED 阻值", { page: "P12-13" });
  const editable = mount({ selectedItemId: "two", selectedItem: draft, draft: draft.content });
  try {
    const pane = editable.root.root.findByProps({ "data-testid": "circuit-pdf-panel" }).props.pdfprops;
    await act(async () => { await pane.onCapture([{ side: "after", file: new File(["png"], "a.png", { type: "image/png" }), page: 5, caption: "", source: { kind: "pdf", documentId: "d", name: "d.pdf", date: "2026-11-09", label: "", page: 5, rect: { x: 0, y: 0, width: .5, height: .5 } } }]); });
    assert.equal(editable.calls.filter(call => call[0] === "draft").length, 0, "the engineer's own 頁碼 is not replaced");
    assert.equal(editable.calls.filter(call => call[0] === "images").length, 1);
  } finally { act(() => editable.root.unmount()); }
  const locked = mount();
  try {
    const pane = locked.root.root.findByProps({ "data-testid": "circuit-pdf-panel" }).props.pdfprops;
    assert.match(pane.captureBlocked, /已鎖定/, "a change waiting for review is locked against framed areas too");
    await assert.rejects(async () => { await act(async () => { await pane.onCapture([{ side: "after", file: new File(["png"], "a.png"), page: 1, caption: "", source: {} }]); }); }, /已鎖定/);
    assert.equal(locked.calls.filter(call => call[0] === "images").length, 0);
  } finally { act(() => locked.root.unmount()); }
  const viewer = mount({}, undefined, { canEdit: false });
  try {
    assert.match(viewer.root.root.findByProps({ "data-testid": "circuit-pdf-panel" }).props.pdfprops.captureBlocked, /檢視權限/);
  } finally { act(() => viewer.root.unmount()); }
});

test("a PDF dropped or pasted on the form goes to the PDF pane instead of being refused as a picture", async () => {
  const draft = item("two", 2, "draft", "調整 LED 阻值");
  const view = mount({ selectedItemId: "two", selectedItem: draft, draft: draft.content });
  try {
    const dialog = view.root.root.findByProps({ "data-testid": "circuit-changes-dialog" });
    const pdf = new File(["%PDF-1.4"], "Vera_SCH_20261109.pdf", { type: "application/pdf" });
    await act(async () => { dialog.props.onPaste({ clipboardData: { files: [pdf] }, preventDefault() {} }); });
    await act(async () => { view.pane("before").props.onDrop({ dataTransfer: { types: ["Files"], files: [pdf, new File(["png"], "shot.png", { type: "image/png" })] }, preventDefault() {}, stopPropagation() {} }); });
    const uploads = view.calls.filter(call => call[0] === "uploadPdf");
    assert.equal(uploads.length, 2, "both PDFs went to the PDF pane");
    assert.equal(uploads[0][1], pdf);
    const images = view.calls.filter(call => call[0] === "images");
    assert.equal(images.length, 1, "the picture dropped with it is still added as a picture");
    assert.equal(images[0][1].length, 1); assert.equal(images[0][1][0].name, "shot.png");
  } finally { act(() => view.root.unmount()); }
});

test("a picture framed on a PDF opens its page; a picture from a removed version says so", async () => {
  const framed = { ...picture("framed", "after"), source: { kind: "pdf", documentId: "v9", name: "v9.pdf", date: "2026-11-09", label: "", page: 7, rect: { x: 0, y: 0, width: 1, height: 1 } } };
  const gone = { ...picture("gone", "before"), source: { ...framed.source, documentId: "gone", date: "2026-11-01" } };
  const draft = item("two", 2, "draft", "調整 LED 阻值", { images: [gone, framed] });
  const view = mount({ selectedItemId: "two", selectedItem: draft, draft: draft.content });
  try {
    const button = label => view.root.root.findAll(node => node.props["aria-label"] === label && typeof node.props.onClick === "function")[0];
    await act(async () => { button("到 PDF 第 7 頁（2026-11-09）").props.onClick(); });
    assert.deepEqual(view.calls.filter(call => call[0] === "show").map(call => call.slice(1)), [["v9", 7]]);
    await act(async () => { button("到 PDF 第 7 頁（2026-11-01）").props.onClick(); });
    assert.ok(view.text().includes("已從清單移除"));
  } finally { act(() => view.root.unmount()); }
});
