import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("API key dialog is provider-first and progressively discloses advanced fields", async () => {
  const source = await read("../src/components/api-management/CreateApiKeyDialog.tsx");

  assert.match(source, /AI_PROVIDER_PRESETS\.map/);
  assert.match(source, /選擇 AI 服務商/);
  assert.match(source, /貼上 API Key/);
  assert.match(source, /進階設定/);
  assert.match(source, /buildProviderModelRequest/);
  assert.match(source, /parseProviderModels/);
  assert.match(source, /驗證並取得模型|重新驗證/);
  assert.doesNotMatch(source, /generate_api_key/);
  assert.match(source, /isLegacyRecord/);
  assert.match(source, /record\?\.permissions/);
  assert.doesNotMatch(source, /自動產生/);
});

test("Gemini key editor exposes the approved model choices with honest project quota copy", async () => {
  const source = await read("../src/components/api-management/CreateApiKeyDialog.tsx");

  assert.match(source, /GEMINI_FREE_MODEL_PROFILES\.map/);
  assert.match(source, /getGeminiFreeModelProfile/);
  assert.match(source, /Google 專案共享配額快照/);
  assert.match(source, /本系統模型別用量尚未開始統計/);
  assert.doesNotMatch(source, /剩餘額：未同步 Google/);
  assert.match(source, /不同 API Key 可能共用同一專案/);
  assert.match(source, /2026-10-04 Google AI Studio 免費專案截圖/);
  assert.match(source, /RPD 於太平洋時間午夜重設/);
});

test("non-Gemini providers are routed through the shared chat adapter", async () => {
  const source = await read("../src/components/api-management/ApiChatConsole.tsx");

  assert.match(source, /buildProviderChatRequest/);
  assert.match(source, /parseProviderChatResponse/);
  assert.match(source, /此服務商目前不支援直接讀取下列文件/);
  assert.doesNotMatch(source, /setProvider\(conversation\.provider/);
  assert.doesNotMatch(source, /目前對話模式先支援 Gemini provider/);
  assert.doesNotMatch(source, /目前測試模式先支援 Gemini provider/);
});

test("API test panel uses the same provider adapter without exposing keys in URLs", async () => {
  const source = await read("../src/components/api-management/ApiDataPreview.tsx");

  assert.match(source, /buildProviderChatRequest/);
  assert.match(source, /parseProviderChatResponse/);
  assert.match(source, /redactSensitiveText/);
  assert.doesNotMatch(source, /generateContent\?key=/);
  assert.doesNotMatch(source, /只支援 Gemini|先補齊 Gemini/);
});
