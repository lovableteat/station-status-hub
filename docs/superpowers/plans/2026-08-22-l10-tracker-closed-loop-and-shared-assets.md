# L10 追蹤、問題閉環、儀表板導覽與通用資產實作計畫

> **執行規則：** 每個功能先寫會失敗的測試、確認失敗原因，再做最小實作並重新執行測試。完成後必須遠端套用 migration、瀏覽器目視驗證、提交及推送。

**目標：** 改善 L10 篩選與卡片資料完整性，建立問題追蹤閉環，支援儀表板可見的自動篩選，並讓工具與資產具有通用／工作區專用範圍。

**架構：** URL query parameters 是跨頁篩選的單一來源；L10 與生產監控牆各自解析並顯示條件。問題閉環由 `workspace` schema 的 trigger 與 guard RPC 強制，前端只負責呈現與操作。資產 scope 直接存於資產主表，專案 assignments 維持既有用途。

**技術：** React、TypeScript、Supabase/Postgres、Node test runner、Vite、Playwright／應用程式瀏覽器。

---

## Task 1：建立可測試的 L10 篩選、排序與 lane 純函式

**檔案：**

- 新增：`src/components/test-tracker/testTrackerFilters.ts`
- 新增：`tests/testTrackerFilters.test.mjs`

1. 先測試 URL 參數解析、機台 ID／建立時間四種排序、排除已完成及 lane 不遺失機台。
2. 執行 `node --test tests/testTrackerFilters.test.mjs`，確認因模組不存在而失敗。
3. 實作純函式與型別，使用穩定 ID tie-breaker。
4. 重跑測試直到通過。

## Task 2：重構 L10 固定篩選列、空結果與卡片檢視

**檔案：**

- 修改：`src/components/test-tracker/TestTracker.tsx`
- 修改：`src/components/test-tracker/TestProgressTable.tsx`
- 修改：`tests/testTrackerFilters.test.mjs`
- 新增或修改：`tests/testTrackerFilterUi.test.mjs`

1. 新增 source contract 測試，要求固定 toolbar、排序選項、自動條件 chip、空結果文案與完整 lane。
2. 確認測試失敗。
3. 將篩選從 Popover 移至固定 toolbar，將專案操作留在次要操作區。
4. 讀取 `system`、`station`、`excludeStatus` query；同步至 UI 並允許清除。
5. 表格無資料時保留 header；卡片檢視套用純函式 lane。
6. 執行相關 Node 測試與 TypeScript 檢查。

## Task 3：儀表板與生產監控牆自動篩選

**檔案：**

- 修改：`src/components/dashboard/Dashboard.tsx`
- 修改：`src/components/production/ProductionMonitor.tsx`
- 修改：`src/pages/Index.tsx`
- 修改：`tests/dashboardAttentionPanel.test.mjs`
- 新增：`tests/dashboardFilterNavigation.test.mjs`

1. 測試 station 卡帶入 `station` 與 `excludeStatus=completed`、主按鈕改名並帶入 `attention=1`、個別機台前往 L10 並帶入 `system`。
2. 確認測試失敗。
3. 擴充 query key 白名單與 Dashboard 導覽參數。
4. Production Monitor 解析 attention，自動套用異常、超時或低完成率／未完成的關注集合，並顯示可清除 chip。
5. 確認 KPI 使用未篩選 `systemViews`，只有 lane 使用 `filteredViews`。
6. 重跑相關測試。

## Task 4：建立問題閉環 migration

**檔案：**

- 新增：`supabase/migrations/20260822180000_test_item_issue_closed_loop.sql`
- 新增：`tests/testItemIssueClosedLoopMigration.test.mjs`

1. 測試 migration 必須包含未解決狀態判斷、同步 trigger、完成 guard RPC、固定 search path、授權及複合索引。
2. 確認測試失敗。
3. 實作 trigger：新增／更新未解決問題時 upsert 或更新對應進度為 `Error`。
4. 實作 RPC：原子檢查未解決問題後才允許寫入 `Done`，失敗時使用穩定錯誤碼／訊息。
5. 加入 `(project_id, system_id, station_id, test_item_id, status)` 問題索引。
6. 執行 migration contract test。

## Task 5：L10 顯示關聯問題並守住所有完成路徑

**檔案：**

- 修改：`src/components/test-tracker/SystemProgressSheet.tsx`
- 修改：`src/components/issues/IssueCreateDialog.tsx`
- 修改：`src/hooks/useUnifiedData.ts`
- 修改：`src/integrations/supabase/types.ts`
- 修改：`tests/testProgressIssueCreation.test.mjs`
- 修改：`tests/testProgressStationLock.test.mjs`
- 新增：`tests/testProgressIssueGuard.test.mjs`

1. 測試關聯問題摘要、`Blocked`、紅色異常、問題追蹤入口與三條完成路徑的 guard。
2. 確認測試失敗。
3. 在 sheet 開啟時批次讀取目前機台的 issues，以 test item 分組；訂閱 `workspace.issues` realtime 更新。
4. 建立問題成功後立即刷新問題與進度。
5. 手動儲存、結束計時、整站完成都改用 guard RPC；阻擋時顯示「尚有問題未被解決」。
6. 顯示完成數與 Blocked 數；完成率仍只計算 Done。
7. 更新 generated types 所需 RPC 型別並執行測試。

## Task 6：工具與資產 scope migration

**檔案：**

- 新增：`supabase/migrations/20260822190000_shared_workspace_assets.sql`
- 新增：`tests/sharedWorkspaceAssetsMigration.test.mjs`
- 修改：`src/integrations/supabase/types.ts`

1. 測試四類資產欄位、constraint、既有資料 backfill、複合索引及知識搜尋 scope 條件。
2. 確認測試失敗。
3. 對工具、程式碼與指令表新增 `scope`、`owner_workspace`；上傳檔案沿用工具表。
4. 建立一致性 constraint 與 `(scope, owner_workspace)` 索引；既有資料設為 global。
5. 更新維修知識搜尋函式的 workspace 參數與可見範圍。
6. 更新 TypeScript database types 並重跑測試。

## Task 7：工具與資產 UI

**檔案：**

- 修改：`src/components/tools/ToolsManagement.tsx`
- 修改：`src/components/tools/FileUploadDialog.tsx`
- 修改：`src/components/tools/CodeStorageManager.tsx`
- 修改：`src/components/tools/CommandLibrary.tsx`
- 修改：`tests/toolsAssetWorkspace.test.mjs`
- 新增：`tests/sharedWorkspaceAssetsUi.test.mjs`

1. 測試通用開關、目前工作區 owner、篩選選項及通用項目修改警告。
2. 確認測試失敗。
3. 將目前 workspace key 傳入各資產編輯器；查詢 global 或 owner workspace。
4. 新增項目預設 workspace 專用；可切換通用。編輯通用項目顯示影響範圍。
5. 加入「全部／通用工具／目前工作區專用」固定篩選。
6. 重跑相關測試。

## Task 8：Agent 規範與跨 workspace 稽核

**檔案：**

- 新增：`AGENTS.md`
- 新增：`docs/filter-ui-audit.md`
- 新增：`tests/filterUiStandards.test.mjs`

1. 測試規範文件包含固定位置、作用中條件可見、空結果保留結構及允許差異。
2. 確認測試失敗。
3. 寫入持久規範與逐 workspace 差異／保留理由。
4. 重跑測試。

## Task 9：整體驗證、遠端 migration 與部署

1. 執行相關 Node tests。
2. 執行完整 `npm test`、TypeScript 檢查與 `npm run build`（依 `package.json` 現有 scripts）。
3. 啟動本機服務，使用瀏覽器逐項目視驗證桌面與窄視窗。
4. 使用已連結 Supabase 專案套用 migrations；查詢遠端 schema、trigger、RPC、索引與資產欄位。
5. 檢查 `git diff --check`、敏感資訊及工作樹。
6. 提交實作並推送 `main`。
7. 等待 GitHub Pages 部署完成，開啟正式 URL 驗證 L10 篩選、儀表板導覽、問題閉環與資產篩選。
