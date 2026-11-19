import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { React, create, act, loader } = require("../../../tests/support/renderHarness.cjs");

function mountFilter(initial = null, triggerLabel) {
  const writes = [];
  // The shared column filter (料號表 and 專案總料表 both use it); only its far-away helpers are stubbed.
  const load = loader({
    window: { requestAnimationFrame: callback => { callback(); return 1; }, cancelAnimationFrame() {} },
    mocks: {
      "./materialSearch": { matchesMaterialReference: (value, token) => String(value).toLowerCase().includes(token) },
      "./materialTrackingStatus": { materialTrackingStatusPresentation: () => ({ text: "" }) },
      "./materialRequestUtils": { normalizeMaterialSearchText: value => String(value ?? "").toLowerCase() },
    },
  });
  const { ExcelFilterPopover } = load("src/components/material-requests/materialExcelFilter.tsx");
  let selectedValues = initial;
  let root;
  const getOptions = () => ["ACES", "AMPHENOL", "NXP"].map(value => ({ value, label: value, count: 1 }));
  const render = () => React.createElement(ExcelFilterPopover, {
    filterKey: "manufacturer", label: "Manufacturer", triggerLabel, selectedValues, getOptions, activeSort: null, onSortChange() {},
    onSelectedValuesChange(values) { writes.push(values); selectedValues = values; root.update(render()); },
  });
  act(() => { root = create(render()); });
  const popover = () => root.root.find(node => node.type === "stub" && typeof node.props.open === "boolean");
  const button = text => root.root.find(node => ["button", "stub"].includes(node.type) && node.props.children === text);
  const checkbox = label => root.root.findAllByType("label").find(node => node.findAllByType("span").some(span => span.props.children === label)).find(node => node.type === "stub" && "checked" in node.props);
  return { root, writes, checkbox,
    open() { act(() => popover().props.onOpenChange(true)); },
    close() { act(() => popover().props.onOpenChange(false)); },
    click(text) { act(() => button(text).props.onClick()); },
    check(label, checked) { act(() => checkbox(label).props.onCheckedChange(checked)); },
  };
}

test("a compact value trigger keeps the actual field name accessible and avoids duplicate counts", () => {
  const filter = mountFilter(["ACES"], "ACES");
  const trigger = filter.root.root.findByProps({ 'aria-label': '篩選Manufacturer' });
  const spans = trigger.findAllByType('span');
  assert.ok(spans.some(span => span.props.children === 'ACES'));
  assert.ok(!spans.some(span => span.props.children === '1項'));
  filter.open();
  assert.equal(filter.checkbox('ACES').props.checked, true);
  act(() => filter.root.unmount());
});

test("column selections stay local until 確定 and only then update the applied filter", () => {
  const filter = mountFilter();
  filter.open();
  filter.check("AMPHENOL", false);
  assert.equal(filter.writes.length, 0);
  filter.click("確定");
  assert.deepEqual(Array.from(filter.writes[0]), ["ACES", "NXP"]);
  filter.open();
  assert.equal(filter.checkbox("AMPHENOL").props.checked, false);
  act(() => filter.root.unmount());
});

test("取消 and outside dismissal discard draft changes and restore the applied checkboxes on reopen", () => {
  const filter = mountFilter(["ACES"]);
  filter.open();
  filter.check("NXP", true);
  filter.click("取消");
  filter.open();
  assert.equal(filter.checkbox("ACES").props.checked, true);
  assert.equal(filter.checkbox("NXP").props.checked, false);
  filter.check("AMPHENOL", true);
  filter.close();
  filter.open();
  assert.equal(filter.checkbox("AMPHENOL").props.checked, false);
  assert.equal(filter.writes.length, 0);
  act(() => filter.root.unmount());
});
