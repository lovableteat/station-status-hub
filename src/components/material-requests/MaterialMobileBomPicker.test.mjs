import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const require = createRequire(import.meta.url);
const { React, create, act, loader } = require("../../../tests/support/renderHarness.cjs");
const { MaterialMobileBomPicker } = loader({ mocks: { "@/components/ui/button": { Button: React.forwardRef((props, ref) => React.createElement("button", { ...props, ref })) } } })("src/components/material-requests/MaterialMobileBomPicker.tsx");

test("mobile BOM picker bounds 2000 results and searches beyond the visible page", () => {
  const changed = [];
  const groups = [{ key: "project", label: "工程專案", isActive: true, workspaces: Array.from({ length: 2000 }, (_, index) => ({ id: `series-${index}`, name: `主板-${index}.xlsx`, current: { workspace: { id: `bom-${index}` }, displayNumber: "V1" }, recordCount: index })) }];
  let root;
  act(() => { root = create(React.createElement(MaterialMobileBomPicker, { groups, value: "bom-0", onValueChange: value => changed.push(value), children: "目前 BOM" })); });
  const options = () => root.root.findAll(node => node.type === "button" && node.props.className === "material-mobile-bom-picker-option");
  try {
    assert.equal(options().length, 50);
    assert.equal(options()[0].props["aria-pressed"], true);
    act(() => root.root.findByProps({ "aria-label": "下一頁 BOM" }).props.onClick());
    assert.equal(options().length, 50);
    assert.match(options()[0].findByType("strong").props.children, /主板-50/);
    act(() => root.root.findByProps({ "aria-label": "搜尋 BOM 或專案" }).props.onChange({ target: { value: "主板-1999" } }));
    assert.equal(options().length, 1);
    assert.equal(options()[0].findByType("strong").props.children, "主板-1999.xlsx");
    act(() => options()[0].props.onClick());
    assert.deepEqual(changed, ["bom-1999"]);
    act(() => root.root.findByProps({ "aria-label": "搜尋 BOM 或專案" }).props.onChange({ target: { value: "不存在" } }));
    assert.equal(options().length, 0);
    act(() => root.root.findByProps({ "aria-label": "清除 BOM 搜尋" }).props.onClick());
    assert.equal(options().length, 50);
    act(() => root.root.findByProps({ "aria-label": "搜尋 BOM 或專案" }).props.onChange({ target: { value: "工程專案" } }));
    assert.equal(options().length, 50);
    assert.equal(root.root.findByProps({ "aria-label": "下一頁 BOM" }).props.disabled, false);
  } finally { act(() => root.unmount()); }
});

test("historical version retains its own workspace id and record count", () => {
  const changed = [];
  const historicalVersion = { name: "主板.xlsx", version: { displayNumber: "V1", workspace: { id: "historical", payload: { records: [], recordCount: 850 } } } };
  let root;
  act(() => { root = create(React.createElement(MaterialMobileBomPicker, { groups: [], value: "historical", historicalVersion, onValueChange: value => changed.push(value), children: "目前 BOM" })); });
  try {
    const option = root.root.find(node => node.type === "button" && node.props.className === "material-mobile-bom-picker-option");
    assert.equal(option.props["aria-pressed"], true);
    assert.equal(option.findAllByType("span").at(-1).props.children.join(""), "V1（歷史） · 850 筆");
    act(() => option.props.onClick());
    assert.deepEqual(changed, ["historical"]);
  } finally { act(() => root.unmount()); }
});
