import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
const { React, create, act, loader } = createRequire(import.meta.url)("../../../tests/support/renderHarness.cjs");

function mount(ready = true) {
  const writes = [];
  const load = loader({ mocks: { "./materialWeeklyProgressExport": { exportMaterialWeeklyExcel: async options => { writes.push(options); } } } });
  const { MaterialWeeklyProgressDialog } = load("src/components/material-requests/MaterialWeeklyProgressDialog.tsx");
  const records = Array.from({ length: 61 }, (_, index) => ({ id: `r${index}`, refDes: `J${index}`, name: `料件 ${index}`, manufacturerPartNumber: "000-MPN-" + index, manufacturer: "Vendor", requestOwnerName: index < 2 ? "CE A" : "CE B", partNumber: "000-REAL", trackingStatus: index === 0 ? "已取得料號待CIS申請" : "已完成", trackingHistory: [] }));
  let root;
  act(() => { root = create(React.createElement(MaterialWeeklyProgressDialog, { records, workspaceName: "QA BOM", exportedBy: "QA", open: true, ready, onOpenChange() {} })); });
  const testId = id => root.root.find(node => node.type === "stub" && node.props["data-testid"] === id);
  const action = text => root.root.find(node => node.type === "stub" && node.props.children === text);
  const field = label => root.root.find(node => typeof node.type === "string" && node.props["aria-label"] === label);
  return { root, writes, testId, action, field };
}

test("weekly report includes numbered and completed materials; paging never limits Excel export", async () => {
  const editor = mount();
  try {
    const body = () => editor.root.root.findByProps({ "data-testid": "material-weekly-parts" }).findByType("tbody");
    assert.equal(body().findAllByType("tr").length, 50);
    await act(async () => editor.testId("material-weekly-export").props.onClick());
    assert.equal(editor.writes[0].rows.length, 61);
    assert.equal(editor.writes[0].rows[0].currentStatus, "已取得料號待CIS申請");
    assert.equal(editor.writes[0].rows[1].currentStatus, "已完成");
    act(() => editor.action("下一頁").props.onClick());
    assert.equal(body().findAllByType("tr").length, 11);
    act(() => editor.field("負責人").props.onChange({ target: { value: "CE A" } }));
    assert.equal(body().findAllByType("tr").length, 2, "changing filters resets pagination");
    await act(async () => editor.testId("material-weekly-export").props.onClick());
    assert.equal(editor.writes[1].rows.length, 2);
    assert.match(editor.writes[1].scope, /負責人：CE A/);
    act(() => editor.field("清除負責人篩選").props.onClick());
    assert.equal(body().findAllByType("tr").length, 50);
    act(() => editor.action("每週彙總").props.onClick());
    assert.ok(editor.root.root.findByProps({ "data-testid": "material-weekly-summary" }));
  } finally { act(() => editor.root.unmount()); }
});

test("empty filters keep the table headings and cannot export; an incomplete BOM cannot produce a partial report", async () => {
  const editor = mount();
  try {
    act(() => editor.field("搜尋週報").props.onChange({ target: { value: "notfound" } }));
    assert.equal(editor.root.root.findAllByType("thead").length, 1);
    assert.match(JSON.stringify(editor.root.toJSON()), /目前篩選條件沒有符合的料件/);
    assert.equal(editor.testId("material-weekly-export").props.disabled, true);
  } finally { act(() => editor.root.unmount()); }
  const loading = mount(false);
  try {
    assert.equal(loading.testId("material-weekly-export").props.disabled, true);
    await act(async () => loading.testId("material-weekly-export").props.onClick());
    assert.equal(loading.writes.length, 0);
    assert.match(JSON.stringify(loading.root.toJSON()), /完整 BOM/);
  } finally { act(() => loading.root.unmount()); }
});

test("the page passes the full active BOM, not the pending list, and switches dialogs instead of stacking them", async () => {
  const page = await readFile("src/components/material-requests/MaterialRequestPage.tsx", "utf8");
  assert.match(page, /<MaterialWeeklyProgressDialog[\s\S]{0,150}records=\{dataset\.records\}/);
  assert.match(page, /onOpenWeeklyProgress=\{\(\) => \{ setPendingDialogOpen\(false\); setWeeklyProgressOpen\(true\); \}\}/);
  assert.match(page, /ready=\{isFullDatasetLoaded && !isWorkspaceLoading\}/);
});
