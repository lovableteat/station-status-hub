import assert from "node:assert/strict";
import test from "node:test";
import { RemoteRuntime, checkEngineServer, decodeResult, encodeRequest } from "../../src/components/comparison/runtime.ts";

const bytes = (text: string): ArrayBuffer => Uint8Array.from(new TextEncoder().encode(text)).buffer;
const text = async (form: FormData, part: string) => (form.get(part) as File).text();
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("encodeRequest turns run inputs into multipart parts with {path, part} references", async () => {
  const { form, count, bytes: total } = encodeRequest("run", {
    a: [{ path: "EVT/pstxnet.dat", bytes: bytes("net") }], b: [{ path: "DVT\\pstxnet.dat", bytes: bytes("netb") }], aLabel: "EVT", bLabel: "DVT",
    options: { library: "devices: []\n", datasheets: [{ path: "ds/x.pdf", bytes: bytes("pdf") }], railMap: { path: "rail.csv", bytes: bytes("r") } },
  });
  const request = JSON.parse(form.get("request") as string);
  assert.equal(request.aLabel, "EVT");
  assert.equal(request.a[0].path, "EVT/pstxnet.dat");
  assert.equal(request.b[0].path, "DVT/pstxnet.dat");
  assert.equal(await text(form, request.a[0].part), "net");
  assert.equal(await text(form, request.b[0].part), "netb");
  assert.equal(await text(form, request.options.datasheets[0].part), "pdf");
  assert.equal(await text(form, request.options.railMap.part), "r");
  assert.equal((form.get(request.a[0].part) as File).name, "EVT/pstxnet.dat");
  assert.equal(request.options.library, "devices: []\n");
  assert.equal(count, 5);
  assert.equal(total, 3 + 4 + 3 + 1 + "devices: []\n".length);
});

test("encodeRequest enforces the worker's input rules before anything is uploaded", () => {
  const run = (a: unknown) => encodeRequest("run", { a, b: [], options: {} });
  assert.throws(() => run([{ path: "../x.dat", bytes: bytes("x") }]), /上層目錄/);
  assert.throws(() => run([{ path: "C:x.dat", bytes: bytes("x") }]), /路徑無效/);
  assert.throws(() => run([{ path: "x.dat" }]), /缺少檔案內容/);
  assert.throws(() => run([{ path: "x.dat", bytes: bytes("1") }, { path: "X.DAT", bytes: bytes("2") }]), /重複檔案路徑/);
  assert.throws(() => run(Array.from({ length: 1001 }, (_, index) => ({ path: `${index}.dat`, bytes: bytes("x") }))), /輸入超過限制/);
  assert.throws(() => run([{ path: "big.dat", bytes: new ArrayBuffer(64 * 1024 * 1024 + 1) }]), /輸入超過限制/);
  assert.throws(() => encodeRequest("run", { a: [], b: [], options: { railMap: "text" } }), /railMap 格式/);
  assert.throws(() => encodeRequest("tracker", { template: "nope", rows: [] }), /Excel 範本/);
  assert.throws(() => encodeRequest("library", { yaml: 12 }), /YAML 格式/);
  assert.throws(() => encodeRequest("nope", {}), /不支援/);
  assert.throws(() => encodeRequest("run", null), /格式無效/);
});

test("tracker and datasheet requests carry their single file", async () => {
  const tracker = encodeRequest("tracker", { template: bytes("xlsx"), rows: [{ key: "k" }], replies: {}, aLabel: "A", bLabel: "B" });
  const request = JSON.parse(tracker.form.get("request") as string);
  assert.equal(await text(tracker.form, request.template.part), "xlsx");
  assert.deepEqual(request.rows, [{ key: "k" }]);
  const sheet = encodeRequest("datasheet", { file: { path: "TMP.pdf", bytes: bytes("pdf") }, name: "TMP", mpn: "TMP" });
  assert.equal(JSON.parse(sheet.form.get("request") as string).file.path, "TMP.pdf");
});

test("decodeResult restores ArrayBuffers from base64", () => {
  const run = decodeResult("run", { rows: [], artifacts: [{ key: "xlsx", name: "a.xlsx", mime: "x", bytes: Buffer.from("hello").toString("base64") }] }) as { artifacts: { key: string; bytes: ArrayBuffer }[] };
  assert.equal(run.artifacts[0].key, "xlsx");
  assert.equal(new TextDecoder().decode(run.artifacts[0].bytes), "hello");
  const tracker = decodeResult("tracker", { key: "xlsx", name: "t.xlsx", mime: "x", bytes: Buffer.from("hi").toString("base64") }) as { bytes: ArrayBuffer };
  assert.equal(new TextDecoder().decode(tracker.bytes), "hi");
  assert.throws(() => decodeResult("run", { artifacts: "no" }), /格式無效/);
  assert.throws(() => decodeResult("run", { artifacts: [{ key: "x" }] }), /缺少檔案內容/);
  assert.deepEqual(decodeResult("library", { entries: [] }), { entries: [] });
});

test("RemoteRuntime posts the form with the token, maps errors and cancels", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const target = String(url);
    if (target.endsWith("/run")) return respond({ rows: [], artifacts: [{ key: "pdf", name: "r.pdf", mime: "application/pdf", bytes: Buffer.from("%PDF").toString("base64") }] });
    if (target.endsWith("/library")) return respond({ error: "使用者位址庫：壞掉" }, 400);
    if (target.endsWith("/datasheet")) return new Response("<html>", { status: 502 });
    const signal = init?.signal as AbortSignal;
    return new Promise<Response>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
  }) as typeof fetch;
  try {
    const runtime = new RemoteRuntime({ url: "http://autocheck.local:8000/", token: "secret" });
    const messages: string[] = [];
    const result = await runtime.request<{ artifacts: { bytes: ArrayBuffer }[] }>("run", { a: [{ path: "a.dat", bytes: bytes("a") }], b: [], options: {} }, message => messages.push(message));
    assert.equal(new TextDecoder().decode(result.artifacts[0].bytes), "%PDF");
    assert.equal(calls[0].url, "http://autocheck.local:8000/api/autocheck/run");
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer secret");
    assert.ok(calls[0].init.body instanceof FormData);
    assert.match(messages[0], /上傳 1 份檔案.*autocheck\.local:8000/);
    await assert.rejects(runtime.request("library", { yaml: "x" }), /使用者位址庫：壞掉/);
    await assert.rejects(runtime.request("datasheet", { file: { path: "x.pdf", bytes: bytes("p") } }), /不是 JSON（HTTP 502）/);
    const generation = runtime.generation;
    const pending = runtime.request("tracker", { template: bytes("x"), rows: [] });
    runtime.cancel("停了");
    await assert.rejects(pending, /停了/);
    assert.equal(runtime.generation, generation + 1);
  } finally { globalThis.fetch = original; }
});

test("checkEngineServer validates the health response", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async () => respond({ ok: true, service: "autocheck-api", engine: { revision: "2026-10-27", version: "0.2.0", files: 52 }, auth: "token" })) as typeof fetch;
    assert.deepEqual(await checkEngineServer({ url: "http://h", token: "t" }), { revision: "2026-10-27", version: "0.2.0", files: 52, auth: "token" });
    await assert.rejects(checkEngineServer({ url: "http://h", token: "" }), /需要 API token/);
    globalThis.fetch = (async () => respond({ error: "API token 不正確或未提供" }, 401)) as typeof fetch;
    await assert.rejects(checkEngineServer({ url: "http://h", token: "bad" }), /token 不正確/);
    globalThis.fetch = (async () => respond({ hello: 1 })) as typeof fetch;
    await assert.rejects(checkEngineServer({ url: "http://h", token: "" }), /不是 AutoCheck 比對伺服器/);
    globalThis.fetch = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
    await assert.rejects(checkEngineServer({ url: "http://h", token: "" }), /無法連線到 h/);
  } finally { globalThis.fetch = original; }
});
