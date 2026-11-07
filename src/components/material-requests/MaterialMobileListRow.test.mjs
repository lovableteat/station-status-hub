import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { React, create, act, loader } = require("../../../tests/support/renderHarness.cjs");
const { MaterialMobileListRow } = loader()("src/components/material-requests/MaterialMobileListRow.tsx");

test("mobile presentation keeps virtual/physical values independent and routes each action", () => {
  const calls = [];
  let props = {
    virtualNumber: "", physicalNumber: "1A50-0331000", showVirtual: true, showPhysical: true,
    status: "已取得料號待CIS申請", statusTone: "material-status-badge material-status--cis",
    marked: false, markDisabled: false, fields: [{ key: "mpn", label: "MPN", value: "MPN-123456789" }],
    onToggleMarked: () => calls.push("mark"), onOpen: () => calls.push("details"), onTracking: () => calls.push("tracking"), recordId: "record-123",
  };
  let root;
  act(() => { root = create(React.createElement(MaterialMobileListRow, props)); });
  try {
    const numbers = root.root.findAll(node => node.type === "span" && node.props.className?.includes("material-mobile-list-number-value"));
    assert.deepEqual(numbers.map(node => node.props.children), ["未提供", "1A50-0331000"]);
    assert.equal(root.root.findByProps({ "data-testid": "material-mobile-list-row" }).props["data-record-id"], "record-123");
    act(() => {
      root.root.findByProps({ "aria-label": "加入我的標記" }).props.onClick();
      root.root.findByProps({ "data-testid": "material-mobile-row-open" }).props.onClick();
      root.root.findByProps({ "data-testid": "material-mobile-row-tracking" }).props.onClick();
    });
    assert.deepEqual(calls, ["mark", "details", "tracking"]);
    assert.equal(root.root.findByProps({ "data-testid": "material-mobile-row-tracking" }).props.title, "已取得料號待CIS申請");
    assert.equal(root.root.findByProps({ title: "MPN：MPN-123456789" }).props.className, "material-mobile-list-field");
    props = { ...props, showVirtual: false, showPhysical: false, marked: true, markDisabled: true };
    act(() => root.update(React.createElement(MaterialMobileListRow, props)));
    assert.equal(root.root.findByProps({ "aria-label": "移除我的標記" }).props.disabled, true);
    assert.equal(root.root.findByProps({ className: "material-mobile-list-fallback" }).props.children, "料件詳情");
  } finally { act(() => root.unmount()); }
});
