# PCB Designer 同仁問題修正完成紀錄

日期：2026-08-08

## 需求對照

本次針對協作中心收到的 PCB Designer 問題完成以下處理：

- 建立獨立的 Top／Bottom／全部可見層狀態，並讓 2D 與 3D 共用同一個篩選結果。
- 支援 Ctrl／Cmd 多選、多元件群組拖曳，以及 Ctrl／Cmd+D 複製選取項目。
- 複製禁制區時產生新識別碼、名稱與合法偏移位置。
- 群組移動遇到鎖定元件時，保留鎖定元件原位，只移動可編輯成員。
- 切換可見層時自動清除被隱藏的元件選取，避免檢查器或群組拖曳誤操作隱藏物件。
- 加入 L10 design 內建模板與模型資產 metadata，保留後續 STEP／STP 匯入的資料結構。

## 實作歷程

1. `9b5cfb0`：保存設計規格。
2. `81b690e`：保存執行計畫。
3. `ee98a80`：加入 PCB 可見層、L10 design 與模型資產狀態/遷移。
4. `1861f65`：加入群組移動、禁制區複製與選取動作。
5. `eb169f3`：串接工具列、2D/3D 畫布、檢查器與鍵盤操作。
6. 本次修正提交：補強多選 reducer、可見層選取修剪、混合鎖定群組移動、中文「全部」標籤與行為測試。

## 驗證

- PCB 指定回歸測試（defaults、workspace state、storage、editor actions、editor contract）：72/72 通過。
- Production build：`npm.cmd run build` 通過。
- 建置包含 PCB Designer 2D chunk 與 lazy-loaded 3D chunk。
- 第二輪程式碼審查：APPROVED。

完整整合測試仍有兩個既有、與本次 PCB 協作修正無關的契約失敗：舊測試仍要求移除既有的 gradient/shadow 樣式，以及要求 `UserPermissionsDialog` 出現特定舊字串。兩者在本次變更前即已存在，未為了本需求擴大修改範圍。

## 發布

完成後將目前分支推送到 `origin/main`，由 GitHub Pages workflow 進行部署；部署結果與 live URL 會在任務回覆中一併確認。
