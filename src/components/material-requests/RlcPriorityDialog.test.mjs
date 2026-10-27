import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { React, act, create, loader } = require("../../../tests/support/renderHarness.cjs");

const source = [{ key: "g", name: "RES 10K 1% 0603", displayRef: "R1", records: [{ id: "r", manufacturer: "Example", manufacturerPartNumber: "R-10K", refDes: "R1", partNumber: "REAL", virtualAlternative: "" }] }];
async function fixture(props = {}) {
  const { RlcPriorityDialog } = loader({ globals: { Error } }) ("src/components/material-requests/RlcPriorityDialog.tsx");
  const saved = [];
  let view;
  await act(async () => { view = create(React.createElement(RlcPriorityDialog, { open: true, onOpenChange() {}, projectId: "p", projectName: "Test project", canEdit: true, groups: source, rules: [], onSaveRule: async rule => saved.push(rule), ...props })); });
  const find = label => view.root.find(node => node.type === "stub" && node.props["aria-label"] === label);
  const openSpec = async () => { await act(async () => view.root.find(node => node.type === 'stub' && node.props['data-testid'] === 'rlc-open-spec').props.onClick()); };
  return { view, saved, find, openSpec, text: () => JSON.stringify(view.toJSON()) };
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
      await f.openSpec();
      assert.equal(f.view.root.find(node => node.type === "stub" && node.props["data-testid"] === "rlc-save-rule").props.disabled, true);
      if (!props.projectId && props.projectId !== undefined) assert.match(f.text(), /先選擇.*專案/);
      assert.equal(f.saved.length, 0);
    } finally { await act(async () => f.view.unmount()); }
  }
});

test("candidate editor saves explicit project qualifications and rejects fractional rank", async () => {
  const f = await fixture();
  try {
    await f.openSpec();
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
    await f.openSpec();
    await act(async () => f.find('Example R-10K 優先序').props.onChange({ target: { value: '3' } }));
    await act(async () => f.view.root.find(node => node.type === 'stub' && node.props['data-testid'] === 'rlc-back-to-specs').props.onClick());
    assert.match(f.text(), /廠商設定尚未儲存/);
    await act(async () => f.find('搜尋 RLC 完整規格、位號、廠商或 MPN').props.onChange({ target: { value: 'no-match' } }));
    await act(async () => f.find('清除搜尋條件').props.onClick());
    await f.openSpec();
    assert.equal(f.find('Example R-10K 優先序').props.value, 3);
    assert.equal(f.saved.length, 0);
  } finally { await act(async () => f.view.unmount()); }
});

test('long BOM references stay in an expandable bounded detail instead of stretching each row', async () => {
  const refs = Array.from({ length: 80 }, (_, index) => `R${index + 1}_C0P1`).join(', ');
  const f = await fixture({ groups: [{ ...source[0], displayRef: refs, records: [{ ...source[0].records[0], refDes: refs }] }] });
  try {
    assert.equal(f.view.root.findAllByType('details').length, 0, 'reference expansion cannot distract from the list action');
    await f.openSpec();
    const details = f.view.root.findByProps({ 'data-testid': 'rlc-spec-refs' });
    assert.equal(details.findByType('summary').children.join(''), '檢視此規格使用的全部位號');
    assert.match(details.findAllByType('p').at(-1).props.className, /max-h-32.*overflow-y-auto/);
    assert.match(details.findAllByType('p').at(-1).children.join(''), /R80_C0P1/);
  } finally { await act(async () => f.view.unmount()); }
});

test('the list has a visible setting action and opens a focused manufacturer step', async () => {
  const f = await fixture();
  try {
    assert.equal(f.view.root.findAll(node => node.props['data-testid'] === 'rlc-save-rule').length, 0);
    assert.match(f.text(), /同一專案.*相同規格/);
    await f.openSpec();
    assert.match(f.text(), /設定可用廠商與優先順序/);
    assert.match(f.text(), /1＝優先使用.*2＝第一替代/);
    assert.equal(f.view.root.findAllByType('table').length, 0, 'editing must not sit below the spec list');
  } finally { await act(async () => f.view.unmount()); }
});

test('an unassigned BOM can choose its project here, and a failed assignment keeps the choice', async () => {
  const assigned = [];
  const f = await fixture({ projectId: null, projectName: '', projects: [{ id: 'p', name: 'VERA' }], onAssignProject: async id => { assigned.push(id); throw new Error('測試儲存失敗'); } });
  try {
    assert.equal(f.view.root.find(node => node.type === 'stub' && node.props['data-testid'] === 'rlc-assign-project').props.disabled, true);
    await act(async () => f.find('選擇 BOM 所屬專案').props.onValueChange('p'));
    await act(async () => f.view.root.find(node => node.type === 'stub' && node.props['data-testid'] === 'rlc-assign-project').props.onClick());
    assert.deepEqual(assigned, ['p']);
    assert.match(f.text(), /測試儲存失敗/);
    assert.equal(f.find('選擇 BOM 所屬專案').props.value, 'p');
  } finally { await act(async () => f.view.unmount()); }
});

test('reverting a draft re-enables project changes instead of leaving a hidden blocker', async () => {
  const f = await fixture({ onAssignProject: async () => {} });
  const projectButton = () => f.view.root.find(node => node.type === 'stub' && node.children?.includes('更換專案'));
  try {
    await f.openSpec();
    await act(async () => f.find('Example R-10K 優先序').props.onChange({ target: { value: '1' } }));
    assert.equal(projectButton().props.disabled, true);
    await act(async () => f.find('Example R-10K 優先序').props.onChange({ target: { value: '' } }));
    assert.equal(projectButton().props.disabled, false);
  } finally { await act(async () => f.view.unmount()); }
});
