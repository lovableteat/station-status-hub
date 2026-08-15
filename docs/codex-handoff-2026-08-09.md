# Codex 工作交接（2026-08-16 最新狀態；沿用原檔名）

> 新分頁啟動方式：先完整讀取本檔，再從目前遠端 `main` 繼續。不要重做本檔標示為已完成的功能，也不要要求使用者重新敘述已記錄的歷史。

## 2026-08-16 最新基準

- 本機專案：`C:\Users\銘三\Desktop\機台管理系統`
- GitHub：`lovableteat/station-status-hub`
- 正式分支：`main`
- 手機版功能基準提交：`fd384fa028755548f3e7f4699ae4a533f7f0df67`（`feat: rebuild core mobile workspaces`）
- 手機版規格提交：`db249e9`（`docs: specify mobile-first workspace redesign`）
- 整理前本機、`origin/main` 與 GitHub Pages 部署 SHA 均為 `fd384fa028755548f3e7f4699ae4a533f7f0df67`。
- GitHub Pages：<https://lovableteat.github.io/station-status-hub/>
- 對應 Pages 部署：<https://github.com/lovableteat/station-status-hub/actions/runs/31876600046>（success）
- 此次 handoff 更新前工作樹乾淨，沒有待接手的未提交程式碼。

## 使用者已明確決定的工作方式

1. 對安全且在需求範圍內的 UI／實作細節直接判斷並完成，不要反覆要求使用者選方案。
2. 每次完成修改都必須 commit、push 到遠端 `main`，再核對遠端 SHA 與 GitHub Pages；只有本機修改不算交付。
3. 保留既有功能、資料、權限、ID、Supabase migration 與其他使用者修改；不得用 reset、revert 或整批覆寫清掉無關內容。
4. UI 優先簡潔、少佔位、避免重複入口與大片空白；手機版必須同時適應 iOS、Android、直向與橫向寬度。
5. 訊息入口維持右下角、長方形且能看見「訊息」文字；頁面不可同時出現兩個訊息面板或重複 launcher。
6. 回覆先給結果，再列改動、測試、commit、push 與部署狀態。

## 最新完成：全站手機優先改版

- 共用手機殼層改為 52px safe-area header 與 56px 固定底部 dock。
- 底部導覽固定為「首頁、維修、料號、查詢、更多」；Data Center、PCB Designer、後台管理放在依權限顯示的「更多」抽屜。
- 支援 320、360、390、412、430 CSS px 直向尺寸，並將 compact／手機橫向行為延伸到 1023px（含 844 × 390）。
- 已套用 `100svh`／`100dvh`、`viewport-fit=cover`、`interactive-widget=resizes-content`、上下 safe area、16px 手機輸入與 44px 觸控目標。
- PCB Designer 改為 canvas-first：單列專案操作、精簡工具列、抽屜式次要操作與緊湊狀態列。
- Data Center 移除重複手機 dock，場景、詳情、模型與 2D 操作改為畫布上的緊湊控制。
- 後台使用者卡片優先顯示身分、狀態、帳號與最後登入，手機隱藏冗長 metadata。
- 維修頁的專案操作、模組導覽、標題與 KPI 改為緊湊列／水平 snap strip。
- BOM 手機頁保留搜尋與快速篩選，排序、匯入匯出及分頁工具收進次要 disclosure；料號卡改為摘要優先。
- AI 查詢縮短來源選擇器、空狀態與 composer，避免輸入區佔滿畫面。
- 完成報告：`docs/superpowers/reports/2026-08-15-mobile-first-workspaces-completion.md`
- 設計與實作計畫：
  - `docs/superpowers/specs/2026-08-15-mobile-first-workspaces-design.md`
  - `docs/superpowers/plans/2026-08-15-mobile-first-workspaces.md`

### 手機版驗證基準

- 相關測試：220 passed、0 failed。
- 修改過的 TypeScript／TSX ESLint：通過。
- Production Vite build：通過。
- GitHub Pages deployment：success；線上首頁與 Admin、Data Center、PCB、BOM、AI chunks 皆為 HTTP 200，且本次手機版標記存在。
- 完整舊測試集當時為 673 passed、3 failed；下列三項位於未修改區域，接手時不要誤判為此次手機版回歸：
  - `tests/bootRecoveryPolicy.test.mjs`
  - `tests/dynamicSystemMetadataMigration.test.mjs`
  - `tests/supabaseOutageResilience.test.mjs`
- 前一工作階段的 Codex 內建瀏覽器沒有可用 instance，因此沒有逐尺寸互動截圖；當時以契約測試、build、本機 HTTP preview 與正式 bundle 標記驗證。新分頁若瀏覽器可用，應優先補做 320／390／430 直向與 844 × 390 橫向實機視覺檢查。

## 已完成：BOM 按每頁列數載入

- 主要完成提交：`2c960e1`（`feat: complete BOM pagination and collaboration chat updates`）。
- 初始與翻頁會依目前頁碼／每頁列數要求對應 Supabase range，穩定排序為 `order_index ASC`。
- partial workspace 保留遠端 `record_count`，不會把局部頁面誤標成完整快取。
- 搜尋、篩選、排序、匯出及其他跨頁功能會升級為 full-load，維持完整結果。
- 寫入、衝突與 Realtime 行為維持原規則。
- 實作計畫已全部勾選完成：`docs/superpowers/plans/2026-08-09-bom-page-loading.md`。
- 相關實作集中在：
  - `src/components/material-requests/MaterialRequestPage.tsx`
  - `src/components/material-requests/materialBomStorage.ts`
  - `src/components/material-requests/materialBomPerformance.ts`

## 新分頁開始工作的固定檢查

1. 先執行 `git status --short --branch`、`git fetch origin main`、`git rev-parse HEAD` 與 `git rev-parse origin/main`。
2. 若工作樹有修改，先判斷是否為使用者既有內容；不得直接清除。
3. 先讀與新需求直接相關的 spec、plan、completion report 及測試，再動程式碼。
4. 先跑精準測試，再跑相關測試與 production build；不要為了三個已知舊失敗擴張無關任務。
5. 完成後只 stage 本次檔案，commit、push `main`，核對遠端 SHA，等待 Pages success，再驗證正式網址。

---

## 2026-08-09 歷史背景（若與上方衝突，以上方最新基準為準）

## 專案與正式環境

- 本機專案：`C:\Users\銘三\Desktop\機台管理系統`
- GitHub：`lovableteat/station-status-hub`
- 正式分支：`main`
- 2026-08-09 當時本機與遠端 HEAD：`495ff1efd29dc1f479d11d703f70e1807048f193`
- GitHub Pages：<https://lovableteat.github.io/station-status-hub/>
- Pages 部署紀錄：<https://github.com/lovableteat/station-status-hub/actions/runs/31269423295>
- GitHub Pages 網域必須使用 repository owner `lovableteat`；`liu52417.github.io/station-status-hub` 會回傳 404。

## 必須延續的工作規則

1. 完成重要功能後必須保留測試、commit、push 與 GitHub Pages 部署的詳細過程。
2. 使用者要求直接提交正式版本時，以 `main` 為目標；提交前先確認工作區乾淨、遠端沒有新 commit，避免覆蓋其他電腦的修改。
3. 不因清理 Codex 歷史而刪除 Git commit、規格、完成報告、Supabase migration 或正式專案資料。
4. 回覆採中等詳細度：先講結果，再列根因、改動、測試與部署狀態；避免只有一兩句，也避免反覆敘述工具操作。
5. 效能優先流程：先跑精準測試，再跑相關測試，里程碑時才跑完整 lint／build；同一批唯讀檢查平行執行；push 後只核對一次部署。

## 已完成且已進入 main 的重點

### Test Plan Excel 編輯器

- 依 Excel 格式顯示浮點數，不再直接顯示 JavaScript 浮點尾數。
- 新增列插在目前選取格下方；新增欄插在目前選取格右方。
- 保留公式、合併儲存格、樣式與工作表 metadata。
- 工作表標籤移到表格下方並保留 Excel 分頁色。
- 相關完成報告：`docs/superpowers/reports/2026-08-09-test-plan-spreadsheet-fidelity-completion.md`
- 主要 commit：
  - `2511569` feat: add spreadsheet fidelity helpers
  - `093697c` feat: improve Test Plan spreadsheet editing
  - `73f2625` fix: preserve spreadsheet insertion formatting
  - `7cc0ec3` feat: render Excel sheet tabs below grid
  - `f474108` fix: preserve spreadsheet formulas and metadata
  - `70abbf3` fix: handle spreadsheet formula reference boundaries

### PCB Designer

- 2D／3D 共用元件座標、旋轉、層級與選取狀態。
- 支援群組移動、禁制區複製、Top／Bottom 層級與多選同步。
- 支援 STEP 模型匯入與 3D 顯示，並加強大型模型安全處理。
- Top／Bottom 顏色可編輯；移除或弱化重複／無用途操作。
- 修正 3D runtime 錯誤隔離與左欄文字、間距對齊。
- 完成報告：
  - `docs/superpowers/reports/2026-08-08-pcb-collaboration-fixes-completion.md`
  - `docs/superpowers/reports/2026-08-08-pcb-sync-import-ui-completion.md`

### 維修資料 AI 查詢

- AI 查詢可從正式維修資料即時檢索並附 `[M1]`、`[M2]` 引用。
- 可選目前專案、多專案或全部專案；引用可導回機台、站點、測項、問題與工具資產。
- 查不到來源或檢索失敗時不退回無來源回答。
- 相關規格：`docs/superpowers/specs/2026-08-03-maintenance-rag-source-design.md`
- 主要 commit 範圍：`e37966d` 至 `2795650`。

### 其他已確認事項

- Test Plan 上傳限制曾受 Supabase 組織 Spend Cap 影響；程式與 bucket 的限制需和 Supabase 全域 Storage 設定一起核對。
- Git 工作區整理時只有一個 worktree，`main` 與 `origin/main` 相同，沒有未提交修改。
- Git repository 本身約 50 MB，不是 Codex 回應延遲主因。

## 已完成：料號總表按頁載入（原 2026-08-09 待辦）

此段是 2026-08-09 的定位紀錄；功能後續已由 `2c960e1` 完成。最新狀態以上方「已完成：BOM 按每頁列數載入」為準。

目前已定位：

- UI 預設 `pageSize = 50`，分頁狀態位於 `src/components/material-requests/MaterialRequestPage.tsx`。
- 現有 `visibleGroups` 只是在瀏覽器中對完整 `filteredGroups` 做 `slice`；它減少畫面列數，但沒有減少首次資料下載。
- `src/components/material-requests/materialBomStorage.ts` 的 `loadRemoteRecordRowsForWorkspace` 會依 `record_count` 建立多個 1,000 筆範圍，最後仍把目前 BOM 的所有 records 抓完。
- IndexedDB 快取能減少未變更 BOM 的重複下載，但首次開啟、快取過期或手動重新載入仍會整批下載。
- 既有搜尋、欄位篩選、統計、匯出、替代料展開與即時協作依賴完整資料；改成伺服器分頁時必須明確處理這些跨頁功能，不能只把畫面 `slice` 改小。

後續已落地的設計方向：

1. 初始只抓 workspace metadata、總筆數與目前頁所需 records。
2. 頁碼或每頁列數改變時，以穩定排序欄位取得對應範圍，並快取已讀頁。
3. 一般瀏覽不預抓全部資料；可在背景預抓下一頁，但不能阻塞首屏。
4. 搜尋／篩選若要求全 BOM 精確結果，改由資料庫查詢與 count 完成；不能只搜尋已載入頁。
5. 完整匯出或全 BOM 統計才啟動全量／串流讀取，並顯示進度。
6. 單筆儲存、Realtime 更新與頁快取失效要維持現有衝突保護。

## GitHub 提交與部署標準流程

1. `git status --short --branch`：確認只包含本次工作。
2. 執行最精準的失敗測試，確認問題可被測試捕捉。
3. 實作後重跑精準測試與相關測試。
4. 里程碑時執行 `npm run lint`、`npm run build` 與必要的完整測試。
5. `git fetch origin main`，確認 `origin/main` 沒有其他電腦的新提交。
6. 檢查 `git diff`，只 stage 本次檔案後 commit。
7. `git push origin main`。
8. 只在 push 後核對一次 GitHub Actions；成功後再以正式 Pages URL 驗證 HTTP 200 與目標畫面。

## Codex 延遲盤點

- `C:\Users\銘三\.codex\archived_sessions` 已為 0。
- `sessions` 整理前共 76 個檔案、約 1.05 GiB；其中舊主任務約 530 MiB，目前任務約 67 MiB。
- Codex 暫存剪貼簿圖片共 43 張、約 12.5 MiB，對磁碟與回應速度影響很小。
- 全域設定當時為 `gpt-5.6-luna`、`model_reasoning_effort = "xhigh"`、`service_tier = "default"`。
- 最高推理量與目前任務的長上下文，才是純回覆等待時間的主要來源；舊檔案只佔硬碟，不會自動加入新任務上下文。
