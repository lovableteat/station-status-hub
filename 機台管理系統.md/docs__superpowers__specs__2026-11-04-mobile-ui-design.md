> 集中副本；原始路徑：`docs/superpowers/specs/2026-11-04-mobile-ui-design.md`；程式參考基準：`88f28c2affca63e061321412902fb835e2172685`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# 手機版 UI 設計（料號申請以外的工作區）

日期：2026-11-04。範圍：全站殼層與維修中心、檔案上傳、比對系統、Data Center、PCB Designer、後台管理、AI 問答、績效考核。料號申請頁依使用者指示本次不改，但本文的共用規則是它既有做法的歸納，之後料號頁也以此為準。

## 現況（2026-11-04 以 origin/main 在 375×812 實測）

- 殼層：頁首 64px、底部 dock 64px、頁面邊距 16px，但 `src/index.css` 先後寫了 52／56、76／74、64／64 三組值，測試與文件各抓到不同一組；AI 歷史抽屜、PCB 橫向短高度規則與短高度瀏覽器測試把 76px 寫死，和實際 64px 差 12px。
- 維修中心、檔案上傳、AI 問答、Data Center 已有專屬手機配置（卡片、工具抽屜、橫向模組列、全幅場景）。比對系統只把頁首動作收進 Popover 並堆疊欄位；後台管理、績效考核、PCB Designer 只靠 CSS 縮排。
- 寬表格在手機只有橫向捲動、沒有卡片：比對結果表（最小 920px）、後台使用者表、績效清單。
- toast 固定在畫面上方，會蓋住頁首的品牌與帳號按鈕（後台載入失敗時實測）；只有 AI 問答另外把 toast 移到 dock 上方。
- 次要工具的入口不一致：料號用 vaul 底部抽屜，檔案上傳與比對用 Popover，後台用側欄選單，績效用橫向導覽。
- 兩個手機測試在 origin/main 已經失敗且互相矛盾：`tests/mobile-design.test.ts` 要求維修側欄 `grid-cols-2`，`tests/mobileCoreWorkspaces.test.mjs` 與 2026-10-29 的提交要求單列橫捲；`tests/mobileFirstAdaptiveShell.test.mjs` 仍找 11-02 已移除的料號工具標記。

## 設計原則

1. **一個殼層、一套尺寸。** 頁首 64px、dock 64px、邊距 16px、觸控命中 44px、輸入文字 16px，全部只在 `src/index.css` 定義一次，其他地方引用 token，不再寫死。
2. **每個工作區在手機都有同一種「指揮列」。** 頁首下方第一列固定是：標題與上下文（專案／空間／版本）、最多兩個主要動作、一個「⋯ 工具」按鈕；次要動作、排序、匯出、說明一律收進底部工具抽屜，與料號頁相同。
3. **篩選列緊接結果之上，作用中條件永遠可見。** 搜尋滿版，Select 兩個一列，chip 可換行並可逐一清除；不得把作用中條件收進抽屜（AGENTS 第 7 條）。
4. **資料在手機是卡片，不是縮小的表格。** 卡片固定三段：標題列（主鍵＋狀態 chip）、資訊列（兩到四個 label-value）、動作列（最多兩個 44px 按鈕＋「更多」）。表格只在使用者主動切換「表格」時出現，並在自己的容器內橫捲。
5. **表單與詳情用全高度底部表單。** 手機上的建立／編輯表單一律使用共用 `MobileDialog`（≤767px 變成貼底的全高度表單：固定標題、內容可捲、固定底部按鈕列、避開安全區與軟鍵盤）；確認類維持 AlertDialog。
6. **回饋不擋操作。** toast 在 ≤1023px 顯示於 dock 上方、避開安全區，單則最多兩行；錯誤保留重試按鈕。
7. **畫布類工作區保留全幅場景。** Data Center、PCB 以場景為主，控制列在上、工具抽屜在下；手機不提供精細編輯，但要能看、能切換視角、能查資料。
8. **不改資料與權限邏輯。** 本次只改呈現與互動層；既有 handler、RLS、同步、匯出格式不變。

## 共用元件（新增於 `src/components/layout/mobile/`）

| 元件 | 用途 | 規格 |
| --- | --- | --- |
| `MobileCommandBar` | 每個工作區手機頁首第一列 | `data-mobile-command-bar`，高度 ≥ 56px；左：圖示＋標題（16px 粗體）＋上下文（12px、單行截斷）；右：`primary`（最多 2 個，44px，主色或 outline）＋ `tools`（44px icon，`aria-label="工具"`，開抽屜） |
| `MobileToolsSheet` | 次要動作、排序、設定、說明 | vaul `Drawer`，`max-h-[min(88dvh,44rem)]`，標題、說明、可分組的列（`min-h-12`，圖示＋文字＋右側 chevron／計數／switch），底部安全區 padding；選擇後自動關閉，除非 `keepOpen` |
| `MobileFilterBar` | 篩選列 | 搜尋 `Input h-11 text-base enterKeyHint="search"`；`controls` 以 2 欄 grid 排列；`chips`＋「全部清除」；`summary` 顯示「N／M 筆」 |
| `MobileRecordCard` | 卡片 | `article` 44px 可點標題區、`meta` grid、`actions` 兩欄；狀態 chip 用既有 CHIP 樣式；長文字 `line-clamp-2` 並以 `title` 保留全文 |
| `MobileDialog`（既有） | 表單 | 補 `footer` 插槽、`fullHeight` 選項與 `data-mobile-form` 標記；≤767px 時 `100dvh - 安全區`，標題固定、內容捲動、底部按鈕固定 |

這些元件只在 `lg` 以下渲染（由呼叫端以 `useIsCompactLayout()` 或 `lg:hidden` 控制），桌面版不受影響。

## 殼層

- `src/index.css`：刪除 52／56 與 76／74 兩組覆寫，只留 `:root`（桌面不使用）與 `@media (max-width:767px)` 的 64／64／16；`--mobile-active`、面板色票維持。AI 歷史抽屜、PCB 短高度規則改用 `var(--mobile-header-height)`。
- Toaster：≤1023px 固定 `bottom: calc(var(--mobile-shell-bottom) + 12px)`，寬度 `calc(100vw - 32px)`，不再貼頂；AI 問答原本的 188px 特例改為共用規則加作曲區高度。
- Dock 維持五格（首頁、維修、料號、AI 問答、更多）；「更多」抽屜改用 `MobileToolsSheet` 的列樣式，移除永遠不會出現的「後台管理」項，後台仍由帳號選單進入。
- 首頁列表維持，列高 76px 不變。

## 各工作區

### 維修中心（已有手機版，微調）
- 模組列維持單列橫捲（以 2026-10-29 的決定為準），修正 `tests/mobile-design.test.ts` 的舊斷言。
- 問題追蹤：頁首改用 `MobileCommandBar`（主要動作：新增問題；工具：匯出工廠報告、統計報告）；KPI 維持 2 欄；篩選列改 `MobileFilterBar`（搜尋 → 站點／狀態 → 負責人／嚴重度 → 追蹤狀態）。
- 新增／編輯問題表單改走 `MobileDialog` 全高度表單，底部「取消／建立問題」固定。
- L10 測試追蹤：卡片維持；工具（匯出、流程版本）收進抽屜。

### 檔案上傳
- 頁首：`MobileCommandBar`（標題「檔案上傳」、上下文＝目前空間／資料夾；主要動作：上傳；工具抽屜：新增資料夾、重新整理、選取模式、排序、空間切換、使用說明），取代 Popover。
- 列：移除列內「下載」按鈕，列可點＝開啟或進入；右側 44px「⋯」開該列動作抽屜（開啟、下載、重新命名、移動、刪除）。長按或工具抽屜的「選取模式」進入多選，底部出現固定動作列（下載 ZIP、移動、刪除、取消）。
- 預覽維持全螢幕；返回鍵回到清單。

### 比對系統
- 頁首：`MobileCommandBar`（上下文＝目前比對名稱／專案；主要動作：新比對；工具：審查匯出、位址庫、設定、處理位置、說明），取代 Popover。
- 建立比對表單：A／B 區塊各自可收合，必要檔案進度固定在區塊頂；提交按鈕固定於底部。
- 結果：手機改卡片（嚴重度 chip、分類、RefDes／Net、頁碼、訊息兩行、回覆狀態；點開回覆對話框）；篩選列 `MobileFilterBar`（搜尋 → 狀態／負責人 → 嚴重度／分類）並保留 chip；空結果文字沿用既有契約。切換「表格」才顯示 920px 表格橫捲。

### 後台管理
- 頁首：`MobileCommandBar`（主要動作：新增帳號；工具：角色、工作區權限、公告、API 金鑰、在線狀態等模組切換）取代側欄選單。
- 使用者清單改卡片：帳號／顯示名稱、角色與狀態 chip、最後登入、工作區數；動作列：編輯、權限、更多（停用／重設）。
- 指標改 2 欄卡片（與維修一致）。

### 績效考核
- 頁首：`MobileCommandBar`（上下文＝考核週期；主要動作：開始填寫自評；工具：組織架構、匯出、說明）。
- 階段導覽維持橫捲，加作用中項自動捲入視野。
- 清單（團隊檢視、紀錄）改卡片；自評／主管評核表單改 `MobileDialog` 全高度，分區可收合，儲存列固定在底部。

### Data Center
- 保留全幅場景與四個控制鈕；控制鈕改為 `MobileCommandBar` 的工具列樣式，工作回報為主要動作。
- 專案站點／機櫃設備維持 Dialog（10-31 已驗證），不重做。

### PCB Designer
- 手機改「檢視模式」：命令列顯示專案名稱與 2D／3D 切換；儲存／匯入／匯出收進工具抽屜；畫布占滿；左右面板維持 off-canvas 抽屜。
- 刪除未使用的 `.pcb-mobile-advisory` 樣式。

### AI 問答
- 歷史抽屜的 `top-[76px]` 改 token；其餘維持。

## 驗證

- 來源契約測試：新增 `tests/mobileShell.test.mjs`（token 單一來源、toast 位置、共用元件存在、命令列／抽屜在各工作區的使用）；修正 `mobile-design`、`mobileFirstAdaptiveShell` 的過時斷言並讓三個手機測試互不矛盾。
- 瀏覽器：`tests/auditMobileWorkspaces.browser.cjs`（Playwright，demo 登入不可用時改用各工作區既有隔離 fixture）在 390×844、320×568、844×390 檢查：無整頁橫向溢出、命令列與工具抽屜可開關、卡片動作 44px、toast 不蓋頁首、表單底部按鈕可見。
- 內建瀏覽器逐工作區目視，桌面版不變（1440×900 抽樣）。
- 每階段 typecheck、變更檔案 Lint、相關測試、build，提交後核對 Pages 部署。
