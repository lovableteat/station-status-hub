# PCB Designer 同步、匯入與介面修正規格

日期：2026-08-08

## 目標

修正 PCB Designer 的 2D／3D 同步、STP／STEP 與表格匯入限制、Top／Bottom 板層顏色、工具列可讀性，以及 BOM 匯入預覽的可理解性；所有結果都要可由測試與瀏覽器操作驗證。

## 現況根因

1. 2D 與 3D 目前讀取同一個專案元件陣列，但各自複製座標轉換、旋轉與選取組合。這讓資料來源相同，不代表畫面投影一定相同；現有測試也沒有驗證同一元件在兩個畫面中的座標、旋轉、層級與選取結果。
2. STEP 模型檔案上限已是 50 MiB，但 CSV／XLSX／元件庫匯入仍由 `MAX_IMPORT_FILE_BYTES` 限制為 5 MB；使用者截圖中的「檔案大小超過 5 MB 上限」就是此根因。
3. `PcbBoard` 只有單一 `background`，沒有 Top／Bottom 各自的板色，因此不同層檢視無法編輯或一致顯示層色。
4. 匯入預覽只顯示有效筆數與錯誤陣列，沒有說明 BOM 會建立待放置清單，也沒有摘要有效列、展開後數量與下一步；大量錯誤也會產生不必要的大 DOM。
5. 工具列和左側專案區都有新增專案入口；層級按鈕在窄寬度下允許壓縮，導致文字難辨。

## 設計

### 1. 共用 PCB 視圖同步核心

新增純函式模組 `src/components/pcb-designer/core/viewSync.ts`，集中提供：

- `getPcbSelectionIds(primarySelection, selectedObjects)`：去重並保留主選取與多選狀態。
- `isPcbLayerVisible(visibleLayer, componentLayer)`：2D／3D 使用同一層級篩選規則。
- `getPcbComponentCenter(component)`：由元件左上座標與寬高計算中心。
- `getPcb3DComponentTransform(component, board)`：只由元件 `x`、`y`、`rotation`、`layer` 與板尺寸產生 3D 位置與旋轉。

`PcbCanvas` 與 `Pcb3DCanvas` 改用這些函式，並補上可供測試查驗的座標、旋轉、層級與選取資料屬性。所有拖曳、旋轉、換層、點選仍透過現有 workspace action 回寫專案狀態，不新增第二份視圖資料。

### 2. 匯入限制與模型資產

- 表格／元件庫匯入上限改為 `50 * 1024 * 1024` bytes，錯誤訊息改為「檔案大小超過 50 MB 上限。」。
- STP／STEP 上限維持 `50 * 1024 * 1024` bytes；副檔名接受 `.stp` 與 `.step`。
- STEP 解析後的檔名、尺寸、零件索引與校正資料寫入專案可序列化 metadata；頂點與索引 payload 只放既有 IndexedDB／記憶體模型資產儲存區，不寫進專案 JSON。
- 指派模型前要求有選取元件；成功後 3D 使用模型，沒有模型時維持程序化 fallback。

### 3. Top／Bottom 板色

在 `PcbBoard` 增加：

```ts
layerColors: {
  top: string;
  bottom: string;
}
```

新專案預設提供可辨識的 Top／Bottom 顏色；舊專案在讀取或 normalize 時補上預設值，不破壞既有 `background`。板設定 Inspector 提供兩個 `type="color"` 編輯器，2D／3D 的 Top／Bottom 板面與對應層級控制使用同一色值；`All` 維持既有 `background`。

所有層級按鈕設定 `white-space: nowrap`、固定最小寬度、清楚 active 色與可辨識 disabled 色，避免在 2D／3D／All／Top／Bottom 切換時壓縮或截斷文字。

### 4. 匯入預覽

`import-preview` 對話框加入匯入種類與摘要資料：

- 匯入種類：`library` 或 `bom`。
- 總資料列、有效資料列、無效資料列。
- BOM 展開後待放置項目數量。
- BOM 明確提示：此步只建立左側 BOM 待放置清單，不會直接把元件放上畫布；下一步可逐筆放置或使用全部自動放置。
- 錯誤最多顯示前 100 筆，若更多則顯示剩餘數量。
- 按鈕依種類顯示「匯入有效元件」或「加入待放置清單」，有效數為 0 時停用。

### 5. 介面刪減與可讀性

- 移除 `PcbToolbar` 的重複「新增專案」，保留左側專案區的主要入口。
- 保留確實有行為的匯出、工具、層級、鎖定、縮放與 DRC 控制。
- 對 2D／3D、可見層、放置層控制使用具名分組與穩定寬度，不刪除既有有效功能。
- 以更高對比 active、disabled、層級色與區隔邊框改善可掃讀性。

## 驗收條件

- 同一元件在 2D 與 3D 使用相同 `x`、`y`、中心點、旋轉、Top／Bottom 和選取 ID；切換視圖後不改變資料。
- 表格與 STP／STEP 在檔案大小小於或等於 50 MiB 時不因大小被拒絕，大於 50 MiB 時在讀取內容前被拒絕並顯示 50 MB。
- STEP metadata 可 JSON.stringify，payload 可從瀏覽器模型資產儲存區取回，專案 JSON 不含頂點／索引陣列。
- Top／Bottom 顏色可由 Inspector 編輯，兩個視圖與層級控制即時使用新顏色；舊專案仍能讀取。
- BOM 預覽能看懂有效列、無效列、待放置數量與下一步，3421 筆錯誤不會全部渲染。
- 工具列不再有重複新增專案；窄版面不截斷 Top／Bottom／2D／3D 文字。
- 單元測試、契約測試、型別檢查、build，以及瀏覽器互動與視覺 QA 全部通過。
