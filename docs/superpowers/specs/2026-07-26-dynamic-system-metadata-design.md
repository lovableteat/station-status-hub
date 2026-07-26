# Dynamic Software Versions and Statistics Design

## Goal

讓每個測試專案能自行新增、編輯、排序與刪除「軟體版本」及「統計」欄位，不再被 90BOM、Ubuntu、CUDA 與單一儀表板統計開關綁死，同時保留既有資料與報表相容性。

## Considered Approaches

1. **持續新增固定資料庫欄位**：查詢直接，但每新增一種版本都要 migration 與改 UI，正是目前問題，因此不採用。
2. **在 `test_systems` 放一個自由 JSON**：實作快速，但欄位定義、排序、驗證與跨機台一致性困難，因此不採用。
3. **專案欄位定義加每機台欄位值**：沿用動態網路位址的既有模式，定義與值分離，支援型別與排序，也能遷移舊欄位；為採用方案。

## Data Model

- `test_project_system_fields`
  - `id`, `project_id`, `category`, `label`, `field_key`, `field_type`
  - `placeholder`, `options jsonb`, `sort_order`
  - `is_required`, `is_system`, timestamps
- `test_system_field_values`
  - `field_id`, `system_id`, `value jsonb`, timestamps
  - 複合主鍵 `(field_id, system_id)`
- `category` 限定為 `software` 或 `statistics`。
- `field_type` 限定為 `text`, `number`, `boolean`, `select`。
- 每個專案建立四個系統欄位：90BOM、Ubuntu 版本、CUDA 版本、列入儀表板統計。系統欄位可改標籤與排序，但不可刪除。
- migration 將舊 `bom_90`、`ubuntu_version`、`cuda_version`、`exclude_from_dashboard` 值轉入新值表；舊欄位在過渡期保留並雙寫，避免既有報表與匯出中斷。

## UI and Data Flow

- `SystemEditDialog` 將「軟體版本與統計」改為資料驅動欄位清單。
- 「新增欄位」可選分類、型別、名稱、提示文字；select 類型可維護選項。
- 欄位支援重新命名、調整順序與刪除；刪除自訂欄位前顯示會同步刪除所有機台值的確認。
- 欄位定義屬於整個專案，任何機台新增後，同專案其他機台立即顯示。
- 儲存機台時，核心資料與動態欄位值共同驗證；任一寫入失敗時保留視窗與使用者輸入，顯示具體錯誤。
- 目前應用使用自訂 `system_users` 登入而非 Supabase Auth，因此 migration 必須授權 `anon`、`authenticated`、`service_role`，並沿用專案既有 RLS 模式。

## Compatibility

- 既有固定欄位在讀取時作 fallback；新值存在時優先使用新值。
- `exclude_from_dashboard` 仍維持 boolean 語意，動態 UI 的「列入統計」需反向映射。
- clone、報表、PDF 與行動版顯示至少保留四個系統欄位的既有行為；自訂欄位逐步由共用讀取 helper 提供。

## Verification

- migration 測試檢查型別約束、索引、RLS、anon 權限、預設欄位與資料回填。
- UI 測試覆蓋新增、改名、排序、刪除、文字、數字、開關、選項與儲存失敗。
- 實際驗證同專案兩台機台共享定義但保存不同值。
- 執行 test-tracker 測試、ESLint 與 production build。

