// Shared by the on-screen guide and the downloadable CE workbooks.
export const MATERIAL_HANDOFF_VERSION = "2026-10-21";
export const MATERIAL_CE_FORMAT_REVISION = "2026-10-21-physical-virtual";

export const MATERIAL_HANDOFF_ROLES = [
  { role: "公司現有系統", responsibility: "維持原本的料號、料況與申請／核准流程，是正式資料來源；本工具不要求修改公司系統。", output: "公司料號與來源狀態" },
  { role: "CE", responsibility: "依 RD 提供的客戶 BOM，利用公司現有系統整理並轉出清單；保留設計欄位，補上右側「零件狀態」，再交回 RD。查無料號或狀態不明時明確註記待確認。", output: "整理後 BOM＋零件狀態" },
  { role: "料號追蹤工具", responsibility: "自動讀取欄位、整理同一虛擬料號下的實體料，呈現料號與風險；保留原文，不代替公司系統核准料號，也不替 RD 決定能否採用。", output: "可檢查的料號總表與追蹤紀錄" },
  { role: "RD", responsibility: "提供設計 BOM，匯入 CE 清單後核對位號、用量、料號與零件狀態；依公司流程確認選用／申請事項，再於網站記錄追蹤說明、單號與更新人。", output: "確認結果與後續申請追蹤" },
];

export const MATERIAL_HANDOFF_RULES = [
  "CE 整理與帶出狀態，不代表 CE 有權變更所有來源狀態；禁用、EOL、ODM 不建議用料等設定仍依公司既有權責窗口處理。",
  "Sourcing Status 是供應／核准來源狀態；零件狀態是新設計使用限制。兩欄分開保留。Approved／Active 不代表可以忽略禁用或 ODM 不建議用料。",
  "料號只有兩種：實體料號對應單一廠商的單一廠商料號；虛擬料號是可共用實體料的群組。同一虛擬料號下的實體料各列一行；查無實體料號時留白，不用虛擬料號代填。",
  "料號追蹤、單號、EE 是 RD 在網站維護的作業紀錄，CE 不需為了交付清單額外填寫；零件狀態不會自動建立申請追蹤。",
  "範例中的料號、廠商與狀態都是格式示範，不能當成真實選料、核准或替代料相容性依據。",
  "Symbol 填該實體料是否已建置 Symbol：有／無／待確認。已有實體料號、明確無 Symbol 時只補 Symbol；空白或 C 等未定義代碼保留原值，先待確認。Schematic_Part 另存符號名稱。",
];

export const MATERIAL_CE_FIELDS = [
  { header: "Level", owner: "RD 原始／CE 保留", requirement: "料件列填 2；0 為系統、1 為模組，網站只建立 Level 2 料件。", destination: "階層／分組", example: "2", width: 12 },
  { header: "Name", owner: "RD 原始／CE 保留", requirement: "保留客戶 BOM 料名；每個料件列必填，不要以廠商名稱取代。", destination: "料件名稱", example: "CAP CER 0.1UF 16V X7R", width: 32 },
  { header: "Qty", owner: "RD 原始／CE 保留", requirement: "保留設計用量；不要因展開替代料而重算或加總用量。", destination: "數量", example: "2", width: 12 },
  { header: "Ref Des", owner: "RD 原始／CE 保留", requirement: "保留完整位號，逗號分隔；同組替代料使用相同位號。", destination: "REF DES", example: "C101, C102", width: 24 },
  { header: "Manufacturer Part Number", owner: "RD 提供／CE 核對", requirement: "每列只填一個廠商料號，搭配該列廠商及實體料號；同一虛擬料下的其他實體料另列。", destination: "MPN", example: "DEMO-CAP-001", width: 32 },
  { header: "Manufacturer", owner: "CE 核對／帶出", requirement: "填該列 MPN 對應的廠商，不把不同廠商合在同一列。", destination: "廠商", example: "示範廠商 A", width: 24 },
  { header: "Sourcing Status", owner: "CE 從來源帶出", requirement: "保留公司／原廠供應與核准狀態原文，例如 Approved、Active、NRND、Obsolete；不得用它取代右側零件狀態。", destination: "供應／核准狀態", example: "Approved", width: 25 },
  { header: "虛擬料號", owner: "CE 從公司系統帶出", requirement: "填可共用實體料的虛擬料號；同一群組的實體料重複填相同虛擬料號。來源無值留白，不自行編號。", destination: "虛擬料號", example: "DEMO-VIRTUAL-001", width: 25 },
  { header: "實體料號", owner: "CE 從公司系統帶出", requirement: "填已申請的實體料號，每個料號對應單一廠商、單一 MPN，並保留前導零。查無時留白，不以虛擬料號或 MPN 代填。", destination: "實體料號", example: "000-DEMO-001", width: 28 },
  { header: "Symbol", owner: "CE 查核後填寫", requirement: "填該實體料有沒有已建置 Symbol：有／無／待確認。已有實體料號且填無時只需補 Symbol；原始 C 等代碼保留，未定義前不判有無。", destination: "Symbol 建置狀態／缺件提示", example: "有／無／待確認", width: 26 },
  { header: "Part Name", owner: "CE 從公司系統帶出", requirement: "來源有公司料名就保留；無資料可留白。", destination: "內部料名", example: "示範電容", width: 25 },
  { header: "Part Spec", owner: "RD 原始／CE 保留", requirement: "保留原規格；同組資料維持一致，差異交 RD 確認。", destination: "規格", example: "0.1uF / 16V / X7R", width: 30 },
  { header: "Schematic_Part", owner: "原 BOM／CE 保留", requirement: "原 BOM 的符號名稱，例如 CAP；這欄不代表 Symbol 是否已建置，有無狀態請填 Symbol 欄。", destination: "原理圖符號名稱", example: "CAP", width: 25 },
  { header: "PCB_Footprint", owner: "RD 原始／CE 保留", requirement: "原 BOM 有封裝就保留；無資料可留白，不要求 CE 新建封裝。", destination: "Footprint", example: "C_0402", width: 25 },
  { header: "零件狀態", owner: "CE 補欄／帶出原文", requirement: "本次交付必須補在最右側。填公司新設計使用限制原文；不明填待確認，供 RD 後續確認與參考。", destination: "零件狀態（獨立顯示）", example: "新設計產品不建議使用－ODM 不建議用料", width: 45 },
];

export const MATERIAL_HANDOFF_STEPS = [
  "RD 提供單一專案／版本的客戶 BOM，CE 保留設計料名、位號、用量與圖面資料。",
  "CE 利用公司現有系統核對並帶出虛擬料號、實體料號與供應狀態，在最右側補上零件狀態；未知處明確填待確認。",
  "CE 依空白範本的固定表頭交付 Excel；每列為單一廠商的一個實體料，同一虛擬料下的實體料分列填寫，保留 Ref Des。",
  "RD 使用上傳 BOM 匯入，核對位號、MPN、虛擬料號、實體料號、供應狀態與零件狀態。工具只整理與提示，不自動核准。",
  "RD 依公司流程處理選用與申請；料號追蹤、單號、EE 與圖片於網站維護，再匯出結果供確認。",
];

export const MATERIAL_CE_EXAMPLE_ROWS = [
  [2, "CAP CER 0.1UF 16V X7R", 2, "C101, C102", "DEMO-CAP-001", "示範廠商 A", "Approved", "DEMO-VIRTUAL-001", "000-DEMO-001", "無", "示範電容", "0.1uF / 16V / X7R", "CAP", "C_0402", "待確認"],
  [2, "CAP CER 0.1UF 16V X7R", 2, "C101, C102", "DEMO-CAP-ALT", "示範廠商 B", "Approved", "DEMO-VIRTUAL-001", "000-DEMO-ALT", "C", "示範替代電容", "0.1uF / 16V / X7R", "CAP", "C_0402", "新設計產品不建議使用－ODM 不建議用料"],
  [2, "POWER IC", 1, "U10", "DEMO-IC-EOL", "示範廠商 C", "Active", "DEMO-VIRTUAL-IC", "000-DEMO-EOL", "有", "示範電源 IC", "示範規格", "POWER_IC", "QFN_DEMO", "新設計產品不建議使用－EOL"],
  [2, "CONNECTOR", 1, "J20", "DEMO-CONN-NEW", "示範廠商 D", "", "", "", "無", "", "示範規格", "CONN", "CONN_DEMO", "待確認"],
];
