# Task 8 實作報告：互動式 SVG PCB 佈局編輯器

## 完成範圍

- 以毫米 `viewBox` 建立真正的 SVG PCB 畫布，固定圖層順序為 grid、board、keepouts、measurements、components、selection handles、tool draft、DRC overlay。
- 完成 25%–400% 縮放、滾輪縮放、中鍵／平移工具、符合板框、即時游標座標與 ResizeObserver 響應式適配。
- 完成元件庫點擊／HTML 拖放共用合法放置流程、元件與禁制區拖曳 preview、pointer-up 單次提交、Alt 暫停網格吸附。
- 完成選取、平移、測量、禁制區四種互斥工具，以及元件／禁制區／測量／板框右側屬性表單。
- 完成 Delete、方向鍵、Shift 細移、Ctrl/Cmd 快移、L 文件鎖定、Escape 取消暫態／選取、Ctrl/Cmd 復原重做。
- 完成 DRC 重算、篩選、點擊選取與置中、旋轉元件正確 overlay；DRC 僅報告而不阻擋有意草稿位置。
- 完成 BOM 逐筆／自動放置的單一原子歷史交易，undo/redo 同步恢復元件與待放置佇列。
- 完成內建 PNG 匯出、板框固定輸出範圍、包含網格選項、獨立於即時網格顯示與縮放的輸出、內嵌 SVG 標籤樣式。
- 完成窄版左右抽屜、不可見抽屜焦點隔離、DRC 自動開啟右抽屜，以及狀態列自動儲存時間。

## TDD 與回歸測試

依 RED→GREEN 流程新增或擴充：

- `editor-contract.test.ts`：SVG 事件、圖層順序、工具、拖放、鍵盤、檢查器、DRC、PNG、響應式抽屜契約。
- `editor-actions.test.ts`：合法／失敗放置、吸附／Alt、無吸附精確座標、移動 no-op、允許 DRC 草稿、禁制區拖曳、旋轉正規化、BOM identity。
- `editor-geometry.test.ts`：畫面座標轉毫米、吸附、中心附近合法放置。
- `workspace-state.test.ts`：選取／視圖／文件鎖、BOM 原子 undo/redo、重新載入後的待放置佇列歷史。
- `validation.test.ts`、`storage.test.ts`：板框範圍、旋轉範圍、無料號 BOM 元件的 JSON 與本機儲存 round-trip。

最終 PCB 測試共 83 項，全部通過。

## Read-only review

由同一個 fresh read-only reviewer 完成首次審查與修正後 re-review。

首次審查未發現 Critical，Important 發現均已修正，包括：

- PNG 板框裁切、網格選項、即時網格關閉時匯出網格、自包含樣式與縮放獨立性。
- 板框輸入範圍、旋轉正規化與無料號元件驗證／持久化。
- BOM identity 與 BOM 放置佇列的原子歷史。
- macOS 快移鍵、測量工具狀態、無吸附精確放置。
- 旋轉 DRC overlay、響應式抽屜焦點、窄版 DRC 面板開啟。
- PCB 範圍 TypeScript narrowing 問題。

最終 re-review 結果：沒有未解決或回歸的 Critical／Important 發現。

## 最終驗證

- `npm.cmd run test:pcb`：PASS，83/83。
- `npx.cmd eslint src/components/pcb-designer tests/pcb-designer`：PASS。
- `npm.cmd run build`：PASS，3431 modules transformed。
- `npx.cmd tsc --noEmit --project tsconfig.app.json --pretty false` 的 PCB 路徑診斷：0；完整專案仍有 Task 8 範圍外的既有 TypeScript 錯誤。
- `git diff --check 051d112b120dd5b2bb0e52d7d96f98e5532f3960`：PASS；僅顯示 Git 的 LF→CRLF 工作樹提醒。

Build 僅保留既有 Vite 警告：`occt-wasm` 的 browser externalization 與大型 chunk 提示。

## 驗證限制

已依 browser skill 嘗試啟用本機互動瀏覽器，但此工作階段沒有可用 browser backend（瀏覽器清單為空），因此無法執行 1024/768 焦點巡覽或 PNG 像素比對截圖。相關行為已以 source contracts、純邏輯回歸測試、focused lint、PCB TypeScript 掃描與 production build 覆蓋；此限制不影響上述自動驗證結果。

## Commit

本報告與 Task 8 的 `src/components/pcb-designer`、`tests/pcb-designer` 變更將以以下訊息提交：

`feat(pcb): add interactive SVG layout editor`
