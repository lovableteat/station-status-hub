# Task 1 Report — 統一 2D／3D 同步投影與選取規則

## 修改內容

- 新增共享同步模組 `viewSync.ts`，集中處理：
  - primary selection 與 grouped selection 去重後的 ID 集合
  - `all/top/bottom` 圖層可見規則
  - 2D 元件中心點計算
  - 3D board-centered transform 計算，並保留 bottom layer 翻面規則
- `PcbCanvas.tsx` 改用共享圖層可見與選取 ID 邏輯，避免 2D 自行維護一套規則。
- `PcbCanvas.tsx` 元件 render root 新增：
  - `data-pcb-coordinate`
  - `data-pcb-rotation`
  - `data-pcb-layer`
  - `data-pcb-selected`
- `Pcb3DCanvas.tsx` 改用共享圖層可見、選取 ID、3D transform 邏輯。
- `Pcb3DCanvas.tsx` 將 board-plane transform 與元件高度 offset 分離：
  - 共享函式只負責 2D/3D 同步的 board-plane 對位
  - 既有 `maxHeight` 高度抬升仍在內層 group 保留
- 新增 pure-function 測試與 contract 測試，驗證共享模組與 inspectable attributes。

## 修改檔案

- `src/components/pcb-designer/core/viewSync.ts`
- `src/components/pcb-designer/PcbCanvas.tsx`
- `src/components/pcb-designer/Pcb3DCanvas.tsx`
- `tests/pcb-designer/view-sync.test.ts`
- `tests/pcb-designer/editor-contract.test.ts`

## TDD RED / GREEN

### RED

命令：

```bash
node --test tests/pcb-designer/view-sync.test.ts
```

關鍵輸出：

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../src/components/pcb-designer/core/viewSync.ts'
✖ tests\pcb-designer\view-sync.test.ts
ℹ pass 0
ℹ fail 1
```

判定：符合預期，因為共享模組尚未建立。

### GREEN

命令：

```bash
node --test tests/pcb-designer/view-sync.test.ts
```

關鍵輸出：

```text
✔ returns the 2D center from board coordinates
✔ maps top-layer board coordinates into a deterministic 3D transform
✔ adds the bottom-layer flip to the shared 3D transform
✔ returns unique selection ids including the primary selection
✔ shares visible-layer rules across all, top, and bottom filters
ℹ pass 5
ℹ fail 0
```

## Focused tests

命令：

```bash
node --test tests/pcb-designer/view-sync.test.ts
node --test tests/pcb-designer/editor-contract.test.ts
```

關鍵輸出：

```text
view-sync.test.ts: pass 5, fail 0
editor-contract.test.ts: pass 25, fail 0
```

## `npm run test:pcb`

命令：

```bash
cmd /c npm run test:pcb
```

結果：

```text
ℹ tests 147
ℹ pass 144
ℹ fail 3
```

失敗項目：

1. `tests/pcb-designer/account-remote-sync.test.ts`
   - `loads a dedicated account workspace and refreshes built-in catalogs`
   - 關鍵差異：`5 !== 4`
2. `tests/pcb-designer/workspace-integration.test.ts`
   - `replaces the loading shell with one native three-area PCB workbench`
   - 關鍵差異：命中 `gradient|shadow-(?:xl|2xl)` 相關既有來源內容
3. `tests/pcb-designer/workspace-integration.test.ts`
   - `ships a complete custom-login PCB workspace migration and legacy permission fallback`

判讀：

- 這 3 個失敗都不在本次 brief 允許修改的檔案範圍內。
- 本次新增/修改的 focused tests 已全數通過。
- 因使用者要求「只修改 brief 列出的檔案」，本輪未延伸處理這 3 個既有失敗。

## 自我檢查

- 已確認修改集中在 brief 列出的 5 個功能檔案，另補指定報告檔。
- 未處理 `layerColors`、`import preview`、`toolbar`。
- 2D 與 3D 都改成從同一個共享模組取得：
  - visible layer 規則
  - selected IDs 規則
  - 共同座標映射基準
- 3D 保留既有元件高度呈現方式，避免因同步邏輯抽取而改變模型/程序 fallback 的立體高度。
- 已執行 `git diff --check`，無 whitespace error；僅有既有 CRLF/LF warning。

## 疑慮

- `npm run test:pcb` 未全綠；但失敗集中在本 Task 範圍外的既有測試。
- `getPcb3DComponentTransform()` 目前將共享 transform 定義在 board plane，元件高度 offset 仍留在 `Pcb3DCanvas.tsx` 內層 group。這樣可保留現有 3D 外觀，同時滿足 2D/3D 投影同步；若後續 brief 想把高度 offset 也納入共享函式，介面需要額外接受 `maxHeight` 或厚度資訊。
