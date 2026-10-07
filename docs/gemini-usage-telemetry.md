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

## 查詢恢復與等待上限（2026-10-07）

正式用量事件顯示，最近兩天 `gemini-3.8-flash` 有 16 次 HTTP 503，最長等待約 115 秒；此金鑰沒有設定到期日。Google 的 [錯誤說明](https://ai.google.dev/gemini-api/docs/troubleshooting) 將 503 列為暫時服務繁忙，不能據此判定登入或金鑰過期。

- Gemini 文字／附件查詢的自動替代模型只使用同一金鑰、同一端點的已配置模型，優先 Flash-Lite。圖片生成不跨模型替代。切換後顯示本次實際模型，不改寫金鑰設定或清空對話。
- 單次文字請求包含用量開始紀錄、網路連線及完整回應下載，最多 25 秒；附件請求最多 45 秒。整輪最多 3 次，文字最多 75 秒、附件最多 90 秒。維修資料檢索另有 15 秒上限，檢索失敗不會轉成無來源回答。
- 繁忙與逾時模型暫避 90 秒；每分鐘額度依 `Retry-After`／Google `RetryInfo` 等待，缺少指示時至少 60 秒；每日額度等到太平洋午夜。暫避資料保存在本分頁 sessionStorage，不包含金鑰。
- 驗證／權限、內容設定、帳務與用量開始紀錄錯誤立即停止，不反覆消耗請求。額度不足不能靠增加同專案金鑰解除。
- 用量開始紀錄最多等 8 秒，失敗仍禁止發送未追蹤請求；完成紀錄在背景寫入且最多等 8 秒，不再擋住已收到的答案。網路或分頁關閉可能留下 `started` 事件，不能把它視為成功回應。
- 連按送出只接受一輪請求；錯誤訊息保留給使用者閱讀，但不送回模型作為對話上下文。

驗證命令：`node --test tests/aiRequestRecovery.test.mjs tests/aiProviderFetchDeadline.test.mjs`；另以隔離的 React 18 QA 套件及 `AUDIT_QA_DIR` 執行 `node --test tests/aiChatRecovery.render.cjs`。這些使用模擬服務，未消耗正式 Gemini 額度。此執行環境未連接瀏覽器，桌面／手機目視與真實供應商端到端回覆尚未驗證。

## 部署與回復

先套用 migration，再部署前端；否則新的前端會因無法建立事件而拒絕送出 AI 請求。部署後以 API 管理測試頁各做至多一次無敏感內容測試，核對 event、summary 與畫面計數。

回復時先回退前端至前一版，再撤銷／移除三個 telemetry RPC。事件表可保留供稽核；只有在確認不需保留歷史後才刪除 `workspace.ai_model_usage_events` 與 `workspace.ai_model_usage_tracking_state`。舊 `api_keys.usage_count` 欄位未移除，回退後原有 `validate_and_update_api_key` 流程仍可使用。
