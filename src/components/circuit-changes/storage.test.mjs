import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { loader } = require("../../../tests/support/renderHarness.cjs");
const row = (id = "item-1", images = []) => ({ id, set_id: "set-1", number: 1, content: { title: "Circuit", reason: "", description: "Changed R1", refs: "R1", net: "", page: "1", owner: "QA", images }, status: "draft", revision: 4, created_at: "2026-11-09", updated_at: "2026-11-09", created_by: "qa", updated_by: "qa" });
function loadRepository(run) {
  const calls = [];
  function query(kind, name, args) {
    const q = { kind, name, args, filters: {}, select: "", range: null };
    const builder = {
      select(value) { q.select = value; return this; }, eq(key, value) { q.filters[key] = value; return this; },
      in(key, value) { q.filters[key] = value; return this; }, order() { return this; }, single() { q.single = true; return this; },
      range(start, end) { q.range = [start, end]; return this; },
      abortSignal(signal) { assert.ok(signal instanceof AbortSignal); calls.push(q); return Promise.resolve(run(q)); },
    };
    return builder;
  }
  const supabase = { from: name => query("table", name), rpc: (name, args) => query("rpc", name, args) };
  return { calls, api: loader({ mocks: { "@/integrations/supabase/client": { supabase } } })("src/components/circuit-changes/storage.ts") };
}

test("circuit item lists use the summary RPC without requesting full image bodies", async () => {
  const { api, calls } = loadRepository(() => ({ data: [{ ...row(), image_count: 150 }], error: null }));
  const rows = await api.listCircuitChangeItems("set-1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, "rpc");
  assert.equal(calls[0].name, "circuit_change_list_items");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].args)), { p_set_id: "set-1" });
  assert.equal(rows[0].imageCount, 150);
  assert.deepEqual(rows[0].content.images, []);
});

test("writes pass their CAS revision and convert PT409 into an explicit conflict", async () => {
  const { api, calls } = loadRepository(() => ({ data: null, error: { code: "PT409", message: "stale" }, status: 409 }));
  await assert.rejects(api.saveCircuitChangeItem("set-1", "item-1", 4, row().content), api.CircuitChangeConflictError);
  assert.equal(calls[0].args.p_expected_revision, 4);
  assert.equal(calls[0].args.p_item_id, "item-1");
  assert.equal(calls[0].name, "circuit_change_save_item");
});

test("export loads full items in caller order and refuses silently missing rows", async () => {
  const image = { id: "image-1", path: "set-1/item-1/original.png" };
  const { api } = loadRepository(() => ({ data: [row("item-2"), row("item-1", [image])], error: null }));
  const rows = await api.loadCircuitChangeItemsForExport(["item-1", "item-2"]);
  assert.deepEqual(rows.map(value => value.id), ["item-1", "item-2"]);
  assert.equal(rows[0].content.images[0].id, "image-1");
  await assert.rejects(api.loadCircuitChangeItemsForExport(["missing"]), /不可讀取/);
});

test("history list reads metadata while the selected revision explicitly loads its full snapshot", async () => {
  const { api, calls } = loadRepository(q => ({ data: q.single ? { id: "event-1", item_id: "item-1", set_id: "set-1", type: "approved", actor_id: "qa", actor_name: "QA", revision: 4, note: "Reviewed", snapshot: row() } : [{ id: "event-1", item_id: "item-1", set_id: "set-1", type: "approved", actor_id: "qa", actor_name: "QA", revision: 4, note: "Reviewed" }], error: null }));
  const metadata = await api.listCircuitChangeEvents("item-1");
  assert.equal(calls[0].select.includes("snapshot"), false);
  assert.equal(metadata[0].snapshot, undefined);
  const event = await api.getCircuitChangeEvent("event-1");
  assert.equal(calls[1].select, "*");
  assert.equal(event.snapshot.revision, 4);
});
