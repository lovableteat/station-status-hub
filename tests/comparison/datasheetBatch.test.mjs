import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../../src/components/comparison/ComparisonLibrary.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const emptyLibrary = { entries: [], yaml: "devices: []\n", errors: [], warnings: [] };
const turn = () => new Promise(resolve => setImmediate(resolve));

function nodes(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}
function content(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object") return "";
  return [node.props?.children].flat(Infinity).map(content).join("");
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function pdf(path, read = async () => new ArrayBuffer(8)) {
  return { name: path.split("/").at(-1), webkitRelativePath: path, size: 8, reads: 0, arrayBuffer() { this.reads++; return read(); } };
}
function draft(payload) {
  return { entry: { name: payload.name, verified: false }, entry_yaml: `name: ${payload.name}\nsource: ${payload.file.path}\n`, pages: [1], notes: [], pageTexts: [{ page: 1, text: `Original PDF: ${payload.file.path}` }] };
}
async function until(predicate) {
  for (let index = 0; index < 40; index++) {
    if (predicate()) return;
    await turn();
  }
  assert.fail("expected asynchronous batch state was not reached");
}

async function libraryHarness({ datasheet = async payload => draft(payload), library = async () => emptyLibrary } = {}) {
  const state = [], refs = [], effects = [], jobs = new Set();
  const calls = [], saves = [], published = [], entries = [];
  let cursor = 0, refCursor = 0, effectCursor = 0, tree, unmounted = false;
  let activeRequests = 0, maximumRequests = 0, writesAfterUnmount = 0;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], value => {
        if (unmounted) writesAfterUnmount++;
        state[index] = typeof value === "function" ? value(state[index]) : value;
      }];
    },
    useRef(initial) { const index = refCursor++; return refs[index] ??= { current: initial }; },
    useEffect(effect, deps) {
      const index = effectCursor++;
      if (!effects[index] || deps.some((value, position) => value !== effects[index].deps[position])) {
        effects[index]?.cleanup?.();
        effects[index] = { deps, pending: effect };
      }
    },
  };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const context = {
    exports: {}, URL, URLSearchParams,
    window: { location: { search: "", href: "https://example.test/?workspace=comparison&comparisonTab=library" }, addEventListener() {}, removeEventListener() {} },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "./files") return { filePath: file => file.webkitRelativePath || file.name };
      if (name === "./datasheetSelection") return { DATASHEET_FILE_LIMIT: 64 * 1024 * 1024, DATASHEET_COUNT_LIMIT: 1000 };
      return new Proxy({}, { get: (_, key) => key === "replaceWorkspaceHistory" ? () => {} : String(key) });
    },
  };
  vm.runInNewContext(compiled, context, { filename: "ComparisonLibrary.tsx" });
  const runtime = {
    generation: 0,
    async request(type, payload) {
      calls.push({ type, payload });
      if (type === "library") return library(payload);
      assert.equal(type, "datasheet");
      activeRequests++;
      maximumRequests = Math.max(maximumRequests, activeRequests);
      try { return await datasheet(payload); }
      finally { activeRequests--; }
    },
  };
  const props = {
    runtime, yaml: emptyLibrary.yaml, entries, canEdit: true, signedBy: "Reviewer", busy: false,
    onEntries(next) { published.push(next); entries.splice(0, entries.length, ...next); },
    onSave: async yaml => { saves.push(yaml); },
    runJob(work) {
      const job = (async () => { try { return await work(); } catch { return undefined; } })();
      jobs.add(job);
      void job.finally(() => jobs.delete(job));
      return job;
    },
  };
  const render = () => {
    cursor = 0; refCursor = 0; effectCursor = 0;
    tree = context.exports.ComparisonLibrary(props);
    return tree;
  };
  const settle = async () => {
    while (jobs.size) await Promise.all([...jobs]);
    await turn();
    if (!unmounted) render();
  };
  const button = label => nodes(tree).find(node => node.type === "Button" && content(node) === label);
  const picker = () => nodes(tree).find(node => node.type === "Select" && nodes(node).some(child => child.props["aria-label"] === "要核對的 Datasheet"));
  const select = path => { picker().props.onValueChange(path); render(); };
  const candidate = () => nodes(tree).find(node => node.type === "Textarea" && node.props.id === "compare-entry-yaml")?.props.value;
  const choose = files => { nodes(tree).find(node => node.type === "DatasheetFiles").props.onChange(files); render(); };
  const start = () => { button("批次產生候選規則").props.onClick(); render(); };
  const unmount = () => { effects.forEach(effect => effect.cleanup?.()); unmounted = true; };
  render();
  for (const effect of effects) {
    if (effect.pending) { const pending = effect.pending; delete effect.pending; effect.cleanup = pending(); }
  }
  await settle();
  return {
    render, settle, choose, start, select, candidate, button, unmount, runtime, props, calls, saves, published,
    get tree() { return tree; },
    get maximumRequests() { return maximumRequests; },
    get writesAfterUnmount() { return writesAfterUnmount; },
    get datasheetCalls() { return calls.filter(call => call.type === "datasheet"); },
  };
}

test("batch extraction is sequential, retains successful PDFs around a failure, and never saves candidates automatically", async () => {
  const harness = await libraryHarness({ datasheet: async payload => {
    await turn();
    if (payload.file.path.endsWith("bad.pdf")) throw new Error("Unreadable PDF");
    return draft(payload);
  } });
  harness.choose([pdf("IC/first.pdf"), pdf("IC/bad.pdf"), pdf("IC/last.pdf")]);
  harness.start();
  await harness.settle();
  assert.deepEqual(harness.datasheetCalls.map(call => call.payload.file.path), ["IC/first.pdf", "IC/bad.pdf", "IC/last.pdf"]);
  assert.equal(harness.maximumRequests, 1);
  assert.match(content(harness.tree), /待核對 2 份.*失敗 1 份/);
  assert.match(harness.candidate(), /source: IC\/first\.pdf/);
  harness.select("IC/bad.pdf");
  assert.equal(harness.candidate(), undefined);
  assert.match(content(harness.tree), /Unreadable PDF/);
  harness.select("IC/last.pdf");
  assert.match(harness.candidate(), /source: IC\/last\.pdf/);
  assert.deepEqual(harness.saves, []);
  assert.equal(harness.published.length, 1, "only the initial library load may publish active rules");
  harness.start();
  await harness.settle();
  assert.deepEqual(harness.datasheetCalls.slice(3).map(call => call.payload.file.path), ["IC/bad.pdf"], "retry must preserve completed candidates");
});

test("same-named PDFs from different subfolders retain distinct candidate names and source paths", async () => {
  const harness = await libraryHarness();
  harness.choose([pdf("VendorA/part.pdf"), pdf("VendorB/part.pdf")]);
  harness.start();
  await harness.settle();
  assert.deepEqual(harness.datasheetCalls.map(call => call.payload.name), ["VendorA/part", "VendorB/part"]);
  assert.match(harness.candidate(), /VendorA\/part/);
  harness.select("VendorB/part.pdf");
  assert.match(harness.candidate(), /VendorB\/part/);
  assert.doesNotMatch(harness.candidate(), /VendorA/);
  harness.select("VendorA/part.pdf");
  assert.match(harness.candidate(), /VendorA\/part/);
});

test("cancelling while file bytes are pending prevents engine dispatch and later files, then unlocks retry", async () => {
  const reading = deferred();
  const first = pdf("first.pdf", () => reading.promise), second = pdf("second.pdf");
  const harness = await libraryHarness();
  harness.choose([first, second]); harness.start();
  await until(() => first.reads === 1);
  harness.runtime.generation++;
  reading.resolve(new ArrayBuffer(8));
  await harness.settle();
  assert.equal(harness.datasheetCalls.length, 0);
  assert.equal(second.reads, 0);
  assert.match(content(harness.tree), /辨識已中斷/);
  harness.start();
  await harness.settle();
  assert.equal(harness.datasheetCalls.length, 2, "cancelled work must be retryable");
});

test("cancelling a pending engine response retains earlier successes and never starts the next PDF", async () => {
  const response = deferred();
  const harness = await libraryHarness({ datasheet: payload => payload.file.path === "pending.pdf" ? response.promise : draft(payload) });
  const third = pdf("never.pdf");
  harness.choose([pdf("completed.pdf"), pdf("pending.pdf"), third]); harness.start();
  await until(() => harness.datasheetCalls.length === 2);
  harness.runtime.generation++;
  response.resolve(draft(harness.datasheetCalls[1].payload));
  await harness.settle();
  assert.equal(harness.datasheetCalls.length, 2);
  assert.equal(third.reads, 0);
  assert.match(harness.candidate(), /completed\.pdf/);
  harness.select("pending.pdf");
  assert.equal(harness.candidate(), undefined, "late results from the cancelled runtime must be discarded");
  assert.match(content(harness.tree), /辨識已中斷/);
  assert.deepEqual(harness.saves, []);
});

test("unmounting while extraction is pending drops late state updates and prevents subsequent requests", async () => {
  const response = deferred();
  const harness = await libraryHarness({ datasheet: () => response.promise });
  const next = pdf("next.pdf");
  harness.choose([pdf("first.pdf"), next]); harness.start();
  await until(() => harness.datasheetCalls.length === 1);
  harness.unmount();
  response.resolve(draft(harness.datasheetCalls[0].payload));
  await harness.settle();
  assert.equal(harness.datasheetCalls.length, 1);
  assert.equal(next.reads, 0);
  assert.equal(harness.writesAfterUnmount, 0);
  assert.equal(harness.published.length, 1);
  assert.deepEqual(harness.saves, []);
});

test("a cancelled worker rejection stops the queue instead of being treated as a recoverable PDF error", async () => {
  const response = deferred();
  const harness = await libraryHarness({ datasheet: () => response.promise });
  const next = pdf("next.pdf");
  harness.choose([pdf("pending.pdf"), next]); harness.start();
  await until(() => harness.datasheetCalls.length === 1);
  harness.runtime.generation++;
  response.reject(new Error("已取消執行"));
  await harness.settle();
  assert.equal(harness.datasheetCalls.length, 1);
  assert.equal(next.reads, 0);
  assert.match(content(harness.tree), /辨識已中斷/);
  assert.deepEqual(harness.saves, []);
});

test("switching candidates resets confirmation and individual signoff saves only the selected candidate against current YAML", async () => {
  const harness = await libraryHarness({ library: async payload => payload.entryYaml ? { ...emptyLibrary, yaml: "signed-selected-rule", entries: [{ name: "VendorB/part", verified: true }] } : emptyLibrary });
  harness.choose([pdf("VendorA/part.pdf"), pdf("VendorB/part.pdf")]); harness.start();
  await harness.settle();
  nodes(harness.tree).find(node => node.type === "Checkbox").props.onCheckedChange(true);
  harness.render();
  assert.equal(harness.button("簽核並儲存").props.disabled, false);
  harness.select("VendorB/part.pdf");
  assert.equal(harness.button("簽核並儲存").props.disabled, true);
  const editor = nodes(harness.tree).find(node => node.type === "Textarea" && node.props["aria-label"] === "使用者位址庫 YAML");
  editor.props.onChange({ target: { value: "latest-user-library" } });
  nodes(harness.tree).find(node => node.type === "Checkbox").props.onCheckedChange(true);
  harness.render();
  harness.button("簽核並儲存").props.onClick();
  await harness.settle();
  const signoffs = harness.calls.filter(call => call.type === "library" && call.payload.entryYaml);
  assert.equal(signoffs.length, 1);
  assert.equal(signoffs[0].payload.yaml, "latest-user-library");
  assert.match(signoffs[0].payload.entryYaml, /VendorB\/part/);
  assert.doesNotMatch(signoffs[0].payload.entryYaml, /VendorA/);
  assert.deepEqual(harness.saves, ["signed-selected-rule"]);
  assert.match(content(harness.tree), /待核對 1 份.*已簽核 1 份/);
  harness.select("VendorA/part.pdf");
  assert.match(harness.candidate(), /VendorA\/part/);
  assert.equal(harness.button("簽核並儲存").props.disabled, true);
});
