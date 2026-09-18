# 績效送退件復驗 — 2026-09-16

本次改動將自評操作簡化為「提交」，主管保留「退回補充／提交」。已移除本機草稿還原、寫入及儲存至工作區按鈕。

## 查明的原因

- 正式考核 ID 為 text，包含 `performance-` 前綴；通知的通用 reference_id 為 UUID。改為在 metadata.review_id 保留原始考核 ID。
- 正式通知表分類只接受 mention/system/task/issue/test/general。原先 performance 分類會触發 CHECK 拒絕，已改為 system，績效用途仍由 notification_type 與 metadata 表示。
- 員工原先回寫整份考核，可能包含已遮蔽的主管欄位；舊本機草稿也會带入過期版本。新提交函式只更新各角色可寫的欄位，保留伺服器版本精度。
- 退回與通知原先分兩步處理，容易產生半完成狀態。現在同一交易寫入，失敗全部回復；重試沿用請求 ID，避免重複寫入。

## 已執行驗證

| 層級 | 結果 |
| --- | --- |
| 單元測試 | 25 項通過：提交欄位、版本、連線回覆遺失重試、通知收據、成功狀態、附件與逐筆回饋 |
| 隔離 PostgreSQL | 27 項通過：實際執行函式與 RLS；含強制通知失敗的交易回復、重試、併發版本衝突、管理員／非指定主管拒絕、分數保密 |
| 瀏覽器實際表單 | 兩輪提交／退回／員工收到通知與回饋／再提交／主管完成評分；首輪驗證未按新增的實績文字隨提交加入 |
| 正式 PostgreSQL | 以 authenticated 身分及現有組織關係完成兩輪提交→退回→重送→核准；驗證本人可讀通知、通知對應正確考核、重試與分數遮蔽 |
| 正式資料清理 | 正式模擬包於交易並 ROLLBACK；查詢確認測試考核、通知與提交收據皆不存在 |
| 建置／靜態檢查 | Vite 正式建置、變更的 TSX ESLint、git diff --check 通過 |

正式環境第一次模擬實際捕捉到通知分類 CHECK 錯誤，修正後重新完整執行通過；並將正式分類及優先序限制加入 PostgreSQL 測試。

全專案 TypeScript 檢查仍有既存 Supabase 型別與其他模組錯誤，未宣稱全專案型別檢查通過。瀏覽器測試使用隔離資料庫，未對正式員工送出測試通知。

## 重跑隔離測試

```sh
node --test tests/performanceReturnDelivery.test.mjs tests/performanceNotifications.test.mjs tests/rd2Assessment.test.mjs tests/assessmentItemEvidence.test.mjs
node tests/performanceSubmission.integration.mjs <PGlite package directory>
```

真正同時修改造成的版本衝突仍會拒絕覆蓋；錯誤時保留本頁輸入，不再清除或改寫主管已提交的資料。
