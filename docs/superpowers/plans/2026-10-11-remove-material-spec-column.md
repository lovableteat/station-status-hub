# 移除 BOM 規格／備註欄 Implementation Plan

> **For agentic workers:** 使用 executing-plans 在目前對話連續完成；使用者已授權既定範圍的測試、目視驗證、提交與推送，不另詢問阶段或執行方式。

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

- [ ] 新增不含規格表頭／篩選／列儲存格、十欄及固定末欄、舊設定還原的回歸。
  ```js
  assert.doesNotMatch(tableBlock, /規格 \/ 備註|filterKey="specification"|group\.partSpec/);
  assert.equal(widths.length, 10);
  ```
- [ ] `node --test tests/materialRequestTableLayout.test.mjs`：確認新回歸因旧欄位、十一欄與直接混入旧篩選而失敗。
- [ ] 移除第九欄，三組欄寬移除 index 8，sticky index 改9、跨欄改10。還原寬度使用 `parsed.filter((_, index) => index !== 8)` 相容舊十一欄；篩選以 `Object.fromEntries(FILTER_KEYS.map(...))` 白名單保留陣列字串，其他值為null。移除 specification 型別、標籤、空條件與快取／取值分支，不改匯出。
- [ ] `node --test tests/materialRequest*.test.mjs tests/materialBom*.test.mjs`、範圍 ESLint、`npm run typecheck`、`npm run build`、`git diff --check` 通過。
- [ ] 實際桌機檢查表頭、篩選、主料／展開替代料皆十欄，右側資料更新對齊；搜尋、篩選、欄寬仍工作；390px卡片可用，無本次新增錯誤。

發布：只提交這四個檔案，推送 main，核對 Pages exact SHA，正式總表實際確認欄位消失。Git 外保存截圖／驗證記錄；不宣告未驗證項目完成。
