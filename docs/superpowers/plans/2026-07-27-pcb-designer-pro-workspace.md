# PCB Designer 專業工作區實作計畫

## Task 1：建立 3D 場景資料合約

**Files**
- Create: `src/components/pcb-designer/core/scene3d.ts`
- Test: `tests/pcb-designer/scene3d.test.ts`

1. 先寫失敗測試，涵蓋板尺寸、Top／Bottom 高度、旋轉、禁制區及選取。
2. 執行單一測試，確認因模組不存在而失敗。
3. 實作純函式，把 `PcbProject` 轉成 3D 場景模型。
4. 重跑測試直到通過。

## Task 2：補齊高頻元件操作

**Files**
- Modify: `src/components/pcb-designer/core/editor.ts`
- Modify: `src/components/pcb-designer/hooks/usePcbEditorActions.ts`
- Modify: `src/components/pcb-designer/PcbInspector.tsx`
- Test: `tests/pcb-designer/editor-actions.test.ts`

1. 先寫複製、翻面及板框置中失敗測試。
2. 擴充選取操作資料合約並保持 immutable update。
3. 由 workspace hook 暴露動作，放入檢查面板。
4. 驗證鎖定、唯讀、復原／重做仍正確。

## Task 3：建立可互動 3D Viewer

**Files**
- Create: `src/components/pcb-designer/Pcb3DViewer.tsx`
- Create: `tests/pcb-designer/3d-view-contract.test.ts`
- Modify: `src/components/pcb-designer/PcbDesignerWorkspace.tsx`

1. 先建立 UI 合約測試：Canvas、OrbitControls、相機預設、selection callback 及 fallback。
2. 實作板體、Top／Bottom 元件、禁制區、網格、座標軸及選取高亮。
3. 實作旋轉、平移、縮放、重設、Top／Bottom／等角視角及自動旋轉。
4. 將 2D／3D 切換接到同一份 workspace selection。

## Task 4：重做專案列與工具列

**Files**
- Modify: `src/components/pcb-designer/PcbDesignerWorkspace.tsx`
- Modify: `src/components/pcb-designer/PcbToolbar.tsx`
- Modify: `src/components/pcb-designer/pcb-designer.css`
- Create: `tests/pcb-designer/workspace-ui-contract.test.ts`

1. 先寫尺寸、2D／3D 切換、文字操作入口及真實本機儲存文案的合約測試。
2. 把控制項提升到平台尺寸系統，建立清楚的工具群組。
3. 修正過小字級、過窄面板、狀態與按鍵可讀性。
4. 保留窄螢幕抽屜及水平溢位安全。

## Task 5：改善左側資產與右側檢查流程

**Files**
- Modify: `src/components/pcb-designer/PcbLeftRail.tsx`
- Modify: `src/components/pcb-designer/PcbInspector.tsx`
- Modify: `src/components/pcb-designer/PcbCanvas.tsx`
- Modify: `src/components/pcb-designer/pcb-designer.css`

1. 加強標題、數量、搜尋、上傳及拖放提示。
2. 增加空白板開始引導與快捷動作。
3. 在右側整理板設定、選取物、顯示／圖層及 DRC 層級。
4. 確認鍵盤焦點、按鍵名稱與唯讀停用狀態。

## Task 6：完整驗證與整合

1. 執行 `npm run test:pcb`。
2. 執行變更檔 ESLint 與 `npm run build`。
3. 用實際瀏覽器驗證 1920×900：
   - 新增／開啟專案
   - 放置及選取元件
   - 複製、旋轉、翻面、置中
   - 2D／3D 切換
   - 3D 旋轉、縮放、預設視角
   - DRC、儲存及匯出入口
4. 執行程式碼審查並修正問題。
5. commit、整合至 `main`、push，核對 `origin/main` SHA。
