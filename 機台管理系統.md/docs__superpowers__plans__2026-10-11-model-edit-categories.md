> 集中副本；原始路徑：`docs/superpowers/plans/2026-10-11-model-edit-categories.md`；程式參考基準：`06c686951b17afa920cf325ddfec9114590aeee0`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# 模型資料編輯分類 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 使用者已授權連續實作、驗證、提交與推送，不再詢問一般階段確認。

**Goal:** 讓 Data Center 模型資料編輯的基本資料、尺寸與設備安裝規格一眼可辨識。

**Architecture:** 只重排 ModelLibrary 的 edit JSX 與局部 CSS。使用原生 fieldset／legend 分組，保留原 state、callbacks、數值界限與保存流程；取消／儲存列移出 ScrollArea，沿用既有底部動作區。

**Tech Stack:** React、TypeScript、Tailwind、既有 Button／Input／Select、Lucide、Node test。

## Global Constraints

- 不改其他工作區、資料、模型 ID、3D 資產、權限、校正與安裝邏輯；不新增依賴。
- 保留既有配色與字體。視覺參考：背景 #0C0C0D、內容 #1B1B1D、分區 #2A2A2D、文字 #F4F4F6、青綠 #62CBBB、琥珀 #CDA05D；實作僅使用既有 tokens／動作色。
- 間距採 8px 標籤、16px 欄位、24px 分組；欄位及操作至少 44px。手機尺寸欄位縱排，避免長小數被壓縮。
- 實際瀏覽器僅編輯草稿並取消，不點儲存／安裝／刪除；本機與正式站共用配置，不當作隔離資料。
- `.claude/` 使用者未追蹤檔案保留，不提交。

## 設計比較與自評

只放大現有標題仍無法解除用途混排；分頁會隱藏欄位並增加切換。採取可見的完整標題列與緊接欄位，保持工具表單熟悉的密度，沒有裝飾性卡片或新配色。

- 基本資料：模型名稱、廠牌、版本。768px 以上三欄並列，640–767px 名稱一整列加廠牌／版本並列，更窄螢幕全部縱排。
- 實體校正尺寸：寬／深／高，標籤持續顯示 mm。
- 安裝規格：僅櫃內設備顯示設備類別與占用高度（U）。
- 取消與儲存：固定底部；不新增功能與資料欄位。

## Task 1: 分組與操作區

**Files:** Modify `src/components/data-center/DeploymentPlanningCenter.tsx`、`src/components/data-center/data-center.css`; Test `tests/dataCenterModelCatalogEditing.test.mjs`。

**Interfaces:** Consumes `selectedModel`、`editDraft`、`setEditDraft`、`saveSelectedModel`、`setView`。Produces 同一份編輯草稿與原 callback，不新增介面。

- [x] 先新增回歸：各 `<fieldset className="dc-model-edit-section">` 依 `<legend>` 明確分類，基本資料不得含設備類別；安裝規格保持 l10 條件；取消／保存按鈕位於 `</ScrollArea>` 之後。
- [x] 執行 `node --test tests/dataCenterModelCatalogEditing.test.mjs`，確認舊碼 3 項新增契約失敗（未分組、操作未固定、缺少局部樣式）。
- [x] 最小實作：`<fieldset className="dc-model-edit-section"><legend><Box className="h-4 w-4" />基本資料</legend><div className="dc-model-edit-fields sm:grid-cols-2 md:grid-cols-3">` 容納名稱、廠牌、版本；尺寸用同一結構與 `sm:grid-cols-3`，安裝欄位在 l10 分組。CSS 用 `.dc-model-edit-section > legend` 的 secondary 背景、border、16px 字與8px圖示間距；既有 `saveSelectedModel` 移至 `dc-model-actions dc-model-edit-actions`，禁用條件保留 `!editDraft.name.trim()`。目視發現首次桌機開啟尺寸需捲動，先新增桌機三欄回歸並確認失敗，再縮減標題列垂直間距與並排基本資料。
- [x] 執行 Data Center／facility 所有 Node 測試：148/148；範圍 ESLint、`npm run typecheck`、`npm run build`、`git diff --check` 通過；layout detector 結果為空。
- [x] 實際檢查 1280×720、1024×600、390×844、320×740：桌機首次開啟六欄完整可見，小螢幕尺寸可捲到且無橫向溢出，控制與固定 footer 按鈕皆44px。空名稱禁用、修改草稿後取消／重開恢復原值。l10 實際切換設備類別，U 高度100→48、0→1，取消後恢復運算／1U。Console 無 warn/error；分類標題與提示對比13.03:1／8.34:1。
- [x] 兩路獨立版面評估與原始碼審查完成；最終審查無 Critical、Important 或 Minor 問題。相關資料綁定、clamping、save／cancel callback 未改動。

發布步驟：提交並推送 main；核對 Pages exact SHA 與正式畫面，保留 Git 外 `model-edit-categories-2026-10-11` 截圖／驗證紀錄並重設瀏覽器尺寸。部署成功前不宣告完成，本檔不作為部署成功證據。

發布門檻：所有既定檢查通過才宣告完成；實體手機與全儲存庫測試不在本次 UI 驗證範圍。
