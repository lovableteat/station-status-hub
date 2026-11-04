import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import {
  assertSpecFillFollowupCoverage, assertSpecFillResponseComplete, assertSpecFillTextCitations, buildSpecFillJsonSchema,
  buildSpecFillQuestionJsonSchema, buildSpecFillRequestOptions, getSpecFillReviewSummary, parseSpecFillQuestion, parseSpecFillTables,
} from "../src/components/material-requests/materialSpecFill.ts";

const sources = [{ id: "spec-1", name: "Synthetic SPEC.txt" }];
const templates = [{ id: "template-1", name: "first.png" }, { id: "template-2", name: "second.png" }];
const cell = { value: "001.20 V", kind: "source", sourceId: "spec-1", page: "文字", quote: "Synthetic-A: 001.20 V at 25°C" };
const table = (templateId = "template-1") => ({ templateId, title: "Voltage", partMatch: "matched", columns: ["Item", "Value"],
  rows: [[{ value: "VCC", kind: "label" }, cell], [{ value: "", kind: "label" }, { value: "待確認", kind: "missing", quote: "No limit in supplied source" }]], warnings: [] });
const raw = () => JSON.stringify({ reply: "兩張照片皆保留空白與待確認欄位。", tables: templates.map(template => table(template.id)) });

test("strict output schema covers every selected photo, source id and cell field without banning real blanks", () => {
  const schema = buildSpecFillJsonSchema(templates, sources);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.tables.minItems, 2);
  assert.equal(schema.properties.tables.maxItems, 2);
  const shape = schema.properties.tables.items;
  assert.deepEqual(shape.properties.templateId.enum, ["template-1", "template-2"]);
  assert.deepEqual(shape.properties.rows.items.items.required, ["value", "kind", "sourceId", "page", "quote"]);
  assert.deepEqual(shape.properties.rows.items.items.properties.sourceId.enum, ["", "spec-1"]);
  assert.equal(shape.properties.rows.items.items.properties.value.minLength, undefined, "empty fixed cells are valid");
  assert.equal(shape.properties.columns.items.minLength, undefined, "an unlabeled photo column must survive");
});

test("blank positions survive parsing and review totals count evidence rather than fabricated confidence", () => {
  const tables = parseSpecFillTables(raw(), sources, templates);
  assert.equal(tables[0].rows[1][0].value, "");
  assert.deepEqual(getSpecFillReviewSummary(tables), { tables: 2, cells: 8, sourced: 2, missing: 2, labels: 4 });
  assert.doesNotThrow(() => assertSpecFillFollowupCoverage(tables, tables));
  assert.throws(() => assertSpecFillFollowupCoverage([{ ...tables[0], rows: tables[0].rows.slice(0, 1) }, tables[1]], tables), /漏掉/);
  assert.throws(() => assertSpecFillFollowupCoverage([{ ...tables[0], columns: ["Value"] }, tables[1]], tables), /漏掉/);
  assert.throws(() => assertSpecFillFollowupCoverage([tables[0]], tables), /漏掉/);
});

test("long valid cell prose is retained and capacity errors never silently clip a field", () => {
  const full = "A".repeat(5000);
  const value = { ...table(), rows: [[{ value: "VCC", kind: "label" }, { ...cell, value: full }]] };
  const read = data => parseSpecFillTables(JSON.stringify({ tables: [data] }), sources, [templates[0]]);
  assert.equal(read(value)[0].rows[0][1].value, full);
  value.rows[0][1].value = "A".repeat(16001);
  assert.throws(() => read(value), /截斷/);
  value.rows[0][1] = { value: 120, kind: "label" };
  assert.throws(() => read(value), /完整文字/, "numeric JSON must not silently become an empty fixed cell");
});

test("GPT-5.4 precision stays on the configured model, uses supported reasoning and reserves structured output capacity", () => {
  const standard = buildSpecFillRequestOptions("openai", "gpt-5.4", "standard", templates, sources);
  const high = buildSpecFillRequestOptions("openai", "gpt-5.4", "high", templates, sources);
  assert.equal(high.reasoning_effort, "high");
  assert.equal(standard.reasoning_effort, undefined);
  assert.equal(high.max_completion_tokens, 32768);
  assert.equal(standard.max_completion_tokens, 16384);
  assert.equal(high.response_format.type, "json_schema");
  assert.equal(high.response_format.json_schema.strict, true);
  assert.equal(high.response_format.json_schema.schema.properties.tables.maxItems, 2);
  assert.equal(high.store, false);
  assert.equal(high.model, undefined, "the saved model must never be silently replaced");
  assert.equal(high.temperature, undefined, "unsupported sampling options must not accompany reasoning");
  assert.equal(buildSpecFillRequestOptions("openai", "gpt-4.1", "high", templates, sources).reasoning_effort, undefined);
  assert.deepEqual(buildSpecFillRequestOptions("openai", "unknown-model", "high", templates, sources), { store: false });
});

test("Gemini 2.5 uses its documented thinking budget, while unverified model names receive no speculative thinking fields", () => {
  const high = buildSpecFillRequestOptions("gemini", "gemini-2.5-flash", "high", templates, sources).generationConfig;
  assert.equal(high.responseMimeType, "application/json");
  assert.deepEqual(high.thinkingConfig, { thinkingBudget: 8192 });
  assert.equal(high.maxOutputTokens, 32768);
  assert.equal(high.responseJsonSchema.properties.tables.minItems, 2);
  assert.equal(buildSpecFillRequestOptions("gemini", "gemini-2.5-flash", "standard", templates, sources).generationConfig.thinkingConfig, undefined);
  assert.equal(buildSpecFillRequestOptions("gemini", "gemini-3.8-flash", "high", templates, sources).generationConfig.thinkingConfig, undefined);
  assert.equal(buildSpecFillRequestOptions("anthropic", "claude-sonnet-4-20250514", "high", templates, sources).max_tokens, 16384);
  assert.equal(buildSpecFillRequestOptions("anthropic", "claude-3-5-sonnet-20241022", "high", templates, sources).max_tokens, 8192);
  assert.deepEqual(buildSpecFillRequestOptions("anthropic", "claude-3-haiku-20240307", "high", templates, sources), {});
});

test("HTTP 200 truncation and refusals cannot masquerade as a complete answer", () => {
  for (const [provider, payload] of [
    ["openai", { choices: [{ finish_reason: "length", message: { content: raw() } }] }],
    ["gemini", { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: raw() }] } }] }],
    ["anthropic", { stop_reason: "max_tokens", content: [{ type: "text", text: raw() }] }],
  ]) assert.throws(() => assertSpecFillResponseComplete(provider, payload), /長度上限/);
  assert.throws(() => assertSpecFillResponseComplete("openai", { choices: [{ message: { refusal: "Synthetic refusal" } }] }), /未提供/);
  assert.throws(() => assertSpecFillResponseComplete("gemini", { promptFeedback: { blockReason: "SAFETY" } }), /未提供/);
  assert.doesNotThrow(() => assertSpecFillResponseComplete("openai", { choices: [{ finish_reason: "stop" }] }));
  assert.doesNotThrow(() => assertSpecFillResponseComplete("anthropic", { stop_reason: "end_turn" }));
});

const native = createRequire(import.meta.url);
const { loader } = native("./support/renderHarness.cjs");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM3sAAAAASUVORK5CYII=", "base64");
const part = { manufacturerPartNumber: "Synthetic-A", manufacturer: "Synthetic", name: "QA part", refDes: "U1" };
const photoInputs = templates.map(template => ({ ...template, blob: new Blob([png]) }));
const sourceInputs = sources.map(source => ({ ...source, blob: new Blob([cell.quote]) }));
function fixture(provider, response = raw(), finish) {
  const calls = [];
  const load = loader({ transform: source => source.replaceAll("import.meta.url", '"file:///qa/"'), mocks: {
    "@/integrations/supabase/client": { supabase: {} },
    "../api-management/aiUsageTelemetry": { trackedProviderFetch: async input => {
      calls.push(input);
      return Response.json(provider === "openai" ? { choices: [{ finish_reason: finish ?? "stop", message: { content: response } }] }
        : { candidates: [{ finishReason: finish ?? "STOP", content: { parts: [{ text: response }] } }] });
    } },
  }, globals: { Blob, TextDecoder, TextEncoder, btoa, Response } });
  return { ...load("src/components/material-requests/materialSpecFillService.ts"), calls,
    input: { part, photos: photoInputs, sources: sourceInputs, note: "", question: "請依照片完整填寫", precision: "high", signal: new AbortController().signal,
      model: { id: "synthetic-key", label: "QA", record: { id: "synthetic-key", api_key: "synthetic-secret-not-live", is_active: true,
        permissions: { read: true, metadata: { provider, model: provider === "openai" ? "gpt-5.4" : "gemini-2.5-flash", baseUrl: "https://example.invalid/v1" } } } } } };
}

test("the service sends every original photo with high precision and the saved model through the existing metered path", async () => {
  const f = fixture("openai");
  const answer = await f.analyzeSpecFillConversation(f.input);
  assert.equal(answer.tables.length, 2);
  assert.equal(f.calls.length, 1, "no hidden retry or extra paid analysis is introduced");
  const body = JSON.parse(f.calls[0].init.body);
  assert.equal(body.model, "gpt-5.4");
  assert.equal(body.reasoning_effort, "high");
  assert.equal(f.calls[0].timeoutMs, 120000);
  assert.equal(f.calls[0].apiKeyId, "synthetic-key");
  const images = body.messages.flatMap(message => Array.isArray(message.content) ? message.content : []).filter(part => part.type === "image_url");
  assert.equal(images.length, 2);
  assert.ok(images.every(image => image.image_url.detail === "high"));
  assert.match(body.messages[0].content, /不得只輸出找到資料的欄位/);
  assert.match(body.messages[0].content, /不報自創信心百分比/);
  assert.equal(f.calls[0].init.body.includes("synthetic-secret-not-live"), false);
});

test("native Gemini high precision options reach the request without changing the configured model", async () => {
  const f = fixture("gemini");
  await f.analyzeSpecFillConversation(f.input);
  const body = JSON.parse(f.calls[0].init.body);
  assert.match(f.calls[0].url, /gemini-2\.5-flash:generateContent$/);
  assert.equal(body.generationConfig.thinkingConfig.thinkingBudget, 8192);
  assert.equal(body.generationConfig.responseJsonSchema.properties.tables.maxItems, 2);
});

test("truncated replies are rejected before parsing even if the returned JSON is syntactically valid", async () => {
  const f = fixture("openai", raw(), "length");
  await assert.rejects(f.analyzeSpecFillConversation(f.input), /長度上限/);
  assert.equal(f.calls.length, 1);
});

test("follow-up cannot replace a complete table with a shortened revision", async () => {
  const changed = JSON.parse(raw()); changed.tables[0].rows.pop();
  const f = fixture("openai", JSON.stringify(changed));
  const previous = parseSpecFillTables(raw(), sources, templates);
  await assert.rejects(f.analyzeSpecFillConversation({ ...f.input, history: [{ question: "填表", reply: "QA", tables: previous }] }), /漏掉/);
  assert.equal(previous[0].rows.length, 2, "rejected output must not mutate the prior result");
});

test("question-only turns do not erase coverage checks for the most recent complete fill result", async () => {
  const changed = JSON.parse(raw()); changed.tables[0].rows.pop();
  const f = fixture("openai", JSON.stringify(changed));
  const previous = parseSpecFillTables(raw(), sources, templates);
  const history = [{ question: "填表", reply: "原始完整結果", tables: previous },
    { question: "溫度條件呢？", reply: "請按 25°C 核對。", tables: [] }];
  await assert.rejects(f.analyzeSpecFillConversation({ ...f.input, history }), /漏掉/);
  assert.equal(previous[0].rows.length, 2);
  assert.equal(history[1].tables.length, 0);
  assert.equal(f.calls.length, 1);
});

test("revoked read permission is checked before attachments or provider calls", async () => {
  const f = fixture("openai");
  f.input.model.record.permissions.read = false;
  await assert.rejects(f.analyzeSpecFillConversation(f.input), /無法使用/);
  assert.equal(f.calls.length, 0);
});

test("question schema is an answer and citations contract rather than a photographed table contract", () => {
  const schema = buildSpecFillQuestionJsonSchema(sources);
  assert.deepEqual(schema.required, ["reply", "citations"]);
  assert.equal(schema.properties.tables, undefined);
  assert.deepEqual(schema.properties.citations.items.properties.sourceId.enum, ["spec-1"]);
});

test("readable text citations must exist in the selected source, preserving symbols and conditions", () => {
  const citation = { sourceId: "spec-1", page: "文字", quote: "VCC: 1.2 V at 25°C" };
  const texts = new Map([["spec-1", "Synthetic-A\nVCC:  1.2 V\n at 25°C"]]);
  assert.doesNotThrow(() => assertSpecFillTextCitations([citation], texts));
  assert.throws(() => assertSpecFillTextCitations([{ ...citation, quote: "VCC: 12 V at 25°C" }], texts), /不在/);
  assert.doesNotThrow(() => assertSpecFillTextCitations([citation], new Map()), "native image/PDF text must not be invented by the validator");
});

test("invisible page or quote text cannot satisfy question, fill or source-validation evidence checks", () => {
  const citation = { sourceId: "spec-1", page: "文字", quote: cell.quote };
  for (const invisible of ["\u200b", " \u200b\ufeff ", "\u200c\u200d\u2060"]) {
    for (const field of ["page", "quote"]) {
      const bad = { ...citation, [field]: invisible };
      assert.throws(() => parseSpecFillQuestion(JSON.stringify({ reply: "Unsupported 999 V", citations: [bad] }), sources), /無法核對/);
      assert.throws(() => assertSpecFillTextCitations([bad], new Map([["spec-1", cell.quote]])), /缺少/);
      assert.throws(() => assertSpecFillTextCitations([bad], new Map()), /缺少/, "native PDF/image citations must also have visible evidence");
      const fill = { ...table(), rows: [[{ value: "VCC", kind: "label" }, { ...cell, [field]: invisible }]] };
      const result = parseSpecFillTables(JSON.stringify({ tables: [fill] }), sources, [templates[0]]);
      assert.equal(result[0].rows[0][1].kind, "missing");
      assert.equal(result[0].rows[0][1].value, "待確認");
    }
  }
});

test("questions validate every citation and strip untrusted extra fields rather than rendering source URLs or model tables", () => {
  const citation = { sourceId: "spec-1", page: "文字", quote: cell.quote };
  const answer = parseSpecFillQuestion(JSON.stringify({ reply: "工作電壓為 001.20 V，條件為 25°C。", citations: [{ ...citation, sourceUrl: "https://example.invalid/untrusted" }], tables: [table()] }), sources);
  assert.deepEqual(answer.citations, [citation]);
  assert.equal(answer.tables, undefined);
  for (const bad of [{ ...citation, sourceId: "invented" }, { ...citation, page: "" }, { ...citation, quote: "" }, { ...citation, page: "https://example.invalid/page" }])
    assert.throws(() => parseSpecFillQuestion(JSON.stringify({ reply: "answer", citations: [bad] }), sources), /無法核對/);
  const ungrounded = parseSpecFillQuestion(JSON.stringify({ reply: "A guessed 9999 V", citations: [] }), sources);
  assert.match(ungrounded.reply, /待確認/);
  assert.equal(ungrounded.reply.includes("9999"), false, "an uncited numerical answer must not be presented as SPEC fact");
});

for (const provider of ["openai", "gemini"]) test(`${provider} answers a grounded SPEC question before any photo or fill result exists`, async () => {
  const response = { reply: "SPEC 中的 VCC 為 001.20 V，條件為 25°C。", citations: [{ sourceId: "spec-1", page: "文字", quote: cell.quote }] };
  const f = fixture(provider, JSON.stringify(response));
  const answer = await f.askSpecFillQuestion({ ...f.input, photos: [], question: "這顆工作電壓與條件是什麼？" });
  assert.equal(answer.reply, response.reply);
  assert.equal(answer.tables.length, 0);
  assert.equal(answer.citations.length, 1);
  assert.equal(answer.preparedSources.length, 1);
  assert.equal(f.calls.length, 1);
  const body = JSON.parse(f.calls[0].init.body);
  const schema = provider === "openai" ? body.response_format.json_schema.schema : body.generationConfig.responseJsonSchema;
  assert.deepEqual(schema.required, ["reply", "citations"]);
  assert.equal(schema.properties.tables, undefined);
  assert.match(f.calls[0].init.body, /這顆工作電壓與條件是什麼/);
  assert.equal(f.calls[0].init.body.includes("data:image"), false);
  assert.equal(f.calls[0].init.body.includes("synthetic-secret-not-live"), false);
});

test("SPEC questions carry conversation context, retain existing results and can optionally inspect the original photos", async () => {
  const old = parseSpecFillTables(raw(), sources, templates);
  const response = { reply: "請依 25°C 的條件核對。", citations: [{ sourceId: "spec-1", page: "文字", quote: cell.quote }] };
  const f = fixture("openai", JSON.stringify(response));
  const answer = await f.askSpecFillQuestion({ ...f.input, question: "前面結果的溫度條件呢？", history: [{ question: "請填電壓", reply: "找到電壓", tables: old }] });
  assert.equal(answer.tables.length, 0, "asking does not generate a replacement table");
  assert.equal(old[0].rows.length, 2);
  assert.match(f.calls[0].init.body, /找到電壓/);
  const images = JSON.parse(f.calls[0].init.body).messages.flatMap(message => Array.isArray(message.content) ? message.content : []).filter(part => part.type === "image_url");
  assert.equal(images.length, 2, "optional photos remain context, not evidence");
});

test("question without SPEC or a question never makes a provider call", async () => {
  const f = fixture("openai");
  await assert.rejects(f.askSpecFillQuestion({ ...f.input, photos: [], sources: [] }), /SPEC/);
  await assert.rejects(f.askSpecFillQuestion({ ...f.input, photos: [], question: " " }), /問題/);
  assert.equal(f.calls.length, 0);
});

test("a well-formed answer with an invented text-source quotation is not presented as grounded", async () => {
  const f = fixture("openai", JSON.stringify({ reply: "工作電壓為 99 V。", citations: [{ sourceId: "spec-1", page: "文字", quote: "Synthetic-A: 99 V at 25°C" }] }));
  await assert.rejects(f.askSpecFillQuestion({ ...f.input, photos: [] }), /引文不在/);
  assert.equal(f.calls.length, 1);
});

test("question service rejects a zero-width-only quote instead of matching the empty string in every SPEC", async () => {
  const f = fixture("openai", JSON.stringify({ reply: "Unsupported 999 V", citations: [{ sourceId: "spec-1", page: "文字", quote: "\u200b" }] }));
  await assert.rejects(f.askSpecFillQuestion({ ...f.input, photos: [] }), /無法核對/);
  assert.equal(f.calls.length, 1);
});

test("a fill explanation longer than 16k is returned intact instead of silently clipping its conclusion", async () => {
  const response = JSON.parse(raw());
  response.reply = "完整查核說明".repeat(4000) + "最後結論仍完整保留";
  assert.ok(response.reply.length > 20000 && response.reply.length < 64000);
  const f = fixture("openai", JSON.stringify(response));
  const answer = await f.analyzeSpecFillConversation(f.input);
  assert.equal(answer.reply, response.reply);
  assert.ok(answer.reply.endsWith("最後結論仍完整保留"));
  assert.equal(answer.tables.length, 2);
  assert.equal(f.calls.length, 1);
});

test("a fill explanation exceeding 64k fails clearly without revealing a key or replacing earlier data", async () => {
  const previous = parseSpecFillTables(raw(), sources, templates);
  const response = JSON.parse(raw());
  response.reply = "x".repeat(64001);
  const f = fixture("openai", JSON.stringify(response));
  await assert.rejects(f.analyzeSpecFillConversation({ ...f.input, history: [{ question: "填表", reply: "QA", tables: previous }] }), error => {
    assert.match(error.message, /超過本次顯示容量/);
    assert.match(error.message, /原有結果已保留/);
    assert.equal(error.message.includes("synthetic-secret-not-live"), false);
    return true;
  });
  assert.equal(previous[0].rows.length, 2);
  assert.equal(previous[0].rows[0][1].value, "001.20 V");
  assert.equal(f.calls.length, 1, "large output is not retried through another paid request");
});
