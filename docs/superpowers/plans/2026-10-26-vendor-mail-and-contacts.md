# Vendor mail and contacts implementation plan

> **For agentic workers:** Execute the independent parser, export, and storage work in parallel; integrate and verify the complete user flow before release.

**Goal:** 供應商信件主旨可自動產生與修改，個人聯絡簿可預覽匯入及手動增修。

**Architecture:** 沿用現有 `PendingMailDialog` 與離線 HTML 匯出；新聯絡簿逐列存於 `workspace.supplier_contacts`，使用既有帳號映射與 owner RLS。匯入只新增及跳過重複，手動儲存採 timestamp compare-and-set。

**Tech Stack:** React、既有 shadcn 元件、SheetJS、Supabase/PostgreSQL；不增加套件。

## Constraints

- 維持黑底青綠及 AGENTS 的持久篩選、可及性與 CE 契約。
- 只匯出／複製，不寄信，不上傳聯絡清單到第三方分析服務。
- 聯絡簿按真實登入帳號隔離；不將個人聯絡資料放入全員共用偏好表。
- 匯入前可見錯誤列及新增／重複筆數；不覆蓋、不刪除原清單。
- 既有未提交文件保留；schema 變更只新增此功能專屬表與觸發器。

## Tasks and verification

- [x] Export: `materialRequestExport.ts`／`materialRequestUsageExport.test.mjs`，先 RED 再驗證手改主旨、to/cc、HTML escape 與獨立複製。
- [x] Parser: `vendorContacts.ts`／`vendorContacts.test.mjs`，測中英文欄位、錯誤行號、地址去重、保留人工資料。
- [x] Storage: `vendorContactsStorage.ts`／`vendorContactsStorage.test.mjs`，測分頁、owner filter、CAS、整批 ignoreDuplicates、失敗不報成功。
- [x] Controller and panel: `useVendorContacts.ts`、`VendorContactsPanel.tsx`、`vendorContactsController.render.cjs`；驗證跨帳號晚回應、保留失敗草稿、匯入預覽與持久搜尋 chips。
- [x] Integrate: `MaterialRequestPage.tsx`，每家主旨 input、自動產生、聯絡簿與收件人預覽；保留開頭／簽名與原匯出方式。
- [x] SQL: CLI 產生初始檔，正式檔名對齊已驗證的部署歷史 `20261026095758_supplier_contacts.sql`；transaction 測試 owner CRUD／匿名拒絕／跨帳號隔離／CAS／匯入原子性，正式套用後再 rollback 測試一次。
- [x] Browser: 隔離假資料頁實測匯入、錯誤列、重複、手改、重開、改主旨、匯出 HTML 及 1280×884／390×844 桌面與手機，頁面無橫向溢出。
- [x] Release checks: 190/190 scoped tests、typecheck、scoped lint、build、diff check；獨立覆核通過。

發布步驟：只 stage 本次檔案，commit/push，再核對同一 SHA 的 Pages 與正式 bundle；部署結果以實際 workflow 為準，不預先宣稱完成。

補充：CSV UTF-8（含／無 BOM）與 Big5 解碼、電話前導零及超限拒絕均有實際 SheetJS 測試。聯絡簿讀取沿用 20 秒 deadline／abort，寫入不設會造成成功與失敗不明的 timeout。

**Storage interface:** `loadVendorContacts(ownerId)`、`saveVendorContact(ownerId, contact, expectedUpdatedAt?)`、`importVendorContacts(ownerId, contacts)`。

**Rollback boundary:** 應用可回退本次 commit；不刪除聯絡表或使用者已儲存的聯絡資料。
