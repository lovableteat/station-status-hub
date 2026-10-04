# Gemini 本系統用量追蹤

本功能從 migration `20261004173000` 套用時開始追蹤。它只統計機台管理系統透過既有 API key record 發出的實際 provider attempts，不回填舊的 `usage_count`，也不宣稱是 Google AI Studio 專案的官方用量。

## 統計語意

- 一次實際 `fetch` 是一筆 event；同一 event ID 重送不會重複累加。
- retry 與 fallback 是新的 attempt，因此各自計數。
- outcome 分為 `started`、`succeeded`、`http_error`、`rate_limited`（HTTP 429）、`timeout` 與 `network_error`。
- RPM 是最近 60 秒的滾動 attempts；RPD 從 `America/Los_Angeles` 當日午夜起算。
- 畫面按 `api_key_id + model` 顯示，不臆測不同 key 是否屬於同一 Google project。
- 「估算可用範圍 0–N」的上界只等於公開限額減去本系統已觀測 attempts；下界固定為 0，因其他網站、其他 key 或同專案流量未知。
- 畫面同時顯示追蹤起點與分鐘／太平洋日窗口是否完整。即使窗口完整，也仍不等於 Google 官方剩餘額。

## 存取控制

- `workspace.ai_model_usage_events` 與 tracking state 啟用 RLS，`authenticated` 沒有直接 table privileges。
- 已登入且具 `ai-chat:view` 的使用者只能透過三個 `SECURITY DEFINER` RPC 開始事件、完成自己的事件及讀取去識別彙總。
- RPC 接收 key UUID，不接收 API key 秘密；開始事件會驗證既有 key 啟用、未過期、provider 相符，Gemini model 僅允許核准的三個 model ID。
- 彙總結果不回傳 actor ID、API key 或錯誤內容。
- 若開始事件無法持久化，前端不會送出 provider request，避免漏記。

## 部署與回復

先套用 migration，再部署前端；否則新的前端會因無法建立事件而拒絕送出 AI 請求。部署後以 API 管理測試頁各做至多一次無敏感內容測試，核對 event、summary 與畫面計數。

回復時先回退前端至前一版，再撤銷／移除三個 telemetry RPC。事件表可保留供稽核；只有在確認不需保留歷史後才刪除 `workspace.ai_model_usage_events` 與 `workspace.ai_model_usage_tracking_state`。舊 `api_keys.usage_count` 欄位未移除，回退後原有 `validate_and_update_api_key` 流程仍可使用。
