# Data Center 每日回報與操作介面

## 範圍與現況

僅修改 Data Center；保留共用頁首、黑／炭灰底、青綠主色、3D 模型、地板尺寸、2D 編輯及既有權限。基準版本 `9ac883dc`。正式資料有 VR200 與 Test 兩個未封存專案，各有兩個站點；目前 Taipei AI Lab 只配置三座機櫃。空地是規劃空間，不以假資料填滿。

## 設計

左側導覽維持可收合，展開時完整顯示功能名稱；增加「每日工作回報」。在場景上直接呈現專案、站點、同步狀態與已配置機櫃數，說明未配置地板的用途。分開內容導覽、配置工具與相機操作，避免浮動工具重疊。空清單保留結構及下一步指引。

每日回報是同一工作區中的內容頁，不是新增一層彈窗。日期預設台北當日，填寫站點、工作狀態、今日完成、下一步及阻礙；未送出的文字依帳號與專案保留本機草稿。送出成功必須取得資料庫回條，失敗保留文字。可修改自己的既有回報，不能冒用他人或覆寫其他工作階段的新版資料。

歷史清單的篩選列緊接結果上方，順序為搜尋、站點、狀態、回報人、日期。條件同步 URL，顯示可個別清除的 chip 與全部清除；不清除工作區／專案上下文。載入、權限、網路失敗、尚無紀錄及零筆篩選分開處理。

## 資料與安全

新增 `workspace.data_center_work_reports`，每筆回報獨立儲存，不放進機櫃 JSON 文件，以免每日回報與場景自動儲存互相覆寫。重用 `can_view_data_center_projects`、`can_edit_data_center_projects`、`current_system_user_id` 與既有 updated-at trigger。日期／作者／專案／站點組合唯一；作者身分與歸屬不可透過更新改寫。僅有 Data Center 編輯權限者可提交自己的回報；唯讀成員可查看。

## 指定技能的使用邊界

frontend-design、design-taste-frontend 的保留改版原則、impeccable product／animate、Apple Design：固定字級階層、可見狀態、熟悉表單、立即回饋、150–200ms 狀態轉場及 reduced-motion。brandkit 的單一既有色盤與品牌一致性、canvas-design 的構圖／留白節奏用於現有操作畫面，不另外重塑 Logo 或加入裝飾圖。Remotion 為影片路由技能；本需求沒有影片製作，保留場景效能，不引入影片依賴。

## 驗收

資料驗證、建立／修改／重複／版本衝突及 RLS 真實 SQL 檢查；桌機 1440、1024 與手機 390 的實際瀏覽器檢查；驗證草稿、重新整理、篩選清除、2D／3D／既有視窗入口。完成 build、typecheck、相關測試、提交推送與 GitHub Pages 部署後再報告完成。

## 已取得的驗證證據（2026-10-07）

- `node --test tests/dataCenter*.test.mjs`：130/130，包含邏輯及既有介面契約檢查，不等於 130 條瀏覽器 E2E。
- 設定 `AUDIT_QA_DIR` 為含 React 18.3.1／react-test-renderer 的獨立 QA 依賴目錄後，執行 `node --test tests/dataCenterDailyReports.test.cjs tests/dataCenterDailyReports.ui.cjs tests/auditDataCenter.integration.cjs`：13/13。涵蓋驗證、回條、錯誤、版本、草稿及頁內取代確認；未更動應用依賴。
- `npm run typecheck`、三個變更 TS 檔的 ESLint、`npm run build` 通過。完整 `npm test` 為 1076/1079；剩下三項是 `globalCollaborationCenter`、`performanceAppraisal`、`performanceWorkflowCompletion` 的既有契約失敗，在隔離的 `9ac883dc` 基準來源重跑相同三項，依「只改 Data Center」不修改它們。
- 正式 Supabase 已套用每日回報 migration。`tests/dataCenterDailyReports.rls.sql` 實際在 authenticated 角色下驗證自己的建立／修改、他人修改禁止、冒用作者禁止、無效站點、重複、空白、未來日期、欄位身分不可改、過期版本零筆、唯讀／撤銷及匿名權限。整個測試 transaction rollback，沒有新增測試帳號或保留權限變更。Security advisor 沒有此新資料表的告警。
- 真實瀏覽器登入既有帳號，在 Test 專案的 Taipei AI Lab 填寫：重開後草稿／狀態仍在；23:09:45 成功送出；23:10:10 成功修改，直接 SQL 讀回內容、作者、站點與 updated_at；重複送出顯示錯誤且保留草稿。篩選 chip、零筆仍保留表頭、重新整理保留 URL，以及全部清除保留 workspace／project 皆實測。
- 曾遇到舊測試頁的原生 `window.confirm` 阻擋瀏覽器操作，已改為表單內「保留草稿／載入這筆回報」。新行為通過 React 互動測試；不得把這項說成已在該卡住分頁重新點選成功。
- 本機設定對齊正式站的 `VITE_REALTIME_COLLABORATION_V2=true`，依既有 lockfile 以 `npm ci --legacy-peer-deps` 同步本機依賴；未改登入或全站程式。
- 只刪除本次建立且精確核對身分與內容的一筆 QA 回報。VR200／Test 場景 updated_at 仍分別是 2026-09-01 03:09:41／03:05:39 UTC。

部署與正式站尺寸目視結果在完成推送後補記；實機中文鍵盤、IME 與裝置 safe-area 尚不屬於已取得的證據。
