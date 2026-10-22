import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../../public/file-library-sw.js", import.meta.url), "utf8");
const ORIGIN = "https://proj.supabase.co";
const SITE = "https://lovableteat.github.io";

function worker({ fetchImpl } = {}) {
  const listeners = new Map();
  const self = {
    location: { search: `?origin=${encodeURIComponent(ORIGIN)}`, origin: SITE },
    skipWaiting() { self.skipped = true; },
    clients: { async claim() { self.claimed = true; } },
    addEventListener(type, handler) { listeners.set(type, handler); },
  };
  const context = vm.createContext({ self, URL, URLSearchParams, Headers, Response, fetch: fetchImpl ?? (async () => { throw new Error("no network"); }) });
  vm.runInContext(source, context);
  return {
    self,
    install() { listeners.get("install")(); },
    async activate() { let waited; listeners.get("activate")({ waitUntil(promise) { waited = promise; } }); await waited; },
    async request(url, method = "GET") {
      let responded;
      listeners.get("fetch")({ request: { url, method }, respondWith(promise) { responded = promise; } });
      return responded ? await responded : undefined;
    },
  };
}

const proxyUrl = (params) => `${SITE}/station-status-hub/__file-library__/download/file-1/report.xlsx?${new URLSearchParams(params)}`;

test("takes control immediately and leaves every other request to the network", async () => {
  const w = worker();
  w.install();
  await w.activate();
  assert.equal(w.self.skipped, true);
  assert.equal(w.self.claimed, true);
  assert.equal(await w.request(`${SITE}/station-status-hub/assets/index.js`), undefined);
  assert.equal(await w.request(`${SITE}/station-status-hub/`), undefined);
  assert.equal(await w.request(proxyUrl({ u: `${ORIGIN}/storage/v1/object/sign/test-plan-files/a?token=x`, n: "report.xlsx" }), "POST"), undefined);
  assert.equal(await w.request(`https://other.example/station-status-hub/__file-library__/download/x`), undefined);
});

test("only streams objects from the registered storage origin", async () => {
  const w = worker();
  for (const bad of ["https://evil.example/storage/v1/object/sign/x", `${ORIGIN}/auth/v1/token`, "http://proj.supabase.co/storage/v1/object/sign/x", "not a url", ""]) {
    const response = await w.request(proxyUrl({ u: bad, n: "report.xlsx" }));
    assert.equal(response.status, 403, bad);
  }
});

test("relays the storage body with attachment headers, the original name and the length", async () => {
  const upstreamBody = new Uint8Array([1, 2, 3, 4]);
  const calls = [];
  const w = worker({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(upstreamBody, { status: 200, headers: { "content-length": "4", "content-type": "application/octet-stream" } });
    },
  });
  const response = await w.request(proxyUrl({ u: `${ORIGIN}/storage/v1/object/sign/test-plan-files/a%20b?token=x`, n: "機櫃配置 v2.xlsx", t: "application/vnd.ms-excel", s: "99" }));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${ORIGIN}/storage/v1/object/sign/test-plan-files/a%20b?token=x`);
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(response.headers.get("content-type"), "application/vnd.ms-excel");
  assert.equal(response.headers.get("content-length"), "4");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const disposition = response.headers.get("content-disposition");
  assert.match(disposition, /^attachment; filename="[^"]*v2\.xlsx"; filename\*=UTF-8''/);
  assert.ok(disposition.includes(encodeURIComponent("機櫃配置 v2.xlsx")));
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), upstreamBody);
});

test("reports upstream failures as a readable 502 instead of a broken download", async () => {
  const failing = worker({ fetchImpl: async () => new Response("denied", { status: 400 }) });
  const denied = await failing.request(proxyUrl({ u: `${ORIGIN}/storage/v1/object/sign/x`, n: "a.bin" }));
  assert.equal(denied.status, 502);
  assert.match(await denied.text(), /400/);
  const offline = worker({ fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });
  const dropped = await offline.request(proxyUrl({ u: `${ORIGIN}/storage/v1/object/sign/x`, n: "a.bin" }));
  assert.equal(dropped.status, 502);
});
