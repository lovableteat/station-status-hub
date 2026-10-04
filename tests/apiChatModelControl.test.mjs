import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("AI data assistant exposes one consolidated selector with three Gemini targets", async () => {
  const [workspace, consoleSource] = await Promise.all([
    read("../src/components/api-management/ApiChatWorkspacePage.tsx"),
    read("../src/components/api-management/ApiChatConsole.tsx"),
  ]);

  assert.match(workspace, /buildApiKeyModelTargets/);
  assert.match(workspace, /GEMINI_FREE_MODEL_PROFILES\.map/);
  assert.match(workspace, /selectedApiKeyTargetId/);
  assert.match(workspace, /selectedTarget\?\.model/);
  assert.match(workspace, /availableApiKeyTargets=\{apiKeyTargets\}/);
  assert.match(workspace, /selectedModel=\{selectedTarget\?\.model/);

  assert.equal(consoleSource.match(/data-testid="ai-model-control"/g)?.length, 1);
  assert.match(consoleSource, /availableApiKeyTargets\.map/);
  assert.match(consoleSource, /target\.record\.key_name/);
  assert.match(consoleSource, /target\.model/);
  assert.match(consoleSource, /onSelectApiKeyTarget\?\.\(value\)/);
});

test("selected Gemini target drives the real request without rewriting key metadata", async () => {
  const source = await read("../src/components/api-management/ApiChatConsole.tsx");

  assert.match(source, /setModel\(selectedModel\?\.trim\(\) \|\|/);
  assert.match(source, /availableApiKeyTargets[\s\S]*?sameModel/);
  assert.match(source, /const sameModel = target\.model === model\.trim\(\)/);
  assert.match(source, /model: target\.model/);
  assert.match(source, /buildProviderChatRequest\([\s\S]*?model: target\.model/);
  assert.doesNotMatch(
    source,
    /setModel\(selectedMetadata\?\.model \|\| GEMINI_DEFAULT_MODEL\)/,
  );
});

test("Gemini model copy is honest about project scope and missing model telemetry", async () => {
  const source = await read("../src/components/api-management/ApiChatConsole.tsx");

  assert.match(source, /GEMINI_DEFAULT_MODEL/);
  assert.match(source, /getGeminiFreeModelProfile/);
  assert.match(source, /Google 專案共享配額快照/);
  assert.doesNotMatch(source, /剩餘額：未同步 Google/);
});
