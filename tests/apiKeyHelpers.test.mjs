import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/components/api-management/apiKeyHelpers.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const helpers = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("editing an API key preserves unknown permissions and metadata", () => {
  const result = helpers.buildApiKeyPermissions(
    {
      read: true,
      write: true,
      metadata: {
        provider: "openai",
        model: "gpt-5.2",
        baseUrl: "https://api.openai.com/v1",
        editable: true,
      },
    },
    {
      audit: "keep-me",
      metadata: {
        environment: "production",
        ownerTeam: "ME",
      },
    },
  );

  assert.equal(result.audit, "keep-me");
  assert.equal(result.metadata.environment, "production");
  assert.equal(result.metadata.ownerTeam, "ME");
  assert.equal(result.metadata.provider, "openai");
  assert.equal(result.metadata.model, "gpt-5.2");
});

test("one Gemini key expands into independent model targets without copying the record", () => {
  const record = {
    id: "key-1",
    key_name: "Gemini API Key",
    api_key: "secret-value",
    description: null,
    permissions: {
      metadata: {
        provider: "gemini",
        model: "gemini-2.5-flash",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        editable: true,
      },
    },
    is_active: true,
    expires_at: null,
    last_used_at: null,
    usage_count: 298,
    created_at: "2026-10-04T00:00:00.000Z",
  };
  const models = [
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
    "gemini-2.5-flash",
  ];

  const targets = helpers.buildApiKeyModelTargets([record], models);

  assert.deepEqual(targets.map((target) => target.model), models);
  assert.deepEqual(
    targets.map((target) => target.id),
    models.map((model) => `key-1::${model}`),
  );
  targets.forEach((target) => assert.strictEqual(target.record, record));
});

test("non-Gemini keys keep one stored-model target", () => {
  const record = {
    id: "key-openai",
    key_name: "OpenAI",
    api_key: "secret-value",
    description: null,
    permissions: {
      metadata: {
        provider: "openai",
        model: "gpt-5.2",
        baseUrl: "https://api.openai.com/v1",
        editable: true,
      },
    },
    is_active: true,
    expires_at: null,
    last_used_at: null,
    usage_count: 1,
    created_at: "2026-10-04T00:00:00.000Z",
  };

  const targets = helpers.buildApiKeyModelTargets(
    [record],
    ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-2.5-flash"],
  );

  assert.equal(targets.length, 1);
  assert.equal(targets[0].model, "gpt-5.2");
  assert.strictEqual(targets[0].record, record);
});

test("expired and disabled keys are not offered as usable model targets", () => {
  const key = { id: 'expired', key_name: 'Gemini', api_key: 'fake', permissions: { metadata: { provider: 'gemini', model: 'gemini-2.5-flash' } }, is_active: true, expires_at: '2000-01-01T00:00:00Z' };
  assert.deepEqual(helpers.buildApiKeyModelTargets([key], ['gemini-2.5-flash']), []);
  assert.deepEqual(helpers.buildApiKeyModelTargets([{ ...key, is_active: false, expires_at: null }], ['gemini-2.5-flash']), []);
});
