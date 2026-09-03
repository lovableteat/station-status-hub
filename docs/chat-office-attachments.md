# 聊天 Office 附件

原聊天功能的選檔器、前端驗證、私人儲存桶與訊息 RPC 僅接受圖片／影片，導致 PPT、Excel 無法加入。本次加入 PPT、PPTX、XLS、XLSX；單檔 50 MB，每則最多四個附件，可與原圖片／影片混合。圖片仍為 12 MB。

檔案從聊天框迴紋針按鈕加入，送出前顯示檔名與大小，送出後顯示文件卡片與下載按鈕。下載重新取得短效私人網址，保留含中文及特殊字元的原始檔名。此功能傳遞原始文件，不在聊天中編輯或預覽 Office 內容。

Windows 空白／通用 MIME 依四種副檔名正規化；明確衝突的 MIME、副檔名、空檔、超限檔案拒絕上傳。資料庫再核對成員身分、上傳路徑、文件副檔名、MIME 與實際物件大小。原私訊附件 RLS 保持生效，非成員、已刪除訊息與已清除的對話歷史不能藉新功能讀取附件。

## 發布

GitHub Pages 工作流程不會執行資料庫 migration，需先在正式 Supabase 專案套用 `20260903170000_direct_chat_office_documents.sql`。執行下列命令產生完整交易（只產檔，不連線）：

```powershell
node scripts/prepare-chat-documents-migration.mjs
```

執行產生的 `tmp/chat-documents-deploy.sql`。交易核對既有訊息、附件與全站帳號資料雜湊，若改變則回復；成功後記錄 migration，並重載 API schema。儲存桶必須是既有私人 `chat-media`，至少允許 50 MB。再合併前端，確認 Pages 建置與部署成功。

## 驗證

```powershell
node --test tests/directMessageDocuments.test.mjs tests/directMessageExperience.test.mjs tests/realtimeCollaborationV2.test.mjs
node tests/directMessageDocuments.integration.mjs <PGlite套件路徑>
```

26 項前端／既有協作測試及 43 項 PostgreSQL/RLS 檢查。瀏覽器以真實聊天元件及上傳 hook 對隔離測試服務送出四種文件，核對正規化 MIME、大小、重新載入後的卡片與四次下載檔名／內容大小；未傳送正式私訊。檔案選取使用測試頁的 File fixture，原生 Windows 選檔對話框未自動操作。

將部署 SQL 路徑作為資料庫測試第三個參數時，連同完整性檢查與版本記錄共 44 項通過。新增文件元件與聊天面板的 ESLint 通過。全站 TypeScript 與 hook ESLint 仍有既有錯誤（含原聊天草稿型別、`any` 與 effect 警告）；本次沒有改動那些區段，新增文件元件無型別錯誤。

## 2026-09-03 正式資料庫記錄

已在 `rfppeuzuoxtqkpbwehbq` 成功套用 migration。交易完整性檢查通過；更新前後均為 73 則訊息、23 個附件，全站帳號資料不變。儲存桶維持私人、50 MB，允許格式由 7 種增為 11 種；匿名呼叫傳送 RPC 仍被拒絕。正式環境沒有傳送測試私訊或測試檔案。
