# 工作整合平台

工作整合平台（Station Status Hub）是給測試站與硬體團隊使用的整合工作區，集中管理機台維修紀錄、測試流程、料號與 BOM、Data Center、PCB Designer、後台管理、AI 資料查詢和即時協作。

## 從哪裡開始

- 架構與開發交接：[`docs/architecture.md`](./docs/architecture.md)
- 最新交接紀錄：[`docs/codex-handoff-2026-08-10.md`](./docs/codex-handoff-2026-08-10.md)
- 線上版本：[`GitHub Pages`](https://lovableteat.github.io/station-status-hub/)

第一次接手時，先看架構文件的「目錄地圖」、「Workspace 與 module」、「Provider 與資料流」和「新功能開發流程」，再進入對應功能目錄。不要從單一畫面元件直接猜資料來源或權限規則。

## 本機開發

需求：Node.js 20 以上與 npm。

```bash
npm install
npm run dev
```

Vite 預設在 `http://localhost:8080/station-status-hub/` 啟動。若本機已經有其他服務使用 8080，再依 Vite 顯示的實際網址開啟。

## 功能入口

| 工作區 | 內容 |
| --- | --- |
| 機台維修紀錄中心 | 儀表板、測試流程、問題追蹤、監控與工具 |
| 料號申請 | BOM、料號、替代料、供應商明細、匯入匯出與 audit |
| Data Center | 機櫃、設備、部署規劃與 2D / 3D 檢視 |
| PCB Designer | PCB 專案、2D 編輯、3D 檢視、元件、禁制區與 BOM |
| 後台管理 | 使用者、協作公告、API 金鑰、API 測試與權限 |
| 資料查詢空間 | AI 對話、附件、知識搜尋與引用來源 |
| 全站聊天室 | 跨工作區即時協作與私訊 |

主 workspace 使用 URL query 維持狀態，例如 `workspace=pcb-designer&module=pcb-designer`。真正的路由、權限和頁面分派請看 [`src/pages/Index.tsx`](./src/pages/Index.tsx) 與 [`src/lib/workspacePermissions.ts`](./src/lib/workspacePermissions.ts)。

## 技術組成

- React 18、TypeScript、Vite、Tailwind CSS、shadcn/ui。
- React Query：伺服器資料快取與 mutation 狀態。
- Supabase：Auth、Postgres、RLS、Realtime、Storage 與 Edge Functions。
- Three.js / React Three Fiber / WebGL：Data Center 與 PCB 3D 視圖。
- ExcelJS / XLSX：BOM 與試算表匯入匯出。
- TipTap：維修與問題內容編輯器。
- GitHub Actions + GitHub Pages：`main` push 後自動建置部署。

完整資料流、目錄邊界、RWD 規則、PCB core、模型轉換、Supabase migration 和排錯方式都集中在 [`docs/architecture.md`](./docs/architecture.md)。

## 常用檢查

```bash
npm run lint
pnpm exec tsc --noEmit
npm run build
pnpm test:pcb
```

修改工作區後，至少要測試桌面、手機直向、手機橫向與平板；並實際操作上傳、下載、刪除、編輯、搜尋、返回、聊天室、2D / 3D 切換和重新載入。只確認 TypeScript 通過，不代表操作流程完成。

## 資料庫與環境變數

資料庫變更放在 [`supabase/migrations`](./supabase/migrations)，依時間戳順序管理 schema、RLS、RPC 與 realtime。正式環境不要 reset 或重播歷史 migration。

前端只使用 Supabase publishable anon key。請透過本機 `.env` 或 GitHub Actions secrets 提供設定，絕不提交 service role key、API provider secret、使用者密碼或未遮罩的金鑰。

## 提交流程

1. 先確認 workspace、module、權限與資料來源，再開始改元件。
2. 複雜資料轉換先放在可測試的 `core` 或 `lib`，不要塞進 JSX。
3. 補上 loading、empty、error、success、disabled 和手機操作狀態。
4. 執行 lint、typecheck、build 和相關測試。
5. 用 `git diff --check`、`git status` 確認沒有把 `tmp/`、`.preview-current`、`supabase/.temp` 或模型轉換暫存檔提交。
6. 推送 `main` 後等待 GitHub Actions，確認 GitHub Pages 建置與線上入口可用。

更多協作與安全規則請直接閱讀 [`docs/architecture.md`](./docs/architecture.md)。
