import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { TEST_PLAN_MAX_FILE_SIZE, TEST_PLAN_MAX_BATCH_BYTES } from "../../src/components/test-plan/core/files.ts";

const adapterUrl = new URL("../../src/components/test-plan/core/supabaseAdapter.ts", import.meta.url);
const errorsUrl = new URL("../../src/components/test-plan/core/errors.ts", import.meta.url);
const MiB = 1024 ** 2;
const GiB = 1024 ** 3;

test("current client, local Storage cap and migration metadata/bucket limits consistently permit 1 GiB", () => {
  const config = readFileSync(new URL("../../supabase/config.toml", import.meta.url), "utf8");
  const storageSection = config.split(/^\[storage\]\s*$/m)[1]?.split(/^\[/m)[0];
  const localLimit = storageSection?.match(/^\s*file_size_limit\s*=\s*"([^"]+)"/m)?.[1];
  assert.equal(localLimit, "1GiB", "The local global cap must not silently remain below the client/bucket cap");
  assert.equal(TEST_PLAN_MAX_FILE_SIZE, GiB);
  assert.equal(TEST_PLAN_MAX_BATCH_BYTES, GiB);
  const migrationRoot = new URL("../../supabase/migrations/", import.meta.url);
  const migration = readdirSync(migrationRoot).filter(name => name.endsWith("_file_library_one_gib_limit.sql")).sort().at(-1);
  assert.ok(migration, "A current file-library 1 GiB alignment migration must be recorded");
  const sql = readFileSync(new URL(migration, migrationRoot), "utf8");
  assert.equal(Number(sql.match(/check\s*\(file_size\s+between\s+0\s+and\s+(\d+)\)/i)?.[1]), TEST_PLAN_MAX_FILE_SIZE);
  assert.equal(Number(sql.match(/set\s+file_size_limit\s*=\s*(\d+)/i)?.[1]), TEST_PLAN_MAX_FILE_SIZE);
  assert.match(sql, /where\s+id\s*=\s*'test-plan-files'/i);
  assert.match(sql, /file_size_limit\s+is\s+not\s+null/i);
  assert.match(sql, /file_size_limit\s*<\s*1073741824/i, "A larger or unlimited bucket configuration must not be reduced");
});

function setup(size, resumeOffset = null) {
  const objectPath = "11111111-1111-4111-8111-111111111111/global/space/object.zip";
  const uploadUrl = "https://storage.example.invalid/storage/v1/upload/resumable/synthetic-session";
  const saved = new Map();
  const resumeKey = `test-plan-tus:${objectPath}`;
  if (resumeOffset !== null) saved.set(resumeKey, uploadUrl);
  const slices = [];
  const requests = [];
  const standardUploads = [];
  const progress = [];
  const file = {
    name: "large-release.zip", type: "application/zip", size,
    arrayBuffer() { throw new Error("Never read the entire large file into memory"); },
    slice(start, end) {
      assert.ok(start >= 0 && end <= size && end > start);
      assert.ok(end - start <= 6 * MiB, "Every TUS chunk remains bounded to 6 MiB");
      const chunk = { start, end, size: end - start };
      slices.push(chunk);
      return chunk;
    },
  };
  const client = {
    auth: { async getSession() { return { data: { session: { access_token: "synthetic-test-session" } }, error: null }; } },
    storage: { from() { return { async upload(path, body) { standardUploads.push({ path, body }); return { error: null }; } }; } },
  };
  const fetch = async (url, options) => {
    requests.push({ url, ...options });
    if (options.method === "HEAD") return new Response(null, { status: 200, headers: { "Upload-Offset": String(resumeOffset) } });
    if (options.method === "POST") {
      assert.equal(options.headers["Upload-Length"], String(size));
      assert.equal(options.body, undefined);
      return new Response(null, { status: 201, headers: { Location: uploadUrl } });
    }
    assert.equal(options.method, "PATCH");
    assert.equal(options.headers["Content-Type"], "application/offset+octet-stream");
    assert.equal(Number(options.headers["Upload-Offset"]), options.body.start);
    assert.ok(options.body.size <= 6 * MiB);
    return new Response(null, { status: 204, headers: { "Upload-Offset": String(options.body.end) } });
  };
  function load(url) {
    const module = { exports: {} };
    const compiled = ts.transpileModule(readFileSync(url, "utf8"), { fileName: fileURLToPath(url), compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const require = name => {
      if (name === "@/integrations/supabase/client") return { supabase: client, SUPABASE_URL: "https://storage.example.invalid" };
      if (name === "./errors") return load(errorsUrl);
      throw new Error(`Unexpected dependency ${name}`);
    };
    const window = { localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) }, setTimeout };
    vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { console, window, fetch, URL, TextEncoder, btoa }, { filename: fileURLToPath(url) })(require, module, module.exports);
    return module.exports;
  }
  return { adapter: load(adapterUrl).createSupabaseTestPlanAdapter(), file, objectPath, uploadUrl, resumeKey, saved, slices, requests, standardUploads, progress };
}

test("an exact 1 GiB file uses resumable TUS with 6 MiB chunks and never calls whole-file reads or the standard upload", async () => {
  const state = setup(GiB);
  await state.adapter.uploadObject(state.objectPath, state.file, (done, total) => state.progress.push([done, total]));
  assert.equal(state.standardUploads.length, 0);
  assert.equal(state.requests[0].method, "POST");
  assert.equal(state.slices.length, Math.ceil(GiB / (6 * MiB)));
  assert.equal(state.slices[0].start, 0);
  assert.equal(state.slices.at(-1).end, GiB);
  assert.equal(state.slices.reduce((sum, item) => sum + item.size, 0), GiB);
  assert.deepEqual(state.progress[0], [0, GiB]);
  assert.deepEqual(state.progress.at(-1), [GiB, GiB]);
  assert.equal(state.saved.has(state.resumeKey), false);
});

test("a saved large upload resumes its server offset rather than restarting or reading earlier bytes", async () => {
  const offset = GiB - 3 * MiB;
  const state = setup(GiB, offset);
  await state.adapter.uploadObject(state.objectPath, state.file);
  assert.deepEqual(state.requests.map(request => request.method), ["HEAD", "PATCH"]);
  assert.deepEqual(state.slices, [{ start: offset, end: GiB, size: 3 * MiB }]);
  assert.equal(state.saved.has(state.resumeKey), false);
  assert.equal(state.standardUploads.length, 0);
});

test("small files retain the standard upload path and progress reporting", async () => {
  const state = setup(6 * MiB);
  await state.adapter.uploadObject(state.objectPath, state.file, (done, total) => state.progress.push([done, total]));
  assert.equal(state.standardUploads.length, 1);
  assert.equal(state.standardUploads[0].body, state.file);
  assert.equal(state.requests.length, 0);
  assert.equal(state.slices.length, 0);
  assert.deepEqual(state.progress, [[0, 6 * MiB], [6 * MiB, 6 * MiB]]);
});
