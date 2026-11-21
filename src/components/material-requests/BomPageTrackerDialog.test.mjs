import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const require = createRequire(import.meta.url);
const { React, create, act, loader, browser } = require("../../../tests/support/renderHarness.cjs");
// Rendered text of a test instance; props.children would drag React's own circular bookkeeping into JSON.
const textOf = node => typeof node === "string" ? node : node.children.map(textOf).join("");
const page = (pageNumber, status = "pending", note = "", title) => ({ pageNumber, status, note, ...(title === undefined ? {} : { title }) });
const saved = () => ({ totalPages: 4, currentPage: 2, updatedAt: "2026-11-09T00:00:00Z", pages: [page(1, "done", "", "POWER"), page(2, "done_missing", "待料"), page(3), page(4)] });

function mount(overrides = {}) {
  const calls = [];
  const workspace = { id: "bom-a", name: "QA board", payload: { sheetName: "QA", recordCount: 47, records: [] }, pageTracker: saved() };
  const { BomPageTrackerDialog } = loader({ window: browser(), mocks: { "./BomPagePdfAiDialog": { BomPagePdfAiDialog: () => null } } })("src/components/material-requests/BomPageTrackerDialog.tsx");
  let props = { workspace, open: true, onOpenChange: value => calls.push(["open", value]), onSave: async (id, doc) => { calls.push(["save", id, doc]); }, loadLatest: async () => workspace.pageTracker, ...overrides };
  let root; act(() => { root = create(React.createElement(BomPageTrackerDialog, props)); });
  const update = patch => { props = { ...props, ...patch }; act(() => root.update(React.createElement(BomPageTrackerDialog, props))); };
  const field = label => root.root.findByProps({ "aria-label": label });
  const type = (label, value) => act(() => field(label).props.onChange({ target: { value } }));
  const status = (number, value) => act(() => root.root.findByProps({ "aria-label": `第 ${number} 頁狀態` }).findAll(node => node.type === "button" && node.props["data-status"] === value)[0].props.onClick());
  const pressed = number => root.root.findByProps({ "aria-label": `第 ${number} 頁狀態` }).findAll(node => node.type === "button" && node.props["aria-pressed"])[0].props["data-status"];
  const button = label => root.root.findAll(node => node.type === "stub" && typeof node.props.onClick === "function" && textOf(node) === label)[0];
  const state = () => textOf(root.root.findByProps({ className: "bom-tracker-save-state" }));
  const current = () => root.root.findByProps({ id: "bom-current-page" }).props.value;
  return { root, calls, workspace, update, field, type, status, pressed, button, state, current, text: () => textOf(root.root), get props() { return props; } };
}

test("a colleague's record edit or page-progress save never resets what is being edited", () => {
  const view = mount();
  try {
    view.type("第 3 頁備註", "我還沒儲存的備註"); view.status(3, "done");
    assert.match(view.state(), /有尚未儲存的修改（1 頁與頁數設定）/);
    // Any record saved in this BOM replaces the workspace object; the stored page progress is the same object as before.
    view.update({ workspace: { ...view.workspace, payload: { ...view.workspace.payload, recordCount: 48 } } });
    assert.equal(view.field("第 3 頁備註").props.value, "我還沒儲存的備註"); assert.equal(view.pressed(3), "done");
    // A colleague saves page progress: their pages come in, the page edited here keeps its edit.
    const theirs = saved(); theirs.pages[0] = page(1, "done_missing", "同事改的", "POWER"); theirs.pages[2] = page(3, "pending", "同事也改了第 3 頁"); theirs.totalPages = 6;
    view.update({ workspace: { ...view.workspace, pageTracker: theirs } });
    assert.equal(view.field("第 1 頁備註").props.value, "同事改的"); assert.equal(view.pressed(1), "done_missing");
    assert.equal(view.field("第 3 頁備註").props.value, "我還沒儲存的備註"); assert.equal(view.pressed(3), "done");
    assert.equal(view.root.root.findByProps({ id: "bom-total-pages" }).props.value, "6");
    assert.ok(view.text().includes("其他人剛儲存了頁數進度"));
    assert.match(view.state(), /有尚未儲存的修改（1 頁/);
  } finally { act(() => view.root.unmount()); }
});

test("closing with unsaved changes asks first; without changes it just closes", () => {
  const clean = mount();
  try {
    act(() => clean.button("關閉").props.onClick());
    assert.deepEqual(clean.calls, [["open", false]]);
    assert.equal(clean.button("儲存頁數進度").props.disabled, true, "nothing to save yet");
  } finally { act(() => clean.root.unmount()); }
  const view = mount();
  try {
    view.type("第 4 頁標題", "RESET");
    act(() => view.button("關閉").props.onClick());
    assert.equal(view.calls.length, 0, "the dialog stays open");
    assert.ok(view.text().includes("要儲存這些修改嗎？"));
    act(() => view.button("繼續編輯").props.onClick());
    assert.equal(view.field("第 4 頁標題").props.value, "RESET"); assert.equal(view.button("繼續編輯"), undefined);
    // Escape and a click outside arrive through the dialog's own close request.
    act(() => view.root.root.findAll(node => node.type === "stub" && typeof node.props.onOpenChange === "function")[0].props.onOpenChange(false));
    assert.equal(view.calls.length, 0);
    act(() => view.button("不儲存，直接關閉").props.onClick());
    assert.deepEqual(view.calls, [["open", false]]);
  } finally { act(() => view.root.unmount()); }
});

test("saving writes my pages onto what is stored at that moment, and a failed read saves nothing", async () => {
  const stored = saved(); stored.pages[3] = page(4, "done", "同事在我開著視窗時存的"); stored.currentPage = 4;
  const view = mount({ loadLatest: async () => stored });
  try {
    view.status(3, "done_missing"); view.type("第 3 頁備註", "缺 U23");
    await act(async () => { view.button("儲存頁數進度").props.onClick(); });
    const [, id, doc] = view.calls.find(call => call[0] === "save");
    assert.equal(id, "bom-a"); assert.equal(doc.totalPages, 4);
    assert.equal(doc.pages.map(row => `${row.pageNumber}:${row.status}:${row.note}`).join(" | "), "1:done: | 2:done_missing:待料 | 3:done_missing:缺 U23 | 4:done:同事在我開著視窗時存的");
    assert.equal(doc.currentPage, 3, "marking page 3 moved the page that work has reached, so that is what is saved");
    assert.ok(view.calls.some(call => call[0] === "open" && call[1] === false), "a successful save closes the dialog");
  } finally { act(() => view.root.unmount()); }
  const offline = mount({ loadLatest: async () => { throw new Error("offline"); } });
  try {
    offline.status(3, "done");
    await act(async () => { offline.button("儲存頁數進度").props.onClick(); });
    assert.equal(offline.calls.length, 0, "nothing is written and the dialog stays open");
    assert.ok(offline.text().includes("讀不到最新的頁數進度")); assert.equal(offline.pressed(3), "done");
  } finally { act(() => offline.root.unmount()); }
  // The page shows the document being saved before the write is confirmed, and puts the stored copy back when it fails.
  let failing;
  failing = mount({ onSave: async (id, doc) => { failing.update({ workspace: { ...failing.workspace, pageTracker: doc } }); throw new Error("write refused"); } });
  try {
    failing.type("第 2 頁備註", "改過的備註");
    await act(async () => { failing.button("儲存頁數進度").props.onClick(); });
    failing.update({ workspace: { ...failing.workspace, pageTracker: saved() } });
    assert.equal(failing.field("第 2 頁備註").props.value, "改過的備註");
    assert.equal(failing.calls.some(call => call[0] === "open"), false);
    assert.match(failing.state(), /有尚未儲存的修改/);
  } finally { act(() => failing.root.unmount()); }
});

test("the page that work has reached only moves when something was recorded on a later page", () => {
  const view = mount();
  try {
    assert.equal(view.current(), "2");
    view.status(4, "pending");
    assert.equal(view.current(), "2", "pressing the status a page already has changes nothing");
    const later = saved(); later.pages[3] = page(4, "done");
    view.update({ workspace: { ...view.workspace, pageTracker: later } });
    assert.equal(view.pressed(4), "done"); assert.equal(view.current(), "2");
    view.status(4, "done");
    assert.equal(view.current(), "2", "nor does pressing 已完成 on a later page that is already done");
    view.status(4, "pending");
    view.status(1, "pending");
    assert.equal(view.current(), "2", "taking an earlier page back does not move it");
    view.status(3, "done");
    assert.equal(view.current(), "3");
    view.status(3, "pending"); view.type("第 4 頁標題", "只有標題");
    assert.equal(view.current(), "3");
    view.type("第 4 頁備註", "開始做第 4 頁");
    assert.equal(view.current(), "4");
    act(() => view.root.root.findAll(node => node.type === "button" && node.props["aria-label"] === "設為目前頁")[0].props.onClick());
    assert.equal(view.current(), "1");
  } finally { act(() => view.root.unmount()); }
});

test("the page map selects a range for the batch tool and the filter keeps its header and chips", () => {
  const view = mount();
  try {
    const cell = number => view.root.root.findByProps({ "data-map-page": number });
    assert.equal(cell(2).props["data-status"], "done_missing"); assert.equal(cell(2).props["data-current"], true);
    act(() => cell(2).props.onClick({ shiftKey: false }));
    act(() => cell(4).props.onClick({ shiftKey: true }));
    assert.equal(view.field("起始頁").props.value, "2"); assert.equal(view.field("結束頁").props.value, "4");
    assert.deepEqual([1, 2, 3, 4].map(number => cell(number).props["aria-pressed"]), [false, true, true, true]);
    const batch = view.root.root.findByProps({ "data-testid": "bom-page-tracker-batch" });
    act(() => batch.findAll(node => node.type === "button" && node.props["data-status"] === "done")[0].props.onClick());
    assert.deepEqual([1, 2, 3, 4].map(view.pressed), ["done", "done", "done", "done"]);
    assert.equal(view.field("第 2 頁備註").props.value, "待料", "a batch status change keeps titles and notes");
    assert.equal(view.current(), "4");
    // Filter: the control sits directly above the table, the active condition is a chip, and no match keeps the header.
    const order = view.root.root.findAll(node => ["bom-tracker-filter", "bom-tracker-chips", "bom-tracker-table-scroll"].includes(node.props.className)).map(node => node.props.className);
    assert.deepEqual(order, ["bom-tracker-filter", "bom-tracker-table-scroll"]);
    act(() => view.field("搜尋頁面").props.onChange({ target: { value: "power" } }));
    assert.equal(view.root.root.findAllByProps({ "data-testid": "bom-page-tracker-row" }).length, 1);
    act(() => view.root.root.findByProps({ "aria-label": "篩選狀態" }).findAll(node => node.type === "button" && node.props["data-status"] === "pending")[0].props.onClick());
    assert.equal(view.root.root.findAllByProps({ "data-testid": "bom-page-tracker-row" }).length, 0);
    assert.ok(view.text().includes("目前篩選條件沒有符合的頁面"));
    assert.equal(view.root.root.findAll(node => node.type === "th" && node.props.scope === "col").length, 5, "the column headers stay");
    assert.equal(view.root.root.findAll(node => node.type === "button" && String(node.props["aria-label"]).startsWith("移除篩選：")).map(node => node.props["aria-label"]).join(), "移除篩選：搜尋：power,移除篩選：狀態：待處理");
    // Jumping to a page that the filter hides shows it again instead of doing nothing.
    act(() => cell(3).props.onClick({ shiftKey: false }));
    assert.equal(view.root.root.findAllByProps({ "data-testid": "bom-page-tracker-row" }).length, 4);
    assert.equal(view.root.root.findAllByProps({ "data-testid": "bom-page-tracker-filters" }).length, 0);
  } finally { act(() => view.root.unmount()); }
});

test("a 500-page map uses labelled ranges and keeps keyboard navigation across them", () => {
  const tracker = { totalPages: 500, currentPage: 52, pages: Array.from({ length: 500 }, (_, index) => page(index + 1)) };
  const view = mount({ workspace: { id: "big-board", name: "QA", payload: { sheetName: "QA", recordCount: 0 }, pageTracker: tracker } });
  try {
    const cells = () => view.root.root.findAll(node => node.type === "button" && node.props["data-map-page"]);
    assert.equal(cells().length, 50); assert.equal(cells()[0].props["data-map-page"], 51);
    const key = (from, value) => act(() => view.root.root.findByProps({ "aria-label": "各頁狀態" }).props.onKeyDown({ key: value, target: { getAttribute: () => String(from) }, preventDefault() {} }));
    key(100, "ArrowRight"); assert.equal(cells()[0].props["data-map-page"], 101);
    key(101, "Home"); assert.equal(cells()[0].props["data-map-page"], 1);
    key(1, "End"); assert.equal(cells().at(-1).props["data-map-page"], 500);
    act(() => view.field("選擇頁碼範圍").props.onChange({ target: { value: "0" } }));
    assert.equal(cells()[0].props["data-map-page"], 1);
    assert.equal(view.current(), "52", "browsing ranges never changes the page that work reached");
    assert.equal(view.button("儲存頁數進度").props.disabled, true, "map navigation writes nothing");
  } finally { act(() => view.root.unmount()); }
});

// 2026-11-21: 「新增一欄叫做檢查完成的按鈕，提供檢查者進行標記，也讓畫的人知道檢查完的頁面不能再動了，這個按鈕可以被取消但取消前要說明原因留紀錄」
test("檢查完成 locks a finished page; taking back an unsaved check needs nothing, cancelling a saved one needs a reason", async () => {
  const checkButton = (view, number) => view.root.root.findAll(node => node.type === "button" && String(node.props["aria-label"]).startsWith(`第 ${number} 頁`) && String(node.props.className).includes("bom-tracker-check-button"))[0];
  const statusButtons = (view, number) => view.root.root.findByProps({ "aria-label": `第 ${number} 頁狀態` }).findAll(node => node.type === "button");
  const view = mount({ actor: { name: "檢查者甲", id: "u-1" } });
  try {
    assert.equal(view.root.root.findAll(node => node.type === "th" && node.props.scope === "col").map(textOf).join(), "頁碼,檢查完成,狀態,頁面標題,備註");
    assert.equal(checkButton(view, 3).props.disabled, true, "a page still 待處理 cannot be checked");
    act(() => checkButton(view, 1).props.onClick());
    assert.ok(statusButtons(view, 1).every(button => button.props.disabled), "the checked page's status is locked");
    assert.equal(view.field("第 1 頁備註").props.readOnly, true); assert.equal(view.field("第 1 頁標題").props.readOnly, true);
    view.type("第 1 頁備註", "不該寫進去"); view.status(1, "pending");
    assert.equal(view.field("第 1 頁備註").props.value, ""); assert.equal(view.pressed(1), "done");
    assert.match(view.state(), /有尚未儲存的修改（1 頁）/);
    // A check that was never saved is simply taken back: no reason, no record line.
    act(() => checkButton(view, 1).props.onClick());
    assert.equal(checkButton(view, 1).props["aria-pressed"], "false"); assert.match(view.state(), /已儲存/);
    act(() => checkButton(view, 2).props.onClick());
    // The batch tool leaves a checked page alone.
    act(() => view.field("起始頁").props.onChange({ target: { value: "1" } })); act(() => view.field("結束頁").props.onChange({ target: { value: "4" } }));
    assert.ok(view.text().includes("已檢查的 1 頁不會變更"));
    const batch = view.root.root.findByProps({ "data-testid": "bom-page-tracker-batch" });
    act(() => batch.findAll(node => node.type === "button" && node.props["data-status"] === "pending")[0].props.onClick());
    assert.deepEqual([1, 2, 3, 4].map(view.pressed), ["pending", "done_missing", "pending", "pending"]);
    await act(async () => { view.button("儲存頁數進度").props.onClick(); });
    const [, , doc] = view.calls.find(call => call[0] === "save");
    assert.equal(doc.pages[1].checked.by, "檢查者甲"); assert.equal(doc.pages[1].checked.byId, "u-1");
    assert.equal(String(doc.checkLog.map(event => `${event.pageNumber}:${event.action}:${event.by}`)), String(["2:check:檢查者甲"]));
  } finally { act(() => view.root.unmount()); }

  // The checked page as stored: cancelling asks for a reason, and the reason is recorded.
  const stored = saved(); stored.pages[1] = { ...page(2, "done_missing", "待料"), checked: { at: "2026-11-20T08:00:00.000Z", by: "檢查者甲" } };
  stored.checkLog = [{ id: "c-1", pageNumber: 2, action: "check", at: "2026-11-20T08:00:00.000Z", by: "檢查者甲" }];
  const locked = mount({ workspace: { id: "bom-a", name: "QA board", payload: { sheetName: "QA", recordCount: 47, records: [] }, pageTracker: stored }, actor: { name: "畫圖者乙" } });
  try {
    assert.ok(locked.text().includes("已檢查 1 頁· 紀錄 1"));
    act(() => checkButton(locked, 2).props.onClick());
    assert.ok(locked.text().includes("取消第 2 頁的檢查完成")); assert.ok(locked.text().includes("檢查者甲 在"));
    const confirm = () => act(() => locked.button("取消檢查").props.onClick());
    confirm();
    assert.equal(checkButton(locked, 2).props["aria-pressed"], "true", "an empty reason cancels nothing");
    assert.ok(locked.text().includes("寫下為什麼要取消"));
    act(() => locked.root.root.findByProps({ id: "bom-uncheck-reason" }).props.onChange({ target: { value: "  客戶改線路，  要重畫 " } }));
    assert.equal(locked.text().includes("寫下為什麼要取消"), false, "typing clears the error");
    confirm();
    assert.equal(checkButton(locked, 2).props["aria-pressed"], "false");
    assert.equal(statusButtons(locked, 2).some(button => button.props.disabled), false, "the page can be edited again");
    assert.ok(locked.text().includes("第 2 頁已取消檢查，原因已記下"));
    const history = locked.root.root.findByProps({ "aria-label": "第 2 頁檢查紀錄，取消過 1 次" });
    act(() => history.props.onClick());
    assert.ok(locked.text().includes("原因：客戶改線路， 要重畫")); assert.ok(locked.text().includes("未儲存"));
    await act(async () => { locked.button("儲存頁數進度").props.onClick(); });
    const [, , doc] = locked.calls.find(call => call[0] === "save");
    assert.equal(doc.pages[1].checked, undefined);
    assert.equal(String(doc.checkLog.map(event => `${event.action}:${event.by}:${event.reason ?? ""}`)), String(["check:檢查者甲:", "uncheck:畫圖者乙:客戶改線路， 要重畫"]));
  } finally { act(() => locked.root.unmount()); }

  // A viewer sees who checked a page but is offered no check button.
  const viewer = mount({ readOnly: true, workspace: { id: "bom-a", name: "QA board", payload: { sheetName: "QA", recordCount: 47, records: [] }, pageTracker: stored } });
  try {
    assert.equal(checkButton(viewer, 1), undefined); assert.equal(checkButton(viewer, 2), undefined);
    assert.ok(viewer.text().includes("未檢查")); assert.ok(viewer.text().includes("已檢查檢查者甲"));
  } finally { act(() => viewer.root.unmount()); }
});

test("a page a colleague checked while I was editing it goes back to what was checked, and I am told", async () => {
  const view = mount();
  try {
    view.type("第 1 頁備註", "我在改第 1 頁");
    const theirs = saved(); theirs.pages[0] = { ...theirs.pages[0], checked: { at: "2026-11-21T08:00:00.000Z", by: "檢查者甲" } };
    theirs.checkLog = [{ id: "c-9", pageNumber: 1, action: "check", at: "2026-11-21T08:00:00.000Z", by: "檢查者甲" }];
    view.update({ workspace: { ...view.workspace, pageTracker: theirs } });
    assert.equal(view.field("第 1 頁備註").props.value, ""); assert.equal(view.field("第 1 頁備註").props.readOnly, true);
    assert.ok(view.text().includes("第 1 頁剛被其他人檢查完成或取消檢查，已改成對方儲存的內容"));
  } finally { act(() => view.root.unmount()); }
  // The check arrives only when saving: the other pages are saved, the dialog stays open and says which edit was dropped.
  const stored = saved(); stored.pages[2] = { ...page(3), checked: { at: "2026-11-21T08:00:00.000Z", by: "檢查者甲" } };
  const late = mount({ loadLatest: async () => stored });
  try {
    late.type("第 3 頁備註", "我的第 3 頁"); late.type("第 4 頁備註", "我的第 4 頁");
    await act(async () => { late.button("儲存頁數進度").props.onClick(); });
    const [, , doc] = late.calls.find(call => call[0] === "save");
    assert.equal(doc.pages[2].note, ""); assert.equal(doc.pages[3].note, "我的第 4 頁");
    assert.equal(late.calls.some(call => call[0] === "open"), false, "the dialog stays open");
    assert.ok(late.text().includes("第 3 頁剛被其他人檢查完成或取消檢查，你在這裡的修改沒有存入。其他修改都已儲存。"));
    assert.match(late.state(), /已儲存/);
  } finally { act(() => late.root.unmount()); }
  // The cancel window was open while a colleague cancelled the same check: the reason was for a check that is gone.
  const checkedDoc = saved(); checkedDoc.pages[0] = { ...checkedDoc.pages[0], checked: { at: "2026-11-21T08:00:00.000Z", by: "檢查者甲" } };
  checkedDoc.checkLog = [{ id: "c-1", pageNumber: 1, action: "check", at: "2026-11-21T08:00:00.000Z", by: "檢查者甲" }];
  const racing = mount({ workspace: { id: "bom-a", name: "QA board", payload: { sheetName: "QA", recordCount: 47, records: [] }, pageTracker: checkedDoc } });
  try {
    act(() => racing.root.root.findAll(node => node.type === "button" && String(node.props["aria-label"]).startsWith("第 1 頁已檢查完成"))[0].props.onClick());
    act(() => racing.root.root.findByProps({ id: "bom-uncheck-reason" }).props.onChange({ target: { value: "我要改" } }));
    const theirs = saved(); theirs.checkLog = [...checkedDoc.checkLog, { id: "u-1", pageNumber: 1, action: "uncheck", at: "2026-11-21T09:00:00.000Z", by: "同事", reason: "同事先取消" }];
    racing.update({ workspace: { ...racing.workspace, pageTracker: theirs } });
    act(() => racing.button("取消檢查").props.onClick());
    assert.ok(racing.text().includes("第 1 頁的檢查剛被其他人改過，沒有取消"));
    assert.equal(racing.text().includes("原因：我要改"), false, "no cancel line is written for a check that no longer exists");
  } finally { act(() => racing.root.unmount()); }
});

test("a viewer can read every page but is offered nothing that would be refused", () => {
  const view = mount({ readOnly: true });
  try {
    assert.equal(view.field("第 2 頁備註").props.value, "待料"); assert.equal(view.field("第 2 頁備註").props.disabled, true);
    assert.equal(view.root.root.findByProps({ id: "bom-total-pages" }).props.disabled, true);
    assert.equal(view.button("儲存頁數進度"), undefined); assert.equal(view.button("PDF AI"), undefined);
    assert.equal(view.root.root.findAllByProps({ "data-testid": "bom-page-tracker-batch" }).length, 0);
    assert.equal(view.root.root.findAll(node => node.type === "button" && node.props["aria-label"] === "設為目前頁").length, 0);
    assert.match(view.state(), /檢視權限/);
    act(() => view.button("關閉").props.onClick());
    assert.deepEqual(view.calls, [["open", false]]);
  } finally { act(() => view.root.unmount()); }
  const empty = mount({ workspace: { id: "bom-b", name: "New board", payload: { sheetName: "S", recordCount: 0, records: [] } } });
  try {
    assert.ok(empty.text().includes("先在上面填「總頁數」")); assert.match(empty.state(), /尚未設定頁數/);
    act(() => empty.root.root.findByProps({ id: "bom-total-pages" }).props.onChange({ target: { value: "3" } }));
    assert.equal(empty.root.root.findAllByProps({ "data-testid": "bom-page-tracker-row" }).length, 3);
    assert.match(empty.state(), /有尚未儲存的修改（頁數設定）/);
  } finally { act(() => empty.root.unmount()); }
});
