> 集中副本；原始路徑：`docs/superpowers/plans/2026-10-13-workspace-corrections.md`；程式參考基準：`06c686951b17afa920cf325ddfec9114590aeee0`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# 工作平台修正 Implementation Plan

> **For agentic workers:** Use focused parallel tasks with disjoint ownership; root reviews integration and deployment.

**Goal:** 完成使用者 15 點修正並部署。

**Architecture:** 重用既有 React 元件、資料服務、URL 篩選與權限；獨立子系統平行修正，主代理統一樣式與驗證。

**Tech Stack:** React、TypeScript、Tailwind、Radix、Supabase、Vite、Node test runner。

## Global Constraints

- 不加依賴；不覆蓋現有資料；不改內部 workspace ID。
- 所有資料結果篩選遵守 AGENTS.md 持久篩選契約。
- 使用者要求不中途提問；僅回報簡短進度。

## Tasks

- [x] Dashboard: `src/components/dashboard/Dashboard.tsx`、`src/components/test-projects/ProjectScopeBar.tsx` 及對應問題資料 helpers/tests。先用合成問題驗證統計／URL，再替換進度畫面。
- [x] Folder upload: `src/components/test-plan/` 相關上傳 UI/services/tests。先驗證巢狀、安全路徑、同名與部分失敗，再接既有資料夾建立／上傳流程。
- [x] AI: `src/components/api-management/ApiChatConsole.tsx`、`ApiChatWorkspacePage.tsx`、相關 session/quota helpers/tests。先重現晚到回應、帳號切換與新／刪對話，再修正狀態及精簡版面。
- [x] AutoCheck: `src/components/comparison/` UI/CSS/tests。不碰引擎；驗證主動作、頁籤與位址庫狀態後整理綠色層級。
- [x] Shared shell/home: `src/components/layout/`、`src/pages/Index.tsx`、`src/index.css`、對外 workspace label callers、`src/assets/workspace/`。先測試移除首頁選單與標籤一致性，再更新圖、控制及綠色 tokens。
- [x] Integration: `npm run typecheck`、相關 `node --test`、scoped ESLint、`npm test`、`npm run build`、`git diff --check`；檢查真實瀏覽器、溢位與 console。
- [ ] Release: 僅 stage 本輪檔案，commit/push main；核對 GitHub Pages 工作流及正式 bundle/資產，記錄實際驗證與限制。

## 驗證記錄

- 實際 React renderer 47/47、資料夾 core/hook/UI 106/106 通過；獨立審查覆蓋帳號隔離、跨掛載草稿、晚到 RPC、刪除標記與上傳容量邊界。
- 型別檢查、修改來源檔案 ESLint、正式建置與 diff check 通過；本機瀏覽器實測首頁、問題 KPI/URL 篩選、資料夾部分失敗與重試、AutoCheck、AI，並檢查桌面與 390px 行動版。
- 全站測試 1182 項：1179 通過、2 個原有績效考核來源契約失敗、1 個選用 Pyodide 測試略過；2 個失敗已在本輪未改動的基線重現，不以全綠宣稱。
- 未修改 SQL、引擎或依賴；未以正式資料進行上傳、刪除或付費 AI 呼叫。瀏覽器資料夾選取不含空資料夾；待同步草稿僅保存在帳號隔離的記憶體，整頁離開提示依瀏覽器支援。
