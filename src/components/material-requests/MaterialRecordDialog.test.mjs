import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { React, create, act, loader, ui, deferred } = require("../../../tests/support/renderHarness.cjs");
const baseRecord = {
  id: "part-A", name: "Original", refGroup: "C1", qty: 1, manufacturerPartNumberAlt: "", partNumber: "",
  manufacturerPartNumber: "MPN-A", trackingStatus: "處理中", trackingNote: "original note", trackingHistory: [],
};

function mountDialog(overrides = {}) {
  const writes = [];
  const toasts = [];
  const load = loader({
    mocks: {
      "@/hooks/use-toast": { useToast: () => ({ toast: (entry) => toasts.push(entry) }) },
      "./materialSpecDocuments": { MATERIAL_SPEC_ACCEPT: ".pdf", uploadMaterialSpecDocument: () => Promise.resolve({ name: "spec.pdf" }), formatMaterialSpecSize: () => "1 KB" },
    },
    globals: { Error, MaterialFieldLabel: ui.Label, CHIP_BASE: "chip", CHIP_TONES: { neutral: "neutral", primary: "primary" } },
    transform(source, file) {
      if (!file.endsWith("MaterialRequestPage.tsx")) return source;
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const retained = ast.statements.filter((node) => {
        if (ts.isFunctionDeclaration(node)) return ["MaterialRecordDialog", "toWorkbookRecord", "formatTimestamp"].includes(node.name?.text);
        if (!ts.isImportDeclaration(node)) return false;
        const spec = node.moduleSpecifier.text;
        return spec === "react" || spec === "lucide-react" || spec.startsWith("@/components/ui/") || ["@/hooks/use-toast", "@/lib/utils", "@/lib/inputValidation", "./materialSpecDocuments", "./MaterialTrackingEditor", "./materialTrackingDraft"].includes(spec);
      });
      return retained.map((node) => node.getText(ast)).join("\n") + "\nexport { MaterialRecordDialog };";
    },
  });
  const { MaterialRecordDialog } = load("src/components/material-requests/MaterialRequestPage.tsx");
  const { MaterialTrackingEditor } = load("src/components/material-requests/MaterialTrackingEditor.tsx");
  let props = { canEdit: true, open: true, mode: "edit", record: baseRecord, workspaceId: "W", uploaderName: "CE", onOpenChange() {}, onModeChange() {}, onOpenSpec() {}, onSave: async (value) => { writes.push(value); }, ...overrides };
  let root;
  act(() => { root = create(React.createElement(MaterialRecordDialog, props)); });
  return {
    root, writes, toasts,
    changeName(value) { act(() => root.root.findAllByProps({ id: "material-name" }).find((node) => node.type === "stub").props.onChange({ target: { value } })); },
    setTracking(patch) { act(() => { const editor = root.root.findByType(MaterialTrackingEditor); editor.props.onDraftChange({ ...editor.props.draft, ...patch }); }); },
    tracking: () => root.root.findByType(MaterialTrackingEditor).props.draft,
    button: () => root.root.findAll((node) => node.type === "stub" && node.props.children === "儲存資料與追蹤")[0],
    update(patch) { props = { ...props, ...patch }; act(() => root.update(React.createElement(MaterialRecordDialog, props))); },
    unmount() { act(() => root.unmount()); },
  };
}

test("one main save persists both the material edits and the pending progress without an Add step", async () => {
  const editor = mountDialog();
  editor.changeName("Changed material");
  editor.setTracking({ status: "已完成", note: "done", requestTicket: "REQ-2", requestUrl: "example.com/REQ-2" });
  await act(async () => editor.button().props.onClick());
  assert.equal(editor.writes.length, 1);
  assert.equal(editor.writes[0].name, "Changed material");
  assert.equal(editor.writes[0].requestTicket, "REQ-2");
  assert.equal(editor.writes[0].requestUrl, "https://example.com/REQ-2");
  assert.equal(editor.writes[0].trackingHistory.at(-1).note, "done");
  assert.equal(editor.writes[0].trackingHistory.at(-1).createdBy, "CE");
  assert.equal(editor.writes[0].trackingHistory[0].note, "original note");
  editor.unmount();
});

test("status-less progress blocks the whole save and retains both drafts", async () => {
  const editor = mountDialog();
  editor.changeName("Keep edit");
  editor.setTracking({ note: "Keep progress" });
  await act(async () => editor.button().props.onClick());
  assert.equal(editor.writes.length, 0);
  assert.equal(editor.tracking().note, "Keep progress");
  assert.match(JSON.stringify(editor.root.toJSON()), /Keep edit/);
  assert.match(JSON.stringify(editor.root.toJSON()), /請先選擇追蹤狀態/);
  editor.unmount();
});

test("a failed save retains fields and progress; duplicate clicks cannot start another save", async () => {
  const pending = deferred();
  let calls = 0;
  const editor = mountDialog({ onSave: () => { calls += 1; return pending.promise; } });
  editor.changeName("Unsaved material");
  editor.setTracking({ status: "處理中", note: "Unsaved tracking" });
  const click = editor.button().props.onClick;
  act(() => { click(); click(); });
  assert.equal(calls, 1);
  await act(async () => { pending.reject(new Error("版本衝突")); });
  assert.equal(editor.tracking().note, "Unsaved tracking");
  assert.match(JSON.stringify(editor.root.toJSON()), /Unsaved material/);
  assert.match(JSON.stringify(editor.root.toJSON()), /版本衝突/);
  assert.equal(editor.button().props.disabled, false);
  editor.unmount();
});

test("view mode and in-flight image reads never invoke a record save", async () => {
  const editor = mountDialog();
  editor.setTracking({ status: "已完成", pendingImageReads: 1 });
  assert.equal(editor.button().props.disabled, true);
  await act(async () => editor.button().props.onClick());
  assert.equal(editor.writes.length, 0);
  editor.update({ mode: "view" });
  assert.equal(editor.tracking().status, "已完成");
  assert.equal(editor.root.root.findAll((node) => node.type === "stub" && node.props.children === "儲存資料與追蹤").length, 0);
  editor.unmount();
});

test("the remote CAS write uses the version captured when the record editor opened", async () => {
  const source = await readFile(new URL("./MaterialRequestPage.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("MaterialRequestPage.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "saveRecordToActiveBom") handler = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(handler);
  const current = { id: "W", payload: { records: [baseRecord] }, recordMeta: { "part-A": { updatedAt: "newer-remote-version" }, "part-B": { updatedAt: "other-version" } } };
  let sent;
  const context = {
    captureBomWrite: () => ({}), assertBomWriteCurrent() {}, isBomWriteCurrent: () => true,
    isCollaborativeReady: true, isFullDatasetLoaded: true, basePayload: current.payload, activeWorkspace: current,
    activeBomId: "W", recentLocalRecordIdsRef: { current: new Map() }, replaceBomWorkspace() {}, setBomWorkspaces() {},
    logMaterialRecordChange() {}, user: {}, reloadBomWorkspaces: async () => {},
    saveBomWorkspaceRecord: async (workspace) => { sent = workspace; return { updatedAt: "saved-version" }; },
  };
  const save = vm.runInNewContext(ts.transpileModule(`(${handler})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  await save({ ...baseRecord, name: "Edited" }, { updatedAt: "opening-version" });
  assert.equal(sent.recordMeta["part-A"].updatedAt, "opening-version");
  assert.equal(sent.recordMeta["part-B"].updatedAt, "other-version");
  assert.equal(current.recordMeta["part-A"].updatedAt, "newer-remote-version");
});
