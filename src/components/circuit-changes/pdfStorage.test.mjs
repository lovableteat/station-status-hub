import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { loader } = require("../../../tests/support/renderHarness.cjs");

/** A stand-in for the one preference row: reads, inserts and compare-and-swap updates, with hooks to simulate a colleague. */
function fakeTable() {
  const table = { row: null, calls: [], beforeUpdate: null, insertError: null, uploads: [], removed: [] };
  const builder = () => {
    const query = { filters: {}, action: "select", payload: null };
    const run = async () => {
      table.calls.push(query.action);
      if (query.action === "select") return { data: table.row ? { ...table.row } : null, error: null };
      if (query.action === "insert") {
        if (table.insertError) { const error = table.insertError; table.insertError = null; table.row = { column_order: { version: 1, documents: [], pages: { 9: { checked: true, at: "2026-11-09T00:00:00.000Z", by: "colleague", byName: "同仁", documentId: "d" } }, positions: {} }, updated_at: "t0" }; return { error }; }
        table.row = { column_order: query.payload.column_order, updated_at: "t1" }; return { error: null };
      }
      if (query.action === "update") {
        if (table.beforeUpdate) { const change = table.beforeUpdate; table.beforeUpdate = null; change(table); }
        if (!table.row || table.row.updated_at !== query.filters.updated_at) return { data: [], error: null };
        table.row = { column_order: query.payload.column_order, updated_at: `${table.row.updated_at}+` }; return { data: [{ table_key: query.filters.table_key }], error: null };
      }
      return { data: null, error: null };
    };
    const chain = {
      select() { return chain; }, insert(payload) { query.action = "insert"; query.payload = payload; return chain; }, update(payload) { query.action = "update"; query.payload = payload; return chain; },
      eq(key, value) { query.filters[key] = value; return chain; }, abortSignal() { return chain; }, maybeSingle: () => run(), then: (resolve, reject) => run().then(resolve, reject),
    };
    return chain;
  };
  const storage = { from: bucket => ({
    upload: async (path, file, options) => { table.uploads.push({ bucket, path, options }); return { error: null }; },
    remove: async paths => { table.removed.push(...paths); return { error: null }; },
    download: async () => ({ data: new Blob(["%PDF-1.4"]), error: null }),
  }) };
  return { table, supabase: { from: () => builder(), storage } };
}
const load = fake => loader({ mocks: { "@/integrations/supabase/client": { supabase: fake.supabase } }, globals: { TextEncoder, Blob } })("src/components/circuit-changes/pdfStorage.ts");
const merge = loader()("src/components/circuit-changes/circuitPdf.ts").mergeCircuitPdfRegistry;
const mark = (by, at) => ({ checked: true, at, by, byName: by, documentId: "d" });
const mine = { version: 1, documents: [], pages: { 5: mark("me", "2026-11-09T02:00:00.000Z") }, positions: {} };

test("the first save of a board creates its row", async () => {
  const fake = fakeTable(), storage = load(fake);
  const saved = await storage.saveCircuitPdfRegistry("board", latest => merge(latest, mine));
  assert.deepEqual(Object.keys(saved.pages), ["5"]);
  assert.deepEqual(fake.table.calls, ["select", "insert"]);
});

test("a colleague's save between reading and writing is merged, not overwritten", async () => {
  const fake = fakeTable(), storage = load(fake);
  fake.table.row = { column_order: { version: 1, documents: [], pages: {}, positions: {} }, updated_at: "t1" };
  // Someone else writes page 7 after this save read the row but before it wrote.
  fake.table.beforeUpdate = table => { table.row = { column_order: { version: 1, documents: [], pages: { 7: mark("colleague", "2026-11-09T01:00:00.000Z") }, positions: {} }, updated_at: "t2" }; };
  await storage.saveCircuitPdfRegistry("board", latest => merge(latest, mine));
  assert.deepEqual(fake.table.calls, ["select", "update", "select", "update"], "the refused write reads again and retries once");
  assert.deepEqual(Object.keys(fake.table.row.column_order.pages).sort(), ["5", "7"], "both people's marks are stored");
});

test("two first saves at once: the one that loses the insert merges into the row the other created", async () => {
  const fake = fakeTable(), storage = load(fake);
  fake.table.insertError = { code: "23505", message: "duplicate key" };
  await storage.saveCircuitPdfRegistry("board", latest => merge(latest, mine));
  assert.deepEqual(fake.table.calls, ["select", "insert", "select", "update"]);
  assert.deepEqual(Object.keys(fake.table.row.column_order.pages).sort(), ["5", "9"]);
});

test("a save that keeps losing gives up with a message instead of overwriting", async () => {
  const fake = fakeTable(), storage = load(fake);
  fake.table.row = { column_order: { version: 1, documents: [], pages: {}, positions: {} }, updated_at: "t1" };
  let round = 0;
  const busy = table => { round++; table.row = { ...table.row, updated_at: `busy${round}` }; fake.table.beforeUpdate = busy; };
  fake.table.beforeUpdate = busy;
  await assert.rejects(storage.saveCircuitPdfRegistry("board", latest => merge(latest, mine)), /同時有多人更新/);
  assert.equal(fake.table.calls.filter(call => call === "update").length, 4);
});

test("PDFs are stored as circuit-pdf/<board>/<id>.pdf in the SPEC bucket, the same folder for the same board", async () => {
  const fake = fakeTable(), storage = load(fake);
  const id = "00000000-0000-4000-8000-0000000000aa";
  const first = await storage.uploadCircuitPdf("series:board/one", id, new Blob(["%PDF-1.4"]));
  const second = await storage.uploadCircuitPdf("series:board/one", "00000000-0000-4000-8000-0000000000bb", new Blob(["%PDF-1.4"]));
  assert.match(first, /^circuit-pdf\/[0-9a-f]{32}\/00000000-0000-4000-8000-0000000000aa\.pdf$/, "three parts ending in .pdf, as the bucket's upload rule requires");
  assert.equal(first.split("/")[1], second.split("/")[1]);
  assert.equal(fake.table.uploads[0].bucket, "material-spec-documents");
  assert.equal(fake.table.uploads[0].options.contentType, "application/pdf");
  await assert.rejects(storage.uploadCircuitPdf("board", "../escape", new Blob(["x"])), /識別碼無效/);
});
