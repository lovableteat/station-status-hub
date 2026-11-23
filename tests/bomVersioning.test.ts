import assert from "node:assert/strict";
import test from "node:test";
import {
  BOM_DIFF_QUERY_KEYS, bomSeriesStem, bomVersionComparePair, buildBomSeriesList, createBomVersionWorkspaceId, deriveLegacyBomVersion, findBomSeriesByWorkspace,
  inferBomSeriesForFile, nextBomCurrentStamp, nextBomVersionNumber, normalizeBomVersion, planBomCurrentVersionWrites, readBomDiffLocation, readBomLocateLocation, resolveCurrentBomVersion, withStoredBomVersions, writeBomLocateLocation,
} from "../src/components/material-requests/bomVersioning.ts";

const workspace = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `${id}.xlsx`,
  payload: { sourceFile: `${id}.xlsx`, sheetName: "Sheet1", generatedAt: "2026-10-01T00:00:00.000Z", recordCount: 10, records: [] },
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
}) as never;

const version = (overrides: Record<string, unknown> = {}) => ({
  seriesId: "series:s1", seriesName: "Main board", versionNumber: 1, label: "", note: "", uploadedAt: "2026-10-01T00:00:00.000Z", uploadedBy: "QA", isCurrent: false, currentChangedAt: "2026-10-01T00:00:00.000Z", ...overrides,
});

test("legacy BOMs without metadata become one-version current series named after themselves", () => {
  const derived = deriveLegacyBomVersion(workspace("bom:old"));
  assert.equal(derived.seriesId, "bom:old");
  assert.equal(derived.versionNumber, 1);
  assert.equal(derived.isCurrent, true);
  const series = buildBomSeriesList([workspace("bom:old")]);
  assert.equal(series.length, 1);
  assert.equal(series[0].name, "bom:old.xlsx");
  assert.equal(series[0].current.stored, false);
  assert.equal(series[0].current.displayNumber, "V1");
});

test("stored versions group by series, order by number and resolve the current one from the newest flag", () => {
  const list = buildBomSeriesList([
    workspace("bom:b:v2", { version: version({ versionNumber: 2, isCurrent: true, currentChangedAt: "2026-10-05T00:00:00.000Z" }), updatedAt: "2026-10-05T00:00:00.000Z" }),
    workspace("bom:b:v1", { version: version({ versionNumber: 1, isCurrent: true, currentChangedAt: "2026-10-02T00:00:00.000Z" }) }),
    workspace("bom:b:v3", { version: version({ versionNumber: 3, isCurrent: false, uploadedAt: "2026-10-09T00:00:00.000Z" }), updatedAt: "2026-10-09T00:00:00.000Z" }),
    workspace("bom:other"),
  ]);
  assert.deepEqual(list.map((series) => series.id), ["series:s1", "bom:other"]);
  const main = list[0];
  assert.deepEqual(main.versions.map((item) => item.displayNumber), ["V1", "V2", "V3"]);
  assert.equal(main.current.workspace.id, "bom:b:v2", "newest isCurrent flag wins over a later upload");
  assert.equal(main.versions.filter((item) => item.isCurrent).length, 1);
  assert.equal(findBomSeriesByWorkspace(list, "bom:b:v3")?.version.displayNumber, "V3");
  assert.equal(nextBomVersionNumber(main), 4);
});

test("without any current flag the highest version is current, and duplicate numbers are disambiguated", () => {
  const list = buildBomSeriesList([
    workspace("bom:a", { version: version({ versionNumber: 2, uploadedAt: "2026-10-03T00:00:00.000Z" }) }),
    workspace("bom:b", { version: version({ versionNumber: 2, uploadedAt: "2026-10-04T00:00:00.000Z" }) }),
    workspace("bom:c", { version: version({ versionNumber: 1 }) }),
  ]);
  assert.deepEqual(list[0].versions.map((item) => item.displayNumber), ["V1", "V2", "V2 (2)"]);
  assert.equal(list[0].current.workspace.id, "bom:b");
  assert.equal(resolveCurrentBomVersion(list[0].versions).workspace.id, "bom:b");
});

test("version metadata is validated and clamped when read back", () => {
  assert.equal(normalizeBomVersion(null, "x"), undefined);
  assert.equal(normalizeBomVersion({ seriesId: "", versionNumber: 1 }, "x"), undefined);
  assert.equal(normalizeBomVersion({ seriesId: "s", versionNumber: 0 }, "x"), undefined);
  const parsed = normalizeBomVersion({ seriesId: " series:1 ", versionNumber: "3", label: "a".repeat(80), note: "n", isCurrent: "yes", source: { path: "p/x.xlsx" }, carry: { matched: "4", orphaned: -2 } }, "2026-10-29T00:00:00.000Z")!;
  assert.equal(parsed.seriesId, "series:1");
  assert.equal(parsed.versionNumber, 3);
  assert.equal(parsed.label.length, 60);
  assert.equal(parsed.isCurrent, false);
  assert.equal(parsed.uploadedAt, "2026-10-29T00:00:00.000Z");
  assert.deepEqual(parsed.source, { name: "BOM.xlsx", path: "p/x.xlsx", size: 0, mimeType: "application/octet-stream" });
  assert.deepEqual(parsed.carry, { matched: 4, orphaned: 0, manual: 0 });
  assert.deepEqual(normalizeBomVersion({ seriesId: "s", versionNumber: 2, carry: { matched: 9, tracked: "3", orphaned: 1 } }, "x")!.carry, { matched: 9, tracked: 3, orphaned: 1, manual: 0 });
});

test("an open comparison round-trips through the URL and ignores incomplete links", () => {
  assert.deepEqual(readBomDiffLocation("?module=material&bomDiff=series%3Aqa&bomBefore=bom%3Av2&bomAfter=bom%3Av3&bomDiffLost=1"), { seriesId: "series:qa", before: "bom:v2", after: "bom:v3", lostOnly: true });
  assert.deepEqual(readBomDiffLocation("?bomDiff=s&bomBefore=a&bomAfter=b"), { seriesId: "s", before: "a", after: "b", lostOnly: false });
  for (const search of ["", "?bomDiff=s&bomBefore=a", "?bomBefore=a&bomAfter=b", "?bomDiff=s&bomBefore=a&bomAfter=a"]) assert.equal(readBomDiffLocation(search), null, search);
  assert.deepEqual([...BOM_DIFF_QUERY_KEYS], ["bomDiff", "bomBefore", "bomAfter", "bomDiffLost"]);
});

test("a 比對 click always puts the older version on the 舊版 side", () => {
  const list = buildBomSeriesList([
    workspace("bom:s:v1", { version: version({ versionNumber: 1 }) }),
    workspace("bom:s:v2", { version: version({ versionNumber: 2, isCurrent: true, currentChangedAt: "2026-10-09T00:00:00.000Z" }) }),
    workspace("bom:s:v3", { version: version({ versionNumber: 3 }) }),
  ]);
  const series = list[0];
  const [v1, v2, v3] = series.versions;
  assert.equal(series.current, v2, "V2 was made current again after V3 was uploaded");
  const ids = (pair: ReturnType<typeof bomVersionComparePair>) => pair && [pair.before.displayNumber, pair.after.displayNumber];
  assert.deepEqual(ids(bomVersionComparePair(series)), ["V1", "V2"], "the current version compares with the one right before it");
  assert.deepEqual(ids(bomVersionComparePair(series, v1)), ["V1", "V2"]);
  assert.deepEqual(ids(bomVersionComparePair(series, v3)), ["V2", "V3"], "a newer non-current version sits on the 新版 side");
  const oldestCurrent = buildBomSeriesList([
    workspace("bom:t:v1", { version: version({ seriesId: "series:t", versionNumber: 1, isCurrent: true, currentChangedAt: "2026-10-09T00:00:00.000Z" }) }),
    workspace("bom:t:v2", { version: version({ seriesId: "series:t", versionNumber: 2 }) }),
  ])[0];
  assert.deepEqual(ids(bomVersionComparePair(oldestCurrent)), ["V1", "V2"], "the oldest current version compares with the next one");
  assert.equal(bomVersionComparePair(buildBomSeriesList([workspace("bom:solo")])[0]), null);
  assert.ok(v3);
});

test("file stems ignore version and date suffixes and keep CJK names apart", () => {
  assert.equal(bomSeriesStem("Vera2_C2_carrier_Bom_20260706.xlsx"), "vera2-c2-carrier-bom");
  assert.equal(bomSeriesStem("Vera_CPU_Rack_CPU_Module_v3.xlsx"), "vera-cpu-rack-cpu-module");
  assert.equal(bomSeriesStem("Vera_CPU_Rack_CPU_Module (2).XLSX"), "vera-cpu-rack-cpu-module");
  assert.equal(bomSeriesStem("Vera CPU TPM_交付格式 rev B.xlsx"), "vera-cpu-tpm-交付格式");
  assert.notEqual(bomSeriesStem("主板.xlsx"), bomSeriesStem("電源板.xlsx"));
});

test("a file is suggested for the series that shares its source name or stem, never an archived one", () => {
  const list = buildBomSeriesList([
    workspace("bom:cpu", { name: "Vera_CPU_Rack_CPU_Module.xlsx", payload: { sourceFile: "Vera_CPU_Rack_CPU_Module.xlsx", sheetName: "S", generatedAt: "2026-10-01T00:00:00.000Z", recordCount: 1, records: [] } }),
    workspace("bom:tpm", { name: "Vera CPU TPM_交付格式.xlsx", archive: { archivedAt: "2026-10-02T00:00:00.000Z", archivedBy: "QA" } }),
  ]);
  assert.equal(inferBomSeriesForFile("vera_cpu_rack_cpu_module.xlsx", list)?.id, "bom:cpu");
  assert.equal(inferBomSeriesForFile("Vera_CPU_Rack_CPU_Module_v2.xlsx", list)?.id, "bom:cpu");
  assert.equal(inferBomSeriesForFile("Vera CPU TPM_交付格式.xlsx", list), null);
  assert.equal(inferBomSeriesForFile("Something_else.xlsx", list), null);
});

test("version workspace ids carry the series slug and version number plus a random token", () => {
  const id = createBomVersionWorkspaceId("Vera_CPU_Rack_CPU_Module.xlsx", 4, "abc123");
  assert.equal(id, "bom:vera-cpu-rack-cpu-module-xlsx:v4:abc123");
  assert.match(createBomVersionWorkspaceId("", 1), /^bom:bom:v1:[a-z0-9]{6}$/);
});

test("a part located from a version comparison round-trips through the URL", () => {
  const url = new URL("https://example.test/?workspace=material-requests&q=keep");
  writeBomLocateLocation(url, { recordId: "Sheet1-12", workspaceId: "bom-v3", returnTo: { seriesId: "series:qa", before: "bom-v2", after: "bom-v3", lostOnly: true } });
  assert.deepEqual(readBomLocateLocation(url.search), { recordId: "Sheet1-12", workspaceId: "bom-v3", returnTo: { seriesId: "series:qa", before: "bom-v2", after: "bom-v3", lostOnly: true } });
  assert.equal(url.searchParams.get("q"), "keep");
  writeBomLocateLocation(url, null);
  assert.equal(readBomLocateLocation(url.search), null);
  assert.equal([...url.searchParams.keys()].some((key) => key.startsWith("bomLocate")), false);
  assert.equal(readBomLocateLocation("?bomLocate=r1&bomLocateBom=w1"), null, "no comparison to go back to");
  assert.equal(readBomLocateLocation("?bomLocate=r1&bomLocateBom=w1&bomLocateBack=%5B%22s%22%2C%22a%22%2C%22a%22%5D"), null, "the same version on both sides");
  assert.equal(readBomLocateLocation("?bomLocate=r1&bomLocateBom=w1&bomLocateBack=not-json"), null);
});

// 2026-11-23 「現在新版跟舊版切換時不同電腦之間常錯亂」: a switch cleared only the version the page believed current and dated
// itself with the computer's own clock, so a colleague's switch the page had not seen stayed flagged and could win.
test("設為目前版本 clears every version flagged where it is stored and is dated after every stored switch", () => {
  const series = { id: "series:s1", name: "E1.s" };
  // Stored now: computer A (clock 10 minutes fast) made V15 current at 10:10 by its clock.
  const stored = [
    { workspaceId: "bom:v15", version: version({ versionNumber: 15, isCurrent: true, currentChangedAt: "2026-11-23T10:10:00.000Z" }), stored: true },
    { workspaceId: "bom:v16", version: version({ versionNumber: 16, isCurrent: false, currentChangedAt: "2026-11-23T10:10:00.000Z", uploadedAt: "2026-11-23T09:00:00.000Z" }), stored: true },
    { workspaceId: "bom:v14", version: version({ versionNumber: 14, isCurrent: false }), stored: true },
  ];
  // Computer B (right clock, 10:03) never saw A's switch: it still believes V16 is current and now switches to V14.
  const staleView = stored.map((item) => item.workspaceId === "bom:v16" ? { ...item, version: { ...item.version, isCurrent: true } } : item.workspaceId === "bom:v15" ? { ...item, version: { ...item.version, isCurrent: false } } : item);
  const oldLoop = staleView.filter((item) => item.workspaceId === "bom:v14" || item.version.isCurrent).map((item) => item.workspaceId);
  assert.deepEqual(oldLoop.sort(), ["bom:v14", "bom:v16"], "the old rule never touched V15");
  const afterOldRule = buildBomSeriesList([
    workspace("bom:v15", { version: stored[0].version }),
    workspace("bom:v16", { version: { ...stored[1].version, isCurrent: false, currentChangedAt: "2026-11-23T10:03:00.000Z" } }),
    workspace("bom:v14", { version: { ...stored[2].version, isCurrent: true, currentChangedAt: "2026-11-23T10:03:00.000Z" } }),
  ])[0];
  assert.equal(afterOldRule.current.workspace.id, "bom:v15", "two flags, and A's fast clock made its older switch win: B's switch to V14 was lost");

  // The new rule works from what is stored and dates the switch after it.
  const plan = planBomCurrentVersionWrites(stored, "bom:v14", series, Date.parse("2026-11-23T10:03:00.000Z"));
  assert.deepEqual(plan.writes.map((write) => [write.workspaceId, write.version.isCurrent]).sort(), [["bom:v14", true], ["bom:v15", false]]);
  assert.ok(Date.parse(plan.stamp) > Date.parse("2026-11-23T10:10:00.000Z"), "later than every stored switch, whatever this computer's clock says");
  const after = buildBomSeriesList(stored.map((item) => workspace(item.workspaceId, { version: plan.writes.find((write) => write.workspaceId === item.workspaceId)?.version ?? item.version })))[0];
  assert.equal(after.current.workspace.id, "bom:v14");
  assert.equal(after.versions.filter((item) => item.version.isCurrent).length, 1);
  // A version never stored (a legacy BOM joining the series) is written too, as not current.
  const legacy = planBomCurrentVersionWrites([...stored, { workspaceId: "bom:old", version: version({ versionNumber: 1 }), stored: false }], "bom:v14", series, 0);
  assert.ok(legacy.writes.some((write) => write.workspaceId === "bom:old" && write.version.isCurrent === false));
  // With a right clock the stamp is simply now.
  assert.equal(nextBomCurrentStamp([version({ currentChangedAt: "2026-11-01T00:00:00.000Z" })], Date.parse("2026-11-23T00:00:00.000Z")), "2026-11-23T00:00:00.000Z");
});

test("the series is rebuilt from the version metadata as stored now before a switch or an upload", () => {
  const list = buildBomSeriesList([
    workspace("bom:v1", { version: version({ versionNumber: 1, isCurrent: false }) }),
    workspace("bom:v2", { version: version({ versionNumber: 2, isCurrent: true, currentChangedAt: "2026-11-02T00:00:00.000Z" }) }),
  ]);
  assert.equal(list[0].current.workspace.id, "bom:v2");
  // A colleague switched back to V1 since this page loaded.
  const stored = new Map([
    ["bom:v1", version({ versionNumber: 1, isCurrent: true, currentChangedAt: "2026-11-03T00:00:00.000Z" })],
    ["bom:v2", version({ versionNumber: 2, isCurrent: false, currentChangedAt: "2026-11-03T00:00:00.000Z" })],
  ]);
  const fresh = withStoredBomVersions(list[0], stored);
  assert.equal(fresh.current.workspace.id, "bom:v1");
  assert.equal(fresh.id, list[0].id);
  assert.equal(nextBomVersionNumber(fresh), 3);
});
