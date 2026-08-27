# 手機版網站 UI/UX 優化計畫

## 1. 建議安裝的設計技能

### 1. [atuizz/codex-ui-ux-skill](https://github.com/atuizz/codex-ui-ux-skill/tree/main/ui-ux) — 最推薦

這個 UI/UX quality gate 要求在開發前先釐清使用者任務與行動版主要操作，再處理響應式設計、可及性，以及 loading、empty、error 等介面狀態與瀏覽器驗證；也能將規範沉澱為 `DESIGN.md`、`FRONTEND_CONTRACT.md` 等專案治理文件。[查看 skill 說明](https://github.com/atuizz/codex-ui-ux-skill/blob/main/ui-ux/SKILL.md)

### 2. [pascalorg/skills 的 web-design](https://github.com/pascalorg/skills/tree/main/web-design) — 最完整的實作檢查表

此 skill 提供可直接套用於前端開發的檢查表，涵蓋 mobile-first、斷點與彈性排版、44px 以上觸控目標、文字與溢位處理、鍵盤可及性、元件狀態、動畫及 design tokens；適合在每次前端修改時作為工程規範與驗收依據。[查看 skill 說明](https://github.com/pascalorg/skills/blob/main/web-design/SKILL.md)

## 2. 稽核目的與範圍

本計畫依 `web-design` skill 從版面重排、文字可讀性、觸控操作、內容溢位、可及性、元件狀態與效能風險檢查現有 React／Tailwind 前端。範圍包含全站 shell、導覽、Dashboard、Test Tracker、Production Monitor、Test Plan、Issue、Material、Performance、Admin 與 Data Center。此次為程式碼靜態稽核；本機尚未安裝 `vite` 等相依套件，因此不把瀏覽器截圖、真機手勢或螢幕閱讀器結果視為已驗證，這些項目列入後續驗收。

## 3. 現況中應保留的良好基礎

- 主要全螢幕 workspace 多數已採 `100dvh`，行動版底部 dock 也預留 safe-area 與內容底部空間（`src/index.css`、`src/components/layout/MobileWorkspaceDock.tsx`）。
- 表單輸入在手機使用 16px 字級，可避免 iOS 聚焦時自動放大（`src/components/ui/input.tsx`）。
- Dialog 已限制於 viewport 並使用動態視窗高度，且全站尊重 `prefers-reduced-motion`（`src/components/ui/dialog.tsx`、`src/index.css`）。
- Test Tracker、Issue、Material、Performance 等資料頁已提供手機卡片，不需把桌面表格硬塞進窄螢幕。
- Test Tracker 的作用中篩選條件已有可見且可個別移除的 chip，方向符合本專案的持久篩選 UI 契約。

## 4. 優先改善項目

| 優先級 | 問題與程式碼證據 | 建議規格 |
| --- | --- | --- |
| P0 | `src/index.css` 對 `html/body/#root` 設定 `min-width: 320px`，並在根節點使用 `overflow-x: clip/hidden`。這會在窄 viewport、嵌入式 WebView 或放大狀態下裁掉內容，也會掩蓋真正造成溢位的元件。 | 移除根節點強制最小寬度與全域水平裁切；逐一修正子元件的 `min-width`、長字串、grid 與 flex shrink。只有明確的 carousel、tabs、board、canvas 可在自身容器水平捲動。 |
| P0 | 粗略指標規則只設定 `min-height: 44px`；共用 icon button 仍可能只有 24–40px 寬（`src/components/ui/button.tsx`、`mobile-dialog.tsx`、`sheet.tsx`）。 | 所有可點擊控制的實際 hit area 至少 44×44px；不可只放大圖示。補齊可辨識的 `aria-label`，並將通用元件的英文 `Close` 在地化。 |
| P1 | Dashboard KPI、Production Monitor lanes、Test Tracker board 與部分工具列依賴水平滑動，且多處隱藏 scrollbar，使用者不易知道右側還有內容。 | 一般資訊改為單欄／雙欄重排；主要工作流程不得依賴左右滑動。只有 carousel、lane、tabs 與 canvas 可保留，並提供邊緣提示、目前位置、鍵盤操作及將作用中項目捲入視野。 |
| P1 | 程式碼中大量使用 9–12px 文字，底部 dock 標籤也只有 10px。 | 一般內容與控制文字以 14–16px 為基準，輔助資訊不低於 12px；底部導覽標籤建議 11–12px，並驗證繁中換行與截斷。 |
| P1 | `100vh`、`100dvh` 與固定高度計算混用，Sheet 與長表單可能受到手機瀏覽器工具列及安全區影響。 | 全螢幕表面統一使用 `100dvh`／`svh` 策略，header/footer 加入 safe-area，內容區使用 flex + `min-h-0` 捲動，避免手算 `100vh - Npx`。 |
| P1 | Admin 行動版直接隱藏部分 metadata、權限或說明內容。 | 不因螢幕小而移除資訊；將次要資訊放入可展開區、詳情頁或 bottom sheet，並保留清楚的揭露入口。 |
| P2 | 部分狀態只透過顏色、toast 或 icon 傳達；loading、empty、error 與 disabled 的呈現不完全一致。 | 建立共用狀態規格：圖示＋文字＋顏色、持久的 inline error、可重試 error state、內容骨架 loading、保留資料欄位骨架的 empty state。 |

## 5. 各工作區的手機版方向

| 工作區 | 建議 |
| --- | --- |
| 全站 shell／導覽 | 保留 sticky header 與 bottom dock；帳號按鈕、Sheet 關閉鈕與 dock 項目皆達 44×44px。橫向 module tabs 應自動顯示作用中項目，並提供右側尚有內容的視覺提示。 |
| Dashboard | KPI 改為不需橫滑的 2 欄 compact grid；若項目具有明確順序才使用 carousel，且顯示位置與可捲動提示。 |
| Test Tracker | 預設手機卡片／表格視圖；board 是領域專用 lane，可保留為次要檢視但不作手機預設。詳細工作流程見 `docs/refactor/20260826-optimize-mobile-uiux/test-tracker-mobile-workflow-optimization.md`。 |
| Production Monitor | 為 280px lanes 提供「站點選擇器＋單站清單」手機模式；不要把左右滑動當成找到機台的唯一方法。 |
| Test Plan | 移除手機版內容區固定 `min-height`，讓 drawer、inspector 與主內容依 viewport 自然分配；試算表工具列可捲動，但主要儲存與返回操作固定可見。 |
| Issue／Material／Performance | 延續現有手機卡片；關鍵狀態與作用中條件應換行顯示，不能只有橫滑 chip。桌面表格欄位應在卡片中保留等價資訊或提供明確詳情入口。 |
| Admin | 將隱藏 metadata 與權限改成 disclosure；危險操作與一般操作分層，避免所有動作擠在單一橫滑列。 |
| Data Center | canvas、PCB、3D 相機等可保留雙指與水平手勢的領域例外；外圍工具列仍需 44×44px、明確模式提示、復原能力，且不得與瀏覽器返回手勢衝突。 |

## 6. 持久篩選 UI 契約的手機版落地

所有可搜尋／篩選的表格、清單、卡片與 lane 必須繼續遵守 `AGENTS.md`：篩選列緊貼結果區上方；共用欄位維持「搜尋 → 站點 → 狀態 → 負責人」；作用中 chip 永遠可見、可個別清除並有「全部清除」；自動條件與手動條件都同步 URL query；行動版可以收合排序與工具，但不得收合作用中條件。機台結果為零時，桌面表格保留表頭、手機卡片保留可辨識的結果容器，並使用完全相同的文字 `目前篩選條件沒有符合的機台`。

## 7. 建議實作階段

1. **建立基準：** 安裝既有相依套件，在 320、375、390、430px viewport 與 iOS／Android 至少各一台裝置記錄主要頁面、鍵盤開啟、旋轉與 200% zoom 結果。
2. **修正 primitives：** 先處理根節點 overflow、44×44px hit area、Sheet／Dialog 高度與 safe-area、文字下限、focus ring、inline error；由共用元件降低後續頁面重工。
3. **修正 shell 與資料頁：** 完成 header、dock、module tabs，以及篩選列、chip、空狀態與卡片／表格切換。
4. **修正核心 workflow：** 優先 Test Tracker 更新進度／建立問題，再處理 Production Monitor 與 Test Plan。
5. **處理複雜 workspace：** 為 board、canvas、PCB、3D 等手勢介面逐項建立手機專用操作與領域例外驗收。
6. **加入回歸保護：** 對關鍵 viewport 建立 screenshot／E2E 測試，並把下列驗收條件放進 PR template。

## 8. 全站驗收條件

- 在 320、375、390、430px 與 200% zoom 下，頁面根節點沒有非預期水平捲動，也沒有內容被裁切；刻意可橫滑的元件有明確提示且不帶動整頁。
- 所有主要操作、icon button、關閉鈕、chip 清除鈕與導覽項目的 hit area 至少 44×44px，相鄰目標保有足夠間距。
- 繁中標題、機台名稱、email、編號與未斷行字串能換行、省略或在局部容器安全捲動，不會撐破版面。
- 軟鍵盤開啟、瀏覽器工具列伸縮、橫向旋轉及有瀏海／Home Indicator 的裝置上，主要 CTA 不被遮住。
- 不以顏色作為唯一狀態訊號；鍵盤能抵達並操作所有控制，focus 可見，螢幕閱讀器名稱與視覺文字一致。
- loading、empty、error、offline、disabled、成功與未儲存狀態均有明確回饋；錯誤不只使用短暫 toast。
- 動畫遵守 `prefers-reduced-motion`，一般 UI 動畫維持約 150–300ms；不對 layout 屬性做高成本動畫。
- 篩選功能通過 `AGENTS.md` 的位置、順序、chip、URL、空結果、操作分層與行動版可見性要求。
