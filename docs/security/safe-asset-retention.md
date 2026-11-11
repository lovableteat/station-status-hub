# GitHub Pages 跨版本資產承接：隔離方案與啟用門檻

## 目前狀態與不能承諾的事項

本次只新增純記憶體 planner 與 synthetic 單元測試，**沒有修改 Pages workflow、啟用舊資產保留、發布 seed、變更 production DB／Storage 或重新建置舊私密資料**。不能把這份方案或單元測試通過說成「所有已開分頁跨部署都不會中斷」。

- 新 `index.html` 的 handler 只會影響實際載入它的頁面，**無法追溯修改已開啟舊 tab 的 handler**。
- `a30615e` 的 `index.html:239–245` 在 `vite:preloadError` 時仍呼叫 `retryBoot`，其第 231–233 行會 `location.replace`；該版 `AppRuntimeBoundary.componentDidCatch` 也會自動重載。因此舊 tab 點到被刻意排除的 BOM 分支時，可能執行舊重載邏輯而失去尚未儲存的記憶體草稿。新版 recovery UI 的測試不能證明這些舊 tab 也已獲保護。
- 舊 tab 的 lazy import 仍會請求舊版編譯時寫入的確切 hashed URL。僅發布新版同名元件、更新 index 或重建近似舊版都不能解決該 URL 的缺檔。
- 已經載入記憶體、瀏覽器快取或被下載的舊程式與資料，不會因伺服器移除資產而消失。此方案不聲稱撤回資料、清除所有快取或修正已載入的舊邏輯。
- 保留舊可執行碼也可能保留被修正的權限、資料寫入、附件公開 URL 或其他安全缺陷。必須審核各檔的現行安全契約，不能宣稱「非 seed 的 chunk 都安全」。後端切換與資料契約改變也會讓舊程式不再相容。
- 排除不安全的舊 BOM 路徑可能使該路徑無法開啟。保留其他經審核工作區是有限的相容性措施，不是所有工作區的無中斷保證。

實際舊 artifact 的逐檔審核尚未完成。協調端唯讀查到 `a30615e` 對應的成功 Pages run `43071880925`、`github-pages` artifact `13877798168`（25,170,514 bytes，報告的 SHA-256：`a76f29ef57519eebad0472b6a192cd81dfabeda6db272d74a9a305c92d7aaccf`）。下載兩次均 `ReadTimeout`，沒有檔案 ID 或 bytes 回傳，已停止重試；這不是權限拒絕，也不是已驗證該 archive 內容。未產生此版的可發布白名單，不得以重新 build 的產物代替實際已部署 artifact。

## `a30615e` 的 seed 依賴與寫入風險

只讀程式結構即可確認以下鏈，無需讀取 seed 內容作測試：

1. `src/App.tsx` 延遲載入 `AuthenticatedApplication`。
2. `src/components/auth/AuthenticatedApplication.tsx` 延遲載入 `src/pages/Index.tsx`。
3. `Index.tsx` 的 `loadMaterialRequestPage` 延遲載入 `MaterialRequestPage`。其他工作區也有各自的延遲入口。
4. `src/components/material-requests/MaterialRequestPage.tsx:843` 的 `loadDefaultBomWorkspace` 延遲匯入 `src/data/materialRequestSeed.json`，再建立預設 BOM workspace。
5. 同檔 `applyLoadedWorkspaces`（約第 3773 行）在遠端清單為空時載入 fallback，符合當時寫入 scope 時會呼叫 `saveBomWorkspace`。刪除最後一份 BOM 的舊路徑（約第 5378–5404 行）也會載入並儲存 fallback。

因此不能提供空 JSON／JS seed stub、重新導向到空 seed、改寫舊檔內容，或拿新版空 placeholder 模擬舊模組的匯出。這可能使舊程式自動寫入不正確的 fallback。新版移除 seed 與不自動寫入的處理，是新版程式本身的行為，不會自動移植到舊 tab。

planner 對名稱／source provenance 含 `materialRequestSeed`，以及含 `MaterialRequestPage` 來源的舊 chunk 設置硬性拒絕。這是保守的額外防線：即使日後某版 BOM 已安全，這個初版保留器仍不承接該元件；若要改變，須另行審核規則、相容行為與測試，不能只填一筆白名單覆蓋拒絕。

## Vite 圖不能只看 chunk 檔名

目前 `vite.config.ts` 使用 `/station-status-hub/`、ES2020、ES worker，未啟用 build manifest。Vite 6.4.6 / Rollup 4.59.0 的輸出結構提供：

- `OutputChunk.imports`：靜態匯入。
- `OutputChunk.dynamicImports`：動態匯入。它不保證呼叫是使用者點擊後才發生；頂層立即呼叫或預先載入可能是必要依賴。
- `OutputChunk.modules`：chunk 中的原始模組 provenance。單靠 facade 名稱可能漏掉合併在共用 chunk 裡的 seed／不安全 importer。
- `referencedFiles`、Vite `viteMetadata.importedCss` / `importedAssets`：部分額外資產。
- Vite 預載入 helper 的依賴表、CSS `url()` / `@import`、worker、WASM、`new URL()`、程式組出的 URL、public/ 固定路徑，仍需逐一核對。獨立 worker build 的輸出也不能假定包含在主 bundle manifest。

標準 `.vite/manifest.json` 沒有完整 `modules`、逐檔 SHA-256、人工安全審核或所有 runtime reference。不能直接轉成「全部准許」。Graph 是必要條件，不是機密資料掃描器，也不能證明可執行碼沒有副作用。

必須區分：

- **required**：該檔載入／執行或被承諾的操作所必需的所有資產，包括靜態 imports、CSS、字型、worker/WASM 與實際 eager preload。任何一個未核准就拒絕整個計畫，允許有完整的靜態循環。
- **optional**：經審查確實延後到不同導覽操作才需要的 import。每一條被刻意排除的 edge 都須記錄原因。不能把 unknown 或必要依賴塞進 optional。
- **route roots**：為一個具體、已測相容操作列出所有入口，包括操作需要的次級 lazy chunk。planner 不會猜這個操作還需要哪些子頁。

不能把所有 dynamic edge 的拒絕反向傳播到每個 shell，否則一個 BOM lazy 分支會使其他安全工作區也全部無法承接。也不能完全忽略 dynamic edge，否則會默默承諾一條實際缺檔的路徑。此方案採 required 閉包 + 明列 route roots + 被排除 optional edge 的逐條記錄。若 seed 已合併進某個必要共用 chunk，那個操作就不能保留，不能拆碼或假稱安全。

## 純 planner API 與可信輸入

實作：`scripts/plan-safe-asset-retention.mjs`。

```js
import {
  sha256, inventoryDigest, planSafeAssetRetention, assembleSafeAssetRetention,
} from './scripts/plan-safe-asset-retention.mjs';

const input = {
  base: '/station-status-hub/',
  now: '2026-11-12T00:00:00Z', // 呼叫端的可信時間，不可由舊 artifact 自填
  currentFiles: new Map(),   // 已通過新版安全檢查的「乾淨新 build」，不可是歷代合併 dist
  snapshots: [{ manifest, review, files: new Map() }],
  revokedSha256: [],         // 審核端維護的全域撤銷清單；不可由舊 artifact 覆蓋
};

const plan = planSafeAssetRetention(input);
// plan.assets: {path, sha256, bytes, release, action: 'copy' | 'reuse-current'}[]
// plan.routes / plan.unavailableOptional: 有限的已審核操作與刻意不可用分支
// 此呼叫不寫任何檔案，不查網路，不觸發部署。

const assembled = assembleSafeAssetRetention(input);
// assembled.files 是新的 Map<string, Buffer>，只含乾淨新 build + 核准閉包。
// assembly 會重新驗證 hashes，不接受先前回傳的 mutable plan 當授權。
```

`manifest` schema 1：

```js
{
  schemaVersion: 1,
  release: '0123456789012345678901234567890123456789', // 完整 commit
  artifactSha256: '<64 lowercase hex>', // 確切原始 artifact 的已驗證 digest
  builtAt: '<original UTC build time>',
  base: '/station-status-hub/',
  files: [{
    path: 'assets/Dashboard-abcdefgh.js',
    sha256: '<64 lowercase hex of exact file bytes>', bytes: 123,
    kind: 'js', // js | css | asset，且必須與副檔名一致
    modules: ['src/components/Dashboard.tsx'],
    required: ['assets/common-abcdefgh.js'],
    optional: ['assets/detail-abcdefgh.js'],
    externalModules: [], // retained 檔有未處理 external module 時拒絕
  }],
}
```

上例是 schema 示意，不是有效核准名單。每個 `required` / `optional` 必須指向同一 inventory 的確切 hashed path。被拒絕的檔案可只保留已可信驗證的 metadata，不需把其 bytes 傳給 planner。`files` Map 額外出現任何舊檔都不會自動獲准，整包舊 `dist` 永不直接合併。

`review` schema 1：

```js
{
  schemaVersion: 1, release: '<same full commit>',
  inventorySha256: inventoryDigest(manifest),
  provenance: 'verified-build-output',
  reviewedAt: '<UTC>', expiresAt: '<UTC>', evidence: '<review record>',
  approvedFiles: [{
    path: 'assets/Dashboard-abcdefgh.js', sha256: '<exact approved hash>',
    publicContent: true,           // 無須保密內容，且可重新對公網提供
    currentSecurityContract: true,// 舊碼在本次後端與權限／資料契約下仍可執行
    completeDependencies: true,   // 覆蓋實際執行、預載與資產 URL，不只字面 import
    evidence: '<per-file review record>',
  }],
  routes: [{ label: '<specific verified scenario>', roots: ['assets/Dashboard-abcdefgh.js'] }],
  allowedMissingOptional: [{
    from: 'assets/index-abcdefgh.js', to: 'assets/MaterialRequestPage-abcdefgh.js',
    reason: '舊 fallback 可能自動寫入，該分支不可承接',
  }],
}
```

**信任邊界**：planner 機械驗證資料形狀、身分綁定、圖閉包、byte hashes、撤銷、硬性拒絕與相容檔案集合，但不會驗證 GitHub 身分或替審核者檢查任意 JavaScript 是否安全。`verified-build-output` 與三個 `true` 是獨立審核的結果，不是可由待審 artifact 自己宣告的信任來源。呼叫端必須將 review 放在受控、已審核的來源中，核實 commit/run/artifact digest，且驗證 archive digest 的正確層級（ZIP 與內含 tar 不可混用）。`inventoryDigest` 是完整 manifest 的 canonical JSON SHA-256，不是數位簽章。未知、失去 provenance 或缺圖時不產生 review；不要用自填欄位繞過缺失。

## 可機械檢查的限制

- 最多兩個原始 release、原始 build 起 14 天、256 檔、64 MiB。不得以重新合併／重新部署的時間延長舊 build 年齡。
- 僅接受 `assets/` 下一層有 hash 的明列副檔名；不接受 HTML、source map、JSON、任意 public 檔、路徑跳脫、query URL、外部 module。非支援格式需要另行審核程式與測試，不可臨時 wildcard 放行。
- 逐檔 byte 長度與 SHA-256 必須相符；每個 required dependency 都須另有逐檔批准。inventory 改一個 edge 就使舊 review 失效。
- 名稱與 provenance 雙重封鎖 seed／舊 importer；JS/CSS 額外拒絕 seed 名稱和 source map reference。**這些掃描無法發現所有改名、編碼或內嵌私密資料，不能取代人工內容與行為審核。**
- `currentFiles` 在任何 clone／組裝之前也必須通過已知 seed 檔名、所有檔案中的已知 seed 文字引用與 revoked SHA-256 拒絕檢查，即使 `snapshots: []` 也不能跳過。這能攔截誤把含已知 seed 的舊 dist 當成 current 的情形；新版安全的 `MaterialRequestPage` 名稱本身不屬於這項拒絕。組裝時會重新檢查，不能以先前通過的 plan 免驗。
- 同 URL 不同 bytes（新舊／舊舊）拒絕。同 URL 完全相同才重用，不改舊 chunk 的內容或 import URL。
- 被宣告排除的 optional target 若出現在另一保留版或 current output，整個計畫拒絕，避免間接復活。
- 任一驗證失敗都 throw，沒有「盡量複製」結果、沒有先複製一半、沒有 catch 後自動保留整包舊檔。明確 `snapshots: []` 才表示不承接；這會失去舊 lazy 路徑，不可靜默降級成無中斷成功。
- `currentFiles` 的上述已知標記／撤銷檢查不是完整內容掃描：編碼、混淆、無已知標記的資料或未列入撤銷的危險程式仍需獨立審核。**fresh current output 仍需獨立全內容與安全審核**，不能把 metadata flags 或 planner 通過視為已完成此審核；組裝後也須對最終 artifact 再檢查。不要把原始 archive、inventory、review、source map 或調查紀錄一起放進公開 output。

## 啟用前流程（尚未執行）

1. 取得確切已成功部署的原始 artifact 並確認 run、完整 commit、時間與 digest。若需要解 archive，先拒絕 symlink／hardlink、絕對路徑、路徑跳脫與重複 entry，不執行任何舊腳本；不能把原始 archive 放入 Pages。下載或存取限制不可以改走未獲准來源繞過。
2. 從可信原始 build 記錄取得 modules／圖 provenance，並對最終 bytes 補查 runtime dependencies。若原記錄缺失且無法可信重建**圖的證據**，該檔不承接；不能用近似重新 build 產物冒充舊 URL，也不以讀取實際 seed 作 synthetic 測試。
3. 審核候選可執行碼是否重新引入資料外流、舊附件公開化、權限繞過、不安全 fallback 或破壞性相容寫入。列入安全撤銷清單；沒有必要承接的工作區就不選。禁止 seed、其 unsafe importer 與依賴它們的必要閉包。
4. 先在全 synthetic、同 origin 的隔離 HTTP 測試中開啟 v1 頁，保留未存草稿，再切換至 v2 的新 index；舊頁導航至核准 lazy 工作區應成功，seed／unsafe BOM URL 應缺檔。核實 server 真正使用 planner 的結果、不是把舊目錄整包提供。測試另涵蓋新版對未保留 lazy URL 的錯誤 UI、返回、重試與草稿保留。新版 handler 的測試不等於舊 tab 已具有同一 handler。
5. 設計與測試先完成審核，再另行修改 production workflow。必須從乾淨新 build 開始，在新 staging directory 組裝，精確比對輸出檔集合與 hashes，最後原子性上傳完整 Pages artifact。planner 不是 deployer，此次沒有加入這個步驟。
6. 最終 artifact 再執行 seed／private-content／source-map 與必要資產檢查，通過 exact-commit CI 後才按既定授權部署。不能以這份純單元測試代替實際部署驗證。
7. 記錄本次承接的 release、到期、具體操作與刻意不可用分支。到期移除會影響仍開著的更舊 tab，需按維護安排處理。安全撤銷優先於相容期；不能為保留舊 tab 而重新發布被撤銷資產。
8. 回復時使用已審核的新安全 build，不得整包回復有 seed 的舊 artifact；不得自動 reload 有未儲存內容的 tab、清 localStorage／IndexedDB，或回滾／遷移業務資料以掩飾 chunk 問題。

## 已執行驗證

`node --test tests/safeAssetRetention.test.mjs`：41 個全 synthetic 測試通過。涵蓋靜態循環、CSS／字型閉包、可分離的 lazy 分支、逐檔審核缺漏、依賴缺檔、原始 artifact 身分、hash tamper、manifest 改動、撤銷、空 seed stub／改名 source veto（包括 Windows source path）、source-map inline reference、路徑與副檔名、同名衝突、跨版本排除分支復活、期限／日期／數量／容量、assembly 重驗與輸入不變性。另驗證 current output 的已知 seed 檔名／不同格式文字引用／revoked hash 拒絕、安全新版 MaterialRequestPage 不被誤擋，以及先 plan 後變更 current output 仍在 assembly 被拒絕。兩個新 `.mjs` 檔的 `node --check` 與限定此兩檔的 ESLint 檢查通過。

本測試沒有啟動 Chromium、操作 production、讀寫使用者 BOM、部署、推送或提交。實際 archive 檢驗與 rollout 未執行。後續同源瀏覽器 fixture／CI 的結果需由整合工作另行記錄，不能由這 41 個測試推論。
