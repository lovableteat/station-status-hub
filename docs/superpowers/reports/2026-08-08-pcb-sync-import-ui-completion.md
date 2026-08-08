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

## 推送

本報告與上述程式碼會從 `codex/pcb-collaboration-fixes` 以 fast-forward refspec 推送到 `origin/main`。
