import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { React, create, act, browser, deferred, loader } = require("../../../tests/support/renderHarness.cjs");
const hookFile = "src/components/circuit-changes/useCircuitPdfInk.ts";
const points = [{ x: .1, y: .2 }, { x: .6, y: .8 }];
const row = (id, extra = {}) => ({ id, documentId: "official", page: 1, points,
  color: "#ef4444", width: .002, at: "2026-11-10T01:00:00.000Z", by: "other", byName: "Other", ...extra });
const clone = value => JSON.parse(JSON.stringify(value));
const pageKey = (series, document, page) => `${series}:${document}:${page}`;

function storage() {
  const values = new Map();
  return { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), values };
}

function fixture({ local = storage(), load, save } = {}) {
  const remote = new Map();
  const calls = { loads: [], saves: [] };
  const api = {
    async loadCircuitPdfInk(series, document, page) {
      calls.loads.push({ series, document, page });
      if (load) return load(series, document, page, remote);
      return clone(remote.get(pageKey(series, document, page)) || []);
    },
    async saveCircuitPdfInk(series, document, page, change) {
      calls.saves.push({ series, document, page });
      if (save) return save(series, document, page, change, remote);
      const key = pageKey(series, document, page);
      const next = change(clone(remote.get(key) || []));
      remote.set(key, clone(next));
      return clone(next);
    },
  };
  const win = browser(); win.localStorage = local;
  const { useCircuitPdfInk } = loader({ window: win, mocks: { "./pdfInkStorage": api } })(hookFile);
  const initial = { open: true, seriesId: "series-A", userId: "user-A", userName: "Alice", canEdit: true };
  let props = initial, model, root;
  function Probe(next) { model = useCircuitPdfInk(next); return null; }
  return { remote, calls, local, get model() { return model; },
    async mount(patch = {}) { props = { ...initial, ...patch }; await act(async () => { root = create(React.createElement(Probe, props)); }); },
    async update(patch) { props = { ...props, ...patch }; await act(async () => { root.update(React.createElement(Probe, props)); }); },
    async run(callback) { await act(async () => { await callback(model); }); },
    async settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); },
    async unmount() { await act(async () => { root.unmount(); }); },
  };
}

test("saves one requested PDF page and loads the same strokes on reopen", async () => {
  const f = fixture(); await f.mount();
  await f.run(model => model.load("official", 1));
  await f.run(model => model.add("official", 1, points)); await f.settle();
  assert.equal(f.model.pages["official:1"].length, 1);
  assert.equal(f.model.pages["official:1"][0].by, "user-A");
  assert.equal(f.local.length, 0);
  assert.equal(f.model.saving, false);
  assert.deepEqual(f.calls.loads, [{ series: "series-A", document: "official", page: 1 }]);
  const saved = clone(f.remote.get("series-A:official:1"));
  await f.unmount();
  const reopened = fixture(); reopened.remote.set("series-A:official:1", saved);
  await reopened.mount(); await reopened.run(model => model.load("official", 1));
  assert.deepEqual(clone(reopened.model.pages["official:1"]), saved);
  await reopened.unmount();
});

test("failed save survives refresh and retries from the same account and series outbox", async () => {
  const local = storage();
  const failed = fixture({ local, save: async () => { throw new Error("offline"); } });
  await failed.mount(); await failed.run(model => model.add("official", 1, points)); await failed.settle();
  assert.match(failed.model.error, /保留在本機.*offline/);
  assert.equal(failed.model.pages["official:1"].length, 1);
  assert.equal(local.length, 1);
  await failed.unmount();
  const resumed = fixture({ local }); await resumed.mount(); await resumed.settle();
  assert.equal(resumed.remote.get("series-A:official:1").length, 1);
  assert.equal(resumed.model.pages["official:1"].length, 1);
  assert.equal(local.length, 0);
  assert.equal(resumed.model.error, "");
  await resumed.unmount();
});

test("undo during an in-flight add queues a tombstone and cannot resurrect the stroke", async () => {
  const gate = deferred(); let first = true;
  const f = fixture({ save: async (series, document, page, change, remote) => {
    if (first) { first = false; await gate.promise; }
    const key = pageKey(series, document, page), next = change(remote.get(key) || []);
    remote.set(key, clone(next)); return next;
  } });
  await f.mount(); await f.run(model => model.add("official", 1, points));
  await f.run(model => model.undo("official", 1));
  assert.equal(f.model.pages["official:1"].length, 0);
  await f.run(() => gate.resolve()); await f.settle();
  const saved = f.remote.get("series-A:official:1");
  assert.equal(saved.length, 1);
  assert.ok(saved[0].removedAt);
  assert.equal(saved[0].removedBy, "user-A");
  assert.equal(f.model.pages["official:1"].length, 0);
  assert.equal(f.local.length, 0);
  await f.unmount();
});

test("undo may remove the latest collaborator stroke and keeps its original actor", async () => {
  const f = fixture(); f.remote.set("series-A:official:1", [row("one"), row("two", { at: "2026-11-10T01:01:00.000Z" })]);
  await f.mount(); await f.run(model => model.load("official", 1));
  await f.run(model => model.undo("official", 1)); await f.settle();
  assert.deepEqual(clone(f.model.pages["official:1"].map(value => value.id)), ["one"]);
  const removed = f.remote.get("series-A:official:1").find(value => value.id === "two");
  assert.equal(removed.by, "other"); assert.equal(removed.removedBy, "user-A");
  assert.ok(Date.parse(removed.removedAt) > Date.parse(removed.at));
  await f.unmount();
});

test("old-account load results do not appear in the current account and read-only retry never writes", async () => {
  const gate = deferred();
  const f = fixture({ load: async series => series === "series-A" ? gate.promise : [] });
  await f.mount(); let request;
  await f.run(model => { request = model.load("official", 1); });
  await f.update({ userId: "user-B", seriesId: "series-B", canEdit: false });
  await f.run(() => gate.resolve([row("old-account")])); await request;
  assert.deepEqual(Object.keys(f.model.pages), []);
  await f.run(async model => { model.add("official", 1, points); model.remove("official", 1, "old-account"); model.undo("official", 1); await model.retry(); });
  assert.equal(f.calls.saves.length, 0);
  assert.equal(f.local.length, 0);
  await f.unmount();
});

test("pending strokes stay isolated by account and series, including read-only reopen", async () => {
  const local = storage();
  const a = fixture({ local, save: async () => { throw new Error("offline"); } });
  await a.mount(); await a.run(model => model.add("official", 1, points)); await a.settle(); await a.unmount();
  const b = fixture({ local }); await b.mount({ userId: "user-B" });
  assert.deepEqual(Object.keys(b.model.pages), []); assert.equal(b.calls.saves.length, 0); await b.unmount();
  const otherSeries = fixture({ local }); await otherSeries.mount({ seriesId: "series-B" });
  assert.deepEqual(Object.keys(otherSeries.model.pages), []); await otherSeries.unmount();
  const readOnly = fixture({ local }); await readOnly.mount({ canEdit: false });
  assert.equal(readOnly.model.pages["official:1"].length, 1);
  await readOnly.run(model => model.retry());
  assert.equal(readOnly.calls.saves.length, 0); assert.equal(local.length, 1);
  await readOnly.update({ canEdit: true }); await readOnly.settle();
  assert.equal(readOnly.remote.get("series-A:official:1").length, 1); assert.equal(local.length, 0);
  await readOnly.unmount();
});

test("local storage failure refuses a new stroke and reports the problem", async () => {
  const local = storage(); local.setItem = () => { throw new Error("quota"); };
  const f = fixture({ local }); await f.mount(); await f.run(model => model.add("official", 1, points));
  assert.match(f.model.error, /無法保留未儲存的畫筆/);
  assert.equal(f.model.pages["official:1"], undefined); assert.equal(f.calls.saves.length, 0);
  await f.unmount();
});

test("closing and reopening refreshes the visible page and ignores a previous-open read", async () => {
  const gate = deferred(); let first = true;
  const f = fixture({ load: async () => { if (first) { first = false; return gate.promise; } return [row("new")]; } });
  await f.mount(); let oldRead;
  await f.run(model => { oldRead = model.load("official", 1); });
  await f.update({ open: false }); await f.update({ open: true });
  await f.run(model => model.load("official", 1));
  await f.run(() => gate.resolve([row("old")])); await oldRead;
  assert.deepEqual(clone(f.model.pages["official:1"].map(value => value.id)), ["new"]);
  assert.equal(f.calls.loads.length, 2);
  await f.unmount();
});

test("read failure can be retried without losing pending strokes or retaining a stale error", async () => {
  let fail = true;
  const f = fixture({ load: async () => { if (fail) throw new Error("read offline"); return [row("remote")]; } });
  await f.mount(); await f.run(async model => { await assert.rejects(model.load("official", 1), /read offline/); });
  assert.match(f.model.error, /read offline/); fail = false;
  await f.run(model => model.retry());
  assert.equal(f.model.pages["official:1"].length, 1);
  assert.equal(f.model.error, "");
  await f.unmount();
});

test("saving another PDF does not hide a failed page's pending error", async () => {
  let fail = true;
  const f = fixture({ save: async (series, document, page, change, remote) => {
    if (document === "official" && fail) throw new Error("page offline");
    const key = pageKey(series, document, page), next = change(remote.get(key) || []);
    remote.set(key, clone(next)); return next;
  } });
  await f.mount(); await f.run(model => model.add("official", 1, points)); await f.settle();
  await f.run(model => model.add("working", 1, points)); await f.settle();
  assert.match(f.model.error, /page offline/);
  assert.equal(f.local.length, 1);
  fail = false; await f.run(model => model.retry());
  assert.equal(f.model.error, ""); assert.equal(f.local.length, 0);
  await f.unmount();
});

test("stored history is never truncated, and over-limit add rejects while removal remains available", async () => {
  const f = fixture(); f.remote.set("series-A:official:1", Array.from({ length: 1001 }, (_, index) => row(String(index))));
  await f.mount(); await f.run(model => model.load("official", 1));
  assert.equal(f.model.pages["official:1"].length, 1001);
  await f.run(model => model.add("official", 1, points));
  assert.match(f.model.error, /每頁最多 1000/); assert.equal(f.calls.saves.length, 0);
  await f.run(model => model.remove("official", 1, "0")); await f.settle();
  assert.equal(f.model.pages["official:1"].length, 1000);
  assert.equal(f.remote.get("series-A:official:1").length, 1001);
  await f.unmount();
});
