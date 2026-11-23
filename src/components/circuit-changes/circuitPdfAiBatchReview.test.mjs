import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const { loader, deferred } = createRequire(import.meta.url)("../../../tests/support/renderHarness.cjs");
const service = () => {
  const load = loader();
  return { ...load("src/components/circuit-changes/circuitPdfAiBatchReview.ts"), ...load("src/components/api-management/aiRequestRecovery.ts") };
};
const plain = value => JSON.parse(JSON.stringify(value));
const report = page => ({ id: `report-${page.workingPage}`, workingPage: page.workingPage, officialPage: page.officialPage });
const settle = () => new Promise(resolve => setImmediate(resolve));
const quick = { attempts: 3, answerAttempts: 2, backoffMs: [1, 1], networkWaitsMs: [1, 1, 1], stopAfterFailures: 3, saveBackoffMs: [1, 1], maxProviderWaitMs: 60_000 };

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

test("selected ranges are normalized and deduplicated, and only matched selected pages run and save", async () => {
  const { buildCircuitPdfAiBatchPages: build, parseCircuitPdfAiPageSelection: parse, runCircuitPdfAiBatchReview: run } = service();
  const selection = parse("３、1，3–5, 3", 5);
  assert.deepEqual(plain(selection), { pages: [1, 3, 4, 5] });
  const pages = build(5, 5, 1, selection.pages);
  assert.deepEqual(plain(pages).map(page => [page.workingPage, page.officialPage]), [[1, 2], [3, 4], [4, 5], [5, null]]);
  const analysed = [], saved = [];
  await run({ pages, signal: new AbortController().signal,
    analyse: async page => { analysed.push(page.workingPage); return report(page); },
    save: async value => { saved.push(value.workingPage); },
    onUpdate: () => {},
  });
  assert.deepEqual(analysed, [1, 3, 4]);
  assert.deepEqual(saved, [1, 3, 4]);
});

test("invalid selected input never creates a partial page selection", () => {
  const { parseCircuitPdfAiPageSelection: parse } = service();
  assert.deepEqual(plain(parse("   ", 56)), { pages: [] });
  for (const input of ["1,6", "1,0", "5-3", "1,3-", "1,,3", "1.5", "1-1000000000000000"]) {
    assert.equal(typeof parse(input, 5).error, "string", input);
    assert.equal(parse(input, 5).pages, undefined, input);
  }
});

test("three pages run concurrently and a slow page cannot block the other workers", async () => {
  const { buildCircuitPdfAiBatchPages: build, runCircuitPdfAiBatchReview: run, CIRCUIT_PDF_AI_BATCH_CONCURRENCY } = service();
  const analysis = deferred(), persistence = deferred(), events = [], updates = [];
  const pages = build(4, 4, 0), controller = new AbortController();
  assert.equal(CIRCUIT_PDF_AI_BATCH_CONCURRENCY, 3);
  const running = run({ pages, signal: controller.signal,
    analyse: async page => { events.push(`analyse:${page.workingPage}`); return page.workingPage === 1 ? analysis.promise : report(page); },
    save: async value => { events.push(`save:${value.workingPage}`); if (value.workingPage === 2 || value.workingPage === 3) await persistence.promise; },
    onUpdate: page => updates.push(plain(page)),
  });
  await settle();
  assert.deepEqual(events, ["analyse:1", "analyse:2", "analyse:3", "save:2", "save:3"]);
  persistence.resolve(); await settle();
  assert.deepEqual(events, ["analyse:1", "analyse:2", "analyse:3", "save:2", "save:3", "analyse:4", "save:4"]);
  assert.deepEqual(updates.filter(page => page.status === "complete").map(page => page.workingPage), [2, 3, 4]);
  analysis.resolve(report(pages[0])); await running;
  assert.deepEqual(updates.filter(page => page.workingPage === 1).map(page => page.status), ["analysing", "saving", "complete"]);
  assert.ok(pages.every(page => page.status === "pending"), "caller rows are not mutated in place");
});

test("a page that keeps failing is tried again and then marked failed, a save that keeps failing keeps the answer, and the other pages go on", async () => {
  const { buildCircuitPdfAiBatchPages: build, runCircuitPdfAiBatchReview: run } = service();
  const latest = new Map(), saved = [], analysed = [], saveTries = [], controller = new AbortController();
  await run({ pages: build(4, 4, 0), signal: controller.signal, policy: quick,
    analyse: async page => { analysed.push(page.workingPage); if (page.workingPage === 2) throw new Error("第 2 頁 AI 回覆無法讀取"); return report(page); },
    save: async value => { saveTries.push(value.workingPage); if (value.workingPage === 3) throw new Error("第 3 頁暫時無法儲存"); saved.push(value.workingPage); },
    onUpdate: page => latest.set(page.workingPage, plain(page)),
  });
  assert.deepEqual(saved.sort(), [1, 4]);
  assert.equal(analysed.filter(page => page === 2).length, 2, "an unusable answer was paid for: one more try, not three");
  assert.equal(saveTries.filter(page => page === 3).length, 3, "storing is tried again before the page is left unsaved");
  assert.equal(latest.get(1).status, "complete");
  assert.equal(latest.get(2).status, "failed"); assert.match(latest.get(2).error, /無法讀取/); assert.equal(latest.get(2).report, undefined); assert.equal(latest.get(2).attempts, 2);
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
  const pending = deferred(), controller = new AbortController(), calls = [], updates = [], pages = build(5, 5, 0);
  const running = run({ pages, signal: controller.signal,
    analyse: async page => { calls.push(`analyse:${page.workingPage}`); return pending.promise; },
    save: async value => { calls.push(`save:${value.workingPage}`); }, onUpdate: page => updates.push(plain(page)),
  });
  controller.abort(); await running;
  assert.deepEqual(calls, ["analyse:1", "analyse:2", "analyse:3"]);
  assert.deepEqual(updates.map(page => page.status), ["analysing", "analysing", "analysing", "pending", "pending", "pending"]);
  assert.ok(updates.every(page => page.report === undefined));
  pending.resolve(report(pages[0])); await settle();
  assert.deepEqual(calls, ["analyse:1", "analyse:2", "analyse:3"], "a provider that finishes after cancel cannot trigger persistence");
  assert.equal(updates.length, 6);
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
    const pending = deferred(), otherPages = deferred(), controller = new AbortController(), calls = [], updates = [];
    const running = run({ pages: build(4, 4, 0), signal: controller.signal,
      analyse: async page => { calls.push(`analyse:${page.workingPage}`); return page.workingPage === 1 ? report(page) : otherPages.promise; },
      save: async value => { calls.push(`save:${value.workingPage}`); await pending.promise; }, onUpdate: page => updates.push(plain(page)),
    });
    await settle(); assert.deepEqual(calls, ["analyse:1", "analyse:2", "analyse:3", "save:1"]);
    controller.abort();
    if (failSave) pending.reject(new Error("離線")); else pending.resolve();
    await running;
    assert.deepEqual(calls, ["analyse:1", "analyse:2", "analyse:3", "save:1"]);
    assert.equal(updates.at(-1).status, failSave ? "unsaved" : "complete");
    assert.equal(updates.at(-1).report.id, "report-1");
  }
});

test("a short provider Retry-After delays new pages and retries the affected page once", async () => {
  const { buildCircuitPdfAiBatchPages: build, runCircuitPdfAiBatchReview: run, AiRequestFailure } = service();
  const calls = [], saved = [], attempts = new Map(), cooldowns = [];
  let throttledAt;
  await run({ pages: build(4, 4, 0), signal: new AbortController().signal,
    analyse: async (page, attemptNumber) => {
      const count = (attempts.get(page.workingPage) ?? 0) + 1;
      assert.equal(attemptNumber, count);
      attempts.set(page.workingPage, count); calls.push([page.workingPage, Date.now()]);
      if (page.workingPage === 1 && count === 1) {
        throttledAt = Date.now(); throw new AiRequestFailure("等候額度恢復", "minute-quota", 50);
      }
      return report(page);
    },
    save: async value => saved.push(value.workingPage), onUpdate: () => {}, onCooldown: until => cooldowns.push(until), policy: quick,
  });
  assert.deepEqual([...attempts], [[1, 2], [2, 1], [3, 1], [4, 1]]);
  assert.ok(calls.slice(3).every(([, time]) => time - throttledAt >= 50));
  assert.equal(cooldowns.length, 1);
  assert.ok(cooldowns[0] >= throttledAt + 50);
  assert.deepEqual(saved.sort(), [1, 2, 3, 4]);
});

test("stopping during a rate-limit pause cancels the scheduled retry", async () => {
  const { buildCircuitPdfAiBatchPages: build, runCircuitPdfAiBatchReview: run, AiRequestFailure } = service();
  const controller = new AbortController(), paused = deferred(), calls = [], updates = [];
  const running = run({ pages: build(1, 1, 0), signal: controller.signal,
    analyse: async (page, attemptNumber) => {
      calls.push(attemptNumber); throw new AiRequestFailure("等待額度", "minute-quota", 2_000);
    },
    save: async () => assert.fail("cancelled analysis cannot save"),
    onUpdate: page => updates.push(page.status), onCooldown: paused.resolve,
  });
  await paused.promise; controller.abort(); await running;
  assert.deepEqual(calls, [1]);
  assert.deepEqual(updates, ["analysing", "pending"]);
});

test("a provider-wide limit leaves waiting pages untouched and still saves completed analyses", async () => {
  const { buildCircuitPdfAiBatchPages: build, runCircuitPdfAiBatchReview: run, AiRequestFailure } = service();
  const calls = [], saved = [], latest = new Map();
  await assert.rejects(run({ pages: build(5, 5, 0), signal: new AbortController().signal,
    analyse: async page => {
      calls.push(page.workingPage);
      if (page.workingPage === 1) throw new AiRequestFailure("今日額度已用完", "daily-quota");
      return report(page);
    },
    save: async value => saved.push(value.workingPage), onUpdate: page => latest.set(page.workingPage, page.status),
  }), /今日額度已用完/);
  assert.deepEqual(calls, [1, 2, 3]);
  assert.deepEqual(saved.sort(), [2, 3]);
  assert.deepEqual([...latest], [[1, "failed"], [2, "complete"], [3, "complete"]]);
});

test("an already cancelled queue makes no provider, storage, or progress calls", async () => {
  const { buildCircuitPdfAiBatchPages: build, runCircuitPdfAiBatchReview: run } = service();
  const controller = new AbortController(); controller.abort();
  await run({ pages: build(2, 2, 0), signal: controller.signal,
    analyse: async () => assert.fail("must not analyse"), save: async () => assert.fail("must not save"), onUpdate: () => assert.fail("must not update"),
  });
});

// 2026-11-19: failures used to need a manual retry per page, and a network drop failed every remaining page.
test("a timeout, a busy provider or a dropped answer is retried by itself with the attempt number passed on", async () => {
  const { buildCircuitPdfAiBatchPages: build, runCircuitPdfAiBatchReview: run, AiRequestFailure } = service();
  const tries = new Map(), latest = new Map(), waits = [];
  await run({ pages: build(3, 3, 0), signal: new AbortController().signal, policy: quick,
    analyse: async (page, attempt) => {
      tries.set(page.workingPage, [...(tries.get(page.workingPage) ?? []), attempt]);
      if (page.workingPage === 1 && attempt < 3) throw new AiRequestFailure("逾時", "timeout");
      if (page.workingPage === 2 && attempt === 1) throw new AiRequestFailure("繁忙", "busy");
      return report(page);
    },
    save: async () => {}, onUpdate: page => latest.set(page.workingPage, page.status), onWait: wait => waits.push(wait?.kind ?? null),
  });
  assert.deepEqual(plain([...tries]), [[1, [1, 2, 3]], [2, [1, 2]], [3, [1]]]);
  assert.deepEqual([...latest.values()], ["complete", "complete", "complete"]);
  assert.ok(waits.includes("retry") && waits.includes("provider"));
  assert.equal(waits.at(-1), null, "nothing is shown as waiting once the batch is over");
});

test("while the network is down no page fails: the batch waits, and goes on by itself when the connection is back", async () => {
  const { buildCircuitPdfAiBatchPages: build, runCircuitPdfAiBatchReview: run, AiRequestFailure } = service();
  let offline = 2;
  const statuses = [], attempts = [];
  await run({ pages: build(2, 2, 0), signal: new AbortController().signal, policy: quick,
    analyse: async (page, attempt) => {
      attempts.push([page.workingPage, attempt]);
      if (offline > 0) { offline--; throw new AiRequestFailure(offline ? "AI 連線暫時中斷。" : "無法確認本系統用量紀錄", offline ? "network" : "tracking"); }
      return report(page);
    },
    save: async () => {}, onUpdate: page => statuses.push([page.workingPage, page.status]),
  });
  assert.ok(statuses.every(([, status]) => status !== "failed"));
  assert.deepEqual(statuses.filter(([, status]) => status === "complete").map(([page]) => page).sort(), [1, 2]);
  assert.ok(attempts.every(([, attempt]) => attempt === 1), "a request that never reached the provider does not use up an attempt");
});

test("a connection that does not come back pauses the batch with every unfinished page still waiting", async () => {
  const { buildCircuitPdfAiBatchPages: build, runCircuitPdfAiBatchReview: run, AiRequestFailure, CircuitPdfAiBatchStop } = service();
  const latest = new Map(), saved = [];
  let calls = 0;
  const failure = await run({ pages: build(6, 6, 0), signal: new AbortController().signal, policy: quick,
    analyse: async page => { calls++; if (page.workingPage === 1 && calls === 1) return report(page); throw new AiRequestFailure("AI 連線暫時中斷。", "network"); },
    save: async value => saved.push(value.workingPage), onUpdate: page => latest.set(page.workingPage, page.status),
  }).then(() => null, error => error);
  assert.ok(failure instanceof CircuitPdfAiBatchStop);
  assert.equal(failure.reason, "network");
  assert.deepEqual(saved, [1]);
  assert.ok([...latest].every(([page, status]) => page === 1 ? status === "complete" : status === "pending"), JSON.stringify([...latest]));
  assert.ok(calls < 20, "the waits are shared, not multiplied by the pages in flight");
});

test("pages failing one after another stop the batch before more tokens are spent, and a success in between starts the count again", async () => {
  const { buildCircuitPdfAiBatchPages: build, runCircuitPdfAiBatchReview: run, AiRequestFailure, CircuitPdfAiBatchStop } = service();
  const analysed = new Set(), latest = new Map();
  const failure = await run({ pages: build(12, 12, 0), signal: new AbortController().signal, policy: quick,
    analyse: async page => { analysed.add(page.workingPage); if (page.workingPage === 2) return report(page); throw new AiRequestFailure("逾時", "timeout"); },
    save: async () => {}, onUpdate: page => latest.set(page.workingPage, page.status),
  }).then(() => null, error => error);
  assert.ok(failure instanceof CircuitPdfAiBatchStop);
  assert.equal(failure.reason, "failures");
  assert.match(failure.message, /連續 3 頁比對失敗/);
  assert.ok(analysed.size <= 8, `stopped early, asked for ${analysed.size} of 12 pages`);
  assert.equal(latest.get(2), "complete");
  assert.ok([...latest.values()].filter(status => status === "failed").length >= 3);
  assert.ok(!latest.has(12), "pages not started stay as they were");
});

test("a request the provider rejects as malformed is not sent again, and a long provider pause stops the batch at once", async () => {
  const { buildCircuitPdfAiBatchPages: build, runCircuitPdfAiBatchReview: run, AiRequestFailure } = service();
  const calls = [];
  await run({ pages: build(1, 1, 0), signal: new AbortController().signal, policy: quick,
    analyse: async page => { calls.push(page.workingPage); throw new AiRequestFailure("AI 請求內容無法使用", "invalid"); }, save: async () => {}, onUpdate: () => {},
  });
  assert.deepEqual(calls, [1]);
  const latest = new Map();
  await assert.rejects(run({ pages: build(4, 4, 0), signal: new AbortController().signal, policy: quick,
    analyse: async () => { throw new AiRequestFailure("每分鐘額度已滿", "minute-quota", 10 * 60_000); }, save: async () => {}, onUpdate: page => latest.set(page.workingPage, page.status),
  }), /每分鐘額度已滿/);
  assert.ok([...latest.values()].every(status => status === "pending"), "nothing is marked failed for a pause the provider asked for");
});

test("an answer that cannot be stored because the connection is gone waits for it and is stored without another AI request", async () => {
  const { buildCircuitPdfAiBatchPages: build, runCircuitPdfAiBatchReview: run, AiRequestFailure, CircuitPdfAiBatchStop } = service();
  let offline = 3, analysed = 0;
  const latest = new Map(), waits = [];
  await run({ pages: build(2, 2, 0), signal: new AbortController().signal, policy: { ...quick, networkWaitsMs: [1, 1, 1, 1, 1] },
    analyse: async page => { analysed++; return report(page); },
    save: async () => { if (offline > 0) { offline--; throw new AiRequestFailure("無法連到系統", "network"); } },
    onUpdate: page => latest.set(page.workingPage, page.status), onWait: wait => waits.push(wait?.kind ?? null),
  });
  assert.equal(analysed, 2, "the paid answers are not asked for again");
  assert.deepEqual([...latest.values()], ["complete", "complete"]);
  assert.ok(waits.includes("network"));
  // A connection that stays away keeps the answers on their pages and pauses the batch.
  const kept = new Map();
  const failure = await run({ pages: build(2, 2, 0), signal: new AbortController().signal, policy: quick,
    analyse: async page => report(page), save: async () => { throw new AiRequestFailure("無法連到系統", "network"); }, onUpdate: page => kept.set(page.workingPage, plain(page)),
  }).then(() => null, error => error);
  assert.ok(failure instanceof CircuitPdfAiBatchStop);
  assert.equal(failure.reason, "network");
  assert.ok([...kept.values()].every(page => page.status === "unsaved" ? page.report.id === `report-${page.workingPage}` : page.status === "pending"), JSON.stringify([...kept.values()].map(page => page.status)));
  assert.ok([...kept.values()].some(page => page.status === "unsaved"));
});

// 2026-11-23 「我在另一個電腦比對完成，為何換一個電腦看不到了」: the list must come from what is stored, not from this window.
test("opening the review lists every stored result of the pair, also one saved against another baseline page", () => {
  const { restoreCircuitPdfAiBatchPages: restore } = service();
  const key = (officialPage, workingPage) => `A>B:${officialPage}:${workingPage}`;
  const saved = (officialPage, workingPage, createdAt, id = `${officialPage}:${workingPage}:${createdAt}`) => ({ id, key: key(officialPage, workingPage), officialPage, workingPage, createdAt });
  const reports = [
    saved(1, 1, "2026-11-23T01:00:00Z", "old"), saved(1, 1, "2026-11-23T02:00:00Z", "new"),
    saved(2, 2, "2026-11-23T01:00:00Z"),
    // Page 3 was compared with baseline page 4 on a computer whose pin said so; here the match says 3.
    saved(4, 3, "2026-11-23T01:00:00Z", "pinned"),
  ];
  const pages = plain(restore(5, 5, page => page, reports, key));
  assert.deepEqual(pages.map(page => [page.workingPage, page.officialPage, page.status, page.report?.id ?? null]), [
    [1, 1, "complete", "new"], [2, 2, "complete", "2:2:2026-11-23T01:00:00Z"], [3, 4, "complete", "pinned"], [4, 4, "pending", null], [5, 5, "pending", null],
  ]);
  assert.deepEqual(plain(restore(3, 3, page => page, [], key)).map(page => page.status), ["pending", "pending", "pending"], "nothing stored: nothing complete");
});
