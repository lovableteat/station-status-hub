# Gemini 三模型獨立操作設計

## 問題

PR #44 把三個 Gemini 模型顯示為配額說明卡，但真正可操作的 API key 列仍只綁定一個儲存模型。使用者無法從 API 管理介面把同一把既有 Gemini key 分別選用於三個核准模型，也看不到可信的模型別用量狀態。

## 已確認的根因

- `api_keys.permissions.metadata.model` 是單一字串，現有測試入口只把整筆 key record 傳給 `ApiDataPreview`，因此測試頁只能使用該字串。
- PR #44 的三張卡只比對哪一筆 key 儲存了該模型，沒有把 model 當成可操作 target。
- `usage_count` 是 key 級累積值。AI Chat 在每次請求嘗試前呼叫 `validate_and_update_api_key`，所以 retry 與失敗也會增加；API 測試頁的 Gemini 呼叫則不會增加。
- 現有資料沒有 model、Google project、結果、retry、時間窗或重置時區，不能支援可信的 RPM/RPD 或剩餘額。

## 採用方案

每一筆既有 Gemini key 產生三個獨立模型操作項，依政策順序為：

1. `gemini-3.5-flash-lite`，日常預設。
2. `gemini-3.8-flash`，手動選用。
3. `gemini-2.5-flash`，手動選用。

每個模型操作項顯示模型名稱、模型 ID、專案共享配額快照、是否為該 key 目前儲存的日常模型、所關聯的 key 名稱與遮罩值，以及查看、複製和「選用並前往測試」按鈕。三個項目都直接引用同一個既有 key record，不建立新的 key 或秘密副本。按鈕把該 record 與 model override 傳到既有 API 測試頁；不更新 `permissions`，所以測試一個模型不會覆寫另外兩個模型，也不改變既有日常設定。

AI 資料助理的模型選擇器也把每一筆既有 Gemini key 展開為三個 key + model target。target 僅保存 key record 參照與 model ID；選擇 3.5 Flash-Lite 或 3.8 Flash 時，請求建構、目前模型 badge、側欄目前模型與新會話快照都必須使用該 target 的 model override，不能重新讀取 `permissions.metadata.model` 把選擇改回 2.5 Flash。

刷新頁面時使用政策日常預設 `gemini-3.5-flash-lite`。重複切換 target 必須保持 selector、request model 與畫面標籤一致。既有會話已保存的 `model` 欄位保留；恢復仍受支援的舊會話時，選回同 key 名稱與歷史 model 的 target。歷史 model 已不受支援時，不覆寫其歷史標籤，也不把未核准 model 加回 selector。

## 安全邊界

- 不建立或複製新的 Google key。
- 每個模型操作項都可看見所關聯的 key 名稱與遮罩值，並沿用既有查看與複製安全邊界。
- 三個操作項都引用同一個 `record.api_key`；不把秘密寫入新 state、metadata 或資料列。
- 查看狀態以 key id 與 model id 的操作目標識別，查看一個模型時不會連帶揭露另外兩張卡或底部 key 表格。
- 不新增資料表、RPC、RLS、grant、Edge Function、OAuth、IAM 或帳單設定。
- 測試 model override 僅存在於前端狀態，不寫回資料庫。
- Gemini selector 的三個 target 共用同一個 key record 參照，不建立三筆 credential。

## 用量呈現

三個模型操作項各自顯示：`本系統用量：尚未開始按模型統計`。移除所有 `剩餘額：未同步 Google` 文案，也不把 `usage_count`、0 或配額上限顯示為模型剩餘額。

卡片補充說明 Google 配額屬專案共享範圍，不是每把 key 各有一份；目前畫面只呈現使用者提供的配額快照，不宣稱 Google 即時剩餘。

## 後續用量方案，暫不實作

### Best-effort 本系統事件

新增 `workspace.ai_usage_events` 與受限 RPC，至少記錄 `api_key_id`、provider、model、request_group_id、attempt_number、is_retry、outcome、http_status、occurred_at、usage metadata。RLS 僅允許有 AI workspace 權限的使用者寫入與檢視聚合。由瀏覽器呼叫仍可能漏記或被繞過，因此只能標示為本系統 best-effort。

### 可靠跨使用者統計

把 Gemini 呼叫集中到 Edge Function／server proxy；函式依授權讀取既有 key、呼叫 Google，並交易式記錄每次 attempt。成功、429、其他 HTTP 錯誤與 network error 都需有明確 outcome；retry 以相同 request group、不同 attempt 計數。這會改變 credential 存取與安全權限，需另行核准。

### Google 官方實際剩餘

需要 Google project 對應與官方 quota metrics 所需的 OAuth/IAM 等配置。未獲額外授權前不建立，不以本系統事件替代官方數字。

## 驗收條件

- 一把現有 Gemini key 在 API 管理介面產生三個獨立模型操作項。
- 三個操作項均清楚顯示共用同一把既有 key，並各自提供遮罩、查看與複製操作，但不建立秘密副本。
- 任一模型可被選用並送到 API 測試頁；測試頁顯示該 override 模型。
- AI 資料助理 selector 顯示三個 key + model target；選擇任一 target 後，實際請求與所有目前模型標籤使用該 model。
- 新會話、刷新、重複切換與受支援的歷史會話恢復保持 target、請求與標籤同步；舊會話的歷史 model 資訊不被改寫。
- 選用模型不更新既有 key permissions 或儲存模型。
- 三個模型各自顯示「尚未開始按模型統計」，不顯示 Google 剩餘額。
- 非 Gemini key 的既有表格與所有 key 管理動作維持不變。
- 測試涵蓋三模型入口、override 不持久化、遮罩邊界、用量狀態與錯誤／重試語意缺口。
