import assert from "node:assert/strict";
import test from "node:test";
import { diffBomRecords } from "../src/components/material-requests/bomDiff.ts";
import { BOM_DIFF_CE_HEADERS, BOM_DIFF_DETAIL_HEADERS, buildBomDiffFileName, buildBomDiffWorkbookRows, createBomDiffWorkbook } from "../src/components/material-requests/bomDiffExport.ts";

let counter = 0;
const row = (overrides: Record<string, unknown> = {}) => ({
  id: `s-${++counter}`, sectionName: "", assemblyName: "", level: 2, name: "CAP", qty: "1", refDes: "C1",
  manufacturerPartNumber: "MPN-A", manufacturerPartNumberAlt: "", manufacturer: "Vendor A", sourcingStatus: "Approved",
  refGroup: "C1", lv: "", remark: "", partNumber: "000-001", partName: "MLCC", partSpec: "0.1uF", schematicPart: "CAP",
  pcbFootprint: "C0402", phaseOutStatus: "ACTIVE", partUsageStatus: "", ...overrides,
}) as never;

const context = {
  seriesName: "Vera_CPU_Rack_CPU_Module",
  before: { title: "V1", sourceFile: "a.xlsx", uploadedAt: "2026/10/01 10:00", recordCount: 3 },
  after: { title: "V2 · EVT", sourceFile: "b.xlsx", uploadedAt: "2026/10/29 09:30", recordCount: 3 },
  exportedBy: "QA",
  exportedAt: "2026-10-29T01:02:03.000Z",
};

const result = diffBomRecords(
  [row({ refDes: "C1", qty: "1" }), row({ refDes: "R1", name: "RES", partNumber: "000-010", manufacturerPartNumber: "R-A" }), row({ refDes: "U1", name: "IC", partNumber: "000-020" })],
  [row({ refDes: "C1", qty: "2" }), row({ refDes: "R1", name: "RES", partNumber: "000-010", manufacturerPartNumber: "R-A" }), row({ refDes: "R1", name: "RES", partNumber: "000-011", manufacturerPartNumber: "R-B", manufacturer: "Vendor B" }), row({ refDes: "D1", name: "LED", partNumber: "000-030" })],
);

test("workbook rows: one detail row per field change or whole line, CE columns for added and removed lines", () => {
  const rows = buildBomDiffWorkbookRows(result, context);
  assert.equal(rows.summary[0][1], "Vera_CPU_Rack_CPU_Module");
  assert.match(rows.summary.find(([label]) => label === "新增／移除／變更／未變更")![1], /^1 \/ 1 \/ 2 \/ 0$/);
  const byRef = (ref: string) => rows.details.filter((line) => line[0] === ref);
  assert.deepEqual(byRef("C1").map((line) => [line[4], line[5], line[6]]), [["Qty", "1", "2"]]);
  assert.deepEqual(byRef("D1").map((line) => line[4]), ["整列"]);
  assert.deepEqual(byRef("U1").map((line) => [line[4], line[3]]), [["整列", "影響生產"]]);
  assert.deepEqual(byRef("R1").map((line) => line[4]), ["廠商明細新增"]);
  assert.equal(rows.added.length, 2, "D1 and the new R1 vendor line");
  assert.equal(rows.removed.length, 1);
  assert.equal(rows.added[0].length, BOM_DIFF_CE_HEADERS.length);
  assert.equal(rows.added[0][0], 2, "Level is always 2 for a part line");
});

test("visible entries limit the detail rows while the summary keeps whole-comparison counts", () => {
  const visible = result.entries.filter((entry) => entry.displayRef === "C1");
  const rows = buildBomDiffWorkbookRows(result, { ...context, visibleEntries: visible });
  assert.equal(rows.details.length, 1);
  assert.match(rows.summary.find(([label]) => label === "本檔列出的群組")![1], /依目前篩選/);
  assert.match(rows.summary.find(([label]) => label === "新增／移除／變更／未變更")![1], /^1 \/ 1 \/ 2 \/ 0$/);
});

test("the ExcelJS workbook has the four sheets with frozen headers and the detail autofilter", async () => {
  const workbook = await createBomDiffWorkbook(result, context);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["摘要", "差異明細", "新增料件", "移除料件"]);
  const detail = workbook.getWorksheet("差異明細")!;
  assert.deepEqual((detail.getRow(1).values as unknown[]).slice(1), BOM_DIFF_DETAIL_HEADERS);
  assert.equal(detail.rowCount, 1 + buildBomDiffWorkbookRows(result, context).details.length);
  assert.ok(detail.autoFilter);
  assert.deepEqual((workbook.getWorksheet("新增料件")!.getRow(1).values as unknown[]).slice(1), BOM_DIFF_CE_HEADERS);
  const buffer = await workbook.xlsx.writeBuffer();
  assert.ok(buffer.byteLength > 2000);
});

test("file names are safe and carry both version titles", () => {
  assert.equal(buildBomDiffFileName(context), "BOM差異_Vera_CPU_Rack_CPU_Module_V1_vs_V2_·_EVT_202610290102.xlsx");
  assert.doesNotMatch(buildBomDiffFileName({ ...context, seriesName: 'a/b:c*d?"e<f>g|h' }), /[\\/:*?"<>|]/);
});
