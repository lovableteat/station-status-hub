# Test Plan 試算表顯示與編輯完成紀錄

日期：2026-08-09  
功能範圍：Test Plan 內建 Excel 編輯器  
交付分支：`codex/pcb-collaboration-fixes` → `main`

## 完成結果

1. 數值不再直接顯示 JavaScript 浮點原值。`.xlsx` 會使用儲存格的 Excel `numFmt` 與 SheetJS SSF 顯示格式；一般格式也會去除不必要的浮點尾數，公式編輯行為維持不變。
2. 「新增列」插在目前選取範圍下方，「新增欄」插在目前選取範圍右方。若插入邊界會切斷合併儲存格，會自動往後移到安全位置。
3. 新列／欄會保留相鄰列高、欄寬與樣式，但新儲存格保持空白；公式、數值與合併範圍會正確位移。
4. 工作表標籤移到表格下方，保留原本的 ARIA tab 鍵盤操作，並依 Excel 工作表標籤色顯示 3 px 指示線；窄螢幕可水平捲動。

## 原因分析

- 舊顯示路徑直接採用 ExcelJS 的儲存格文字／JavaScript Number，像 `50.4` 可能呈現為 `50.400000000000006`。
- 舊的新增列／欄按鈕只在工作表末端擴充，沒有根據目前選取位置，也沒有完整處理樣式與合併範圍。
- 工作表標籤固定在上方工具列，且沒有讀取 `.xlsx` 的 `worksheet.properties.tabColor`。

## 主要修改

- `src/components/test-plan/spreadsheetInteraction.ts`
  - 集中數字格式化與合併範圍安全插入位置計算。
- `src/components/test-plan/spreadsheetWorkbook.ts`
  - 集中 ExcelJS／SheetJS 列欄插入、樣式複製、合併範圍與中繼資料位移。
- `src/components/test-plan/TestPlanSpreadsheetEditor.tsx`
  - 接入 Excel 格式顯示、選取位置插入與底部工作表標籤。
- `src/components/test-plan/test-plan.css`
  - 新增底部標籤列、Excel 標籤色狀態與窄螢幕捲動。
- `tests/test-plan/spreadsheet-interaction.test.ts`
  - 驗證一般／自訂數字格式與合併範圍插入位置。
- `tests/test-plan/spreadsheet-workbook.test.ts`
  - 使用真實 ExcelJS、SheetJS 工作簿驗證列欄插入、樣式、公式、合併範圍與列欄尺寸。
- `tests/test-plan/ui-contract.test.ts`
  - 驗證編輯器接線、按鈕位置、底部標籤、Excel 顏色與可捲動版面。

## TDD 與審查紀錄

- 數字／插入 helper：先建立失敗測試，再完成實作；審查發現合併範圍邊界判斷不足後，以 `06b8708` 修正。
- 工作簿插入：先建立 UI 合約與執行期失敗測試；審查發現合併樣式可能在 unmerge/remerge 遺失，以及 legacy 插入格未保留樣式後，以 `73f2625` 修正並加入真實 ExcelJS／SheetJS 測試。
- 底部分頁：UI 合約先呈現 1 項預期失敗，再完成版面與顏色；獨立審查沒有 Critical／Important 問題。

## 2026-08-09 最終驗證

```text
node --test tests/test-plan/*.test.ts
61 passed, 0 failed

npx.cmd eslint src/components/test-plan/TestPlanSpreadsheetEditor.tsx src/components/test-plan/spreadsheetInteraction.ts src/components/test-plan/spreadsheetWorkbook.ts tests/test-plan/spreadsheet-interaction.test.ts tests/test-plan/spreadsheet-workbook.test.ts tests/test-plan/ui-contract.test.ts
exit 0

npm.cmd run build
3488 modules transformed; production build exit 0

git diff --check
exit 0
```

正式建置仍顯示專案原有的 Browserslist 資料過期、CAD 相依模組 browser externalization 與大型 chunk 警告；本次沒有新增建置錯誤。

## Commit 歷程

```text
2d3c721 docs: specify spreadsheet fidelity improvements
b1b3180 docs: plan spreadsheet fidelity implementation
2511569 feat: add spreadsheet fidelity helpers
06b8708 fix: skip all merges at spreadsheet insertion boundary
093697c feat: improve Test Plan spreadsheet editing
73f2625 fix: preserve spreadsheet insertion formatting
7cc0ec3 feat: render Excel sheet tabs below grid
```

## GitHub 交付程序

1. 以 `git fetch origin main` 取得最新遠端狀態。
2. 用 `git rev-list --left-right --count HEAD...origin/main` 確認本地只有領先、遠端沒有新提交。
3. 以 `git push origin HEAD:main` 快轉更新 `main`，不做強制推送。
4. 用 `git ls-remote origin refs/heads/main` 核對遠端 SHA。
5. 檢查 GitHub Actions／Pages 發佈結果。

實際遠端 SHA 與發佈結果：`[推送後補登]`

## 已知驗證限制

本機沒有可重用的已登入 Test Plan 瀏覽器工作階段，因此沒有以真實私有工作簿做人工 UI 點擊驗收。功能由真實 ExcelJS／SheetJS 執行期測試、61 項 Test Plan 測試、Lint、正式建置與兩輪獨立程式碼審查覆蓋。
