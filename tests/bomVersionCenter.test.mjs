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
  assert.match(diffView, /隱藏未變更 \$\{unchangedCount\.toLocaleString\(\)\} 筆/, "the default hide-unchanged condition is a visible, removable chip");
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
  assert.match(center, /lg:grid-cols-\[300px_minmax\(0,1fr\)\]/);
  assert.match(center, /aria-label="搜尋 BOM 系列"/);
  for (const action of ["上傳新版本", "比對版本", "設為目前版本", "檢視", "編輯說明", "刪除系列", "返回清單", "回到清單"]) assert.ok(center.includes(action), action);
  assert.match(center, /BOM_SERIES_EMPTY_TEXT = "找不到符合條件的 BOM 系列"/);
  assert.match(center, /歷史版本只能檢視與比對；料件與追蹤只在目前版本維護/);
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
  assert.match(page, /title: "有追蹤紀錄沒有帶到新版本"/);
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
  assert.match(page, /把 \{pendingCurrent\?\.series\.current\.displayNumber\} 的追蹤紀錄依位號與料號帶到/);
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
