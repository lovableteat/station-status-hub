> 集中副本；原始路徑：`docs/superpowers/specs/2026-10-11-material-template-button-contrast-design.md`；程式參考基準：`22f669036d89108fe73cf4b74d4117f3e332739f`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# 上傳範本下載按鈕可讀性

## 範圍與原因

- 僅修正料號申請 `UploadGuideDialog` 的「下載上傳範本」按鈕；保留文字、圖示、原始 Excel、URL 與下載檔名。
- 正式站實測背景 `rgb(33, 32, 36)`、文字與圖示 `rgb(11, 11, 13)`，文字對比僅 **1.21:1**。
- `postcss-charcoal-palette.mjs` 將舊 `bg-cyan-500` 轉成深色背景，但原 `text-slate-950` 仍為近黑色。

## 決策

移除這個按鈕的舊色票覆寫，直接沿用共用 `Button` 的 `primary`／`primary-foreground` 與 hover、focus 樣式；保留粗體並避免窄桌機壓縮按鈕。不修改全站調色器或其他功能。

## 驗收

- 預設與 hover 狀態文字／圖示對比至少 4.5:1；鍵盤焦點可見。
- 桌機與 390px／768px 視窗中可讀、可點擊，高度至少 44px。
- 正式站實際點擊下載 Excel 成功，未修改任何 BOM 資料。
- 回歸測試、型別檢查、建置、程式碼審查通過後提交並推送，確認同一 SHA 的 GitHub Pages 部署。
