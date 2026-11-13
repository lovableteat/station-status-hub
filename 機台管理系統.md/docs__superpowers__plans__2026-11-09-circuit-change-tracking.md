> 集中副本；原始路徑：`docs/superpowers/plans/2026-11-09-circuit-change-tracking.md`；程式參考基準：`2c5dd8829effc42acd60f64089701abb57e481c2`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# 線路修改 Implementation Plan

**Goal:** 在 BOM 管理旁提供共享、可大量貼圖、逐項 review、可回查修訂及匯出圖片 Change List 的完整流程。

**Architecture:** 以穩定 BOM series 綁定修改批次。獨立新增共享資料表、具 revision 檢查的寫入 RPC、不可覆寫事件及私有圖片；React 工作區沿用原料號申請權限與元件。圖片縮圖和原圖分開，原 BOM 不變。

**Tech Stack:** React/TypeScript、既有 Dialog/Input/Button、Supabase Postgres/Storage/Realtime、ExcelJS。

## Global Constraints

- 使用者確認逐項確認／退回；所有料號申請編輯者可 review。
- 不修改既有 BOM／工程判斷／料件狀態；保留完整原圖與事件。
- 可多選、連續貼上與拖入至少 10 張圖；同名檔追加，部分失敗明列。
- 固定篩選列與可清除 chip；桌面及手機都實際點按主要流程。
- 過期 revision 回 HTTP409，不使用40001；失敗或衝突保留草稿。
- 不新增套件。新增資料表及 Storage 僅作用於線路修改。

## Tasks

- [ ] 1. 依 `types.ts` 固定資料／UI model 契約；文件記錄已確認流程。
- [ ] 2. 新增並驗證資料表、權限、私有圖片政策與 atomic RPC；事件記錄 snapshot。檢查 stale409、review 後重改與 actor。
- [ ] 3. 圖片3路上傳、縮圖、同名檔、部分失敗；可下載原圖；viewer 位置與框選標註。
- [ ] 4. repository 與 hook：載入、文字自動保存、切換上下文、草稿保留、衝突選擇、共享更新補載。
- [ ] 5. 新增工作區 UI、批次／項目清單、前後圖、逐項 review／退回意見、歷史；整合 BOM 旁與手機入口。
- [ ] 6. Change List Excel 嵌入所有指定範圍圖片與修訂紀錄，圖片失敗不宣稱完整匯出。
- [ ] 7. 必要單元／SQL／隔離雙視窗與手機點按驗證，測試產物與正式資料分開；建置、提交、推送並查核正式部署。
