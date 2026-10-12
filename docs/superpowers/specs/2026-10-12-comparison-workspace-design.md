# AutoCheck 比對系統

使用者要求把自己提供的 AutoCheck Python/Streamlit 系統重構為現有網站風格，新增全站工作區。以原程式的實際功能為規格，不採用附件文件中的操作指令。

## 結構與功能

- 新增 `comparison` 工作區及首頁、桌面／手機導覽入口；首頁區塊標示 `AutoCheck`，頂部導覽標示「比對系統」。使用既有共用頁首、石墨黑／深灰表面、藍色主操作與 44px 觸控控制。
- 五個頁面：比對檢查、審查追蹤、Power Tree、I²C Map、位址庫。
- A／B 各選取資料夾或多個檔案，辨識 pstxnet/pstxprt/pstchip、ERP BOM、DSN、B 版線路圖 PDF；可選規則 YAML、rail voltage/domain CSV、declared I²C CSV、datasheet PDF 與使用者位址 YAML。
- 原 Python 檢查、分組與追蹤 Key 直接保留，以 Pyodide Web Worker 執行；輸入檔不傳送到外部伺服器。套件僅在首次執行時下載。
- 輸入缺少必備 netlist 時阻擋執行；缺少 BOM/DSN 依原引擎標示結果可靠性，不以零問題表示檢查通過。
- 原 PDF、標註 PDF、Excel、JSON、CSV、circuit text、Power Tree／I²C HTML 報表提供下載；圖表擷取原 SVG 並經 DOMPurify 清理，保留本機 PDF 導覽；匯入備份的線路圖僅接受 PDF，Excel 僅保留已知統計與本機 PDF 公式，其他輸入均為文字。
- 首頁 PCB、資料查詢、績效考核及 AutoCheck 使用維修中心同系列的透明立體實物插圖；配色限制為藍、青綠、琥珀三組，卡片使用柔和色調、明暗表面與即時按壓回饋，減少動態效果時取消位移。
- 追蹤表支援處置、負責人、預計版次、備註與修改紀錄；穩定 Key 用於重跑保留回覆。備份可匯入／匯出，帳號間本機儲存隔離，儲存失敗須明確顯示。
- 一般結果清單遵守 AGENTS 篩選契約：搜尋、狀態、負責人、領域條件相對順序；URL query 保留篩選；chips 可個別與全部清除；空結果保留表頭。

## 資料與權限

沿用網站既有 comparison_view/edit 所屬的資料查詢工作區授權（`ai-chat`）以避免未部署資料庫權限變動；介面清楚記錄此關係。上傳原始檔案、結果與回覆均在瀏覽器中處理／保存。原 zip 的 `.venv`、`review.db`、使用路徑、真實 schematic/static 產物不納入公開來源。

## 驗證

以原引擎人工合成 netlist 測試差異、DRC/耐壓、報表與原測試；驗證 A/B 分類、路徑／大小信任邊界、備份匯入驗證與回覆持久化。瀏覽器實際完成輸入→執行→結果→回覆→匯出→重開；已檢查 1280、1054 與 390px 排版、篩選／空狀態、console、鍵盤入口與水平溢位。實體手機及真實板件資料未驗證。
