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
    "./bomPagePdfAiService": {
      inspectPdfTitlePage: async () => ({ pageNumber: 1, totalPages: 3, preview: {} }),
      readPdfPageTitles: async (_file, _model, nextSignal) => { signal = nextSignal; return pending.promise; },
    },
  }, globals: { AbortController, URL: { createObjectURL: () => "blob:qa", revokeObjectURL() {} } } })("src/components/material-requests/BomPagePdfAiDialog.tsx");
  const props = { open: true, onOpenChange() {}, onApply() {}, maxPages: 500 };
  let root;
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  try {
    await act(async () => { root = create(React.createElement(BomPagePdfAiDialog, props)); });
    await settle();
    act(() => root.root.findByProps({ "aria-label": "選擇標題辨識 PDF" }).props.onChange({ target: { files: [{ name: "QA.pdf", size: 1024 }], value: "QA.pdf" } }));
    await settle();
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

test("reopening during initial PDF inspection resumes the selected file without an AI request", async () => {
  const pending = deferred();
  let attempts = 0, initialSignal;
  const { BomPagePdfAiDialog } = loader({ mocks: {
    "./materialSpecFillService": { loadSpecFillModels: async () => [{ id: "qa-model", label: "QA model" }] },
    "./bomPagePdfAiService": {
      inspectPdfTitlePage: async (_file, signal) => {
        if (++attempts === 1) { initialSignal = signal; return pending.promise; }
        return { pageNumber: 1, totalPages: 500, preview: {} };
      },
      readPdfPageTitles: async () => { assert.fail("inspection must not call AI"); },
    },
  }, globals: { URL: { createObjectURL: () => "blob:inspection", revokeObjectURL() {} } } })("src/components/material-requests/BomPagePdfAiDialog.tsx");
  const props = { open: true, onOpenChange() {}, onApply() {}, maxPages: 500 };
  let root;
  try {
    await act(async () => { root = create(React.createElement(BomPagePdfAiDialog, props)); });
    act(() => root.root.findByProps({ "aria-label": "選擇標題辨識 PDF" }).props.onChange({ target: { files: [{ name: "selected-500.pdf", size: 1024 }], value: "" } }));
    await act(async () => root.update(React.createElement(BomPagePdfAiDialog, { ...props, open: false })));
    assert.equal(initialSignal.aborted, true);
    await act(async () => root.update(React.createElement(BomPagePdfAiDialog, props)));
    assert.equal(attempts, 2);
    assert.ok(JSON.stringify(root.toJSON()).includes("selected-500.pdf"));
    assert.equal(root.root.findByProps({ alt: "第 1 頁右下角標題原圖" }).props.src, "blob:inspection");
    assert.equal(root.root.findByProps({ "aria-label": "跳至 PDF 頁碼" }).props.max, 500);
    await act(async () => pending.resolve({ pageNumber: 1, totalPages: 3, preview: {} }));
    assert.equal(root.root.findByProps({ "aria-label": "跳至 PDF 頁碼" }).props.max, 500, "cancelled inspection cannot replace reopened metadata");
  } finally { if (root) act(() => root.unmount()); }
});
