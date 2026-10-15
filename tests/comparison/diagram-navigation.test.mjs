import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const accountA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const accountB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
const children = node => !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(children)];
const text = node => typeof node === "string" || typeof node === "number" ? String(node) : !node || typeof node !== "object" ? "" : [node.props?.children].flat(Infinity).map(text).join("");

function hooks() {
  const states = [], refs = [], memos = [], effects = [];
  let stateIndex = 0, refIndex = 0, memoIndex = 0, effectIndex = 0;
  const changed = (before, after) => !before || !after || before.length !== after.length || after.some((value, index) => !Object.is(value, before[index]));
  const react = {
    Suspense: "Suspense", lazy: () => "LazyDiagramEditor",
    useState(initial) { const index = stateIndex++; if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial; return [states[index], next => { states[index] = typeof next === "function" ? next(states[index]) : next; }]; },
    useRef(initial) { const index = refIndex++; return refs[index] ??= { current: initial }; },
    useMemo(make, dependencies) { const index = memoIndex++; if (!memos[index] || changed(memos[index].dependencies, dependencies)) memos[index] = { value: make(), dependencies }; return memos[index].value; },
    useCallback(callback, dependencies) { return react.useMemo(() => callback, dependencies); },
    useEffect(setup, dependencies) { const index = effectIndex++; if (!effects[index] || changed(effects[index].dependencies, dependencies)) { effects[index]?.cleanup?.(); effects[index] = { setup, dependencies, pending: true }; } },
  };
  return {
    react,
    reset() { stateIndex = refIndex = memoIndex = effectIndex = 0; },
    async flush() { for (const effect of effects) if (effect.pending) { effect.pending = false; effect.cleanup = effect.setup(); } await new Promise(resolve => setImmediate(resolve)); },
    dispose() { for (const effect of effects) effect.cleanup?.(); },
  };
}

function component(path, exported, replacements) {
  const hook = hooks();
  const source = ts.transpileModule(readFileSync(new URL(`../../src/components/comparison/${path}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  class BrowserURL extends URL { static createObjectURL() { return "blob:synthetic"; } static revokeObjectURL() {} }
  const context = {
    exports, URL: BrowserURL, URLSearchParams, Blob, TextEncoder, console,
    require(name) {
      if (name === "react") return hook.react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name in replacements) return replacements[name];
      return new Proxy({}, { get: (_, key) => String(key) });
    },
  };
  vm.runInNewContext(source, context, { filename: path });
  return { ...hook, render(props) { hook.reset(); return exports[exported](props); } };
}

function session() {
  return { version: 1, id: '["QA","EVT","DVT"]', projectName: "QA", replies: {}, history: [], savedAt: "2026-10-15T00:00:00Z", result: { rows: [], inputIssues: [], warnings: [], library: [], artifacts: [], meta: { a: { label: "EVT" }, b: { label: "DVT" }, tool_version: "QA" } } };
}

function workspace(tab = "diagram", stored = []) {
  let currentAccount = accountA;
  let editable = true;
  const filters = { tab };
  const updates = [];
  const harness = component("ComparisonWorkspace.tsx", "default", {
    "@/components/auth/UserContext": { useUser: () => ({ user: { userId: currentAccount, displayName: "QA" } }) },
    "@/hooks/usePermissions": { usePermissions: () => ({ canEditModule: () => editable }) },
    "@/hooks/useWorkspaceMutationScope": { useWorkspaceMutationScope: () => ({}) },
    "./useComparisonFilters": { useComparisonFilters: () => ({ filters, update(key, value) { updates.push([key, value]); filters[key] = value; }, clear() {} }) },
    "./runtime": { ComparisonRuntime: class { cancel() {} } },
    "./storage": { async listSessions(id) { return id === accountA ? stored : []; }, async readLibrary() { return "devices: []\n"; } },
    "./files": { inspectRevision: () => ({}), validateRevision: () => [], formatBytes: bytes => `${bytes} B` },
    "./datasheetSelection": {},
  });
  let tree;
  const render = () => tree = harness.render();
  return {
    render,
    async settle() { for (let index = 0; index < 3; index++) { await harness.flush(); render(); } },
    get tree() { return tree; },
    editor() { return children(tree).find(node => node.type === "LazyDiagramEditor"); },
    chart() { return children(tree).find(node => node.type === "ComparisonCharts"); },
    setAccount(value) { currentAccount = value; }, setEditable(value) { editable = value; },
    updates, dispose: harness.dispose,
  };
}

test("the diagram tab opens a lazily loaded editor without requiring a comparison session", async () => {
  const harness = workspace();
  harness.render(); await harness.settle();
  const editor = harness.editor();
  assert.ok(editor);
  assert.equal(editor.key, accountA);
  assert.equal(editor.props.accountId, accountA);
  assert.equal(editor.props.session, null);
  assert.equal(editor.props.canEdit, true);
  assert.equal(editor.props.initialSource, undefined);
  assert.ok(children(harness.tree).some(node => node.type === "Suspense"));
  assert.doesNotMatch(text(harness.tree), /先建立一份比對/);
  const header = children(harness.tree).find(node => node.type === "MaintenancePageHeader");
  const feedback = children(header.props.actions).find(node => node.type === "ComparisonFeedback");
  assert.equal(feedback.props.tab, "compare");
  assert.match(feedback.props.projectName, /圖表編輯器/);
  harness.dispose();
});

test("editing a chart navigates to the editor with the B revision exactly until the request is consumed", async () => {
  for (const kind of ["power", "i2c"]) {
    const stored = session();
    const harness = workspace(kind, [stored]);
    harness.render(); await harness.settle();
    harness.chart().props.onEdit(kind);
    harness.render();
    const editor = harness.editor();
    assert.deepEqual(harness.updates.at(-1), ["tab", "diagram"]);
    assert.equal(editor.props.initialSource.kind, kind);
    assert.equal(editor.props.initialSource.revision, "b");
    assert.equal(editor.props.session, stored);
    const initialSource = editor.props.initialSource;
    harness.render();
    assert.equal(harness.editor().props.initialSource, initialSource, "Unrelated parent renders must not create another import request");
    editor.props.onSourceConsumed(); harness.render();
    assert.equal(harness.editor().props.initialSource, undefined);
    harness.dispose();
  }
});

test("account switching removes the previous session and import request before account effects complete", async () => {
  const harness = workspace("power", [session()]);
  harness.render(); await harness.settle();
  harness.chart().props.onEdit("power"); harness.render();
  assert.ok(harness.editor().props.initialSource);
  harness.setAccount(accountB); harness.render();
  const editor = harness.editor();
  assert.equal(editor.key, accountB);
  assert.equal(editor.props.accountId, accountB);
  assert.equal(editor.props.session, null);
  assert.equal(editor.props.initialSource, undefined);
  await harness.settle();
  assert.equal(harness.editor().props.session, null);
  harness.dispose();
});

test("read-only accounts cannot request chart imports and receive a read-only blank editor", async () => {
  const harness = workspace("power", [session()]);
  harness.setEditable(false);
  harness.render(); await harness.settle();
  assert.equal(harness.chart().props.canEdit, false);
  harness.chart().props.onEdit("power");
  assert.deepEqual(harness.updates, []);
  harness.dispose();
  const blank = workspace(); blank.setEditable(false); blank.render(); await blank.settle();
  assert.equal(blank.editor().props.canEdit, false);
  blank.dispose();
});

test("chart toolbar sends its own chart kind and disables editing when not authorized", () => {
  const edits = [];
  const harness = component("ComparisonCharts.tsx", "ComparisonCharts", {
    "./diagramViews": { readDiagramViews: () => ({ compact: "<svg></svg>", expanded: "" }) },
  });
  for (const kind of ["power", "i2c"]) {
    const tree = harness.render({ kind, canEdit: true, onEdit: value => edits.push(value) });
    const edit = children(tree).find(node => node.type === "Button" && text(node) === "編輯此圖");
    assert.equal(edit.props.disabled, false);
    edit.props.onClick();
  }
  assert.deepEqual(edits, ["power", "i2c"]);
  const tree = harness.render({ kind: "power", canEdit: false, onEdit: value => edits.push(value) });
  const edit = children(tree).find(node => node.type === "Button" && text(node) === "編輯此圖");
  assert.equal(edit.props.disabled, true);
  edit.props.onClick();
  assert.deepEqual(edits, ["power", "i2c"]);
});
