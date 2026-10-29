> 集中副本；原始路徑：`docs/UI設計風格與互動規則.md`；程式參考基準：`06c686951b17afa920cf325ddfec9114590aeee0`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

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

依據：`src/pages/Index.tsx`、`src/index.css`、`src/components/layout/MainWorkspaceHeader.tsx`、`MobileWorkspaceDock.tsx`、`src/components/test-plan/test-plan.css`。

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
| AI | `src/components/api-management/ApiChatConsole.tsx`、`AiQuotaStatus.tsx`、`MaintenanceSourceSelector.tsx` |
| 全域協作與隔離錯誤 | `src/components/collaboration/CollaborationCenter.tsx`、`src/components/common/WorkspaceRuntimeBoundary.tsx` |
| 登入驗證 | `src/App.tsx`、`src/components/auth/UserContext.tsx` |
| 插圖來源 | `src/assets/workspace/README.md` |
| 跨工作區篩選稽核 | `docs/filter-ui-audit.md`；注意內容日期與目前程式差異 |

本文件以 repository 相對路徑標示來源，搬到另一台電腦不需要原開發機的使用者路徑。若只攜帶 Markdown 而沒有原始碼，本文仍提供必要色票、尺度、導覽、篩選與驗收規則；若要忠實重現所有畫面，仍需原始碼、合法資產與另行設定的服務環境。文件本身不包含帳密、API key 或正式資料。
