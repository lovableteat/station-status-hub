# PCB Designer 同仁問題修正與提交紀錄

日期：2026-08-08

## 任務範圍

依照 Ben 在協作中心提出的問題，補強 PCB Designer 的可用性與資料安全：

- PCB 2D 與 3D 共用 Top、Bottom、全部圖層篩選。
- 支援 Ctrl/Cmd 多選、群組拖曳、群組複製與復原/重做。
- 鎖定元件不會阻擋同一群組中其他可編輯元件移動。
- Keepout 可複製，並保留選取狀態與鍵盤操作。
- L10 設計狀態、圖層與模型 metadata 可持久化，舊資料會安全遷移。
- 支援 `.stp` / `.step` 匯入 PCB 元件，Inspector 顯示匯入狀態與模型摘要。
- 3D 使用 BufferGeometry 顯示已匯入模型；模型不存在或損壞時回到程序化外觀。
- STEP 匯入加入檔案大小、零件數、頂點數、索引數與索引完整性限制。
- PCB STEP 預設以上下厚度最薄的軸作為 up axis，較符合板上元件的實際幾何。
- 匯入完成前若元件被鎖定或失去編輯權限，會刪除暫存模型，不留下孤立資產。

## 主要提交順序

1. `9b5cfb0`：建立設計規格。
2. `81b690e`：建立執行計畫。
3. `ee98a80`：加入 PCB 圖層與 L10 設計狀態。
4. `1861f65`：加入群組移動與 Keepout 複製。
5. `eb169f3`：加入 2D/3D 圖層篩選與多選 UI。
6. `bab2432`：修正多選遺失首個選取、隱藏圖層殘留選取、鎖定群組移動與中文介面文字。
7. `59c1f94`：加入 STEP 模型匯入、IndexedDB/記憶體資產儲存、metadata 持久化與 3D fallback。
8. `768dd0e`、`e85a5ae`：修正 Task 4 測試資料與測試範圍。
9. 本次提交：補上模型安全上限、損壞資料驗證、up axis 推論與匯入失敗清理。

## 驗證方式

- PCB focused tests：`47/47` 通過。
- TypeScript：`npm.cmd exec tsc -- --noEmit` 通過。
- ESLint：針對 PCB Designer 原始碼與測試執行並確認通過。
- Production build：`npm.cmd run build` 通過。
- 完整 PCB 測試：`138/141` 通過；仍保留 3 個既有、與本任務無關的失敗：帳號遠端同步，以及 workspace integration 的 gradient/shadow 與舊權限對話框字串斷言。

## 提交流程

1. 在 `codex/pcb-collaboration-fixes` 分支完成實作。
2. 執行 focused tests、型別檢查、lint、production build。
3. 檢查 `git diff --check` 與工作樹，確認沒有暫存或無關檔案。
4. 建立修正提交並推送功能分支。
5. 將完成提交推送到 `main`。
6. 等待 GitHub Pages workflow 完成，再檢查部署後 PCB Designer bundle 是否包含新功能。

## 部署位置

- GitHub repository：`lovableteat/station-status-hub`
- Production：<https://lovableteat.github.io/station-status-hub/?reload=1785421951790&project=1c155356-321f-4f0f-bd2a-c47a4b76549b&workspace=station-status&module=test-plan>

本報告刻意保留在 repository 的 `docs/superpowers/reports/`，作為此次修改、測試、提交與部署的可追溯紀錄。
