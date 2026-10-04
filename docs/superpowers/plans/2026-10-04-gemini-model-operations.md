# Gemini 三模型獨立操作 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓同一筆既有 Gemini API key 在 API 管理與 AI 資料助理中形成三個真正可選、可測且不互相覆寫的模型操作 target，同時只呈現可信的用量狀態。

**Architecture:** 以純 helper 把 `ApiKeyRecord` 展開為只持有 record 參照與 model ID 的虛擬 target。API 管理把 target 的 model override 傳到既有測試頁；AI 資料助理由父頁控制 target ID，console 一律使用 target model 建構 request 與會話快照。資料庫 credential 與 permissions 不變。

**Tech Stack:** React 18、TypeScript、Supabase client、Node test runner、Vite、現有 shadcn UI。

## Global Constraints

- 不建立、複製或重新貼 Google API key；三個 target 共用同一筆既有 record 參照。
- 不更新 `api_keys.permissions.metadata.model`，不新增 schema、RPC、RLS、grant、Edge Function、OAuth、IAM 或帳單設定。
- 每個 API 管理模型項都要看見所關聯 key 名稱、遮罩值、查看與複製操作。
- `gemini-3.5-flash-lite` 是刷新與新工作階段的日常預設；3.8 與 2.5 只在使用者手動選擇時使用。
- 不顯示 Google 即時剩餘額；沒有模型事件資料時顯示「尚未開始按模型統計」。
- 老會話保留已保存的 model；受支援的歷史 model 可恢復對應 target。

---

### Task 1: 共用 key + model target

**Files:**
- Modify: `src/components/api-management/apiKeyHelpers.ts`
- Test: `tests/apiKeyHelpers.test.mjs`

**Interfaces:**
- Produces: `ApiKeyModelTarget`, `buildApiKeyModelTargetId(keyId, model)`, `buildApiKeyModelTargets(records)`。
- Target 的 `record` 必須是輸入陣列中的同一物件參照；Gemini 依 `GEMINI_FREE_MODEL_PROFILES` 產生三項，非 Gemini 只產生原本儲存模型的一項。

- [ ] **Step 1: 寫失敗測試**

在 `tests/apiKeyHelpers.test.mjs` 加入 source contract，要求 helper 迭代 `GEMINI_FREE_MODEL_PROFILES`、保存 `record` 參照與 `model`，且 target ID 同時包含 key ID 與 model。

- [ ] **Step 2: 驗證 RED**

Run: `node --test tests/apiKeyHelpers.test.mjs`
Expected: FAIL，因 `buildApiKeyModelTargets` 尚不存在。

- [ ] **Step 3: 最小實作**

```ts
export interface ApiKeyModelTarget {
  id: string;
  keyId: string;
  model: string;
  record: ApiKeyRecord;
}

export function buildApiKeyModelTargetId(keyId: string, model: string) {
  return `${keyId}::${model}`;
}
```

Gemini target 使用核准清單；其他 provider 僅在 model 非空時保留一項。

- [ ] **Step 4: 驗證 GREEN**

Run: `node --test tests/apiKeyHelpers.test.mjs`
Expected: PASS。

### Task 2: API 管理三個可操作模型與測試 override

**Files:**
- Modify: `src/components/api-management/ApiKeyManagement.tsx`
- Modify: `src/components/api-management/ApiManagementPage.tsx`
- Modify: `src/components/api-management/ApiDataPreview.tsx`
- Modify: `src/components/admin/admin-panel.css`
- Test: `tests/apiKeyOverviewExperience.test.mjs`
- Test: `tests/apiKeyDialogExperience.test.mjs`

**Interfaces:**
- `ApiKeyManagementProps.onTestKey(record, model)` 傳送明確 model。
- `ApiManagementPage` 保存 `selectedApiKey` 與 `selectedModel`。
- `ApiDataPreview({ selectedApiKey, selectedModel })` 以 immutable metadata override 建構 provider request。

- [ ] **Step 1: 寫失敗測試**

要求每個 Gemini key 迭代三個 target；每張卡使用 `record.api_key` 的既有遮罩、查看與複製控制；測試 handler 傳入 `profile.id`；preview 以 `selectedModel` 覆蓋 request model；不得更新 permissions。

- [ ] **Step 2: 驗證 RED**

Run: `node --test tests/apiKeyOverviewExperience.test.mjs tests/apiKeyDialogExperience.test.mjs`
Expected: FAIL，因 handler 仍只有 record 且卡片不可操作。

- [ ] **Step 3: 最小實作**

將原說明卡改為 key record × profile 操作卡。每張卡顯示：

```tsx
<code>{maskApiKey(record.api_key, visibleKeys.has(target.id))}</code>
<Button onClick={() => toggleKeyVisibility(target.id)}>...</Button>
<Button onClick={() => void copyToClipboard(record.api_key)}>...</Button>
<Button onClick={() => onTestKey?.(record, profile.id)}>選用並前往測試</Button>
```

Preview metadata 使用 `{ ...metadata, model: selectedModel || metadata.model }`，不呼叫 Supabase update。

- [ ] **Step 4: 驗證 GREEN**

Run: `node --test tests/apiKeyOverviewExperience.test.mjs tests/apiKeyDialogExperience.test.mjs`
Expected: PASS。

### Task 3: AI 資料助理三 target selector 與真實 request model

**Files:**
- Modify: `src/components/api-management/ApiChatWorkspacePage.tsx`
- Modify: `src/components/api-management/ApiChatConsole.tsx`
- Test: `tests/apiChatModelControl.test.mjs`
- Test: `tests/privateAiWorkspaceConversations.test.mjs`

**Interfaces:**
- Workspace page 以 `buildApiKeyModelTargets(apiKeys)` 產生 selector options，並保存 `selectedApiKeyTargetId`。
- Console 接收 `availableApiKeyTargets`、`selectedApiKeyTargetId`、`selectedModel` 與 `onSelectApiKeyTarget`。
- `providerTargets` 的 selected target 使用 `selectedModel`；不重新套用 `record.permissions.metadata.model`。

- [ ] **Step 1: 寫失敗測試**

要求 desktop 與 mobile selector 都 map 三模型 target；選擇 handler 同步 key 與 model；request builder 使用 selected target model；目前模型 badge 與會話 snapshot 使用同一 model；恢復受支援歷史會話時選回 keyLabel + model target。

- [ ] **Step 2: 驗證 RED**

Run: `node --test tests/apiChatModelControl.test.mjs tests/privateAiWorkspaceConversations.test.mjs`
Expected: FAIL，因 selector 仍只 map key record。

- [ ] **Step 3: 最小實作**

Workspace page 預設選第一個 target；Gemini policy order 保證 3.5 Flash-Lite 在前。Console 的 key effect 使用 `selectedModel ?? metadata.model ?? GEMINI_DEFAULT_MODEL`，target ID 變更時同步畫面。restore 時只在可用 target 中尋找歷史 keyLabel/model；找不到時保留歷史列文字但不加入 selector。

- [ ] **Step 4: 驗證 GREEN**

Run: `node --test tests/apiChatModelControl.test.mjs tests/privateAiWorkspaceConversations.test.mjs`
Expected: PASS。

### Task 4: 誠實用量狀態與 quota copy

**Files:**
- Modify: `src/components/api-management/ApiKeyManagement.tsx`
- Modify: `src/components/api-management/ApiChatConsole.tsx`
- Modify: `src/components/api-management/CreateApiKeyDialog.tsx`
- Test: `tests/apiKeyOverviewExperience.test.mjs`
- Test: `tests/apiChatModelControl.test.mjs`
- Test: `tests/apiKeyDialogExperience.test.mjs`

**Interfaces:**
- Produces exact status: `本系統用量：尚未開始按模型統計`。
- Removes `剩餘額：未同步 Google` from every Gemini management/chat surface.

- [ ] **Step 1: 寫失敗測試並驗證 RED**

Run: `node --test tests/apiKeyOverviewExperience.test.mjs tests/apiChatModelControl.test.mjs tests/apiKeyDialogExperience.test.mjs`
Expected: FAIL，因舊文案仍存在。

- [ ] **Step 2: 最小實作**

每個模型操作項顯示尚未開始統計；quota 只標示為 Google 專案共享配額快照。Chat 與 dialog 不再顯示未同步剩餘額。

- [ ] **Step 3: 驗證 GREEN**

Run: `node --test tests/apiKeyOverviewExperience.test.mjs tests/apiChatModelControl.test.mjs tests/apiKeyDialogExperience.test.mjs`
Expected: PASS。

### Task 5: 完整驗證與交付

**Files:**
- Verify all modified files

- [ ] **Step 1: 執行相關測試**

Run: `node --test tests/apiKeyHelpers.test.mjs tests/apiKeyOverviewExperience.test.mjs tests/apiKeyDialogExperience.test.mjs tests/apiChatModelControl.test.mjs tests/privateAiWorkspaceConversations.test.mjs`
Expected: 全部 PASS。

- [ ] **Step 2: 執行完整檢查**

Run: `npm test`
Expected: 0 failures。

Run: `npm run typecheck`
Expected: exit 0。

Run: `npx eslint src/components/api-management/apiKeyHelpers.ts src/components/api-management/ApiKeyManagement.tsx src/components/api-management/ApiManagementPage.tsx src/components/api-management/ApiDataPreview.tsx src/components/api-management/ApiChatWorkspacePage.tsx src/components/api-management/ApiChatConsole.tsx src/components/api-management/CreateApiKeyDialog.tsx`
Expected: exit 0。

Run: `npm run build`
Expected: exit 0。

- [ ] **Step 3: 檢查安全與差異**

Run: `git diff --check`
Expected: 無輸出。

確認沒有 migration、credential、IAM、billing 或其他專案檔案變更。

- [ ] **Step 4: Commit、push 與 PR**

只提交本規格範圍；建立 PR 後監看 CI。依使用者對機台管理修改的既定授權，CI 成功後合併並監看 GitHub Pages 部署，再核對正式 hashed 資產。
