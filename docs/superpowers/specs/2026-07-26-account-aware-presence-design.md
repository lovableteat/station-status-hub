# Account-aware Online Presence Design

## Goal

同一瀏覽器切換帳號後立即移除舊帳號、顯示新帳號，且不同帳號、不同分頁仍能在同一個在線成員清單互相看見。

## Considered Approaches

1. **每個帳號使用不同 Presence 頻道**：能避開部分舊狀態，但不同帳號會被隔離，無法互相看見；最新 `main` 的嘗試即有此問題，因此不採用。
2. **資料庫 heartbeat 表**：可跨連線保存最後上線時間，但需要排程清理、持續寫入與更多權限規則，對目前即時清單過重，因此不採用。
3. **共用頻道、分頁級 key、帳號世代防護**：所有人加入同一頻道，每個分頁使用唯一 key；切帳號時 untrack 舊身份，並拒絕舊訂閱回呼寫入新頻道。此方案即時、低寫入且符合 Supabase Presence，為採用方案。

## Design

- 所有使用者維持共用 topic `user_presence`。
- 每個分頁產生一次穩定 session id，Presence key 使用 `<userId>:<sessionId>`，避免同帳號多分頁互相覆蓋。
- Provider 保存目前 connection generation。登入身份改變時先清空 roster、增加 generation、建立新 channel。
- `subscribe`、`sync` 與狀態回呼都驗證 generation 與 captured user id；過期回呼不得更新狀態或追蹤舊身份。
- `trackPresence` 只對 ref 中目前有效的 channel 與 captured identity 發送，不從過期 closure 取 `user`。
- cleanup 對 captured channel 先 `untrack()`，再 `removeChannel()`；新 channel 不受舊 cleanup 影響。
- roster 仍以 `userId` 去重，所以同帳號多分頁只顯示一張成員卡，使用最新 `lastSeen`。

## Error Handling and Compatibility

- `untrack` 失敗仍執行 `removeChannel`。
- 網路重新連線只允許目前 generation 改變 `connectionStatus`。
- Presence 同步尚未到達時，仍立即以目前登入者建立本地 fallback，但絕不混入上一個帳號。

## Verification

- 新增純函式或來源契約測試，覆蓋共用 topic、分頁 key、過期 generation、去重與 cleanup。
- 實際用兩個瀏覽器工作階段登入不同帳號，確認彼此可見。
- 在同一分頁登出再登入另一帳號，確認舊帳號立即消失且新帳號名稱正確。
- 執行合作中心測試、ESLint 與 production build。

