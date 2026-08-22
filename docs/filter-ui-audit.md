# 跨工作區篩選 UI 稽核

日期：2026-08-22

## 結論

目前路由由 `src/pages/Index.tsx` 暴露首頁與七個工作區：機台維修紀錄中心、料號申請、Data-center、PCB Designer、後台管理、資料查詢空間、績效考核系統。本稽核檢視這些路由實際掛載的元件；舊檔案或沒有被目前路由引用的畫面不列為立即工作。

凡是「使用者設定搜尋或條件後，畫面顯示一組較小的資料結果」的表格、卡片清單、檔案清單或 lane 都應立即對齊 `AGENTS.md`。這裡的「應立即對齊」是現行產品標準與後續實作清單，不代表 Task 8 已修改產品程式碼。沒有任何篩選能力的清單不必為了形式新增無用途的篩選列；一旦加入篩選，就必須直接採用完整標準。

現況判定：

- **接近標準**：主要位置或部分互動已正確，但仍有契約缺口。
- **待對齊**：持久位置、作用中 chip、清除能力、URL 或空結果結構至少一項缺失。
- **不適用**：不是資料結果篩選；理由記錄在「允許保留差異」。

## 應立即對齊的資料清單

### 機台維修紀錄中心

| 模組／資料結果 | 目前元件 | 現況與應對齊項目 |
| --- | --- | --- |
| L10 測試追蹤的表格與站點看板 | `src/components/test-tracker/TestTracker.tsx`、`TestProgressTable.tsx` | **接近標準。** 目前 working tree 已將篩選移到結果正上方，順序為搜尋 → 站點 → 狀態 → 工程師，並提供排序、URL 同步、手動／自動條件 chip、個別清除與全部清除；`system`、`station`、`excludeStatus` 會出現在同一組 UI。桌面零筆結果也保留 header／欄位並以無標點的精確文字 `目前篩選條件沒有符合的機台` 顯示。專案管理、批次重置、匯出與 PDF 雖有分隔線，仍位於同一 toolbar section；後續應移到獨立揭露區，並目視確認窄版收合次要排序／工具時 active chips 始終可見。
| 生產監控 lane | `src/components/production/ProductionMonitor.tsx` | **接近標準。** 持久列已位於 lane 上方，共用欄位順序為搜尋 → 站點 → 狀態 → 工程師；目前 working tree 也會解析 `attention=1`、同步 URL，並在同一列顯示可個別清除的「需關注機台」條件。其餘搜尋／下拉／異常／超時條件仍沒有持久 chip，也沒有涵蓋全部條件的「全部清除」；窄版只能收合次要工具，不能收合 active chips。
| 問題列表 | `src/components/issues/IssueTracker.tsx`、`IssueTableView.tsx` | **接近標準。** 搜尋、優先級與狀態位於表格正上方，但沒有作用中 chip 或全部清除；`system` URL 值目前被當作搜尋初值，仍應保留為可辨識、可清除且同步 URL 的自動條件。零筆時應保留 `IssueTableView` 欄位 header，使用問題領域的等價空結果文字。
| 工具、檔案、程式碼與指令資產清單 | `src/components/tools/ToolsManagement.tsx`、`CodeStorageManager.tsx`、`CommandLibrary.tsx` | **待對齊。** 頂層工具／檔案已有搜尋與類型 pills，但缺少一致的 active chips、全部清除，以及通用／目前工作區 scope 條件；程式碼與指令的內嵌清單也要遵守相同語意。分頁是資產種類導覽，不應偽裝成可清除的篩選條件。
| 資料儲存的檔案與資料夾結果 | `src/components/test-plan/TestPlanWorkspace.tsx` | **接近標準。** 搜尋、格式與排序已緊接結果區，但沒有 active chips、個別清除與全部清除；排序、grid/list 與重新整理屬次要工具，行動版可以收合，搜尋／格式 active chips 不可收合。資料夾 breadcrumb 是位置上下文，不列入全部清除。
| Dashboard 內可展開的機台／關注資料列 | `src/components/dashboard/Dashboard.tsx` | KPI、圖表與摘要卡本身不是資料清單；目前 working tree 已用 URL 將站點與排除已完成帶到 L10、將 `attention=1` 帶到生產監控牆，並以 system ID 開啟 L10。若這些區塊日後加入本地搜尋或篩選，仍必須套用持久列與空結果規則；自動條件則由目標頁在同一組篩選 UI 顯示。

`src/components/test-projects/ProjectScopeBar.tsx` 是整個中心的專案上下文，不是列表篩選。全部清除不得把使用者踢出目前專案。

### 其他工作區

| 工作區／資料結果 | 目前元件 | 現況與應對齊項目 |
| --- | --- | --- |
| 料號申請的 BOM workspace、料件表與行動卡片 | `src/components/material-requests/MaterialRequestPage.tsx` | **接近標準，亦是可參考現況。** 已有持久搜尋、可用性／欄位條件、active chips、個別移除與全部清除。仍要讓桌面零筆結果留在表格 body 並保留欄位 header；行動卡片可使用領域文字。排序與匯出維持次要層級，使用者儲存的工作狀態不可被全部清除誤刪。
| Data-center 的共享專案卡片清單 | `src/components/data-center/DeploymentPlanningCenter.tsx` | 共享專案庫若提供搜尋或篩選，應使用持久列、active chips 與清除規則。場景中的機櫃搜尋、圖層與模型庫屬操作上下文，依下節保留專用 UI；例外不應擴張到一般專案結果清單。
| PCB 專案、模板與元件庫結果 | `src/components/pcb-designer/PcbLeftRail.tsx` | **待對齊。** 左 rail 已固定顯示搜尋與狀態／來源／類型下拉，但沒有 active chips 或全部清除。rail 可以維持窄欄布局，作用中條件仍必須一直看得到且可逐一清除；畫布與圖層工具不套用資料清單外觀。
| 後台工程師／使用者清單 | `src/components/user-management/UserManagement.tsx` | **待對齊。** 搜尋與團隊條件位於卡片清單上方，但缺少 active chips、個別清除、全部清除與一致的零筆骨架。相對順序應維持搜尋在前，團隊是領域條件。
| 後台 API 資料預覽表 | `src/components/api-management/ApiDataTable.tsx` | **接近標準。** 搜尋與狀態在表格上方且保留 `TableHeader`；補上 active chips、個別清除與全部清除。`ApiKeyManagement.tsx` 的金鑰表目前沒有篩選，不要求新增空控制，但未來加搜尋／狀態時要直接遵守本標準。
| 資料查詢空間的共享提示詞、對話與來源清單 | `src/components/api-management/ApiChatConsole.tsx` | **待對齊。** 共享提示詞已有搜尋、分類與排序；搜尋／分類需有 active chips 與全部清除，排序可在行動版收合。對話或來源清單一旦可篩選也相同；模型/provider 選擇是執行上下文，不是清單篩選。
| 績效考核結果清單 | `src/components/performance/PerformanceAppraisalPage.tsx` | **接近標準。** 搜尋與狀態 panel 緊接卡片／清單結果，但沒有 active chips、個別清除與全部清除。零筆可使用考核領域文字；若呈現欄位式清單，仍保留欄位骨架。

後台的 `AdminCollaborationPanel.tsx` 收件人搜尋是公告撰寫流程內的 picker，不是持久資料結果頁；若日後新增獨立的帳號／訊息稽核清單，該清單需對齊。首頁 `WorkspaceEntrance.tsx` 是工作區導覽，不需篩選列。

## 允許保留差異的領域控制

下列控制可以保留專用排列、按壓狀態、側欄、sheet 或 overlay，因為它們改變編輯器／場景上下文、直接操作物件，或選擇執行目標，**不是資料結果篩選**。例外必須縮到控制本身；旁邊若另有普通資料清單，普通清單仍要對齊。

| 控制 | 允許差異的原因 | 仍須守住的可見性 |
| --- | --- | --- |
| L10 流程版本、站點與測項編輯器 `src/components/test-tracker/FlowInfo.tsx` | 這是有順序與版本語意的流程配置，不是把業務資料篩成較小結果；站點／版本選擇會改變編輯上下文。 | 目前版本、站點與未儲存狀態要可見，但不必偽裝成 filter chips。
| PCB 2D／3D 畫布 `PcbCanvas.tsx`、`Pcb3DCanvas.tsx` 與 `PcbSoftware3DCanvas.tsx` | 放置、拖曳、縮放、量測與選取是空間操作，不能用一般清單工具列取代。 | 目前選取物件、模式與錯誤回饋必須可見。
| PCB 圖層與編輯工具 `PcbToolbar.tsx`、`PcbInspector.tsx` | Top／Bottom 圖層、可見層、走線工具與 inspector 欄位改變繪圖目標或物件屬性，不是在過濾元件結果。 | 目前 active layer、visible layer 與選取元件要有明確 pressed／selected 狀態。
| Data-center 場景與設備控制 `src/components/data-center/DeploymentPlanningCenter.tsx` | 2D／3D 圖層、相機、機櫃選取、U 位安裝與環境 overlay 都是空間操作；模型庫還要即時表達機櫃／設備相容性、安裝位置與預覽，專用側欄或 sheet 比通用篩選列更安全。 | 目前圖層、機櫃、模型、相容性與安裝目標必須明確可見；一般專案資料清單不繼承此例外。
| AI chat 的 provider／模型、附件、提示詞套用與輸入區 `ApiChatConsole.tsx` | 這些控制決定請求執行目標或正在撰寫的內容，不是縮小共享提示詞／對話資料結果。 | 目前 provider、模型、附件與作用中對話必須可見；共享提示詞清單的搜尋／分類仍需依標準顯示 active chips。
| 表單、關聯選擇器與短期 picker | 例如公告收件人、工程師指派、模型安裝位置與檔案移動目的地，只在一個明確動作期間有效，不應寫入頁面 URL。 | Dialog／Sheet 開啟期間要顯示目前選擇並提供取消或重設；關閉後不得殘留隱性條件。

## 後續驗收清單

每次對上表的資料清單做產品修改時，至少驗收：

1. 篩選列是否直接位於它控制的結果上方，且桌面／行動版的共用欄位相對順序一致。
2. 每個手動與 URL 自動條件是否在同一列可見、可個別清除，且有全部清除。
3. 清除是否同步 URL，同時保留 workspace、module、專案與資料夾等上下文。
4. 零筆是否保留表頭／欄位骨架；機台清單是否逐字顯示 `目前篩選條件沒有符合的機台`。
5. 行動版是否只收合次要排序／工具，而沒有收合作用中的篩選條件。
6. 被標示為例外的控制是否確實是空間、圖層、模型、編輯或短期 picker，而不是用「領域特殊」掩蓋一般資料清單。
