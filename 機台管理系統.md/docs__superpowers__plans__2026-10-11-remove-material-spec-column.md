> 集中副本；原始路徑：`docs/superpowers/plans/2026-10-11-remove-material-spec-column.md`；程式參考基準：`06c686951b17afa920cf325ddfec9114590aeee0`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# 移除 BOM 規格／備註欄 Implementation Plan

> **For agentic workers:** 使用 executing-plans 在目前對話連續完成；使用者已授權既定範圍的測試、目視驗證、提交與推送，不另詢問階段或執行方式。

**Goal:** 移除 BOM 總表規格／備註欄與篩選，保留原資料。

**Architecture:** 修改 MaterialRequestPage 的既有表格、欄寬及篩選還原，沿用現有元件與保存流程，不新增介面或依賴。

**Tech Stack:** React、TypeScript、Node test、現有 Browser 驗證。

## Global Constraints

- 只改總表呈現；表單、詳細、資料、搜尋、匯出及其他工作區不變。
- `.claude/` 保留且不提交；瀏覽器不做正式資料寫入。
- 依 AGENTS.md 保留其他篩選、可見條件與右側操作；使用現有配色。

## Task 1: 移除欄位與相容舊檢視設定

**Files:** Modify `src/components/material-requests/MaterialRequestPage.tsx`; Test `tests/materialRequestTableLayout.test.mjs`。

**Interfaces:** 沿用 ColumnFilterKey、loadColumnWidths、columnWidths、MATERIAL_STICKY_COLUMN_CLASSES；十欄為 Item、標記、主料／廠商、REF DES、MPN、內部料號／圖面、TX、狀態、狀態追蹤、資料更新。

- [x] 新增不含規格表頭／篩選／列儲存格、十欄及固定末欄、舊設定還原的回歸。
  ```js
  assert.doesNotMatch(tableBlock, /規格 \/ 備註|filterKey="specification"|group\.partSpec/);
  assert.equal(widths.length, 10);
  ```
- [x] `node --test tests/materialRequestTableLayout.test.mjs`：確認新回歸因舊欄位、十一欄與直接混入舊篩選而失敗。
- [x] 移除第九欄，三組欄寬移除 index 8，sticky index 改9、跨欄改10。還原寬度使用 `parsed.filter((_, index) => index !== 8)` 相容舊十一欄；篩選從 `{ ...EMPTY_COLUMN_FILTERS }` 起始，以 `for (const key of FILTER_KEYS)` 白名單保留陣列字串，無效值或空陣列為null。移除 specification 型別、標籤、空條件與快取／取值分支，不改匯出。
- [x] `node --test tests/materialRequest*.test.mjs tests/materialBom*.test.mjs`、範圍 ESLint、`npm run typecheck`、`npm run build`、`git diff --check` 通過。
- [x] 實際桌機檢查表頭、篩選、主料／展開替代料皆十欄，右側資料更新對齊；搜尋、篩選、欄寬仍工作；390px卡片可用，無本次新增錯誤。

## 驗證記錄

- 46 項相關測試通過（含篩選契約、手機殼層、資料載入回歸），範圍 ESLint、型別檢查與建置通過；保留既有套件／chunk 警告，未擴大修改依賴。
- TDD：首次新回歸 4 項預期失敗；獨立審查後新增 `material:["IC"]` 與 `internal:[42]`／空陣列並存，先重現 `[]` 隱性條件，再修為null，14項表格測試全過。複審無剩餘問題。
- 桌機 1280px：50主料＋6替代料每列皆10欄；末欄表頭／篩選／主料／替代料同寬對齊。實際拖曳末欄130→110px，重新整理保留110px，重設後130px。
- 實際 MPN 搜尋得2個主料；「狀態追蹤：處理中」得65個主料並顯示chip，個別清除還原1,028個。原廠商明細6,608筆、3個BOM及0/404頁進度保持相同。
- 390×844px：卡片與6個替代料可展開，頁寬390px無水平溢出；本機瀏覽器warn/error為空。未做實體手機與全庫測試，未寫入正式BOM資料。

發布：只提交這四個檔案，推送 main，核對 Pages exact SHA，正式總表實際確認欄位消失。Git 外保存截圖／驗證記錄；不宣告未驗證項目完成。

發布閘門：本機建置與審查已通過；Pages工作流僅建置／部署，不宣稱CI執行46項測試。無資料庫遷移、API或feature flag改動。若正式頁十欄對齊或搜尋失敗，保留前版 `fc89ac2659a5a2deaf4615b171b1549020efe198` 供可逆回退評估，不自動改正式資料。部署後實際核對結果與SHA寫入Git外驗證記錄。
