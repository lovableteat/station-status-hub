# PCB Designer 協作問題修正設計規格

## 背景

PCB Designer 目前已具備專案、元件庫、BOM、2D 畫布與 3D 檢視，但協作中心收到的問題集中在「設計世代區隔、3D 模型匯入、層面檢視同步、批次編輯」四個工作流程。這次修正要讓同仁可以在不混用 L6/L10 資料的前提下完成 PCB 編輯，並讓 2D 與 3D 使用同一份工作區狀態。

## 目標與成功條件

1. 專案模板中可建立獨立的 `L10 Design`；現有 L6 專案不被改名、不被合併、不被覆蓋。
2. 使用者可從 PCB Designer 匯入 `.stp` 或 `.step`，解析成功後把模型套用到選取元件，並在 3D 檢視看到模型。
3. `Top`、`Bottom` 檢視會同時影響 2D 與 3D；放置層仍可獨立選擇，避免切換檢視改變新元件預設層。
4. 元件的座標、旋轉、層級與選取狀態在 2D/3D 間一致；2D/3D 切換不會產生第二份幾何資料。
5. 使用 Ctrl/Cmd 點選可以建立多元件選取，拖曳時以單一歷史交易移動所有可編輯元件；鎖定元件不移動。
6. 選取禁制區時可複製，複本有新的 ID、名稱與網格偏移，並可復原／重做。
7. 失敗的 STEP 解析、無選取物件、唯讀／鎖定文件與越界移動都有可理解的提示，且不污染工作區狀態。

## 非目標

- 這次不建立 L6/L10 自動相容性判斷或完整 footprint 版本管理；先以獨立 L10 模板、共用元件庫、專案資料隔離解決目前協作需求。
- 這次不把 PCB Designer 變成完整 ECAD 格式轉換器；STEP 只作為 3D 幾何顯示資產，不取代 Gerber、ODB++ 或網表匯入。
- 這次不將大型 STEP 網格直接序列化到專案 JSON；專案 JSON 保存模型識別資料，瀏覽器資產儲存區保存解析後模型，找不到資產時顯示重新匯入提示。

## 使用者流程

### L10 Design

在「模板」分頁提供內建 `L10 Design`。套用模板會建立新的專案，名稱以 `L10 Design 專案` 起始，保留現有專案不變。L10 模板與現有 L6 模板共用元件庫入口，但專案內的板框、元件、禁制區與測量資料完全獨立。

### STEP 模型

1. 使用者在元件庫編輯或選取元件的屬性區按「匯入 STP/STEP」。
2. 檔案選擇器只接受 `.stp,.step`；檔案交給既有 `importStepModel` 解析器。
3. 解析成功後顯示檔名、尺寸、座標軸與零件數，使用者確認後將模型資產 ID 寫入元件資料。
4. 3D 畫布優先渲染該元件的 STEP mesh；沒有模型的元件維持目前的程序化方塊渲染。
5. 解析失敗時保留原本元件，不建立半成品資產，並顯示可操作的錯誤訊息。

### 層面檢視

工作區新增 `visibleLayer: "all" | "top" | "bottom"`。`activeLayer` 只代表新元件放置層；`visibleLayer` 代表目前檢視過濾器。工具列顯示「全部／Top／Bottom」檢視按鈕，切換時 2D 與 3D 使用同一個過濾器。若選取物件因過濾器隱藏，選取狀態清除，避免右側檢查器顯示看不見的物件。

### 多元件移動

- 一般點選建立單一選取。
- Ctrl/Cmd 點選元件加入或移除群組選取。
- 群組拖曳以拖曳開始時的相對座標計算位移，所有未鎖定元件一起移動。
- 任何成員越界或與既有禁制區衝突時，整批移動取消，保留原狀並提示原因。
- 群組移動只建立一筆 undo history，Ctrl/Cmd+Z 可完整復原。

### 禁制區複製

選取禁制區後，右側檢查器顯示「複製」按鈕；Ctrl/Cmd+D 執行相同操作。複本使用新 ID，名稱加上「複本」，位置依目前網格向右下偏移一格；若偏移後超出板框，改用板框內的最近合法位置，找不到合法位置則不建立複本。

## 架構

### 資料模型

- `PcbWorkspaceState` 保留 `selection` 作為主要檢查器選取，另新增可序列化的 `selectedObjects` 陣列支援群組選取，以及 `visibleLayer` 支援跨視圖過濾。
- `PcbLibraryComponent`／`PcbPlacedComponent` 新增可選的 `modelAssetId` 與 `modelFileName`；資產本體由 PCB 模型資產儲存層管理。
- `PcbSaveState` 新增 `modelAssets` 的 metadata 索引，不直接存放 Float32Array；讀取舊版資料時預設為空索引。
- 以既有 `ImportedStepModel` 的解析結果作為渲染輸入，將 typed arrays 轉成資產儲存層可還原的數字陣列格式。

### 核心函式

- `moveComponents(project, instanceIds, delta, bypassSnap)`：以單一交易驗證並移動多個元件。
- `duplicateKeepout(project, id, offset)`：建立新 ID 的禁制區複本並做板框驗證。
- `getVisiblePcbObjects(project, visibleLayer)`：由 2D 與 3D 共用的層面過濾器。
- `attachStepModel(componentId, asset)`：將模型 metadata 與資產 ID 綁定到元件。

### 2D/3D 資料流

```text
PcbWorkspaceState
  ├─ activeProject.components / keepouts
  ├─ activeLayer（新元件放置層）
  ├─ visibleLayer（檢視過濾器）
  └─ selectedObjects（共同選取）
       ├─ PcbCanvas：座標、層面、群組拖曳
       └─ Pcb3DCanvas：同一座標、層面、模型資產、選取
```

### 資產儲存與相容性

使用瀏覽器 IndexedDB 保存解析後 STEP mesh；localStorage／遠端同步只保存 metadata 與模型資產 ID。IndexedDB 不可用或寫入失敗時，模型仍可在目前頁面即時顯示，但提示使用者需在離開前重新匯入。舊版 `PcbSaveState` 不含模型索引時自動補空值，不影響既有專案。

## 錯誤處理

- 副檔名不符：阻止選取並提示「請選擇 .stp 或 .step 檔案」。
- STEP 沒有可顯示 mesh、尺寸為零或解析器失敗：不變更元件，提示解析器錯誤與重新轉檔建議。
- 沒有選取元件就匯入：提示先選取要套用模型的元件。
- 唯讀／鎖定文件：所有新增、複製、移動與匯入控制停用，快捷鍵也不產生 mutation。
- 群組移動部分元件鎖定：鎖定元件維持原位；若剩餘沒有可移動元件，提示「選取的元件皆已鎖定」。
- 模型資產遺失：3D 顯示 fallback 方塊與「重新匯入 3D 模型」提示，不讓整個 PCB 頁面崩潰。

## 測試策略

1. 核心單元測試：L10 模板隔離、層面過濾、群組移動的吸附／越界／鎖定、禁制區複製、模型 metadata 驗證。
2. 狀態 reducer 測試：新增／切換／清除 `selectedObjects`、`visibleLayer`，以及 undo/redo 對群組交易與複製交易的完整還原。
3. UI contract 測試：工具列提供全部／Top／Bottom 檢視、STEP 上傳入口、群組複製控制；2D 與 3D 都讀取相同層面過濾器。
4. 回歸測試：現有 `tests/pcb-designer` 全部通過，並執行 production build。

## 風險與取捨

- STEP mesh 可能很大；先以解析後資產快取與現有 lazy 3D chunk 降低主畫面負擔，後續再加入 mesh decimation。
- IndexedDB 不一定能跨帳號同步；本次先保證同一瀏覽器可重開使用，遠端資產同步列為下一階段。
- 群組選取先以 Ctrl/Cmd 點選為主，不加入框選，避免與目前畫布平移／建立禁制區手勢衝突。
