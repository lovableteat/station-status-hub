# Simple AI Provider Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓管理員只需選擇 AI 服務商並貼上 API Key，即可建立可用的 AI 金鑰設定。

**Architecture:** 以獨立 provider catalog 封裝預設端點、模型查詢與請求格式；建立對話框只負責漸進式表單狀態，聊天與測試介面共用同一 adapter。既有 `api_keys.permissions.metadata` 保持不變。

**Tech Stack:** React 18、TypeScript、Supabase、shadcn/ui、Node test runner。

## Global Constraints

- 不修改或遷移既有 `api_keys` 資料。
- 不在任何訊息、console 或 URL 中顯示完整 API Key。
- Gemini 舊設定必須向後相容。
- 驗證失敗不得阻斷儲存自訂設定。

---

### Task 1: Provider catalog 與請求 adapter

**Files:**
- Create: `src/components/api-management/aiProviderCatalog.ts`
- Create: `tests/aiProviderCatalog.test.mjs`

**Interfaces:**
- Produces: `AI_PROVIDER_PRESETS`, `resolveAiProviderPreset`, `buildProviderModelRequest`, `parseProviderModels`, `buildProviderChatRequest`, `parseProviderChatResponse`.

- [ ] **Step 1: Write failing tests** for provider defaults, model-list requests, chat requests and response parsing.
- [ ] **Step 2: Run** `node --test tests/aiProviderCatalog.test.mjs` and confirm missing module failure.
- [ ] **Step 3: Implement** the pure provider catalog and adapter functions.
- [ ] **Step 4: Run** `node --test tests/aiProviderCatalog.test.mjs` and confirm all cases pass.

### Task 2: Simplified create/edit dialog

**Files:**
- Modify: `src/components/api-management/CreateApiKeyDialog.tsx`
- Modify: `src/components/api-management/apiKeyHelpers.ts`

**Interfaces:**
- Consumes: provider catalog interfaces from Task 1.
- Produces: provider cards, paste-first API Key input, model discovery, status feedback and advanced settings.

- [ ] **Step 1: Add source assertions** covering provider selection, progressive disclosure and removal of random external-key generation.
- [ ] **Step 2: Run the assertions** and confirm they fail on the old form.
- [ ] **Step 3: Implement** the compact dialog, abortable model discovery and backward-compatible edit mapping.
- [ ] **Step 4: Re-run assertions and TypeScript** until both pass.

### Task 3: Multi-provider chat and connection test

**Files:**
- Modify: `src/components/api-management/ApiChatConsole.tsx`
- Modify: `src/components/api-management/ApiDataPreview.tsx`

**Interfaces:**
- Consumes: provider chat request and response adapters from Task 1.
- Produces: Gemini, OpenAI-compatible and Anthropic text chat/testing.

- [ ] **Step 1: Add source assertions** proving non-Gemini providers no longer stop at the old error message.
- [ ] **Step 2: Run assertions** and confirm expected failure.
- [ ] **Step 3: Replace provider-specific guards** with the shared adapter while preserving Gemini attachments and retry behavior.
- [ ] **Step 4: Re-run provider tests and TypeScript** until passing.

### Task 4: Verification and release

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run** provider and permission tests.
- [ ] **Step 2: Run** changed-file ESLint and `npx tsc --noEmit`.
- [ ] **Step 3: Run** `npm run build`.
- [ ] **Step 4: Verify** create/edit flow at desktop and narrow viewport in a browser.
- [ ] **Step 5: Fetch remote, review diff, commit and push current branch plus `main`**.
- [ ] **Step 6: Wait for GitHub Pages and verify the live asset and dialog**.
