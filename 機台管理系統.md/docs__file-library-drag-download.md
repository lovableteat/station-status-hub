> 集中副本；原始路徑：`docs/file-library-drag-download.md`；程式參考基準：`0b0dee080f02ceb8d58b38744fabe3b5d5f4bcfd`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# 檔案上傳頁：拖到桌面的下載怎麼送出

拖曳列到桌面時，Chrome／Edge 會依 `dataTransfer` 的 `DownloadURL`（`<mime>:<檔名>:<網址>`）自己啟動一個下載。2026-10-22 在公司電腦上，帶 Supabase 簽章連結的拖曳被顯示為「遭到貴機構封鎖」，而頁面按鈕的 `blob:` 下載正常。以下是依 Chromium 原始碼查證後的實作依據（`src/components/test-plan/core/dragDownload.ts`、`TestPlanWorkspace.tsx`）。

## 送出順序

1. **同源 `blob:` 位址（唯一的送法）**：清單一顯示，畫面上 ≤8 MB 的檔案（最多 12 個、合計 48 MB）就先抓進頁面；其他 ≤64 MB 的檔案在指標停留 0.4 秒或按下時抓取，同時最多 3 個、其餘排隊。64 MB～1 GB 的檔案不自動抓，第一次拖曳時才開始準備，右下角傳輸面板顯示「準備拖到桌面」與百分比，完成後提示再拖一次（2026-10-23 使用者要求上限提高到 1 GB，與上傳上限相同）。位元組直接進入瀏覽器的 blob 儲存（大檔會落到磁碟），進度由複製的串流計算，不會整份放在 JavaScript 記憶體；快取上限 1.5 GB。`dragstart` 同步放入 `blob:` 位址，瀏覽器看到的下載來源就是本站網域，和按鈕下載一樣能通過以網址判斷的下載政策。
2. **不再退回簽章連結**：2026-10-23 使用者拖 `test1.7z`（366 KB）到桌面仍顯示「遭到貴機構封鎖」，原因是按下後立刻拖曳、檔案還沒抓完，於是退回了公司政策會擋的 Supabase 簽章連結。現在檔案還沒準備好、超過 1 GB、一次拖多個或拖資料夾時，拖曳不帶任何下載位址（也不帶 `text/uri-list`，避免桌面產生捷徑檔）；若在視窗外放開，頁面會提示改按「下載」。

不做 Service Worker 代理：拖曳下載由瀏覽器行程直接發出（`DragDownloadFile` → `DownloadManager`），不經過頁面的 Service Worker，同源代理位址只會得到 404；2026-10-22 曾短暫部署過 `file-library-sw.js`，頁面載入時會把舊註冊移除。

## 必須成立的條件

- `DownloadURL` 只能在 `dragstart` 內同步設定，所以位元組要事先在記憶體裡。
- Windows 檔案總管是在放開滑鼠、`dragend` 之後才向瀏覽器拉取資料；`blob:` 位址被撤銷會得到 `ERR_FILE_NOT_FOUND`。快取淘汰時延後 5 分鐘才 `revokeObjectURL`。
- 拖放完成前不能離開頁面（來源 frame 消失，下載會直接取消）。
- 檔名不能含 `:`，MIME 要與副檔名相符，否則 Chrome 可能改副檔名。

## 這個做法解不了的

拖曳下載在 Chrome 內部沒有使用者手勢，`DownloadRestrictions` 第 1／2 級對危險副檔名（.exe、.msi、.js、.bat、.iso…）仍會封鎖，Safe Browsing 也仍會檢查 `blob:` 內容；企業 DLP 連接器若依內容判斷同樣不受網址影響。這些只能由 IT 設定放行本站網域。
