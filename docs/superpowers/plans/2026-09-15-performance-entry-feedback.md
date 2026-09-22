# 逐筆實績回覆與退回修正

使用者已確認四項範圍：逐筆評語、逐筆退回及歷史、回覆連結到實績、修正通知失敗。

沿用 RD2_MANAGER_V1 序列化與現有元件，不新增依賴。類別評分保持不變，舊類別評語保留為歷史摘要，不複製到每筆實績。逐筆評語以 category + entry ID 綁定；退回保存內容快照、原因、時間與主管。通知只含導航與識別資訊，不包含評分。

- [x] 測試先行：序列化、兩次退回、員工重送不改主管紀錄、空原因驗證、非 UUID 考核編號通知。
- [x] rd2Assessment.mjs / assessmentTypes.ts：逐筆評語及 append-only 退回歷史，從已保存紀錄延續歷史。
- [x] AssessmentEntryList.tsx / AssessmentEditor.tsx / PerformanceAppraisalPage.tsx：逐筆編輯、退回、定位及唯讀歷史；沿用 CSS tokens，窄螢幕直向排列。
- [x] performanceNotifications.mjs / PerformanceAppraisalPage.tsx：UUID reference 與完整 metadata 識別分離，重送通知不再執行退回。
- [x] 執行 node --test tests/*.test.mjs、範圍 lint、npm run build，使用本機示範資料驗證瀏覽器；正式通知須登入環境才能實測，不修改真人考核測試。
- [x] 追加逐筆主管附件、退回時保留附件快照；員工自評及考核詳情顯示逐項回應，本機草稿保留員工內容並使用最新主管回應。

2026-09-17 驗證：25 項相關測試通過、建置成功，附件相關元件 lint 與 git diff --check 通過。使用假資料實測附檔、逐筆退回、員工回應顯示、檔案下載內容一致、重新開啟、舊草稿、不支援檔案提示及 390px 手機無橫向溢出。

全庫測試另有 5 項既有失敗，已在修改前的 HEAD 重現；包含環境檔 ignore、行動聊天室、績效主題、測試完成檢查與站點進度顯示。正式登入環境的通知傳送仍未實測。
