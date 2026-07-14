# 簡化 AI 服務商金鑰設定設計

## 目標

把「新增 API 金鑰」改成使用者只需要選擇 AI 服務商並貼上 API Key。系統自動帶入標籤、官方 Base URL、建議模型並嘗試取得該 Key 可用的模型，不要求一般使用者理解 provider 代碼或 API 端點。

## 使用流程

1. 使用者從 Gemini、OpenAI、Anthropic Claude、OpenAI 相容／自訂四種服務商中選擇一種。
2. 使用者貼上 API Key；離開欄位後系統自動驗證並取得模型清單，也可按「重新驗證」。
3. 系統預選建議模型。若模型清單無法取得，保留建議模型並顯示可理解的錯誤，不阻斷儲存。
4. 使用者按「新增並啟用」完成。標籤預設為「服務商 API Key」。
5. 名稱、模型手動輸入、Base URL、說明、到期日及讀寫權限收進「進階設定」。

## 相容性

- 不修改 `api_keys` 資料表，沿用 `permissions.metadata` 儲存 provider、model 與 baseUrl。
- 舊 `gemini` 設定維持原值；已存在的其他 provider 以自訂相容服務顯示，不覆寫資料。
- Gemini 使用原生 `generateContent`；OpenAI 與 OpenAI 相容服務使用 `chat/completions`；Anthropic 使用 `messages`。
- 模型查詢失敗時不會清空 Key、表單或既有模型。

## 介面

- 服務商採可鍵盤操作的選擇卡，選中狀態使用既有青色／藍色語彙。
- API Key 使用單行密碼欄、顯示／隱藏與貼上按鈕，不再顯示「自動產生」以免誤導為外部服務商金鑰。
- 驗證狀態分為未驗證、驗證中、已連線、驗證失敗，訊息與色彩同時表達狀態。
- 主要按鈕固定為「新增並啟用」或「儲存修改」。

## 錯誤處理與安全

- API 回應解析統一處理服務商錯誤格式，錯誤訊息不顯示完整 Key。
- 驗證請求可取消，切換服務商或關閉對話框時不讓舊請求覆蓋新狀態。
- 不在 log 或 toast 中輸出 API Key。
- 這次不搬動既有金鑰儲存結構；伺服器端加密與代理屬後續安全強化範圍。

## 驗收

- 新增 Gemini、OpenAI、Anthropic 或自訂相容服務時，主要畫面只需選服務商與貼 Key。
- 選服務商後自動帶入正確預設值；模型查詢成功時可選模型。
- 舊金鑰可開啟、編輯與儲存且 metadata 不遺失。
- 鍵盤、焦點、loading、錯誤及小螢幕版面正常。
- provider helper 測試、TypeScript、變更檔 ESLint、production build 與瀏覽器流程全部通過。
