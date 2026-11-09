import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const require = createRequire(import.meta.url);
const { React, create, act, loader, browser } = require("../../../tests/support/renderHarness.cjs");
const content = title => ({ title, reason: "改善負載", description: "調整接法", refs: "R1", net: "VCC", page: "2", owner: "工程師甲", images: [] });
const item = (id, number, status, title) => ({ id, setId: "set", number, status, content: content(title), revision: 3, createdAt: "2026-11-09T01:00:00Z", updatedAt: "2026-11-09T02:00:00Z", createdBy: "a", updatedBy: "a" });
function mount(overrides = {}, search = "?workspace=material-requests&project=A") {
  const calls = [], window = browser(); window.location.search = search;
  const first = item("one", 1, "in_review", "修改降壓線路"), second = item("two", 2, "draft", "調整 LED 阻值");
  const set = { id: "set", seriesId: "board", workspaceId: "bom", title: "Rev B", fromLabel: "V1", toLabel: "V2", projectId: "A", createdAt: first.createdAt, updatedAt: first.updatedAt, createdBy: "a" };
  const event = { id: "event", itemId: first.id, setId: "set", type: "submitted", actorId: "a", actorName: "工程師甲", revision: 2, note: "請確認", createdAt: first.updatedAt };
  const done = name => async (...args) => { calls.push([name, ...args]); };
  const model = { sets: [set], selectedSetId: "set", items: [first, second], selectedItemId: first.id, selectedItem: first, draft: first.content, events: [event], loading: false, saving: false, uploading: false, dirty: false, conflict: false, error: "", saveError: "", uploadProgress: { completed: 0, total: 0 }, uploadFailures: [], uploadWarnings: [], selectSet: done("set"), selectItem: done("select"), createSet: done("createSet"), createItem: done("createItem"), updateDraft: patch => calls.push(["draft", patch]), saveDraft: done("save"), review: done("review"), addImages: done("images"), retryUploads: done("retry"), reload: done("reload"), adoptRemote: () => calls.push(["adopt"]), saveMyRevision: done("mine"), loadEvent: async id => { calls.push(["event", id]); return { ...event, snapshot: { ...first, revision: 2, content: content("歷史線路內容") } }; }, ...overrides };
  const { CircuitChangesDialog } = loader({ window, globals: { Error }, mocks: { "./files": { createCircuitImageUrls: async () => ({}), downloadCircuitImage: done("download") }, "./export": { exportCircuitChangeList: done("export") }, "./CircuitChangeImageViewer": { CircuitChangeImageViewer: () => null } } })("src/components/circuit-changes/CircuitChangesDialog.tsx");
  const props = { open: true, onOpenChange: value => calls.push(["open", value]), context: { seriesId: "board", workspaceId: "bom", workspaceName: "Board.xlsx", versionLabel: "V1" }, canEdit: true, model };
  let root; act(() => { root = create(React.createElement(CircuitChangesDialog, props)); });
  return { root, model, props, calls, window };
}
test("filters stay visible, reversible and scoped to their URL keys", () => {
  const { root, window } = mount({}, "?workspace=material-requests&project=A&circuitStatus=draft");
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
  } finally { act(() => root.unmount()); }
});
test("review validates return reason, retains per-item action and opens immutable history", async () => {
  const { root, calls } = mount();
  const button = text => root.root.findAll(node => node.type === "stub" && typeof node.props.onClick === "function" && node.props.children === text)[0];
  try {
    await act(async () => { button("退回補充").props.onClick(); });
    assert.equal(calls.filter(call => call[0] === "review").length, 0);
    assert.ok(JSON.stringify(root.toJSON()).includes("請先填寫退回原因"));
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
test("paste appends the whole image batch and failed close preserves the draft", async () => {
  const { root, calls } = mount({ dirty: true, saveDraft: async () => { throw new Error("儲存失敗，草稿保留"); } });
  try {
    const files = Array.from({ length: 12 }, (_, id) => ({ name: "image.png", type: "image/png", id })); let prevented = false;
    await act(async () => { root.root.findByProps({ "data-testid": "circuit-changes-dialog" }).props.onPaste({ clipboardData: { files }, preventDefault() { prevented = true; } }); });
    assert.ok(prevented);
    const upload = calls.find(call => call[0] === "images"); assert.equal(upload[1].length, 12); assert.equal(upload[2], "after");
    await act(async () => { root.root.findByProps({ "aria-label": "關閉線路修改" }).props.onClick(); });
    assert.equal(calls.some(call => call[0] === "open" && call[1] === false), false);
    assert.ok(JSON.stringify(root.toJSON()).includes("儲存失敗，草稿保留"));
  } finally { act(() => root.unmount()); }
});
test("an empty batch has no selected content and remains usable", () => {
  const { root } = mount({ items: [], selectedItemId: "", selectedItem: null, draft: null, events: [] });
  try {
    assert.equal(root.root.findAllByProps({ "data-testid": "circuit-change-item" }).length, 0);
    assert.ok(JSON.stringify(root.toJSON()).includes("新增第一項修改"));
  } finally { act(() => root.unmount()); }
});
