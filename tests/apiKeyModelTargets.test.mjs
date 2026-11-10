import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const { loader } = createRequire(import.meta.url)("./support/renderHarness.cjs");

const key = (id = "openai", patch = {}) => ({
  id, key_name: id, api_key: `qa-secret-${id}`, is_active: true, expires_at: null,
  permissions: { read: true, write: false, extra: "keep", metadata: { provider: "openai", model: "gpt-5.4", baseUrl: "https://api.openai.com/v1", editable: false } },
  ...patch,
});
const gemini = key("gemini", { permissions: { read: true, metadata: { provider: "gemini", model: "gemini-2.5-flash", baseUrl: "https://generativelanguage.googleapis.com/v1beta" } } });
const custom = key("custom", { permissions: { read: true, metadata: { provider: "openai-compatible", model: "qa-custom", baseUrl: "https://custom.invalid/v1" } } });
const geminiModels = ["gemini-2.5-flash", "gemini-3.5-flash-lite"];
const json = (models, status = 200) => new Response(JSON.stringify({ data: models.map(id => ({ id })) }), { status });
function service(transport, globals = {}) {
  return loader({ globals: { Response, Headers, TextEncoder, TextDecoder, ...globals }, mocks: { "./aiProviderTransport": { fetchAiProvider: transport } } })("src/components/api-management/apiKeyModelTargets.ts");
}
const models = targets => Array.from(targets, target => target.model);

test("Sol is offered only when the saved key model list explicitly contains its exact id", async () => {
  const calls = [], record = key(), original = JSON.stringify(record);
  const load = service(async (...args) => { calls.push(args); return json(["gpt-5.4", "gpt-6.1-sol"]); }).loadApiKeyModelTargets;
  const targets = await load([record, gemini, custom], geminiModels);
  assert.deepEqual(models(targets), ["gpt-5.4", "gpt-6.1-sol", ...geminiModels, "qa-custom"]);
  assert.equal(calls.length, 1);
  const [provider, url, init, apiKeyId] = calls[0];
  assert.equal(provider, "openai"); assert.equal(url, "https://api.openai.com/v1/models"); assert.equal(init.method, "GET"); assert.equal(apiKeyId, record.id);
  assert.ok(init.signal instanceof AbortSignal); assert.equal(init.body, undefined);
  assert.ok(!Object.values(init.headers).some(value => String(value).includes(record.api_key)), "saved-key discovery uses the credential id instead of sending the raw key");
  assert.equal(targets[0].record, record); assert.equal(targets[1].record, record);
  assert.equal(JSON.stringify(record), original, "discovery must not alter key settings or permissions");
  const missing = service(async () => json(["gpt-5.4", "gpt-6.1-sol-preview"]));
  assert.deepEqual(models(await missing.loadApiKeyModelTargets([record, gemini, custom], geminiModels)), ["gpt-5.4", ...geminiModels, "qa-custom"]);
});

test("failed or malformed discovery preserves saved models and the other providers", async () => {
  for (const transport of [async () => { throw new Error("QA network unavailable"); }, async () => json([], 403), async () => new Response("not-json"), async () => new Response(JSON.stringify({ data: null }))]) {
    const targets = await service(transport).loadApiKeyModelTargets([key(), gemini, custom], geminiModels);
    assert.deepEqual(models(targets), ["gpt-5.4", ...geminiModels, "qa-custom"]);
  }
});

test("model discovery shares concurrent calls and caches briefly without surviving credential changes", async () => {
  let now = Date.now(), calls = 0, resolve;
  class Clock extends Date { static now() { return now; } }
  const pending = new Promise(done => { resolve = done; });
  const load = service(async () => { calls++; if (calls === 1) await pending; return json(["gpt-5.4", "gpt-6.1-sol"]); }, { Date: Clock }).loadApiKeyModelTargets;
  const record = key();
  const first = load([record], []), second = load([record], []);
  await Promise.resolve(); await Promise.resolve(); resolve();
  await Promise.all([first, second]); assert.equal(calls, 1, "concurrent consumers share discovery");
  await load([{ ...record, usage_count: 50, last_used_at: new Date(now).toISOString() }], []);
  assert.equal(calls, 1, "usage realtime updates do not repeat discovery");
  now += 60_001; await load([record], []); assert.equal(calls, 2, "short cache expires");
  await load([{ ...record, api_key: "qa-rotated-secret" }], []); assert.equal(calls, 3, "rotating the credential invalidates its cached entitlement");
  await load([{ ...record, id: "other-key" }], []); assert.equal(calls, 4, "credential record identity is independent");
});

test("inactive expired or unreadable keys never trigger a model discovery request", async () => {
  let calls = 0;
  const records = [key("off", { is_active: false }), key("expired", { expires_at: "2000-01-01T00:00:00Z" }), key("invalid-date", { expires_at: "invalid" }), key("denied", { permissions: { read: false, metadata: { provider: "openai", model: "gpt-5.4", baseUrl: "https://api.openai.com/v1" } } })];
  const targets = await service(async () => { calls++; return json(["gpt-6.1-sol"]); }).loadApiKeyModelTargets(records, []);
  assert.equal(calls, 0); assert.deepEqual(models(targets), []);
});

test("explicitly saved Sol and custom model settings stay intact without synthetic-upgrade discovery", async () => {
  let calls = 0;
  const saved = key("saved-sol", { permissions: { read: true, metadata: { provider: "openai", model: "gpt-6.1-sol", baseUrl: "https://api.openai.com/v1" } } });
  const nonOfficial = key("alternate", { permissions: { read: true, metadata: { provider: "openai", model: "gpt-5.4", baseUrl: "https://alternate.invalid/v1" } } });
  const targets = await service(async () => { calls++; throw new Error("Unexpected discovery"); }).loadApiKeyModelTargets([saved, custom, nonOfficial], []);
  assert.equal(calls, 0); assert.deepEqual(models(targets), ["gpt-6.1-sol", "qa-custom", "gpt-5.4"]);
});
