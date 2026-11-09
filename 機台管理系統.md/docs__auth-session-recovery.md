> 集中副本；原始路徑：`docs/auth-session-recovery.md`；程式參考基準：`88f28c2affca63e061321412902fb835e2172685`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# 登入狀態恢復

網站遇到短暫斷線或登入服務逾時時，應嘗試恢復現有登入，而不是刪掉仍可續期的憑證。此流程不修改 Supabase 的工作階段期限、帳號權限或 RLS。

## 行為契約

- Auth 每次傳輸仍有 8 秒期限。只有 refresh token 請求的本機逾時回傳可重試的 503，讓 Supabase SDK 保留憑證並依它自己的有限重試規則續期；其他 Auth 請求保留原本的逾時處理。伺服器明確拒絕 refresh token 時照常清除登入。
- 啟動時必須先經伺服器驗證帳號；瀏覽器保存的顯示名稱、角色或 user metadata 不可當成授權依據。驗證暫時失敗時顯示「正在恢復登入連線」，私人工作區不載入。
- 同一個已由伺服器驗證的帳號，在更新後 JWT 尚未到期時，可在短暫的帳號資料讀取逾時期間保留目前畫面。其他帳號或過期 JWT 不可繼承這份驗證。
- 恢復失敗後等待 10 秒再嘗試；回到分頁、恢復網路或按「立即重試」也能觸發檢查。相同 token 同時進行的帳號查核共用一份請求。健康狀態由 SDK 自動續期，應用層不額外持續輪詢。
- 伺服器確認帳號已停用、登入已撤銷、使用者主動登出時，清除帳號與重試狀態。延遲回來的查核或登入結果不得恢復已登出的身分。
- 重新登入需先等待前一次 SDK 登出完成，避免舊 SIGNED_OUT 通知干擾新帳號。Auth 通知中的查核延至下一個工作排程，避免重入 SDK 鎖。
- 各分頁帳號仍維持 sessionStorage 隔離；本次沒有改成共用 localStorage，也沒有永久保存密碼。關閉分頁、清除瀏覽器資料或真正撤銷登入後仍可能需要重新登入。

## 回歸驗證

`authRefreshRetention.test.mjs` 使用真實 Supabase SDK、合成憑證及受控傳輸，驗證逾時保留憑證、恢復後輪替、重複斷線與確實撤銷。SDK 的重試時間以受控時鐘測試，未聲稱完成數小時的真實在線測試。

`sessionRecovery.integration.test.cjs` 與既有 session/SDK integration 測試驗證私人畫面防護、過期及跨帳號隔離、舊結果競態、主動登出與重新登入。瀏覽器使用隔離的合成帳號模擬斷線、啟動逾時及恢復，不操作正式使用者的登入憑證。

參考：[Supabase 工作階段](https://supabase.com/docs/guides/auth/sessions)、[Auth 狀態事件](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)。
