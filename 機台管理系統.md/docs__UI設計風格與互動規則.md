> 集中副本；原始路徑：`docs/UI設計風格與互動規則.md`；程式參考基準：`2c5dd8829effc42acd60f64089701abb57e481c2`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# UI 設計風格與互動規則

本文件用於在另一台電腦建立相近的工程管理網站，保留本專案的視覺語言、資訊層級與操作契約。依據 2026-10-20 的本機原始碼整理，查閱時的 Git HEAD 為 `c6629250`。這是設計與實作交接規格，不代表本次已執行瀏覽器、正式站或實體手機驗收。

文中的「必要契約」來自 `AGENTS.md`，後續新功能與修改必須遵守；「目前實作」是當前程式可核對的結果，可能包含歷史相容處理或尚未全面收斂的細節；「重建驗收」是另一台電腦實作後需要重新檢查的項目。不要把目前實作中的缺口複製成永久標準。

## 1. 整體氣質與資訊優先順序

這是一個供工程人員長時間操作的繁體中文工作平台。畫面以黑色與中性炭灰階分層，玉綠色標示主要操作、目前選取與焦點；警告、錯誤、完成各有固定語意。核心是資料可讀、工作上下文清楚、操作可預測，不是把每個工作區做成不同配色的展示頁。

重建時維持以下順序：

1. 使用者先知道自己所在的工作區、專案、資料空間或編輯目標。
2. 再看到頁面標題、必要摘要與主要建立／執行動作。
3. 可篩選資料結果的控制緊貼結果上方，作用中的條件持續可見。
4. 結果保留欄位與資料關係；詳情、進階選項和不常用工具逐步揭露。
5. 儲存、上傳、執行中的回饋必須反映真實狀態，錯誤提供可恢復的下一步。

避免以大面積彩色卡片、霓虹發光、無意義漸層、假數據、假狀態燈、密集裝飾標章取代上述結構。少量領域辨識色可以保留，但不能讓主操作色、警告色與錯誤色失去一致意義。

依據：`src/index.css` 最後的共用 dark foundation 與元件覆寫、`src/components/layout/WorkspaceEntrance.tsx`、`src/components/comparison/comparison.css`。

## 2. 色票：以最後生效的 CSS 定義為準

`src/index.css` 前段仍留有 Matte Navy + Cobalt 與較早的 charcoal 色票，後段又以 `:root, .dark, .maintenance-workspace` 覆寫。移植時不能只複製檔案最前面的 `:root`。以下是最後一段 foundation 的原始碼定義；HSL 三元值使用 `hsl(var(--token))` 取色，不能直接把三元值當完整 CSS 顏色。

| 用途／token | 目前 HSL 值 | 使用規則 |
| --- | --- | --- |
| 頁面底 `--background` | `240 5% 5%` | 全站畫布底色 |
| 主要文字 `--foreground` | `240 10% 96%` | 標題與主要內容 |
| 卡片 `--card` | `240 3% 11%` | 固定資料區、側欄、結果容器 |
| 卡片文字 `--card-foreground` | `240 10% 96%` | 與 card 成對 |
| 浮層 `--popover` | `240 3% 15%` | Dialog、選單、Popover 等 |
| 浮層文字 `--popover-foreground` | `240 10% 96%` | 與 popover 成對 |
| 次要底 `--secondary` | `240 3% 17%` | 輸入控制、次要按鈕、分組工具 |
| 次要文字 `--secondary-foreground` | `240 10% 96%` | 與 secondary 成對 |
| 弱化底 `--muted` | `240 3% 17%` | 輔助資訊區 |
| 輔助文字 `--muted-foreground` | `240 5% 72%` | 說明、metadata；不可降低到難讀 |
| hover／強調底 `--accent` | `240 3% 22%` | 選單與次要控制 hover |
| 強調文字 `--accent-foreground` | `240 10% 96%` | 與 accent 成對 |
| 邊界 `--border` | `240 3% 25%` | 卡片、區塊、分隔線 |
| 控制邊界 `--input` | `240 3% 30%` | 輸入欄位與選擇器 |
| 主色／焦點 `--primary`、`--ring` | `171 51% 59%` | 玉綠色主操作、焦點與選取 |
| 主色上文字 `--primary-foreground` | `240 6% 7%` | 實心玉綠按鈕上的深色文字 |
| 破壞性／錯誤 `--destructive`、`--danger` | `3 90% 69%` | 刪除、不可逆操作、錯誤 |
| 破壞性上文字 `--destructive-foreground` | `240 6% 7%` | 實心 destructive 控制 |
| 成功 `--success` | `142 62% 61%` | 成功或完成的語意 |
| 警告 `--warning` | `38 88% 67%` | 缺少輸入、需確認或風險 |
| 資訊 `--info` | `211 100% 70%` | 一般資訊語意 |
| 側欄底 `--sidebar-background` | `240 4% 8%` | 導覽側欄 |
| 側欄強調底 `--sidebar-accent` | `240 3% 19%` | 側欄互動狀態 |

目前的 `--platform-blue/teal/green/amber/violet/rose` 依序為 `211 100% 65%`、`190 62% 66%`、`142 62% 61%`、`38 88% 67%`、`270 63% 76%`、`3 90% 69%`。它們是有用途的領域／圖表色，不是每新增一張卡片就輪流套用的隨機色盤。首頁目前以玉綠為主要入口辨識，績效與後台相關入口可使用 amber 細節；現有資料與狀態語意仍需獨立表達。

站點色票目前沿用較前面的 charcoal 區段，沒有與最後 foundation 全部同值。忠實移植時應保留這個事實，若要統一則應另做有驗收的產品變更：

| 站點 token | 目前 HSL 值 |
| --- | --- |
| `--station-idle` | `248 7% 25%` |
| `--station-working` | `171 51% 59%` |
| `--station-warning` | `34 50% 58%` |
| `--station-error` | `353 35% 62%` |
| `--station-complete` | `152 23% 54%` |

不要只靠紅／綠區分狀態：同時顯示文字、圖示或明確標籤。一般狀態宜採淡底、細邊界與有色文字；整列只用很低不透明度提示，例如比對結果 ERROR 列底色為 destructive 的 `.035`，hover `.075`，不應做成大塊紅色背景。

目前主色與 danger 的 gradient 已被覆寫為同色漸層，`--shadow-glow: none`。舊的 class 名稱包含 `glass`、`glow` 或 `surface-accent`，不表示現在仍應呈現玻璃或光暈。部分局部舊色仍存在，必須檢查實際使用位置，不宣稱全站已完全消除硬編碼色。

依據：`src/index.css`、`tailwind.config.ts`、`src/components/comparison/comparison.css`。

## 3. 字體、字級、留白與表面

最終 `body` 使用 `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans TC', sans-serif`，行高 `1.6`，並啟用字體 optical sizing。檔案前段仍載入 Noto Sans TC 與 JetBrains Mono；程式碼、`pre/kbd/samp` 使用等寬字體，維修數字欄位的 `.font-data` 使用 JetBrains Mono／Cascadia Code 與 tabular numbers。另一台電腦字體可用性不同，必須重新檢查繁體字寬、換行與數字對齊。

| 元素 | 目前實作尺度 |
| --- | --- |
| 首頁主標題 | `clamp(1.5rem, 2vw, 2rem)`，字重 650，行高 1.3，字距 `-.025em` |
| 共用維修頁標題 | mobile `text-lg`，`sm:text-2xl`；`font-semibold`，可截斷 |
| 共用 Dialog 標題 | `text-xl`、semibold、緊湊標題行高 |
| 共用 Card 標題 | `text-lg`，`sm:text-xl` |
| Card 說明 | `text-sm`、`leading-6`、muted foreground |
| 比對區段標題／內層標題 | 17px／14px，字重 650 |
| 比對表格內容 | 12px，行高 1.6；重要欄位 13px，metadata 11px |
| 檔案庫標題／檔名 | 桌面 24px 標題；檔名 13px，行高 1.55，長檔名可折行 |
| 一般輸入 | 預設 16px，`md:text-sm`；局部工作區另有密度覆寫 |

`rem` 換算成 px 時以瀏覽器根字級為準；不能為了塞入更多內容縮放整個頁面或把主要操作文字降到 metadata 等級。11–12px 用於輔助資訊與工程密集表格，不是一般表單主文字的統一字級。

共用圓角 token：控制 `--app-radius-control: .75rem`（一般根字級下 12px）、卡片與選單 `1rem`（16px）、Dialog `1.5rem`（24px）、區段間距 `--app-space-section: 1.5rem`。共用 Card 預設內容 padding 為 20px，`sm` 為 24px；Dialog 為 20px，`sm` 為 28px。密集工作區使用 8／12／16px gap 與較小內距，保留同一對齊線。

固定 panel 通常使用 1px 中性邊框、card 底色，沒有模糊或大型投影。浮動層使用 popover 底色與 `0 20px 64px hsl(0 0% 0% / .45)`。Dialog 遮罩是黑色 `.68`，不以強烈彩色光暈搶走內容注意力。首頁入口可保留極淡的 inset 高光；不要把浮層陰影套到每一個資料格。

依據：`src/index.css`、`src/components/ui/card.tsx`、`src/components/ui/dialog.tsx`、`src/components/maintenance/MaintenancePageHeader.tsx`、`src/components/test-plan/test-plan.css`、`src/components/comparison/comparison.css`。

## 4. 共用控制與操作分層

優先使用既有 `Button`、`Input`、`Textarea`、`Select`、`Dialog`、`DropdownMenu`、`Card`、`Table`，不要在各頁重造另一套邊框、hover、focus 與 disabled。共用元件的 `data-ui` 是全站覆寫 hook，不能在移植時刪掉而只搬 JSX class。

| 控制 | 目前實作與重建規則 |
| --- | --- |
| 主操作 | `Button` default：primary 實心底＋primary foreground；hover 主色 `.9` |
| 次要操作 | outline／secondary：secondary 底＋中性邊框，hover accent |
| 低頻工具 | ghost 或選單；不可與主要執行動作同等突出 |
| 破壞性操作 | destructive；刪除確認說明具體目標與影響，取消不得修改資料 |
| 一般尺寸 | Button default `h-11`、Input `h-11`、SelectTrigger `h-11`，通常都是 44px |
| 其他 Button 尺寸 | `sm` 36px、`lg` 48px、icon 40px；行動規則會提高非 link 按鈕及 icon 目標到至少 44px |
| 圖示 | Button 內通常 16px；與文字間 `gap-2`；圖示不可攔截 pointer event |
| 禁用 | opacity `.5`，禁止點擊；輸入與選擇器另有 not-allowed 游標 |

同一列搜尋、Select 與主要按鈕應有一致外框高度和垂直基準。緊湊表格工具、內嵌選項可有局部密度，但觸控命中區仍需 44px；不能為了外觀一致而拉高所有表格行，亦不能讓小圖示只有圖示大小可點。

建立／匯入／匯出／PDF／專案管理／批次重置與篩選分開，主動作位於頁首或獨立動作區；同時避免每一個次要功能都用實心主色。共用 `MaintenancePageHeader` 具 44px 最小高度，`sm` 48px；文字容器 `min-w-0`，操作區可選擇 mobile 換行，預設則限制寬度並水平捲動。設計時應先決定主要動作，不能只用擠壓標題與縮字解決窄版問題。

原生文字欄位、日期、時間與 autofill 必須保持深色底、可見文字與 caret。AI 專用輸入以 `data-ai-surface="true"` 明確退出一般輸入底色覆寫，讓 composer 使用自己的透明內層；不能以刪除全站保護處理來修正單一 AI 欄位。

依據：`src/components/ui/button.tsx`、`input.tsx`、`select.tsx`、`textarea.tsx`、`src/components/maintenance/MaintenancePageHeader.tsx`、`src/index.css`。

## 5. hover、按下、選取、焦點與動效

互動狀態必須分清：hover 是可以操作的預告；pressed 是按下當刻；selected／current 是持續中的選擇；focus 是鍵盤目前位置；disabled 是不允許執行。不要用同一種發光效果混在一起。

- 共用 Button 有 150ms 色彩／邊界／透明度過渡；active 使用透明度回饋。一般 `.interactive-lift` 後段覆寫已取消通用浮起，只在 active 降低透明度。
- 首頁卡片是明確例外：僅 fine pointer 且可 hover 時，卡片 hover 上移 2px、加強領域邊界並切換 secondary 底；按下位移 1px、縮至 `.985`，使用 70ms 回饋。mobile 首頁列按下縮至 `.985`。不要把這個卡片動效擴散到密集資料表與所有表單。
- 目前導覽以玉綠文字＋淡玉綠背景表示；mobile dock 用 `aria-current="page"`，更多按鈕保留 `aria-expanded`。checkbox／radio／工具應以對應語意與持續選取狀態表達，不能只靠 hover。
- 共用焦點 ring 為 2px，通常 offset 2px；首頁卡片 outline offset 3px，mobile 列內縮；輸入、Textarea、SelectTrigger 的後段規則另有 2px outline。不要刪掉焦點框只追求乾淨外觀。
- `prefers-reduced-motion: reduce` 將全域動畫／transition 壓至極短、smooth scroll 改為 auto，並關閉首頁縮放與位移。loading 指示需仍能以文字／狀態理解。
- `prefers-reduced-transparency` 會移除 mobile header／dock 模糊；`prefers-contrast: more` 提高 muted foreground 至 `240 5% 84%`、邊界至 `240 3% 45%`。

目前維修區仍有早期局部 focus 顏色，部分局部控制亦有自己的 hover。上述是共用來源與重建方向，不是宣稱所有畫面已完全一致。驗收需要檢查最後 computed style 與實際鍵盤操作。

依據：`src/index.css`、`src/components/ui/button.tsx`、`src/components/layout/MobileWorkspaceDock.tsx`。

## 6. 首頁、桌面與行動導覽

目前使用 `src/pages/Index.tsx` 維護工作區 catalog，首頁、頂部導覽、mobile dock 都從授權後的 catalog 衍生，不能各自維護一套互相不一致的入口清單。

| 入口 | 目前導覽／權限關係 |
| --- | --- |
| 維修中心 `station-status` | 至少一個維修子模組可檢視時顯示；內頁仍有模組權限 |
| 檔案上傳 `file-uploads` | `test-plan` 檢視權限；是獨立入口，仍沿用既有權限契約 |
| AutoCheck／比對系統 `comparison` | 首頁卡片名 AutoCheck、導覽名比對系統；沿用 `ai-chat` 授權 |
| 料號申請 `material-requests` | 自己的工作區／模組授權 |
| Data-center `data-center` | catalog 使用 `canViewModule("data")` |
| PCB Designer `pcb-designer` | PCB 模組授權；舊帳號相容邏輯在共用權限模組 |
| AI 問答 `ai-chat` | AI 問答授權 |
| 績效考核 `performance` | 績效授權；主管審閱另有條件，不能只由入口可見推論 |
| 後台管理 `user-management` | 可進入使用者／協作／API 管理其中一項時可開啟；目前從帳號選單進入，不放首頁與日常工作區導覽 |

桌面 `lg`（1024px）開始使用頂部工作區導覽；1024–1535px 顯示前四項、必要時加上目前作用中的項目，其餘放「更多」；`2xl`（1536px）顯示完整可用項目。品牌在左、日常導覽居中、協作／帳號控制在右，保持同一外框高度。首頁桌面使用資料量相應的卡片 grid；`md`（768px）以下改成整列可點的工作區清單。入口數字必須是實際授權入口數，不能寫死。

mobile dock 在 `lg` 以下固定底部。主要位置是首頁、維修、料號、AI 問答，再加更多；只呈現已授權項目。更多使用 Drawer，列出檔案、比對、Data Center、PCB、績效等目前可用項目，選取後關閉。後台入口仍走帳號選單。工作區 active、more active、帳號 menu 和返回首頁都必須可辨識與可觸及。

重建新增工作區時，至少同步 catalog、route／URL 恢復、首頁 preview、桌面導覽、mobile dock／更多、view／edit 權限與伺服器授權。新入口預設不可因為 UI 已畫好就自動給所有人編輯權；不可用單純隱藏按鈕取代真正授權。`workspacePermissions.ts` 有歷史相容映射，不應從卡片名稱推導權限 key。

依據：`src/pages/Index.tsx`、`src/components/layout/MainWorkspaceHeader.tsx`、`WorkspaceEntrance.tsx`、`MobileWorkspaceDock.tsx`、`src/lib/workspacePermissions.ts`。

## 7. 可搜尋／可篩選資料結果：八項必要契約

本節完整保留 `AGENTS.md` 的產品要求，適用表格、清單、卡片與 lane。這是跨工作區契約，不是可以隨頁面美術方向自行省略的選項。

1. **位置固定。** 持久篩選列必須緊接在資料結果區正上方，不得藏在 Popover、Dialog、Drawer、Dropdown 或「更多」選單中。頁面標題、KPI 與主要建立動作可以在它上方，但篩選列與其控制的結果之間不得插入不相關的內容。
2. **欄位順序一致。** 共用欄位只顯示該領域實際具備者，並固定維持「搜尋 → 站點 → 狀態 → 負責人類欄位」的相對順序；負責人類欄位包含工程師、負責人與擁有者。領域專用條件接在共用欄位之後，排序、檢視模式與工具不應打亂這個順序。
3. **作用中條件可見且可逆。** 作用中的篩選條件必須永遠可見，以文字 chip／badge 顯示其欄位和值，不得只用按鈕顏色、計數或已選取的下拉值暗示。每個條件都要能個別清除，並提供「全部清除」；全部清除不得移除 workspace、module、專案等導覽上下文。
4. **自動導覽使用同一來源。** 儀表板、KPI、卡片或深層連結帶入的自動篩選必須使用 URL query parameters，重新整理、返回與分享連結後仍可重現。目標頁必須把這些條件顯示在同一組篩選 UI 中，與手動條件使用相同的 chip、個別清除及全部清除行為；清除時同步更新 URL，不得留下不可見的隱性條件。
5. **空結果保留辨識結構。** 機台資料表沒有符合結果時，必須保留表格、header 與欄位結構，並在結果 body 內跨欄顯示完全相同且不加標點的文字：`目前篩選條件沒有符合的機台`。同一機台清單的卡片或行動版空狀態也使用這段文字。其他領域可替換資料名詞，但仍須保留其既有表頭／欄位骨架，讓使用者看得出哪些欄位被篩到零筆。
6. **操作分層。** 建立、專案管理、批次重置、匯入、匯出、PDF 與其他次要操作必須與持久篩選列分開，可放在頁首動作區或獨立揭露區。排序與檢視工具可以位於篩選區尾端，但必須具有次要視覺層級。
7. **行動版不隱藏目前狀態。** 行動版可以收合次要排序與工具，也可以讓 chip 換行或水平捲動；不得收合作用中的篩選條件。搜尋與必要的主要條件仍須位於結果區正上方，且每個 chip 的清除操作必須可觸及。
8. **例外以控制目的判斷。** 空間畫布、PCB 圖層、3D 相機、模型相容性／安裝、編輯器選取與表單 picker 可以保留領域專用介面，因為它們改變工作上下文或操作目標，而不是縮小一份資料結果。例外只適用於該控制；同一工作區內另有一般資料清單時，該清單仍適用本標準。

URL 更新要修改自己負責的 query key，保留 workspace、module、專案、資料夾與目前頁籤。先由 URL 恢復條件，再以同一 state 驅動控制、chips 和結果，返回／前進亦要恢復。現在可參考兩種已存在的實作：

- 檔案庫：`useFileLibraryFilters.ts` 管理 `fileSearch`、`fileType`、`fileSort`，`clearFilters` 只清搜尋與格式，保留排序與位置；`TestPlanWorkspace.tsx` 已顯示 chips 與空結果列頭。
- 比對結果：`useComparisonFilters.ts` 管理結果搜尋、狀態、負責人、嚴重度、類別與頁碼，clear 保留 tab；`ComparisonResults.tsx` 的資料表零筆仍保留七欄 header，訊息位於跨七欄 body。

`docs/filter-ui-audit.md` 保留跨工作區判定與待對齊項目，但其較早的檔案庫缺口敘述已落後於目前程式。不能用舊稽核表推論所有目前畫面都已達標，也不能因為有一頁合格就宣稱全站合格。未提供篩選能力的清單不必為了形式加入空控制；一旦新增搜尋／篩選，就直接實作完整契約。

## 8. 表格、檔案庫與工程比對的密度

共用 Table 外層使用局部 `overflow-auto`，保留原生 table 結構；header、body、欄位、選取與 hover 仍可辨識。窄螢幕必要時讓結果容器水平捲動，不應讓整頁橫向溢出或把欄位壓到不能閱讀。可移動或隱藏的輔助欄位需與 header 一起改變，不能只藏資料 cell。

檔案庫桌面目前為 236px 使用者空間 rail＋主內容，有 inspector 時再加 304px 詳情欄；各欄各自使用 `min-height: 0` 與指定 scroller。搜尋列在結果之前，空間／資料夾導航與上傳動作分開。桌面清單保留名稱、格式、大小、更新時間與操作；長檔名換行，大小／日期等輔助欄位維持對齊。選取列以淡玉綠底與左側 inset 標示，不能與 hover 混淆。

1023px 以下檔案庫收成單欄，空間 rail 由明確的 44px 導覽按鈕開啟；窄版 inspector 可切換主內容，而不是把三欄縮成三條窄線。700px 以下搜尋滿列，選擇器可換行；格式與日期等輔助欄位可同步從 header／row 隱藏。資料位置與 active filters 仍要可見。

AutoCheck 需要保留工程資料的真實關係：A／B 版本、必要／建議／選用輸入、檢查分類、嚴重度、RefDes、Net、頁碼與審查回覆。現在結果每頁 50 筆，表格最小寬 920px，以容器捲動保留完整欄位；詳細回覆在 Dialog 編輯，原始檢查內容與回覆分開。缺少資料、零筆檢查、零筆篩選與執行失敗使用不同文字，不可以全部包成「成功」或「沒有資料」。

AutoCheck「比對檢查」的輸入區是一張可照著做的清單（2026-11-09）。桌面版標題、六個分頁與工具（使用說明、意見收集、匯出／匯入備份、處理位置、新比對）共用一排；1560px 以下次要工具收成帶 `title` 的圖示，仍維持一排。模式切換、① 比對名稱、② 舊版 A／③ 新版 B 的進度與「開始比對」共用下一排，第一個未完成的步驟標為下一步，並用一句話說明還缺什麼。每一格檔案（Netlist 三份、BOM、電路圖 PDF、DSN）都有自己的「選擇檔案」，只開啟該格可用的副檔名；放錯格要說明原因且不變更。「選擇資料夾」與拖入資料夾代表整版更換，「加入檔案」、各格選檔與拖入零散檔案則累加並保留已選內容。資料夾裡用不到的檔案不讀取、不計入上限，也不得擋住比對；上限只算實際送進引擎的檔案。A、B 選到同一份 Netlist 要在執行前警告；檔案拖到面板外不得讓瀏覽器開檔離開頁面。1023px 以下各區塊直向堆疊，桌面用的 flex-basis 不可套到直向排列。

料號申請的「線路修改」打開就是可以記錄的畫面（2026-11-09）。尚無紀錄時直接顯示空白的新修改表單與修改前／修改後兩個放圖區，不先要求建立批次；輸入第一個字或加入第一張圖才建立紀錄，沒有批次時一併建立以目前版次命名的批次（例如「V1 → V2 線路修改」），沒有輸入的空白表單不留下紀錄。同一個動作只有一個入口：「新增修改」在清單上方，「新增批次」在批次選擇旁，「匯出 Change List」與「使用說明」在頁首。搜尋、狀態、負責人篩選與 chip 位於清單欄內並緊貼清單上方，狀態選項帶各狀態筆數；關閉視窗時移除網址上的篩選參數。清單表頭與每一列共用同一組欄位（編號 40px｜修改項目｜狀態），項數接在「修改項目」後面（未篩選顯示「N 項」，篩選時顯示「符合 / 全部 項」）。右邊空白表單就是新修改，清單不放「新修改／輸入內容後自動建立」這種佔位列（2026-11-10 使用者看不懂而移除）；沒有任何修改時清單只寫「還沒有修改；在右邊填寫就會建立第一項」。按「新增修改」後游標直接進入修改標題。「已移除的修改（N）」是新增修改旁帶數字的方鈕；清單收合鈕同高、帶外框，右緣對齊搜尋框；兩者都用中性外框，不用彩色。2026-11-10 起線路修改電腦版的視窗四周留白：寬度上限 1800px、左右至少 16px、上下各 24px（手機仍是全螢幕）。頁首只有一列：標題、本次改版選單與「開始另一次改版」，右側「PDF 圖面／匯出 Change List／使用說明」同一種中性外框按鈕（PDF 圖面打開時才帶青綠色），說明句改放在選單的提示。清單上方不再放說明句。表單頁首「修訂 N · 操作者」一行，時間放在提示，「移除」是垃圾桶圖示。修改前後對照的標題列同一行寫「每項最多 200 張、每張 50 MB」，空白放圖格只寫「貼上（Ctrl+V）、拖入或點這裡選取」。底部只有一列：左邊「還缺：…」（過長時省略號，滑過看全文），右邊儲存按鈕直接顯示儲存狀態（已儲存／自動儲存／儲存修改／儲存中…）與「送出 Review」。內容區先文字（標題、Ref／Net／頁碼／負責人、原因、說明）後圖片：修改前與修改後並排，各顯示一張含標記的大圖，多張時以縮圖列切換，補充圖是一列縮圖。貼上（Ctrl+V）加入標示「貼上會加到這裡」的那一格，沒有修改前圖時是修改前，加入後自動移到修改後；拖放以放開時所在的那一格為準；在文字欄位貼上帶文字的剪貼簿（Excel 儲存格）只貼文字。視窗外的檔案拖放必須攔下，不可讓瀏覽器開啟檔案而離開頁面。移除圖片提供立即復原；無法接受的檔案（非圖片、空檔、過大）列出原因且不提供重試。待 Review 與已確認的項目內容鎖定，按「修改內容」才可編輯，避免審查者誤改而撤回送審；Review 意見欄與「退回補充／確認」固定在頁尾同一列，退回原因顯示在該項目最上方。送出前還缺的內容（修改標題、修改說明或修改後圖片）在頁尾列出並停用「送出 Review」。切換項目的載入期間表單不接受輸入。表單主文字 14px、控制高度 40px（1023px 以下 44px、輸入 16px），12–13px 只用於輔助資訊。1023px 以下清單與內容分成兩個畫面，尚無紀錄時直接進入表單，圖片區排在原因／說明之前，分頁（修改前／修改後／補充圖）就是顯示中的那一格，文案不提 Ctrl+V 與拖放。放大視窗依長寬完整顯示圖片，標記工具可連續使用，說明與標記列在圖片旁，可切換上一張／下一張（方向鍵）並更改圖片用途。電腦版的「PDF 圖面」（2026-11-09）預設排在清單與表單之間：1600px 以下清單收成 56px 窄欄（展開、新增修改、項數），表單欄 380–440px 並以容器查詢改成兩欄欄位、修改前後上下排列；頁首「PDF 圖面」是唯一的開關。PDF 工具列只有一列（版本、刪除這份 PDF、新增 PDF、對照與對照頁差、翻頁、縮放、符合寬度、框選），面板太窄時才換行；其下一列是「已看 x / y 頁」、每頁一格的頁面總覽（實心＝這版看過、外框＝較早版本看過、琥珀點＝有修改）、「本頁修改」，最右邊是「本頁看過／看完，下一頁」。官方基準列只有一行：名稱過長以省略號結尾、滑過看全名，說明放在提示；未指定時直接給「指定官方基準」按鈕（打開版本清單），「對照官方基準」開啟時呈按下狀態。刪除 PDF 在版本選擇旁（垃圾桶），按下後在工具列下方出現一行確認「刪除 X 版「檔名」？…[取消][刪除]」，Esc 或取消都不刪；刪除可從版本清單的「已刪除的 PDF」還原，官方基準不能刪除（按鈕停用並說明原因）。（2026-11-10）框選後的動作列固定在面板底部，不蓋住頁面。對照在面板不足 1100px 時上下排列。手機 PDF 是獨立畫面，工具列兩列＋對照一列，框選需先開「框選」，「本頁看過／看完，下一頁」固定在底部，框選後同一位置換成加入按鈕；從 PDF 加入圖片後返回會回到該修改項目。（2026-11-10 簡化）頁首改成「標題｜四個分頁（線路 Review／AI 比對／改善追蹤／官方版本）｜匯出、⋯ 更多、關閉」一列；分頁是 role=tab，選中時青綠外框，方向鍵可切換，改善追蹤帶未結案數。PDF 是否顯示由分頁決定，不再有「PDF 圖面」開關與「官方基準」按鈕；AI 比對的 PDF 上方一列是舊版（官方版本）→ 新版選單 → 「AI 比對新舊版」，手機時按鈕獨佔一列。官方版本是獨立頁面：目前版本卡片、選擇新版本（逐列確認）、更換紀錄表。手機分頁是標題下方的整列四格（44px），PDF 從表單與清單的「看圖面」進入。視窗內所有按鈕、選單項目、下拉與勾選框都要有說明用途的 title，不只重複按鈕文字。（2026-11-10 配色與總覽）（2026-11-11 起改用比對檢查頁的配色：使用者看了灰色欄位說「這種配色我不喜歡」，並指定 AutoCheck 比對檢查頁「這樣比較舒服」）視窗黑底，清單、圖面、表單三欄是圓角 12px 的 card 面板，外框 1px 青綠（primary 45%），欄間與四周露出 8px 黑色間隔（1023px 以下仍是全螢幕不加框）；面板內的工具列在 card 上、圖面區維持黑色；次要動作（新增問題、展開／收合）是青綠外框按鈕（同比對檢查的「選擇資料夾」）；輸入框是黑色凹槽、提示字用 62% 的淡灰；AI 比對步驟完成是實心青綠、下一步是琥珀圈；1600px 以下表單欄 400px，讓 1440 的新舊對照仍並排。同日：一個功能一個入口——官方版本只在「官方版本」分頁設定（PDF 版本清單只顯示並提供前往按鈕），新增 PDF 只用工具列「上傳新 PDF」，刪除只用工具列「刪除這份 PDF」（清單列只剩開啟與編輯日期／備註）；「看完，下一頁」與「本頁看過」合成一顆，已看過的頁顯示「✓ 已看過」（再按取消）與「下一頁」；問題表單分兩段卡片「① 標記問題」「② 回報改善」，標題列小字寫誰填，完成＝實心青綠、目前＝琥珀圈、等待＝灰；圖片格標題補「問題截圖／改好後／參考資料」；頁面總覽拖曳時圖面即時跟著換頁（每幀最多一次）。（11/11 視覺檢查）圖面旁的問題標題列固定一行：只有一個問題時不顯示上一個／下一個，收合鈕文字為「收合」；步驟卡標題不折行，說明縮短（「檢查的人填」「畫線路的人填」，完整句在滑鼠提示）；新問題還沒有標題時第 2 段只顯示標題列，讓圖片格提早出現；底部提示只寫第幾步與一句話；沒有可儲存內容時「已儲存／自動儲存」是純文字狀態不是按鈕外觀；畫筆只給可編輯的人，橡皮擦與撤回在頁面有筆跡時才出現，「N 筆標註」在有筆跡時才顯示，讓 1280 的 AI 比對工具列一行放得下。以下為 11/10 的 60-30-10 整理，背景部分已由上述取代：青綠只給選中的分頁、選中的清單列、目前工具，以及每一區唯一的完成動作（看完，下一頁／回報改善／AI 比對新舊版／確認結案）。新增問題、展開／收合、篩選（未篩選時）、搜尋框都是中性外框；篩選有作用時才帶青綠。停用的完成動作是中性灰，不是暗青綠。收合窄欄的按鈕一律 56×56、圖示在上文字在下。頁面總覽是一整排 slider：每頁一格填滿整列（超過 120 頁改成無間隔的細條），每 10 頁一組；白色格是目前頁，可拖曳或點一下跳頁，拖曳／滑過時上方顯示「第 N 頁 · 狀態」，方向鍵、PageUp/PageDown、Home/End 可換頁；不再在格子下方寫頁碼。AI 比對上方是四步驟（舊版→新版→AI 比對→逐項確認，目前步驟青綠實心圈、完成打勾）；兩份 PDF 還沒齊時圖面區顯示「AI 比對要兩份 PDF」說明卡與缺少那一步的唯一按鈕。

線路修改先以使用者的四件事分工，同一件事只出現一處、一個名稱（2026-11-11）。改這個視窗前，先列出四個分頁上看得到的每個按鈕與名稱，找出「同一件事兩個名字」或「兩件事看起來一樣」再動手。線路 Review 只標記問題（一份 PDF＋標記問題表單）；AI 比對只並排兩張圖面；改善追蹤是問題（唯讀，修改問題才展開）＋改善結果＋確認結案／退回重改＋追蹤紀錄，圖面要框選改好後截圖時才打開；官方版本只記錄更換。不要讓三個分頁出現同一份表單，也不要在分頁之外再放第二個並排比對。圖片名稱一律「問題截圖／改好後截圖／補充圖」；官方 PDF 叫「官方版本」，其他 PDF 用日期＋檔名。翻頁只有一列，線路 Review 用「看完，下一頁」取代另一個「下一頁」。刪除 PDF 在版本清單的那一列，旁邊就是還原；畫面上同時只會有一種垃圾桶，移除問題要寫字。四個分頁是標題下方獨立一整排（編號、圖示、名稱、一句用途），目前分頁實心青綠；手機版固定在底部。PDF 工具列：版本與上傳 PDF｜移動／框選／畫筆（有字的切換鈕，面板窄於 860px 只留圖示）｜縮放靠右。

線路修改的用詞表（2026-11-11）：一個詞只指一件事，新增文字前先對照。刪除／還原＝可以放回來的拿掉（問題、圖片、PDF 都用這兩個詞，不用移除、復原）。截圖＝圖面工具列的框一塊加到問題截圖或改好後截圖；框選＝圖片放大視窗裡畫框標記。解除鎖定＝打開已回報或已結案的問題；修改問題＝在改善追蹤展開問題欄位。留言＝追蹤紀錄與主管確認時的那一格。PDF 清單／選擇 PDF＝圖面檔案；版本只用在官方版本。新版／官方對應頁＝AI 比對的兩個頁碼。收合清單／收合表單、展開清單／展開表單。匯出問題清單。問題狀態：待改善、待確認、退回重改、已結案；AI 差異：未判讀、已確認、不採用。主要動作按鈕不反灰，缺內容時按下去說明還缺什麼。

線路修改的顏色表（2026-11-11）：顏色代表功能的種類，不是裝飾，也不要全部用青綠。新增按鈕時加上 `data-circuit-tone`：view 青綠（看圖、翻頁、目前位置）、add 藍（加入、上傳、送出）、edit 靛（修改、收合）、todo 橘（待改善、必填）、done 綠（完成、還原、匯出）、delete 紅（刪除、退回）、ai 紫、official 金；該類的完成動作加 `data-fill="solid"`，只有圖示的小按鈕用 `data-fill="ghost"`。四個分頁各一色（青綠／紫／綠／金），問題狀態四色（橘／藍／紅／綠）。配方與料號申請工具列相同：`hsl(色相 30% 17%)` 底、`hsl(色相 32% 39%)` 框、`hsl(色相 64% 83%)` 字；面板外框仍是青綠細框、黑底。

線路修改的手機版（2026-11-11，1023px 以下；使用者：「手機板的太雜亂，根本無法操作」）：一個畫面只做一件事，改這個視窗的手機畫面時照這三條。一、最上面只有一列：分頁第一層寫視窗名稱與專案／BOM；被推進來的畫面（問題、圖面）寫有字的返回（‹ 問題清單／‹ 問題／‹ 圖面）與畫面名稱，不放沒有字的箭頭。二、這個畫面能做的事放在最下面一排，每顆按鈕都有字、高 52px；四個分頁只在分頁第一層顯示，被推進來的畫面用自己的動作列取代分頁，底部任何時候都只有一排動作。動作列跟著手上在做的事換內容（翻頁｜截圖中｜寫新問題標題｜畫筆中），不要把所有工具同時攤開。三、少用與破壞性的動作收進右上「更多」（匯出問題清單、使用說明、新增改版清單、刪除問題）。看圖時要能當場記問題：截圖後在同一個畫面寫標題按「記下問題」，不要求來回切換畫面。圖面要能兩指縮放；比例數字點一下回到符合寬度。手機上不顯示「貼上會加到這裡」這類鍵盤提示。這些規則只寫在 `@media (max-width: 1023px)` 與 `phone` 條件裡，電腦版標記與樣式不動。

線路修改的按鈕、轉場、載入與完成回饋（2026-11-12；使用者：「按鈕，轉場，LOADING。SUCCES，都要設計一下啊，細節決定一切」）。電腦版與手機共用，規格與維修中心（a30615e6）同一套數字，只用 100／150／200／300 毫秒；進場減速、退場加速；只動位置、縮放與透明度，不彈跳；每個動態旁邊都有文字或圖示，開啟「減少動態」時全部改成瞬間（全站的減少動態設定）並停掉轉圈與骨架的掃光。程式在 `CircuitFeedback.tsx`（按鈕轉圈、進度條、骨架、完成提示）、`circuitMotion.ts`（畫面進場）與 `circuitMotion.css`。
- 按鈕：按住時縮到 97%（100 毫秒回彈）；清單列、放圖區、頁面縮圖與分頁這類大面積改成變暗，不縮放。鍵盤焦點框用按鈕自己的功能色。按鈕在做事時圖示換成轉圈（等 100 毫秒才出現，快的動作看不到）、按鈕尺寸不變、`aria-busy`；有轉圈的是上傳 PDF、記下問題、加到問題截圖／改好後截圖、回報改善、確認結案、退回重改、新增留言、儲存修改、確認刪除、還原、建立清單、匯出問題清單、確定更換官方版本。
- 轉場：手機往下一層（問題、圖面）從右邊推進 8px（200 毫秒），返回時上一層從左邊滑回（150 毫秒），切換分頁與電腦版換一個問題淡入（150 毫秒）。圖面底部那排換內容（翻頁｜截圖中｜寫標題｜畫筆）時從下方浮上 6px（150 毫秒）。PDF 清單、錯誤訊息列浮上；手機分頁上方那條線從中間長出（200 毫秒）。
- 載入：等不到 0.1 秒不顯示任何東西；按鈕上的等待用轉圈；問題清單第一次載入是 5 列和清單同形狀的骨架；圖面開啟時是一張 A3 比例的空白頁，中間寫「正在開啟 PDF…」；換頁或縮放重新繪製超過 0.2 秒，頁面上方出現「正在繪製第 N 頁」小標籤；圖片上傳有 n / m 的進度條，PDF 上傳是一條來回移動的進度條；換到另一個問題時表單頂端一條細進度條；縮圖還沒載入是骨架。
- 完成：回報改善、確認結案、退回重改、新增留言、刪除問題、還原、建立清單、匯出、上傳 PDF 做完，會出現一行完成提示（綠色打勾彈出，2.4 秒後消失，不擋點擊）。手機放在這個畫面最下面那排按鈕（或分頁、頁碼列）的正上方，按鈕列變高時跟著移；電腦版放在視窗下方正中，正下方有按鈕列時移到它上方。「已儲存」的勾在剛存好時彈一下；問題狀態改變時狀態標籤定位一下；看完一頁時頁面總覽那一格從中間長出、「已看過」的勾彈出；截圖記下時原處閃一下綠框再變成虛線標記。

線路修改「AI 比對」的版面與頁面對應（2026-11-13；使用者：「功能優化一堆使用問題」）。
- 圖面優先：電腦版圖面上方只有一列工具，順序即閱讀與 Tab 順序：移動／畫筆 → 頁面總覽 → 連動 → 縮放 → 上傳 PDF → 本頁 AI 結果 → AI 比對新舊版。版本選單與頁碼放在各自那張圖的標頭（基準版：版本、第 □ / N 頁、對齊說明、交換；比對版：版本、‹ 第 □ / N 頁 ›），不再另有圖說列或頁碼列；手機保留上方的版本選單，頁碼在兩張圖的標頭輸入。
- 一個控制一個圖示：交換版本用 ⇄（ArrowLeftRight），符合寬度用 UnfoldHorizontal，不可再共用同一個圖示。
- 頁面對應：預設依頁面文字自動對齊（同一份 PDF 版本的文字只讀一次）；基準版標頭輸入的頁碼是「從這頁起」的釘選，直到下一個釘選或自動對齊的下一個變化點為止，前面的頁不動；Enter 或離開欄位才生效，↑↓ 一頁一頁調。對齊說明用文字（「對齊中」「依內容對齊」「新增的頁」），只有可取消的「手動對齊 ×」是按鈕。對不到的頁不夾到最後一頁，基準版那邊寫明「基準版沒有這一頁」與該怎麼做。
- AI 結果留在圖上：頁面總覽每格的顏色即該頁 AI 結果（紅、青、空心青、橘框、灰，懸停文字寫出頁碼對應與件數）；差異框與 AI 比對視窗同色（實線紅：疑似差異；虛線琥珀：證據不足；確認後轉青），點框打開 AI 比對並展開那一項；畫筆、橡皮擦、截圖時框不擋筆。工具列的本頁結果只是文字，打開 AI 比對只有一個按鈕。

料號申請的「頁數進度」先讓人一眼看到全貌，再逐頁編輯（2026-11-09）。上方一列是總頁數、目前做到第幾頁、進度條與 PDF AI；其下的「頁面總覽」把每頁畫成依狀態上色的一格，點格跳到該頁，Shift 加點選取一段並同步到批次設定。篩選列（搜尋 → 狀態，狀態帶頁數）緊貼表格上方，chip 可個別清除與全部清除，沒有符合時保留表頭並顯示「目前篩選條件沒有符合的頁面」；批次設定屬於工具，放在頁面總覽區，不與篩選列混在一起。表格只有頁碼、狀態、頁面標題、備註四欄，列高 44px、文字 14px；「設為目前頁」是頁碼旁的旗標，不另佔一欄。頁尾左側固定顯示儲存狀態（已儲存與時間，或有幾頁尚未儲存），有未儲存修改時任何關閉方式都先在頁尾詢問，不另開對話框。背景更新（同事存料件或存頁數進度）不得重設視窗中的草稿；儲存時以最新資料為底只寫入自己改過的頁面。唯讀者可開啟查看但不顯示任何會被拒絕的操作。視窗很矮（手機鍵盤彈出）時，設定區限高內部捲動、篩選列改成單列水平捲動，表格至少保留 100px，頁尾按鈕不得被擠出畫面。樣式表只用主題變數上色。

料號申請主表的美感整理（2026-11-10）：頁首 7 顆按鈕各自顏色、上傳說明閃爍、工具列每個控制各自色相、待處理料每顆動作各自顏色，都是使用者明確要求（「要有7顏色」「要有顏色還要閃爍」），不可改成單一主色；只把按鈕字重由 900 降為 700。主表每列 52px（單行 13px 文字或兩行料名）；料號、MPN、Ref Des 與 Item 用 600 字重。Name 欄在電腦版左右捲動時固定在左側。每列的複製圖示與料名旁的說明圖示只在滑過或聚焦那一列時出現。Sourcing Status 的一般值「Approved」是純文字，只有例外值才用膠囊。phase out、零件狀態、虛擬料號沒有值時都用同一種灰色「未提供」；實體料號缺漏仍用琥珀色「實體料號未提供」，因為那是要處理的事。個人標記是 4px 圓角的方形勾選框，未勾選時淡灰、滑過該列才亮；列內「編輯」是青綠外框按鈕，不再每列一顆實心按鈕。沒有替代料的列不畫「—」方塊。作用中的篩選條件接在搜尋框右邊同一列，結果數維持在工具列最右邊，加篩選時表格不往下跳；「全部清除」用灰字，不用紅字（它不是刪除）。零筆結果的文字置中在表格「看得到的寬度」內（捲動容器提供 `--material-scroll-width`），1280 寬也完整可見。待處理料視窗的標題與五顆動作同一列，替代廠商的例句改為按鈕的無障礙說明；分類下拉與申請耗時各自有足夠寬度，不被切字或壓到逾期標記。料件編輯器兩個分頁都保留一行說明，切換分頁時分頁列不跳動；中文提示字不用斜體；Level／Qty 的文字與旁邊多行欄位同一高度起排；狀態追蹤分頁的輸入框與料件資料分頁同色框，空白欄位的提示字是灰色，不像已填值。BOM 版本表把「狀態」放在「版本」旁，左側系列清單 320px，1912 寬整張表不被固定的「操作」欄蓋住，較窄時固定欄左緣有陰影表示還有內容。全站勾選框為 4px 圓角方形（主題的 rounded-sm 是 12px，會把勾選框變成圓形）；觸控螢幕 44px 最小高度不套用在勾選框、開關與單選。手機：每頁筆數選單完整顯示「25 列」；篩選列中間的欄位選單有外框；＋與⋯和標題對齊；卡片上虛擬料號青綠、實體料號用一般文字色。

工程圖保留原有比例、標籤與可讀性；目前 app 內圖表使用已清理的 SVG 與 React 控制，不把外部 HTML script 直接嵌入 app。下載 HTML 可保留原有 standalone 工具，但不能因此放寬 app 內嵌執行界線。不要為了統一深色外觀而任意反相線路圖、刪掉必要標示或扭曲工程幾何。

依據：`src/components/ui/table.tsx`、`src/components/test-plan/TestPlanWorkspace.tsx`、`test-plan.css`、`src/components/comparison/ComparisonResults.tsx`、`ComparisonCharts.tsx`、`comparison.css`、`public/comparison/README.md`。

## 9. 行動版、安全區與捲動容器

目前全站 shell 使用 `100dvh`。Data Center、PCB、AI、檔案上傳與後台是固定 viewport 的工作區，內部配置自己的 scroller；維修中心則桌面固定、窄版保留較自然的文件捲動。不要一律給每層 `overflow-y-auto`，避免使用者無法判斷哪一層會捲動。

必須維持 `min-width: 0`、flex／grid 子項的 `min-height: 0`，再把 overflow 放在真正需要捲動的訊息、資料結果或側欄。可操作的 header、composer、dock 不應被內容撐出 viewport。全頁 `overflow-x: clip` 只能是最後防線，不能拿它掩蓋被裁掉的操作按鈕。

目前 767px 以下最後生效的 mobile token 為 header 64px、dock 64px、頁面 gutter 16px；`--mobile-shell-bottom` 為 dock 高度加 `env(safe-area-inset-bottom)`。1023px 以下主內容保留相同底部空間，dock 使用 safe-area padding；header 左右控制也使用 safe-area inset。768–1023px 殼層仍有自己尺寸與斷點規則，不能假設整個 `lg` 以下都是 64px。

重建驗收：

- 觸控的主要按鈕、清除 chip、選單項目、Dialog 關閉與 icon button 均有至少 44px 命中區；44px 是可點範圍，不要求 SVG 變成 44px。
- 表單文字不因手機縮到不能閱讀；目前全域 mobile 文字規則與局部工作區密度會互相覆寫，需看實際 computed style，不能只看到一條 `16px` 規則就宣稱全部達標。
- 手機鍵盤開啟、橫向短高度、瀏覽器工具列伸縮、底部安全區下，送出／儲存與最後一筆結果仍可到達。
- chip 可換行或橫向捲動，清除動作可操作，不能藏到 mobile「更多篩選」。
- desktop 與 mobile 的空結果仍保留對應結構，長標題／帳號／檔名不把右側動作擠出畫面。

### 手機共用元件與回饋位置（2026-11-04）

- 尺寸只定義兩層：`:root` 的 52／56／8 給平板（768–1023px），`@media (max-width:767px)` 的 64／64／16 給手機；任何畫面都引用 `--mobile-header-height`、`--mobile-shell-bottom`，不得再寫死 76px 之類的數字。
- 每個工作區在手機的第一列是 `MobileCommandBar`（`src/components/layout/mobile/`）：圖示＋標題＋一行上下文、最多兩個 44px 主要動作、一個「工具」按鈕。次要動作、排序、檢視設定、匯出與說明放進 `MobileToolsSheet`（vaul 底部抽屜，列高 48px，關閉鈕 44px）。料號申請頁既有的工具抽屜是這個模式的來源，之後也以此對齊。
- 資料清單在手機用 `MobileRecordCard`（標題列＋狀態 chip、兩欄 label-value、最多兩個 44px 動作＋更多）；表格只在使用者切到「表格」時出現並在自己的容器內橫捲。篩選列仍緊接結果上方，用 `MobileFilterBar` 或各頁既有的篩選列，chip 與全部清除不得收進抽屜。
- 表單在手機用 `MobileDialog` 的 `fullHeight`：標題固定、`MobileDialogBody` 捲動、底部按鈕列固定並避開安全區。
- toast（Radix viewport 與 sonner）在 ≤1023px 固定於 dock 上方 12px、左右 16px，不再貼頂蓋住品牌與帳號；AI 問答另加作曲區高度，有待送附件或鍵盤開啟時跟著作曲區上移，抽屜開啟時改到頂端；640px 以上 AI 問答頁保留 12px 邊距，toast 同步再上移 12px。
- sonner 在 ≤1023px 必須是底部定位（`ui/sonner.tsx` 依 `useIsCompactLayout` 切換 `position`）；不得同時給 toaster `top` 與 `bottom`，否則清單會被撐成整頁透明層，toast 顯示期間整頁點不到。桌機的頂端位置只能用 `lg:` 類別；Radix viewport（`ui/toast.tsx`）的桌機位置同樣從 `lg:` 起算，不可用 `sm:`。
- 驗收：`tests/mobileShell.test.mjs` 鎖定上述契約；`tests/auditMobileWorkspaces.browser.cjs` 以 Playwright 在 390 與 320px 檢查各工作區無整頁橫向溢出、指揮列與抽屜可開關、dock 可及、toast 位置（含實際叫出一則 sonner toast，確認在 dock 上方且沒有蓋住頁面）。

依據：`src/pages/Index.tsx`、`src/index.css`、`src/components/layout/MainWorkspaceHeader.tsx`、`MobileWorkspaceDock.tsx`、`src/components/layout/mobile/*`、`src/components/ui/mobile-dialog.tsx`、`src/components/test-plan/test-plan.css`。

## 10. Dialog、選單、3D HTML 與全域聊天室層級

共用 Dialog 使用 Radix Portal；overlay 與 content 目前基礎層級都是 `z-50`，content 在 overlay 後；Select、Dropdown 亦以 Portal 與 `z-50` 避免被容器 overflow 裁掉。Dialog 內容使用獨立垂直捲動、`overscroll-contain`，mobile 最大高度扣除上下安全區，保留 44px 關閉按鈕與清楚標題／描述。長表單 footer 與取消／提交不可被安全區遮住。

這不是一套只看 z-index 數字就能保證正確的全域層級表：目前 header 50、mobile dock 40、更多 Drawer 92、協作詳情 Dialog 100；聊天室也有 78／79 的遮罩與面板，以及 40 的浮動 launcher 容器。重建時要逐一驗證實際 stacking context、Portal 順序與 focus，不可隨意把每個新 overlay 再加一個更大的數字。

必要契約：3D HTML 標籤與控制必須低於 Dialog。PCB WebGL 現在以 `Html zIndexRange={[20, 0]}` 限制標籤與遮罩層；禁止使用 3D library 的巨大預設 HTML 層級，造成 Dialog 開啟後標籤仍浮在上面。Dialog 開啟時，背景畫布與聊天室不能搶走點擊／鍵盤焦點；關閉後焦點應回到合理的觸發位置。

全域聊天室在 desktop 以靠右的浮動面板呈現，在 mobile 可以展成全 viewport；收合後 launcher 不應擋住頁面主要動作或 dock。未讀 badge 是真實資料，連線狀態須分開表達；不能把靜態裝飾當作線上狀態。

依據：`src/components/ui/dialog.tsx`、`select.tsx`、`dropdown-menu.tsx`、`src/components/layout/MobileWorkspaceDock.tsx`、`src/components/collaboration/CollaborationCenter.tsx`、`src/components/pcb-designer/Pcb3DCanvas.tsx`、`AGENTS.md`。

## 11. AI 問答：緊湊狀態、明確上下文與持續可用的輸入區

AI 問答是工作區，不是把設定表單和聊天塞在同一張長卡片。provider／模型、來源專案、附件與目前對話是執行上下文；共享提示詞、對話或來源的一般結果清單若有篩選，仍遵守第 7 節，不能套用上下文例外。

目前 composer 使用外框 focus-within 來表達焦點，內部 Textarea `data-ai-surface="true"`、兩列、最小 40px、最大 96px，可調整高度；工具列以頂部分隔線收束，附件與提示詞在左，送出在右，按鈕 44px。訊息／來源可捲動，輸入區保留在對話布局內可操作的位置。拖入附件有明確 drop 狀態；處理中與尚未完成遠端對話初始化會禁用相關操作，避免重複送出或把草稿寫到錯的對話。

目前共享提示詞支援 `/` 快速選單，顯示可辨識標題與內容預覽，方向鍵選擇、Enter 套用，明確表達選中項。手機可將不常用工具移到可開啟的面板，但 provider、模型、來源啟用與附件狀態仍要找得到。

`AiQuotaStatus.tsx` 採緊湊一列顯示分鐘／今日已用請求，更新按鈕與「詳情」皆具 44px 目標；細節使用原生 `details` 揭露，不將長說明常駐擠壓訊息。未選 API、讀取失敗或沒有快照時顯示 `—`，不能顯示為零或宣稱有剩餘額度。用量是本系統、所選 API 與模型的觀測值，包含重試，並非供應商官方剩餘量；統計範圍、追蹤起點與更新時間在詳情說明。移植時保留此語意，不要把估計值改名成保證可用。

AI 回答與請求必須有 loading／進度／取消或錯誤回饋，來源選擇錯誤留在對應位置；目前對話同步區分 loading、saving、synced、error。顯示送出成功不等於對話已持久化，需驗證實際同步與重開行為。

依據：`src/components/api-management/ApiChatConsole.tsx`、`AiQuotaStatus.tsx`、`MaintenanceSourceSelector.tsx`、`src/index.css`。

## 12. 空白、載入、錯誤、登入與權限狀態

相同布局需能呈現不同原因，不能只有一張萬用「尚無資料」卡：

| 狀態 | 呈現與操作原則 |
| --- | --- |
| 登入驗證中 | 顯示「正在驗證安全工作階段」等明確 loading，驗證完成前不短暫露出受保護內容 |
| 未登入 | 進入登入頁；登入後依真實授權建立入口，不沿用上一個人的資料 |
| 無權限 | 保留合法導覽，明確表達檢視／管理限制；伺服器也必須拒絕未授權操作 |
| 初次空白 | 說明尚未建立／上傳的資料與合理下一步；唯讀使用者不顯示可執行的建立承諾 |
| 空篩選結果 | 保留表頭／欄位骨架與 active chips，提供清除；機台使用精確契約文字 |
| 載入中 | 保留布局線索，`aria-busy`／`aria-live`；不要把上一份資料誤標成新查詢結果 |
| 儲存／執行中 | 按鈕文字與 disabled 防止重複操作，必要時呈現進度與可取消性 |
| 可恢復錯誤 | 顯示具體錯誤與重試；保留草稿、已成功檔案與既有登入狀態 |
| 成功 | 真正操作完成後回饋；若仍在背景同步，顯示同步階段 |

`MaintenanceLoading` 目前使用 header、摘要卡與結果 skeleton，並有 `aria-live="polite"`、`aria-busy="true"` 與 screen reader 文字。`WorkspaceRuntimeBoundary` 的失敗回饋保留導覽、資料與登入，提供重試或指定 fallback；重建時不要用整站白畫面或自動清除儲存資料來處理單一工作區失敗。

檔案上傳失敗應列出失敗檔案與重試操作，已成功的檔案保留；重試維持原空間與資料夾。刪除與覆蓋確認必須具體指出目標。不要因為清除篩選、取消 Dialog 或切換檢視而清掉業務資料。

依據：`src/App.tsx`、`src/components/auth/UserContext.tsx`、`src/components/maintenance/MaintenanceLoading.tsx`、`src/components/common/WorkspaceRuntimeBoundary.tsx`、`src/components/test-plan/TestPlanWorkspace.tsx`。

## 13. 圖示與首頁插圖的來源及語意

一般介面圖示使用 `lucide-react`，大小、線條密度與相鄰文字對齊。純圖示按鈕必須有可理解的 accessible name；tooltip／title 只能補充，不能是唯一語意來源。裝飾插圖應使用空 alt，外層可 `aria-hidden`，不可讓螢幕閱讀器重複讀取已存在的標題。

首頁現有八張原創插圖來源與生成提示詞記錄於 `src/assets/workspace/README.md`，由內建 imagegen 產生，最後為 768 × 512、保留 alpha 的 WebP。實際載入映射在 `WorkspacePreview.tsx`：

| 工作區 | 使用資產 |
| --- | --- |
| 維修中心 | `repair.webp` |
| 檔案上傳 | `files.webp` |
| 料號申請 | `parts-v2.webp` |
| Data-center | `racks.webp` |
| PCB Designer | `pcb-v2.webp` |
| AI 問答 | `analysis.webp` |
| 績效考核 | `performance.webp` |
| AutoCheck | `comparison.webp` |

共同美術語言是略俯視的正交三分之四視角、石墨金屬／銀色細邊、霧面材質、柔和左上光與克制玉綠細節，透明背景、足夠外緣留白、完整輪廓，沒有文字、商標、霓虹與 UI mockup。料號插圖以 BOM 文件與替代料核准為主體；PCB 插圖以裸板、真實鑽孔、銅箔／via／未裝件焊墊和編輯層表達設計，不能又換成已組裝伺服器主機板。

插圖只介紹功能，不代表目前機台數量、檔案數、績效分數、模型相容性或 API 連線狀態。現有 preview 使用 `object-fit: contain`、lazy loading、async decoding 並禁止拖曳。移植應連同 README 的來源與用途說明保存；不要只依副檔名推斷授權，亦不要把某張示意設備當實際設備照片。

依據：`src/assets/workspace/README.md`、`src/components/layout/WorkspacePreview.tsx`、`src/index.css`。

## 14. PCB／3D 專用必要契約

工程編輯器可以保留自己的工具布局與圖層控制，但不能犧牲幾何、安裝或儲存的真實性。以下均為 `AGENTS.md` 的必要契約：

- Bottom 必須與 Top 一樣可直接切換視角與自由旋轉；底面照明不能只依賴頂面光源，背景網格／陰影不可遮擋底面。3D HTML 標籤與控制必須低於 Dialog 顯示層級。
- 外框與孔洞只在獨立板形視窗編輯，取消不改原板。孔洞同步至 2D、WebGL、相容 3D、預覽、儲存與縮放；不能用上色假裝挖孔。孔洞不得越界、碰板邊或互相重疊。
- 模型朝向、PCB 安裝面與 pin 插入深度是三個獨立設定，隨元件保存；不得用拉伸模型或接腳修正浮空。
- STEP 最低點不等於本體安裝面。插板式元件依實際接腳長度設定插入深度；不得由名稱猜測 pin 長度或擅自變更既有專案安裝深度。未設定深度維持 0。
- WebGL 與相容 3D 共用安裝位移計算；Top／Bottom 的正插入深度都往 PCB 內移動，旋轉後仍保持模型尺寸比例。
- 自動生成的示意接腳有厚度上限，不能按大型元件總高拉成薄牆。示意模型不代表實際封裝；精確外形使用 STEP。
- 修改時驗證高元件接腳、旋轉後模型、頂面／底面插入、儲存重開，並實際目視確認；只有建置或最低點測試通過，不能宣稱所有零件安裝正確。

這些規則也說明「像本網站」不只是套相同顏色。涉及 PCB 或 Data Center 時，尺寸比例、孔洞、相容性、安裝位置與互動結果是產品品質的一部分，不能用漂亮的假 3D 代替。

## 15. 在另一台電腦的重建與驗收順序

先建立 token、共用控制與 shell，再接一個真實資料列表與完整篩選流程，接著加入各工作區。移植時一併保留 `data-ui`／`data-*` 樣式 hook、URL query 語意、權限映射與資產來源，避免外觀相近而互動不同。

驗收矩陣是重新執行的清單，本文件沒有宣稱以下項目本次已通過：

| 維度 | 最低檢查內容 |
| --- | --- |
| 桌面 | 1280 × 720、1440 × 900 或實際常用尺寸；導覽壓縮／更多、密集結果、長帳號／檔名、短高度 |
| 平板／斷點 | 768 × 1024、1024px 附近、1536px 附近；首頁 list／grid、dock／header 與多欄切換 |
| 窄版 | 390 × 844、320px 寬、橫向短高度；無全頁橫溢、操作可觸及、底部最後內容可見 |
| 互動 | hover／pressed／selected／focus／disabled 分離；Tab、Enter、Escape、方向鍵與焦點返回 |
| 篩選 | 手動與 URL 條件、chips、逐一清除、全部清除、重整、返回／前進、分享、零筆骨架 |
| 資料狀態 | 初次空白、長資料、載入、讀取失敗、部分上傳失敗、儲存中、重試、唯讀與未授權 |
| 疊層 | Dialog＋Select／Dropdown、3D HTML、聊天室、mobile 更多；遮罩與焦點不被背景穿透 |
| AI | keyboard／附件／模型與來源切換、composer 可用高度、無額度快照與同步失敗 |
| 3D | 真正上下表面、自由旋轉、照明、孔洞、比例、插入深度與儲存重開 |
| 輔助偏好 | reduced motion、reduced transparency、high contrast；非滑鼠操作仍可理解狀態 |
| 實體裝置 | 另行在實際 iPhone Safari／安裝版 PWA 或目標手機驗證鍵盤、安全區、工具列與 viewport；桌面模擬不可替代 |

可使用現有測試協助守住來源與行為契約，例如 `tests/filterUiStandards.test.mjs`、`testTrackerFilterUi.test.mjs`、`mobileFirstAdaptiveShell.test.mjs`、`workspacePermissions.test.mjs`、`workspaceDialogColorSystem.test.mjs`、`tests/test-plan/ui-contract.test.ts`、`tests/comparison/ui.test.mjs` 與各領域互動測試。測試檔存在不代表本次已執行或通過；原始碼字串測試亦不能取代實際瀏覽器視覺與操作驗收。

發布或交接報告應分別記錄原始碼檢查、建置、測試、瀏覽器操作、正式站與實體裝置證據。只完成前兩項時，應直接寫尚未目視或實機驗證，不能用「RWD 已完成」掩蓋未驗證狀態。

## 16. 原始碼索引與維護方式

| 規則來源 | 查閱位置 |
| --- | --- |
| 必要篩選與 PCB 契約 | `AGENTS.md` |
| token、最後覆寫、mobile、安全區、動效 | `src/index.css`、`tailwind.config.ts` |
| 共用控制 | `src/components/ui/button.tsx`、`input.tsx`、`textarea.tsx`、`select.tsx`、`dialog.tsx`、`dropdown-menu.tsx`、`card.tsx`、`table.tsx` |
| 工作區入口與權限衍生 | `src/pages/Index.tsx`、`src/lib/workspacePermissions.ts` |
| 首頁與導覽 | `src/components/layout/WorkspaceEntrance.tsx`、`WorkspacePreview.tsx`、`MainWorkspaceHeader.tsx`、`MobileWorkspaceDock.tsx` |
| 維修標題與 loading | `src/components/maintenance/MaintenancePageHeader.tsx`、`MaintenanceLoading.tsx` |
| 檔案庫 | `src/components/test-plan/TestPlanWorkspace.tsx`、`useFileLibraryFilters.ts`、`test-plan.css` |
| AutoCheck | `src/components/comparison/ComparisonResults.tsx`、`ComparisonCharts.tsx`、`useComparisonFilters.ts`、`comparison.css`、`public/comparison/README.md` |
| 頁數進度 | `src/components/material-requests/BomPageTrackerDialog.tsx`、`bomPageTracker.ts`、`bomPageTracker.css`、`docs/material-workflows.md` |
| 線路修改 | `src/components/circuit-changes/CircuitChangesDialog.tsx`、`CircuitChangeImages.tsx`、`CircuitChangeImageViewer.tsx`、`CircuitPdfPanel.tsx`、`useCircuitChanges.ts`、`useCircuitPdfs.ts`、`circuitChanges.css`、`circuitPdf.css`、`docs/material-workflows.md` |
| AI | `src/components/api-management/ApiChatConsole.tsx`、`AiQuotaStatus.tsx`、`MaintenanceSourceSelector.tsx` |
| 全域協作與隔離錯誤 | `src/components/collaboration/CollaborationCenter.tsx`、`src/components/common/WorkspaceRuntimeBoundary.tsx` |
| 登入驗證 | `src/App.tsx`、`src/components/auth/UserContext.tsx` |
| 插圖來源 | `src/assets/workspace/README.md` |
| 跨工作區篩選稽核 | `docs/filter-ui-audit.md`；注意內容日期與目前程式差異 |

本文件以 repository 相對路徑標示來源，搬到另一台電腦不需要原開發機的使用者路徑。若只攜帶 Markdown 而沒有原始碼，本文仍提供必要色票、尺度、導覽、篩選與驗收規則；若要忠實重現所有畫面，仍需原始碼、合法資產與另行設定的服務環境。文件本身不包含帳密、API key 或正式資料。
