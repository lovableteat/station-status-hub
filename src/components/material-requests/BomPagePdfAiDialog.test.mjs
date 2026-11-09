import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { React, create, act, loader, deferred } = require("../../../tests/support/renderHarness.cjs");

test("an external close aborts recognition and the reopened PDF dialog is usable", async () => {
  const pending = deferred();
  let signal;
  const { BomPagePdfAiDialog } = loader({ mocks: {
    "./materialSpecFillService": { loadSpecFillModels: async () => [{ id: "qa-model", label: "QA model" }] },
    "./bomPagePdfAiService": { readPdfPageTitles: async (_file, _model, nextSignal) => { signal = nextSignal; return pending.promise; } },
  }, globals: { AbortController } })("src/components/material-requests/BomPagePdfAiDialog.tsx");
  const props = { open: true, onOpenChange() {}, onApply() {}, maxPages: 500 };
  let root;
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  try {
    await act(async () => { root = create(React.createElement(BomPagePdfAiDialog, props)); });
    await settle();
    act(() => root.root.findByProps({ "aria-label": "選擇標題辨識 PDF" }).props.onChange({ target: { files: [{ name: "QA.pdf" }], value: "QA.pdf" } }));
    const run = () => root.root.findAll(node => node.props.children === "辨識全部頁面" && typeof node.props.onClick === "function")[0];
    act(() => run().props.onClick());
    assert.ok(signal);
    await act(async () => root.update(React.createElement(BomPagePdfAiDialog, { ...props, open: false })));
    assert.equal(signal.aborted, true);
    await act(async () => root.update(React.createElement(BomPagePdfAiDialog, props)));
    await settle();
    assert.ok(run(), "reopening must leave recognition mode");
    assert.equal(run().props.disabled, false);
    await act(async () => { pending.resolve([]); await Promise.resolve(); });
  } finally { if (root) act(() => root.unmount()); }
});
