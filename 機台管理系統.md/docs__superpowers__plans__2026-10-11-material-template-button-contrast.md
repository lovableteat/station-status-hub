> 集中副本；原始路徑：`docs/superpowers/plans/2026-10-11-material-template-button-contrast.md`；程式參考基準：`0b0dee080f02ceb8d58b38744fabe3b5d5f4bcfd`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# 上傳範本按鈕修復計畫

> 依已確認的連續執行規則，直接完成實作、驗證、提交、推送與部署，不再要求一般階段確認。

設計：`../specs/2026-10-11-material-template-button-contrast-design.md`

1. 在 `tests/materialRequestTableLayout.test.mjs` 加入下載按鈕沿用共用色票與保留 native download 的回歸檢查，先確認舊程式失敗。
2. 僅修改 `MaterialRequestPage.tsx` 中 `UploadGuideDialog` 的按鈕 class，沿用既有 Button。
3. 執行料號與主題測試、ESLint、typecheck、build；用真實瀏覽器確認預設、hover、鍵盤焦點、390px／768px／桌機及範本下載。
4. 唯讀審查 diff，合併 main、推送；核對 GitHub Pages 同 SHA 部署成功後，在正式站重驗並留下截圖。

資料安全：不匯入、刪除或更新正式 BOM；不修改 `.claude/`。回退只撤銷本次 UI commit，不涉及資料庫。
