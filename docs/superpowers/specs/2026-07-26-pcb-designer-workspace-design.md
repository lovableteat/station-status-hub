# PCB Designer 第六工作區設計規格

日期：2026-07-26
狀態：已核准執行
目標分支：`main`

## 1. 目標

在既有「工作整合平台」新增第六個工作區 `PCB Designer`，提供完整、可實際操作的 2D PCB 佈局規劃能力：

- 專案與模板管理
- 內建／自訂元件庫與檔案上傳
- 元件拖放、移動、選取、旋轉與刪除
- 可調網格與吸附
- 矩形禁制區
- 兩點測量
- 板外、元件重疊、禁制區重疊 DRC
- 復原與重做
- 本機即時備份、遠端可用時同步的自動儲存
- 專案 JSON、畫布 PNG、BOM CSV／XLSX 匯入匯出

本功能定位是「佈局規劃器」，不是製造級 EDA。此版本不宣稱或提供走線、網表、銅層、Gerber、Excellon 或電氣規則分析。

## 2. 來源網站盤點與整合界線

參考站點：`https://circuit-ai-architect-48.lovable.app/editor`

保留並補強：

- 專案、模板、元件庫的工作流程
- 可設定板尺寸與網格的 2D 畫布
- 元件新增、旋轉、刪除與屬性編輯
- 鎖定、測量、禁制區、縮放、畫面重設
- JSON／圖片輸出概念

不帶入：

- 來源網站的獨立首頁、獨立登入、使用者選單與主導覽
- 來源網站的 DataCenter／3D 機櫃功能
- 來源網站的黑底綠色獨立視覺
- 來源網站已失效的自訂元件 API
- 「顯示新增成功、實際因空間不足未新增」的不一致行為

PCB Designer 必須由工作整合平台既有登入、使用者、在線狀態、通知與頂部導覽包覆。

## 3. 視覺與資訊架構

### 3.1 平台一致性

- 保留 `MainWorkspaceHeader`，頂部新增並選中 `PCB Designer`。
- 背景、面板、邊框與文字沿用維修工作區的深海軍藍系統：
  - 頁面底色：`#06111f`
  - 面板：`#0b1b2d`／`#10263a`
  - 邊框：`#2a526f`／`#356985`
  - 主要操作：平台藍色
  - 幾何／資料強調：青色 `#39c6e8`
  - 成功／警告／錯誤：既有 emerald／amber／rose 狀態色
- 按鈕維持平台緊湊高度、圓角與描邊，不另建一套視覺語言。
- 中文 UI 使用平台字體；尺寸、座標、料號等資料使用等寬字體。

### 3.2 桌面佈局

頂部全域導覽下方依序為：

1. 專案列：工作區名稱、目前專案、專案狀態、自動儲存狀態、專案設定、匯入專案、套用模板。
2. 工具列：新增、儲存、匯出、復原、重做、選取、拖曳、測量、禁制區、鎖定、縮放、重設、DRC。
3. 三欄編輯區：
   - 左欄：專案／模板／元件庫分頁，可收合。
   - 中欄：SVG 2D 板框、網格、元件、禁制區、測量、碰撞提示。
   - 右欄：板設定／選取物屬性／DRC 分頁，可收合。
4. 狀態列：元件數、板尺寸、圖層、縮放、網格、DRC 結果、自動儲存時間。

### 3.3 響應式

- 寬度 `>= 1280px`：固定三欄，中央畫布優先取得空間。
- `768–1279px`：左右欄改為抽屜；工具列可橫向捲動。
- `< 768px`：提供專案、匯入匯出、元件屬性與 DRC 檢視；畫布仍可縮放和平移，但顯示「建議使用桌面進行精細佈局」。
- 所有主要操作保留文字 tooltip 與 `aria-label`，不以顏色單獨傳達狀態。

## 4. 工作區與權限

新增工作區識別：

- Workspace ID：`pcb-designer`
- 模組 ID：`pcb-designer`
- 權限：
  - `pcb_designer_view`
  - `pcb_designer_edit`

行為：

- 具有檢視權限者可開啟專案、縮放、篩選、DRC、匯出。
- 具有編輯權限者可新增／編輯／刪除專案、模板、元件與畫布物件，並可匯入。
- 管理員與超級管理員預設具完整權限。
- 既有權限資料未包含新欄位時，依平台既有 fallback 規則處理，不使舊帳號登入失敗。
- 首頁入口由五張調整為六張，桌面採 3 × 2 平衡格；PCB Designer 使用電路板預覽，不與 DataCenter 卡片重複。

## 5. 核心資料模型

所有尺寸與座標使用毫米；日期使用 ISO 8601。

### 5.1 `PcbProject`

```ts
interface PcbProject {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  status: "draft" | "review" | "approved";
  board: PcbBoard;
  components: PcbPlacedComponent[];
  keepouts: PcbKeepout[];
  measurements: PcbMeasurement[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}
```

### 5.2 `PcbBoard`

```ts
interface PcbBoard {
  width: number;
  height: number;
  gridSize: number;
  showGrid: boolean;
  snapToGrid: boolean;
  background: string;
}
```

限制：

- 板寬、高：`20–1000 mm`
- 網格：`0.1–50 mm`
- 數值輸入皆拒絕 `NaN`、無限值與範圍外資料。

### 5.3 `PcbLibraryComponent`

```ts
interface PcbLibraryComponent {
  id: string;
  name: string;
  type: string;
  manufacturer: string;
  partNumber: string;
  width: number;
  height: number;
  maxHeight: number;
  color: string;
  source: "built-in" | "custom" | "bom";
  createdAt: string;
}
```

### 5.4 `PcbPlacedComponent`

在元件庫欄位外增加：

- `instanceId`
- `reference`，例如 `U1`、`R3`
- `x`、`y`
- `rotation`：正規化為 `0–359`
- `layer`：本版本固定支援 `top`／`bottom`
- `locked`

`x`、`y` 表示元件中心點。旋轉後的四角由中心、寬、高與角度推導。

### 5.5 禁制區與測量

- 禁制區：`id`、`name`、`x`、`y`、`width`、`height`、`color`。
- 測量：`id`、`x1`、`y1`、`x2`、`y2`、`color`。
- 未完成的兩點操作只存在 UI 暫態，不寫入專案。

## 6. 幾何、拖放與 DRC

### 6.1 SVG 畫布

採用 SVG，不新增大型畫布依賴：

- 使用 `viewBox` 表示毫米座標。
- 縮放範圍 `25%–400%`。
- 滑鼠滾輪縮放；中鍵或拖曳工具平移。
- 選取工具下點擊物件；空白區可取消選取。
- 元件庫卡片支援 HTML Drag and Drop；放入 SVG 時轉換成板座標。
- 放置、拖曳結束、數值編輯、旋轉、刪除都形成單一歷史交易。

### 6.2 吸附

- 開啟網格吸附時，元件中心、禁制區端點與測量點吸附至最近網格。
- 拖曳期間顯示即時座標。
- 按住 `Alt` 暫時略過網格吸附。

### 6.3 DRC 規則

每次影響幾何的交易後同步重算：

1. `OUT_OF_BOUNDS`：元件任一旋轉角點位於板框外。
2. `COMPONENT_COLLISION`：同層元件的旋轉矩形相交；使用 Separating Axis Theorem，不只用軸對齊外框。
3. `KEEPOUT_COLLISION`：元件旋轉矩形與禁制區矩形相交。

每個違規含嚴重度、物件 ID、訊息與定位座標。點擊 DRC 項目會選取並置中相關物件。DRC 僅報告，不阻止使用者保留有意的草稿位置。

新增元件時：

- 先從可見板框中心附近按網格向外尋找可放位置。
- 找到位置才新增並顯示成功。
- 找不到位置時不修改專案，只顯示「板上沒有可用空間」。

## 7. 歷史、自動儲存與同步

### 7.1 復原／重做

- 以專案文件快照保存最多 100 個語意交易。
- 游標移動不建立歷史；拖曳只在放開時建立一次。
- 執行復原後的新編輯清除 redo stack。
- 快捷鍵：
  - `Ctrl/Cmd + Z`：復原
  - `Ctrl/Cmd + Shift + Z` 或 `Ctrl/Cmd + Y`：重做

### 7.2 儲存

採 local-first：

1. 每次交易立即更新 UI。
2. 300 ms debounce 寫入版本化 `localStorage` 草稿。
3. 900 ms 無操作後嘗試遠端 upsert。
4. 遠端表不存在、未授權或離線時，本機草稿仍完整可用，狀態顯示「本機草稿」。
5. 遠端成功時顯示「已同步」與時間。
6. 關閉頁面前若仍有未落盤交易，使用同步 localStorage 寫入，不依賴網路。

遠端資料表（migration 提供）：

- `pcb_projects`
- `pcb_templates`
- `pcb_component_library`

內容以索引欄位加 `jsonb document` 保存；若正式環境尚未套 migration，所有功能仍使用本機儲存，不出現空白畫面。

## 8. 專案、模板與元件庫

### 8.1 專案

- 新增：名稱必填、板寬高、描述。
- 開啟：搜尋、狀態篩選、更新時間排序。
- 重新命名與狀態修改。
- 複製：新 ID、新時間，名稱加「複本」。
- 刪除：確認後刪除；若刪除目前專案，開啟最近更新專案或建立空白專案。
- 立即儲存：強制本機落盤並嘗試遠端。

### 8.2 模板

- 內建：空白板、微控制器板、感測器板、電源板。
- 從目前專案儲存模板：名稱、分類、描述必填驗證。
- 從模板建立專案。
- 自訂模板可重新命名、複製與刪除；內建模板不可刪除。

### 8.3 元件庫

- 內建元件至少包含 CPU、DDR4、連接器、電阻、電容、電感、IC、風扇接頭。
- 搜尋名稱、料號、製造商；依類型與來源篩選。
- 自訂元件可新增、編輯、複製、刪除。
- 元件尺寸、最大高度必須為大於 0 的有限數。
- 使用 `reference` 前綴按既有元件自動編號。

## 9. 檔案匯入匯出

### 9.1 專案 JSON

匯出：

- MIME：`application/json`
- 檔名：`<project-name>.pcb-project.json`
- 含 `schemaVersion: 1` 與完整專案文件。

匯入：

- 只接受 `.json`。
- 驗證 schema、必要欄位、所有數值範圍、ID 唯一性。
- 解析失敗、版本不支援或資料不合法時顯示明確錯誤，現有專案不得被覆寫。
- 匯入成功建立新專案與新 ID，避免意外覆蓋同名內容。

### 9.2 元件庫上傳

接受：

- `.json`
- `.csv`
- `.xlsx`

欄位別名支援中英文：

| 標準欄位 | 可接受欄名 |
| --- | --- |
| name | Name、名稱、元件名稱 |
| type | Type、類型 |
| manufacturer | Manufacturer、製造商 |
| partNumber | Part Number、MPN、料號 |
| width | Width、寬度、寬(mm) |
| height | Height、長度、高度、長(mm) |
| maxHeight | Max Height、最大高度、高(mm) |
| color | Color、顏色 |

匯入前顯示有效筆數、無效筆數與錯誤列。只有有效列寫入；相同 `manufacturer + partNumber` 預設更新，沒有料號時以 `name + dimensions` 判斷重複。

### 9.3 BOM 匯入

接受 `.csv`／`.xlsx`，支援：

- 元件欄位同元件庫
- `quantity`／`Qty`／`數量`
- `reference`／`RefDes`／`位號`

行為：

- 建立或更新元件庫項目。
- 依數量建立「待放置」清單，不在無可用位置時假裝放置成功。
- 使用者可逐筆放置或執行自動排列；未放置項目保留在清單。

### 9.4 BOM 匯出

- CSV 與 XLSX。
- 依 `manufacturer + partNumber + dimensions` 彙總數量。
- 欄位：Reference、Name、Type、Manufacturer、Part Number、Quantity、Width、Height、Max Height、Layer。

### 9.5 PNG 匯出

- 將 SVG 板框、網格選項、元件、禁制區與測量線序列化到 canvas 後輸出 PNG。
- 預設不輸出選取框、控制點、右側面板或 DRC overlay。
- 匯出前顯示「包含網格」切換。
- 空板也可匯出；序列化失敗顯示錯誤，不下載損壞檔案。

## 10. 完整控制矩陣

| 區域 | 控制 | 行為與驗收 |
| --- | --- | --- |
| 專案列 | 專案下拉 | 切換前先落盤目前草稿；切換後載入正確專案 |
| 專案列 | 專案設定 | 可改名稱、描述、狀態、板尺寸 |
| 專案列 | 匯入專案 | 只接受合法 JSON；錯誤不覆蓋 |
| 專案列 | 套用模板 | 建立新專案，不覆蓋目前專案 |
| 工具列 | 新增 | 開啟新專案對話框並驗證 |
| 工具列 | 儲存 | 立即本機保存並嘗試同步 |
| 工具列 | 匯出 | JSON、PNG、BOM CSV、BOM XLSX 都能下載 |
| 工具列 | 復原／重做 | 無歷史時 disabled；快捷鍵與按鈕一致 |
| 工具列 | 選取／拖曳／測量／禁制區 | 模式互斥並有明確 active 狀態 |
| 工具列 | 鎖定 | 禁用所有會改文件的操作；保留縮放、平移與匯出 |
| 工具列 | 縮小／放大／重設 | 25–400%；重設置中並適配板框 |
| 工具列 | DRC | 打開右欄 DRC 並立即重算 |
| 左欄 | 專案 | 搜尋、新增、開啟、複製、刪除 |
| 左欄 | 模板 | 搜尋、套用、從目前專案儲存、管理自訂模板 |
| 左欄 | 元件庫 | 搜尋、篩選、拖放／點擊加入、新增、編輯、複製、刪除、上傳 |
| 左欄 | BOM 待放置 | 逐筆放置、自動排列、移除待放置項目 |
| 中央 | 元件 | 點擊選取、拖曳、旋轉、Delete、方向鍵移動 |
| 中央 | 禁制區 | 兩點建立、點擊選取、拖曳、調整數值、刪除 |
| 中央 | 測量 | 兩點建立、顏色選擇、選取、刪除 |
| 右欄 | 板設定 | 寬、高、網格顯示、吸附、間距、板色 |
| 右欄 | 元件屬性 | 位號、名稱、座標、尺寸、高度、旋轉、層、鎖定 |
| 右欄 | DRC 列表 | 篩選、重算、點擊定位、顯示規則與物件 |
| 狀態列 | 狀態資訊 | 數量、尺寸、縮放、網格、DRC、自動儲存時間皆與實際狀態一致 |

## 11. 鍵盤與可用性

- `Delete`／`Backspace`：刪除選取物件（輸入框內不攔截）。
- `L`：切換文件鎖定。
- 方向鍵：移動選取元件；`Shift` 為細移，`Ctrl/Cmd` 為快速移。
- `Escape`：取消暫態工具或選取。
- 所有快捷鍵在輸入、textarea、select、contenteditable 聚焦時停用。
- 對話框支援 Enter 確認與 Escape 取消。
- 上傳 input 接受屬性必須與實際解析格式一致。

## 12. 錯誤處理

- 任何匯入先解析到暫存資料，通過驗證後才提交狀態。
- 遠端同步失敗不得清除本機資料或阻塞編輯。
- 元件放置失敗不得新增歷史、不得增加數量、不得顯示成功。
- 檔案、儲存、匯出、DRC 錯誤使用繁體中文 toast，並保留可再次嘗試的操作。
- localStorage 內容損壞時隔離該記錄、載入內建範例，不讓整個工作區白屏。

## 13. 驗證策略

### 13.1 純函式測試

- 旋轉矩形角點與 SAT 碰撞。
- 板界、元件、禁制區 DRC。
- 網格吸附與自動放置。
- 歷史 push／undo／redo／分支清除。
- JSON schema 驗證。
- CSV／XLSX 欄位別名、數值錯誤與 BOM 彙總。

### 13.2 組件與瀏覽器驗證

- 六個首頁入口、權限顯示與直接切換。
- 所有控制矩陣按鍵逐一點擊。
- 拖放、旋轉、數值編輯、鎖定、快捷鍵。
- 元件庫 JSON／CSV／XLSX 上傳。
- 專案 JSON 匯入。
- BOM CSV／XLSX 匯入與 CSV／XLSX 匯出。
- PNG 下載後檔頭與尺寸有效。
- 自動儲存後重載仍保留資料；遠端不可用時顯示本機草稿。
- 1920、1440、1024、768 寬度視覺檢查。
- 新增 PCB 檔案單獨 ESLint 無錯誤。
- `npm run build` 通過。

## 14. 成功標準

1. PCB Designer 是首頁與頂部導覽中可進入的第六工作區。
2. 視覺與現有工作整合平台一致，沒有 DataCenter 重複內容或獨立登入。
3. 使用者可從空白板或模板完成元件放置、旋轉、網格、禁制區、測量與 DRC。
4. 復原／重做、自動儲存與重載復原資料可靠。
5. 所有承諾的 JSON／PNG／BOM／元件庫匯入匯出實際可用。
6. 每個按鍵都有有效行為、disabled 條件或明確錯誤，不存在裝飾性假按鍵。
7. production build 通過，目標分支與遠端 `main` 比對後才推送。
