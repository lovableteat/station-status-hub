import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const { loader, deferred } = createRequire(import.meta.url)("../../../tests/support/renderHarness.cjs");
const service = () => loader()("src/components/circuit-changes/circuitPdfAiBatchReview.ts");
const plain = value => JSON.parse(JSON.stringify(value));
const report = page => ({ id: `report-${page.workingPage}`, workingPage: page.workingPage, officialPage: page.officialPage });
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test("every working page retains its offset counterpart or an explicit unmatched row", () => {
  const { buildCircuitPdfAiBatchPages: build } = service();
  assert.deepEqual(plain(build(4, 5, 1)), [
    { workingPage: 1, officialPage: 2, status: "pending" },
    { workingPage: 2, officialPage: 3, status: "pending" },
    { workingPage: 3, officialPage: 4, status: "pending" },
    { workingPage: 4, officialPage: null, status: "unmatched" },
    { workingPage: 5, officialPage: null, status: "unmatched" },
  ]);
  assert.deepEqual(plain(build(3, 4, -1)).map(page => page.officialPage), [null, 1, 2, 3]);
  assert.deepEqual(plain(build(0, 2, 0)).map(page => page.status), ["unmatched", "unmatched"]);
  assert.deepEqual(plain(build(10, 0, 0)), []);
});

test("the next page starts only after both analysis and persistence of the preceding page finish", async () => {
  const { buildCircuitPdfAiBatchPages: build, runCircuitPdfAiBatchReview: run } = service();
  const analysis = deferred(), persistence = deferred(), events = [], updates = [];
  const pages = build(2, 2, 0), controller = new AbortController();
  const running = run({ pages, signal: controller.signal,
    analyse: async page => { events.push(`analyse:${page.workingPage}`); return page.workingPage === 1 ? analysis.promise : report(page); },
    save: async value => { events.push(`save:${value.workingPage}`); if (value.workingPage === 1) await persistence.promise; },
    onUpdate: page => updates.push(plain(page)),
  });
  await settle();
  assert.deepEqual(events, ["analyse:1"]);
  analysis.resolve(report(pages[0])); await settle();
  assert.deepEqual(events, ["analyse:1", "save:1"]);
  persistence.resolve(); await running;
  assert.deepEqual(events, ["analyse:1", "save:1", "analyse:2", "save:2"]);
  assert.deepEqual(updates.map(page => `${page.workingPage}:${page.status}`), ["1:analysing", "1:saving", "1:complete", "2:analysing", "2:saving", "2:complete"]);
  assert.ok(pages.every(page => page.status === "pending"), "caller rows are not mutated in place");
});

test("one failed analysis or save does not discard successful pages or stop following pages", async () => {
  const { buildCircuitPdfAiBatchPages: build, runCircuitPdfAiBatchReview: run } = service();
  const latest = new Map(), saved = [], controller = new AbortController();
  await run({ pages: build(4, 4, 0), signal: controller.signal,
    analyse: async page => { if (page.workingPage === 2) throw new Error("第 2 頁來源讀取失敗"); return report(page); },
    save: async value => { if (value.workingPage === 3) throw new Error("第 3 頁暫時無法儲存"); saved.push(value.workingPage); },
    onUpdate: page => latest.set(page.workingPage, plain(page)),
  });
  assert.deepEqual(saved, [1, 4]);
  assert.equal(latest.get(1).status, "complete");
  assert.equal(latest.get(2).status, "failed"); assert.match(latest.get(2).error, /來源讀取失敗/); assert.equal(latest.get(2).report, undefined);
  assert.equal(latest.get(3).status, "unsaved"); assert.equal(latest.get(3).report.id, "report-3"); assert.match(latest.get(3).error, /無法儲存/);
  assert.equal(latest.get(4).status, "complete");
});

test("resuming retries an unsaved result without another provider call, skips saved and unmatched pages, and retries analysis failures", async () => {
  const { runCircuitPdfAiBatchReview: run } = service();
  const pages = [
    { workingPage: 1, officialPage: 1, status: "complete", report: { id: "saved" } },
    { workingPage: 2, officialPage: 2, status: "unsaved", report: { id: "keep-this-result", workingPage: 2 }, error: "offline" },
    { workingPage: 3, officialPage: 3, status: "failed", error: "provider failed" },
    { workingPage: 4, officialPage: null, status: "unmatched" },
  ], analysed = [], saved = [], updates = [];
  await run({ pages, signal: new AbortController().signal,
    analyse: async page => { analysed.push(page.workingPage); return report(page); },
    save: async value => { saved.push(value.id); }, onUpdate: page => updates.push(plain(page)),
  });
  assert.deepEqual(analysed, [3]);
  assert.deepEqual(saved, ["keep-this-result", "report-3"]);
  assert.deepEqual(updates.filter(page => page.status === "complete").map(page => page.workingPage), [2, 3]);
  assert.ok(updates.every(page => !page.error));
});

test("cancellation ignores a late analyser result and leaves that page pending without scheduling another", async () => {
  const { buildCircuitPdfAiBatchPages: build, runCircuitPdfAiBatchReview: run } = service();
  const pending = deferred(), controller = new AbortController(), calls = [], updates = [], pages = build(2, 2, 0);
  const running = run({ pages, signal: controller.signal,
    analyse: async page => { calls.push(`analyse:${page.workingPage}`); return pending.promise; },
    save: async value => { calls.push(`save:${value.workingPage}`); }, onUpdate: page => updates.push(plain(page)),
  });
  controller.abort(); await running;
  assert.deepEqual(calls, ["analyse:1"]);
  assert.deepEqual(updates.map(page => page.status), ["analysing", "pending"]);
  assert.equal(updates.at(-1).report, undefined);
  pending.resolve(report(pages[0])); await settle();
  assert.deepEqual(calls, ["analyse:1"], "a provider that finishes after cancel cannot trigger persistence");
  assert.deepEqual(updates.map(page => page.status), ["analysing", "pending"]);
});

test("an aborted analysis rejection is cancellation rather than a failed page", async () => {
  const { buildCircuitPdfAiBatchPages: build, runCircuitPdfAiBatchReview: run } = service();
  const pending = deferred(), controller = new AbortController(), updates = [];
  const running = run({ pages: build(1, 1, 0), signal: controller.signal,
    analyse: () => pending.promise, save: async () => assert.fail("cancelled analysis cannot save"), onUpdate: page => updates.push(plain(page)),
  });
  controller.abort(); pending.reject(new Error("aborted")); await running;
  assert.deepEqual(updates.map(page => page.status), ["analysing", "pending"]);
  assert.ok(!updates.at(-1).error);
});

test("cancelling an in-flight save still records its outcome and never starts the next page", async () => {
  for (const failSave of [false, true]) {
    const { buildCircuitPdfAiBatchPages: build, runCircuitPdfAiBatchReview: run } = service();
    const pending = deferred(), controller = new AbortController(), calls = [], updates = [];
    const running = run({ pages: build(2, 2, 0), signal: controller.signal,
      analyse: async page => { calls.push(`analyse:${page.workingPage}`); return report(page); },
      save: async value => { calls.push(`save:${value.workingPage}`); await pending.promise; }, onUpdate: page => updates.push(plain(page)),
    });
    await settle(); assert.deepEqual(calls, ["analyse:1", "save:1"]);
    controller.abort();
    if (failSave) pending.reject(new Error("離線")); else pending.resolve();
    await running;
    assert.deepEqual(calls, ["analyse:1", "save:1"]);
    assert.equal(updates.at(-1).status, failSave ? "unsaved" : "complete");
    assert.equal(updates.at(-1).report.id, "report-1");
  }
});

test("an already cancelled queue makes no provider, storage, or progress calls", async () => {
  const { buildCircuitPdfAiBatchPages: build, runCircuitPdfAiBatchReview: run } = service();
  const controller = new AbortController(); controller.abort();
  await run({ pages: build(2, 2, 0), signal: controller.signal,
    analyse: async () => assert.fail("must not analyse"), save: async () => assert.fail("must not save"), onUpdate: () => assert.fail("must not update"),
  });
});
