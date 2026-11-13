> 集中副本；原始路徑：`docs/daily-production-stats-repair.md`；程式參考基準：`2c5dd8829effc42acd60f64089701abb57e481c2`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# 每日生產統計排程修復

正式專案：`rfppeuzuoxtqkpbwehbq`。核對與修復日期：2026-11-08。

## 原因與影響範圍

- `daily-production-stats`（job 1）啟用中，`0 23 * * *` 為 GMT 23:00、台北隔日 07:00。最近五次執行皆因 `schema "net" does not exist` 失敗。
- 舊指令的專案網址誤寫為 `rfppeuzmozxtqkpbwehbq`，與正式專案不符。
- `workspace.calculate_daily_production_stats()` 設定空的 search path，卻用未限定 schema 的資料表名稱。獨立執行重現 `relation "test_systems" does not exist`；只安裝 `pg_net` 仍無法解決完整流程。
- 舊 `daily_production_stats` 表原先只有 2025-07-05 一列。現行 `src` 沒有讀取這張表；`ProductionMonitor`、`ProductionHistory` 使用機台及測試進度資料。這個故障不能直接當作現行專案報表缺漏的證據，也不能據此排除外部程式使用舊表。

## 修正

已在正式資料庫套用 `20261108125016_repair_daily_production_stats_schedule.sql`：

1. 保留 job 1、原排程、啟用狀態與執行歷史，指令改為 `SELECT workspace.calculate_daily_production_stats();`。
2. 統計函式明確使用 `workspace.test_systems`、`workspace.system_settings` 與 `workspace.daily_production_stats`。未設定工作目標時回退為原預設 5。
3. 排程直接執行同一個資料庫函式，移除 HTTP、錯誤網址、Authorization 與 `pg_net` 依賴；既有 Edge Function 入口保留。

統計口徑維持原樣：伺服器 UTC 的 `CURRENT_DATE`、全站目前 `Done` 且 `updated_at` 落於該日的機台數、全域工作目標，以及週一至週五的工作日判斷。沒有改為台北日曆日、前一日參數或專案統計，也沒有回填無法可靠重建的歷史日期。

## 正式驗證

- `tests/sql/daily-production-stats-rollback-probe.sql` 已在正式資料庫通過。它以獨立來源查詢驗證計算值、同日重跑不重複，以及其他日期完整資料雜湊不變，最後全部回滾。
- 使用相同指令建立短暫驗證排程，run 385 於 `2026-11-08 12:51:29 UTC` 執行成功，耗時約 6 ms；驗證排程已移除，job 1 仍為原定時程。
- 正確專案的 `daily-stats` Edge Function 回覆 HTTP 200、`success: true`。
- 實跑產生 2026-11-08 統計列；原有歷史列雜湊、132 筆來源機台數與函式執行權限皆維持不變。
- 下次例行執行為台北 `2026-11-09 07:00`；本次驗證時該時刻尚未到達。

參考：[Supabase Cron 的資料庫函式排程](https://supabase.com/docs/guides/cron/quickstart#call-a-database-function-every-5-minutes)。本次沒有前端變更，也沒有安裝額外 extension。
