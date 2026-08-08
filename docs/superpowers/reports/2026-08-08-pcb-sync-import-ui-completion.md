# PCB Designer 同步、匯入與介面修正完成報告

日期：2026-08-08

## 完成內容

1. 2D／3D 共用同一份元件座標、旋轉角度、Top／Bottom 層級、可見層與選取狀態。新增共用 view-sync helpers，並在兩個畫布留下座標、旋轉、層級、選取與版面顏色的 QA data attributes。
2. STP／STEP 匯入上限提高至 50 MiB，且在讀取內容前拒絕超過上限的檔案。模型沿用既有解析器，保留檔名與尺寸 metadata；模型 payload 透過瀏覽器儲存區保存，專案 JSON 只保留 asset metadata／reference。
3. BOM／元件庫預覽改成可理解的摘要：總筆數、有效筆數、錯誤筆數、錯誤列上限 100，以及 BOM「待放置項目」數量與行為說明。
4. 新增 Top／Bottom 可編輯色彩；All 使用原有背景色，篩選 Top／Bottom 時 2D／3D 使用對應 layer color。舊專案缺少 layerColors 時會自動補齊，不改原有背景色。
5. 移除工具列重複的「新增專案」按鈕，只保留左側主要入口；工具列與 Top／Bottom 控制加上不壓縮、nowrap、固定最小寬度與更明顯 active 狀態。

## 實作流程與 commits

- `f1c9124`：加入實作計畫。
- `de39057`：建立 2D／3D view sync 基礎。
- `e1e1162`：統一元件 view state 與 selection API。
- `8f1e123`：提高匯入上限並改善匯入預覽摘要。
- `9a7cd8e`：將 import preview 改為 typed object API，保留專案匯入流程。
- `a53fdab`：回復匯入預覽以外的既有表單文案。
- `da51588`：加入可編輯 Top／Bottom layer colors 與 legacy JSON normalization。
- `157bfc6`：移除重複新增按鈕並改善工具列可讀性。
- `6dd20ad`：更新已落後於現行產品行為的 PCB integration contracts。

## 驗證結果

- `npm run test:pcb`：157/157 通過。
- `npm run build`：成功完成 production build。
- 本次變更檔案定向 ESLint：無錯誤；CSS 檔案只有「未被 ESLint 設定涵蓋」警告。
- 專案全域 `npm run lint`：仍有既有非本次範圍的 `no-explicit-any`、React Hook dependency 等錯誤，集中在其他工作區檔案；本次 PCB 變更檔案未引入新的 lint error。
- 本機瀏覽器 smoke check：本機頁面可啟動，但未登入時停在帳號登入頁；未繞過驗證，因此尚未在登入後實際點擊 PCB Designer。靜態契約、單元測試與 production build 已覆蓋本次變更。

## 追加修正：2D 切換 3D 時的頁面錯誤

問題根因是 3D 視圖採用 lazy chunk，且 Three.js/WebGL 建立失敗會一路冒泡到全域錯誤邊界，所以畫面只剩「頁面載入遇到問題」。

- `AppRuntimeBoundary` 現在會記錄並檢查 chunk fingerprint；同一個失敗資產不會被重複嘗試，重載仍由使用者按鈕控制，避免編輯中的資料被自動刷新打斷。
- `Pcb3DCanvas` 新增區域錯誤邊界與 Canvas fallback；WebGL 失敗時只在 3D 區塊顯示「3D 檢視無法啟用」，2D 版面、選取與編輯狀態仍保留。
- 新增契約測試 `contains 3D runtime failures inside the PCB view`。
- 本次修正驗證：`npm run test:pcb` 158/158、`tests/bootRecoveryPolicy.test.mjs` 2/2、定向 ESLint 通過、`npm run build` 成功。

## 追加修正：PCB 左側資源欄對齊

截圖中的偏移來自左側分區使用不同水平內距：分頁與清單為 6px，搜尋／篩選與操作列為 10px，導致專案卡片與上方控制項不在同一條左右基準線。

- 在 `.pcb-left-rail` 建立 `--pcb-rail-gutter: 10px`。
- 分頁、搜尋／篩選、操作列、清單統一使用這個水平 gutter；檢查器分頁保留 6px fallback，不影響右側欄。
- 新增契約測試 `keeps the left rail sections on one horizontal alignment rail`。
- 版面判讀與 detector 都確認頁面 grid 本身正常，問題只在巢狀 wrapper padding；detector 結果為零項。
- 本次驗證：`npm run test:pcb` 159/159、定向 ESLint 0 errors、`npm run build` 成功；瀏覽器可載入登入頁，但未繞過登入驗證進入 PCB 畫面。

## 追加修正：搜尋與狀態文字對齊

- 專案狀態選單加入與搜尋列同尺寸、同位置的 `Filter` 圖示。
- `.pcb-search-input` 與 `.pcb-status-filter` 共用 `padding-left: 32px`，讓「搜尋專案」與「全部狀態」從完全相同的水平位置開始。
- 新增契約測試 `aligns project search and status filter text`。
- 本次驗證：`npm run test:pcb` 160/160、定向 ESLint 通過、`npm run build` 成功。

## 推送

本報告與上述程式碼會從 `codex/pcb-collaboration-fixes` 以 fast-forward refspec 推送到 `origin/main`。
