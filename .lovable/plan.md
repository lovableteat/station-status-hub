## 任務拆解

### 1. Data Center 3D 沒有光
現象：3D 場景全黑。需在 `DataCenter3DPlanner` 或 `DataCenterModelViewer` 的 Three.js scene 加上：
- `ambientLight`（環境光，強度 0.6）
- 主 `directionalLight`（強度 1.0，含陰影）
- 補光 `hemisphereLight`（天空/地面色調）
- 檢查 tone mapping / renderer.outputColorSpace 設定
先讀取檔案再決定精確落點。

### 2. 「在線成員」切帳號未更新
`OnlineUsersIndicator` / `useUserPresence` 應該在 `user.id` 變化時：
- 清掉舊 presence channel（`removeChannel`）
- 以新 user 重新 `subscribe`
- 卸載時廣播 `leave`
排查目前 hook 是否有 `useEffect` deps 缺少 `user?.id`，並修正。

### 3. 站點產能與瓶頸卡片排序不清
現在動態站點多時卡片外觀凌亂。改動：
- 卡片一律照 `station_order` 由左至右、由上到下排；每張卡片標題加大序號徽章「第 N 站」
- 卡片頂端加箭頭連續指示（第 1 → 第 2 → …）：以 grid + 之間 chevron 或直接在卡片右上角顯示「下一站 →」
- 瓶頸站點以粗邊框 + glow 高亮，並在卡片頂部貼「BOTTLENECK」標籤
- 排列改為固定 4 欄自適應，卡片高度統一

### 4. SystemEditDialog 軟體版本區塊可新增自訂欄位
目前 90BOM / Ubuntu / CUDA / 儀表板統計為硬編碼。改為：
- 新增資料表 `test_project_software_fields`（project_id, key, label, field_type）+ `test_system_software_values`（system_id, field_id, value）
- 或延用既有的 `test_project_address_fields` pattern 建立對稱 software 版本
- UI：軟體版本區加「+ 新增欄位」按鈕（同位址欄位邏輯），支援命名/刪除/重排
- 既有 90BOM、Ubuntu、CUDA、儀表板統計保留為預設（不可刪的鎖定欄位）

### 5. 新增第 6 個工作區「電路板編輯器」
從 `circuit-ai-architect-48` 專案抓取核心程式碼合入，並補完缺失功能：

**步驟**
1. 用 `cross_project--list_project_dir` 掃描該專案 `src/` 結構
2. 複製核心編輯器元件（Board canvas、Component library、Sidebar、DRC 檢查等）到 `src/components/circuit-editor/`
3. 依存的 hooks / types / utils 一起搬入
4. 若使用了 Supabase table，加相對應 migration（含 GRANT + RLS）
5. 用本平台的 design tokens（`bg-background`、`text-foreground`、`bg-primary` 等）重寫顏色，把綠色科技風替換為現有暗色 + 青綠 accent
6. 註冊到工作區選單（`WorkspaceEntrance` 加卡片、`Sidebar`/router 加入口、`workspacePermissions` 加 `circuit-editor` workspace + 對應 permission）
7. 補完現有頁面未完成的功能：
   - 元件庫 CRUD（新增/編輯/刪除元件、匯入 JSON）
   - 拖曳放置到畫布、選取、多選、對齊、旋轉、鎖定
   - 走線 / net 標記
   - DRC 規則檢查（重疊、超出板邊、間距）
   - 存檔到 Supabase、模板管理、匯出 JSON / PNG
   - Ctrl+Z / Ctrl+Y、Ctrl+滾輪縮放、L 鎖定畫布快捷鍵

## 執行順序
1、2、3、4 可並行實作（互不干擾）→ 逐一驗證  
5 最大，最後獨立完成並自建 migration

## 技術注意
- Radix Select 不用空字串 value（已在 core memory）
- 新表都要加 GRANT to authenticated + service_role
- Design tokens：不硬編顏色類別
- 不動既有 UI 設計除非該任務要求
- 站點顯示格式：「機台名 (SN)」規則不變

實作完後會逐項驗證：build、簡易 Playwright 截圖確認 Data Center 亮度、瓶頸卡片外觀、系統編輯器欄位新增、電路板編輯器可載入。
