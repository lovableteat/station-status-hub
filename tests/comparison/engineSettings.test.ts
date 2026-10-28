import assert from "node:assert/strict";
import test from "node:test";
import { ENGINE_SETTINGS_KEY, defaultEngineSettings, engineHost, mixedContentProblem, normalizeEngineUrl, readEngineSettings, writeEngineSettings } from "../../src/components/comparison/engineSettings.ts";

function storage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); }, removeItem: (key: string) => { map.delete(key); } };
}

test("normalizeEngineUrl trims, strips trailing slashes and rejects addresses that are not plain http(s)", () => {
  assert.equal(normalizeEngineUrl("  http://autocheck.local:8000/  "), "http://autocheck.local:8000");
  assert.equal(normalizeEngineUrl("https://api.example.com/autocheck/"), "https://api.example.com/autocheck");
  assert.equal(normalizeEngineUrl(""), "");
  assert.throws(() => normalizeEngineUrl("ftp://x"), /http:\/\/ 或 https:\/\//);
  assert.throws(() => normalizeEngineUrl("autocheck.local:8000"), /http/);
  assert.throws(() => normalizeEngineUrl("http://user:pw@host/"), /帳號/);
  assert.throws(() => normalizeEngineUrl("http://host/?x=1"), /查詢/);
});

test("the browser is the default when nothing is saved and no build-time server is set", () => {
  assert.deepEqual(defaultEngineSettings(), { mode: "browser", url: "", token: "" });
  assert.deepEqual(readEngineSettings(storage()), { mode: "browser", url: "", token: "" });
  assert.deepEqual(readEngineSettings(null), { mode: "browser", url: "", token: "" });
});

test("a saved server choice round-trips and unusable saved values fall back to the browser", () => {
  const store = storage();
  writeEngineSettings({ mode: "server", url: "http://autocheck.local:8000", token: "secret" }, store);
  assert.deepEqual(readEngineSettings(store), { mode: "server", url: "http://autocheck.local:8000", token: "secret" });
  writeEngineSettings({ mode: "browser", url: "http://autocheck.local:8000", token: "secret" }, store);
  assert.deepEqual(readEngineSettings(store), { mode: "browser", url: "http://autocheck.local:8000", token: "secret" });
  store.setItem(ENGINE_SETTINGS_KEY, JSON.stringify({ mode: "server", url: "", token: "x" }));
  assert.equal(readEngineSettings(store).mode, "browser");
  store.setItem(ENGINE_SETTINGS_KEY, "not json");
  assert.deepEqual(readEngineSettings(store), { mode: "browser", url: "", token: "" });
  store.setItem(ENGINE_SETTINGS_KEY, JSON.stringify({ mode: "server", url: "javascript:alert(1)", token: "" }));
  assert.deepEqual(readEngineSettings(store), { mode: "browser", url: "", token: "" });
  store.setItem(ENGINE_SETTINGS_KEY, JSON.stringify({ mode: "server", url: "http://h", token: "x".repeat(600) }));
  assert.deepEqual(readEngineSettings(store), { mode: "server", url: "http://h", token: "" });
});

test("mixedContentProblem explains why an https page cannot reach an http server off this computer", () => {
  assert.match(mixedContentProblem("http://autocheck.local:8000", "https:"), /https.*autocheck\.local:8000.*localhost:8000/);
  assert.match(mixedContentProblem("http://10.0.0.5", "https:"), /localhost:8000/);
  assert.equal(mixedContentProblem("http://localhost:8000", "https:"), "");
  assert.equal(mixedContentProblem("http://127.0.0.1:8765", "https:"), "");
  assert.equal(mixedContentProblem("http://[::1]:8000", "https:"), "");
  assert.equal(mixedContentProblem("https://autocheck.local", "https:"), "");
  assert.equal(mixedContentProblem("http://autocheck.local:8000", "http:"), "");
  assert.equal(mixedContentProblem("nonsense", "https:"), "");
});

test("engineHost shows the host for the badge", () => {
  assert.equal(engineHost("http://autocheck.local:8000"), "autocheck.local:8000");
  assert.equal(engineHost("nonsense"), "nonsense");
});
