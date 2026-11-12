import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const { loader, database } = createRequire(import.meta.url)("./support/renderHarness.cjs");

const record = (id, provider, model, baseUrl, patch = {}) => ({ id, key_name: id, api_key: `qa-secret-${id}`, is_active: true, expires_at: null,
  permissions: { read: true, write: true, extra: "keep", metadata: { provider, model, baseUrl, editable: false, extra: "keep" } }, ...patch });
const rows = [record("openai", "openai", "gpt-5.4", "https://api.openai.com/v1"), record("gemini", "gemini", "gemini-2.5-flash", "https://generativelanguage.googleapis.com/v1beta"),
  record("claude", "anthropic", "qa-claude", "https://api.anthropic.com/v1"), record("custom", "openai-compatible", "qa-custom", "https://example.invalid/v1"),
  record("off", "openai", "qa", "https://example.invalid", { is_active: false }), record("expired", "openai", "qa", "https://example.invalid", { expires_at: "2000-01-01" }),
  record("bad-date", "openai", "qa", "https://example.invalid", { expires_at: "invalid" }), record("denied", "openai", "qa", "https://example.invalid", { permissions: { read: false } }),
  record("empty", "openai", "", "https://example.invalid"), record("no-provider", "", "qa", "https://example.invalid"), record("no-route", "openai", "qa", "")];
const mapping = { headerRow: 1, partNumber: 1, mpn: 2, manufacturer: 3, description: 4, qty: 5, refs: 6 };
const before = { name: "Old", rows: [["NV PN", "MPN", "Maker", "Part", "Qty", "Refs"], ["001", "KEEP", "Maker", "Part", "1", "R1"], ["002", "OLD", "Maker", "Part", "1", "R2"]] };
const after = { name: "New", rows: [before.rows[0], ["001", "KEEP", "Maker", "Part", "2", "R1,R3"], ["003", "NEW", "Maker", "Part", "1", "R4"]] };
const { compareNvBomSheets } = loader({})("src/components/material-requests/nvBomCompare.ts");
const comparison = { beforeMapping: mapping, afterMapping: mapping, diff: compareNvBomSheets(before, after, mapping, mapping) };
function load({ queryError = null, discoveredModels = ["gpt-5.4", "gpt-6.1-sol"], transport = async () => { throw new Error("Unexpected provider call"); } } = {}) {
  return loader({ globals: { Response, Headers, TextEncoder, TextDecoder }, mocks: {
    "@/integrations/supabase/client": { supabase: database(() => ({ data: rows, error: queryError })) },
    "../api-management/aiUsageTelemetry": { trackedProviderFetch: transport },
    "./aiProviderTransport": { fetchAiProvider: async () => new Response(JSON.stringify({ data: discoveredModels.map(id => ({ id })) })) },
  } })("src/components/material-requests/nvBomCompareAi.ts");
}
function requestInput(call) {
  const body = JSON.parse(call.init.body);
  return JSON.parse(call.provider === "gemini" ? body.contents.at(-1).parts[0].text : body.messages.at(-1).content);
}
function response(provider, content) {
  const text = JSON.stringify(content);
  const payload = provider === "gemini" ? { candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] }
    : provider === "anthropic" ? { content: [{ type: "text", text }], stop_reason: "end_turn" }
    : { choices: [{ message: { content: text }, finish_reason: "stop" }] };
  return new Response(JSON.stringify(payload), { status: 200 });
}

test("NV model choices expand chat targets while retaining key identity, permissions and saved choices", async () => {
  const original = JSON.stringify(rows);
  const models = await load().loadNvBomModels();
  assert.equal(models.length, 7);
  assert.equal(new Set(models.map(item => item.id)).size, 7);
  assert.deepEqual(Array.from(new Set(models.map(item => item.record.id))), ["openai", "gemini", "claude", "custom"]);
  for (const saved of rows.slice(0, 4)) assert.ok(models.some(item => item.id === saved.id && item.record.permissions.metadata.model === saved.permissions.metadata.model));
  for (const model of models) {
    assert.equal(model.record.permissions.read, true); assert.equal(model.record.permissions.write, true);
    assert.equal(model.record.permissions.extra, "keep"); assert.equal(model.record.permissions.metadata.extra, "keep");
    assert.equal(model.record.permissions.metadata.editable, false);
    assert.ok(model.label.endsWith(model.record.permissions.metadata.model));
  }
  assert.ok(models.some(item => item.record.permissions.metadata.model === "gpt-6.1-sol"));
  assert.ok(models.some(item => item.record.permissions.metadata.model === "gemini-3.8-flash"));
  assert.equal(models.filter(item => item.record.permissions.metadata.model === "gemini-2.5-flash").length, 1);
  assert.equal(JSON.stringify(rows), original, "adding choices must not rewrite saved key settings");
});

test("NV model load failure remains explicit instead of returning an empty success", async () => {
  await assert.rejects(load({ queryError: new Error("QA denied") }).loadNvBomModels(), /無法讀取可用的 AI 服務/);
});

test("NV comparison keeps all saved providers while omitting an unverified synthetic Sol choice", async () => {
  const models = await load({ discoveredModels: ["gpt-5.4"] }).loadNvBomModels();
  assert.equal(models.length, 6);
  assert.equal(models.some(item => item.label.endsWith("gpt-6.1-sol")), false);
  assert.deepEqual(Array.from(new Set(models.map(item => item.record.id))), ["openai", "gemini", "claude", "custom"]);
});

test("each NV choice sends only confirmed differences for review using its own model and key", async () => {
  const calls = [];
  const service = load({ transport: async call => {
    calls.push(call);
    const body = JSON.parse(call.init.body), input = requestInput(call);
    if (call.provider === "gemini") {
      assert.ok(call.url.includes(`/models/${call.model}:generateContent`));
      assert.equal(body.generationConfig?.responseMimeType, "application/json", "Gemini review requires JSON mode");
    } else {
      assert.equal(body.model, call.model);
      assert.equal(body.generationConfig, undefined, "Gemini options must not leak into other provider formats");
    }
    assert.deepEqual(input.items.map(item => item.id), Array.from(comparison.diff.changes, item => item.id));
    assert.equal(input.before, undefined);
    assert.equal(input.after, undefined);
    return response(call.provider, { items: input.items.map(item => ({ id: item.id, action: `核對 ${item.kind}`, note: "來源列核對" })) });
  } });
  const models = await service.loadNvBomModels();
  assert.equal(models.length, 7);
  for (const model of models) {
    const start = calls.length, partial = [];
    const result = await service.runNvBomComparison({ comparison, model, signal: new AbortController().signal, onProgress() {}, onResult: value => partial.push(value) });
    assert.equal(calls.length - start, 1);
    for (const call of calls.slice(start)) {
      assert.equal(call.apiKeyId, model.record.id); assert.equal(call.model, model.record.permissions.metadata.model);
      assert.equal(call.source, "ai-chat");
    }
    assert.equal(result.modelId, model.id); assert.equal(result.modelLabel, model.label);
    assert.equal(result.reviewed, 3); assert.equal(partial.length, 2);
    assert.deepEqual(Array.from(result.diff.changes, item => item.kind).sort(), ["added", "changed", "removed"]);
    assert.ok(result.diff.changes.every(item => item.advice && item.aiNote));
    assert.equal(result.diff.changes.find(item => item.kind === "added").after.partNumber, "003");
  }
});

test("malformed Gemini review remains an explicit failure and retains the computed difference table", async () => {
  const calls = [], partial = [];
  const service = load({ transport: async call => {
    calls.push(call);
    assert.ok(requestInput(call).items.length);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "I reviewed the changes, but this response is not JSON." }] }, finishReason: "STOP" }] }), { status: 200 });
  } });
  const model = (await service.loadNvBomModels()).find(item => item.record.permissions.metadata.model === "gemini-3.5-flash-lite");
  assert.ok(model);
  await assert.rejects(service.runNvBomComparison({ comparison, model, signal: new AbortController().signal, onProgress() {}, onResult: value => partial.push(value) }), /AI 沒有回傳可讀取的完整結果/);
  assert.equal(calls.length, 1);
  for (const call of calls) assert.equal(JSON.parse(call.init.body).generationConfig?.responseMimeType, "application/json");
  assert.equal(partial.length, 1, "the comparison table is published before review, without claiming completion");
  assert.equal(partial[0].modelId, model.id); assert.equal(partial[0].reviewed, 0);
  assert.deepEqual(Array.from(partial[0].diff.changes, item => item.kind).sort(), ["added", "changed", "removed"]);
  assert.ok(partial[0].diff.changes.every(item => !item.advice && !item.aiNote));
});

test("AI maps unfamiliar headings by Excel coordinate without sending BOM contents", async () => {
  const unknown = { name: "private-workbook", rows: [["QA PRIVATE MEMO", "ACQUISITION PRIVATE REMARK"], ["", "Component Code", "Supplier Model", "Units Used", "PCB Site"], ["", "PRIVATE-0042", "QA-172", "1", "R22"]] };
  const guess = { headerRow: 2, partNumber: 2, mpn: 3, manufacturer: null, description: null, qty: 4, refs: 5 };
  let calls = 0;
  const service = load({ transport: async call => {
    calls++;
    assert.deepEqual(requestInput(call), { after: { rows: [{ row: 2, columns: [
      { column: 2, header: "Component Code" }, { column: 3, header: "Supplier Model" }, { column: 4, header: "Units Used" }, { column: 5, header: "PCB Site" },
    ] }] } });
    assert.doesNotMatch(call.init.body, /private-workbook|PRIVATE-0042|QA-172|R22|PRIVATE MEMO|PRIVATE REMARK/);
    return response(call.provider, { after: guess });
  } });
  const model = (await service.loadNvBomModels())[0];
  const resolved = await service.resolveNvBomMappings({ sources: { after: unknown }, model, signal: new AbortController().signal });
  assert.deepEqual({ ...resolved.after }, guess);
  assert.equal(calls, 1);
});

test("AI cannot assign a duplicate heading or use a row outside the candidate table", async () => {
  const unknown = { name: "QA", rows: [["Part Number", "Qty", "Qty"], ["001", "1", "2"]] };
  let headerRow = 1;
  const service = load({ transport: async call => response(call.provider, { before: { headerRow, partNumber: 1, qty: 3 } }) });
  const model = (await service.loadNvBomModels())[0];
  const resolve = () => service.resolveNvBomMappings({ sources: { before: unknown }, model, signal: new AbortController().signal });
  await assert.rejects(resolve(), /無法確認.*數量/);
  headerRow = 2;
  await assert.rejects(resolve(), /無法確認.*表頭/);
});
