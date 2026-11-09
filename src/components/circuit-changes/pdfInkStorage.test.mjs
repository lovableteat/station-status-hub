import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { loader } = require("../../../tests/support/renderHarness.cjs");
const ink = loader()("src/components/circuit-changes/circuitPdfInk.ts");
const stroke = (id, extra = {}) => ({ id, documentId: "d1", page: 2, points: [{ x: .1, y: .2 }], color: "#ef4444", width: .002,
  at: "2026-11-10T00:00:00.000Z", by: "u1", byName: "甲", ...extra });
const stored = strokes => ({ column_order: { version: 1, strokes }, updated_at: "t1" });
const key = "circuit-pdf-ink:board:d1:2";

function fakeTable() {
  const table = { rows: new Map(), calls: [], beforeUpdate: null, insertRace: null, error: null, errorAction: "", hang: "", resolveAbort: false };
  function from(name) {
    const query = { name, filters: {}, action: "select", payload: null, signal: null };
    const run = async () => {
      table.calls.push({ action: query.action, key: query.filters.table_key || query.payload?.table_key, name });
      if (table.hang === query.action) return new Promise((resolve, reject) => query.signal.addEventListener("abort", () => table.resolveAbort ? resolve({ data: null, error: { message: "AbortError" } }) : reject(new Error("aborted")), { once: true }));
      if (table.error && (!table.errorAction || table.errorAction === query.action)) return { data: null, error: table.error };
      const rowKey = query.filters.table_key || query.payload?.table_key;
      if (query.action === "select") return { data: table.rows.has(rowKey) ? { ...table.rows.get(rowKey) } : null, error: null };
      if (query.action === "insert") {
        if (table.insertRace) { table.rows.set(rowKey, stored(table.insertRace)); table.insertRace = null; return { error: { code: "23505", message: "duplicate key" } }; }
        if (table.rows.has(rowKey)) return { error: { code: "23505" } };
        table.rows.set(rowKey, stored(query.payload.column_order.strokes));
        return { error: null };
      }
      if (table.beforeUpdate) { const change = table.beforeUpdate; table.beforeUpdate = null; change(table, rowKey); }
      const row = table.rows.get(rowKey);
      if (!row || row.updated_at !== query.filters.updated_at) return { data: [], error: null };
      table.rows.set(rowKey, { column_order: query.payload.column_order, updated_at: query.payload.updated_at });
      return { data: [{ table_key: rowKey }], error: null };
    };
    const chain = {
      select() { return chain; }, insert(payload) { query.action = "insert"; query.payload = payload; return chain; }, update(payload) { query.action = "update"; query.payload = payload; return chain; },
      eq(column, value) { query.filters[column] = value; return chain; }, abortSignal(signal) { query.signal = signal; return chain; },
      maybeSingle: () => run(), then: (resolve, reject) => run().then(resolve, reject),
    };
    return chain;
  }
  return { table, supabase: { from } };
}
const load = (fake, globals = {}) => loader({ mocks: { "@/integrations/supabase/client": { supabase: fake.supabase } }, globals })("src/components/circuit-changes/pdfInkStorage.ts");
const saveMine = storage => storage.saveCircuitPdfInk("board", "d1", 2, latest => ink.mergeCircuitPdfInk(latest, [stroke("mine")]));

test("first save creates a versioned row for exactly one board, PDF and page", async () => {
  const fake = fakeTable(), storage = load(fake);
  assert.equal((await storage.loadCircuitPdfInk("board", "d1", 2)).length, 0);
  assert.equal((await saveMine(storage))[0].id, "mine");
  assert.equal(fake.table.rows.get(key).column_order.version, 1);
  assert.equal(fake.table.rows.get(key).column_order.strokes[0].id, "mine");
  assert.ok(fake.table.calls.every(call => call.key === key && call.name === "ui_table_preferences"));
  assert.equal((await storage.loadCircuitPdfInk("board", "d1", 3)).length, 0);
  assert.equal((await storage.loadCircuitPdfInk("board", "d2", 2)).length, 0);
});

test("a rejected CAS write reads again and keeps a colleague's stroke", async () => {
  const fake = fakeTable(), storage = load(fake);
  fake.table.rows.set(key, stored([]));
  fake.table.beforeUpdate = table => table.rows.set(key, { ...stored([stroke("colleague")]), updated_at: "t2" });
  await saveMine(storage);
  assert.deepEqual(fake.table.calls.map(call => call.action), ["select", "update", "select", "update"]);
  assert.deepEqual(Array.from(fake.table.rows.get(key).column_order.strokes, row => row.id).sort(), ["colleague", "mine"]);
});

test("two first saves preserve both people's strokes after the insert race", async () => {
  const fake = fakeTable(), storage = load(fake);
  fake.table.insertRace = [stroke("colleague")];
  await saveMine(storage);
  assert.deepEqual(fake.table.calls.map(call => call.action), ["select", "insert", "select", "update"]);
  assert.deepEqual(Array.from(fake.table.rows.get(key).column_order.strokes, row => row.id).sort(), ["colleague", "mine"]);
});

test("a concurrent tombstone is kept when a stale client retries", async () => {
  const fake = fakeTable(), storage = load(fake), active = stroke("mine");
  fake.table.rows.set(key, stored([active]));
  const removed = stroke("mine", { removedAt: "2026-11-10T01:00:00.000Z", removedBy: "u2", removedByName: "乙" });
  fake.table.beforeUpdate = table => table.rows.set(key, { ...stored([removed]), updated_at: "t2" });
  const saved = await saveMine(storage);
  assert.equal(saved[0].removedAt, removed.removedAt);
  assert.equal(fake.table.rows.get(key).column_order.strokes[0].removedBy, "u2");
});

test("four conflicts stop without replacing the stored strokes", async () => {
  const fake = fakeTable(), storage = load(fake);
  fake.table.rows.set(key, stored([stroke("colleague")]));
  let round = 0;
  const busy = table => { table.rows.set(key, { ...table.rows.get(key), updated_at: `busy${++round}` }); table.beforeUpdate = busy; };
  fake.table.beforeUpdate = busy;
  await assert.rejects(saveMine(storage), /同時有多人更新/);
  assert.equal(fake.table.calls.filter(call => call.action === "update").length, 4);
  assert.equal(fake.table.rows.get(key).column_order.strokes[0].id, "colleague");
});

test("read and write errors stay visible and malformed changes are not saved", async () => {
  const fake = fakeTable(), storage = load(fake);
  fake.table.error = { message: "permission denied" };
  await assert.rejects(storage.loadCircuitPdfInk("board", "d1", 2), /permission denied/);
  fake.table.error = null;
  await assert.rejects(storage.saveCircuitPdfInk("board", "d1", 2, () => [stroke("bad", { page: 3 })]), /畫筆資料/);
  assert.equal(fake.table.rows.size, 0);
  await assert.rejects(storage.loadCircuitPdfInk("board", "d1", 0), /頁碼/);
  await assert.rejects(storage.loadCircuitPdfInk("", "d1", 2), /識別碼/);
});

test("failed inserts and updates preserve the stored strokes and report the database error", async () => {
  for (const action of ["insert", "update"]) {
    const fake = fakeTable(), storage = load(fake);
    fake.table.errorAction = action;
    fake.table.error = { message: "write denied" };
    if (action === "update") fake.table.rows.set(key, stored([stroke("colleague")]));
    await assert.rejects(saveMine(storage), /write denied/);
    if (action === "insert") assert.equal(fake.table.rows.size, 0);
    else assert.equal(fake.table.rows.get(key).column_order.strokes[0].id, "colleague");
  }
});

test("each successful update advances the CAS token even when the previous timestamp is in the future", async () => {
  const fake = fakeTable(), storage = load(fake), previous = "2099-01-01T00:00:00.000Z";
  fake.table.rows.set(key, { ...stored([]), updated_at: previous });
  await saveMine(storage);
  assert.ok(Date.parse(fake.table.rows.get(key).updated_at) > Date.parse(previous));
});

test("read and write deadlines abort their requests with a retryable message", async () => {
  for (const action of ["select", "insert", "update"]) for (const resolveAbort of [false, true]) {
    const fake = fakeTable(), timers = [];
    fake.table.hang = action;
    fake.table.resolveAbort = resolveAbort;
    if (action === "update") fake.table.rows.set(key, stored([]));
    const storage = load(fake, { setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {} });
    const operation = action === "select" ? storage.loadCircuitPdfInk("board", "d1", 2) : saveMine(storage);
    const rejection = assert.rejects(operation, /連線逾時/);
    for (let tick = 0; tick < 10 && !fake.table.calls.some(call => call.action === action); tick++) await Promise.resolve();
    timers.at(-1)();
    await rejection;
  }
});
