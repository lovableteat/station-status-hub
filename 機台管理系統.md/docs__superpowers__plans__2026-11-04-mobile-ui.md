> 集中副本；原始路徑：`docs/superpowers/plans/2026-11-04-mobile-ui.md`；程式參考基準：`2c5dd8829effc42acd60f64089701abb57e481c2`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# 手機版 UI（料號申請以外）實作計畫

使用者 2026-11-04 指示：設計手機版 UI，先不改料號頁，做其他工作區。設計見 [spec](./docs__superpowers__specs__2026-11-04-mobile-ui-design.md)。沿用黑底青綠、共用元件與 AGENTS 的篩選契約；不改資料、權限與匯出邏輯。

**Goal:** 全站殼層尺寸單一來源、toast 不蓋頁首；每個工作區在手機都有同一種指揮列與工具抽屜；寬表格在手機改卡片。

**Architecture:** `src/components/layout/mobile/`（MobileCommandBar、MobileToolsSheet、MobileFilterBar、MobileRecordCard）＋ `MobileDialog` 全高度表單；各工作區只在 `useIsCompactLayout()` 為真時渲染手機分支，桌面 JSX 不動。

- [x] 殼層：index.css 只留 52／56（平板）與 64／64／16（手機）兩層 token，刪除 76／74 與重複的 64 覆寫；AI 歷史抽屜、PCB 短高度規則改用 token；toast（Radix viewport 與 sonner）在 ≤1023px 固定於 dock 上方；dock 的更多清單移除永遠不會出現的後台項。
- [x] 共用元件：四個手機元件與 CSS（44px 目標、48px 抽屜列、chip 36px）；`MobileDialog` 新增 `fullHeight`、`MobileDialogBody` 與固定底部按鈕列。
- [x] 檔案上傳：手機指揮列（空間入口、標題／目前空間或選取數、上傳檔案、工具）；工具抽屜分「上傳與建立／選取項目／排序與檢視／資料夾」；列內下載／預覽改為單一 44px「⋯」開啟該列動作抽屜。
- [x] 比對系統：頁首工具改底部抽屜（說明、意見、備份、處理位置）；結果在手機改卡片並提供卡片／表格切換；篩選列改兩欄 grid、chip 與空結果文字不變。
- [x] 後台管理：指揮列（模組上下文、新增帳號、管理選單抽屜含模組切換與登出）；隱藏首段重複的新增帳號。
- [x] 績效考核：指揮列（目前階段上下文、考核功能抽屜可跳到各階段），階段清單與側欄共用同一份過濾。
- [x] PCB：移除未使用的 `.pcb-mobile-advisory` 樣式。
- [x] 測試：`tests/mobileShell.test.mjs`（token 單一來源、toast、共用元件、各工作區接入）、`tests/auditComparisonResultsCards.integration.cjs`（手機結果卡片渲染）、`tests/auditMobileWorkspaces.browser.cjs`（Playwright：390／320px 無溢出、指揮列與抽屜可開關、dock 可及、toast 在 dock 上方）；修正 `mobile-design`、`mobileFirstAdaptiveShell` 過時斷言。
- [x] 文件：UI 規則 §9 補手機共用元件與回饋位置；篩選稽核補比對結果手機卡片。
- [ ] 推送後核對 Pages 部署與正式資源。

## 2026-11-04 驗證結果

- 型別檢查 0 錯誤；變更檔案 ESLint 乾淨（績效頁一則 `exhaustive-deps` 警告為既有）；正式建置通過。
- 單元與來源契約：1,902 項，3 項失敗皆為 origin/main 既有（`materialRequestPresentation` 固定欄配色、兩項績效測試），與本次無關；`mobileShell` 9 項、`auditComparisonResultsCards` 3 項新增通過。
- Playwright 手機稽核：檔案上傳、比對、後台、績效、維修問題頁在 390×844 與 320×568 無整頁橫向溢出；指揮列工具鈕與抽屜關閉鈕皆 ≥44px，抽屜可開關；dock 可及；toast 位於 dock 上方。
- 內建瀏覽器目視：toast 不再蓋頁首、AI 歷史抽屜貼齊 64px 頁首、檔案列「⋯」44×44、比對工具抽屜、後台與績效抽屜；桌面檔案頁三欄配置不變。
- 以 demo 登入在開發伺服器操作，未讀寫正式資料；未實測實體手機。

## 未納入本次

- 料號申請頁依指示不動；它既有的工具抽屜與卡片是本規格的來源。
- Data Center 與 AI 問答維持 10-31 已驗證的手機配置，只修 token。
- 維修中心的新增問題表單尚未改為 `MobileDialog` 全高度（目前已接近全螢幕且底部按鈕固定）；績效自評／主管表單同樣保留原對話框。
- 未實測實體手機（Safari、軟鍵盤、PWA）。
