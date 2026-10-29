> 集中副本；原始路徑：`docs/系統架構與資料邏輯.md`；程式參考基準：`06c686951b17afa920cf325ddfec9114590aeee0`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# 系統架構與資料邏輯

這份文件供另一台電腦上的開發者或 AI 理解、重建相似網站使用。它記錄 2026-10-20 本機 `station-status-hub` 程式快照 `c6629250` 的架構與資料契約；程式、migration 檔與測試檔是依據，並未查詢正式資料庫、Storage、使用者帳號或目前部署版本。文件不包含憑證、資料庫內容或原始工程檔。

若要延續原系統，閱讀 [架構指南](./docs__architecture.md) 及各領域原始碼；若要做新網站，沿用下面的責任邊界與失敗語意，再自行設定新服務。複製 Markdown 或前端原始碼，不會複製 Supabase 資料、Storage 物件、Auth 帳號或瀏覽器本機資料。

## 1. 執行架構與入口

本專案是 React／TypeScript 的 Vite 單頁應用程式。`main.tsx` 建立 React root 與最外層錯誤邊界；`App.tsx` 組裝登入、權限及資料 provider；`pages/Index.tsx` 提供共用 shell，再依 URL 的 `workspace`／`module` 分派大型 lazy workspace。

```text
main.tsx → AppRuntimeBoundary → App.tsx
  QueryClientProvider
    UserProvider
      TooltipProvider / Toaster
        ApplicationSessionGate
          初始化 → 載入畫面；未登入／需重新驗證 → LoginPage
          已登入 → UserPresenceProvider
                    PermissionsProvider
                      TestProjectProvider
                        UnifiedDataProvider
                          HashRouter → Index / test-tracker / api-management / NotFound
```

登入閘門放在資料 provider 外側，避免未登入時掛載工作資料。全站 React Query 預設 `staleTime = 30 秒`、關閉視窗聚焦時自動重抓；各領域仍可能使用自己的 state、讀取期限與重連策略。不能因此推論所有資料都透過 React Query 保存。

來源：[main.tsx](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/main.tsx)、[App.tsx](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/App.tsx)、[Index.tsx](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/pages/Index.tsx)、[useUnifiedData.ts](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/hooks/useUnifiedData.ts)。

## 2. 九個畫面工作區、七組權限工作區

畫面導覽的 WorkspaceId 與權限模型的 WorkspaceId 是兩個不同集合。新增或移植功能時，必須同時核對畫面分派、入口可見性、render guard、權限設定與資料庫規則。

| 畫面 workspace | module／入口 | 權限歸屬與主要資料邊界 |
| --- | --- | --- |
| `station-status` | dashboard、test-tracker、flow-info、monitor、issues、tools | 維修中心；共用目前測試專案與流程版本 |
| `file-uploads` | test-plan | 獨立「檔案上傳」入口，繼承維修中心的 test-plan 權限；資料夾／空間另有 scope |
| `comparison` | comparison | 「比對系統／AutoCheck」入口與 guard 使用 ai-chat 授權；運算結果保存在本機 |
| `material-requests` | material-requests | 獨立料號／BOM 工作區；舊頁面 permission prefix 為 data_center |
| `data-center` | data／data-center | 共用部署規劃文件與每日工作報告 |
| `pcb-designer` | pcb-designer | 共用 PCB 專案、元件庫、模型與專案編輯鎖 |
| `user-management` | users、collaboration、api-management | 帳號、公告、權限、API 金鑰；內頁權限仍各自判斷 |
| `ai-chat` | ai-chat | 顯示名稱「AI 問答」；沿用 comparison permission prefix |
| `performance` | performance（可只傳 workspace） | 考核資料另受本人、組織層級、主管指派與隱私授權限制 |

七組權限工作區為 `station-status`、`material-requests`、`data-center`、`pcb-designer`、`user-management`、`ai-chat`、`performance`，各有 none／view／edit。`system_users.permissions.workspaceAccess` 保存工作區層級，`pagePermissions` 與 `user_page_permissions` 保存細頁授權；舊資料有相容映射。明確設定 none 必須能撤回權限，不能被舊 permission 字串重新授權。

維修中心與後台還要符合細頁權限；已配置的單頁工作區以工作區層級授權。test-plan 是維修中心的繼承子頁。平台 admin／super_admin 在一般前端權限判斷有管理權限，但績效內容有額外伺服器限制，不能套用通用管理員繞過規則。

來源：[workspacePermissions.ts](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/lib/workspacePermissions.ts)、[usePermissions.ts](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/hooks/usePermissions.ts)、[Index.tsx](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/pages/Index.tsx)、[明確撤權 migration](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/supabase/migrations/20261002160000_enforce_explicit_permission_revocation.sql)、[權限表邊界 migration](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/supabase/migrations/20261003075222_close_permission_table_boundary.sql)。

## 3. 登入身分與權限信任邊界

### 3.1 兩種 ID 不能混用

| 身分 | 用途 |
| --- | --- |
| Supabase Auth UID／`auth.uid()` | JWT、Auth session、伺服器驗證登入身分 |
| `workspace.system_users.id`／前端 `user.userId` | 應用程式帳號、owner、employee、uploaded_by、權限及協作識別 |
| `system_users.auth_user_id` | 上述兩者的持久映射；不要假設值相同 |

`current_system_user_id()` 由 `auth.uid()` 查出 active 系統帳號。新功能應在伺服器由此映射取得操作者，並驗證傳入 owner／employee 是否一致，不能信任瀏覽器傳來的 `userId`、角色或 JSON 權限。

realtime v2 開啟時，登入呼叫 `account-login` Edge Function，驗證系統帳號並建立／同步 Auth 映射，回傳 session 後由前端 `setSession()` 接續。使用者名稱會去空白並轉小寫，密碼保持原字串。v2 服務錯誤不會回退為只有前端身分的半登入；只有 flag 明確關閉時才保留 legacy `authenticate_user` 路徑。開發 demo 是另一條 DEV 路徑，不代表正式權限。

### 3.2 Session、停權與清除

Auth client 使用目前分頁的 `sessionStorage`；每個 runtime 有隔離的 auth storage key，普通重新整理會搬移該分頁 session。它不是跨電腦登入資料，也不能以 localStorage 內的使用者 JSON 代替驗證。

初始化先取 session，再透過 `get_current_system_user` 取得伺服器 profile；相容 fallback 需先呼叫 `auth.getUser()` 驗證，才使用伺服器回傳的 app_metadata。`getSession()` 中來自瀏覽器儲存的 user 物件不是授權依據。session bootstrap 有 8 秒期限，Auth lock 亦有期限，避免卡住整個登入畫面；這些期限沒有套到長時間檔案上傳。

`usePermissions` 讀取目前帳號的 status、role、permissions；失敗時清空權限。帳號身分改變會使舊請求失效，避免舊帳號回應覆蓋新帳號。它在聚焦／可見性恢復、權限事件及 realtime 更新時重新確認。`UserContext` 收到帳號不再 active 的 realtime 更新時登出；伺服器 active 檢查仍是實際資料邊界，不能只依賴事件即時到達。

登出清除目前使用者、session 版本並 local signOut，同時發出 `station-user-changed`。依帳號隔離的上傳重試引用會跟著清除；這不等於刪除全部 IndexedDB、專案草稿或業務資料。不得把清空全站瀏覽器儲存當成一般登入修復。

來源：[UserContext.tsx](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/auth/UserContext.tsx)、[client.ts](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/integrations/supabase/client.ts)、[authLockPolicy.mjs](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/integrations/supabase/authLockPolicy.mjs)、[account-login](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/supabase/functions/account-login/index.ts)、[realtime 身分 migration](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/supabase/migrations/20260729120000_realtime_collaboration_v2.sql)。

## 4. Supabase schema、RLS 與 RPC

唯一前端 client 預設 schema 是 `workspace`；可由 `VITE_SUPABASE_SCHEMA` 覆寫。URL 與 anon／publishable key 由環境注入，文件與移轉包只需保存變數名稱。`service_role` 及 provider 密鑰不能由此交接文件攜帶。

早期 migration 使用 `public`，後續將應用程式表與 RPC 移至 `workspace`；Auth、Storage、Realtime 的管理 schema 不隨應用資料搬移。`types.ts` 目前用 `workspace: BaseDatabase["public"]` 對映型別。這是 TypeScript 描述，不表示兩個 schema 的正式資料相同；部分新功能也使用窄型別 adapter 動態呼叫 RPC，不能只看生成型別就判定資料庫物件不存在。

授權有三層，缺一不可：前端 guard／按鈕控制可操作性；schema/table/function GRANT 決定 API 能否存取物件；RLS、RPC 內操作者與業務檢查決定可存取哪些紀錄及狀態。`SECURITY DEFINER` RPC 必須自行驗證 active Auth 映射、工作區及目標範圍，並限制 EXECUTE；不能因為它叫 RPC 就視為已安全。

帳號與權限管理經過 `set_user_access_permissions`、管理 profile RPC／Edge Function 等既有入口；`20261003075222_close_permission_table_boundary.sql` 收緊表的直接寫入。重建新系統要保留原子更新 workspaceAccess／pagePermissions 的語意，不能只改 UI 或直接 update 一半資料。

migration 是「程式要求的資料庫變更紀錄」，不是「目前正式環境已套用」的證明。應依 [正式 migration 操作手冊](./docs__supabase-production-migration-runbook.md) 檢查目標、歷史與最小必要物件；不要對既有正式資料庫 reset、重播整段歷史、臨時 repair history 或自創替代 RPC。靜態 Pages 部署不會自動套用 SQL。

來源：[client.ts](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/integrations/supabase/client.ts)、[types.ts](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/integrations/supabase/types.ts)、[schema 封存 migration](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/supabase/migrations/20260822120000_archive_workspace_schema.sql)、[敏感存取修復 migration](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/supabase/migrations/20260824120000_repair_workspace_schema_and_sensitive_access.sql)。

## 5. 資料實體與領域邊界

以下是目前程式實際使用的資料族群，非逐欄 SQL dump；欄位、外鍵與最新政策仍以對應 source／migration 為準。

| 領域 | 主要實體／關係 | 真實保存位置 |
| --- | --- | --- |
| 帳號與權限 | system_users → user_page_permissions；Auth UID 另映射 | Supabase workspace＋Auth |
| 測試專案 | test_projects → test_systems；project 指向 active_flow_version_id | Supabase workspace |
| 流程與進度 | test_flow_versions → test_flow_stations → test_flow_items；test_progress 連 project／system／station／item | Supabase workspace |
| 維修與知識 | issues、issue_attachments、station_contents、metadata 值、工具／程式／指令關聯 | Supabase workspace＋對應附件 storage |
| 工程檔案 | test_plan_spaces → test_plan_folders／test_plan_files；space 可有 project_id 或 global | metadata 在 workspace，binary 在 test-plan-files bucket |
| 料號／BOM | material_bom_workspaces → material_bom_records；資料列 data JSON、row order、version；UI preferences、audit／export log 分開 | Supabase；IndexedDB 作呈現／復原快取 |
| Data Center | data_center_projects.document（sites、facilityPlans、modelOverrides）；data_center_work_reports 連 project 與 author | 共用文件／日報在 Supabase；新匯入模型 binary 另見下節 |
| PCB | project、board、components、keepouts、measurements、templates、library、modelAssets、刪除標記與 project lock | 本機草稿＋共用 RPC；模型有 IndexedDB 及模型 RPC |
| 績效 | performance_reviews、組織／主管／群組隱私、提交回執、自評版本備份 | Supabase；未送出表單只在分頁保護 |
| AI | ai_workspace_conversations 以 owner＋conversation key 分區；command_library 保存共用提示詞；api_keys 與 usage events | 對話／設定在 Supabase；provider 請求會離開網站 |
| 比對系統 | ComparisonSession、artifacts、review replies／history、library YAML | 帳號分區 IndexedDB；意見回報另走雲端 |
| 協作 | chat_threads／members／messages／attachments、presence、notifications、announcements | Supabase＋受授權的 realtime／Storage |

舊 `projects`／`systems`／`stations` 與目前 `test_projects`／`test_systems`／`test_flow_*` 同時存在於歷史型別，不可按相近名稱合併。各領域的「專案」也不是共用同一個 project id：測試專案、BOM workspace、Data Center project、PCB project、AutoCheck session 各有自己的生命週期與存取規則。

### 5.1 維修、流程版本與機台進度

`TestProjectProvider` 保存可用專案、目前選擇與摘要；URL `project` 與 localStorage 的 active project 是導覽偏好。`UnifiedDataProvider` 依登入帳號、activeProjectId、active flow version 建立讀取 scope，取目前專案的機台、站點、項目、進度及站點內容。切換專案先清空舊 scope，舊非同步回應不得回寫。

流程有草稿／發佈與版本，不能把編輯流程等同改寫所有已開始機台。順序重排、測試狀態與整機完成等關鍵動作使用既有 RPC／資料庫 guard；issue 與 test item 的閉環、未解問題與完成限制都需一起保留。不要只把畫面上的 progress 改成 100%。metadata 的定義與值分開，使用 `save_test_system_metadata` 等入口維持驗證與原子性。

即時增刪改由 row reconciliation 更新目前 state；載入快照期間的事件先保存，訂閱成功及重新連線後重新對帳，並用時間／scope 防止過時事件倒灌。realtime 是更新提示及協作管道，不代替已授權的完整讀取。

來源：[TestProjectProvider](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/test-projects/TestProjectProvider.tsx)、[useUnifiedData](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/hooks/useUnifiedData.ts)、[realtimeRows](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/lib/realtimeRows.ts)、[問題與進度閉環 migration](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/supabase/migrations/20260822180000_test_item_issue_closed_loop.sql)、[完成 guard migration](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/supabase/migrations/20260822214500_enforce_completion_guard_and_summary_scope.sql)、[原子完成 migration](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/supabase/migrations/20260825090000_l10_atomic_completion_and_realtime.sql)。

### 5.2 料號與 BOM

BOM 以 workspace 為單位，metadata 與 records 分表；records 保存原始欄位／供應商／替代料等 JSON，畫面分組不是新的永久資料來源。個別紀錄以 `(workspace_id, record_id, updated_at)` 條件更新；不存在預期版本即視為衝突，不能無條件覆寫其他人的修改。整份匯入／保存是多步工作，不應聲稱它具有單一資料庫交易的原子性。

`materialBomStorage` 有 IndexedDB 呈現快取與舊版復原路徑；只有特定「協作表不存在」錯誤才進 recovery，其他錯誤會傳出。載入到本機復原資料不表示已完成雲端遷移。UI 必須保留 pending remote changes、儲存狀態、衝突與可重試錯誤，audit／export log 也與業務寫入分開檢查。

來源：[MaterialRequestPage](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/material-requests/MaterialRequestPage.tsx)、[materialBomStorage](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/material-requests/materialBomStorage.ts)、[materialRequestAudit](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/material-requests/materialRequestAudit.ts)。

### 5.3 Data Center 與舊 Cabinet

目前工作區入口為 `DeploymentPlanningCenter`。`useSharedDataCenterProjects` 讀寫共用 JSON 文件；更新比對 `updated_at`，採延遲保存。未同步草稿以帳號＋project key 放在 localStorage，並記錄 baseVersion。遠端版本改變且本機仍有修改時，保存草稿、停止自動覆寫並顯示錯誤；不能用最新版雲端內容直接蓋掉未同步編輯。

新匯入 GLB／STEP 在目前程式是 object URL／記憶體模型資產。`serializeModelCatalogOverrides` 只序列化內建 catalog 已知模型的覆寫及刪除標記；新 model id 不會一併序列化。專案同步成功不保證新匯入 binary 在重整或另一台電腦仍存在，原檔必須另行保存。每日報告則由 `dailyWorkReports.ts` 明確讀寫 `data_center_work_reports`。

`src/components/cabinet` 仍含 `cabinet-management-data`、`cabinet-instances`、`l11-cabinet-*` localStorage 邏輯；目前 Index 不直接將它作為 Data Center 入口。這些舊實作不能被記為「目前所有機櫃資料都雲端同步」，更不可在移轉時逕行刪除其本機資料。

來源：[DeploymentPlanningCenter](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/data-center/DeploymentPlanningCenter.tsx)、[useSharedDataCenterProjects](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/data-center/useSharedDataCenterProjects.ts)、[projectDocument](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/data-center/projectDocument.ts)、[modelCatalog](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/data-center/modelCatalog.mjs)、[dailyWorkReports](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/data-center/dailyWorkReports.ts)、[CabinetManagement](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/cabinet/CabinetManagement.tsx)。

### 5.4 PCB canonical record、同步與安裝

PCB 的 `PcbSaveState` 包含專案、模板、元件庫、模型 metadata、pending placements 與刪除標記。project 的 board／components 是 2D、WebGL 與相容 3D 的同一份 canonical 資料；中心座標、rotation、layer、modelAssetId 不應各自在 renderer 維護副本。板形保存 outline／holes／cuts，孔洞必須是真實幾何。

模型 `modelRotation`、安裝面 `layer`、`insertionDepth` 是獨立資料。未設定深度保持 0；正深度在 Top／Bottom 都往板內插入，不得拉伸模型或接腳來修正浮空。STEP 的最低點不等於實際本體安裝面；禁止由元件名稱推測接腳長度或改動舊專案深度。安裝、板孔、底面照明及 renderer 的詳細驗收必須遵守根目錄 `AGENTS.md`。

本機 repository 與 owner／client 分區 recovery 保存編輯；雲端 adapter 優先使用共用 workspace 與鎖定保存 RPC，專案鎖有 client、心跳與租約。merge 依專案版本並保留目前選擇，伺服器 tombstone 防止已刪專案／元件被舊本機副本復活。舊環境有帳號 permissions 快照相容路徑；它不是新系統可略過鎖或授權的理由。

儲存狀態區分 local／saving／synced／unsaved；只有雲端確認才可說同步完成。模型 binary 有獨立 IndexedDB 與 save／load／list model RPC，不可僅匯出 project JSON 後就假設模型必然可攜。

來源：[PCB types](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/pcb-designer/types.ts)、[storage](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/pcb-designer/core/storage.ts)、[remoteSync](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/pcb-designer/core/remoteSync.ts)、[accountRemoteSync](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/pcb-designer/core/accountRemoteSync.ts)、[modelAssets](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/pcb-designer/core/modelAssets.ts)、[PcbDesignerWorkspace](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/pcb-designer/PcbDesignerWorkspace.tsx)。

## 6. 工程檔案：binary、metadata、TUS 與刪除

資料流為「選檔驗證 → 受授權的 storage path → binary 上傳確認 → test_plan_files metadata 確認 → 清除重試標記 → 列表／預覽」。binary 與 metadata 是兩個不同服務的操作，不能合併成一個沒有中間狀態的成功。

空間可關聯測試專案，或為 `project_id = null` 的全域空間；目前有 active 帳號自動供給的固定 personal space。personal 指管理責任，不代表其他有檢視權限的人完全看不到：migration 允許具查看權限者瀏覽使用者空間，修改 personal 內容需 owner 或具管理資格的帳號，並符合 edit 權限。bucket 私有亦不等於 owner 私有；實際邊界在 space／file RLS 與 storage policy。

### 6.1 大小與續傳

程式限制單檔與單批總量各為 `1 GiB = 1,073,741,824 bytes`，一般選檔最多 20 個；整個資料夾保留路徑模式可採不同檔數處理，但總量限制仍存在。資料庫 metadata constraint 亦記錄 1 GiB。新環境還須確認 hosted service、global／bucket cap、網路代理、瀏覽器記憶體及下載／預覽能力，不能由前端常數推導正式環境成功傳過 1 GiB。

正大小檔案使用 TUS，chunk 為 6 MiB；空檔使用一般 upload。resume URL 存在 localStorage 的 `test-plan-tus:` key。重試前 HEAD 需符合 upload length、bucket 與 object metadata，再從伺服器承認的 offset 繼續。最後 PATCH 必須有可信完成結果；HEAD 即使 offset 已等於總長，沒有 `Tus-Complete: 1` 或 `Supabase-Object-Id` 仍不能當作完成，須保留待確認狀態。

原始 File 引用與同一個 scope 的穩定 object path 保存在 module 記憶體／WeakMap；切換工作區可保留重試，登出／換帳號會清除。重新整理後只有 resume URL 並不能還原原始 File。這不是失敗檔案的永久備份或跨電腦恢復機制；原始檔必須由使用者保有。

### 6.2 Metadata 回應不確定與清理佇列

binary 已完成而建立 metadata 回應遺失時，repository 會依 `storage_path` 再查已存在紀錄，確認後才結束重試，避免產生重複 metadata 或誤刪已成功上傳內容。同名檔案／資料夾碰撞也不應無聲覆寫。若伺服器已接收但未能確認，UI 需明確保留不確定性。

刪除 metadata 時 trigger 建立 `test_plan_storage_cleanup_queue`，保存原 uploader `owner_id` 與授權刪除者 `requested_by`。物件實體清理失敗會回傳 `cleanupPending`，列表可反映 metadata 已刪，並由後續載入重試清理；不能說檔案已完全從所有儲存層移除。清理權限不得跨越仍存在的 live file 空間邊界，且不能把任意 storage path 塞進佇列。

來源：[files](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/test-plan/core/files.ts)、[repository](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/test-plan/core/repository.ts)、[supabaseAdapter](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/test-plan/core/supabaseAdapter.ts)、[TestPlanWorkspace](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/test-plan/TestPlanWorkspace.tsx)、[personal space 供給](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/supabase/migrations/20261013104602_user_file_spaces_provisioning.sql)、[cleanup requester](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/supabase/migrations/20261014100800_file_library_cleanup_requester.sql)、[1 GiB constraint](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/supabase/migrations/20261014101555_file_library_one_gib_limit.sql)。

## 7. 績效：RD2、版本與伺服器回執

正式模式以 `performance_reviews` 為真實資料，不採「先改畫面、雲端失敗後聲稱已保存在 localStorage」的舊設計。頁面先載入受 RLS 限制的輕量 manifest／review_index，只有編輯、詳情及明確匯出時才讀完整內容；內容快取在記憶體中，必須仍符合目前授權及 manifest 版本。

自評及主管表單以 `RD2_SELF_V1\n`、`RD2_MANAGER_V1\n` 版本化 JSON envelope 存在既有 `self_feedback`／`manager_feedback` 文字欄位，仍兼容舊純文字。標準定義有自己的 standardsVersion，不應任意扁平化成一張沒有版本的評分表。

自評草稿只更新員工可擁有的欄位，使用 id＋expected updated_at；不得將被遮罩的主管內容回寫蓋掉真實主管評分。自評提交、主管完成、退回補充經 `submit_performance_assessment`：

1. 表單驗證本人／主管身分、組織指派、狀態與來源版本。
2. 相同內容重試使用同一請求 UUID，附 expectedUpdatedAt；內容計算 SHA-256。
3. 伺服器執行狀態轉移與回執／退回通知；自評為 submitted，主管完成為 approved，退回為 in-progress。
4. 前端檢查 review id、status，compact 回執另核對 request id、content hash、updated_at 及分數；退回必須有 notification_id。
5. 確認後才更新畫面成功狀態、清除未送出表單。版本衝突或未確認回應保留輸入並提示重試。

未送出表單由 Map＋目前分頁的 sessionStorage 作保護，帶 source version；成功保存／提交後清除。超過 sessionStorage quota 時可能只剩目前記憶體副本，關閉分頁無法保證復原。正式頁會移除舊 localStorage 雲端考核快取，只有 demo 使用本機示例資料。

一般使用者只處理自己的紀錄；主管需明確指派及合法組織範圍，另有群組保護／解鎖。平台管理員能設定組織，不代表可讀全部考核內容。`performance_self_assessment_backups` 保存本人自評版本，帳戶選單可查看最近版本並下載 JSON；這份備份不含主管資料，不是整個績效系統的資料庫備份。

來源：[PerformanceAppraisalPage](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/performance/PerformanceAppraisalPage.tsx)、[AssessmentEditor](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/performance/AssessmentEditor.tsx)、[rd2Assessment](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/performance/rd2Assessment.mjs)、[assessmentRefresh](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/performance/assessmentRefresh.mjs)、[assessmentPersistence](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/performance/assessmentPersistence.mjs)、[assessmentDrafts](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/performance/assessmentDrafts.mjs)、[提交回執 migration](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/supabase/migrations/20261001190000_reduce_performance_submission_load.sql)、[索引 migration](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/supabase/migrations/20261001203000_add_lightweight_assessment_index.sql)、[自評備份 migration](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/supabase/migrations/20260922120000_performance_self_assessment_backups.sql)。

## 8. AI 問答、API 金鑰與協作

AI 私有對話以 owner 帳號隔離，經 `sync_ai_workspace_conversations` 保存；雲端尚未載入時不能繼續用不明來源的舊對話送出。同步失敗會保留目前工作階段的文字並顯示重試；對話序列化會排除暫時附件 binary，不能把已保存對話視為附件原檔備份。

維修知識查詢會透過受權限限制的 RPC 取得選定範圍內容，建立提供給模型的 context 與可追溯引用。使用者送出的訊息、選定知識內容及附件可能傳給指定 provider；這與 AutoCheck 的本機工程比對不同。

現行 API 實作會在授權瀏覽器中使用 `api_keys.api_key`，由 provider catalog 建立認證 header，再由 `trackedProviderFetch` 直接 `fetch()` provider。遮罩只是 UI 呈現，不能聲稱 provider key 永不抵達瀏覽器。若新網站要求密鑰僅在後端，需另設計代理及其授權、配額與錯誤處理，不能只改文件宣稱已隔離。

每次有 key id 的 provider 嘗試先建立用量事件，建立失敗時請求不送出；完成用量回報失敗不丟掉已取得的 provider 回應。配額、429、逾時與可用模型恢復由既有 recovery policy 處理，不能把用量事件等同 provider 官方帳單。

全站聊天室、私訊、公告及通知為跨工作區能力。private realtime 訂閱前需設定目前 JWT；thread／member／attachment 仍需資料庫及 Storage 授權。訊息清除／刪除、媒體下載與通知 dismissed 是不同狀態，不應只從畫面陣列移除就視為全部永久刪除。

來源：[ApiChatConsole](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/api-management/ApiChatConsole.tsx)、[aiProviderCatalog](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/api-management/aiProviderCatalog.ts)、[aiUsageTelemetry](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/api-management/aiUsageTelemetry.ts)、[AI 私有對話 migration](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/supabase/migrations/20260731210000_private_ai_workspace_conversations.sql)、[useDirectMessages](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/hooks/useDirectMessages.ts)、[useUserPresence](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/hooks/useUserPresence.ts)。

## 9. AutoCheck：本機運算與獨立雲端回報

比對系統在 Web Worker 中執行 Pyodide／Python AutoCheck。瀏覽器仍需載入 runtime、套件與引擎資產；「本機處理」表示 A／B 原始工程資料不在這條比對流程上傳至 Supabase 或 AI，不表示完全不需網路或沒有外部資產請求。

IndexedDB `work-platform:comparison:v1` 的 `sessions` 以 `[accountId, id]` 作 key，`preferences` 按 accountId 保存目前位址庫。session 包含結果、報表二進位、審查回覆、修改歷史與運算時位址庫快照；瀏覽器儲存被封鎖、quota 或格式錯誤會報錯並保留既有資料，不可自動清庫。

ZIP 備份可移轉 session、報表、回覆與歷史，但不含 A／B 原始 netlist／BOM／DSN；原始工程檔需另存。備份內 libraryYaml 是當次快照，匯入 session 不會自動取代目前啟用的位址庫，位址庫應另外匯出／匯入 YAML 並驗證。換電腦、瀏覽器、網站 origin 或清除網站資料，都不會自動帶回這些本機紀錄。

「意見收集」是獨立雲端功能：使用者主動提交的描述、頁面 context 與截圖進入 `workspace.comparison_feedback`／私有 `comparison-feedback` bucket。先建 draft、完成附件再 submit；一般帳號看自己的回報，管理員看到已提交回報並處理／匯出。它不會自動把原始工程輸入與本機 session 全部上傳。

來源：[ComparisonWorkspace](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/comparison/ComparisonWorkspace.tsx)、[storage](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/comparison/storage.ts)、[feedback repository](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/comparison/feedback/repository.ts)、[feedback migration](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/supabase/migrations/20261013113330_comparison_feedback_collection.sql)。

## 10. URL、分享、返回與跨工作區狀態

全站 route 使用 HashRouter，工作區與條件另外使用 `window.location.search` 的 query parameters。分享連結時應保留完整 URL，不能只複製 `#/` 後的內容。測試專案用 `project`，workspace／module 與各列表篩選用明確 query key；它們是可重現的導覽狀態，不是資料本體或授權 token。

`pushWorkspaceLocation` 先發出可取消的 `workspace-before-navigate`，再清除舊 module 的條件、設定新 workspace／module 並更新 history。`workspaceHistory` 追蹤 push／replace 與 popstate；若有未儲存內容而取消返回，會恢復 history cursor，避免再按一次就跳到錯誤頁。上傳、績效與其他編輯器可據此保護進行中的工作。

自動篩選與手動篩選必須使用同一 UI／URL 來源，條件顯示為可個別清除的文字 chip，全部清除只移除條件，保留 workspace／module／project 等上下文。完整結果清單契約見根目錄 `AGENTS.md` 與 [篩選 UI 盤點](./docs__filter-ui-audit.md)。realtime、通知或 KPI 深連結不得加入看不見且清不掉的額外條件。

來源：[Index.tsx](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/pages/Index.tsx)、[workspaceHistory](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/lib/workspaceHistory.ts)、[TestProjectProvider](https://github.com/lovableteat/station-status-hub/blob/06c686951b17afa920cf325ddfec9114590aeee0/src/components/test-projects/TestProjectProvider.tsx)。

## 11. 複製至另一台電腦時必須分開處理的內容

| 內容 | Markdown／Git 能帶走什麼 | 仍須另外處理 |
| --- | --- | --- |
| 程式與設計規則 | 元件、core、型別、migration、測試、文件 | 安裝依賴及安全設定新環境 |
| 雲端資料 | 只有結構與行為定義 | 授權後備份／移轉 DB、Storage、Auth、Edge Functions 與政策 |
| 本機比對結果 | 只有功能描述 | 在原瀏覽器匯出 ZIP；原始工程輸入與位址庫另存 |
| 未送出表單／上傳 File | 只有恢復機制的程式 | 完成已確認保存或保留原始檔；分頁記憶體不能搬移 |
| 3D 模型 | Git 中已有的靜態資產與模型引用 | 確認模型授權、binary、校準、雲端／本機保存位置 |
| 憑證／API key | 變數名稱與用途 | 由使用者在新環境另行提供，不能放進移轉包 |

驗證聲明必須分清「程式有此功能」、「本機測試通過」、「目視驗證」、「已套 migration」、「正式實測」五件事。本文件只做程式與文件核對，沒有執行新版網站、雲端查詢、1 GiB 正式上傳、真實手機或模型安裝目視驗收。歷史交接曾記錄的 `1293 pass／2 fail／4 skipped` 是舊測試結果，不是這份文件編寫時的新結果。
