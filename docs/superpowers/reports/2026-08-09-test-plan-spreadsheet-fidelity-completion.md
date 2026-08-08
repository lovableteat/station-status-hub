# Test Plan 試算表顯示與編輯完成紀錄

日期：2026-08-09  
功能範圍：Test Plan 內建 Excel 編輯器  
交付分支：`codex/pcb-collaboration-fixes` → `main`

## 完成結果

1. 數值不再直接顯示 JavaScript 浮點原值。`.xlsx` 會使用儲存格的 Excel `numFmt` 與 SheetJS SSF 顯示格式；一般格式也會去除不必要的浮點尾數，公式編輯行為維持不變。
2. 「新增列」插在目前選取範圍下方，「新增欄」插在目前選取範圍右方。若插入邊界會切斷合併儲存格，會自動往後移到安全位置。
3. 新列／欄會保留相鄰列高、欄寬與樣式，但新儲存格保持空白；公式、數值與合併範圍會正確位移。
4. 工作表標籤移到表格下方，保留原本的 ARIA tab 鍵盤操作，並依 Excel 工作表標籤色顯示 3 px 指示線；窄螢幕可水平捲動。
5. 最終審查確認的公式、中繼資料、日期格式與錯誤復原缺口已修正：跨工作表 A1 參照、shared formula、隱藏／大綱層級、autoFilter 與合併儲存格樣式均有真實工作簿往返測試。

## 原因分析

- 舊顯示路徑直接採用 ExcelJS 的儲存格文字／JavaScript Number，像 `50.4` 可能呈現為 `50.400000000000006`。
- 舊的新增列／欄按鈕只在工作表末端擴充，沒有根據目前選取位置，也沒有完整處理樣式與合併範圍。
- 工作表標籤固定在上方工具列，且沒有讀取 `.xlsx` 的 `worksheet.properties.tabColor`。

## 主要修改

- `src/components/test-plan/spreadsheetInteraction.ts`
  - 集中數字／日期 scalar 格式化與合併範圍安全插入位置計算。
- `src/components/test-plan/spreadsheetWorkbook.ts`
  - 集中 ExcelJS／SheetJS 列欄插入、公式翻譯、樣式複製、合併範圍、中繼資料、autoFilter 位移與失敗復原。
- `src/components/test-plan/TestPlanSpreadsheetEditor.tsx`
  - 接入 Excel 日期格式顯示、legacy 工作簿公式脈絡、插入錯誤訊息與既有底部工作表標籤。
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
- 最終審查修正：以獨立 RED／GREEN 切片加入純公式翻譯、兩引擎列欄插入及寫入／讀回、列欄中繼資料、autoFilter、真實 SSF 日期格式與強制失敗 rollback 測試；自我審查另發現 `LOG10`／A1 外觀 table 名稱邊界並以失敗測試修正。
- 最終複審修正：Unicode 工作表限定詞、外部工作簿／3D 參照邊界、整列／整欄 A1 範圍與跨工作表 rollback 均先加入可重現失敗測試，再完成最小修正。

## 最終審查發現與修正

1. **公式位移：** ExcelJS `spliceRows`／`spliceColumns` 不會翻譯公式。新增純 A1 參照翻譯器，絕對／混合參照也依結構位移，略過字串與 structured refs，並依目標工作表限定未限定／限定工作表參照。ExcelJS 與 SheetJS 都會更新工作簿內所有工作表，保留公式結果與 shared formula 主從參照。
2. **中繼資料：** ExcelJS 插入前快照並還原位移列的 `hidden`、`outlineLevel`、列高，以及位移欄的寬度／隱藏／大綱層級；新插入列欄只複製既定相鄰尺寸，不繼承隱藏或大綱狀態。兩引擎的 autoFilter 範圍會隨插入位置位移。
3. **日期 numFmt：** `Date` 與公式的 Date 結果和數值相同，交由動態載入 SheetJS 的真實 `SSF.format` 處理；日期、小數與百分比均使用真實 SSF 測試。
4. **原子性與錯誤處理：** ExcelJS 失敗時會還原所有可能被公式翻譯修改的工作表：逐表解除目前合併範圍，將各快照 `merges` 映射至 `mergeCells` 後還原 model，再重播各表合併儲存格樣式。SheetJS 在提供 workbook 時同樣逐表清除目前 sheet keys 並由快照重建。編輯器捕捉錯誤、顯示可讀訊息，且失敗路徑不標記 dirty。
5. **範圍控制：** 沒有修改 CSS、工作表底部分頁位置、tables、validations 或 conditional formatting；`xlsx` 維持動態載入，ExcelJS 與 SheetJS 仍以 `Promise.all` 平行載入，既有儲存流程不變。

## 最終複審發現與修正

1. **Unicode 工作表限定詞：** 公式 parser 改以 Unicode letter／mark／number token 捕捉未加引號的工作表名稱，避免把 `工作表2!A3` 尾端誤當成目前工作表的未限定 `A3`；加引號與未加引號的 Unicode 目標／非目標工作表皆有測試。
2. **外部與 3D 邊界：** parser 會先完整捕捉 `[Other.xlsx]工作表1!A3`、`'[Other.xlsx]工作表 1'!A3`、`Sheet1:Sheet3!A3` 與 quoted 3D 形式，再將整段原樣略過，不會從尾端重新匹配。
3. **整列／整欄範圍：** 新增 `3:5`、`C:E` 及 `$3:$5`、`$C:$E` 的結構位移；跨過插入點的範圍只移動受影響端點，並沿用目標工作表、字串與 structured reference 規則。
4. **跨表原子 rollback：** 強制失敗測試會先確認至少一個非目標工作表公式已被翻譯，再觸發後續工作表錯誤；ExcelJS 與 SheetJS 都必須逐表精確還原，ExcelJS 另驗證非目標合併儲存格的獨立樣式。
5. **合併公式單次翻譯：** 複審自我檢查確認 ExcelJS merge proxy 會重複暴露 master 公式；翻譯迴圈現在略過非 master 的合併儲存格，避免同一公式位移兩次。

## 2026-08-09 最終驗證

```text
node --test tests/test-plan/*.test.ts
82 passed, 0 failed

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
f474108 fix: preserve spreadsheet formulas and metadata
70abbf3 fix: handle spreadsheet formula reference boundaries
```

## GitHub 交付程序

1. 以 `git fetch origin main` 取得最新遠端狀態。
2. 用 `git rev-list --left-right --count HEAD...origin/main` 確認本地只有領先、遠端沒有新提交。
3. 以 `git push origin HEAD:main` 快轉更新 `main`，不做強制推送。
4. 用 `git ls-remote origin refs/heads/main` 核對遠端 SHA。
5. 檢查 GitHub Actions／Pages 發佈結果。

實際交付結果：

- `git rev-list --left-right --count HEAD...origin/main`：`10 0`，確認遠端沒有尚未整合的新提交。
- `git push origin HEAD:main`：以 fast-forward 將 `df845b1..70abbf3` 推到 `main`，沒有 force push。
- `git ls-remote origin refs/heads/main`：`70abbf3e04db9f963a99aee980b151e62cbcf764`。
- GitHub Actions：[Deploy to GitHub Pages #31269318806](https://github.com/lovableteat/station-status-hub/actions/runs/31269318806) 成功；build 52 秒、deploy 8 秒。
- 工作流程只有 GitHub Actions 的 Node.js 20 deprecated／強制使用 Node.js 24 警告，沒有建置或部署失敗。
- 本紀錄以後續純文件提交補登，仍採相同 fast-forward 程序推送，不改動已驗證的程式碼。

## 已知驗證限制

本機沒有可重用的已登入 Test Plan 瀏覽器工作階段，因此沒有以真實私有工作簿做人工 UI 點擊驗收。功能由真實 ExcelJS／SheetJS 執行期與寫入／讀回測試、82 項 Test Plan 測試、Lint、正式建置與最終差異自我審查覆蓋。
