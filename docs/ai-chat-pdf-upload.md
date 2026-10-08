# AI 聊天 PDF 上傳修正

2026-10-08 修正聊天室接受 PDF 卻無法正確送出的流程。

## 原因與處理

- 原本以 FileReader 的 MIME 為準，Windows 瀏覽器未辨識副檔名時，PDF 可能成為 `application/octet-stream`。現在依 PDF 副檔名／MIME 辨識、確認 `%PDF-` 標頭並統一送出 `application/pdf`。空檔、改副檔名的其他檔案與超過 50MB 的 PDF 在上傳時說明原因。
- 原本非 Gemini 路由拒絕所有文件，供應商介面也只支援圖片。現在文件與圖片分開，Gemini 使用 PDF inlineData，OpenAI 使用 Chat Completions `file`／`file_data`，Claude 使用 `document`／base64。保留文件名稱與原始 bytes；不把 PDF 當成 image_url。未確認支援文件的自訂路由仍拒絕，且不自動換供應商或 API 金鑰。
- 原本附件非同步讀取期間仍可送出。現在顯示讀取狀態、停用送出與重複上傳，快捷鍵也檢查讀取狀態。檔案讀取有 30 秒截止；任一文件失敗不會丟掉同批其他有效文件。切換 API 金鑰、使用者或新對話後，舊附件的延遲完成不會混入新對話。
- 請求建立時再次檢查歷史附件及 base64 體積：Gemini 總請求 100MB、單份 PDF 50MB；OpenAI PDF 合計低於 50MB；Claude 總請求 32MB。無效格式／過大請求在用量登記及外部請求之前停止，不當成網路錯誤重試。

依據：[Gemini PDF 文件處理](https://ai.google.dev/gemini-api/docs/document-processing)、[OpenAI File inputs](https://developers.openai.com/api/docs/guides/file-inputs)、[Claude PDF 支援](https://platform.claude.com/docs/en/build-with-claude/pdf-support)。頁數、密碼／加密及模型能力限制由供應商檢查，未在瀏覽器加入完整 PDF 解析器；未自動移除文件密碼或改写內容。

## 驗證範圍

PDF helper 與實際 React 元件測試涵蓋無 MIME／二進位 MIME、錯誤 PDF、空檔、大小／歷史限制、三種供應商的文件格式、混合圖片、讀取時送出阻擋、同批有效附件保留，以及原始 PDF bytes 到 Gemini 請求的完整性。既有模型繁忙恢復、資料來源檢索與 API 截止測試一起執行。

正式用量紀錄查詢確認配置金鑰有效且未過期；近期 Flash 回傳過 503，Flash-Lite 有成功回覆，這與 PDF 格式缺口是不同問題。沒有讀取使用者對話／PDF 內容或輸出 API 金鑰，沒有變更正式資料庫。

44 項相關測試、App／Node 型別檢查、定向 ESLint 與正式建置通過。本次瀏覽器控制介面未提供任何可用瀏覽器，無法完成本機視覺與真實 PDF 供應商回覆驗證；以上 UI 行為以 React 渲染互動及請求捕捉驗證。未將正式文件傳送至外部模型。
