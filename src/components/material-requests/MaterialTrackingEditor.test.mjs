import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { React, create, act, loader } = require("../../../tests/support/renderHarness.cjs");

function mountEditor() {
  const readers = [];
  class FileReader {
    readAsDataURL() { readers.push(this); }
    finish() { this.result = "data:image/png;base64,new"; this.onload(); }
  }
  const load = loader({ globals: { FileReader, File } });
  const { MaterialTrackingEditor } = load("src/components/material-requests/MaterialTrackingEditor.tsx");
  const { createMaterialTrackingDraft } = load("src/components/material-requests/materialTrackingDraft.ts");
  let record = { id: "record-A", requestTicket: "A-1", trackingStatus: "處理中", trackingNote: "原有備註" };
  let draft = createMaterialTrackingDraft(record);
  let root;
  let disabled = false;
  const render = () => React.createElement(MaterialTrackingEditor, {
    record, draft, disabled,
    onDraftChange: (next) => { draft = next; root.update(render()); },
  });
  act(() => { root = create(render()); });
  return {
    root, readers,
    draft: () => draft,
    readImage() { act(() => root.root.findByProps({ type: "file" }).props.onChange({ target: { files: [new File(["image"], "screen.png", { type: "image/png" })], value: "" } })); },
    replaceRecord() { act(() => { record = { id: "record-B", requestTicket: "B-2" }; draft = createMaterialTrackingDraft(record); root.update(render()); }); },
    replaceSession() { act(() => { draft = createMaterialTrackingDraft(record); root.update(render()); }); },
    disable() { act(() => { disabled = true; root.update(render()); }); },
  };
}

test("image reads remain pending and keep notes typed while they load", async () => {
  const editor = mountEditor();
  editor.readImage();
  assert.equal(editor.draft().pendingImageReads, 1);
  act(() => editor.root.root.findAllByProps({ placeholder: "這次做了什麼、卡在哪、下一步" }).find((node) => node.type === "stub").props.onChange({ target: { value: "讀圖時繼續填寫" } }));
  await act(async () => editor.readers[0].finish());
  assert.equal(editor.draft().pendingImageReads, 0);
  assert.equal(editor.draft().note, "讀圖時繼續填寫");
  assert.equal(editor.draft().images.length, 1);
  act(() => editor.root.unmount());
});

test("image reads from the old record or replaced account session never enter the next draft", async () => {
  for (const replacement of ["replaceRecord", "replaceSession"]) {
    const editor = mountEditor();
    editor.readImage();
    editor[replacement]();
    await act(async () => editor.readers[0].finish());
    assert.equal(editor.draft().images.length, 0);
    assert.equal(editor.draft().pendingImageReads, 0);
    act(() => editor.root.unmount());
  }
});

test("Ctrl+V adds a named screenshot and a failed read releases the save blocker", async () => {
  const editor = mountEditor();
  let prevented = false;
  act(() => editor.root.root.findByProps({ "data-testid": "material-tracking-editor" }).props.onPaste({
    preventDefault() { prevented = true; },
    clipboardData: { items: [{ kind: "file", type: "image/png", getAsFile: () => new File(["screen"], "image.png", { type: "image/png" }) }] },
  }));
  assert.equal(prevented, true);
  assert.equal(editor.draft().pendingImageReads, 1);
  await act(async () => editor.readers[0].finish());
  assert.match(editor.draft().images[0].name, /^clipboard-.*\.png$/);
  editor.readImage();
  await act(async () => editor.readers[1].onerror());
  assert.equal(editor.draft().pendingImageReads, 0);
  assert.equal(editor.draft().images.length, 1);
  assert.match(JSON.stringify(editor.root.toJSON()), /讀取失敗/);
  act(() => editor.root.unmount());
});

test("read-only tracking disables editing while the legacy history stays visible", () => {
  const editor = mountEditor();
  editor.disable();
  assert.equal(editor.root.root.findByType("fieldset").props.disabled, true);
  assert.equal(editor.root.root.findByProps({ type: "file" }).props.disabled, true);
  assert.equal(editor.root.root.findAllByType("details").length, 1);
  assert.match(JSON.stringify(editor.root.toJSON()), /原有備註/);
  editor.readImage();
  assert.equal(editor.readers.length, 0);
  act(() => editor.root.unmount());
});
