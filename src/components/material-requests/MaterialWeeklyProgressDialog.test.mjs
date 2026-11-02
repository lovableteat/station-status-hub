import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
const { React, create, act, loader } = createRequire(import.meta.url)("../../../tests/support/renderHarness.cjs");

function mount(ready = true) {
  const writes = [];
  const load = loader({ mocks: { "./materialWeeklyProgressExport": { exportMaterialWeeklyExcel: async options => { writes.push(options); } } } });
  const { MaterialWeeklyProgressDialog } = load("src/components/material-requests/MaterialWeeklyProgressDialog.tsx");
  const records = Array.from({ length: 61 }, (_, index) => ({ id: `r${index}`, refDes: `J${index}`, name: `料件 ${index}`, manufacturerPartNumber: "000-MPN-" + index, manufacturer: "Vendor", requestOwnerName: index < 2 ? "CE A" : "CE B", partNumber: index === 0 ? "000-REAL" : "", trackingStatus: index === 0 ? "已取得料號待CIS申請" : "料號申請中", trackingHistory: [] }));
  let root;
  act(() => { root = create(React.createElement(MaterialWeeklyProgressDialog, { records, workspaceName: "QA BOM", exportedBy: "QA", open: true, ready, onOpenChange() {} })); });
  const testId = id => root.root.find(node => node.type === "stub" && node.props["data-testid"] === id);
  const action = text => root.root.find(node => node.type === "stub" && node.props.children === text);
  const field = label => root.root.find(node => typeof node.type === "string" && node.props["aria-label"] === label);
  return { root, writes, testId, action, field };
}

test("weekly report retains numbered CIS applications; paging never limits pending-material export", async () => {
  const editor = mount();
  try {
    const body = () => editor.root.root.findByProps({ "data-testid": "material-weekly-parts" }).findByType("tbody");
    assert.equal(body().findAllByType("tr").length, 50);
    await act(async () => editor.testId("material-weekly-export").props.onClick());
    assert.equal(editor.writes[0].rows.length, 61);
    assert.equal(editor.writes[0].rows[0].currentStatus, "已取得料號待CIS申請");
    assert.equal(editor.writes[0].rows[1].currentStatus, "料號申請中");
    assert.match(editor.writes[0].scope, /待申請料/);
    assert.doesNotMatch(editor.writes[0].scope, /全部料件/);
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

test("the page uses the shared pending selection and preserves the alternate-vendor switch", async () => {
  const page = await readFile("src/components/material-requests/MaterialRequestPage.tsx", "utf8");
  assert.match(page, /<MaterialWeeklyProgressDialog[\s\S]{0,150}records=\{weeklyPendingRecords\}/);
  assert.match(page, /buildPendingApplications\(pendingMaterialGroups, \{ includeAlternates: weeklyIncludeAlternates \}\)\.map\(application => application\.record\)/);
  assert.match(page, /onOpenWeeklyProgress=\{includeAlternates => \{ setWeeklyIncludeAlternates\(includeAlternates\); setPendingDialogOpen\(false\); setWeeklyProgressOpen\(true\); \}\}/);
  assert.match(page, /ready=\{isFullDatasetLoaded && !isWorkspaceLoading\}/);
});

test("ready materials are excluded while CIS, SYMBOL and the selected alternate-vendor scope flow into every report surface", async () => {
  const writes = [];
  const load = loader({ mocks: { "./materialWeeklyProgressExport": { exportMaterialWeeklyExcel: async value => writes.push(value) } } });
  const { MaterialWeeklyProgressDialog } = load("src/components/material-requests/MaterialWeeklyProgressDialog.tsx");
  const { buildPendingApplications } = load("src/components/material-requests/materialRequestPresentation.ts");
  const need = { id: "need", name: "申請中", refDes: "J1", needsApplication: true, trackingStatus: "料號申請中" };
  const alt = { ...need, id: "alt", trackingStatus: "" };
  const ready = { ...need, id: "ready", needsApplication: false, trackingStatus: "已完成", partNumber: "001-READY" };
  const cis = { ...ready, id: "cis", trackingStatus: "已取得料號待CIS申請" };
  const symbol = { ...ready, id: "symbol", trackingStatus: "SYMBOL申請中" };
  const group = records => ({ key: records[0].id, displayRef: "J1", name: "", searchText: "", primaryRecord: records[0], records });
  const groups = [[need, alt], [ready], [cis], [symbol]].map(group);
  for (const includeAlternates of [false, true]) {
    const records = buildPendingApplications(groups, { includeAlternates }).map(item => item.record);
    const expected = includeAlternates ? ["need", "alt", "cis", "symbol"] : ["need", "cis", "symbol"];
    assert.deepEqual(Array.from(records, record => record.id), expected);
    let root;
    act(() => { root = create(React.createElement(MaterialWeeklyProgressDialog, { records, workspaceName: "BOM", exportedBy: "QA", open: true, ready: true, onOpenChange() {} })); });
    try {
      assert.equal(root.root.findByType("tbody").findAllByType("tr").length, expected.length);
      await act(async () => root.root.find(node => node.type === "stub" && node.props["data-testid"] === "material-weekly-export").props.onClick());
      assert.deepEqual(Array.from(writes.at(-1).rows, row => row.record.id), expected);
      act(() => root.root.find(node => node.type === "stub" && node.props.children === "每週彙總").props.onClick());
      const total = root.root.findAllByType("tr").find(row => row.findAllByType("th").some(cell => cell.props.children === "全部待申請料"));
      assert.ok(total.findAllByType("td").every(cell => cell.props.children === expected.length));
    } finally { act(() => root.unmount()); }
  }
});
