> 集中副本；原始路徑：`docs/audits/2026-10-13-user-file-spaces.md`；程式參考基準：`06c686951b17afa920cf325ddfec9114590aeee0`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# 使用者檔案空間與舊資料清理

## 完成範圍

- 檔案上傳側邊欄改為使用者名單；21 個既有 active 帳號各有一個固定 global 個人空間，登入者排列在前並顯示「我」。
- 空間在帳號啟用時自動建立，帳號名稱更新保留相同 space id；不提供任意新增、重新命名或刪除使用者空間的 UI。
- 「所有檔案」上傳預設寫入登入者個人空間；選取使用者時只列出該空間內容。一般使用者編輯自己的內容，管理員可管理其他使用者內容；既有 workspace 權限仍生效。
- 使用者明確要求清空本頁。先固定原有 30 筆檔案、1 個資料夾、14 個舊空間的 ID／object path 清單，再透過 Storage API 實體刪除 30 個物件。確認物件消失後才清除對應 metadata、資料夾、舊空間與 cleanup queue。未使用 Storage SQL DELETE 或全 bucket 清空。
- 清理後資料庫檔案 0、資料夾 0、舊空間 0、個人空間 21；原 30 個 Storage 物件 0。
- 最後檢查另外找到 17 個無檔案 metadata 的歷史殘留（12 個屬原空間、5 個是舊診斷測試檔）。固定這 17 個早於本輪作業的 path 清單，重新核對無 metadata 參照後透過 Storage API 清除。合計刪除 47 個 Storage 物件，最終此 bucket 的物件數 0，兩種 cleanup queue 也皆為 0；沒有使用全 bucket DELETE。
- 一次性清理 Edge Function 僅接受隨機 256-bit credential、固定 path 清單與有效期限，且先核對原 metadata。完成後立即換成無任何刪除能力的 410 回應並重新啟用 JWT 驗證。
- 補上已排入 cleanup queue 的物件 SELECT 授權，讓檔案 metadata 刪除後仍能透過 Storage.remove 完成實體清理；其他 owner 的待清理物件不可見。

## 驗證

- 檔案工作區 core、spreadsheet、平台與 UI 契約測試 95/95；實際 React renderer hook／上傳 UI 測試 14/14。
- TypeScript app/node、變更來源 ESLint、正式 build、git diff check 通過。
- 以真實 Chromium／Playwright 驗證實際元件與 repository／hook，後端使用隔離的合成 adapter；Browser plugin 未提供，因此使用 bundled Playwright 與已安裝 Chrome。桌面 1440×900、手機 390×844。
- 驗證 21 個使用者側欄、空表頭、一般使用者查看他人空間且上傳 disabled、個人建立資料夾／上傳、「所有檔案」上傳仍屬本人、篩選清除、重新整理保留上傳、手機側欄與無水平溢位；console errors 0。
- 正式資料庫 authenticated role 交易測試：21 空間可見、owner metadata 建立刪除、其他空間寫入拒絕、個人空間刪除拒絕、管理員編輯、原本無 workspace 權限者讀取拒絕、新帳號自動建立、姓名更新不重複，以及 owner cleanup SELECT／DELETE。所有測試寫入均 rollback，正式個人空間保持空白。
- 全站 1182 項：1179 通過、2 失敗、1 略過。兩項績效來源契約失敗與既有 `2026-10-13-workspace-corrections.md` 驗證記錄相同，該功能本輪未修改。
- Supabase advisors 已檢查。修改的三個既有 SECURITY DEFINER RLS helper 保留 authenticated-only 執行，具備有效 auth、active user、workspace permission 與 owner/admin 檢查。工具會對 exposed authenticated SECURITY DEFINER helper 給出一般提醒；trigger-only provisioning 放在非 exposed schema，撤銷 PUBLIC／anon／authenticated EXECUTE。其他既有 public helper 及非檔案模組提醒不屬本輪範圍。

## 實務限制

瀏覽器操作測試使用合成後端，未冒用真實使用者登入或上傳正式測試檔；正式權限以資料庫角色交易測試另行驗證。沒有將原本不能使用此工作區的帳號提升為其他工作區的編輯者。
