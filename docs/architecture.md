# 工作整合平台架構指南

這份文件是 `station-status-hub` 的開發交接入口。新成員應先閱讀本文件，再依照功能領域進入對應的 `src`、`supabase` 與 `tests` 目錄。文件描述的是目前 `main` 分支的實際架構，不是早期 Lovable 範本的預設說明。

## 1. 專案定位

工作整合平台把測試站維修、料號與 BOM、Data Center、PCB Designer、後台管理、AI 資料查詢、績效考核和即時協作集中在同一個工作區。平台同時支援桌面、平板與手機，功能頁以 workspace 為單位切換，資料與權限由 Supabase 和前端 provider 統一管理。

主要設計原則：

- 工作區是產品功能的邊界，頁面不應各自建立一套登入、權限或即時同步邏輯。
- 伺服器資料以 Supabase 為準，前端快取只負責顯示速度與編輯體驗。
- 影響資料的操作必須有明確的儲存、同步、錯誤和重新整理策略。
- 桌面版和手機版是同一套功能的不同操作編排，不是把桌面版縮小。
- 複雜運算先放入可測試的 `core` 純邏輯，再由 React 元件接上畫面與事件。

## 2. 五分鐘啟動

需求：Node.js 20 以上、npm，以及可用的 Supabase 專案環境變數。

```bash
npm install
npm run dev
```

Vite 開發伺服器預設使用 `8080`。由於 `vite.config.ts` 設定了 GitHub Pages base path，實際開發入口通常是：

```text
http://localhost:8080/station-status-hub/
```

常用檢查：

```bash
npm run lint
npm run build
pnpm exec tsc --noEmit
pnpm test:pcb
```

若環境沒有 pnpm，TypeScript 檢查可使用專案內對應的 `npx tsc --noEmit`。不要把 `.env`、Supabase service role key、模型轉換暫存檔或 `tmp/` 產物提交到 Git。

## 3. 目錄地圖

```text
station-status-hub/
├─ src/
│  ├─ App.tsx                 # 應用程式 runtime、provider、登入閘門與正式 routes
│  ├─ main.tsx                # React root 與最外層錯誤邊界
│  ├─ pages/Index.tsx         # workspace shell、URL 狀態與主功能分派
│  ├─ components/            # 工作區 UI、資料 hooks、功能元件與共用元件
│  ├─ hooks/                  # 跨頁資料、權限、presence 與即時資料 hooks
│  ├─ lib/                    # 純工具、權限規則、格式化與共用服務
│  ├─ integrations/supabase/ # Supabase client 與生成的 Database 型別
│  └─ index.css               # 全域樣式、RWD 變數與共用 layout 基礎
├─ supabase/
│  ├─ migrations/             # 依時間順序的 schema、RLS、RPC 與 realtime 變更
│  ├─ functions/              # edge functions，例如 API proxy 與登入同步
│  └─ config.toml             # 本地 Supabase functions 設定
├─ tests/
│  ├─ pcb-designer/           # PCB core、幾何、同步與匯入匯出測試
│  └─ *.test.mjs              # workspace、RWD、協作中心與回歸檢查
├─ public/models/             # 明確審核後才納入部署的靜態 3D 資產
├─ scripts/                   # STEP、GLB 等大型模型的轉換工具
├─ docs/                      # 交接、驗證與架構文件
├─ .github/workflows/main.yml # main 推送後的 GitHub Pages 建置與部署
└─ vite.config.ts             # base path、開發伺服器與前端 build 設定
```

### 3.1 功能目錄對照

| 功能 | 主要入口 | 核心程式位置 |
| --- | --- | --- |
| 機台維修紀錄中心 | `station-status` | `src/components/maintenance`、`src/components/test-tracker`、`src/components/issues` |
| 料號申請 / BOM | `material-requests` | `src/components/material-requests`、`src/components/bom` |
| Data Center | `data-center` | `src/components/data-center`、`src/components/cabinet` |
| PCB Designer | `pcb-designer` | `src/components/pcb-designer`、`src/components/pcb-designer/core` |
| 後台管理 | `user-management` | `src/components/admin`、`src/components/api-management` |
| 資料查詢空間 | `ai-chat` | `src/components/api-management/ApiChatWorkspacePage.tsx`、`ApiChatConsole.tsx` |
| 績效考核系統 | `performance` | `src/components/performance`、`supabase/migrations/*performance*` |
| 全站聊天室 | 全域 overlay | `src/components/collaboration/CollaborationCenter.tsx`、`DirectMessagesPanel.tsx` |

## 4. 啟動流程與頁面分派

應用程式的啟動方向如下：

```text
main.tsx
  └─ AppRuntimeBoundary
      └─ App.tsx
          ├─ QueryClientProvider
          ├─ UserProvider
          ├─ PermissionsProvider
          ├─ TestProjectProvider
          ├─ UnifiedDataProvider
          ├─ UserPresenceProvider
          └─ ApplicationSessionGate
              ├─ loading      -> AppLoadingScreen
              ├─ 未登入       -> LoginPage
              └─ 已登入       -> HashRouter
                                  ├─ /       -> pages/Index.tsx
                                  ├─ /test-tracker
                                  ├─ /api-management
                                  └─ *       -> NotFound
```

`Index.tsx` 是平台主 shell。它會依照 `workspace` 和 `module` query parameter 選擇工作區內容，而不是為每個工作區建立一套獨立的全站 layout。大型工作區以 lazy import 載入，避免初次開頁時同時下載 PCB、3D、試算表和 AI 所有依賴。

### 4.1 Workspace 與 module

| workspace | 常用 module | 功能說明 |
| --- | --- | --- |
| `station-status` | `dashboard`、`test-tracker`、`flow-info`、`monitor`、`issues`、`tools`、`test-plan` | 維修、測試流程、問題追蹤與工具管理 |
| `material-requests` | `material-requests` | 料號總表、BOM、替代料、申請與匯出 |
| `data-center` | `data-center` | 機櫃、設備、部署規劃和 2D / 3D 視圖 |
| `pcb-designer` | `pcb-designer` | PCB 專案、2D 編輯、3D 檢視、元件與 BOM |
| `user-management` | `users`、`collaboration`、`api-management` | 使用者、公告、API 金鑰與權限 |
| `ai-chat` | `ai-chat` | AI 資料查詢、附件、知識檢索與對話 |
| `performance` | `performance` | 考核週期、目標進度、主管回饋、評分與報表 |

切換工作區時，`pushWorkspaceLocation()` 會更新 query string、保留可分享的頁面狀態，並透過 workspace navigation event 通知 shell；不應使用整頁 reload 來完成一般切換。新增工作區或 module 時，要同步更新 `moduleWorkspaceMap`、權限規則、可見入口與回歸測試。績效頁沒有額外 module，直接以 `workspace=performance` 開啟。

## 5. Provider 與資料流

### 5.1 身分、權限與 session

- `src/components/auth/UserContext.tsx` 管理登入使用者、session、登入重試與登出狀態。
- `src/hooks/usePermissions.ts` 提供元件使用的 `canViewModule`、`canEditModule` 等判斷。
- `src/lib/workspacePermissions.ts` 是 workspace、子頁與繼承權限的集中定義；不要在單一按鈕內複製一套權限字串。
- `PermissionGuard` 負責在畫面層阻擋沒有權限的 workspace，但真正的資料安全仍由 Supabase RLS 與 RPC 保證。
- Supabase client 使用瀏覽器可公開的 publishable anon key；service role key 絕不可放在前端或 Git。

### 5.2 資料與即時協作

- `UnifiedDataProvider` 統一跨工作區共享的專案、機台、流程和 metadata。
- `useUserPresence` 與 collaboration 元件提供在線狀態、公告和全域聊天室。
- `useDirectMessages` 和 `DirectMessagesPanel` 負責私訊、訊息刪除、歷史清除與媒體附件。
- React Query 目前採短時間 stale cache 並關閉 focus refetch，避免切換視窗時重複拉取大量工作資料。
- 即時事件應更新現有 cache 或局部 state，不應在每個事件後呼叫 `window.location.reload()`。

### 5.3 Supabase 邊界

`src/integrations/supabase/client.ts` 建立唯一 client。資料庫變更放在 `supabase/migrations`，以時間戳檔名依序套用；RLS、RPC、realtime publication 和 storage policy 必須和前端功能一起檢查。

目前重要的資料邊界包含：

- 維修、測試流程、問題與通知資料。
- 料號、BOM、替代料、申請 audit log 與跨裝置同步。
- PCB 專案、元件、禁制區、遠端同步和共用專案權限。
- AI 私有 conversation、maintenance knowledge search、引用來源與附件。
- 使用者 profile、頭像、presence、私訊與訊息媒體。
- 後台 API 金鑰 metadata。金鑰內容需遵守既有遮罩和 server-side 使用邊界。
- 績效考核資料、考核週期、目標 JSON、主管與員工回饋；前端在 migration 尚未部署時會先以 localStorage 維持可用，雲端表啟用後以 `performance_reviews` 為準。

### 5.4 Migration 工作規則

1. 先確認功能需要的 table、index、policy、RPC 與 realtime channel。
2. 新增一個時間戳 migration，保持可重複執行或在 SQL 中安全檢查既有物件。
3. 更新 Supabase Database type 與對應 hooks。
4. 用最小權限測試讀取、寫入、更新、刪除和跨使用者隔離。
5. 不要在正式環境直接 reset、刪除整個 schema 或重播歷史 migration。

## 6. 各工作區如何下手

### 6.1 機台維修紀錄中心

維修中心將 dashboard、測試追蹤、流程、監控、問題與工具拆成 module，但共用同一個 project scope、sidebar 和權限 provider。問題追蹤和測試紀錄的新增、附件、編輯與檢視應優先沿用既有 hooks，不要在新頁面直接呼叫 Supabase。

涉及附件或圖片時，要同時驗證：檔案大小與 MIME 限制、上傳進度、失敗重試、預覽、下載、刪除、storage path 驗證，以及儲存後重新載入是否仍看得到。

### 6.2 料號申請與 BOM

料號頁面以 `MaterialRequestPage` 為主要入口，BOM 的效能、雲端同步、多人 presence、匯入、匯出和 audit log 已分在 `material-requests` 相關模組。大量資料操作不可阻塞整個頁面；搜尋、分頁、篩選、匯入進度和儲存狀態要能被使用者看見。

新增欄位或 BOM 狀態時，先確認主料、替代料、供應商明細、頁數進度和跨裝置同步是否仍一致，再修改表格顯示。

### 6.3 Data Center

Data Center 的 2D / 3D 部分由 planner、equipment、rack、model 與 project 元件組成。3D 資產來源、STEP 匯入和 GLB 轉換工具位於 `scripts` 與 `src/components/data-center`。大型模型轉換是離線工作，不應在瀏覽器首次載入時阻塞整個 workspace。

視圖修改時要保留同一份幾何資料來源，確認 2D 座標、3D 座標、旋轉、層面、選取和儲存後重載一致。模型檔只有在檔案大小、授權和部署需求確認後才加入 `public/models`。

### 6.4 PCB Designer

PCB Designer 的畫面入口是 `PcbDesignerWorkspace`；可測試的編輯邏輯放在 `src/components/pcb-designer/core`，包含：

- editor、geometry、selection、view sync、history。
- 2D canvas、WebGL / software 3D 與 model assets。
- STEP / PNG 匯入、檔案、JSON / tabular 匯出。
- DRC、validation、remote sync、project records 與 storage。

新增 PCB 行為時，先在 `core` 寫純函式和資料轉換，再由 hook 接事件，最後接 2D 與 3D renderer。2D 與 3D 必須共用 canonical component records，不可各自維護一份位置或 rotation；任何座標、鏡射、Top / Bottom 層面轉換都要有測試。

PCB 常見回歸檢查：

- STEP 匯入失敗時顯示可操作的錯誤，而不是吞掉例外。
- 元件、圓形 screw hole、禁制區與旋轉在 2D / 3D 之間一致。
- 滾輪縮放後不會被背景同步或重新渲染重設。
- 左側選取的專案不會被非同步載入回寫成另一個專案。
- 匯入、下載、刪除、複製與儲存後重載都使用目前 project id。

### 6.5 後台管理

後台由 users、collaboration 和 API management 組成。API 控制台的金鑰資料要保留既有遮罩、編輯、停用、測試和刪除語意；UI 可以重排，但不能把金鑰明文寫入 log、localStorage 或文件。使用者權限視窗應以工作區卡片和頁面權限分組，讓「檢視」與「管理」的差異清楚可見。

### 6.6 資料查詢空間與聊天室

AI 工作區負責模型選擇、提示詞、知識來源、附件、對話與引用。全域聊天室是 overlay，不得改變主頁內容的 layout height，也不得因訊息、toast 或圖片載入讓主畫面產生水平溢出或底部空白。

訊息列表的 auto-scroll anchor 必須是零高度的獨立元素，不能放進帶 `space-y` 的訊息容器；固定 dock 要避開手機安全區，但桌面版要貼齊視窗底邊，不可覆蓋主要操作區。

### 6.7 績效考核系統

績效頁由 `PerformanceAppraisalPage` 組成，資料與純邏輯拆在 `src/components/performance`：

- `performanceData.mjs`：考核週期、狀態、種子資料、資料正規化、統計與 CSV 匯出。
- `performance.css`：沿用深色平台底色，使用青綠、琥珀和紫色做資訊層級，不把所有狀態做成同一種藍色。
- `PerformanceAppraisalPage.tsx`：總覽、我的考核、團隊考核、搜尋／狀態篩選、詳情、建立／編輯、完成與匯出。
- `supabase/migrations/*performance*`：`performance_reviews` 表、索引、RLS、realtime 和 `performance_view`／`performance_edit` 權限。

頁面先載入本機快取以保持快速可用，再嘗試讀取雲端；雲端成功後會覆蓋本機快取。新增或編輯考核先即時更新畫面，再嘗試同步，失敗會明確提示「已保存在本機瀏覽器」，避免使用者以為資料消失。新增工作區權限時，要同時檢查 `workspacePermissions.ts`、`UserPermissionsDialog`、桌面首頁入口與 `MobileWorkspaceDock`。

## 7. RWD 與操作設計規則

RWD 的目標是「工作現場拿起手機就能完成工作」，不是只讓桌面欄位換行。

- 根容器使用 `100dvh` 和 `overflow-hidden` 的工作區要明確定義內部滾動區，避免 body 與 panel 雙重滾動。
- 固定 header、toolbar、dock 和 modal 必須使用 safe-area inset，並在直向、橫向、軟鍵盤出現時驗證。
- 桌面側欄在手機應改成 bottom dock、drawer 或分段導覽；不可把 280px 側欄直接壓縮到內容上。
- 資料表在手機要改成可橫向滑動的欄列、卡片或優先欄位，不可讓所有欄位縮成無法閱讀的文字。
- AI 訊息區、聊天室輸入區和主要預覽區必須保留可見高度；任何空狀態不能把輸入框推出畫面。
- 績效清單在桌面使用可讀表格，在手機改成卡片；建立／編輯視窗需可在窄螢幕內捲動，不能被底部 dock 截住。
- 主要觸控目標至少維持約 44px，拖曳、縮放、關閉、上傳、下載和刪除都要有明顯 disabled / loading / success / error 狀態。
- Toast、通知與聊天室不可使用會改變主內容流高度的普通 block；固定提示要有獨立 stacking context。
- 在 320px 寬度、375px 寬度、768px 平板、橫向平板和桌面寬度都檢查，不只看單一瀏覽器尺寸。

## 8. 新功能開發流程

### 8.1 一般 workspace 功能

1. 在 `src/pages/Index.tsx` 確認 workspace / module 邊界和 lazy loading 位置。
2. 在 `src/lib/workspacePermissions.ts` 加入或重用權限定義。
3. 建立資料 hook 或 service，讓元件不直接散落 Supabase query。
4. 必要時新增 migration、RLS、RPC、realtime 和 Database type。
5. 實作桌面、平板、手機三種操作編排。
6. 補上 loading、empty、error、success、permission denied、upload progress 和 retry 狀態。
7. 寫回歸測試，至少涵蓋資料邊界和曾經修過的 UI 行為。
8. 執行 lint、typecheck、build 和相關測試，再更新 handoff 文件。

### 8.2 新增按鈕或危險操作

每個按鈕都應能回答以下問題：

- 它現在是否有權限、是否可用？
- 點擊後是否有 loading，成功和失敗是否可辨識？
- 重複點擊會不會產生重複資料？
- 操作是否影響其他使用者或其他工作區？
- 刪除或清空是否有二次確認，錯誤後能否恢復？
- 手機上是否能觸控、看見、關閉和返回？

### 8.3 上傳與下載

上傳流程要包含選檔、檔案驗證、進度、取消或重試、儲存後 metadata、預覽、下載與刪除。下載流程要使用授權後的 storage URL 或 edge function，不要把內部 bucket path 直接當成公開 URL。圖片、STEP、GLB、BOM 和 CSV 可能有不同大小與格式限制，請沿用對應工作區已有的 validator。

## 9. 驗證清單

### 程式與資料

- `npm run lint`
- `pnpm exec tsc --noEmit`
- `npm run build`
- `pnpm test:pcb`
- 相關 `node --test tests/*.test.mjs`
- 已登入、未登入、權限不足、session 過期和 realtime 斷線流程。
- Supabase RLS 下的跨使用者讀寫隔離。

### 視覺與操作

- 首頁、維修中心、料號申請、Data Center、PCB Designer、後台、AI 查詢、績效考核和全域聊天室。
- 桌面寬度、手機直向、手機橫向、平板直向和窄螢幕。
- 主要按鈕、上傳、下載、刪除、編輯、返回、關閉、搜尋、篩選、分頁和拖曳。
- 2D / 3D 切換、縮放、旋轉、選取、層面、同步與重載。
- 長訊息、長檔名、空資料、慢網路、錯誤回應和大量列表。

## 10. 部署

`.github/workflows/main.yml` 在 `main` push 後執行：

1. 使用 Node 20 安裝依賴。
2. 注入 GitHub Actions secrets 的 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` 與 realtime flag。
3. 執行 production build。
4. 將 `dist` 發布到 GitHub Pages。

前端 base path 是 `/station-status-hub/`。部署檢查至少包含 build 成功、Pages 200、登入頁可開啟、主要 workspace 可載入，以及沒有把 secrets 打進 bundle 或 log。

## 11. 安全與 Git 工作規則

- 不要提交 `.env`、service role key、API provider secret、使用者密碼或未遮罩的金鑰。
- 不要把 `.preview-current`、`tmp/`、`supabase/.temp`、轉換中間檔或本機截圖當成產品來源。
- 大型模型只提交經確認的部署資產；轉換輸出先放本機暫存目錄檢查。
- 不要使用 `git reset --hard` 或 `git checkout --` 覆蓋別人的工作。
- 提交前使用 `git status` 和 `git diff --check`，確認只包含本次工作需要的追蹤檔。
- 正式修復應提交到 `main` 並等待 GitHub Actions 完成；若部署失敗，先看 workflow log，再修復並重新驗證。

## 12. 排錯入口

### 頁面載入失敗

先看瀏覽器 console、`ApplicationSessionGate` 狀態、Supabase session 與 query parameter；再確認 lazy import 的 chunk 是否成功載入。不要先用 reload 掩蓋錯誤。

### 資料沒有更新

依序檢查 permission、RLS、query key、mutation invalidation、realtime channel 和目前 project id。若只有一台裝置看得到，優先檢查 local cache 與同步事件，而不是直接複製資料。

### UI 跑版或聊天室推動內容

檢查最近新增的 `position: fixed`、flex shrink、`min-width`、body overflow、safe-area 與 stacking context。主內容應有自己的 scroll container，固定聊天室、toast 和 modal 不應參與正常文件流。

### PCB / 3D 不一致

先比較 canonical record 的 id、x、y、rotation、layer、mirror 與 z，再比較 renderer。不要在 renderer 內偷偷修正資料；修正應放在 core 的轉換函式並補測試。

## 13. 交接文件

近期交接與驗證紀錄位於：

- [`docs/codex-handoff-2026-08-10.md`](./codex-handoff-2026-08-10.md)
- [`docs/codex-history-cleanup-2026-08-08.md`](./codex-history-cleanup-2026-08-08.md)

當一次修復改變資料流、RWD、部署或跨工作區行為時，請在對應 handoff 文件補充日期、原因、驗證方式與尚未處理的風險。
