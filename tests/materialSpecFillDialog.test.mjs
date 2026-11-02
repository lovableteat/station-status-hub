import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const native = createRequire(import.meta.url);
const { React, create, act, flush, deferred, loader } = native("./support/renderHarness.cjs");
const record = id => ({ id, manufacturerPartNumber: "MPN-" + id, manufacturer: "QA", name: "Part", refDes: "U" + id, specDocuments: [{ name: id + ".pdf", path: "qa/" + id + ".pdf", size: 20 }] });
const answer = { title: "Answer", columns: ["Voltage"], rows: [[{ value: "1.20 V", kind: "label" }]], warnings: [], partMatch: "matched" };
function fixture() {
  const calls = [], jobs = [];
  const mocks = { analyzeSpecFill: input => { calls.push(input); const job = deferred(); jobs.push(job); return job.promise; },
    loadSpecFillModels: async () => [{ id: "m", label: "QA", record: {} }],
    downloadSpecForFill: async () => new Blob(["SPEC"]), canReadSpecForFill: () => true, SPEC_FILL_ACCEPT: ".pdf", SPEC_FILL_MAX_BYTES: 18 * 1024 * 1024 };
  const load = loader({ mocks: { "./materialSpecFillService": mocks }, globals: { Blob, File } });
  const { MaterialSpecFillDialog } = load("src/components/material-requests/MaterialSpecFillDialog.tsx");
  let root;
  act(() => { root = create(React.createElement(MaterialSpecFillDialog, { records: [record("1"), record("2")], workspaceName: "QA", open: true, onOpenChange() {} })); });
  const nodes = () => root.root;
  const button = name => nodes().findAll(node => node.type === "stub" && node.props.onClick && React.Children.toArray(node.props.children).some(child => typeof child === "string" && child.includes(name)))[0];
  const photo = new File(["test"], "form.png", { type: "image/png" });
  const prepare = () => act(() => { nodes().findByProps({ "aria-label": "選擇表格照片檔案" }).props.onChange({ target: { files: [photo], value: "" } }); nodes().findAllByType("input").find(node => node.props.type === "checkbox").props.onChange({ target: { checked: true } }); });
  return { get root() { return root; }, nodes, button, prepare, calls, jobs };
}

test("requires a template photo and selected SPEC; cancellation and part changes discard late results", async () => {
  const f = fixture();
  try {
    await flush();
    assert.equal(f.button("開始依照片填表").props.disabled, true);
    f.prepare();
    assert.equal(f.button("開始依照片填表").props.disabled, false);
    act(() => f.button("開始依照片填表").props.onClick()); await flush();
    assert.equal(f.calls.length, 1);
    act(() => f.button("停止分析").props.onClick());
    assert.equal(f.calls[0].signal.aborted, true);
    act(() => f.nodes().findByProps({ "aria-label": "指定料件" }).props.onChange({ target: { value: "2" } }));
    f.jobs[0].resolve(answer); await flush();
    assert.equal(f.nodes().findAllByProps({ "aria-label": "依照片填表結果" }).length, 0);
    assert.equal(f.button("開始依照片填表").props.disabled, true, "old SPEC selection is cleared for another part");
    assert.equal(f.nodes().findByProps({ "aria-label": "指定料件" }).props.value, "2");
  } finally { act(() => f.root.unmount()); }
});

test("closing/account remount aborts pending work and never carries a result into another account", async () => {
  const f = fixture(); await flush(); f.prepare();
  act(() => f.button("開始依照片填表").props.onClick()); await flush();
  act(() => f.root.unmount());
  assert.equal(f.calls[0].signal.aborted, true);
  const next = fixture(); await flush();
  try {
    f.jobs[0].resolve(answer); await flush();
    assert.equal(next.nodes().findAllByProps({ "aria-label": "依照片填表結果" }).length, 0);
    assert.equal(next.button("開始依照片填表").props.disabled, true);
  } finally { act(() => next.root.unmount()); }
});
