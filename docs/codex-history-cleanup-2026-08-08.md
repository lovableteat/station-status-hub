# Codex 歷史對話整理紀錄

日期：2026-08-08（Asia/Taipei）

## 目的

整理 Codex 在本機留下的歷史工作階段，保留可查閱的精華，刪除大量重複的系統提示、推理、工具輸出與過期原始 JSONL，降低本機掃描與啟動負擔。

## 整理範圍

只處理以下兩個工作階段目錄：

- C:\Users\銘三\.codex\archived_sessions
- C:\Users\銘三\.codex\sessions

未處理、未刪除：

- C:\Users\銘三\.codex\auth.json
- C:\Users\銘三\.codex\session_index.jsonl
- C:\Users\銘三\.codex\plugins
- 所有 SQLite、WAL、SHM 與鎖定檔
- 2026-08-08 仍在使用中的活動 session

## 分析結果

兩個目錄都是 JSONL，每行一個 JSON 事件。常見事件包括：

- session_meta、turn_context、world_state
- response_item
- event_msg
- tool/function call 與輸出
- reasoning、token_count、task_started、task_complete

原始容量：

| 來源 | 檔案數 | 大小 |
| --- | ---: | ---: |
| archived_sessions | 41 | 13,837,070,898 bytes（約 12.89 GiB） |
| sessions | 51 | 1,266,825,369 bytes（約 1.18 GiB） |
| 合計 | 92 | 約 14.07 GiB |

主要原因是工具輸出、命令結果、瀏覽器/代理輸出、推理內容與每個 session 重複保存的系統設定；它們不是使用者真正需要回看的對話精華。最大的單一 archived session 約 4.58 GiB。

## 精華保留策略

逐行串流讀取 JSONL，不把大型檔案整個載入記憶體。摘要只保留：

- session 的非敏感 metadata
- 使用者需求文字
- 助理最近的文字回覆
- 對話日期、工作目錄、標題、原始大小與解析統計

摘要排除：

- developer/system 指令
- reasoning 與 encrypted content
- function、MCP、瀏覽器及其他工具中間輸出
- 重複的環境設定與插件清單

摘要產物保存在本機：

- C:\Users\銘三\.codex\essentials\codex-essentials-2026-08-08.jsonl
- C:\Users\銘三\.codex\essentials\README.md
- C:\Users\銘三\.codex\essentials\codex-cleanup-manifest-2026-08-08.json

這些本機摘要可能含私人工作目錄或對話片段，因此不提交到 GitHub；GitHub 只保留本紀錄。

## 刪除策略

在刪除前先驗證：

1. 摘要存在且可解析。
2. 摘要共有 92 筆唯一 session 紀錄。
3. 刪除清單與保留清單沒有交集。
4. 解析錯誤為 0。
5. 活動 session 不在刪除清單。
6. 每個待刪檔案的路徑與大小仍符合 manifest。

實際刪除：

- archived_sessions：41 個封存原始檔全部刪除。
- sessions：刪除 14 天以前的 5 個原始檔。
- 總計刪除 46 個檔案、14,191,860,000 bytes（約 13.217 GiB）。
- 保留近期/活動 sessions：46 個檔案、約 0.849 GiB。

## 刪除後驗證

- archived_sessions：目錄保留，但原始檔數為 0。
- sessions：保留 46 個檔案、約 0.849 GiB。
- 刪除清單中仍存在的檔案：0。
- 2026-08-08 活動 session：仍存在。
- auth.json：仍存在。
- SQLite logs_2.sqlite：仍存在。
- plugins：仍存在。
- Git 工作樹：本次只新增本紀錄檔，未修改專案程式碼。

## 風險與限制

摘要可以保留「使用者需求與助理結果」，但無法重建完整的工具執行軌跡或推理過程。若日後需要查命令原始輸出，已刪除的 archived 原始檔不再可用；近期 sessions 仍保留以降低對目前 Codex 對話的影響。

## 後續建議

- 之後以 14 天作為 sessions 原始檔保留門檻。
- 定期保留精華摘要，避免重新累積完整工具輸出。
- 不要手動刪除 auth.json、SQLite、plugins 或活動 session。
