import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const adapterUrl = new URL("../../src/components/test-plan/core/supabaseAdapter.ts", import.meta.url);
const errorsUrl = new URL("../../src/components/test-plan/core/errors.ts", import.meta.url);
const actor = "11111111-1111-4111-8111-111111111111";
const uploader = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";

function setup(initial) {
  const queue = new Map(initial.map(row => [row.storage_path, { ...row }]));
  const calls = [];
  let readError = null;
  let removalError = null;
  function query(table) {
    const state = { table, method: "select", from: 0, to: 499, filter: "", paths: null };
    const builder = {
      select() { return builder; },
      delete() { state.method = "delete"; return builder; },
      or(filter) { state.filter = filter; return builder; },
      order() { return builder; },
      range(from, to) { state.from = from; state.to = to; return builder; },
      in(column, paths) { assert.equal(column, "storage_path"); state.paths = paths; return builder; },
      then(resolve, reject) {
        calls.push(structuredClone(state));
        return Promise.resolve().then(() => {
          if (state.method === "select" && readError) return { data: null, error: readError };
          const match = /^owner_id\.eq\.([0-9a-f-]+),requested_by\.eq\.\1$/i.exec(state.filter);
          assert.ok(match, "Both queue owner and requester must use the same validated actor UUID");
          const eligible = [...queue.values()].filter(row => row.owner_id === match[1] || row.requested_by === match[1]);
          if (state.method === "delete") {
            for (const row of eligible) if (state.paths.includes(row.storage_path)) queue.delete(row.storage_path);
            return { data: null, error: null };
          }
          return { data: eligible.slice(state.from, state.to + 1).map(row => ({ storage_path: row.storage_path })), error: null };
        }).then(resolve, reject);
      },
    };
    return builder;
  }
  const client = {
    from: query,
    storage: { from(bucket) { assert.equal(bucket, "test-plan-files"); return { async remove(paths) { calls.push({ method: "remove", paths }); return { data: removalError ? null : paths.map(name => ({ name })), error: removalError }; } }; } },
  };
  function load(url) {
    const module = { exports: {} };
    const compiled = ts.transpileModule(readFileSync(url, "utf8"), { fileName: fileURLToPath(url), compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const require = name => {
      if (name === "@/integrations/supabase/client") return { supabase: client, SUPABASE_URL: "https://example.invalid" };
      if (name === "./errors") return load(errorsUrl);
      throw new Error(`Unexpected dependency ${name}`);
    };
    vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { console }, { filename: fileURLToPath(url) })(require, module, module.exports);
    return module.exports;
  }
  return { adapter: load(adapterUrl).createSupabaseTestPlanAdapter(), queue, calls,
    setReadError(value) { readError = value; }, setRemovalError(value) { removalError = value; },
  };
}

const entry = (path, owner_id, requested_by = null) => ({ storage_path: path, owner_id, requested_by });

test("cleanup reads and acknowledgements include requester rows without taking another actor's queue", async () => {
  const state = setup([entry("own", actor), entry("requested", uploader, actor), entry("unrelated", uploader, other)]);
  assert.deepEqual(Array.from(await state.adapter.listCleanupPaths(actor)), ["own", "requested"]);
  await state.adapter.completeCleanupPaths(actor, ["own", "requested", "unrelated"]);
  assert.deepEqual([...state.queue.keys()], ["unrelated"]);
});

test("cleanup reads paginate all eligible rows instead of dropping large-folder cascades", async () => {
  const entries = Array.from({ length: 1001 }, (_, index) => entry(`path-${index}`, uploader, actor));
  const state = setup([...entries, entry("unrelated", uploader, other)]);
  const result = await state.adapter.listCleanupPaths(actor);
  assert.equal(result.length, 1001);
  assert.equal(result[1000], "path-1000");
  assert.deepEqual(state.calls.map(call => [call.from, call.to]), [[0, 499], [500, 999], [1000, 1499]]);
});

test("raw OR filters reject malformed actor IDs before sending a database request", async () => {
  const state = setup([]);
  for (const invalid of ["", "not-a-uuid", `${actor},owner_id.not.is.null`, `${actor})`, ` ${actor}`]) {
    await assert.rejects(state.adapter.listCleanupPaths(invalid), /識別碼無效/);
    await assert.rejects(state.adapter.completeCleanupPaths(invalid, ["path"]), /識別碼無效/);
  }
  assert.equal(state.calls.length, 0);
});

test("queue read and Storage removal errors propagate so failed cleanup cannot be acknowledged", async () => {
  const state = setup([entry("pending", uploader, actor)]);
  state.setReadError({ message: "queue unavailable" });
  await assert.rejects(state.adapter.listCleanupPaths(actor), /queue unavailable/);
  state.setReadError(null);
  state.setRemovalError({ message: "storage unavailable" });
  await assert.rejects(state.adapter.removeObjects(["pending"]), /storage unavailable/);
  assert.equal(state.queue.size, 1);
  assert.ok(!state.calls.some(call => call.method === "delete"));
});
