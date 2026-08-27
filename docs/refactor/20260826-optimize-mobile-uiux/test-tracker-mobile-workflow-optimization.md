# Test Tracker 手機版工作流程更新說明

## 1. 範圍與狀態

本文件說明此 branch 在 `mobile-ui-demo` 中已完成的 Test Tracker Mobile UI/UX workflow，以及正式產品採納時必須保留的行為。這是本地靜態 demo，不是正式 `src` 的完成清單；所有資料、儲存與錯誤回饋皆為前端模擬。

本文件只描述 Mobile UI/UX，不包含 Desktop／Mobile component 分離方式或其他架構更新。Desktop 視覺不在此次 Mobile 改版範圍內。

## 2. 已完成的 demo 流程

```text
搜尋／篩選機台
      ↓
手機機台卡片 ──「更新進度」──→ 全螢幕進度 Sheet
                                      ↓
                      選擇站點與展開單一待辦測項
                         ↙          ↓          ↘
                     開始／完成   校正時間     回報異常
                          ↓           ↓             ↓
                      儲存變更   GMT 換算耗時   Quick Issue
                                                     ↓
                                        返回並顯示關聯問題
```

### 2.1 找到機台

- 頁面先顯示整體完成率，以及未開始、進行中、已完成的機台數量。
- 篩選欄位依序為搜尋、站點、狀態、工程師；作用中條件以可移除 chip 顯示並同步 URL。
- 清單可切換「待處理優先」排序；篩選為零筆時顯示 `目前篩選條件沒有符合的機台`。
- 機台卡片顯示名稱、編號、狀態、目前／下一站、工程師、進度與未解問題，並以全寬「更新進度」作為唯一明確的主要入口。

### 2.2 更新進度

- 進度 Sheet 使用 `100dvh` 與獨立內容捲動，固定區域顯示機台／站點、儲存狀態、站點選擇與測項摘要。
- 測項依「異常 → 進行中 → 未開始」排列；已完成項目預設收合並顯示數量。
- 一次只展開一個測項。展開後可開始、完成、回報異常、調整進度、輸入備註或校正時間。
- 開始後測項進入進行中；完成後設為 100%。有關聯問題的測項會顯示原因並停用完成操作。
- 修改進度、備註或時間後會列入尚未儲存數量；固定 footer 提供批次儲存。關閉有 dirty state 的 Sheet 時，必須選擇繼續編輯或捨棄變更。
- 切換站點前若仍有未儲存變更，demo 會阻止切換並提示先儲存。
- 「完成此站」執行前顯示將完成的測項數；存在未解問題時不允許執行，並列出阻擋資訊。

### 2.3 校正測試時間

- 按「開始／完成」可依操作當下的絕對時間建立紀錄；「校正時間」可供外地或事後補登的人員修改實際區間。
- Mobile 表單將日期與時間分開，並提供開始、結束各自的「套用現在時間」。日期／時間、GMT selector 與按鈕都維持適合觸控的尺寸。
- GMT selector 不綁定國家，涵蓋 GMT−12 至 GMT+14 的常見 offset，包含部分地區使用的半小時與 15／45 分鐘時差。
- 手動輸入的 wall-clock time 依所選 GMT 轉成 UTC；切換 GMT 時會重新顯示同一絕對時間，不改變時間點或耗時。
- 只填開始時間時顯示計時中；只有結束時間、格式錯誤或結束早於開始時顯示 inline error 並停用套用。
- 開始與結束完整時即時顯示耗時。套用後，測項卡片一律以台灣時間（GMT+8）顯示開始與結束；完成時間存在時測項同步成已完成與 100%。
- demo 的「套用現在時間」使用 `Date.now()` 取得絕對時間，再轉為所選 GMT 的輸入值，不依賴裝置顯示的本地時分做隱式解析。正式服務建議由 server 提供 timestamp。

### 2.4 回報異常

- Quick Issue 自動顯示機台、站點與測項，不要求使用者重新選擇上下文。
- 首屏包含問題描述、優先級、拍照／附件與「建立問題並標記異常」；負責人收在進階設定。
- 附件 input 支援 `capture="environment"`、相簿與檔案，選擇後顯示名稱、大小與移除入口。
- 問題描述為必填並使用 inline error。關閉後再次開啟同一測項時，demo 會還原該 session 中尚未送出的描述草稿。
- 模擬建立成功後，使用者會回到原測項，測項改為異常並顯示問題編號；後續完成操作會受到未解問題 guard 阻擋。

## 3. Mobile RWD 與可及性要求

- Mobile workflow 仍是 RWD，不是固定寬度稿。demo 在一般手機寬度使用雙欄資訊，在 23rem 以下將篩選、時間欄位與 footer 操作重排為單欄。
- Sheet、表單 footer 與 bottom dock 預留 safe-area；內容區使用 `min-height: 0` 與自身捲動，避免瀏覽器工具列或軟鍵盤遮住主要操作。
- 主要按鈕、icon button、chip 清除與導覽目標至少 44×44px；狀態同時提供文字，不只依賴顏色。
- Overlay 開啟後鎖定背景捲動、限制焦點範圍，支援 Escape 關閉；關閉後焦點回到原觸發按鈕。
- 動畫遵守 `prefers-reduced-motion`。繁中長字、機台名稱與附件名稱需允許換行或安全截斷，不得造成整頁水平捲動。

## 4. 正式產品採納時需補齊

| 項目 | demo 現況 | 正式採納要求 |
| --- | --- | --- |
| 篩選 | URL query、chip、清除與空結果已可操作 | 接入正式 router/query schema，驗證重新整理、返回與分享連結 |
| 測項儲存 | 使用記憶體與延遲模擬 | 串接 mutation，保留草稿，提供 inline error、重試與部分失敗結果 |
| 完成此站 | 已有筆數確認與未解問題阻擋 | 由 server/domain rule 再驗證權限、最新狀態與原子性 |
| Quick Issue | 已展示精簡欄位、草稿及附件選擇 | 共用正式 schema、attachment upload 與 issue mutation，處理上傳進度及失敗 |
| 時間校正 | 已展示 GMT 解析、換算、validation 與耗時預覽 | 共用正式時間 utility，寫回 `started_at`、`completed_at`、`actual_hours`，以 server timestamp 為準 |
| 離開防呆 | Sheet、站點切換與頁面離開已有基本 guard | 補齊 browser back、route change、swipe dismiss 與 mutation pending 情境 |
| 狀態回饋 | 已有 saving、saved、dirty、inline error 與 toast 範例 | loading、offline、401/403、timeout、retry 與 partial success 不得只靠 toast |

正式實作不可為 Mobile 複製 API、state、validation、時間或問題建立邏輯；Desktop 與 Mobile 應使用相同的實際功能與 domain rule，只讓操作流程與 UI 呈現依平台需要調整。

## 5. 驗收條件

- 使用者從手機機台卡片一次明確點擊即可進入更新流程，不需猜測進度條可點擊。
- 篩選位置、順序、chip、URL、清除及空結果完整符合 `AGENTS.md`。
- 320、375、390、430px 與 200% zoom 下沒有非預期整頁水平捲動；軟鍵盤、瀏覽器工具列與 Home Indicator 不遮住目前欄位或主要 CTA。
- 所有主要觸控目標至少 44×44px，鍵盤焦點順序合理，Overlay 關閉後焦點回到觸發位置。
- 有未儲存變更時，關閉、返回、切換站點或切換機台不會無提示遺失內容。
- 手動時間校正可處理跨日與跨 GMT；切換 GMT 不改變既有絕對時間，儲存後固定顯示 GMT+8，畫面耗時與持久化 `actual_hours` 一致。
- 「完成此站」會先顯示影響筆數與阻擋原因；正式 API 部分失敗時可逐項辨識與重試。
- Quick Issue 會預填正確上下文；附件與建立失敗不清空草稿，成功後原測項立即顯示關聯問題。
- VoiceOver／TalkBack 可辨識控制名稱與狀態，狀態不以顏色作唯一訊號，reduced motion 設定有效。

## 6. 建議測試

- 元件／單元測試：URL filter parsing、全部清除、dirty guard、狀態／百分比規則、未解問題阻擋、GMT parsing、offset conversion、跨日耗時與錯誤區間。
- E2E：搜尋機台 → 更新測項 → 校正跨 GMT 時間 → 儲存 → 建立問題並附照片 → 返回確認關聯 → 解決後完成測項。
- 錯誤流程：離線重試、附件失敗、問題建立成功但測項更新失敗、單筆／批次部分失敗、權限不足與未儲存離開。
- 視覺與手動驗證：320／375／390／430px、鍵盤開啟、橫向畫面、長文字、多個 chip、error、empty、loading、200% zoom、VoiceOver／TalkBack。
