import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { React, act, create, loader } = require("../../../tests/support/renderHarness.cjs");

const source = [{ key: "g", name: "RES 10K 1% 0603", displayRef: "R1", records: [{ id: "r", manufacturer: "Example", manufacturerPartNumber: "R-10K", refDes: "R1", partNumber: "REAL", virtualAlternative: "" }] }];
async function fixture(props = {}) {
  const { RlcPriorityDialog } = loader() ("src/components/material-requests/RlcPriorityDialog.tsx");
  const saved = [];
  let view;
  await act(async () => { view = create(React.createElement(RlcPriorityDialog, { open: true, onOpenChange() {}, projectId: "p", projectName: "Test project", canEdit: true, groups: source, rules: [], onSaveRule: async rule => saved.push(rule), ...props })); });
  const find = label => view.root.find(node => node.type === "stub" && node.props["aria-label"] === label);
  return { view, saved, find, text: () => JSON.stringify(view.toJSON()) };
}

test("RLC dialog keeps filter chips removable and table headers present at zero results", async () => {
  const f = await fixture();
  try {
    await act(async () => f.find("搜尋 RLC 完整規格、位號、廠商或 MPN").props.onChange({ target: { value: "no-match" } }));
    assert.match(f.text(), /目前篩選條件沒有符合的 RLC 規格/);
    assert.equal(f.view.root.findAllByType("thead").length, 1);
    const clear = f.view.root.find(node => node.type === "stub" && node.props["aria-label"] === "清除搜尋條件");
    await act(async () => clear.props.onClick());
    assert.match(f.text(), /RES 10K/);
    assert.equal(f.find("搜尋 RLC 完整規格、位號、廠商或 MPN").props.value, "");
  } finally { await act(async () => f.view.unmount()); }
});

test("unassigned project and read-only permission disable candidate writes", async () => {
  for (const props of [{ projectId: null, projectName: "" }, { canEdit: false }]) {
    const f = await fixture(props);
    try {
      assert.equal(f.view.root.find(node => node.type === "stub" && node.props["data-testid"] === "rlc-save-rule").props.disabled, true);
      if (!props.projectId && props.projectId !== undefined) assert.match(f.text(), /BOM 管理.*指派專案/);
      assert.equal(f.saved.length, 0);
    } finally { await act(async () => f.view.unmount()); }
  }
});

test("candidate editor saves explicit project qualifications and rejects fractional rank", async () => {
  const f = await fixture();
  try {
    const rank = () => f.find("Example R-10K 優先序");
    await act(async () => rank().props.onChange({ target: { value: "1.5" } }));
    assert.equal(f.view.root.find(node => node.type === "stub" && node.props["data-testid"] === "rlc-save-rule").props.disabled, true);
    await act(async () => rank().props.onChange({ target: { value: "2" } }));
    await act(async () => f.find("Example R-10K 客戶承認").props.onValueChange("approved"));
    await act(async () => f.find("Example R-10K AVL").props.onValueChange("not-required"));
    await act(async () => f.find("Example R-10K 工程確認").props.onValueChange("approved"));
    await act(async () => f.view.root.find(node => node.type === "stub" && node.props["data-testid"] === "rlc-save-rule").props.onClick());
    assert.equal(f.saved.length, 1);
    assert.equal(f.saved[0].projectId, "p");
    assert.equal(f.saved[0].rank, 2);
    assert.equal(f.saved[0].customerApproval, "approved");
  } finally { await act(async () => f.view.unmount()); }
});

test('filtering away a candidate retains its unsaved project draft', async () => {
  const f = await fixture();
  try {
    await act(async () => f.find('Example R-10K 優先序').props.onChange({ target: { value: '3' } }));
    await act(async () => f.find('搜尋 RLC 完整規格、位號、廠商或 MPN').props.onChange({ target: { value: 'no-match' } }));
    await act(async () => f.find('清除搜尋條件').props.onClick());
    assert.equal(f.find('Example R-10K 優先序').props.value, 3);
    assert.equal(f.saved.length, 0);
  } finally { await act(async () => f.view.unmount()); }
});

test('long BOM references stay in an expandable bounded detail instead of stretching each row', async () => {
  const refs = Array.from({ length: 80 }, (_, index) => `R${index + 1}_C0P1`).join(', ');
  const f = await fixture({ groups: [{ ...source[0], displayRef: refs, records: [{ ...source[0].records[0], refDes: refs }] }] });
  try {
    const details = f.view.root.findByType('details');
    assert.equal(details.findByType('summary').children.join(''), '檢視全部位號');
    assert.match(details.findByType('p').props.className, /max-h-32.*overflow-y-auto/);
    assert.match(details.findByType('p').children.join(''), /R80_C0P1/);
    const preview = f.view.root.find(node => node.type === 'span' && node.props.className?.includes('line-clamp-2'));
    assert.equal(preview.children.join(''), 'R1_C0P1、R2_C0P1、R3_C0P1');
  } finally { await act(async () => f.view.unmount()); }
});
