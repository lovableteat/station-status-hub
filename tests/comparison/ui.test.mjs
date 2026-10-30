import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const read = path => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const librarySource = await read("src/components/comparison/ComparisonLibrary.tsx");

function libraryHarness(request) {
  const state = [], effects = [], refs = [];
  let cursor = 0, effectCursor = 0, refCursor = 0, tree;
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial; return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; },
    useRef(initial) { const index = refCursor++; return refs[index] ??= { current: initial }; },
    useEffect(effect, deps) { const index = effectCursor++; if (!effects[index] || deps.some((value, i) => value !== effects[index].deps[i])) { effects[index]?.cleanup?.(); effects[index] = { deps, setup: effect, pending: effect }; } },
  };
  const source = ts.transpileModule(librarySource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, URL, URLSearchParams, window: { location: { search: "", href: "https://example.test/?workspace=comparison&comparisonTab=library" }, addEventListener() {}, removeEventListener() {} }, require(name) { if (name === "react") return hooks; if (name === "react/jsx-runtime") return { jsx, jsxs: jsx }; return new Proxy({}, { get: (_, key) => key === "replaceWorkspaceHistory" ? () => {} : String(key) }); } };
  vm.runInNewContext(source, context);
  const entries = [], saves = [];
  const props = { runtime: { request }, yaml: "devices: []\n", entries, onEntries(next) { entries.splice(0, entries.length, ...next); }, onSave: async yaml => saves.push(yaml), canEdit: true, signedBy: "Tester", busy: false, runJob: async work => { try { return await work(); } catch { return undefined; } } };
  const render = () => { cursor = 0; effectCursor = 0; refCursor = 0; tree = context.exports.ComparisonLibrary(props); return tree; };
  const flush = async () => { for (const effect of effects) if (effect.pending) { const pending = effect.pending; delete effect.pending; effect.cleanup = pending(); } await new Promise(resolve => setImmediate(resolve)); return render(); };
  const unmount = () => effects.forEach(effect => effect.cleanup?.());
  const replayEffects = () => { unmount(); effects.forEach(effect => { effect.cleanup = effect.setup(); }); };
  return { render, flush, unmount, replayEffects, entries, saves, get tree() { return tree; } };
}
function nodes(node) { if (!node || typeof node !== "object") return []; return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]; }
function content(node) { if (typeof node === "string" || typeof node === "number") return String(node); if (!node || typeof node !== "object") return ""; return [node.props?.children].flat(Infinity).map(content).join(""); }
const result = { entries: [{ name: "Built-in device", verified: false }], yaml: "devices: []\n", errors: [], warnings: [] };

test("opening the library loads its rows automatically without saving user data", async () => {
  const requests = [];
  const harness = libraryHarness(async (...args) => { requests.push(args); return result; });
  harness.render();
  assert.match(content(harness.tree), /正在載入位址庫/);
  await harness.flush();
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], "library");
  assert.equal(harness.entries[0].name, "Built-in device");
  assert.deepEqual(harness.saves, []);
  assert.doesNotMatch(content(harness.tree), /尚未載入位址庫/);
});

test("library failure keeps the table headings and offers a working retry", async () => {
  let attempts = 0;
  const harness = libraryHarness(async () => { if (++attempts === 1) throw new Error("網路中斷"); return result; });
  harness.render(); await harness.flush();
  assert.match(content(harness.tree), /網路中斷/);
  for (const heading of ["名稱", "料號規則", "位址／類型", "驗證", "簽核／出處"]) assert.match(content(harness.tree), new RegExp(heading));
  const retry = nodes(harness.tree).find(node => node.type === "Button" && content(node) === "重新載入");
  assert.ok(retry, "retry must be reachable in the empty table");
  await retry.props.onClick(); await harness.flush();
  assert.equal(attempts, 2);
  assert.equal(harness.entries.length, 1);
});

test("invalid user rules keep available library rows visible and do not save", async () => {
  const harness = libraryHarness(async () => ({ ...result, errors: ["使用者 YAML 格式無效"] }));
  harness.render(); await harness.flush();
  assert.match(content(harness.tree), /使用者 YAML 格式無效/);
  assert.equal(harness.entries[0]?.name, "Built-in device");
  assert.deepEqual(harness.saves, []);
});

test("leaving the library discards an unfinished load result", async () => {
  let resolve;
  const harness = libraryHarness(() => new Promise(done => { resolve = done; }));
  harness.render(); await harness.flush(); assert.equal(typeof resolve, "function", "mount must initiate a load"); harness.unmount(); resolve(result);
  await new Promise(done => setImmediate(done));
  assert.equal(harness.entries.length, 0);
});

test("initial effect replay keeps one load and accepts its result", async () => {
  let resolve, requests = 0;
  const harness = libraryHarness(() => { requests++; return new Promise(done => { resolve = done; }); });
  harness.render(); await harness.flush(); harness.replayEffects();
  assert.equal(requests, 1, "initial load must not be duplicated by effect replay");
  resolve(result); await harness.flush();
  assert.equal(harness.entries.length, 1);
  assert.doesNotMatch(content(harness.tree), /載入未完成/);
});

test("results expose semantic severity and change state while filters remain persistent", async () => {
  const source = await read("src/components/comparison/ComparisonResults.tsx");
  assert.match(source, /data-severity=\{row\.severity\}/);
  assert.match(source, /comparison-row-status is-\$\{row\.status\.toLowerCase\(\)\}/);
  assert.ok(source.indexOf('className="comparison-filterbar"') < source.indexOf('<Table className="comparison-result-table"'));
  assert.match(source, /清除\$\{chip\.field\}條件/);
  assert.match(source, /onClick=\{clear\}>全部清除/);
});

test("restored results start with sources collapsed while new comparisons keep inputs open", async () => {
  const source = await read("src/components/comparison/ComparisonWorkspace.tsx");
  assert.match(source, /className="comparison-source-settings" open=\{!session\}/);
  assert.match(source, /展開來源檔案，重新比對/);
  assert.ok(source.indexOf('className="comparison-run-actions"') < source.indexOf('className="comparison-optional"'));
  const controls = source.slice(source.indexOf('className="comparison-setup-controls"'), source.indexOf('className="comparison-revision-grid"'));
  assert.match(controls, /className="comparison-project-name" data-empty=\{!projectName\.trim\(\)\}/);
  assert.match(controls, /\{!compact && runActions\}/, "desktop run controls stay on the 比對名稱 row");
  assert.ok(source.indexOf('{compact && runActions}') > source.indexOf('className="comparison-revision-grid"'), "mobile run controls follow both revision inputs");
  assert.match(controls, />必填</);
  const inputs = await readFile(new URL("../../src/components/comparison/ComparisonInputs.tsx", import.meta.url), "utf8");
  assert.match(inputs, /onDrop=\{handleDrop\}/);
  assert.match(inputs, /readDroppedFiles\(event\.dataTransfer\)/);
  assert.match(inputs, /不會跳確認視窗/);
  const datasheets = await readFile(new URL("../../src/components/comparison/DatasheetFiles.tsx", import.meta.url), "utf8");
  assert.match(datasheets, /readDroppedFiles\(event\.dataTransfer\)\.files/);
  assert.doesNotMatch(source, /<p key=\{index\}><Badge/);
});

test("optional input warnings are compact while blocking input errors start expanded", async () => {
  const source = await read("src/components/comparison/ComparisonWorkspace.tsx");
  const ast = ts.createSourceFile("Workspace.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let opening;
  function visit(node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === "details"
      && node.attributes.properties.some(attribute => attribute.name?.getText(ast) === "className" && attribute.initializer?.getText(ast) === '"comparison-input-issues"')) opening = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(opening, "input warnings must be a disclosure, not a tall always-open panel");
  const expression = opening.attributes.properties.find(attribute => attribute.name?.getText(ast) === "open").initializer.expression.getText(ast);
  for (const [inputIssues, expected] of [[[['WARN', 'Optional DSN missing']], false], [[['ERROR', 'Invalid input']], true], [[['WARN', 'Optional'], ['ERROR', 'Invalid']], true]]) {
    assert.equal(vm.runInNewContext(expression, { session: { result: { inputIssues } } }), expected);
  }
});
