# Bringup project handoff - 2026-08-10

## How to continue

Open this file in a new Codex task and continue directly from the repository state. Inspect the current files and Git status before editing. Do not ask the user to repeat the history recorded here.

## Project baseline

- Repository: `C:\Users\pega_user\Desktop\bringup\station-status-hub`
- Branch: `main`
- Remote: `origin/main`
- Remote commit at handoff: `0c71c6b fix: recover material BOM cloud sync`
- Production site: `https://lovableteat.github.io/station-status-hub/`
- Material request page: `https://lovableteat.github.io/station-status-hub/?workspace=station-status&module=material-request`

## Non-negotiable rules

1. Preserve all existing website functions, data, permissions, IDs, and user workflows. A fix is not complete if it breaks another finished feature.
2. Never reset, revert, delete, or overwrite unrelated user changes. The worktree contains intentional local and generated files.
3. Stage and commit only files that belong to the current task. Do not commit temporary folders, generated model files, Supabase temporary files, or unrelated lock/workspace files.
4. Every completed change must be committed and pushed to remote `main`. A local commit is not delivery.
5. Run focused tests, lint, and the production build before pushing. After pushing, verify the remote commit and wait for GitHub Pages before checking the production site.
6. Realtime updates must never reload the whole page, replace the route key, or call `window.location.reload()`. Update only the affected state.
7. Do not report success from local code alone. Verify the deployed behavior whenever the task affects the website UI.

## Priority A: fix the bottom-right chat bar

### User requirement

The collapsed `聊天室` launcher must attach to the exact bottom-right corner of the browser. The right side currently leaves visible empty space.

- Use a fixed bottom-right position with no right or bottom gap.
- Do not reserve page width or alter the width of tables and page content.
- Keep chat collapsed by default. The user must click the bar before chat content appears.
- Preserve the early-Facebook-style corner chat behavior.
- Show an unread numeric badge when messages are waiting.
- Do not show message text in an automatic preview toast.
- Opening and closing chat must not reload the page.
- Check desktop and narrow viewport alignment.

### Relevant files

- `src/components/collaboration/CollaborationCenter.tsx`
- `src/components/collaboration/DirectMessagesPanel.tsx`
- `tests/globalCollaborationCenter.test.mjs`

The floating launcher and panel are in `CollaborationCenter.tsx`. Search for:

- `DirectMessageLauncher`
- `data-floating-direct-messages`
- `aria-label="聊天室"`
- `aria-controls="direct-messages-panel"`

The latest screenshot showing the unwanted right gap is:

`C:\Users\PEGA_U~1\AppData\Local\Temp\codex-clipboard-1f78279b-d2e6-4394-803f-bb2bc2451257.png`

Related history that may help explain the current implementation:

- `1cc0c13 fix: keep direct messages collapsed in chat bar`
- `5a85844 fix: collapse direct messages into chat bar`
- `bdb1562 fix: keep direct messages in corner panel`

Older preview-card specifications are superseded by the current requirement. The closed state is a corner bar only, with no automatic message preview.

### Acceptance checks

- Closed launcher touches the viewport's right and bottom edges.
- No blank strip remains to its right or below it.
- Page content keeps its full width.
- Chat content appears only after clicking the launcher.
- Unread count is visible without exposing message content.
- Existing collaboration, presence, notifications, and direct-message functions still work.

## Priority B: finish the incomplete material BOM recovery

Two local source files contain an unfinished fix and must not be lost:

- `src/components/material-requests/materialBomStorage.ts`
- `src/components/material-requests/materialBomSyncPolicy.ts`

These changes are currently uncommitted. Preserve them and complete the work before committing the BOM fix.

### Confirmed root cause

The production material page can show `雲端同步異常`, remain on `正在切換 BOM`, disable controls, and display only a small partial set of groups.

1. A partial remote record page was treated as a fully loaded BOM.
2. The partial row count overwrote the remote workspace `record_count`, making an incomplete set appear complete.
3. Client-side grouping, filtering, searching, and pagination require the complete record set.
4. Concurrent asynchronous loads share one busy state, so a stale request can clear or replace the state of the latest request.

### Existing unfinished changes

`materialBomStorage.ts` now keeps a partial workspace as not fully loaded and no longer replaces `record_count` with the partial page length.

`materialBomSyncPolicy.ts` now contains:

```ts
export function isLatestBomWorkspaceLoad(completedRequestId: number, latestRequestId: number) {
  return completedRequestId === latestRequestId;
}
```

### Remaining implementation

Complete the fix in these files:

- `src/components/material-requests/MaterialRequestPage.tsx`
- `src/components/material-requests/materialBomStorage.ts`
- `src/components/material-requests/materialBomSyncPolicy.ts`
- `tests/materialBomEgressPolicy.test.mjs`

Required behavior:

- Import and use `isLatestBomWorkspaceLoad` in the page.
- Track workspace loads with a monotonically increasing request ID.
- Only the latest request may clear the current loading state.
- Mark a workspace as `full` only when all remote records were actually loaded.
- Active BOM loads, retries, initial loads, latest reloads, and export snapshots must request the complete record set.
- Remove obsolete partial hydration behavior that can expose incomplete groups.
- Apply search, grouping, filtering, and pagination only after the full record set is available.
- A temporary network failure must show a retryable state without permanently disabling the entire page or reloading it.

### BOM verification

Run:

```powershell
node --test tests/materialBomEgressPolicy.test.mjs
pnpm exec eslint src/components/material-requests/MaterialRequestPage.tsx src/components/material-requests/materialBomStorage.ts src/components/material-requests/materialBomSyncPolicy.ts
pnpm build
```

Tests must cover:

- Active BOM requests complete records.
- Partial records do not overwrite the remote total count.
- Only the latest load request can clear the busy state.

Production acceptance:

- No permanent `雲端同步異常` banner.
- No permanent `正在切換 BOM` state.
- The selected HPM BOM shows approximately 1,027 main groups and 6,606 vendor rows.
- Upload, add, manage, search, filter, paginate, and export controls remain usable.

## Current worktree warning

At handoff, only these two tracked files are intentionally modified for the unfinished BOM fix:

```text
M src/components/material-requests/materialBomStorage.ts
M src/components/material-requests/materialBomSyncPolicy.ts
```

There are many unrelated untracked files, including `.preview-current/`, `supabase/.temp/`, `tmp/`, model `.glb` files, and local pnpm workspace files. Do not add them to a commit unless the user explicitly assigns a task that requires them.

## Delivery checklist

For each completed task:

1. Review the scoped diff and confirm no unrelated files are staged.
2. Run the relevant tests, lint, and `pnpm build`.
3. Commit the scoped files on `main`.
4. Push with `git push origin main`.
5. Confirm the remote `main` SHA matches the local commit.
6. Wait for GitHub Pages deployment and verify the production page.
7. Report the commit SHA, remote push result, tests, build, and deployed behavior.

## Latest delivery - 2026-08-20

The mobile-workspace audit and responsive rebuild are complete. Commit `98b6c14 fix: rebuild core mobile workflows` and the later mobile workspace integration commits (`db249e9`, `fd384fa`, `f936736`) are present on the current delivery line. GitHub Pages deployment `#525` for the integrated delivery completed successfully; the earlier core rebuild deployment was `#522`.

### Mobile experience completed

- AI 查詢頁改成手機優先的訊息區：對話內容先呈現，模型、歷史、新對話、資料來源、專案範圍與附件入口集中成可觸控工具列，輸入列固定在可用空間底部。
- AI 查詢頁在 360、390、430、768px 寬度完成畫面檢查，對話區約為 419、463、551px（依視窗高度變化），沒有水平溢出或被底部聊天室遮住的情況。
- 機台維修紀錄中心的資料來源改為單列精簡工具列，專案範圍保留在彈出面板內，手機與平板按鈕維持至少 44px 觸控尺寸。
- 料號申請頁、聊天室與詳情／編輯對話框完成手機尺寸檢查；對話框層級高於手機底部工作列，平板聊天室與底部工作列保留安全間距。
- 通知改放在手機左側窄版提示區，保留右上角 QR、個人帳號與主要操作的可用空間。

### Verification

- 整合後手機／工作區／協作／通知 focused tests：36/36 通過。
- `pnpm build` 通過（3490 modules transformed）。
- 本次涉及頁面的 scoped ESLint 通過；全域 ESLint 現況為 109 errors、29 warnings，主要是專案既有的 `any` 與規則技術債，並非本次交接文件造成。
- 全量測試為 407/410 通過；剩餘 3 個是未涉及本次修改的既有失敗：automatic recovery lock expiry、dynamic system metadata migration、Supabase quota error wording。
- 部署網址 `https://lovableteat.github.io/station-status-hub/` 回傳最新 JavaScript／CSS 資產；390px 寬度實際載入檢查沒有水平溢出。未登入部署環境時會正確停在登入殼層，需登入後才能驗證權限工作區內頁。

### Repository state

- `main` 與 `origin/main` 已同步，包含核心手機修正、後續 workspace 整合與本次交接文件更新。
- 既有 `.preview-current/`、`tmp/`、`supabase/.temp/`、模型 `.glb` 與 pnpm 暫存／工作區檔案仍未追蹤，刻意保留且未加入提交。

### Latest delivery - 2026-08-20 PCB Designer reliability

本次完成 PCB Designer 七項修正：

- STEP／STP 匯入改為共用並可重試的 OCCT WebAssembly 載入流程，補上副檔名、空檔案與解析失敗提示，避免重複初始化造成匯入失敗。
- 自訂元件與板設定改用可視化原生色彩選擇器，不再要求使用者猜十六進位色碼。
- 元件庫新增圓形 `Screw Hole / 螺絲孔`，並讓 Screw／Scew／Hole／螺絲／孔等匯入名稱自動辨識為圓形元件；2D、3D 與軟體 3D fallback 均以圓形呈現。
- 修正 2D 到 3D 的底層座標映射，底層元件只位於板下，不再對 X／Z footprint 做鏡射。
- 背景遠端同步不再覆蓋使用者目前選取的專案、縮放、中心點、圖層與右側分頁，避免專案跳回與 2D 縮放自動還原。
- 禁制區支援右側旋轉欄位與 90 度旋轉按鈕，2D、3D、預覽及 DRC 均採用旋轉後幾何。

### PCB verification

- `pnpm exec tsc --noEmit` 通過。
- PCB Designer tests：`188/188` 通過。
- 本次涉及檔案 scoped ESLint 通過。
- `pnpm build` 通過，3490 modules transformed；STEP／OCCT WASM 資產已輸出。
- 已在本機瀏覽器實際操作元件庫、圓形 Screw Hole 放置、自訂顏色選擇、禁制區拖曳與旋轉，並檢查 3D 畫面沒有鏡射。

### PCB repository state

- 只提交本次 PCB Designer、STEP 匯入、回歸測試與本交接文件；既有 `.preview-current/`、`tmp/`、`supabase/.temp/`、模型 `.glb` 與 pnpm 暫存／工作區檔案維持未追蹤。

### Latest delivery - 2026-08-20 RWD and control-room visual audit

本輪完成全站主要工作區的響應式檢查與指定畫面重排，重點不是單純縮小桌面版，而是讓手機、平板與桌面各自保留可理解、可觸控、可捲動的操作區：

- PCB Designer 移除頂部重複的 DRC 操作；DRC 改由右側屬性／DRC 面板統一查看與重新計算，手機版也不再把 DRC 塞進工具列。
- 料號申請保留手機優先的快查、篩選與卡片清單；共用 BOM、狀態與主要操作在窄版不互相擠壓。
- 後台 API 控制台改用清楚的「驗證方式／使用範圍／狀態」中文資訊卡；API 金鑰資料未刪除，金鑰表在手機保留遮罩、查看、複製、測試、編輯、啟用／停用與刪除操作，完整欄位改由表格內層水平滑動查看。
- 權限設定視窗改成窄版單欄、寬版雙欄；工作區卡片在手機單欄、平板以上雙欄，超寬桌面才分出左右明細區，避免左下大面積空白與三欄選項被壓縮。
- 手機 Sonner 通知改為左右安全邊距，顯示提示時不再把聊天室或頁面內容往外推。

### RWD verification

- 已用本機瀏覽器實際查看 `390×844` 手機、`768×1024` 平板、`1280×720` 桌面與 `1610×905` 寬桌面。
- 已檢查機台維修紀錄中心、料號申請、Data Center、PCB Designer、後台用戶管理、後台 API 控制台與權限設定視窗。
- 已確認 API 金鑰表的手機內層表格實際為 `1147px` 欄位寬、由 `320px` 可視區水平滑動，不再被外層裁切；金鑰仍維持遮罩，未執行刪除。
- 已確認 PCB 桌面版右側 `DRC 0` 面板可切換並顯示重新計算；手機版沒有頂部 DRC 按鈕。
- PCB Designer tests、後台 UI tests：`194/194` 通過。
- `pnpm exec tsc --noEmit` 通過；本輪修改檔案 scoped ESLint 通過。
- `pnpm build` 通過，`3490 modules transformed`。

### RWD repository state

- 本輪只提交 RWD、後台版面、PCB DRC 入口與對應回歸測試／交接文件；既有 `.preview-current/`、`tmp/`、`supabase/.temp/`、模型 `.glb` 與 pnpm 暫存／工作區檔案維持未追蹤。

### Latest delivery - 2026-08-20 chat trailing spacing

本次修正訊息顯示後底部多出一行空白的原因：AI 資料查詢與右下角私訊都把自動捲動定位用的空元素放在 `space-y` 訊息清單內，CSS 會替該空元素套用額外的尾端間距。現在定位錨點移到訊息清單外，只保留清單本身需要的底部留白，因此不會再因訊息定位元素多出一整行。

- AI 資料查詢的訊息清單與右下角聊天室共用相同的無尾端間距結構。
- 桌面版右下角「訊息」浮動列貼齊瀏覽器右下角；手機版仍避讓底部工作列與安全區，避免遮住主要操作。
- 未改動訊息內容、附件、回覆、刪除、未讀數或聊天同步流程。

### Chat verification

- focused collaboration、AI Markdown、手機核心工作區測試：`19/19` 通過。
- 本次涉及檔案 scoped ESLint 通過。
- `pnpm exec tsc --noEmit` 通過。
- 本輪只提交聊天間距、浮動列定位、回歸測試與本交接文件；既有 `.preview-current/`、`tmp/`、`supabase/.temp/`、模型 `.glb` 與 pnpm 暫存／工作區檔案維持未追蹤。

### Latest delivery - 2026-08-20 annotated UI review

針對瀏覽器標記的六個畫面逐一完成修正：

- PCB Designer 移除頂部「執行 DRC」入口，DRC 統一保留在右側檢查器，避免同一功能分散在兩處。
- 料號申請將標題、共享狀態、常用操作與 BOM 工作區拆成獨立區塊，降低標題列與操作按鈕的擁擠。
- 後台協作公告編輯區改為可伸展佈局，補上「發布前檢查」流程，避免左下出現無用途的大空白。
- API 控制台改成「管理金鑰 → 直接測試 → 提供文件」三步驟導覽，保留既有 API 金鑰與所有操作，並以一致的管理工作區視覺呈現。
- 使用者權限視窗改為快速套用、工作區權限、細部頁面權限的左右分區；一般桌面即採雙欄，減少不必要的巢狀框與壓縮。
- 相關元件補上可讀的區域標記與回歸測試，後續調整可直接定位到對應畫面區塊。

### Annotated UI verification

- 本機瀏覽器實際查看料號申請、後台協作、API 控制台、網站權限視窗與 PCB Designer；確認料號區塊分明、後台空間有內容、API 金鑰仍存在、權限視窗可用雙欄、PCB 畫面沒有「執行 DRC」。
- `pnpm exec tsc --noEmit` 通過。
- 後台、料號與協作 focused tests：`25/25` 通過；PCB Designer tests：`188/188` 通過。
- `pnpm build` 通過，`3490 modules transformed`；既有 OCCT 外部化與大型 chunk 警告仍屬既有建置提示。

### Annotated UI repository state

- 本輪只提交標記畫面相關的料號、後台協作、API 控制台、權限視窗、回歸測試與本交接文件；既有 `.preview-current/`、`tmp/`、`supabase/.temp/`、模型 `.glb` 與 pnpm 暫存／工作區檔案維持未追蹤。

### Latest delivery - 2026-08-20 performance appraisal workspace

新增第七個工作區「績效考核系統」，沿用既有 workspace shell、深色平台基底與權限矩陣，不另造一套登入或管理流程。頁面提供 2026 Q3／歷史週期、總覽／我的考核／團隊考核、搜尋、狀態篩選、目標進度、員工與主管回饋、評分、完成審核、CSV 匯出，以及桌面表格和手機卡片兩種閱讀方式。

### Performance implementation

- `src/components/performance/PerformanceAppraisalPage.tsx`：第七工作區主頁、詳情、建立／編輯、完成與匯出。
- `src/components/performance/performanceData.mjs`：種子資料、正規化、統計與 CSV 純邏輯。
- `src/components/performance/performance.css`：工作區色彩、狀態、進度與手機版版面。
- `supabase/migrations/20260820123000_add_performance_workspace.sql`：`performance_reviews`、索引、RLS、realtime 與權限儲存 RPC 更新。
- `src/lib/workspacePermissions.ts`、`src/pages/Index.tsx`、`UserPermissionsDialog`、`MobileWorkspaceDock`：新增 `performance_view`／`performance_edit` 與第七入口。

資料流程採雲端優先、本機兜底：頁面先使用 localStorage 讓現場快速看到資料，再嘗試 Supabase；雲端同步失敗會保留本機資料並提示使用者，不會白屏或把剛輸入的內容清掉。migration 尚未部署的環境仍可檢視與本機保存；套用 migration 後會使用共用的 `performance_reviews` 表。

### Performance verification

- `tests/performanceAppraisal.test.mjs`：週期統計、snake_case 雲端資料正規化、進度邊界和 CSV 引號跳脫。
- focused tests：39/39 通過，涵蓋績效資料、七工作區權限、手機殼層、後台與既有工作區回歸。
- scoped ESLint 通過；production build 通過，`3493 modules transformed`。建置仍只出現既有 OCCT 外部化與大型 chunk 提示。
- TypeScript 全專案仍有既有 Supabase generic 型別技術債；本次新增的績效頁與主要路由整合沒有新增型別錯誤。
- 本機瀏覽器實看桌面 `1440x900` 與手機 `390x844`：桌面七項導覽完整、無水平溢出，手機切換五張考核卡片、底部操作列可用，無水平溢出，且不再有巢狀 `main`。

### Performance repository state

- 只應提交績效頁、權限整合、Supabase migration、Database type、回歸測試與本交接文件。
- 既有 `.preview-current/`、`tmp/`、`supabase/.temp/`、模型 `.glb` 與 pnpm 暫存／工作區檔案維持未追蹤，不可一併加入。

### Latest delivery - 2026-08-20 PCB 2D/3D alignment, panel cuts and shared library

本輪修正 PCB Designer 的三個核心問題：2D 與 3D 使用不同座標感受、板框與切板需求、以及自訂元件只出現在建立者瀏覽器。所有修正都保留既有專案資料格式，舊資料沒有 `cuts` 欄位時仍可正常載入。

### PCB implementation

- `src/components/pcb-designer/core/viewSync.ts` 統一 2D `X/Y` 與 3D `X/Z` 對應，`src/components/pcb-designer/core/software3d.ts` 與 `Pcb3DCanvas.tsx` 將預設視角改為可直接對照 2D 的正投影俯視；拖曳後仍可進入立體角度。
- `PcbBoard.cuts` 與 `core/boardCuts.ts` 保存切板線；`PcbInspector.tsx` 提供左右／上下分板數、套用與清除，`PcbCanvas.tsx`、WebGL 3D 與 software 3D 使用相同資料畫出切板線。
- `supabase/migrations/20260820140000_share_pcb_designer_library.sql` 新增共用自訂／BOM 元件庫與刪除 tombstone；`core/accountRemoteSync.ts` 優先使用 shared RPC，舊部署則合併所有帳號快照並選取最新版本。套用 migration 後，其他使用者可在元件庫看到同一份元件。
- 不改動既有內建元件、STEP 匯入與模型資產；元件仍由 canonical project record 同步到 2D、WebGL 3D 與 software 3D。

### PCB verification

- 本機瀏覽器 `1440x900` 實看同一專案的 2D 與 3D：元件相對位置一致，3D 初始為對照用正投影，切換視角後仍可查看高度。
- 2D 套用 `2 x 2` 切板後，畫面顯示一條垂直與一條水平切板線；切換到 3D 後同一個十字位置仍存在，右側顯示 `2 條分板線`。
- PCB focused tests：`191/191` 通過（含切板範圍、重複 ID、2D/3D 座標與多人 fallback）。
- production build 通過（`3494 modules transformed`）；建置仍只有既有 OCCT 外部化與大型 chunk 警告。全專案 `tsc --noEmit` 仍被既有 Supabase 泛型／相依版本錯誤擋住，錯誤集中在 `admin`、`hooks` 與 Supabase client，未指向本輪 PCB 檔案。

### PCB repository state

- 本輪只應提交 PCB Designer core、renderer、Inspector、共享元件 migration、PCB tests 與本文件／架構指南。
- 既有 `.preview-current/`、`tmp/`、`supabase/.temp/`、模型 `.glb` 與 pnpm 暫存／工作區檔案維持未追蹤，不可一併加入。

### Latest delivery - 2026-08-20 PCB type-safety audit

完成 PCB Designer 的專屬 TypeScript 稽核，處理先前全專案 typecheck 顯示的六個 PCB 錯誤：模型 metadata 數值縮窄、專案板框正規化、旋轉放置選項、圓形元件 pointer event，以及選取複製按鈕的事件簽名。這些修改只修正型別邊界，不改動既有專案、元件或模型資料。

### PCB type-safety verification

- PCB scoped TypeScript error filter：`0` 個錯誤。
- PCB focused tests：`191/191` 通過。
- 本輪四個修改檔案的 scoped ESLint 通過。
- 本機瀏覽器實際操作：圓形 screw hole 可用 `R` 旋轉 90° 後放置、選取、複製，右側屬性顯示正確，切換 3D 後元件仍存在。
- 全專案 typecheck 仍有 PCB 以外的既有 Supabase／後台／共用 hooks 型別技術債；PCB Designer 已不再出現在錯誤輸出。
