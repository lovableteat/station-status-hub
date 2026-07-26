# PCB Designer 第六工作區實作計畫

> **For Codex:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task with review checkpoints.

**Goal:** 將完整 2D PCB 佈局規劃器整合為工作整合平台第六工作區，具備專案／模板／元件庫、拖放旋轉、網格、禁制區、測量、DRC、復原重做、自動儲存及 JSON／PNG／BOM 匯入匯出。

**Architecture:** 以 SVG 作為毫米座標畫布，將幾何、歷史、驗證與檔案解析維持為無 React 的純 TypeScript 模組，由 `usePcbWorkspace` 管理文件狀態與 local-first 儲存，再由緊湊三欄 React 工作區呈現。Supabase 表存在時做遠端同步；表缺失或離線時保留完整 localStorage 能力。

**Tech Stack:** React 18、TypeScript、SVG、Tailwind/shadcn、Supabase、SheetJS `xlsx`、Node 24 built-in test runner。

---

## Task 1：建立測試入口與 PCB 領域模型

**Files:**

- Modify: `package.json`
- Create: `src/components/pcb-designer/types.ts`
- Create: `src/components/pcb-designer/defaults.ts`
- Create: `tests/pcb-designer/defaults.test.ts`

**Step 1: Write the failing test**

測試內建專案、模板與元件資料均具唯一 ID、合法尺寸及正確 schema version：

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { createBlankProject, BUILT_IN_COMPONENTS } from "../../src/components/pcb-designer/defaults.ts";

test("blank project and built-in components satisfy domain invariants", () => {
  const project = createBlankProject("測試板");
  assert.equal(project.schemaVersion, 1);
  assert.ok(project.board.width >= 20);
  assert.equal(new Set(BUILT_IN_COMPONENTS.map((item) => item.id)).size, BUILT_IN_COMPONENTS.length);
  assert.ok(BUILT_IN_COMPONENTS.every((item) => item.width > 0 && item.height > 0));
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/pcb-designer/defaults.test.ts`  
Expected: FAIL because modules do not exist.

**Step 3: Write minimal implementation**

- 定義 `PcbProject`、board、元件、placed component、keepout、measurement、DRC、template、tool、save-state 等型別。
- 建立可重複使用的 `createId`、`createBlankProject`、四個模板與至少八個內建元件。
- 在 `package.json` 加入：

```json
"test:pcb": "node --test tests/pcb-designer/*.test.ts"
```

**Step 4: Run test to verify it passes**

Run: `npm.cmd run test:pcb`  
Expected: PASS.

**Step 5: Commit**

```bash
git add package.json src/components/pcb-designer/types.ts src/components/pcb-designer/defaults.ts tests/pcb-designer/defaults.test.ts
git commit -m "feat(pcb): define planner domain model"
```

## Task 2：以 TDD 完成網格、旋轉矩形、自動放置與 DRC

**Files:**

- Create: `src/components/pcb-designer/core/geometry.ts`
- Create: `src/components/pcb-designer/core/drc.ts`
- Create: `tests/pcb-designer/geometry.test.ts`
- Create: `tests/pcb-designer/drc.test.ts`

**Step 1: Write the failing tests**

涵蓋：

- `snapValue(4.8, 2) === 4`
- 90° 旋轉後角點
- 分離與相交旋轉矩形的 SAT 結果
- 板外、同層碰撞、不同層不碰撞、禁制區碰撞
- 自動放置成功不重疊，空間不足回傳 `null`

```ts
test("same-layer overlap creates a component collision", () => {
  const violations = runDrc(projectWithOverlappingComponents);
  assert.ok(violations.some((item) => item.code === "COMPONENT_COLLISION"));
});
```

**Step 2: Run tests to verify they fail**

Run: `npm.cmd run test:pcb`  
Expected: FAIL because geometry functions do not exist.

**Step 3: Write minimal implementation**

- 以中心點與角度建立四角。
- 對兩個凸四邊形各邊法線做 SAT。
- 板界以所有角點檢查。
- `findPlacement` 由板中心按網格候選距離排序，排除板外、元件與禁制區。
- DRC 回傳穩定排序與可定位物件 ID。

**Step 4: Run tests to verify they pass**

Run: `npm.cmd run test:pcb`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/pcb-designer/core tests/pcb-designer/geometry.test.ts tests/pcb-designer/drc.test.ts
git commit -m "feat(pcb): add placement geometry and DRC"
```

## Task 3：以 TDD 完成歷史與專案驗證

**Files:**

- Create: `src/components/pcb-designer/core/history.ts`
- Create: `src/components/pcb-designer/core/validation.ts`
- Create: `tests/pcb-designer/history.test.ts`
- Create: `tests/pcb-designer/validation.test.ts`

**Step 1: Write the failing tests**

- push 後可 undo／redo。
- undo 後新交易會清空 redo。
- 歷史最多 100 筆。
- 合法 schema 可匯入。
- `NaN`、負尺寸、重複 instance ID、不支援 schema 都拒絕。
- 驗證失敗不修改傳入資料。

**Step 2: Run tests to verify they fail**

Run: `npm.cmd run test:pcb`  
Expected: FAIL.

**Step 3: Write minimal implementation**

- `createHistoryState`、`pushHistory`、`undoHistory`、`redoHistory` 使用深複製文件快照。
- `parseProjectJson` 回傳 discriminated union：

```ts
type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
```

- 對 board、components、keepouts、measurements 做逐欄 finite/range/unique 驗證。

**Step 4: Run tests to verify they pass**

Run: `npm.cmd run test:pcb`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/pcb-designer/core/history.ts src/components/pcb-designer/core/validation.ts tests/pcb-designer/history.test.ts tests/pcb-designer/validation.test.ts
git commit -m "feat(pcb): add document history and validation"
```

## Task 4：以 TDD 完成元件／BOM 解析與匯出

**Files:**

- Create: `src/components/pcb-designer/core/tabular.ts`
- Create: `src/components/pcb-designer/core/exports.ts`
- Create: `tests/pcb-designer/tabular.test.ts`
- Create: `tests/pcb-designer/exports.test.ts`

**Step 1: Write the failing tests**

- CSV quoted cell、UTF-8 BOM、空白列。
- 中英文欄位別名。
- 數值無效列進入 error list，有效列保留。
- BOM quantity 展開成待放置項目。
- BOM 匯出依製造商＋料號＋尺寸彙總，Reference 排序穩定。
- 專案 JSON 匯出包含 `schemaVersion: 1`。

**Step 2: Run tests to verify they fail**

Run: `npm.cmd run test:pcb`  
Expected: FAIL.

**Step 3: Write minimal implementation**

- 純函式處理 workbook rows 與 CSV 字串。
- `.xlsx` 讀寫在 UI 動態 `import("xlsx")`，核心只接收／輸出 row records。
- 匯出 CSV 正確 escape 逗號、引號、換行並加 UTF-8 BOM。

**Step 4: Run tests to verify they pass**

Run: `npm.cmd run test:pcb`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/pcb-designer/core/tabular.ts src/components/pcb-designer/core/exports.ts tests/pcb-designer/tabular.test.ts tests/pcb-designer/exports.test.ts
git commit -m "feat(pcb): add project and BOM file formats"
```

## Task 5：完成 local-first 儲存與 Supabase fallback

**Files:**

- Create: `src/components/pcb-designer/core/storage.ts`
- Create: `src/components/pcb-designer/hooks/usePcbPersistence.ts`
- Create: `tests/pcb-designer/storage.test.ts`
- Create: `supabase/migrations/20260726193000_create_pcb_designer_tables.sql`

**Step 1: Write the failing tests**

- 空 storage 產生初始 project／template／library。
- 版本化 payload 可 round-trip。
- 損壞 JSON 回傳安全 fallback。
- project upsert、delete、current project ID 更新不遺失其他資料。

**Step 2: Run tests to verify they fail**

Run: `npm.cmd run test:pcb`  
Expected: FAIL.

**Step 3: Write minimal implementation**

- `PcbLocalRepository` 接收 Storage-like adapter，方便 Node 測試。
- localStorage key：`work-platform:pcb-designer:v1`。
- hook 300 ms local debounce、900 ms remote debounce、`beforeunload` 同步落盤。
- Supabase 404／PGRST205／網路錯誤標成 local mode，不拋到 render。
- migration 建立三表、索引、updated_at trigger 與既有平台可用的 grants。

**Step 4: Run tests to verify they pass**

Run: `npm.cmd run test:pcb`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/pcb-designer/core/storage.ts src/components/pcb-designer/hooks/usePcbPersistence.ts tests/pcb-designer/storage.test.ts supabase/migrations/20260726193000_create_pcb_designer_tables.sql
git commit -m "feat(pcb): persist planner projects locally and remotely"
```

## Task 6：整合第六工作區、首頁入口與權限

**Files:**

- Modify: `src/lib/workspacePermissions.ts`
- Modify: `src/pages/Index.tsx`
- Modify: `src/components/layout/WorkspaceEntrance.tsx`
- Modify: `src/components/admin/UserPermissionsDialog.tsx`
- Create: `src/components/pcb-designer/PcbWorkspacePreview.tsx`
- Create: `tests/pcb-designer/workspace-integration.test.ts`

**Step 1: Write the failing structural test**

使用 Node 讀檔驗證：

- `pcb-designer` 存在於 workspace union、label、module map、Index catalog、render switch。
- permission reset 由 `WORKSPACE_LABELS` 鍵值動態產生或明確包含 PCB。
- 首頁含 PCB 預覽且不含 PCB DataCenter 文案。

**Step 2: Run test to verify it fails**

Run: `npm.cmd run test:pcb`  
Expected: FAIL.

**Step 3: Write minimal implementation**

- 權限增加 `pcb_designer_view/edit` 與 workspace access。
- 頂部導覽與首頁入口新增「PCB Designer」。
- 首頁六張卡改為 3 × 2。
- `Index` lazy-load `PcbDesignerWorkspace` 並給滿高編輯區。
- 管理員預設 edit；舊資料缺欄位時依角色 fallback。

**Step 4: Run tests and build**

Run:

```bash
npm.cmd run test:pcb
npm.cmd run build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/workspacePermissions.ts src/pages/Index.tsx src/components/layout/WorkspaceEntrance.tsx src/components/admin/UserPermissionsDialog.tsx src/components/pcb-designer/PcbWorkspacePreview.tsx tests/pcb-designer/workspace-integration.test.ts
git commit -m "feat(pcb): register the sixth platform workspace"
```

## Task 7：建立工作區狀態、專案／模板／元件庫與檔案操作

**Files:**

- Create: `src/components/pcb-designer/hooks/usePcbWorkspace.ts`
- Create: `src/components/pcb-designer/PcbDesignerWorkspace.tsx`
- Create: `src/components/pcb-designer/PcbLeftRail.tsx`
- Create: `src/components/pcb-designer/PcbToolbar.tsx`
- Create: `src/components/pcb-designer/PcbDialogs.tsx`
- Create: `src/components/pcb-designer/pcb-designer.css`

**Step 1: Write structural behavior tests**

驗證對外 action 名稱與控制矩陣完整出現：

- project create/open/rename/duplicate/delete
- template apply/save/duplicate/delete
- library create/edit/duplicate/delete/upload
- project JSON/BOM/PNG handlers
- undo/redo/lock/tool state

**Step 2: Run tests to verify they fail**

Run: `npm.cmd run test:pcb`  
Expected: FAIL.

**Step 3: Write minimal implementation**

- reducer/hook 是文件變更唯一入口。
- 每個語意變更透過 `commitProject` 更新歷史、DRC 與 save-state。
- 專案／模板／元件庫三分頁使用同一左欄。
- 對話框涵蓋新專案、專案設定、儲存模板、自訂元件、匯入預覽、刪除確認、匯出選項。
- 上傳 input `accept` 與 parser 一致；相同 input 可重選同一檔案。
- `canEdit` false 或 document locked 時所有 mutation action disabled。

**Step 4: Run tests and focused lint**

Run:

```bash
npm.cmd run test:pcb
npx.cmd eslint src/components/pcb-designer tests/pcb-designer
```

Expected: PASS with zero PCB errors.

**Step 5: Commit**

```bash
git add src/components/pcb-designer tests/pcb-designer
git commit -m "feat(pcb): add project library and file workflows"
```

## Task 8：建立 SVG 畫布、拖放、工具與右側檢查器

**Files:**

- Create: `src/components/pcb-designer/PcbCanvas.tsx`
- Create: `src/components/pcb-designer/PcbInspector.tsx`
- Modify: `src/components/pcb-designer/PcbDesignerWorkspace.tsx`
- Modify: `src/components/pcb-designer/hooks/usePcbWorkspace.ts`
- Modify: `src/components/pcb-designer/pcb-designer.css`
- Create: `tests/pcb-designer/editor-contract.test.ts`

**Step 1: Write the failing editor contract test**

驗證 SVG 事件與可及性契約存在：

- `data-pcb-canvas`
- draggable component cards
- pointer down/move/up
- wheel zoom
- drop coordinate conversion
- keyboard handler
- rotate/delete/center DRC actions
- select/pan/measure/keepout tools
- `aria-label` for icon-only controls

**Step 2: Run tests to verify it fails**

Run: `npm.cmd run test:pcb`  
Expected: FAIL.

**Step 3: Write minimal implementation**

- SVG render 順序：grid、board、keepouts、measurements、components、selection handles、draft tool、DRC overlay。
- 拖放與點擊新增共用 `placeLibraryComponent`。
- 元件拖曳只 preview，pointer up 才提交一次。
- 右欄依 board/component/keepout/measurement/DRC 顯示對應表單。
- DRC 項目點擊選取並更新 pan/zoom 置中。
- 鍵盤事件跳過表單 focus。

**Step 4: Run tests, focused lint and build**

Run:

```bash
npm.cmd run test:pcb
npx.cmd eslint src/components/pcb-designer tests/pcb-designer
npm.cmd run build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/pcb-designer tests/pcb-designer
git commit -m "feat(pcb): add interactive SVG layout editor"
```

## Task 9：真實瀏覽器逐鍵與檔案驗證

**Files:**

- Create temporarily then remove: `tmp/pcb-qa/*`
- Modify as needed: `src/components/pcb-designer/**`
- Modify as needed: `tests/pcb-designer/**`

**Step 1: Start production-like local app**

Run:

```powershell
Start-Process -WindowStyle Hidden -FilePath npm.cmd -ArgumentList "run","dev","--","--host","127.0.0.1","--port","4176" -WorkingDirectory "<worktree>"
```

**Step 2: Verify entry and responsive layout**

以 in-app browser 驗證：

- 登入後首頁顯示六個入口。
- PCB Designer 可由首頁與頂部導覽開啟。
- 1920、1440、1024、768 寬無水平破版；中央畫布仍可使用。
- 與平台 header、色彩、按鈕、字級一致。

**Step 3: Execute the complete control matrix**

建立 QA 專案並依序執行：

- 新增／改名／複製／切換／刪除專案。
- 套用與儲存模板。
- 點擊與拖放元件、旋轉、方向鍵、鎖定、刪除。
- 網格顯示／吸附／間距。
- 建立／移動／刪除禁制區與測量。
- 製造三種 DRC 並點擊定位。
- 復原、重做、重新載入後草稿保留。
- 上傳元件 JSON／CSV／XLSX。
- 匯入專案 JSON。
- 匯入 BOM CSV／XLSX，逐筆放置與自動排列。
- 下載專案 JSON、PNG、BOM CSV／XLSX，檢查副檔名、MIME、內容或檔頭。
- 確認離線／表不存在時 UI 顯示「本機草稿」且功能不失效。

**Step 4: Fix every discovered issue and rerun**

每個問題先新增可重現測試，再做最小修正。完成後移除 `tmp/pcb-qa`。

**Step 5: Final verification**

Run:

```bash
npm.cmd run test:pcb
npx.cmd eslint src/components/pcb-designer tests/pcb-designer
npm.cmd run build
git diff --check
git status --short
```

Expected: tests、focused lint、build、diff check 全部通過；只剩預期檔案。

**Step 6: Commit**

```bash
git add src/components/pcb-designer tests/pcb-designer
git commit -m "fix(pcb): complete planner interaction verification"
```

## Task 10：比對遠端 main、推送與部署確認

**Files:** No new feature files unless integration conflict requires a tested fix.

**Step 1: Fetch and compare**

```bash
git fetch origin main
git log --oneline --left-right --cherry-pick HEAD...origin/main
```

- 若遠端有新提交，先合併 `origin/main`，解決衝突後重新執行 Task 9 final verification。
- 不使用 force push。

**Step 2: Final diff review**

```bash
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
git log --oneline origin/main..HEAD
```

確認沒有 DataCenter 重複、獨立登入、來源網站黑綠風格或未追蹤 QA 檔。

**Step 3: Push branch and update main**

```bash
git push -u origin codex/pcb-designer-workspace
git push origin codex/pcb-designer-workspace:main
```

**Step 4: Verify GitHub Pages**

- 取得推送觸發的 Pages workflow run。
- 等待 run 為 `completed/success`。
- 開啟 production URL，重做 smoke test：登入、六入口、PCB 工作區、元件放置、儲存重載、JSON 與 PNG 匯出。

**Step 5: Report exact evidence**

回報：

- main commit SHA
- tests／focused lint／build 結果
- Pages run 與 production URL
- remote table migration 未套用時的「本機草稿」fallback 狀態
