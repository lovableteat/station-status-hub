import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { React, create, act, loader } = require("../../../tests/support/renderHarness.cjs");

function mountFilter(initial = null) {
  const writes = [];
  const load = loader({
    window: { requestAnimationFrame: callback => { callback(); return 1; }, cancelAnimationFrame() {} },
    globals: { FILTER_OPTION_ROW_HEIGHT: 38, FILTER_OPTION_LIST_HEIGHT: 224, FILTER_OPTION_OVERSCAN: 8 },
    transform(source, file) {
      if (!file.endsWith("MaterialRequestPage.tsx")) return source;
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      return ast.statements.filter(node => ts.isFunctionDeclaration(node)
        ? ["ExcelFilterPopover", "normalizeColumnFilterSelection", "normalizeFilterValue", "parseSearchTokens"].includes(node.name?.text)
        : ts.isImportDeclaration(node) && ["react", "lucide-react", "@/lib/utils", "@/components/ui/popover", "@/components/ui/input", "@/components/ui/checkbox", "@/components/ui/button"].includes(node.moduleSpecifier.text)
      ).map(node => node.getText(ast)).join("\n") + "\nexport { ExcelFilterPopover };";
    },
  });
  const { ExcelFilterPopover } = load("src/components/material-requests/MaterialRequestPage.tsx");
  let selectedValues = initial;
  let root;
  const getOptions = () => ["ACES", "AMPHENOL", "NXP"].map(value => ({ value, label: value, count: 1 }));
  const render = () => React.createElement(ExcelFilterPopover, {
    filterKey: "manufacturer", label: "Manufacturer", selectedValues, getOptions, activeSort: null, onSortChange() {},
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
