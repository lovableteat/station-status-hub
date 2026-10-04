import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("API key overview exposes three operational Gemini targets with their shared key", async () => {
  const [source, styles] = await Promise.all([
    read("../src/components/api-management/ApiKeyManagement.tsx"),
    read("../src/components/admin/admin-panel.css"),
  ]);

  assert.match(source, /buildApiKeyModelTargets/);
  assert.match(source, /geminiTargets\.map/);
  assert.match(source, /data-admin-zone="gemini-model-operations"/);
  assert.match(source, /target\.record\.key_name/);
  assert.match(
    source,
    /maskApiKey\(target\.record\.api_key, visibleKeys\.has\(target\.id\)\)/,
  );
  assert.match(source, /toggleKeyVisibility\(target\.id\)/);
  assert.match(source, /copyToClipboard\(target\.record\.api_key\)/);
  assert.match(source, /onTestKey\?\.\(target\.record, target\.model\)/);
  assert.match(source, /選用並前往測試/);
  assert.match(source, /本系統用量：尚未開始按模型統計/);

  assert.match(source, /maskApiKey\(apiKey\.api_key, visibleKeys\.has\(apiKey\.id\)\)/);
  assert.match(source, /toggleKeyVisibility\(apiKey\.id\)/);
  assert.match(source, /copyToClipboard\(apiKey\.api_key\)/);
  assert.match(source, /onClick=\{\(\) => openEditDialog\(apiKey\)\}/);

  assert.match(styles, /\.admin-api-gemini-policy/);
  assert.match(styles, /\.admin-api-gemini-grid/);
  assert.match(styles, /\.admin-api-gemini-model-card\.is-current/);
});

test("API management test selection overrides only the preview model", async () => {
  const [page, preview] = await Promise.all([
    read("../src/components/api-management/ApiManagementPage.tsx"),
    read("../src/components/api-management/ApiDataPreview.tsx"),
  ]);

  assert.match(page, /const \[selectedModel, setSelectedModel\]/);
  assert.match(page, /handleTestKey = \(record: ApiKeyRecord, model: string\)/);
  assert.match(page, /setSelectedModel\(model\)/);
  assert.match(page, /selectedModel=\{selectedModel\}/);

  assert.match(preview, /selectedModel\?: null \| string/);
  assert.match(preview, /model: selectedModel\?\.trim\(\) \|\| metadata\.model/);
  assert.doesNotMatch(preview, /\.from\("api_keys"\)\.update/);
});
