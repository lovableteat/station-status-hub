> 集中副本；原始路徑：`docs/audits/2026-10-13-comparison-feedback.md`；程式參考基準：`0b0dee080f02ceb8d58b38744fabe3b5d5f4bcfd`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# AutoCheck 意見收集驗證紀錄

2026-10-13 新增比對系統頁首「意見收集」。使用者填寫問題標題、分類與說明，可擷取畫面、貼上截圖或選取圖片；最多 5 張，每張 10 MB，支援 PNG、JPEG、WebP。只有送出才上傳雲端，同時記錄目前頁籤、比對名稱、版本、瀏覽器與畫面尺寸。

一般帳號只查看自己的回報；具比對查看權限的唯讀帳號也可回報。管理員在同一視窗的「回報管理」查看所有已送出資料、預覽私人截圖、更新處理狀態及備註。可匯出全部或目前篩選結果，ZIP 包含 `AutoCheck-feedback.xlsx`（問題清單、截圖索引）、所有截圖、`reports.json` 與使用說明。解壓縮後 Excel 相對連結可開啟對應截圖；截圖總量超過 500 MB 時提示篩選分批。

## 驗證結果

- 新增的資料驗證、送出／清理／重試、帳號切換、ZIP／Excel 與原有比對導覽測試共 20 項通過。
- TypeScript app/node 檢查、此次元件 ESLint 與正式建置通過。
- 真實 React 比對工作區搭配隔離測試資料，於 Chrome 的 1440×980 與 390×844 檢查回報、上傳、貼圖、擷取、取消擷取、私人預覽、唯讀帳號、個人紀錄、管理員處理、URL 篩選重整、全部／篩選 ZIP；沒有 console/page errors。
- ZIP 實際解壓並讀取 Excel，確認全部匯出 3 筆回報與 4 張截圖，篩選匯出 1 筆回報與 3 張截圖，清單、索引、JSON 與圖片一致；文字不被轉成 Excel 公式。
- 模擬上傳失敗後保留輸入、清除暫存並重試；提交成功但回應遺失時不重複送出；上傳途中切換帳號阻止後續提交，原帳號返回時可清除中斷暫存。
- `tests/comparison-feedback/security.sql` 在正式 Supabase 以 authenticated／anon 角色與交易回滾驗證唯讀提交、真實回報者快照、附件完整性、跨帳號隔離、管理員讀取／處理、衝突拒絕、已提交附件不可改刪及撤權／匿名拒絕；未留下測試回報或 Storage 物件。
- 新功能的安全 advisor 無警告；補上 reviewed_by 外鍵索引與 RLS initplan。新空表的 unused-index 資訊提示屬尚無真實流量的預期結果。

## 範圍與限制

擷取畫面的瀏覽器自動化使用真實 canvas MediaStream 驗證取圖與停止 tracks；未操作作業系統的原生分享選擇器。測試未登入或借用真實使用者帳號，正式網站驗證以部署產物與雲端權限檢查為準。兩項既有績效模組文字契約測試失敗及 Pyodide 環境 skip 與本次功能無關，未宣稱全站套件全部通過。

雲端已套用三筆 migration：`20261013113330_comparison_feedback_collection`、`20261013114809_comparison_feedback_admin_export_access`、`20261013121813_comparison_feedback_query_indexes`。私人 bucket、資料表與函式已就緒；新增功能在驗證完成時回報／截圖數均為 0。

測試畫面與結果另存於工作區外的 `outputs/comparison-feedback`，全部是合成測試內容。
