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

function mountDialog(overrides = {}, uploadSpec = () => Promise.resolve({ name: "spec.pdf", path: "W/part/spec.pdf" })) {
  const writes = [];
  const toasts = [];
  const load = loader({
    mocks: {
      "@/hooks/use-toast": { useToast: () => ({ toast: (entry) => toasts.push(entry) }) },
      "./materialSpecDocuments": { MATERIAL_SPEC_ACCEPT: ".pdf", uploadMaterialSpecDocument: uploadSpec, formatMaterialSpecSize: () => "1 KB" },
    },
    globals: { Error, MaterialFieldLabel: ui.Label, CHIP_BASE: "chip", CHIP_TONES: { neutral: "neutral", primary: "primary" } },
    transform(source, file) {
      if (!file.endsWith("MaterialRequestPage.tsx")) return source;
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const retained = ast.statements.filter((node) => {
        if (ts.isFunctionDeclaration(node)) return ["MaterialRecordDialog", "toWorkbookRecord", "formatTimestamp"].includes(node.name?.text);
        if (ts.isVariableStatement(node)) return node.declarationList.declarations.some(declaration => declaration.name.getText(ast) === "MATERIAL_CE_EDITOR_FIELDS");
        if (!ts.isImportDeclaration(node)) return false;
        const spec = node.moduleSpecifier.text;
        return spec === "react" || spec === "lucide-react" || spec.startsWith("@/components/ui/") || ["@/hooks/use-toast", "@/lib/utils", "@/lib/inputValidation", "./materialSpecDocuments", "./MaterialTrackingEditor", "./materialTrackingDraft", "./materialUploadContract.mjs"].includes(spec);
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

test("all 15 CE fields remain editable in Excel order without a horizontal table and retain internal values", async () => {
  const editor = mountDialog({ record: { ...baseRecord, assemblyName: "original module", remark: "original note", manufacturerPartNumberAlt: "OLD-MPN" } });
  const fields = editor.root.root.findAll(node => node.type === "stub" && node.props["data-testid"] === "material-ce-field");
  assert.equal(fields.length, 15);
  assert.equal(editor.root.root.findAllByType("table").length, 0);
  assert.deepEqual(fields.map(field => field.findAll(node => node.type === "stub" && node.props.id?.startsWith("material-"))[0].props.id), ["material-level", "material-name", "material-qty", "material-ref-des", "material-mpn", "material-maker", "material-sourcing", "material-virtual-alternative", "material-internal-pn", "material-part-name", "material-spec", "material-symbol", "material-footprint", "material-phase-out", "material-part-usage"]);
  for (const id of ["material-ref", "material-assembly", "material-remark"]) assert.equal(editor.root.root.findAllByProps({ id }).length, 0);
  const author = editor.root.root.findAll(node => node.type === "stub" && String(node.props.id).endsWith("-author"))[0];
  assert.equal(author.props.value, "CE");
  assert.equal(editor.tracking().createdBy, "", "displaying the default author is not a new progress draft");
  editor.changeName("new name");
  await act(async () => editor.button().props.onClick());
  assert.equal(editor.writes[0].assemblyName, "original module");
  assert.equal(editor.writes[0].remark, "original note");
  assert.equal(editor.writes[0].refGroup, "C1");
  assert.equal(editor.writes[0].manufacturerPartNumberAlt, "OLD-MPN");
  assert.equal(editor.writes[0].trackingHistory.length, 0);
  editor.unmount();
});

test("new records do not require a hidden group field and derive it only from entered references", async () => {
  const editor = mountDialog({ mode: "create", record: { ...baseRecord, refGroup: "", refDes: "R1", trackingStatus: "", trackingNote: "" } });
  assert.equal(editor.button().props.disabled, false);
  await act(async () => editor.button().props.onClick());
  assert.equal(editor.writes[0].refGroup, "R1");
  assert.equal(editor.writes[0].sourceGroupKey, baseRecord.id);
  editor.unmount();
});

test("a freshly uploaded SPEC appears immediately with an explicit download action before record save", async () => {
  const opened = [];
  const editor = mountDialog({ onOpenSpec: (...args) => opened.push(args) });
  const upload = editor.root.root.find(node => node.type === "input" && node.props.type === "file" && node.props.accept === ".pdf");
  await act(async () => { upload.props.onChange({ target: { files: [{ name: "spec.pdf" }], value: "" } }); await Promise.resolve(); });
  assert.match(JSON.stringify(editor.root.toJSON()), /spec\.pdf/);
  const download = editor.root.root.find(node => node.type === "stub" && node.children.includes("下載 SPEC"));
  act(() => download.props.onClick());
  assert.equal(opened[0][0].specDocument.name, "spec.pdf");
  assert.equal(opened[0][1], true);
  assert.equal(editor.writes.length, 0);
  editor.unmount();
});

function dropSpec(editor, files, items = []) {
  const zone = editor.root.root.find(node => node.type === "section" && node.props["data-testid"] === "material-spec-dropzone");
  return zone.props.onDrop({ preventDefault() {}, stopPropagation() {}, dataTransfer: { files, items, types: ["Files"] } });
}

test("dropping a file uploads once, preserves the material draft and saves its downloadable attachment", async () => {
  const pending = deferred();
  const uploads = [];
  const editor = mountDialog({}, args => { uploads.push(args); return pending.promise; });
  editor.changeName("Keep edited name");
  act(() => { dropSpec(editor, [{ name: "datasheet.pdf" }]); dropSpec(editor, [{ name: "second.pdf" }]); });
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].workspaceId, "W");
  assert.equal(uploads[0].recordId, "part-A");
  assert.equal(editor.button().props.disabled, true);
  await act(async () => pending.resolve({ name: "datasheet.pdf", path: "W/part-A/spec.pdf" }));
  await act(async () => editor.button().props.onClick());
  assert.equal(editor.writes[0].name, "Keep edited name");
  assert.equal(editor.writes[0].specDocument.path, "W/part-A/spec.pdf");
  editor.unmount();
});

test("multi-file and folder drops report errors instead of silently replacing the existing SPEC", async () => {
  let uploads = 0;
  const editor = mountDialog({ record: { ...baseRecord, specDocument: { name: "old.pdf", path: "old" } } }, async () => { uploads++; });
  await act(async () => dropSpec(editor, [{ name: "a.pdf" }, { name: "b.pdf" }]));
  await act(async () => dropSpec(editor, [{ name: "folder" }], [{ webkitGetAsEntry: () => ({ isDirectory: true }) }]));
  assert.equal(uploads, 0);
  assert.match(JSON.stringify(editor.toasts), /一次上傳一份 SPEC/);
  assert.match(JSON.stringify(editor.toasts), /請拖入文件/);
  await act(async () => editor.button().props.onClick());
  assert.equal(editor.writes[0].specDocument.path, "old");
  editor.unmount();
});

test("read-only drops never upload and late uploads do not attach to another editor session", async () => {
  let uploads = 0;
  const pending = deferred();
  const editor = mountDialog({ mode: "view" }, () => { uploads++; return pending.promise; });
  act(() => dropSpec(editor, [{ name: "ignored.pdf" }]));
  assert.equal(uploads, 0);
  editor.update({ mode: "edit" });
  act(() => dropSpec(editor, [{ name: "late.pdf" }]));
  editor.update({ open: false });
  editor.update({ open: true, record: { ...baseRecord, id: "part-B", name: "Other material" } });
  await act(async () => pending.resolve({ name: "late.pdf", path: "old-record/late.pdf" }));
  assert.doesNotMatch(JSON.stringify(editor.root.toJSON()), /late\.pdf/);
  assert.equal(editor.button().props.disabled, false);
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
