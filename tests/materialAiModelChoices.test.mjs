import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const { loader, database } = createRequire(import.meta.url)("./support/renderHarness.cjs");
const record = (id, provider, model, baseUrl, patch = {}) => ({ id, key_name: id, api_key: "qa-only", is_active: true, expires_at: null,
  permissions: { read: true, write: true, metadata: { provider, model, baseUrl } }, ...patch });
const rows = [record("openai", "openai", "gpt-5.4", "https://api.openai.com/v1"), record("gemini", "gemini", "gemini-2.5-flash", "https://generativelanguage.googleapis.com/v1beta"),
  record("claude", "anthropic", "qa-claude", "https://api.anthropic.com/v1"), record("custom", "openai-compatible", "qa-vision", "https://example.invalid/v1"),
  record("off", "openai", "qa", "https://example.invalid", { is_active: false }), record("old", "openai", "qa", "https://example.invalid", { expires_at: "2000-01-01" }),
  record("denied", "openai", "qa", "https://example.invalid", { permissions: { read: false } }), record("empty", "openai", "", "https://example.invalid")];
function load() { return loader({ transform: source => source.replaceAll("import.meta.url", '"file:///qa/"'), mocks: {
  "@/integrations/supabase/client": { supabase: database(() => ({ data: rows, error: null })) },
} })("src/components/material-requests/materialSpecFillService.ts"); }
test("image-only PDF tools offer configured providers and chat model choices without changing credential identity", async () => {
  const models = await load().loadSpecFillModels({ imagesOnly: true });
  assert.ok(models.some(item => item.id === "custom"));
  assert.ok(models.some(item => item.label.includes("gpt-6.1-sol")));
  assert.ok(models.some(item => item.label.includes("gemini-3.8-flash")));
  assert.equal(models.filter(item => item.label.includes("gemini-2.5-flash")).length, 1);
  assert.deepEqual([...new Set(models.map(item => item.record.id))], ["openai", "gemini", "claude", "custom"]);
  for (const item of models) {
    assert.equal(item.record.permissions.read, true);
    assert.equal(item.record.permissions.write, true);
    assert.ok(item.label.endsWith(item.record.permissions.metadata.model));
  }
  assert.equal(new Set(models.map(item => item.id)).size, models.length);
});
test("native SPEC document models retain the existing provider and saved-model contract", async () => {
  const models = await load().loadSpecFillModels();
  assert.deepEqual(Array.from(models, item => item.id), ["openai", "gemini", "claude"]);
  assert.equal(models.some(item => item.label.includes("gpt-6.1-sol")), false);
});
