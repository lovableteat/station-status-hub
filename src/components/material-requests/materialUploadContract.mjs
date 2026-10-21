// Shared by the on-screen guide and the downloadable CE workbooks.
export const MATERIAL_HANDOFF_VERSION = "2026-10-21";
export const MATERIAL_CE_FORMAT_REVISION = "2026-10-21-column-meanings";
export const MATERIAL_CE_HEADER_ROW = 4;
export const MATERIAL_CE_MEANING_ROW = 5;
export const MATERIAL_CE_DATA_START_ROW = 6;

export const MATERIAL_HANDOFF_ROLES = [
  { role: "公司現有系統", responsibility: "維持原本的料號、料況與申請／核准流程，是正式資料來源；本工具不要求修改公司系統。", output: "公司料號與來源狀態" },
  { role: "CE", responsibility: "依 RD 提供的 BOM 整理公司資料，保留設計欄位、虛實料號及各狀態欄原值，依格式填寫 phase out、Symbol 與零件狀態；未知處標示待確認。", output: "整理後 BOM＋各欄原值" },
  { role: "料號追蹤工具", responsibility: "自動讀取欄位、整理同一虛擬料號下的實體料，呈現料號與風險；保留原文，不代替公司系統核准料號，也不替 RD 決定能否採用。", output: "可檢查的料號總表與追蹤紀錄" },
  { role: "RD", responsibility: "提供設計 BOM，匯入 CE 清單後逐欄核對；phase out、Symbol 各自獨立，不互相代填。依公司流程確認選用／申請事項，再於網站記錄追蹤說明、單號與更新人。", output: "確認結果與後續申請追蹤" },
];

export const MATERIAL_HANDOFF_RULES = [
  "CE 整理與帶出狀態，不代表 CE 有權變更所有來源狀態；禁用、EOL、ODM 不建議用料等設定仍依公司既有權責窗口處理。",
  "phase out 與 Symbol 是兩個獨立欄位。phase out 記錄零件狀態；Symbol 記錄是否已有實體料號但缺 Symbol。兩欄各自保留原值，不互相代填，也不改名或覆蓋其他欄位。",
  "料號只有兩種：實體料號對應單一廠商的單一廠商料號；虛擬料號是可共用實體料的群組。同一虛擬料號下的實體料各列一行；查無實體料號時留白，不用虛擬料號代填。",
  "料號追蹤、單號、EE 是 RD 在網站維護的作業紀錄，CE 不需為了交付清單額外填寫；零件狀態不會自動建立申請追蹤。",
  "範例中的料號、廠商與狀態都是格式示範，不能當成真實選料、核准或替代料相容性依據。",
  "Symbol 的意思是是否已有實體料號但缺 Symbol；由 CE 依來源確認後填寫，網站獨立顯示原文。C 等未定義代碼照原值保留，不自行改填缺 Symbol 或已齊備。Schematic_Part 仍是符號名稱。",
];

export const MATERIAL_CE_FIELDS = [
  { header: "Level", meaning: "階層：0 系統／1 模組／2 料件", owner: "RD 原始／CE 保留", requirement: "料件列填 2；0 為系統、1 為模組，網站只建立 Level 2 料件。", destination: "階層／分組", example: "2", width: 12 },
  { header: "Name", meaning: "設計 BOM 的料件名稱", owner: "RD 原始／CE 保留", requirement: "保留客戶 BOM 料名；每個料件列必填，不要以廠商名稱取代。", destination: "料件名稱", example: "CAP CER 0.1UF 16V X7R", width: 32 },
  { header: "Qty", meaning: "單一產品的用量", owner: "RD 原始／CE 保留", requirement: "保留設計用量；不要因展開替代料而重算或加總用量。", destination: "數量", example: "2", width: 12 },
  { header: "Ref Des", meaning: "電路位號，例如 C101、R1", owner: "RD 原始／CE 保留", requirement: "保留完整位號，逗號分隔；同組替代料使用相同位號。", destination: "位號（REF DES）", example: "C101, C102", width: 24 },
  { header: "Manufacturer Part Number", meaning: "單一廠商的單一原廠料號（MPN）", owner: "RD 提供／CE 核對", requirement: "每列只填一個廠商料號，搭配該列廠商及實體料號；同一虛擬料下的其他實體料另列。", destination: "廠商料號（MPN）", example: "DEMO-CAP-001", width: 32 },
  { header: "Manufacturer", meaning: "該列 MPN 的製造商", owner: "CE 核對／帶出", requirement: "填該列 MPN 對應的廠商，不把不同廠商合在同一列。", destination: "廠商", example: "示範廠商 A", width: 24 },
  { header: "Sourcing Status", meaning: "供應／核准來源狀態，保留原文", owner: "CE 從來源帶出", requirement: "保留公司／原廠供應與核准狀態原文，例如 Approved；不得用它改填 phase out、Symbol 或最右側零件狀態。", destination: "供應／核准狀態", example: "Approved", width: 25 },
  { header: "虛擬料號", meaning: "可共用多個實體料的上層料號", owner: "CE 從公司系統帶出", requirement: "填可共用實體料的虛擬料號；同一群組的實體料重複填相同虛擬料號。來源無值留白，不自行編號。", destination: "虛擬料號", example: "DEMO-VIRTUAL-001", width: 25 },
  { header: "實體料號", meaning: "已申請的單一廠商、單一 MPN 實體料號", owner: "CE 從公司系統帶出", requirement: "填已申請的實體料號，每個料號對應單一廠商、單一 MPN，並保留前導零。查無時留白，不以虛擬料號或 MPN 代填。", destination: "實體料號", example: "000-DEMO-001", width: 28 },
  { header: "Symbol", meaning: "是否已有實體料號但缺 Symbol（保留原文）", owner: "CE 查核後填寫", requirement: "此欄獨立記錄是否已有實體料號但缺 Symbol，由 CE 依來源填寫；不因 phase out 或其他欄位而覆寫。C 等未定義代碼照原值保留，不自行轉成有、無或其他結論。", destination: "Symbol（獨立原值）", example: "來源原文；不明填待確認", width: 28 },
  { header: "Part Name", meaning: "實體料號對應的公司料名", owner: "CE 從公司系統帶出", requirement: "來源有公司料名就保留；無資料可留白。", destination: "實體料名", example: "示範電容", width: 25 },
  { header: "Part Spec", meaning: "料件規格，保留原內容", owner: "RD 原始／CE 保留", requirement: "保留原規格；同組資料維持一致，差異交 RD 確認。", destination: "料件規格", example: "0.1uF / 16V / X7R", width: 30 },
  { header: "Schematic_Part", meaning: "原理圖符號名稱，不代表 Symbol 有無", owner: "原 BOM／CE 保留", requirement: "原 BOM 的符號名稱，例如 CAP；這欄不代表 Symbol 是否已建置，有無狀態請填 Symbol 欄。", destination: "原理圖符號名稱", example: "CAP", width: 25 },
  { header: "PCB_Footprint", meaning: "PCB 封裝名稱", owner: "RD 原始／CE 保留", requirement: "原 BOM 有封裝就保留；無資料可留白，不要求 CE 新建封裝。", destination: "PCB 封裝名稱", example: "C_0402", width: 25 },
  { header: "phase out", meaning: "零件狀態（保留公司原文）", owner: "CE 從公司系統帶出", requirement: "此欄獨立保留公司的零件狀態原文，例如 ACTIVE、PHASEOUT、UNDERREVIEW；不與 Symbol 合併，也不覆寫其他狀態欄。", destination: "phase out（獨立原值）", example: "ACTIVE", width: 30 },
  { header: "零件狀態", meaning: "新設計使用限制；不明填待確認", owner: "CE 補欄／帶出原文", requirement: "本次交付保留在最右側，填公司來源原文，例如 ODM 不建議用料；不明填待確認。此既有欄位不因新增 phase out 或 Symbol 而改名或改值。", destination: "零件狀態（原欄位）", example: "新設計產品不建議使用－ODM 不建議用料", width: 45 },
];

// The previously supplied 15-column meaning row remains metadata on re-upload.
export const MATERIAL_CE_LEGACY_MEANING_FIELDS = MATERIAL_CE_FIELDS
  .filter(field => field.header !== "phase out")
  .map(field => ({
    header: field.header,
    meaning: field.header === "Symbol" ? "實體料是否已建 Symbol：有／無／待確認" : field.meaning,
  }));

export const MATERIAL_HANDOFF_STEPS = [
  "RD 提供單一專案／版本的客戶 BOM，CE 保留設計料名、位號、用量與圖面資料。",
  "CE 利用公司現有系統帶出虛實料號及各欄原值，phase out 與 Symbol 分別填寫，不合併、不代填。",
  "CE 依空白範本的固定表頭交付 Excel；每列為單一廠商的一個實體料，同一虛擬料下的實體料分列填寫，保留 Ref Des。",
  "RD 使用上傳 BOM 匯入，逐欄核對位號、MPN、虛實料號、phase out、Symbol 與零件狀態。工具保留原值，不自動核准。",
  "RD 依公司流程處理選用與申請；料號追蹤、單號、EE 與圖片於網站維護，再匯出結果供確認。",
];

export const MATERIAL_CE_EXAMPLE_ROWS = [
  [2, "CAP CER 0.1UF 16V X7R", 2, "C101, C102", "DEMO-CAP-001", "示範廠商 A", "Approved", "DEMO-VIRTUAL-001", "000-DEMO-001", "無", "示範電容", "0.1uF / 16V / X7R", "CAP", "C_0402", "ACTIVE", "待確認"],
  [2, "CAP CER 0.1UF 16V X7R", 2, "C101, C102", "DEMO-CAP-ALT", "示範廠商 B", "Approved", "DEMO-VIRTUAL-001", "000-DEMO-ALT", "C", "示範替代電容", "0.1uF / 16V / X7R", "CAP", "C_0402", "ACTIVE", "新設計產品不建議使用－ODM 不建議用料"],
  [2, "POWER IC", 1, "U10", "DEMO-IC-EOL", "示範廠商 C", "Active", "DEMO-VIRTUAL-IC", "000-DEMO-EOL", "有", "示範電源 IC", "示範規格", "POWER_IC", "QFN_DEMO", "PHASEOUT", "新設計產品不建議使用－EOL"],
  [2, "CONNECTOR", 1, "J20", "DEMO-CONN-NEW", "示範廠商 D", "", "", "", "無", "", "示範規格", "CONN", "CONN_DEMO", "UNDERREVIEW", "待確認"],
];
