> 集中副本；原始路徑：`docs/superpowers/plans/2026-10-14-large-file-upload-recovery.md`；程式參考基準：`06c686951b17afa920cf325ddfec9114590aeee0`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# Large-file upload recovery Implementation Plan

> **For agentic workers:** Use focused implementers with disjoint ownership, followed by read-only review and root verification.

**Goal:** 單檔允許 1 GiB，修正大檔重試與完成確認，提供真實的失敗檔案恢復說明。

**Architecture:** 保留現有 repository、Supabase adapter、原 File 與固定上傳目標。TUS 使用 6 MiB 區塊與伺服器確認位移；metadata 確認成功前保留續傳資訊，不因不確定的 API 回應刪除已完成內容。

**Tech Stack:** TypeScript、React、Supabase Storage/TUS、Node test runner。

## Global Constraints

- 單檔與既有批次上限維持 `1073741824` bytes，不放寬 RLS、不覆寫同名物件、不新增依賴。
- 不停用 spend cap、不變更其他專案設定、不刪除既有正式檔案。
- 不把 File 內容、密碼、JWT 或管理 token 寫入日誌／原始碼。重新整理後仍需重新選取原檔，不能承諾原 File 跨重載保存。

## Evidence

- 2026-10-14 18:32:38 Asia/Taipei，PDF `674917409` bytes 在 TUS POST 初始化被 `413 Maximum size exceeded` 拒絕；尚未傳入內容。
- 正式 bucket 與 metadata CHECK 已為 1 GiB；Console 全域限制約 2 GB。沒有對應的大檔完成物件或 cleanup queue 項目。
- 舊程式 UI 重試更換 UUID，無法命中 TUS URL；metadata 回應遺失時可能刪除實際已提交的內容。

## Tasks

- [x] Transport: `core/supabaseAdapter.ts` 與 `tests/test-plan/large-upload.test.mjs`。先 RED：錯誤 offset、HEAD 503、terminal 413、token 401、帳號切換、legacy URL。所有非空檔案共用同專案 direct endpoint／可信 URL、最新同帳號 session、限次重試與 request timeout；HEAD 核對路徑、bucket、長度，完整位移另需完成標記，正常最後 PATCH 必須為 204。空檔案維持 standard upload，模糊傳輸失敗後可用新路徑重試。
- [x] Recovery: `core/repository.ts`、`hooks/useTestPlanWorkspace.ts`、`TestPlanWorkspace.tsx` 與相關 tests。先 RED：同 File 重試路徑不同、metadata response loss、失敗成品被刪、帳號晚到回應。保留原 scope/path，重試先查既有紀錄，僅 metadata 已確認後完成清理。
- [x] Lifecycle: 復用可取消的 `workspace-before-navigate` 保護正在上傳的 File；已失敗清單在同帳號工作區切換後保留，`storeUser` 同步發送 `station-user-changed`，不依賴遠端登出成功即可清除原帳號的 File cache 與 unload 提示。
- [x] Verify: `AUDIT_QA_DIR=tmp/codex-ai-qa`，test-plan 與帳號事件 197/197 通過；typecheck、scoped ESLint、build、diff check 與獨立 review 通過。瀏覽器隔離驗證中斷→6 MiB 同路徑續傳、切換工作區後原資料夾與 File 保留、登出清除；390px 無水平溢位且重試按鈕 44px。全單元 1293 通過、2 個未修改的績效 source-contract 失敗、4 skipped，不宣稱全套綠燈。
- [ ] Release: 僅提交本輪檔案、push main、核對 Pages workflow 與正式入口；不得以合成測試代替使用者原檔已恢復的宣稱。

## Adapter Interfaces

```typescript
completeObjectUpload(path: string): void;
findFileByStoragePath(path: string): Promise<TestPlanFileRecord | undefined>;
```

`findFileByStoragePath` 使用既有 RLS 的 `storage_path` 查詢，不提升資料存取權限。完成 cleanup 僅移除本次續傳資訊，不刪除遠端檔案。

## Known Recovery Boundary

最終回應遺失且現有 RLS／服務版本不提供 HEAD 完成證據時，保留並回報未確認，不建立假的完成記錄。完整重新整理後須重新選取 File；本輪不增加持久檔案內容儲存或放寬 Storage 讀取政策。正式 1 GiB 傳輸需另核對部署後入口，不能以隔離模擬宣稱成功。
