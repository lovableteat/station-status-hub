# Gemini 免費模型政策設計

## 目標

機台管理 AI 對話在不新增付費、憑證或資料庫權限的前提下，提供三個已由使用者確認可用的 Gemini 免費專案模型。新建或未設定的 Gemini 金鑰預設使用 `gemini-3.5-flash-lite`；既有已儲存模型保持不變，必須由使用者在既有金鑰編輯流程中明確選擇並保存。

## 核准範圍

- 提供 `gemini-2.5-flash`、`gemini-3.8-flash`、`gemini-3.5-flash-lite` 三個可操作選項。
- 將 Gemini 新預設由 `gemini-2.5-flash` 改為 `gemini-3.5-flash-lite`。
- 顯示下列專案限制，來源明記為「2026-10-04 Google AI Studio 免費專案截圖」，不是永久官方通用配額：
  - Gemini 2.5 Flash：5 RPM、250K 輸入 TPM、20 RPD。
  - Gemini 3.8 Flash：5 RPM、250K 輸入 TPM、20 RPD。
  - Gemini 3.5 Flash-Lite：15 RPM、250K 輸入 TPM、500 RPD。
- 剩餘額顯示「未同步 Google」，並說明配額按專案共用、不同 API Key 可能屬於同一專案、RPD 於太平洋時間午夜重設。
- 自動 retry 可以重試同一模型及輪替到設定為相同模型的其他金鑰，不得跨模型 fallback。

## 資料來源與準確度

Google Gemini Models API 只提供模型與功能資訊，不提供專案剩餘額。現有 `api_keys.usage_count` 是每筆金鑰的累積嘗試次數，包含失敗與重試，不能代表 Google 專案的 RPM、TPM 或 RPD 剩餘量。本次不新增 Google IAM、OAuth、服務帳戶、管理金鑰或 Supabase 用量事件表，因此 UI 不顯示推算數字。

## 架構

`aiProviderCatalog.ts` 成為三個模型政策資料的單一來源，包含模型代碼、顯示名稱、RPM、輸入 TPM、RPD、來源日期與預設模型。`CreateApiKeyDialog.tsx` 使用這份政策呈現可選模型與配額說明；既有儲存流程仍只更新原本的 permissions metadata，不變更 API Key 或其他未知欄位。`ApiChatConsole.tsx` 使用同一預設值與配額提示，並將自動候選目標限制為目前模型。

## 介面行為

1. 選擇 Google Gemini 時，即使尚未驗證金鑰，也會看到三個核准模型；預設為 3.5 Flash-Lite。
2. 驗證金鑰仍透過既有 Models API 完成，不把金鑰放入 URL，也不顯示完整金鑰。
3. 每個模型選項顯示名稱與 RPM／TPM／RPD；選取後在下方顯示來源、重設規則與「剩餘額：未同步 Google」。
4. 編輯既有 2.5 Flash 金鑰時仍顯示 2.5 Flash，不自動覆寫。使用者選擇 3.5 Flash-Lite 並按原有儲存按鈕後，沿用現有 metadata 保存機制。
5. 對話工作區顯示目前模型的限制與未同步狀態，但不把靜態上限冒充即時剩餘額。

## 錯誤與安全

- 若 Models API 沒有回傳所選核准模型，驗證訊息應指出該專案未回傳可用的核准模型，不自動改用 Pro 或其他模型。
- 429 等可重試錯誤可重試同一模型；候選金鑰的 metadata 模型必須與目前模型完全相同。
- 不新增 API Key 讀取、記錄或輸出路徑；既有錯誤遮罩行為保持不變。
- 不建立資料遷移、不變更資料庫 schema、不部署、不合併。

## 測試

- 單元測試政策資料、3.5 Flash-Lite 預設、三模型順序與配額文字。
- 原始碼契約測試確認可操作的三模型選項、未同步 Google 說明、既有 metadata 保存流程與同模型 fallback 限制。
- 執行完整 `npm test`、`npm run typecheck`、`npm run build`，並只對修改檔案執行 ESLint。

