# Supabase 正式環境遷移操作手冊

最後更新：2026-09-20

本手冊適用於 `station-status-hub` 的 hosted Supabase。目標是在不重設資料庫、不重播全部歷史 migration 的前提下，安全登入、套用已審核的單一 migration，並留下可重跑的驗證結果。

## 1. 安全界線

- 不執行 `db reset`、刪除 schema、重建正式資料或未審核的歷史 migration。
- 不使用 `migration repair` 猜測或改寫正式 migration history；歷史整理必須另開工作並逐筆核對。
- 不把 access token、OAuth 驗證碼、密碼、service role key 或 `.env` 寫進文件、終端紀錄或 Git。
- GitHub Pages workflow 只建置與發布前端，**不會套用 Supabase migration**。資料庫變更必須另行完成並驗證。

## 2. 登入與 OAuth 過期復原

使用 PowerShell 啟動新的 CLI 登入：

```powershell
npx supabase login --no-browser --name codex-performance-fix --agent no
```

終端會等待一次性驗證碼並顯示新的登入網址。立即在瀏覽器開啟該網址，完成登入後，把顯示的 8 碼驗證碼貼回**同一個仍在等待的終端**。

若畫面顯示 `OAuth state has expired`：

1. 不要重整、返回或重用舊網址；OAuth state 只對建立它的那次 CLI 等待有效。
2. 回到終端按 `Ctrl+C`，結束舊的登入流程。
3. 重新執行上面的 `npx supabase login ...`。
4. 只使用新產生的網址與驗證碼，貼回新的等待流程。

登入後確認目前專案：

```powershell
npx supabase projects list
```

本儲存庫正式專案 ref 為 `rfppeuzuoxtqkpbwehbq`。執行任何寫入前，都要確認 CLI 的 linked project 與此 ref 一致。

## 3. 一般 migration 流程

先確認工作目錄乾淨，並檢查 migration 本身包含安全的既有物件判斷；正式 migration 應以 `begin;`／`commit;` 包覆：

```powershell
git status --short
npx supabase db push --project-ref rfppeuzuoxtqkpbwehbq --dry-run --include-all --skip-vault
```

若 dry-run 列出的只有預期 migration，才執行正式 `db push`。若它回報遠端 migration 在本機缺失、版本名稱無法解析或 migration history 不一致，停止一般 push，改走下一節；不要為了通過檢查直接 repair 或 replay 全部歷史。

## 4. History 不一致時的單檔安全套用

這是本儲存庫目前的受控例外。只允許套用已審核、可重複執行且有完整 transaction 的單一 SQL 檔。

先用唯讀查詢確認目標物件的現況，例如：

```powershell
npx supabase db query --linked "select column_name from information_schema.columns where table_schema = 'workspace' and table_name = 'performance_section_reports' and column_name in ('director_attachments', 'feedback_history') order by column_name;"
```

再只套用指定 migration：

```powershell
$migration = "supabase/migrations/20260920120000_complete_performance_feedback_workflow.sql"
npx supabase db query --linked --file $migration
```

`db query --linked --file` 會執行 SQL，但**不會補齊 Supabase migration history**。因此 migration 必須保持 idempotent，讓日後正式整理 history 後仍可安全重跑；不要把這個例外當成所有 migration 的預設部署方式。

## 5. 遠端驗證

至少驗證新欄位、RPC、trigger 與資料驗證函式都存在。績效流程目前可使用：

```powershell
npx supabase db query --linked "select exists (select 1 from information_schema.columns where table_schema='workspace' and table_name='performance_section_reports' and column_name='director_attachments') as director_attachments_ready, exists (select 1 from information_schema.columns where table_schema='workspace' and table_name='performance_section_reports' and column_name='feedback_history') as feedback_history_ready, to_regprocedure('workspace.review_performance_section_report_v2(uuid,text,text,jsonb,timestamp with time zone)') is not null as rpc_ready, exists (select 1 from pg_trigger where tgname='clear_section_report_current_feedback_on_resubmit' and not tgisinternal) as trigger_ready, workspace.performance_section_attachments_valid('[]'::jsonb) as empty_valid, not workspace.performance_section_attachments_valid('[1]'::jsonb) as object_rejected;"
```

驗證結果必須全部為 `true`。另外還要執行本次功能的相關測試、正式建置與實際頁面操作；只有 SQL 成功回傳不能代表完整流程已完成。

```powershell
npm run lint
npx tsc --noEmit
npm run build
```

若全專案已有無關的既存錯誤，必須記錄實際錯誤並改跑本次變更的 scoped tests，不得把未通過寫成通過。

## 6. 提交、部署與清理

確認差異只包含本次檔案後提交並推送：

```powershell
git status --short
git diff --check
git push origin main
```

等待 GitHub Pages workflow 完成，再開正式網址檢查登入、目標工作區、瀏覽器 console 與實際資料流程。再次強調：Pages 成功只代表前端已部署，不代表資料庫 migration 已套用。

作業完成後移除本機 CLI access token：

```powershell
npx supabase logout --yes
```

最後紀錄：migration 檔名、正式專案 ref、遠端驗證結果、測試／建置結果、Git commit 與 Pages run；不得記錄任何密碼、token 或一次性驗證碼。
