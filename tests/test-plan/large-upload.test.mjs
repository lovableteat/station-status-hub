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

function setup(size, resumeOffset = null, options = {}) {
  const objectPath = "11111111-1111-4111-8111-111111111111/global/space/object.zip";
  const baseUrl = options.baseUrl ?? "https://storage.example.invalid";
  const uploadUrl = options.uploadUrl ?? `${baseUrl.replace(/^(https:\/\/[^.]+)\.supabase\.co$/, "$1.storage.supabase.co")}/storage/v1/upload/resumable/synthetic-session`;
  const uploadMetadata = `bucketName ${btoa("test-plan-files")},objectName ${btoa(objectPath)}`;
  const saved = new Map();
  const resumeKey = `test-plan-tus:${objectPath}`;
  if (resumeOffset !== null) saved.set(resumeKey, options.savedUrl ?? uploadUrl);
  const slices = [];
  const requests = [];
  const standardUploads = [];
  const progress = [];
  const authCalls = [];
  const queries = [];
  const timers = new Map();
  let timerId = 0;
  let remoteOffset = resumeOffset ?? 0;
  let completed = options.completed ?? (resumeOffset === size);
  let accessToken = "synthetic-test-session";
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
    auth: {
      async getSession() {
        authCalls.push("getSession");
        return { data: { session: { access_token: options.token?.(authCalls) ?? accessToken, user: { id: options.userId?.(authCalls) ?? "synthetic-user" } } }, error: null };
      },
      async refreshSession() {
        authCalls.push("refreshSession");
        if (options.refreshThrows) throw new Error("synthetic refresh outage");
        accessToken = "synthetic-refreshed-session";
        return { data: { session: { access_token: accessToken, user: { id: options.refreshUserId ?? "synthetic-user" } } }, error: null };
      },
    },
    storage: { from() { return { async upload(path, body) { standardUploads.push({ path, body }); return { error: null }; } }; } },
    from(table) {
      const query = {
        select(value) { queries.push([table, "select", value]); return query; },
        eq(field, value) { queries.push([table, "eq", field, value]); return query; },
        async maybeSingle() { return options.queryResult ?? { data: null, error: null }; },
      };
      return query;
    },
  };
  const accept = request => {
    if (request.method === "HEAD") return new Response(null, { status: 200, headers: { "Upload-Offset": String(remoteOffset), "Upload-Length": String(size), "Upload-Metadata": uploadMetadata, ...(completed ? { "Supabase-Object-Id": "synthetic-storage-object-id" } : {}) } });
    if (request.method === "POST") {
      assert.equal(request.headers["Upload-Length"], String(size));
      assert.equal(request.body, undefined);
      return new Response(null, { status: 201, headers: { Location: uploadUrl } });
    }
    assert.equal(request.method, "PATCH");
    assert.equal(request.headers["Content-Type"], "application/offset+octet-stream");
    assert.equal(Number(request.headers["Upload-Offset"]), request.body.start);
    assert.ok(request.body.size <= 6 * MiB);
    remoteOffset = request.body.end;
    completed = remoteOffset === size;
    return new Response(null, { status: 204, headers: { "Upload-Offset": String(remoteOffset) } });
  };
  const fetch = async (url, requestOptions) => {
    const request = { url, ...requestOptions };
    requests.push(request);
    return options.respond ? options.respond(request, { requests, accept, setOffset: value => { remoteOffset = value; completed = value === size; }, setCompleted: value => { completed = value; } }) : accept(request);
  };
  function load(url) {
    const module = { exports: {} };
    const compiled = ts.transpileModule(readFileSync(url, "utf8"), { fileName: fileURLToPath(url), compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const require = name => {
      if (name === "@/integrations/supabase/client") return { supabase: client, SUPABASE_URL: baseUrl };
      if (name === "./errors") return load(errorsUrl);
      throw new Error(`Unexpected dependency ${name}`);
    };
    const window = {
      localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => { if (options.removeThrows) throw new Error("Browser storage unavailable"); saved.delete(key); } },
      setTimeout(callback, delay) {
        const id = ++timerId;
        timers.set(id, callback);
        if (delay <= 20000 || options.expireRequests) queueMicrotask(() => {
          if (timers.delete(id)) callback();
        });
        return id;
      },
      clearTimeout(id) { timers.delete(id); },
    };
    vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { console, window, fetch, URL, TextEncoder, btoa, AbortController }, { filename: fileURLToPath(url) })(require, module, module.exports);
    return module.exports;
  }
  return { adapter: load(adapterUrl).createSupabaseTestPlanAdapter(), file, objectPath, uploadUrl, uploadMetadata, resumeKey, saved, slices, requests, standardUploads, progress, authCalls, queries, timers };
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
  assert.equal(state.saved.has(state.resumeKey), true, "Transport completion must survive metadata failure");
  state.adapter.completeObjectUpload(state.objectPath);
  assert.equal(state.saved.has(state.resumeKey), false);
});

test("a saved large upload resumes its server offset rather than restarting or reading earlier bytes", async () => {
  const offset = GiB - 3 * MiB;
  const state = setup(GiB, offset);
  await state.adapter.uploadObject(state.objectPath, state.file);
  assert.deepEqual(state.requests.map(request => request.method), ["HEAD", "PATCH"]);
  assert.deepEqual(state.slices, [{ start: offset, end: GiB, size: 3 * MiB }]);
  assert.equal(state.saved.has(state.resumeKey), true);
  assert.equal(state.standardUploads.length, 0);
});

test("completed uploads remain resumable until metadata commits and do not resend their bytes", async () => {
  const state = setup(12 * MiB, 12 * MiB);
  await state.adapter.uploadObject(state.objectPath, state.file);
  assert.deepEqual(state.requests.map(request => request.method), ["HEAD"]);
  assert.equal(state.saved.has(state.resumeKey), true);
  state.adapter.completeObjectUpload(state.objectPath);
  assert.equal(state.saved.has(state.resumeKey), false);
});

test("a saved full offset without a trusted finish marker remains an explicit retained failure", async () => {
  const state = setup(12 * MiB, 12 * MiB, { completed: false });
  await assert.rejects(state.adapter.uploadObject(state.objectPath, state.file), /尚未確認完成/);
  assert.deepEqual(state.requests.map(request => request.method), ["HEAD"]);
  assert.equal(state.saved.has(state.resumeKey), true);
});

test("an exposed Tus-Complete finish marker confirms a saved complete upload", async () => {
  const state = setup(12 * MiB, 12 * MiB, { completed: false, respond(request, { accept }) {
    const response = accept(request);
    response.headers.set("Tus-Complete", "1");
    return response;
  } });
  await state.adapter.uploadObject(state.objectPath, state.file);
  assert.deepEqual(state.requests.map(request => request.method), ["HEAD"]);
  assert.equal(state.saved.has(state.resumeKey), true);
});

test("a failed finalizer followed by a full HEAD without a marker cannot become upload success", async () => {
  const state = setup(12 * MiB, null, { respond(request, { accept, setOffset, setCompleted }) {
    if (request.method === "PATCH" && request.body.end === 12 * MiB) {
      setOffset(request.body.end);
      setCompleted(false);
      return new Response('{"message":"Storage finalizer failed"}', { status: 503 });
    }
    return accept(request);
  } });
  await assert.rejects(state.adapter.uploadObject(state.objectPath, state.file, (done, total) => state.progress.push([done, total])), /尚未確認完成/);
  assert.deepEqual(state.requests.map(request => request.method), ["POST", "PATCH", "PATCH", "HEAD"]);
  assert.ok(state.progress.every(([done]) => done < state.file.size));
  assert.equal(state.saved.has(state.resumeKey), true);
});

test("a final PATCH needs the actual 204 finisher acknowledgement rather than a bare 200 offset", async () => {
  const state = setup(12 * MiB, null, { respond(request, { accept, setOffset, setCompleted }) {
    if (request.method === "PATCH" && request.body.end === 12 * MiB) {
      setOffset(request.body.end);
      setCompleted(false);
      return new Response(null, { status: 200, headers: { "Upload-Offset": String(12 * MiB) } });
    }
    return accept(request);
  } });
  await assert.rejects(state.adapter.uploadObject(state.objectPath, state.file), /尚未確認完成/);
  assert.equal(state.saved.has(state.resumeKey), true);
});

test("committed metadata remains successful when browser cleanup storage is unavailable", () => {
  const state = setup(12 * MiB, 12 * MiB, { removeThrows: true });
  assert.doesNotThrow(() => state.adapter.completeObjectUpload(state.objectPath));
});

test("hosted projects upload directly to their storage hostname while custom hosts stay intact", async () => {
  const state = setup(12 * MiB, null, { baseUrl: "https://projectref.supabase.co" });
  await state.adapter.uploadObject(state.objectPath, state.file);
  assert.equal(state.requests[0].url, "https://projectref.storage.supabase.co/storage/v1/upload/resumable");
  assert.ok(state.requests.every(request => new URL(request.url).origin === "https://projectref.storage.supabase.co"));
  assert.ok(state.requests.every(request => request.redirect === "error"));
});

test("legacy saved uploads retain their trusted project API origin and session id", async () => {
  const legacyUrl = "https://projectref.supabase.co/storage/v1/upload/resumable/existing-session";
  const state = setup(12 * MiB, 6 * MiB, { baseUrl: "https://projectref.supabase.co", savedUrl: legacyUrl });
  await state.adapter.uploadObject(state.objectPath, state.file);
  assert.deepEqual(state.requests.map(request => request.method), ["HEAD", "PATCH"]);
  assert.ok(state.requests.every(request => request.url === legacyUrl));
  assert.equal(state.slices[0].start, 6 * MiB);
});

test("saved HEAD metadata must identify this exact bucket and object even when the offset is complete", async () => {
  const objectPath = "11111111-1111-4111-8111-111111111111/global/space/object.zip";
  for (const metadata of [
    null,
    `bucketName ${btoa("different-bucket")},objectName ${btoa(objectPath)}`,
    `bucketName ${btoa("test-plan-files")},objectName ${btoa("another-owner/global/space/object.zip")}`,
  ]) {
    const headers = { "Upload-Offset": String(2 * MiB), "Upload-Length": String(2 * MiB) };
    if (metadata !== null) headers["Upload-Metadata"] = metadata;
    const state = setup(2 * MiB, 2 * MiB, { respond() { return new Response(null, { status: 200, headers }); } });
    await assert.rejects(state.adapter.uploadObject(state.objectPath, state.file), /續傳.*檔案.*不符/);
    assert.deepEqual(state.requests.map(request => request.method), ["HEAD"]);
    assert.equal(state.saved.has(state.resumeKey), true);
  }
});

test("untrusted saved and returned upload URLs receive no bearer token", async () => {
  for (const unsafe of [
    "https://other.example.invalid/storage/v1/upload/resumable/session",
    "https://storage.example.invalid/not-storage/session",
    "https://storage.example.invalid/storage/v1/upload/resumable/session?token=untrusted",
    "https://storage.example.invalid/storage/v1/upload/resumable/session#untrusted",
    "https://untrusted@storage.example.invalid/storage/v1/upload/resumable/session",
  ]) {
    const saved = setup(12 * MiB, 6 * MiB, { savedUrl: unsafe });
    await assert.rejects(saved.adapter.uploadObject(saved.objectPath, saved.file), /續傳位置/);
    assert.equal(saved.requests.length, 0);
    assert.equal(saved.authCalls.length, 0);
    const returned = setup(12 * MiB, null, { uploadUrl: unsafe });
    await assert.rejects(returned.adapter.uploadObject(returned.objectPath, returned.file), /續傳位置/);
    assert.deepEqual(returned.requests.map(request => request.method), ["POST"]);
    assert.equal(returned.saved.has(returned.resumeKey), false);
  }
});

test("every request uses the current session token", async () => {
  const state = setup(12 * MiB, null, { token: calls => `token-${calls.length}` });
  await state.adapter.uploadObject(state.objectPath, state.file);
  assert.deepEqual(state.requests.map(request => request.headers.authorization), ["Bearer token-1", "Bearer token-2", "Bearer token-3"]);
});

test("switching accounts during upload stops before sending the new account token", async () => {
  const state = setup(12 * MiB, null, {
    userId: calls => calls.length < 3 ? "account-a" : "account-b",
    token: calls => calls.length < 3 ? "account-a-token" : "account-b-token",
  });
  await assert.rejects(state.adapter.uploadObject(state.objectPath, state.file), /帳號.*變更|變更.*帳號/);
  assert.deepEqual(state.requests.map(request => request.method), ["POST", "PATCH"]);
  assert.ok(state.requests.every(request => request.headers.authorization === "Bearer account-a-token"));
  assert.equal(state.saved.has(state.resumeKey), true);
});

test("a refreshed session for another account cannot retry the previous account chunk", async () => {
  const state = setup(12 * MiB, null, { refreshUserId: "account-b", respond(request, { accept }) {
    return request.method === "PATCH" ? new Response('{"message":"JWT expired"}', { status: 401 }) : accept(request);
  } });
  await assert.rejects(state.adapter.uploadObject(state.objectPath, state.file), /帳號.*變更|變更.*帳號/);
  assert.equal(state.requests.filter(request => request.method === "PATCH").length, 1);
  assert.ok(state.requests.every(request => request.headers.authorization !== "Bearer synthetic-refreshed-session"));
});

test("401 refreshes once and retries the same chunk with the refreshed session", async () => {
  let rejected = false;
  const state = setup(12 * MiB, null, { respond(request, { accept }) {
    if (request.method === "PATCH" && !rejected) { rejected = true; return new Response('{"message":"JWT expired"}', { status: 401 }); }
    return accept(request);
  } });
  await state.adapter.uploadObject(state.objectPath, state.file);
  const patches = state.requests.filter(request => request.method === "PATCH");
  assert.equal(state.authCalls.filter(call => call === "refreshSession").length, 1);
  assert.equal(patches[0].body.start, patches[1].body.start);
  assert.equal(patches[1].headers.authorization, "Bearer synthetic-refreshed-session");
});

test("failed token refresh stops after one attempt and retains the server auth detail", async () => {
  const state = setup(12 * MiB, null, { refreshThrows: true, respond(request, { accept }) {
    return request.method === "PATCH" ? new Response('{"message":"JWT expired"}', { status: 401 }) : accept(request);
  } });
  await assert.rejects(state.adapter.uploadObject(state.objectPath, state.file), /401.*JWT expired/);
  assert.equal(state.authCalls.filter(call => call === "refreshSession").length, 1);
  assert.equal(state.requests.filter(request => request.method === "PATCH").length, 1);
  assert.equal(state.saved.has(state.resumeKey), true);
});

test("persistent 401 and forbidden responses stop without chunk backoff", async () => {
  for (const status of [401, 403, 413]) {
    const state = setup(12 * MiB, null, { respond(request, { accept }) {
      return request.method === "PATCH" ? new Response('{"message":"synthetic rejection"}', { status }) : accept(request);
    } });
    await assert.rejects(state.adapter.uploadObject(state.objectPath, state.file), new RegExp(String(status)));
    assert.equal(state.requests.filter(request => request.method === "PATCH").length, status === 401 ? 2 : 1);
    assert.equal(state.requests.filter(request => request.method === "HEAD").length, 0);
    assert.equal(state.saved.has(state.resumeKey), true);
  }
});

test("transient HEAD failures retain the saved URL and never create a second upload", async () => {
  for (const network of [false, true]) {
    const state = setup(12 * MiB, 6 * MiB, { respond() {
      if (network) throw new TypeError("Failed to fetch");
      return new Response('{"message":"temporary storage outage"}', { status: 503 });
    } });
    await assert.rejects(state.adapter.uploadObject(state.objectPath, state.file), network ? /連線|fetch|網路/ : /503/);
    assert.ok(state.requests.every(request => request.method === "HEAD"));
    assert.equal(state.saved.get(state.resumeKey), state.uploadUrl);
  }
});

test("only expired 404 or 410 resume resources create a replacement upload", async () => {
  for (const status of [404, 410]) {
    let first = true;
    const state = setup(12 * MiB, 6 * MiB, { respond(request, { accept }) {
      if (request.method === "HEAD" && first) { first = false; return new Response(null, { status }); }
      return accept(request);
    } });
    await state.adapter.uploadObject(state.objectPath, state.file);
    assert.deepEqual(state.requests.map(request => request.method), ["HEAD", "POST", "PATCH", "PATCH"]);
  }
});

test("initial POST temporary failure retries without reading the whole file", async () => {
  let first = true;
  const state = setup(12 * MiB, null, { respond(request, { accept }) {
    if (request.method === "POST" && first) { first = false; return new Response(null, { status: 503 }); }
    return accept(request);
  } });
  await state.adapter.uploadObject(state.objectPath, state.file);
  assert.equal(state.requests.filter(request => request.method === "POST").length, 2);
});

test("server acknowledgements determine the next byte without assuming the entire chunk arrived", async () => {
  let first = true;
  const state = setup(12 * MiB, null, { respond(request, { accept, setOffset }) {
    if (request.method === "PATCH" && first) { first = false; setOffset(2 * MiB); return new Response(null, { status: 204, headers: { "Upload-Offset": String(2 * MiB) } }); }
    return accept(request);
  } });
  await state.adapter.uploadObject(state.objectPath, state.file);
  assert.deepEqual(state.slices.map(slice => slice.start), [0, 2 * MiB, 8 * MiB]);
});

test("an acknowledgement past the submitted chunk is confirmed by HEAD rather than skipping bytes", async () => {
  let first = true;
  const state = setup(12 * MiB, null, { respond(request, { accept, setOffset }) {
    if (request.method === "PATCH" && first) { first = false; setOffset(request.body.end); return new Response(null, { status: 204, headers: { "Upload-Offset": String(12 * MiB) } }); }
    return accept(request);
  } });
  await state.adapter.uploadObject(state.objectPath, state.file);
  assert.deepEqual(state.requests.map(request => request.method), ["POST", "PATCH", "HEAD", "PATCH"]);
  assert.deepEqual(state.slices.map(slice => slice.start), [0, 6 * MiB]);
});

test("missing acknowledgements are confirmed by HEAD before progress continues", async () => {
  let first = true;
  const state = setup(12 * MiB, null, { respond(request, { accept, setOffset }) {
    if (request.method === "PATCH" && first) { first = false; setOffset(2 * MiB); return new Response(null, { status: 204 }); }
    return accept(request);
  } });
  await state.adapter.uploadObject(state.objectPath, state.file);
  assert.deepEqual(state.requests.map(request => request.method), ["POST", "PATCH", "HEAD", "PATCH", "PATCH"]);
  assert.deepEqual(state.slices.map(slice => slice.start), [0, 2 * MiB, 8 * MiB]);
});

test("saved HEAD offsets must be present non-negative integers within the file", async () => {
  for (const offset of [null, "abc", "1.5", "-1", String(13 * MiB)]) {
    const headers = offset === null ? {} : { "Upload-Offset": offset };
    const state = setup(12 * MiB, 6 * MiB, { respond() { return new Response(null, { status: 200, headers }); } });
    await assert.rejects(state.adapter.uploadObject(state.objectPath, state.file), /位移|offset|續傳/);
    assert.ok(state.requests.every(request => request.method === "HEAD"));
    assert.equal(state.saved.has(state.resumeKey), true);
  }
});

test("an acknowledgement without byte progress exhausts retries rather than returning success", async () => {
  const state = setup(12 * MiB, null, { respond(request, { accept }) {
    return request.method === "POST" ? accept(request) : new Response(null, { status: request.method === "HEAD" ? 200 : 204, headers: { "Upload-Offset": "0" } });
  } });
  await assert.rejects(state.adapter.uploadObject(state.objectPath, state.file), /位移/);
  assert.equal(state.requests.filter(request => request.method === "PATCH").length, 6);
  assert.equal(state.saved.has(state.resumeKey), true);
});

test("a lost PATCH response resumes after server-accepted bytes instead of repeating them", async () => {
  let first = true;
  const state = setup(12 * MiB, null, { respond(request, { accept, setOffset }) {
    if (request.method === "PATCH" && first) { first = false; setOffset(request.body.end); throw new TypeError("Failed to fetch"); }
    return accept(request);
  } });
  await state.adapter.uploadObject(state.objectPath, state.file);
  assert.deepEqual(state.requests.map(request => request.method), ["POST", "PATCH", "HEAD", "PATCH"]);
  assert.deepEqual(state.slices.map(slice => slice.start), [0, 6 * MiB]);
});

test("409 synchronizes the remote offset before the next chunk", async () => {
  let first = true;
  const state = setup(12 * MiB, null, { respond(request, { accept, setOffset }) {
    if (request.method === "PATCH" && first) { first = false; setOffset(2 * MiB); return new Response(null, { status: 409 }); }
    return accept(request);
  } });
  await state.adapter.uploadObject(state.objectPath, state.file);
  assert.deepEqual(state.slices.map(slice => slice.start), [0, 2 * MiB, 8 * MiB]);
});

test("temporary 423 storage locks retry the unchanged chunk", async () => {
  let first = true;
  const state = setup(12 * MiB, null, { respond(request, { accept }) {
    if (request.method === "PATCH" && first) { first = false; return new Response('{"code":"LockTimeout","message":"temporary lock"}', { status: 423 }); }
    return accept(request);
  } });
  await state.adapter.uploadObject(state.objectPath, state.file);
  assert.deepEqual(state.slices.map(slice => slice.start), [0, 0, 6 * MiB]);
});

test("request timeouts abort and exhaust bounded retries while preserving recovery state", async () => {
  const state = setup(12 * MiB, null, { expireRequests: true, respond(request, { accept }) {
    if (request.method === "POST") return accept(request);
    assert.ok(request.signal, "Pending requests must be abortable");
    return new Promise((resolve, reject) => request.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
  } });
  await assert.rejects(state.adapter.uploadObject(state.objectPath, state.file), /逾時/);
  assert.equal(state.requests.filter(request => request.method === "PATCH").length, 6);
  assert.equal(state.saved.has(state.resumeKey), true);
  assert.equal(state.timers.size, 0);
});

test("service errors retain bounded size and auth detail", async () => {
  const state = setup(12 * MiB, null, { respond() { return new Response(JSON.stringify({ code: "EntityTooLarge", message: `maximum allowed size ${"x".repeat(1000)}` }), { status: 413 }); } });
  await assert.rejects(state.adapter.uploadObject(state.objectPath, state.file), error => {
    assert.match(error.message, /413/);
    assert.match(error.message, /EntityTooLarge/);
    assert.match(error.message, /maximum allowed size/);
    assert.ok(error.message.length < 350);
    return true;
  });
  assert.equal(state.requests.length, 1);
});

test("metadata lookup uses the normal RLS client and maps the exact storage path", async () => {
  const row = { id: "file-id", space_id: "space-id", folder_id: null, original_name: "release.zip", storage_path: "exact/path.zip", mime_type: "application/zip", extension: "zip", category: "archive", file_size: 12 * MiB, description: null, uploaded_by: "owner", created_at: "now", updated_at: "now" };
  const state = setup(12 * MiB, null, { queryResult: { data: row, error: null } });
  const file = await state.adapter.findFileByStoragePath(row.storage_path);
  assert.equal(file.storagePath, row.storage_path);
  assert.equal(file.originalName, row.original_name);
  assert.deepEqual(state.queries, [["test_plan_files", "select", "*"], ["test_plan_files", "eq", "storage_path", row.storage_path]]);
  const absent = setup(12 * MiB);
  assert.equal(await absent.adapter.findFileByStoragePath("missing"), undefined);
});

test("small files use the same resumable transport and progress reporting", async () => {
  const state = setup(6 * MiB);
  await state.adapter.uploadObject(state.objectPath, state.file, (done, total) => state.progress.push([done, total]));
  assert.equal(state.standardUploads.length, 0);
  assert.deepEqual(state.requests.map(request => request.method), ["POST", "PATCH"]);
  assert.deepEqual(state.slices, [{ start: 0, end: 6 * MiB, size: 6 * MiB }]);
  assert.deepEqual(state.progress, [[0, 6 * MiB], [6 * MiB, 6 * MiB]]);
});

test("zero-byte files retain the standard upload without a false TUS completion", async () => {
  const state = setup(0);
  await state.adapter.uploadObject(state.objectPath, state.file, (done, total) => state.progress.push([done, total]));
  assert.equal(state.standardUploads.length, 1);
  assert.equal(state.standardUploads[0].body, state.file);
  assert.equal(state.requests.length, 0);
  assert.equal(state.slices.length, 0);
  assert.deepEqual(state.progress, [[0, 0], [0, 0]]);
});

test("small committed uploads recover a lost response and subsequent 409 through HEAD", async () => {
  let patches = 0;
  let heads = 0;
  const state = setup(2 * MiB, null, { respond(request, { accept, setOffset }) {
    if (request.method === "PATCH") {
      patches += 1;
      if (patches === 1) { setOffset(request.body.end); throw new TypeError("Failed to fetch"); }
      return new Response('{"message":"offset already committed"}', { status: 409 });
    }
    if (request.method === "HEAD" && ++heads === 1) return new Response(null, { status: 503 });
    return accept(request);
  } });
  await state.adapter.uploadObject(state.objectPath, state.file);
  assert.deepEqual(state.requests.map(request => request.method), ["POST", "PATCH", "HEAD", "PATCH", "HEAD"]);
  assert.equal(state.standardUploads.length, 0);
  assert.equal(state.saved.has(state.resumeKey), true);
  await state.adapter.uploadObject(state.objectPath, state.file);
  assert.equal(state.requests.at(-1).method, "HEAD");
  assert.equal(state.requests.filter(request => request.method === "POST").length, 1);
  assert.equal(patches, 2);
});

test("small saved uploads reject a different server length without retransmitting or creating metadata", async () => {
  const state = setup(2 * MiB, 2 * MiB, { respond() {
    return new Response(null, { status: 200, headers: { "Upload-Offset": String(2 * MiB), "Upload-Length": String(3 * MiB) } });
  } });
  await assert.rejects(state.adapter.uploadObject(state.objectPath, state.file), /大小|長度/);
  assert.ok(state.requests.every(request => request.method === "HEAD"));
  assert.equal(state.standardUploads.length, 0);
  assert.equal(state.saved.has(state.resumeKey), true);
});

test("an unowned small resume resource cannot be treated as a completed object", async () => {
  const state = setup(2 * MiB, 2 * MiB, { respond() { return new Response('{"code":"AccessDenied","message":"not this uploader"}', { status: 403 }); } });
  await assert.rejects(state.adapter.uploadObject(state.objectPath, state.file), /403/);
  assert.deepEqual(state.requests.map(request => request.method), ["HEAD"]);
  assert.equal(state.standardUploads.length, 0);
  assert.equal(state.saved.has(state.resumeKey), true);
});
