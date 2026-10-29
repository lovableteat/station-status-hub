> 集中副本；原始路徑：`docs/系統功能與使用手冊.md`；程式參考基準：`06c686951b17afa920cf325ddfec9114590aeee0`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# 系統功能與使用手冊

本手冊供使用者操作及在另一台電腦建立相似網站時理解功能範圍。依據 2026-10-20 工作目錄、基準 commit `c6629250` 的現行原始碼整理；它描述程式提供的行為，不代表本次已登入正式站、操作所有功能、驗證所有工程檔案或確認雲端 migrations 已全部部署。

文件內的 `src/...`、`public/...` 路徑皆相對於專案根目錄，供重建者核對。帳號、API 金鑰與正式資料不包含於本手冊。不要把畫面預覽、範例資料或舊文件規劃當成正式資料。

## 1. 先認識入口、帳號與保存方式

### 1.1 登入與首頁

前提是網站可連線、帳號已核准且狀態為啟用。登入頁提供「登入」與「註冊帳號」：註冊填正確姓名、帳號、至少 6 字元密碼並再次確認，送出後等待管理員核准，並非送出即取得所有工作區權限。

登入後首頁依權限顯示工作區；桌面為入口卡片，行動版為直式入口清單。進入工作區後可用頂部工作區導覽與行動版工作區控制切換；「首頁」回到入口。後台管理從帳號選單進入，不列在每日工作的首頁入口卡片中。沒有權限的入口可能不顯示；直接開連結也必須通過權限檢查。

安全工作階段正在初始化時會顯示驗證畫面。若出現「登入身分已更新」，需要重新驗證；不要將舊瀏覽器登入資料當成仍可寫入的憑證。服務暫時受限與帳密錯誤有不同提示，應依提示處理。

來源：`src/App.tsx`、`src/components/auth/LoginPage.tsx`、`src/components/auth/UserContext.tsx`、`src/components/layout/WorkspaceEntrance.tsx`、`src/pages/Index.tsx`。

### 1.2 九個工作區與相容名稱

| 畫面名稱 | `workspace` ID | 頁面／模組與注意事項 |
| --- | --- | --- |
| 維修中心 | `station-status` | `dashboard`、`test-tracker`、`flow-info`、`issues`、`tools` |
| 檔案上傳 | `file-uploads` | 實際模組仍為 `test-plan`；舊 `module=test-plan` 連結可用 |
| AutoCheck／比對系統 | `comparison` | `module=comparison`；入口與編輯檢查目前使用 `ai-chat` 權限 |
| 料號申請 | `material-requests` | 舊細部權限沿用 `data_center_view/edit`，不可只靠名稱判斷 |
| Data-center | `data-center` | 舊導覽名稱 `data` 相容 |
| PCB Designer | `pcb-designer` | 獨立 PCB 工作區 |
| 後台管理 | `user-management` | `users`、`collaboration`、`api-management` |
| AI 問答 | `ai-chat` | `module=ai-chat`；與 AutoCheck 為不同介面 |
| 績效考核系統 | `performance` | 員工自評、主管審核與管理功能另有資料權限 |

舊 `module=monitor` 導向 L10 測試追蹤的生產看板，等效於 `module=test-tracker` 加 `trackerView=board`。應從畫面導覽產生分享網址；不要自行把 HashRouter 路徑與頁面查詢參數混接。程式另保留 `#/test-tracker` 與 `#/api-management` 路由入口。

權限登錄表只有七個 workspace access 群組，不是首頁九個入口各有一欄：檔案模組 `test-plan` 仍映射到維修中心，AutoCheck 使用比對／AI 相關細部權限。權限層級為無權限、檢視、編輯；現行資料庫帳號的 `role/status/permissions` 與細部頁面權限決定有效結果。載入失敗時不會從過期本機快取恢復已撤銷的權限。`performanceManager` 是另外指派的主管審核資格，不能用「可編輯績效工作區」直接替代。

來源：`src/pages/Index.tsx`、`src/lib/workspacePermissions.ts`、`src/hooks/usePermissions.ts`、`src/components/layout/PermissionGuard.tsx`。

### 1.3 換電腦前先分辨資料在哪裡

| 資料 | 主要保存位置 | 換電腦時的意義 |
| --- | --- | --- |
| 維修專案、機台、流程、測試進度、問題、工具 | Supabase 資料表與對應 Storage | 需相同後端、正確登入與權限；複製前端程式不等於複製資料 |
| 檔案庫 | `test_plan_spaces/folders/files` 與 `test-plan-files` Storage | 必須同時保存檔案物件與資料表；失敗重試中的原始 `File` 不是已上雲資料 |
| AutoCheck 比對、回覆、位址庫 | 按帳號分隔的瀏覽器 IndexedDB | 同帳號換裝置也不會自動出現；另匯出比對 ZIP 與位址庫 YAML |
| 料號 BOM | 雲端 `material_bom_workspaces/records`；本機有快取與復原資料 | 共用資料成功寫入才算同步；本機可看不代表其他人已收到 |
| Data-center 配置 | 本機保存加共用專案同步 | 模型原始檔另有下述限制，不能只備份配置 JSON |
| PCB | 本機專案／模型資產加帳號雲端同步 | 需確認同步狀態，並保留可匯入的備份 |
| AI 個人對話 | 按擁有者保存的 `ai_workspace_conversations` | 對話同步成功後才可跨裝置取得；共享提示詞另存在 `command_library` |
| 績效考核 | 受 RLS、主管資格及隱私鎖控制的雲端資料 | 不應以全站共用資料表概念重建；詳見績效章節 |

## 2. 維修中心：先選專案，再進行機台與問題工作

### 2.1 專案中心

前提是具有對應維修管理權限。工作區上方「切換目前專案」是資料上下文；各頁清除篩選時不應清掉專案。切換專案後要等載入完成，確認頁首名稱，再新增或修改資料。

1. 開「專案中心」→「新增專案」。填名稱、說明、負責人、預計開始／完成日期及狀態；完成日期不能早於開始日期。
2. 建立方式可選空白，或複製既有專案的發布流程與資產。這不是任意複製所有歷史測試／維修紀錄的保證。
3. 在專案清單搜尋、切換、編輯或管理生命週期。可封存不再工作的專案；永久刪除與封存用途不同。
4. 「新增機台」填機台名稱、工程師與序號。後續用機台編輯頁補機型、位置、網路位址及專案動態欄位。

預期結果：目前專案內的機台、流程、進度與問題一起切換；專案摘要顯示機台數與未結問題。資料保存在 `test_projects` 與各筆資料的 `project_id`，不是每個工作區各自選一份同名專案。

永久刪除確認畫面明列專案、機台、流程、進度、問題、工時與資料空間，沒有可依賴的「刪除後復原」操作。重建時要核對 `delete_test_project` 等資料庫函式的實際級聯範圍及 Storage 清理，不可只實作前端刪除按鈕。

來源：`src/components/test-projects/ProjectScopeBar.tsx`、`TestProjectProvider.tsx`、`src/components/test-tracker/SystemManager.tsx`、`SystemEditDialog.tsx`。

### 2.2 問題儀表板

進入維修中心的「問題儀表板」，依目前專案顯示未結問題、緊急未結問題、尚未指派與七日未更新。優先追蹤表依嚴重度及未更新天數列前八件未結問題，另有嚴重度分布與負責人待辦。

點 KPI 或分布項目會前往「問題追蹤」，並將條件寫進 URL，例如未結、緊急或未指派；點問題標題會帶入 `openIssue` 開詳情。到目標頁後應看見同一組篩選 chip，可逐項／全部清除。儀表板是查詢入口，不是獨立維護另一套問題數字。

若載入失敗會顯示錯誤與「重新載入」；不能把載入錯誤當成零筆問題。嚴重度採共用有效優先級規則，包含手動優先級設定，不應在重建時各頁重新計算成不同標準。

來源：`src/components/dashboard/Dashboard.tsx`、`issueDashboardMetrics.ts`、`src/lib/issuePriority.ts`。

### 2.3 L10 流程設定

操作前先確認專案與流程編輯權限。頁面有「流程總覽／流程編輯」；目前 UI 強調「變更直接生效」，不是建立草稿、等待人工發布後才套用的操作流程。

1. 無資料時按「建立第一個站點」，系統準備流程資料。建立站點名稱、說明與估計工時。
2. 選站點建立測項，填測項名稱、說明與估計分鐘數；另可維護該站的流程內容／文件。
3. 用拖曳或上移／下移調整站點及同站測項順序，等「正在儲存排序」結束再繼續。
4. 回流程總覽檢查站點路徑、測項數、單機預估與專案機台數。

資料仍有 `test_flow_versions`、機台的 `flow_version_id` 與歷史相容邏輯，但不應因此寫出目前頁面沒有提供的版本發布操作。站點、測項、內容存於 `test_flow_stations`、`test_flow_items`、`station_contents`。刪除測項會影響對應測試進度，需讀確認提示；既有進度不可當成與流程完全無關的資料。

來源：`src/components/test-tracker/FlowInfo.tsx`、`src/hooks/useFlowVersions.ts`。

### 2.4 L10 測試追蹤、工時與生產看板

清單上方可搜尋機台／序號／工程師，再依站點、狀態、工程師篩選並排序，切換「列表／生產看板」。清單、卡片與看板使用同一組機台及進度資料。篩選含 URL 帶入的機台、排除已完成、需關注條件；chip 清除會同步網址。

1. 在機台列／卡片開進度，或點某站只開該站；`lockedStationId` 在此表示固定檢視站點，不是多人編輯鎖。
2. 選測項狀態：未開始 `Not Start`、進行中 `On-going`、已完成 `Done`、異常 `Error`，填進度百分比及備註，按該測項的儲存。
3. 「開始計時」把測項設為進行中；停止計時會結束這次時間並嘗試設成完成 100%。重新開始會清除原完成時間，使用前應確認目的。
4. 需補登時開「時間記錄管理（台灣時間）」編輯開始／結束時間；畫面區分執行中的計時與已結束的實際耗時。
5. 異常可建立關聯問題，帶入機台、站點、測項及描述。尚有未解決問題的測項顯示 Blocked，不能直接改成 Done；應先處理問題再完成測項。
6. 生產看板依流程分 lane，顯示總機台、進行中、完成、異常、測站超時及更新時間，可篩選並全螢幕。超時根據已知開始時間與預估工時判定，並非硬體即時監測。

機台編輯可維護專案共用欄位定義與此機台值：變更欄位名稱／類型和修改一台的值是不同操作；不要誤把共用欄位刪除當成清空單台內容。相關資料包括 `test_systems`、`test_progress`、專案動態欄位與位址／軟體欄位表。

機台另有複製、完成、重置、刪除與 PDF 匯出等操作，依權限及開啟的工具顯示。重置會清除測試進度；刪除機台使用資料庫函式。這些不是篩選操作，應與日常查詢分區，執行前讀確認範圍。

來源：`src/components/test-tracker/TestTracker.tsx`、`SystemProgressSheet.tsx`、`TimeRecordManager.tsx`、`SystemEditDialog.tsx`、`SystemResetDialog.tsx`、`guardedTestProgress.ts`、`src/components/production/ProductionMonitor.tsx`、`src/hooks/useUnifiedData.ts`。

### 2.5 問題追蹤與統計

在「問題追蹤」可切「問題列表／統計報告」。列表的條件依搜尋、站點、狀態、負責人、嚴重度、追蹤狀態排列；多個條件共同縮小結果。從儀表板進入的條件與手動設定共用 URL 與 chip。

新增／編輯問題時填標題、問題描述、嚴重度、狀態、負責人，必要時連機台、站點、測項，另有分類、關聯、處理紀錄及解決方案。問題狀態為 `open/in_progress/resolved/closed`；測試進度的 `Done/Error` 是另一套欄位，不能混用。問題描述、處理紀錄與解決方案使用內容工作區，可加入附件／截圖；儲存成功後才是共用問題。

點列表列開詳情，可看描述、解決方案及附件，圖片可放大預覽及前後切換。對問題採解決或關閉後，相關測項才可依規則完成；問題改狀態本身不代表所有測項自動完成。刪除問題是獨立破壞性操作。

資料位於 `issues`、`issue_attachments` 與 `issue-attachments` Storage；內文圖片也有保存／取消清理邏輯。重建時需一起保留富文字的安全處理與附件關聯，不能只保留一個 HTML 字串和成功提示。

來源：`src/components/issues/IssueTracker.tsx`、`IssueCreateDialog.tsx`、`IssueEditDialog.tsx`、`IssueContentWorkspace.tsx`、`issueInlineImages.ts`。

### 2.6 工具與資產

此頁有「專案已套用／工具／程式碼／指令／不特定檔案」。先確認目前專案，搜尋名稱、分類、版本或說明，再用使用範圍篩選。

有編輯權限者可維護工具名稱、版本、分類、說明、SOP 與附件；程式碼／指令使用各自資料庫。將既有資產套用到專案會建立 assignment，從專案移除套用不應誤解為刪除全域資產。畫面依 global／workspace 範圍載入，專案已套用只列此專案的關聯。

資料為 `tools_management`、`code_snippets`、`command_library` 與 `test_project_*_assignments`。工具附件使用 `task-attachments`；真正刪除工具可能連帶移除附件。下載或複製指令不會替使用者在本機執行該指令。

來源：`src/components/tools/ToolsManagement.tsx` 及其上傳／程式碼／指令元件。

## 3. 檔案上傳：空間、資料夾、預覽與續傳

### 3.1 找檔案與權限

需要 authenticated 安全登入及 `test-plan` 檢視權。左側是使用者空間與資料夾樹，支援全部檔案與個別空間；上方麵包屑定位目前層級。可搜尋、依格式分類、排序，並切卡片／列表；開檔案會顯示資訊與可用預覽，開資料夾會進入下一層。

管理動作還需要模組編輯權。一般使用者對他人的個人空間唯讀；管理員可管理載入的項目。唯讀仍可查看／下載允許讀取的檔案，但不能重命名、搬移、刪除或儲存試算表。此處個人空間的「唯讀」不是宣稱檔案只對本人可見；以目前資料庫政策及帳號能載入的空間為準。

目前檔案頁呼叫 `loadWorkspace(ownerId, null, ...)`，是整站檔案庫上下文，不能假設切換維修專案就會把所有個人檔案一起隔離。

來源：`src/components/test-plan/TestPlanWorkspace.tsx`、`hooks/useTestPlanWorkspace.ts`、`core/repository.ts`。

### 3.2 上傳單檔／多檔與資料夾

1. 先進自己的可編輯空間與目的資料夾；在全部檔案模式上傳時，系統會依 hook 邏輯取得適當的個人目標空間。
2. 用「上傳檔案」、拖放，或「上傳資料夾」。一般選檔一次最多 20 份、單檔不超過 1 GiB、該批有效檔案合計不超過 1 GiB。
3. 資料夾上傳保留子資料夾路徑，檔案數不套一般 20 份限制，但仍受單檔／單次總計 1 GiB 限制。空資料夾不會憑空變成上傳檔案。
4. 看檔名、已完成數及 bytes 進度。失敗會逐檔列原因，成功部分保留；使用「重試未上傳檔案」只重試失敗部分。
5. 完成後確認檔案列表與資訊，再用預覽或下載核對內容；進度到 100% 不等於已確認 metadata 及 Storage 都保存完成。

檔名不可包含路徑、控制字元或不合法名稱；危險副檔名有阻擋名單。資料夾路徑不能含 `..`、絕對磁碟路徑或衝突項。資料夾匯入遇同位置同名檔案／資料夾會略過以避免覆寫，既有同名資料夾可重用。一般單檔上傳使用新物件 ID，不能推廣成所有同名上傳都會被阻擋或覆蓋。

正 bytes 檔案走 6 MiB 分塊 TUS，上傳路徑與已接收 offset 可續傳；零 bytes 檔案另走一般上傳。重試沿用原始 `File` 與目的位置，並在建立檔案資料列前核對既有結果，避免回應中斷後重複建立。

失敗清單在同頁應用程式記憶體中保留，跨工作區返回仍可重試；離站會提醒，但重新整理／關閉瀏覽器後沒有原始檔案持久復原保證。TUS URL 放在本機 storage 不代表原始檔 bytes 已備份。登出／換帳號會清除這個帳號的重試 UI；失敗時保留本機原檔，不要把「重試」當成找回已遺失原檔的機制。伺服器／代理仍可能有比 UI 更低的上傳限制，HTTP 413 要依服務端實際設定處理。

來源：`core/files.ts`、`core/repository.ts`、`core/supabaseAdapter.ts`、`TestPlanWorkspace.tsx`。

### 3.3 整理、預覽與試算表

檔案／資料夾操作選單可重命名、移動、更新說明、下載或刪除，視項目與權限顯示。資料夾不能移入自己或自己的子資料夾；移動範圍維持在對應空間。下載使用原始檔名。副檔名分類含簡報、試算表、文件、圖片、3D、PCB、壓縮檔與其他，但「可上傳／可分類」不代表每種格式都能直接預覽或編輯。

現行內嵌預覽主要是圖片、PDF 與文字／程式碼。一般 Office、工程模型與壓縮檔若不支援預覽，應下載用原始工具開啟。不要因分類有 STEP、BRD 就宣稱檔案庫提供完整 CAD 編輯器。

可用的試算表從操作選單開「編輯試算表」，支援 `csv/ods/xls/xlsb/xlsm/xlsx`。`xlsx` 使用保留合併儲存格、尺寸、底色、字型、邊框的原始格式模式；其餘採相容模式。可選工作表、選取儲存格／列／欄、編輯內容或公式、複製剪下貼上、清除、復原／重做及插入列／欄，最後按「儲存回原檔」。尚未儲存有提示，關閉前確認是否放棄。

這不是完整桌面 Excel：程式沒有保證所有公式即時計算、VBA 巨集、圖表或外部連結完整相容。重要活頁簿先下載留存，再用 Excel 重新開啟檢查格式與公式。儲存會取代既有物件內容並更新檔案 metadata；不應把它當成自動另存版本。

刪除先提交 metadata，再由 `test_plan_storage_cleanup_queue` 清理 Storage；清理暫時失敗時可能顯示延後處理並於下次載入重試。列表消失不等於雲端 bytes 已同步清完，也不是還原機制。

來源：`core/preview.ts`、`core/spreadsheet.ts`、`TestPlanSpreadsheetEditor.tsx`、`core/repository.ts`、`core/supabaseAdapter.ts`。

## 4. AutoCheck：工程改版比對、回覆與位址規則

### 4.1 建立 A／B 比對

前提是具有 `ai-chat` 編輯權、瀏覽器能載入 worker／Python 套件，以及準備好原始工程檔。此工作區有「比對檢查／審查追蹤／Power Tree／I²C Map／位址庫」。

1. 在「比對檢查」填比對名稱，A 為舊版基準、B 為新版，兩版名稱須不同；預設 EVT／DVT 可改。
2. A、B 各選資料夾（含子資料夾）或檔案。每版需要 `pstxnet.dat` 連線、`pstxprt.dat` 零件、`pstchip.dat` 接腳、BOM 與電路圖 PDF 五個角色。
3. BOM 可用 `.xls/.xlsx/.htm/.html/.csv`；DSN 選用。若同角色有多個候選，用下拉明確選一份。A／B 重新選取會整批取代該版輸入。以 `autocheck` 開頭的 PDF 會被略過，避免把已生成報表當原始電路圖。
4. 必要資料旁確認角色；錯誤會阻擋「開始比對」並顯示缺漏。需要時展開選用工具，加入規則 YAML、Net 電壓 CSV、電源域 CSV、I²C Block Diagram 對照 CSV、IC Datasheet PDF。
5. 按「開始比對」，等待提示或取消作業。已有結果時按鈕變成「重新比對」。Datasheet 是額外判讀資料，不能替代電路圖 PDF。

每版選入最多 1000 份（含被略過項目）、單檔 64 MiB、總計 128 MiB；送引擎的 A＋B＋進階設定＋Datasheet 又共同受 1000 份／128 MiB 限制，worker 亦計入位址庫文字。不要以「每版通過」推論合計一定能執行。

來源：`src/components/comparison/ComparisonWorkspace.tsx`、`ComparisonInputs.tsx`、`files.ts`、`public/comparison/autocheck.worker.js`。

### 4.2 查結果、審查回覆與下載

「比對檢查」與「審查追蹤」共用結果表：元件、BOM 差異、連線差異、DRC、電容耐壓、BOM 檢查、線路規則、I²C 等類別。`CHANGE` 是改版差異、`NEW` 是新版新增規則問題、`EXISTING` 是舊版既有問題，另有 ERROR／WARN／INFO 嚴重度。

結果可按搜尋、狀態、負責人、嚴重度、類別、線路圖頁碼篩選，每頁 50 筆；條件寫到 URL 並用 chip 顯示。按「檢視」看 RefDes、Net、Pin、詳細說明與「看圖」，後者開新版標註 PDF 的對應位置，前提是該標註報表成功產生。

回覆填處置（修改／刻意設計／誤報／待討論／N/A）、負責人、預計版次與備註，再按「儲存回覆」。系統加上日期與欄位前後值歷程；明細顯示最近 20 筆修改。現行程式允許空白處置，但「已回覆」只計處置非空者；如果要讓狀態顯示已回覆，必須填處置。

展開「報表與完整資料」下載成功產出的報表。Excel 的「下載（含回覆）」把目前系統回覆填入追蹤表；沒有將外部 Excel 回覆重新匯入的流程。輸出可能含 PDF、標註新版線路圖、Excel、JSON、電容／電壓待填／電源域／I²C CSV、A/B circuit TXT、Power Tree／I²C HTML 及標註 JSON。

引擎主要對 B 做規則檢查並與 A 同類結果比較。請讀「解析與輸出提示」：局部檢查可 skipped，個別報表失敗時其他報表可能仍保留。作業完成、問題數為零、所有檢查成功是三種不同結果，不能互相替代。

來源：`ComparisonResults.tsx`、`filters.ts`、`ComparisonWorkspace.tsx`、`public/comparison/browser_bridge.py`、`public/comparison/engine/autocheck/pipeline.py`。

### 4.3 Power Tree、I²C Map 與位址庫

Power Tree 依 pin 與電阻網路推導電源上下游；未知來源仍留在報表。I²C Map 依 netlist 與位址規則推導 bus、mux、strap 與位址。圖表可水平捲動、50%～300% 縮放及重設；產物提供時可切詳細圖／簡圖、顯示 converter 內部 net、點頁碼節點看線路圖、下載 HTML。無 I²C 圖要檢查 SDA／SCL pin 名稱、規則及解析提示；不代表硬體沒有 I²C。

「位址庫」可搜尋並篩選已驗證／待核對。新增資料時：

1. 展開整批 Datasheet 工具，選 PDF 或資料夾，可累加、移除、清空，非 PDF 會略過。
2. 「批次產生候選規則」逐份擷取文字／表格；失敗可重試。單份上限 64 MiB、最多 1000 份，逐份處理不套同一次比對的 128 MiB 合計限制。
3. 選待核對的 Datasheet，編輯規則名稱、適用 IC 料號規則與候選 YAML，對照旁邊 PDF 原文。圖片表格或未找到位址列可能要手填，沒有通用 OCR 正確率保證。
4. 勾已對照 PDF、填簽核人，按「簽核並儲存」。候選在當頁記憶體，未簽核離開前不能視為已保存。
5. 也可直接匯入／編輯使用者 YAML（最大 2 MiB），按「驗證並儲存」；匯入檔案僅載入編輯器，尚未啟用。

使用者已簽核規則優先於內建；未簽核內容不能遮蔽已驗證內建表。工程規則與圖表推導都需要人工核對，不能取代實際硬體量測與設計審查。

來源：`ComparisonCharts.tsx`、`ComparisonLibrary.tsx`、`DatasheetFiles.tsx`、`datasheetSelection.ts`、`public/comparison/engine/autocheck/i2c_lib.py`、`checks/i2c_map.py`。

### 4.4 本機保存、換機與意見收集

比對與回覆存於 IndexedDB `work-platform:comparison:v1` 的 `sessions`，依 `[accountId,id]` 分隔；使用者位址庫另在 `preferences` 按帳號保存。相同帳號換瀏覽器或電腦不會自動同步。相同比對名稱＋A 版名＋B 版名重新比對會更新該結果與報表，保留原 replies/history；需要保留舊版結果先匯出。

換機步驟：先在「已儲存的比對」逐份「匯出備份」取得 `.autocheck.zip`，另匯出 `i2c_devices_user.yaml`，並自行保存原始 A/B 工程檔。到新機登入後匯入 ZIP，再到位址庫匯入 YAML 並「驗證並儲存」。ZIP 含 session、結果、回覆、歷程與報表，不含原始 A/B netlist、BOM、DSN；成功產生的標註 B PDF 可作為報表帶走。ZIP session 可能含當時 YAML snapshot，但匯入不會把它啟用為目前位址庫。

同 ID 匯入會另存帶「匯入」字樣的結果，不覆蓋或合併回覆。備份 ZIP 限 128 MiB、解壓總計 256 MiB、最多 1000 項，不支援加密、分割或 ZIP64。「新比對」清目前輸入，不刪已存紀錄。

worker 在瀏覽器跑 Pyodide 0.29.3，首次需從 jsDelivr 取得執行環境，並載入 openpyxl、olefile、reportlab、pypdf、pdfminer.six、charset-normalizer、pdfplumber。引擎依站內 manifest 載入並驗 SHA-256；輸入放在 worker 記憶體檔案系統，作業結束清暫存。單次超過 10 分鐘會終止 worker，因此不能承諾完整離線或所有大型檔案可完成。

「意見收集」是另一條雲端流程：一般使用者新增／查自己的回報，管理員有回報管理。填標題、說明、分類，可擷取畫面、選圖片或貼上，最多五張、每張 10 MB，PNG/JPG/WebP。送出寫 `comparison_feedback` 與 Storage，連帶記錄頁籤、比對名稱、版本、瀏覽器／視窗等上下文；截圖可能含工程內容。管理員可改未處理／處理中／已修正、填備註、儲存處理結果與匯出 ZIP。不能把「比對本體留本機」寫成整個 AutoCheck 完全不上傳資料。

來源：`storage.ts`、`backup.ts`、`runtime.ts`、`ComparisonWorkspace.tsx`、`feedback/ComparisonFeedback.tsx`、`feedback/supabaseAdapter.ts`。

## 5. 料號申請：以主料群組管理替代料與處理紀錄

### 5.1 匯入與切換 BOM

前提是具編輯權、協作狀態為遠端可用，且完整資料已載入。畫面可能先顯示部分資料、背景補齊；此時能看資料不代表可安全上傳／新增／修改。

1. 開「上傳說明」，下載／參照既有範本與欄位，再「上傳 BOM」。可選多個活頁簿，系統各自建立／更新 BOM 工作集。
2. 解析器會在活頁簿中找可辨識欄位、選擇最符合的工作表，不是把所有工作表無條件合併。至少要有料名，及 MPN、內部料號、Ref Des、群組欄其中一項。
3. 匯入後確認來源檔名、工作表、筆數與群組是否符合預期，用「切換 BOM」管理不同清單。同來源識別的重匯會走既有工作集合併／更新邏輯，不是每次保證建立完全獨立副本。
4. 大表格背景同步時等待「完整資料」到齊；同步出錯按重試／載入最新，不要用本機殘留畫面推論雲端已成功。

解析上限為 100,000 列，用來避免格式填滿整張 Excel 導致無界處理。群組邏輯會使用來源群組、Ref Des、料名與藍色群組起始等資訊，實際要以範本和匯入結果核對，勿任意改欄名或群組色彩後假定含義不變。

來源：`src/components/material-requests/MaterialRequestPage.tsx`、`materialRequestUtils.ts`、`materialBomStorage.ts`。

### 5.2 查詢、維護與追蹤

桌面是一行一個主料，展開看廠商替代料；行動版以「料號快查」卡片提供主要資訊。可搜料名、REF DES、MPN、內部料號、狀態追蹤，也可用「完全無料」等領域條件；欄位條件共同採 AND。作用中條件顯示 chip，可個別清除或全部清除，不會刪 BOM。

「新增料件／資料更新」表單分為電路與原理圖資訊、廠商料號與申請資訊。可記錄群組、REF DES、名稱、Qty、MPN、廠商、內部料號、規格、Symbol／Footprint、虛擬替代料、申請單號／URL、sourcing 狀態與備註。Qty 是單一產品用量，不得為負。新增替代料時應維持正確群組，避免誤增另一個主料。

「狀態追蹤」記錄處理狀態、備註、申請資訊與圖片歷程，並保存操作者和時間。頁數進度另外管理總頁數、當前頁、各頁完成／待處理／完成但缺件及備註，供逐頁核對 BOM；它不會替你判定所有料號已取得。

「我的標記」屬個人使用便利條件；欄寬、部分排序／畫面偏好與共用 BOM 內容不能混為一談。多人在線與正在編輯提示是協作資訊，並不是無衝突寫入保證。單筆寫入核對 `updated_at`；若他人已更新會阻止覆蓋、保留目前表單，需讀最新資料後比較再送。

資料主要在 `material_bom_workspaces`、`material_bom_records`，偏好／頁數／配色使用 `ui_table_preferences`；本機 IndexedDB 有呈現快取及復原用途。雲端不可用時不應把編輯結果自動宣稱為共用成功，畫面會限制寫入。資料／圖片歷程的保存方式以 `materialBomStorage.ts` 與匯出工具為準，不能只備份最上層主料摘要。

### 5.3 匯出與刪除

用「匯出主管報表」選範圍與格式：Excel、HTML 或 ZIP，應先看匯出快照與範圍，確認是目前篩選或完整資料。報表可帶入主料、替代料與追蹤圖片等資訊；離線交付前實際開啟下載檔核對。

刪除 BOM 為永久刪除工作集；「全部清除」只清條件，兩者不能做成相似操作。「套用配色／重設欄寬」是 UI 操作，不代表修改料號內容。

來源：`MaterialRequestPage.tsx`、`materialRequestExport.ts`、`materialRequestAudit.ts`、`materialBomStorage.ts`、`useMaterialBomPresence.ts`。

## 6. Data-center：機房配置與每日工作回報

### 6.1 專案、站點與配置

前提是具 Data-center 檢視／`data` 編輯權；要共用保存還需要正式登入及共用專案資料表可用。實際導航有「機房總覽／每日工作回報／專案與站點／2D 配置規劃／機櫃與設備／模型庫／場地與通道」；部分切換場景，部分開管理視窗或手機側欄，不是每一個名稱都對應獨立資料表頁。

1. 先在「專案與站點」選共用專案及站點。新增專案時使用目前配置建立文件，可改名稱、分類、說明並預覽、開啟或封存；封存不等於永久刪除。
2. 在 2D／3D 選機櫃，以「機櫃與設備」調整 L10 數量、U 位及設備；配置應符合場地、U 位容量與模型相容檢查。
3. 到「模型庫」選已知模型、核對尺寸、校正並套用，也可依模型新增機櫃。至少需保留一座機櫃與一個共用專案。
4. 「場地與通道」調地板尺寸、通道及電源等配置；回總覽檢查相對位置。場景提供全景、俯視、正視、聚焦機櫃、近距離等視角與標籤開關。
5. 完成變更後看同步徽章，確認已同步，再離開或在其他裝置開啟。

配置資料 `sites/facilityPlans/modelOverrides` 先存本機；共用專案約 1.2 秒 debounce 寫入 `data_center_projects`，並以 `updated_at` 比版本。衝突時保留本機草稿、停止覆蓋，需選擇如何處理；「重新讀取」可能以最新共用版取代當前草稿，程式會確認並保留讀取前 recovery。徽章的已同步、同步中、載入中、同步異常、本機保護模式代表不同狀態。

此頁是配置與模型視覺化。場景單位為公尺、模型資料為毫米、Y 軸朝上；U 位／幾何檢查不能當作真實供電、散熱模擬、環境感測或工程認證計算。主場景可能使用輕量／暫代模型，L10 詳情才載入完整 CAD；目視比例正確也不代表設備精度已校驗。

來源：`src/components/data-center/DeploymentPlanningCenter.tsx`、`useSharedDataCenterProjects.ts`、相關模型與配置核心檔。

### 6.2 模型匯入與換機限制

模型庫可選 GLB／STP／STEP，STEP 在背景轉成 GLB。現行新匯入的模型用 `URL.createObjectURL` 加入記憶體；序列化模型覆寫時跳過非內建模型 ID，因此新模型原始檔／二進位目前沒有永久保存或跨裝置共享保證。重新整理或離開工作區後可能需重新匯入。

可保存／同步的是配置與既有模型 metadata overrides，不能把共用專案同步成功解讀為任意模型檔都已上雲。操作時保留原始 GLB／STEP 和尺寸校正資訊；換機後重新匯入並核對套用關係。此流程與 PCB 的模型資產 IndexedDB／專用遠端 RPC 不同，不可共用錯誤的保存假設。

來源：`DeploymentPlanningCenter.tsx` 的模型匯入處理、`src/components/data-center/modelCatalog.mjs` 的 `serializeModelCatalogOverrides`。

### 6.3 每日工作回報

這是依專案保存的獨立回報，不是機櫃配置自動生成的進度。選日期、站點、進行中／待協助／已完成，填今日完成、下一步與需要協助，按「提交回報」；修改本人既有回報按「儲存修改」。草稿本機暫存不等於已送雲端。

日期不可晚於台北今天；同一天同站點重複時應改既有記錄。只能編輯本人回報。清單載最近 500 筆，可依搜尋、站點、狀態、回報人與日期篩選，因此找不到很舊的回報不應直接推論已刪除。

來源：`src/components/data-center/DataCenterDailyReports.tsx`、`dailyWorkReports.ts`。

## 7. PCB Designer：專案、元件、板形與 3D 安裝

### 7.1 建立專案與匯入元件

前提是具 `pcb-designer` 檢視／編輯權，且目前專案沒有被他人 lease 或文件鎖限制。左側「專案／模板中心／元件庫」，右側「板設定／選取物」；頁首顯示名稱、版本、草稿／審核中／已核准、儲存狀態與協作者。

1. 從「專案」新增，或在「模板中心」以模板另建專案。可複製、建立新版、改名／設定、預覽；刪除需確認對象。
2. 「元件庫」選既有元件，或匯入 JSON／CSV／XLSX／STP／STEP。表格與 STEP 上限 50 MB，STEP 另受網格複雜度限制，須解析、預覽、確認後才加入。
3. 從元件庫放置到板上，選取後設定位號、尺寸、旋轉與 Top／Bottom 安裝面。STEP 也可指派到已選元件。
4. 用選取／平移／量測／禁制區工具、對齊均分、復原／重做與顯示層控制整理板面，操作後按「儲存」。

專案 JSON 匯入先驗證／預覽，確認後建立新專案，不直接覆蓋當前文件。匯出有目前專案 JSON、BOM CSV、BOM XLSX、PNG，PNG 可選含網格。`schemaVersion:1` JSON 只含單一專案資料，不封裝 STEP 二進位；搬機或封存精確模型時必須另外保存原始模型資產。

來源：`src/components/pcb-designer/PcbDesignerWorkspace.tsx`、`PcbLeftRail.tsx`、`PcbToolbar.tsx`、`PcbInspector.tsx`、`core/files.ts`、`core/exports.ts`。

### 7.2 板形、挖孔與規則檢查

「板設定」可維護尺寸、網格、顏色及分板。「板形編輯器 · 外框與挖孔」是獨立視窗：可選取／移動、直線鋼筆、曲線鋼筆、矩形、圓形、孔洞、節點微調、復原／重做；按套用才改原板，取消保留原狀。

目前限制最多 16 孔、每輪廓 100 節點；孔洞不能越界、碰板邊或互相重疊。DXF 先預覽，再選內部封閉輪廓是否轉孔。孔必須是真正幾何挖空，並同步 2D、WebGL、相容 3D、預覽、儲存與縮放；不能用背景色圖案代替。

完成後查看設計規則檢查及重疊／越界提示。禁制區、元件 keepout、元件鎖／文件鎖是不同設定；多選若包含鎖定元件，群組移動／刪除可能整批拒絕，先處理鎖而不是只看未鎖定部分是否移動。

來源：`PcbBoardOutlineDialog.tsx`、`PcbInspector.tsx`、`core/boardOutline.ts`、`core/boardCuts.ts`、`core/drc.ts`、`core/editor.ts`、`core/selection.ts`。

### 7.3 3D 安裝與接腳

切到 3D，可直接「看頂面 Top」「看底面 Bottom」與重設；左鍵旋轉、右鍵平移、滾輪縮放。Bottom 應和 Top 一樣可自由旋轉、具底面照明，背景網格／陰影不能遮住底面，3D HTML 標籤／控制不能浮到 Dialog 之上。

選元件分別核對三個設定：模型朝向 XYZ、PCB 安裝面、Pin 插入深度。它們彼此獨立並隨元件保存；插入深度未設定時維持 0，正值在 Top／Bottom 都往 PCB 內移動。STEP 最低點不一定是本體安裝面，插板式元件必須依實際 pin 長度調整，不能由料名猜長度，也不能拉伸模型或接腳來消除浮空。

自動示意接腳有厚度上限，但示意模型不是精確封裝；要核對精確外形需 STEP。WebGL 與相容 3D 應共用安裝位移、保留旋轉後比例。實際驗收須包含高元件、旋轉模型、Top／Bottom 插入、孔洞及儲存重開並目視確認；建置或最低點測試通過不能宣稱所有零件安裝正確。

來源：`Pcb3DCanvas.tsx`、`PcbSoftware3DCanvas.tsx`、`PcbInspector.tsx`、`core/modelProjection.ts`、`core/software3d.ts`、專案根目錄 `AGENTS.md`。

### 7.4 儲存、復原與多人鎖

明確按「儲存」或 Ctrl/Cmd+S 才提交專案，不是任意編輯都自動存上雲。未存修改可形成本機 recovery 草稿並有離開提醒；手動儲存先保本機，再確認雲端成功才標已同步。網路失敗要重按並檢查結果。

有資料庫 UUID 的正式帳號才建立遠端 client；本機帳號只存瀏覽器。共用專案／元件庫走 RPC，模板按帳號範圍；STEP 資產另存在 IndexedDB 並透過專用模型 RPC 同步，遠端資產寫失敗時不應假裝模型已成功套用。

共用專案使用約 30 秒編輯 lease、8 秒 heartbeat；他人編輯時進即時檢視，不能保存。文件鎖及單元件鎖另加限制。舊部署缺鎖 RPC 有相容 fallback，因此不能承諾未確認 migrations 的部署也擁有同等多人鎖保護。協作者在線提示和取得編輯 lease 是兩件事。

來源：`hooks/usePcbPersistence.ts`、`hooks/usePcbProjectLock.ts`、`hooks/usePcbWorkspace.ts`、`core/accountRemoteSync.ts`、`core/modelAssets.ts`。

## 8. 績效考核：自評、主管評分與資料保護

### 8.1 身分與工作入口

導航有「系統說明與政策／員工自評／主管評分（主管專用）／部門績效總覽／考核紀錄／組織架構」，依資格隱藏或導轉。操作前由管理員把登入帳號放入績效組織，確認團隊、職等及主管歸屬。

員工編輯自己的自評，不因此取得他人考核。主管需同時具績效編輯權、管理員指定的績效主管身分，以及組織內課長／部長 manager 歸屬；全站管理員也不是自動可讀全部考核。課長評直屬職員，部長評直屬課長並審課彙整，代理課由部長直接評。

來源：`src/components/performance/PerformanceAppraisalPage.tsx`、`PerformanceFlowGuide.tsx`、`PerformanceOrganization.tsx`、`src/hooks/usePermissions.ts`。

### 8.2 員工自評與送出

1. 在「員工自評」確認人員、期間與基本資訊，再按 IDP、OKR、KPI 逐筆新增 STAR 實績。
2. 填情境、任務、行動、結果與自評，加入 HTTPS 證明連結及圖片佐證；附件要等處理完成，依畫面驗證補足欄位。
3. 先「儲存草稿」可繼續修改；確認內容後按「送出自評」，等伺服器成功回執。
4. 送出後等待直屬主管。被退回時讀整體回覆、逐筆補充要求與附件，補充後重新送出；完成 approved 後員工不再直接編輯。

主要狀態為 draft 草稿、submitted 自評已送出、approved 主管完成；退回會回到可補充的 in-progress 流程並通知員工。資料不是按一次送出就永遠成功：現行 RPC 核對 request ID、內容 hash、預期版本與回執，失敗時輸入保留，須依提示重試或核對最新狀態。

正式雲端考核不把內容放 localStorage；未提交編輯用記憶體及同分頁 sessionStorage 暫存，配額不足時可能只剩記憶體，成功保存／送出後清暫存。示範模式才可用 localStorage 保存示範資料，不能把示範狀態當正式考核。關閉分頁前先明確儲存草稿。

來源：`AssessmentEditor.tsx`、`assessmentDrafts.mjs`、`assessmentPersistence.mjs`、`assessmentRefresh.mjs`、`rd2Assessment.mjs`、`PerformanceAppraisalPage.tsx`。

### 8.3 主管評分、退回與部門成果

在「主管評分」選本人可見的受評者，讀取自評，完成各類評分／評語與七題當責量表。需要補件時可勾指定實績、逐筆說明原因，填整體回覆後退回；完整評核後送出主管評分。

員工看得見主管整體回覆、工作指示、逐筆補充要求及附件；私密評分與類別評語不直接顯示給員工。保存自評草稿只更新員工欄位，不能重建成整筆覆寫而清掉被遮蔽的主管資料。內容使用既有 protected text 欄位中的 `RD2_SELF_V1`／`RD2_MANAGER_V1` envelope，讀取前重新取得受 RLS 限制的 manifest，詳情／編輯／明確匯出才載入全文。

「部門績效總覽」另有課長草稿／送交本課成果、部長確認或退回的流程。部門成果送交不等於再次提交每個人的自評或主管評分，兩套狀態要分開核對。

來源：`PerformanceSectionReports.tsx`、`sectionReportPersistence.mjs`、`sectionReportFeedback.mjs`、`DepartmentAssessments.tsx`、`ReviewDetail.tsx`、`rd2Assessment.mjs`。

### 8.4 隱私鎖、匯出與自評備份

主管可為本組設定保護密碼（至少八字元、最多 72 bytes）；解鎖只對目前登入有效、30 分鐘後重鎖，也可「立即鎖定」。解鎖不擴張組織權限，員工仍能處理自己自評。五次錯誤後等待五分鐘；只有設定者憑原密碼改／移除，管理員沒有通用密碼重設入口。重建時不可自行新增後門解除既有保護。

員工可匯出自己 XLSX／HTML／完整 ZIP 或複製自評文字；主管選可見人員後可匯出 XLSX／HTML／ZIP，紀錄有 CSV。一般主管匯出排除退回紀錄、原因與退回附件，不能稱所有私密歷程的完整備份。

帳號選單另有「我的自評備份」：成功送出自評建立版本，最近 50 筆可查看、下載 JSON；只含本人自評、實績與附件，不含主管評分／回饋。現行沒有從備份 JSON 匯入／還原的操作入口，下載備份不等於提供一鍵回復。

來源：`PerformancePrivacyPanel.tsx`、`usePerformancePrivacy.ts`、`performanceExport.ts`、`performanceExportArchive.ts`、`MyAssessmentBackupsDialog.tsx`、`supabase/migrations/20260922120000_performance_self_assessment_backups.sql`。

## 9. AI 問答：個人對話、附件與共享提示詞

### 9.1 開始對話與附件

前提是能檢視 `ai-chat`、個人對話雲端初始化成功，並有啟用且設定完整的模型金鑰。後台 API 控制台支援不同 Provider 設定，但現行 AI 問答入口實際只載入有效 Gemini、且 model/base URL 非空的記錄；不要依入口介紹宣稱所有 Provider 都已在此頁開放。

1. 選 API 金鑰與模型，開「建立新對話」或選最近對話。
2. 輸入問題，或上傳／拖放附件，確認附件清單後送出。最多八個附件、單檔 100 MiB；支援 PDF、圖片、CSV、DOC/DOCX、XLS/XLSX、PPTX、TXT 等實作格式，舊 PPT 不等於 PPTX。
3. 讀取／轉換附件完成後送出。圖片可直接交模型判讀；文件依型別擷取或轉換；能選取不代表掃描文件、複雜 Office 內容一定可完整擷取。
4. 模型回覆會以 Markdown／表格與可用圖片顯示；送往模型的對話歷史最多取最近 32 則非錯誤訊息，不能假定每次都帶完整所有歷史。
5. 需要重用常見任務時開「共享提示詞庫」，可搜尋／分類、直接套用或先調整；有相應管理資格者新增、編輯、刪除共享提示詞。

附件會傳給選定 AI 服務；這和檔案庫的長期儲存／權限是不同流程。不要上傳不允許交給外部模型的資料，也不要把 AI 推論當作經核可的工程結論。

### 9.2 維修資料來源、用量與失敗恢復

開啟維修資料來源後先選至少一個維修專案，再問問題。系統透過來源檢索取得可引用資料，回覆可附來源供開啟；沒找到應顯示無可引用來源，檢索失敗則停止此次 AI 查詢，不會默默改成無來源的專案回答。一般問題或附件討論不必強行當作機台資料查詢。

畫面「全員共用 API 額度」按 key＋model 統計本系統請求，包含重試，今日依美國太平洋日期；開頁時定期更新且可手動刷新。顯示的是本系統觀測量，不是供應商官方剩餘額度，也不包括其他網站／同 Google 專案其他使用；token 用量未追蹤。上限來自既有模型設定，實際帳戶額度需另查供應商。

繁忙、逾時與分鐘限制可有限重試／切換其他可用目標，最多三次嘗試；最後實際模型會提示。每日額度、帳務不足、無效金鑰與錯誤請求不是一直重送就會恢復，按畫面訊息等待或交管理員處理。用量紀錄無法確認時也可能停止查詢。

### 9.3 個人對話保存

對話按 owner 保存於 `ai_workspace_conversations`，透過 `sync_ai_workspace_conversations` 同步；現行最多 24 份最近對話。草稿、訊息、模型／key 標籤有同步狀態；錯誤時用「重試對話同步」。初始化未完成／失敗時輸入與附件控制會受限制，避免使用者在無法確認擁有者資料時繼續寫入。

共享提示詞在 `command_library`，與私人對話分開。舊全帳號共用瀏覽器對話 key 會清除，不作跨帳號恢復來源。「清空對話／刪除對話」與建立新對話不同，依畫面確認後操作。

來源：`src/components/api-management/ApiChatWorkspacePage.tsx`、`ApiChatConsole.tsx`、`apiChatPromptHelpers.ts`、`AiQuotaStatus.tsx`、`aiRequestRecovery.ts`、`aiUsageTelemetry.ts`、`maintenanceKnowledge.ts`、`pdfAttachment.ts`、`pptxAttachment.ts`。

## 10. 後台、帳號與全站協作

### 10.1 用戶與權限管理

從帳號選單進後台，依權限顯示「用戶管理／通知與在線／API 管理」。用戶管理可搜尋，依角色、狀態篩選，核准待申請帳號、建立帳號、編輯資料、停用／啟用、設定 workspace 與細部頁面權限。可用角色標記含超級管理員、管理員、主管、工程師與檢視者；角色名稱本身不代表每項工作區與績效審核權都相同。

設定權限後要以目標使用者重新讀取結果核對。前端權限會隨資料庫異動、視窗回到前景等重新驗證，不能只改選單顏色就認定資料寫入有保護。工程師資料另有管理元件／資料表，不應把工程師名冊和登入帳號視為同一列資料。

密碼只能重設，不能讀回明文；建立帳號的初始密碼至少六字元。帳號變更使用與 Auth 同步的後台流程，勿直接改 `system_users` 一個欄位來模擬完整建立／刪除。停用、刪除與重設密碼有不同影響，使用前核對對象。

來源：`src/components/admin/AdminPanel.tsx`、`UserEditDialog.tsx`、`UserPermissionsDialog.tsx`、`authAccountSync.ts`、`src/hooks/usePermissions.ts`。

### 10.2 API 控制台

按「金鑰管理 → API 測試 → API 文件」使用。新增／維護金鑰記錄、Provider、model、base URL、啟用狀態；密鑰預設遮罩，具資格者可顯示／複製、停用或刪除。選指定 key＋model 進測試，確認實際結果；未測試不能因記錄存在就宣稱可用。

API 用量頁按各模型顯示成功、失敗、429、逾時、進行中及追蹤起點。多個 Gemini 模型可共用一筆 key record，Google 配額可能跨 key 共用，系統沒有可靠 Google project 對應，不應把表格數字相加推定官方專案總額。刪除記錄不會替使用者到供應商撤銷原金鑰，需分清兩層管理。

來源：`src/components/api-management/ApiManagementPage.tsx`、`ApiKeyManagement.tsx`、`CreateApiKeyDialog.tsx`、`ApiDataPreview.tsx`、`ApiDocumentation.tsx`。

### 10.3 帳號選單、通知、在線與聊天室

「編輯大頭貼」可選 JPG/PNG/WebP（上限 5 MB），預覽後儲存，導覽與聊天室同步；也可移除。「帳號與密碼」可改顯示名稱、登入帳號，密碼留空可只改前兩者，儲存需目前密碼驗證；新密碼需 6～200 字元且兩次一致。

全站「訊息」入口開聊天室；選成員建立／開啟對話，編輯文字、加入附件後明確送出。可貼上圖片或拖放，當次最多四個附件；圖片上限 12 MB，影片／文件上限 50 MB，支援列表包含圖片、影片、PPT/PPTX、XLS/XLSX、RAR、BRD、STP、MPS 等，仍依實際檔案型別驗證。附件加入後先預覽，可移除再傳。可用的已讀、輸入中、刪除與預覽依訊息狀態顯示。

通知中心可查全部／未讀／已讀與標記已讀；績效退回通知可導回相應考核。管理員「通知與在線」可發公告、查看發送紀錄及協作狀態，發送是對其他使用者可見的正式動作。

在線名冊區分帳號數與連線數；同一帳號多頁／多裝置可有多個連線，顯示目前模組與編輯中狀態。Presence 只有訂閱、發布及首次名冊同步確認後才算 online；連線中／離線／錯誤應提供重試。在線徽章不能當作資料鎖，也不能保證另一人手上沒有尚未儲存的表單。

來源：`src/components/account/PersonalProfileDialog.tsx`、`OwnCredentialsDialog.tsx`、`src/components/collaboration/CollaborationCenter.tsx`、`DirectMessagesPanel.tsx`、`directMessageMedia.mjs`、`AdminCollaborationPanel.tsx`、`src/hooks/useUserPresence.ts`、`useNotificationInbox.ts`。

## 11. 跨工作區共同操作規則

搜尋與篩選是縮小資料結果；專案、編輯器選取、PCB 圖層或 3D 相機是工作上下文／畫布控制。清除資料條件不應改掉後者。一般可篩選清單須依 `AGENTS.md` 和 `docs/filter-ui-audit.md` 維持：

- 篩選列緊接結果上方，共用條件相對順序為搜尋 → 站點 → 狀態 → 負責人，領域條件接後。
- 作用中條件永遠有文字 chip、可個別清除與全部清除；由 KPI／深連結帶入也使用同一 URL 與 UI。
- 空結果保留表頭與欄位骨架；機台清單文字固定為 `目前篩選條件沒有符合的機台`，不加標點。
- 建立、匯入、匯出、PDF、專案管理、批次重置與篩選分區；行動版可收合次要工具，不可藏作用中條件或讓 chip 清除按不到。

看見成功提示後，對重要工作仍需確認對應列表、重新載入或下載結果。編輯中遇專案／帳號切換，現行多處有 scope 防護；重建時需保留防止舊請求寫到新上下文的行為。不要以「按鈕禁用／隱藏」替代後端資料授權。

## 12. 在另一台電腦重建與交付時的操作驗收

下列是應執行的驗收流程，不是本次已完成的測試紀錄：

1. 用一般帳號註冊、核准、登入、登出，確認檢視與編輯帳號看見的入口／操作不同；驗證 URL 不能繞過權限。
2. 於隔離測試專案建流程、機台、測項與問題，確認 Blocked、工時計時、列表／看板與儀表板一致；切專案後不殘留上一專案資料。
3. 在隔離檔案空間驗證資料夾階層、同名衝突、多檔部分失敗、重試、斷線續傳、下載 hash、Excel 儲存與重新開啟；使用自己的可刪測試檔，不借正式工程資料做破壞測試。
4. AutoCheck 用代表性 A/B 樣本跑比對，檢查輸出提示、回覆、標註 PDF、Power Tree、I²C、ZIP 與 YAML 搬機；確認工程原檔另有保存。
5. 料號用範本與真實結構的去識別化大表驗證主料／替代料、重匯、圖片追蹤、衝突與報表；等待完整同步再寫入。
6. PCB、資料中心與績效依各自章節驗證本機／雲端邊界，不能只看首頁示意圖。
7. AI 用可交外部服務的測試文件驗證附件、來源引用、用量、錯誤與對話同步；聊天室測試跨帳號收發並核對附件權限。
8. 桌面與手機寬度檢查導覽、長標題、長表格、空結果、Dialog、鍵盤操作、橫向溢位與 console；iPhone 實機／安裝版 PWA 未實測前不得宣稱完成。

保存使用到的版本、測試資料範圍與結果。建置通過只能證明程式可打包，不能代替正式資料、模型安裝、瀏覽器互動或工程判讀的驗證。
