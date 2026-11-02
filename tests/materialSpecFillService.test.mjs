import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const native = createRequire(import.meta.url);
const { loader } = native("./support/renderHarness.cjs");
const model = { id: "key-1", label: "QA model", record: { id: "key-1", api_key: "secret-QA-only", is_active: true, expires_at: null, permissions: { read: true, metadata: { provider: "gemini", model: "qa-vision", baseUrl: "https://example.invalid/v1beta" } } } };
const photo = { id: "template", name: "form.png", blob: new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM3sAAAAASUVORK5CYII=", "base64")]) };
const part = { manufacturerPartNumber: "000-QA-A", manufacturer: "QA", name: "part", refDes: "U1" };
const sources = Array.from({ length: 10 }, (_, i) => ({ id: "spec-" + (i + 1), name: `source-${i}.txt`, blob: new Blob([`QA-A voltage 1.2 V, source ${i}`]) }));
const result = { title: "filled", partMatch: "matched", columns: ["Voltage"], rows: [[{ kind: "source", value: "1.2 V", sourceId: "spec-1", page: "1", quote: "voltage 1.2 V" }]], warnings: [] };
function service(run = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] }))) {
  const calls = [];
  const load = loader({ mocks: {
    "@/integrations/supabase/client": { supabase: {} },
    "../api-management/aiUsageTelemetry": { trackedProviderFetch: async input => { calls.push(input); return run(input); } },
  }, globals: { Blob, TextDecoder, TextEncoder, btoa, Response } });
  return { ...load("src/components/material-requests/materialSpecFillService.ts"), calls };
}
test("one photo + ten uncompressed SPEC sources use the existing tracked provider path and exact selected part", async () => {
  const f = service();
  const answer = await f.analyzeSpecFill({ part, photo, sources, model, note: "Min / Typ / Max", signal: new AbortController().signal });
  assert.equal(answer.rows[0][0].value, "1.2 V");
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].apiKeyId, "key-1");
  const body = JSON.parse(f.calls[0].init.body);
  const serialized = JSON.stringify(body);
  assert.match(serialized, /000-QA-A/);
  assert.match(serialized, /spec-10/);
  assert.match(serialized, /Min \/ Typ \/ Max/);
  assert.match(serialized, /inlineData/);
  assert.equal(serialized.includes("secret-QA-only"), false);
  assert.equal(f.calls[0].source, "ai-chat");
});
test("no photo, no SPEC, invalid PDF, empty MPN, expired key and cancelled requests never call AI", async () => {
  const f = service(); const base = { part, photo, sources, model, note: "", signal: new AbortController().signal };
  for (const patch of [{ photo: { ...photo, name: "form.txt" } }, { sources: [] }, { sources: [{ id: "spec-1", name: "bad.pdf", blob: new Blob(["not pdf"]) }] }, { part: { ...part, manufacturerPartNumber: "" } }, { model: { ...model, record: { ...model.record, expires_at: "2000-01-01" } } }]) await assert.rejects(f.analyzeSpecFill({ ...base, ...patch }));
  const stopped = new AbortController(); stopped.abort();
  await assert.rejects(f.analyzeSpecFill({ ...base, signal: stopped.signal }));
  assert.equal(f.calls.length, 0);
});
test("permission/quota failures stay failures and do not produce fabricated results or automatic retries", async () => {
  const f = service(async () => new Response(JSON.stringify({ error: { message: "api_key=secret-QA-only" } }), { status: 403 }));
  await assert.rejects(f.analyzeSpecFill({ part, photo, sources, model, note: "", signal: new AbortController().signal }), e => e.kind === "auth" && !e.message.includes("secret-QA-only"));
  assert.equal(f.calls.length, 1);
});

test("PDF SPEC and template photo are sent as native attachments for Gemini, OpenAI and Claude", async () => {
  for (const provider of ["gemini", "openai", "anthropic"]) {
    const f = service(async () => new Response(JSON.stringify(provider === "gemini" ? { candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] } : provider === "openai" ? { choices: [{ message: { content: JSON.stringify(result) } }] } : { content: [{ type: "text", text: JSON.stringify(result) }] })));
    const selected = { ...model, record: { ...model.record, permissions: { read: true, metadata: { provider, model: "qa-vision", baseUrl: provider === "gemini" ? "https://generativelanguage.googleapis.com/v1beta" : provider === "openai" ? "https://api.openai.com/v1" : "https://api.anthropic.com/v1" } } } };
    const pdf = { id: "spec-1", name: "public-qa.pdf", blob: new Blob(["%PDF-1.4\nSynthetic provider-format fixture"]) };
    const answer = await f.analyzeSpecFill({ part, photo, sources: [pdf], model: selected, note: "", signal: new AbortController().signal });
    assert.equal(answer.rows[0][0].value, "1.2 V");
    const serialized = f.calls[0].init.body;
    assert.match(serialized, /application\/pdf/);
    assert.match(serialized, /image\/png/);
    assert.equal(serialized.includes("secret-QA-only"), false);
  }
});
