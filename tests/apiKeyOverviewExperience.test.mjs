import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("API key overview exposes Gemini policy without weakening key masking", async () => {
  const [source, styles] = await Promise.all([
    read("../src/components/api-management/ApiKeyManagement.tsx"),
    read("../src/components/admin/admin-panel.css"),
  ]);

  assert.match(source, /GEMINI_FREE_MODEL_PROFILES/);
  assert.match(source, /formatGeminiQuotaSummary/);
  assert.match(source, /getGeminiFreeModelProfile/);
  assert.match(source, /data-admin-zone="gemini-free-model-policy"/);
  assert.match(source, /GEMINI_FREE_MODEL_PROFILES\.map/);
  assert.match(source, /data-current-gemini-model/);
  assert.match(source, /目前儲存模型/);
  assert.match(source, /可選模型/);
  assert.match(source, /剩餘額：未同步 Google/);
  assert.match(source, /累積呼叫次數，不代表每日已用或剩餘配額/);

  assert.match(source, /maskApiKey\(apiKey\.api_key, visibleKeys\.has\(apiKey\.id\)\)/);
  assert.match(source, /toggleKeyVisibility\(apiKey\.id\)/);
  assert.match(source, /copyToClipboard\(apiKey\.api_key\)/);
  assert.match(source, /onClick=\{\(\) => onTestKey\?\.\(apiKey\)\}/);
  assert.match(source, /onClick=\{\(\) => openEditDialog\(apiKey\)\}/);

  assert.match(styles, /\.admin-api-gemini-policy/);
  assert.match(styles, /\.admin-api-gemini-grid/);
  assert.match(styles, /\.admin-api-gemini-model-card\.is-current/);
});
