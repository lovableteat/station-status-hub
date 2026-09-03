# 績效組織、資料保護與標準部署

## 原表對照

原檔 `RD2_HW2_KPI-OKR_IDP_example.xlsx`，工作表「評分表」。SHA-256：`d7d7f39ebdf7294682f6014329a365e9e19e1d2a9d810019d7fdc78b285d5281`。
只讀取核對，未修改或上傳整份原檔。結構化標準在 `src/components/performance/rd2Standards.mjs`，保留來源格位、KPI 原文與題號。

| 範圍 | 用途 |
| --- | --- |
| A7:D9 | 數字職等權重三組 19／23、29／33、39／43 |
| B12:E12 | 四種 HW／FW 角色與重疊的職等範圍，不用來猜數字職等 |
| B13 | 完整 IDP 指引 |
| B14 | OKR 標準與歷史 2025Q4／2026Q1 範例，非當期強制目標 |
| C15:E15 | 共通績效與工作態度，原表 Junior 留白 |
| B16:E16 | HW Junior 7+3、Senior 6+2、Leader 9+4、Manager 9+5 項基本／卓越要求 |
| B17:E17 | FW Junior 7+3、Senior 6+3、Leader 9+5、Manager 9+4 項基本／卓越要求 |
| 第 18 列內嵌四圖 | 職責 13／19、23／29、33／39、43／49，獨立於權重與角色 |
| C20:G20 | 五級評分敘述 |
| A21:I41 | 三類各七題，共 21 題及原維度 |

待原標準擁有人確認：13／49 未提供權重；FW Leader 第八項使用 HW／hardware 字樣。介面保留原文並註記，不臆改規則。原表未提供總分換算公式。

## 部署順序

先資料庫、再前端。`.github/workflows/main.yml` 只部署 GitHub Pages，不執行 Supabase migrations。

1. 在正式前端所用 Supabase 專案確認 `workspace.system_users`、`workspace.performance_reviews`、`workspace.user_page_permissions`、`workspace.current_system_user_id()` 及 `workspace.current_user_can_workspace(text,text)` 可用，依維護流程備份資料庫。
2. 在同一交易按順序執行 `20260903120000_add_performance_organization.sql`、`20260903130000_protect_performance_groups.sql`、`20260903160000_remove_performance_organization_members.sql`。三檔位於 `supabase/migrations/`。可執行 `node scripts/prepare-performance-organization-migration.mjs`，產生含 BEGIN／COMMIT 的 `tmp/performance-organization-deploy.sql`；此命令只產檔，不連線或寫資料庫。已完成前兩份的既有環境使用 `--removal-only`，只部署人員移除更新，避免重複 migration 版本。
3. SQL 建立表、RPC、觸發器與 RLS，正規化可唯一辨識的舊員工 ID，保留舊主管及祖先保護範圍。不唯一的舊姓名不自動指派。產生的交易會核對考核內容與全站角色／權限雜湊並記錄所選 migration 原文；若不一致則整批回復。SQL 內含 PostgREST schema 重載通知。
4. 用測試帳號驗證下列案例，再合併前端並確認 Pages 發布成功。首次由管理員按部長→課長→成員順序建立關係。

不要盲目補跑全部歷史 migrations：既有 `20260901130000_assign_performance_managers.sql` 在本機 PostgreSQL 重播時因保留字別名失敗。新兩份 SQL 自行安裝 manager 判定、身份解析及 guard 觸發器，不依賴該份已成功執行。

## 驗收與回復

- 管理員可編輯全站帳號的績效組織，主管唯讀、員工被拒；全站角色與其他權限保持原值。部長看多課、課長不看其他課，禁止更改紀錄所屬員工及員工更改主管分數。
- 主管設密碼後，網站管理員與上級主管不能讀寫受保護列或讀取密碼雜湊。正確密碼只解鎖原授權範圍，員工仍可自評。
- 解鎖限登入、30 分鐘；連錯五次暫停五分鐘。變更需舊密碼並撤銷先前解鎖。移動員工或整課後仍保留原保護。
- 標準、權重、七題分類與原表一致，舊內容不重算／覆寫；確認回讀、匯出與新帳號入口。

交易失敗時整批回復，修正原因後重跑。資料庫保護啟用後若前端回退，仍保留較嚴格 RLS；不可重新加入舊管理員全讀政策、刪密碼表或清空 privacy_scope_ids。舊前端不支援清單編輯／解鎖，回退期間暫停績效填寫，避免新版欄位遺失。

## 本機驗證

```powershell
node --test tests/rd2Assessment.test.mjs tests/assessmentEntries.test.mjs tests/rd2Standards.test.mjs
node tests/performanceOrganization.integration.mjs <已安裝的-@electric-sql/pglite-套件目錄>
```

使用隔離安裝的 `@electric-sql/pglite@0.5.8` 與 pgcrypto，執行真實 PostgreSQL／RLS，不需要正式帳號或 token。瀏覽器使用本機測試服務，未寫入正式人事資料。

另可將未加 `--removal-only` 產生的 `tmp/performance-organization-deploy.sql` 作為資料庫測試第三個參數，驗證整份部署交易、內容保留檢查與 migration 記錄（共 58 項）。未提供第三個參數時執行 57 項資料庫檢查。新增案例涵蓋重複分類、移除與重新加入、過期版本、主管／員工無權移除、有下屬時拒絕，以及移除後仍保留歷史密碼與全站權限。

## 2026-09-03 部署記錄

已在正式專案 `rfppeuzuoxtqkpbwehbq` 套用兩份 migration（20260903120000、20260903130000）。整份交易成功並確認既有考核內容與全站角色／權限雜湊一致。部署前專案顯示最近一次自動備份為 14 小時前；沒有新增測試人事資料或替任何主管設定密碼。組織關係保留待管理員依實際名單設定，不猜測主管人選。
