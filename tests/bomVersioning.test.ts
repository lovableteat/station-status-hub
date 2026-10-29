import assert from "node:assert/strict";
import test from "node:test";
import {
  bomSeriesStem, buildBomSeriesList, createBomVersionWorkspaceId, deriveLegacyBomVersion, findBomSeriesByWorkspace,
  inferBomSeriesForFile, nextBomVersionNumber, normalizeBomVersion, resolveCurrentBomVersion,
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
