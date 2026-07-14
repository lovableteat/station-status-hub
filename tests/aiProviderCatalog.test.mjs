import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const sourceUrl = new URL(
  "../src/components/api-management/aiProviderCatalog.ts",
  import.meta.url,
);
const source = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const providerModule = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const {
  AI_PROVIDER_PRESETS,
  buildProviderChatRequest,
  buildProviderModelRequest,
  parseProviderChatResponse,
  parseProviderModels,
  redactSensitiveText,
  resolveAiProviderPreset,
} = providerModule;

test("catalog exposes simple defaults for four provider choices", () => {
  assert.deepEqual(
    AI_PROVIDER_PRESETS.map((item) => item.id),
    ["gemini", "openai", "anthropic", "openai-compatible"],
  );
  assert.equal(resolveAiProviderPreset("google").id, "gemini");
  assert.equal(resolveAiProviderPreset("claude").id, "anthropic");
  assert.equal(resolveAiProviderPreset("openrouter").id, "openai-compatible");
});

test("model discovery authenticates with headers instead of leaking keys in URLs", () => {
  const gemini = buildProviderModelRequest({
    provider: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/",
    apiKey: "secret-gemini",
  });
  assert.equal(
    gemini.url,
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
  );
  assert.equal(gemini.headers["x-goog-api-key"], "secret-gemini");
  assert.doesNotMatch(gemini.url, /secret-gemini/);

  const openai = buildProviderModelRequest({
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "secret-openai",
  });
  assert.equal(openai.url, "https://api.openai.com/v1/models");
  assert.equal(openai.headers.Authorization, "Bearer secret-openai");
  assert.doesNotMatch(openai.url, /secret-openai/);
});

test("model responses are normalized and Gemini excludes non-chat models", () => {
  assert.deepEqual(
    parseProviderModels("gemini", {
      models: [
        {
          name: "models/gemini-2.5-flash",
          supportedGenerationMethods: ["generateContent"],
        },
        { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
      ],
    }),
    ["gemini-2.5-flash"],
  );
  assert.deepEqual(
    parseProviderModels("openai", {
      data: [
        { id: "text-embedding-3-small" },
        { id: "gpt-5.2" },
        { id: "gpt-4o-mini" },
      ],
    }),
    ["gpt-4o-mini", "gpt-5.2", "text-embedding-3-small"],
  );
  assert.deepEqual(
    parseProviderModels("openai-compatible", {
      data: [{ id: "vendor/image-model" }, { id: "vendor/chat-model" }],
    }),
    ["vendor/chat-model", "vendor/image-model"],
  );
  assert.deepEqual(
    parseProviderModels("anthropic", {
      data: [{ id: "claude-sonnet-4-20250514" }],
    }),
    ["claude-sonnet-4-20250514"],
  );
});

test("provider errors can be shown without echoing API keys", () => {
  const secret = "sk-live-secret-value";
  assert.equal(
    redactSensitiveText(`Provider rejected ${secret}`, [secret]),
    "Provider rejected [REDACTED]",
  );
  assert.equal(
    providerModule.getProviderErrorMessage(
      { error: { message: `Invalid key ${secret}` } },
      401,
      [secret],
    ),
    "Invalid key [REDACTED]",
  );
});

test("chat request builder supports Gemini, OpenAI-compatible and Anthropic protocols", () => {
  const messages = [
    { role: "system", text: "Use Traditional Chinese" },
    { role: "user", text: "hello" },
  ];

  const gemini = buildProviderChatRequest({
    provider: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKey: "gemini-key",
    model: "gemini-2.5-flash",
    messages,
  });
  assert.equal(
    gemini.url,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
  );
  assert.equal(gemini.headers["x-goog-api-key"], "gemini-key");
  assert.equal(gemini.body.systemInstruction.parts[0].text, "Use Traditional Chinese");

  const openai = buildProviderChatRequest({
    provider: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1/",
    apiKey: "openrouter-key",
    model: "vendor/model",
    messages,
  });
  assert.equal(openai.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(openai.headers.Authorization, "Bearer openrouter-key");
  assert.equal(openai.body.messages[0].role, "system");

  const anthropic = buildProviderChatRequest({
    provider: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    apiKey: "anthropic-key",
    model: "claude-sonnet-4-20250514",
    messages,
  });
  assert.equal(anthropic.url, "https://api.anthropic.com/v1/messages");
  assert.equal(anthropic.headers["x-api-key"], "anthropic-key");
  assert.equal(anthropic.headers["anthropic-version"], "2023-06-01");
  assert.equal(anthropic.headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.equal(anthropic.body.system, "Use Traditional Chinese");
});

test("chat responses share one text result shape", () => {
  assert.equal(
    parseProviderChatResponse("gemini", {
      candidates: [{ content: { parts: [{ text: "Gemini OK" }] } }],
    }).text,
    "Gemini OK",
  );
  assert.equal(
    parseProviderChatResponse("openai", {
      choices: [{ message: { content: "OpenAI OK" } }],
    }).text,
    "OpenAI OK",
  );
  assert.equal(
    parseProviderChatResponse("anthropic", {
      content: [{ type: "text", text: "Claude OK" }],
    }).text,
    "Claude OK",
  );
});
