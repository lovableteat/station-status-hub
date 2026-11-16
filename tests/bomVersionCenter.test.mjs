import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { EMPTY_BOM_DIFF_FILTERS, BOM_DIFF_EMPTY_TEXT, filterBomDiffEntries } from "../src/components/material-requests/bomDiffFilters.ts";

const read = async (file) => (await readFile(new URL(`../src/components/material-requests/${file}`, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const center = await read("BomVersionCenter.tsx");
const diffView = await read("BomDiffView.tsx");
const uploadDialog = await read("BomUploadDialog.tsx");
const page = await read("MaterialRequestPage.tsx");
const storage = await read("materialBomStorage.ts");
const guide = await read("MaterialUploadGuideDialog.tsx");
const indexPage = await readFile(new URL("../src/pages/Index.tsx", import.meta.url), "utf8");

const entry = (overrides = {}) => ({ id: "x", kinds: [], impact: "none", displayRef: "C1", name: "CAP", refAdded: [], refRemoved: [], changes: [], lines: [], trackingLost: 0, trackingAfter: false, searchText: "c1 cap vendor a", ...overrides });

test("diff filters: unchanged rows hidden by default, kinds are OR, impact and tracking narrow, search tokens are AND", () => {
  const entries = [
    entry({ id: "same" }),
    entry({ id: "added", kinds: ["added"], impact: "production", searchText: "d9 led vendor b" }),
    entry({ id: "status", kinds: ["status"], impact: "status", trackingLost: 1, searchText: "u5 ic vendor a" }),
    entry({ id: "spec", kinds: ["spec", "qty"], impact: "production", searchText: "j1 conn" }),
  ];
  assert.deepEqual(filterBomDiffEntries(entries, EMPTY_BOM_DIFF_FILTERS).map((item) => item.id), ["added", "status", "spec"]);
  assert.deepEqual(filterBomDiffEntries(entries, { ...EMPTY_BOM_DIFF_FILTERS, includeUnchanged: true }).map((item) => item.id), ["same", "added", "status", "spec"]);
  assert.deepEqual(filterBomDiffEntries(entries, { ...EMPTY_BOM_DIFF_FILTERS, kinds: ["added", "status"] }).map((item) => item.id), ["added", "status"]);
  assert.deepEqual(filterBomDiffEntries(entries, { ...EMPTY_BOM_DIFF_FILTERS, impact: "production" }).map((item) => item.id), ["added", "spec"]);
  assert.deepEqual(filterBomDiffEntries(entries, { ...EMPTY_BOM_DIFF_FILTERS, trackingLostOnly: true }).map((item) => item.id), ["status"]);
  assert.deepEqual(filterBomDiffEntries(entries, { ...EMPTY_BOM_DIFF_FILTERS, query: "vendor A" }).map((item) => item.id), ["status"]);
  assert.deepEqual(filterBomDiffEntries(entries, { ...EMPTY_BOM_DIFF_FILTERS, query: "vendor zzz" }), []);
});

test("the diff view keeps the persistent filter contract: bar above the table, chips, clear-all and a skeleton-preserving empty state", () => {
  const filterIndex = diffView.indexOf('data-testid="bom-diff-filters"');
  const tableIndex = diffView.indexOf("<table", filterIndex);
  assert.ok(filterIndex > 0 && tableIndex > filterIndex, "the filter bar sits directly above the results");
  const bar = diffView.slice(filterIndex, tableIndex);
  assert.ok(bar.indexOf('aria-label="搜尋差異"') < bar.indexOf('aria-label="變更類型"'), "搜尋 comes first");
  assert.ok(bar.indexOf('aria-label="變更類型"') < bar.indexOf('aria-label="影響"'), "then 變更類型, then 影響");
  assert.match(bar, /aria-pressed=\{filters\.kinds\.includes\(kind\.key\)\}/);
  assert.match(bar, /data-testid="bom-diff-active-filters"/);
  assert.match(bar, /aria-label=\{`移除篩選：\$\{chip\.label\}`\}/);
  assert.match(bar, />全部清除</);
  assert.match(diffView, /隱藏未變更 \$\{unchangedCount\.toLocaleString\(\)\} 個位號/, "the default hide-unchanged condition is a visible, removable chip");
  assert.equal(BOM_DIFF_EMPTY_TEXT, "目前篩選條件沒有符合的差異");
  assert.match(diffView, /<tr><td colSpan=\{7\}[^>]*>\{BOM_DIFF_EMPTY_TEXT\}<\/td><\/tr>/, "empty results stay inside the table body under the header");
  assert.match(diffView, /匯出差異 Excel/);
  assert.match(diffView, /aria-label="交換新舊版本"/);
});

test("the version center is a two-pane series/version window with timeline actions and an archive section", () => {
  assert.match(center, /data-testid="bom-series-list"/);
  assert.match(center, /data-testid="bom-series-detail"/);
  assert.match(center, /data-testid="bom-version-table"/);
  assert.match(center, /data-testid="bom-archive-section"/);
  assert.match(center, /className="bom-version-columns grid min-h-0 min-w-0 flex-1"/);
  assert.match(center, /aria-label="搜尋 BOM 系列"/);
  for (const action of ["匯入 BOM 檔案", "上傳此系列新版", "比對版本", "設為目前版本", "檢視", "編輯說明", "刪除系列", "返回清單", "回到清單"]) assert.ok(center.includes(action), action);
  assert.match(center, /BOM_SERIES_EMPTY_TEXT = "找不到符合條件的 BOM 系列"/);
  assert.match(center, /歷史版本唯讀/);
  assert.match(center, /料件與追蹤在目前版本維護/);
  assert.doesNotMatch(center, /removeBomWorkspace|saveBomWorkspace\(/, "the window never writes storage directly; the page owns every mutation");
});

test("uploads are staged and confirmed with an explicit series target instead of overwriting by file name", () => {
  assert.match(uploadDialog, /NEW_BOM_SERIES_TARGET = "__new-series__"/);
  assert.match(uploadDialog, />建立新 BOM 系列</);
  assert.match(uploadDialog, /的新版本（目前 \{series\.current\.displayNumber\} → V\{nextBomVersionNumber\(series\)\}）/);
  assert.match(page, /const \{ importNotes, \.\.\.payload \} = await parseMaterialWorkbookFile\(file\);/);
  assert.match(page, /boundSeries \?\? inferBomSeriesForFile\(file\.name, seriesList\)/);
  assert.doesNotMatch(page, /createBomId\(file\.name\)/, "ids are no longer derived from the file name");
  assert.match(page, /const workspaceId = createBomVersionWorkspaceId\(seriesName, versionNumber\);/);
  assert.match(page, /carryBomTracking\(previousRecords, upload\.payload\.records\)/);
  assert.match(page, /isCurrent: false, currentChangedAt: stamp \}, \(\) => assertBomWriteCurrent\(writeScope\)\)/, "the previous current version is demoted in the same write scope");
  assert.match(page, /uploadBomSourceFile\(\{ workspaceId, file: upload\.file \}\)/);
  assert.match(page, /report\.push\(`\$\{orphanedTotal\.toLocaleString\(\)\} 筆舊版資料沒有帶到新版，\$\{uploads\.length > 1 \? "請在各系列比對的「未帶入」補填" : "按「查看差異」補填"\}。`\);/, "the warning names the button that exists");
  assert.match(uploadDialog, /useEffect\(\(\) => \{ if \(open\) \{ setLabel\(""\); setNote\(""\); \} \}, \[open\]\);/, "a new batch never inherits the previous upload's label and note");
  assert.match(page, /carry = \{ matched: carried\.matched, tracked: carried\.tracked,/, "the version records how many lines really carried website data");
  assert.match(page, /<ToastAction altText=\{`查看「\$\{comparisonResult!\.seriesName\}」/, "the upload result offers the comparison directly");
  assert.match(page, /comparisons\.find\(\(item\) => item\.summary\.trackingLost > 0\) \?\? comparisons\.at\(-1\)/, "in a batch, 查看差異 opens the series the warning is about");
  assert.match(page, /useState\(\(\) => typeof window !== "undefined" && readBomDiffLocation\(window\.location\.search\) !== null\)/, "a link with an open comparison reopens BOM 版本管理");
  assert.match(center, /for \(const key of BOM_DIFF_QUERY_KEYS\)/, "the open comparison and 只看未帶入 are mirrored into the URL");
  assert.match(center, /onLostOnlyChange=\{setDiffLostOnly\}/);
  assert.match(center, /if \(diffRequest\) consumedDiffRequest\.current = diffRequest\.token;\n    setDiffPair/, "a manual comparison takes over from a link still waiting for its versions");
  assert.match(page, /const nameSeries = uploads\.length > 1;/, "a batch names the series even when only one of its files replaced a version");
  assert.match(diffView, /useEffect\(\(\) => \{ onLostOnlyChange\?\.\(filters\.trackingLostOnly\); \}/, "clearing the chip updates the URL through the same state");
  for (const key of ["bomDiff", "bomBefore", "bomAfter", "bomDiffLost"]) assert.ok(indexPage.includes(`"${key}",`), `${key} is dropped when leaving the module`);
  assert.match(page, /diffRequest=\{bomDiffRequest\}/);
  assert.match(page, /carryBomTracking\(previousRecords, targetRecords, \{ from: "current" \}\)/, "switching back keeps the newest tracking");
  assert.match(page, /const landingId = sameSeries\?\.current\.workspace\.id \?\? nextWorkspaces\[0\]\.id;/, "deleting the version on screen lands on the same board");
  assert.match(guide, /同一塊板再上傳即成為新版本/);
  assert.doesNotMatch(guide, /相同檔名重新上傳會更新原 BOM/);
});

test("historical versions are read-only on the page and announced with a way back", () => {
  assert.match(page, /const canEditModuleAccess = canEditModule\("material-requests"\);/);
  assert.match(page, /const canEdit = canEditModuleAccess && !isHistoricalVersion;/);
  assert.match(page, /useWorkspaceMutationScope\(user\?\.userId \?\? null, canEditModuleAccess\)/);
  assert.match(page, /data-testid="material-historical-banner"/);
  assert.match(page, /回到目前版本 \{activeVersionInfo\.series\.current\.displayNumber\}/);
  assert.match(page, /目前版本不能直接刪除/);
  assert.match(page, /把 \{pendingCurrent\?\.series\.current\.displayNumber\} 的追蹤、Note、負責人與 SPEC 附件依位號與料號帶到/, "switching names everything it carries, like an upload");
  const banner = page.slice(page.indexOf('data-testid="material-historical-banner"'), page.indexOf("{remoteSyncFailed && ("));
  assert.match(banner, /setBomDiffRequest\(\{ token: Date\.now\(\), seriesId: activeVersionInfo\.series\.id,/, "the banner's 比對 opens that comparison, not the version list");
  assert.match(banner, />比對 \{activeVersionInfo\.series\.current\.displayNumber\}</);
});

test("storage keeps version metadata beside the other per-BOM preferences and loads old versions without touching the cache", () => {
  assert.match(storage, /const VERSION_KEY_PREFIX = "material-bom-version:";/);
  assert.match(storage, /BOM_PREFERENCE_KEY_PREFIXES = \[PREFERENCE_KEY_PREFIX, PAGE_TRACKER_KEY_PREFIX, TABLE_COLOR_THEME_KEY_PREFIX, PROJECT_KEY_PREFIX, ARCHIVE_KEY_PREFIX, VERSION_KEY_PREFIX\]/);
  assert.match(storage, /export async function loadBomWorkspaceRecords\(workspaceId: string\)/);
  const loader = storage.slice(storage.indexOf("export async function loadBomWorkspaceRecords("), storage.indexOf("export async function removeBomWorkspace("));
  assert.doesNotMatch(loader, /writeRenderCacheResult|patchCachedWorkspace/);
  assert.match(storage, /removeRemoteWorkspaceVersion\(id\),/);
  assert.match(storage, /\.range\(from, from \+ REMOTE_RECORD_FETCH_BATCH_SIZE - 1\);/, "obsolete-row detection pages past the PostgREST 1000-row cap");
});

test("2026-11-17 user pass: one place for each count, worded rare actions, phone cards and a way to fill in what did not carry over", () => {
  // Diff: the counts you can click live once, in the filter chips; screen readers still hear the outcome.
  assert.match(diffView, /<p role="status" data-testid=\{summary \? "bom-diff-summary" : undefined\} className="sr-only">/, "the live region exists from the start; the summary hook appears once the result is in");
  assert.doesNotMatch(diffView, /比對完成<\/span>/, "no separate 比對完成 badge on screen");
  assert.match(diffView, /個位號<\/span>/, "the result count says what it counts");
  assert.match(diffView, /<span className="text-xs text-muted-foreground">未變更<\/span>/, "unchanged rows are plain text, not two identical chips");
  assert.match(diffView, /欄位沒有變更；換掉的廠商列在廠商明細。/, "a vendor swap no longer says 沒有欄位變更 next to a 主料 chip");
  assert.match(diffView, /data-testid="bom-diff-cards"/, "phone shows the changes as cards");
  assert.match(diffView, /\{fill \? "到料號表補填" : "在料號表查看"\}/, "short labels: a group can hold dozens of reference designators");
  assert.match(center, /const canFillDiff = canLocateDiff && Boolean\(diffAfter\?\.isCurrent\) && canEdit;/, "補填 only where something can be filled in");
  assert.match(page, /if \(workspaceId !== activeBomId\) switchActiveBom\(workspaceId\);/, "a version still loading is waited for, not switched to again");
  assert.match(page, /restoredViewBomId !== pendingBomLocation\.workspaceId\) return;/, "the location waits for the saved view so restored filters cannot wipe it");
  assert.match(page, /if \(!pendingBomLocation \|\| !workspaceListSettled\) return;\n    const missing = !bomWorkspaces\.some\(\(workspace\) => workspace\.id === pendingBomLocation\.workspaceId\);\n    if \(activeBomId === pendingBomLocation\.workspaceId && !missing\) return;\n    setPendingBomLocation\(null\);/, "a waiting location is dropped once the list has loaded and another BOM is on screen");
  assert.match(page, /writeBomLocateLocation\(url, located\?\.returnDiff/, "the located part is in the URL (AGENTS rule 4)");
  for (const key of ["bomLocate", "bomLocateBom", "bomLocateBack"]) assert.ok(indexPage.includes(`"${key}",`), `${key} is dropped when leaving the module`);
  assert.match(center, /setDiffViewSeed\(\{ token: diffRequest\.token, lostOnly: Boolean\(diffRequest\.lostOnly\), view: diffRequest\.view \}\);/, "返回比對 restores the filters and open part");
  assert.match(page, /const pair = bomVersionComparePair\(activeVersionInfo\.series, activeVersionInfo\.version\);/, "the banner uses the same pair as the row's 比對");
  assert.match(page, /void syncWorkspaces\(\(typeof window !== "undefined" && readBomLocateLocation\(window\.location\.search\)\?\.workspaceId\) \|\| loadActiveBomId\(\)\);/, "a shared link opens the version it names, not the recipient's last BOM");
  assert.match(page, /if \(pendingBomLocationRef\.current \|\| bomTableLocationRef\.current\?\.returnDiff\) \{/, "following the navigation project never moves a link or a located comparison part off its version");
  assert.match(page, /title: "找不到連結裡的 BOM 版本"/, "a link to a deleted version says so");
  assert.match(diffView, /target\?\.scrollIntoView\(\{ block: "nearest" \}\);/, "返回比對 brings the open part into view");
  // Export stays out of the persistent filter bar (AGENTS rule 6).
  const filterBar = diffView.slice(diffView.indexOf('data-testid="bom-diff-filters"'), diffView.indexOf("{compact ? ("));
  assert.doesNotMatch(filterBar, /exportButton|匯出差異 Excel/);
  // Locate only when the new side is the version people edit or the one on screen; the page reopens the same comparison.
  assert.match(center, /const canLocateDiff = Boolean\(onLocateDiffEntry && diffAfter && \(diffAfter\.isCurrent \|\| diffAfter\.workspace\.id === activeBomId\)\);/);
  assert.match(center, /onLocate=\{canLocateDiff \? locateDiffEntry : undefined\}/);
  assert.match(page, /onLocateDiffEntry=\{locateBomDiffEntry\}/);
  assert.match(page, /if \(returnDiff\) setBomDiffRequest\(\{ token: Date\.now\(\), \.\.\.returnDiff \}\);/);
  assert.match(page, /\{locatedBomCandidate\.returnDiff \? "返回比對" : "返回 NV 比對"\}/);
  // Version rows: fixed slots, rare and destructive actions in a worded 更多 menu, phone cards.
  assert.match(center, /className="bom-version-slot"/);
  for (const item of ["頁數進度", "下載原檔", "編輯說明", "刪除版本"]) assert.ok(center.includes(`${item}</DropdownMenuItem>`) || center.includes(`"${item}"`), item);
  assert.match(center, /data-testid="bom-version-cards"/);
  assert.match(center, /\{tableOverflows && !compact && <span className="bom-version-scroll-hint">/, "the scroll hint only shows when the table really scrolls");
  assert.doesNotMatch(center, /無原檔<\/span>/, "a missing original file is said in the menu, not as a chip on every row");
  // Upload result: what changed, what carried, what to fix.
  assert.match(page, /已帶入舊版的追蹤、Note、負責人與 SPEC 附件/);
  assert.doesNotMatch(page, /新系列 \{newSeriesCount\} 個 · 新版本 \{newVersionCount\} 個/);
});
