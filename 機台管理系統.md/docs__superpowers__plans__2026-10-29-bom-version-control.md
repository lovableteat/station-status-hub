> 集中副本；原始路徑：`docs/superpowers/plans/2026-10-29-bom-version-control.md`；程式參考基準：`22f669036d89108fe73cf4b74d4117f3e332739f`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# BOM 版本控制與差異比對實作計畫

使用者已授權整批實作、驗證、提交與部署。設計見 [spec](./docs__superpowers__specs__2026-10-29-bom-version-control-design.md)。

**Goal:** 每次上傳成為不可覆蓋的版本，同板版本收在系列下；任兩版可比對並匯出差異；追蹤紀錄依內容帶到新版；BOM 管理視窗改為系列／版本／差異三層。

**Architecture:** 版本＝既有 `BomWorkspace`；版本中繼資料存 `ui_table_preferences`；純函式 `bomDiff.ts` 負責配對、差異與追蹤帶入；新視窗 `BomVersionCenter` 取代 `BomManagerDialog`；上傳改為解析後確認目標再寫入。不新增套件與 migration。

- [x] 純邏輯：`bomVersioning.ts`（版本型別、系列組裝、目前版本解析、系列推斷、id／版本號）、`bomDiff.ts`（群組／廠商配對、欄位差異、分類、追蹤帶入）；`tests/bomVersioning.test.ts`、`tests/bomDiff.test.ts`（含 2×7,000 列 160 ms）。
- [x] 儲存：`materialBomStorage.ts` 加版本 key 的載入／寫入／刪除與 `loadBomWorkspaceRecords`；`BomWorkspace.version`；刪除 workspace 時一併清版本 key；舊列查詢分頁。`materialBomSources.ts` 保存／下載原始 Excel。
- [x] 匯出：`bomDiffExport.ts`（摘要、差異明細、新增、移除四張工作表）；`tests/bomDiffExport.test.ts`。
- [x] 視窗：`BomVersionCenter.tsx`（系列清單、詳情、版本時間軸、差異模式）、`BomDiffView.tsx`（篩選列與 chip、空結果契約）、`BomUploadDialog.tsx`（上傳確認）。
- [x] 頁面整合：載入版本中繼資料、系列切換器、歷史版本唯讀提示、上傳改為兩段（解析→確認→寫入）、設為目前版本（可帶追蹤）、刪除版本／系列、審計紀錄。
- [x] 相容：上傳說明文字、`docs/material-workflows.md`、`docs/filter-ui-audit.md`；mock 補兩個版本與舊格式 BOM 的 QA 資料。
- [x] 驗證：新增 4 個測試檔 33 項；`npm test` 1,734 項除 3 項既有失敗（維修側欄、績效）外全過；`tests/auditBomWriteScope.integration.cjs` 21 項；`tests/auditBomVersions.browser.cjs`（Playwright：上傳→帶入→比對→匯出→切換目前版本→390px 無溢位）納入 audit workflow；typecheck、變更檔案 Lint、build 通過；內建瀏覽器桌面與 375px 目視核對。

## 2026-10-29 驗證結果

- 隔離頁上傳 `QA_主板_v3.xlsx`：確認視窗預選「QA 主板 的新版本（目前 V2 → V3）」，建立後 V3 為目前版本、追蹤帶入 7、V2 轉為歷史；V2→V3 差異為新增 1（D5, D6）、變更 1（R10：Qty 1→3、phase out、零件狀態）、未變更 5；匯出檔四張工作表內容與畫面一致。
- 設為目前版本 V2 後切換器回到 V2，V3 轉歷史；歷史版本頁面顯示唯讀提示，上傳與新增料件按鈕停用，BOM 管理仍可操作。
- 本次未連線正式 Supabase；正式站以推送後的 Pages 部署與既有資料（6 份 BOM 視為單一版本系列）核對。
