import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { exportFeedbackZip } from "../../src/components/comparison/feedback/export.ts";
import type { FeedbackReport } from "../../src/components/comparison/feedback/types.ts";
const owner = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const imageId = "33333333-3333-4333-8333-333333333333";
const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const report = (): FeedbackReport => ({ id, reporterId: owner, attachmentOwnerId: owner, reporterName: "QA reporter", reporterUsername: "=untrusted username", title: "=HYPERLINK(\"bad\")", description: "問題說明\n重現步驟", category: "bug", tab: "review", projectName: "QA", context: { browser: "test browser", width: 390, height: 844, revisionA: "A", revisionB: "B" }, screenshots: [{ id: imageId, name: "../../unsafe.png", path: `${owner}/${id}/${imageId}.png`, mime: "image/png", size: bytes.length }], isSubmitted: true, status: "in_progress", adminNote: "修正中", createdAt: "2026-10-13T00:00:00Z", submittedAt: "2026-10-13T00:00:00Z", updatedAt: "2026-10-13T01:00:00Z" });

test("ZIP includes every screenshot, full JSON, and a structured Excel with safe text and relative image links", async () => {
  const result = await exportFeedbackZip([report()], async () => new Blob([bytes], { type: "image/png" }), () => {}, undefined, new Date("2026-10-13T00:00:00Z"));
  assert.equal(result.reportCount, 1); assert.equal(result.imageCount, 1); assert.equal(result.name, "AutoCheck-feedback-202610130800.zip");
  const zip = await JSZip.loadAsync(result.bytes);
  const imagePath = `screenshots/${id}/${imageId}.png`;
  assert.ok(zip.file(imagePath)); assert.equal(zip.file("unsafe.png"), null);
  assert.deepEqual(new Uint8Array(await zip.file(imagePath)!.async("uint8array")), bytes);
  const manifest = JSON.parse(await zip.file("reports.json")!.async("string"));
  assert.equal(manifest.reports[0].screenshots[0].archivePath, imagePath);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await zip.file("AutoCheck-feedback.xlsx")!.async("uint8array"));
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ["問題清單", "截圖索引"]);
  const main = workbook.getWorksheet("問題清單")!;
  assert.equal(main.getCell("D2").value, report().title); assert.equal(main.getCell("D2").type, ExcelJS.ValueType.String);
  assert.equal(main.getCell("G2").value, report().reporterUsername); assert.equal(main.getCell("L2").value, "修正中");
  assert.match(String(main.getCell("M2").value), /08:00/); assert.ok(main.autoFilter); assert.equal(main.views[0].state, "frozen");
  const cell = workbook.getWorksheet("截圖索引")!.getCell("F2").value as { hyperlink: string };
  assert.equal(cell.hyperlink, imagePath);
  const excelZip = await JSZip.loadAsync(await zip.file("AutoCheck-feedback.xlsx")!.async("uint8array"));
  assert.doesNotMatch(await excelZip.file("xl/worksheets/sheet1.xml")!.async("string"), /<f[ >]/);
});

test("export aborts rather than silently omitting a missing or incomplete screenshot", async () => {
  await assert.rejects(exportFeedbackZip([report()], async () => new Blob(["x"]), () => {}), /下载|下載不完整/);
  await assert.rejects(exportFeedbackZip([report()], async () => { throw new Error("image missing"); }, () => {}), /image missing/);
});

test("exports use immutable snapshots and stop after identity or permission changes", async () => {
  const original = report(); let calls = 0;
  const result = await exportFeedbackZip([original], async () => { original.adminNote = "late mutation"; return new Blob([bytes]); }, () => { calls++; });
  const zip = await JSZip.loadAsync(result.bytes); const manifest = JSON.parse(await zip.file("reports.json")!.async("string"));
  assert.equal(manifest.reports[0].adminNote, "修正中"); assert.ok(calls > 3);
  let valid = true;
  await assert.rejects(exportFeedbackZip([report()], async () => { valid = false; return new Blob([bytes]); }, () => { if (!valid) throw new Error("scope changed"); }), /scope changed/);
});

test("drafts, invalid paths, and empty exports are rejected", async () => {
  await assert.rejects(exportFeedbackZip([], async () => new Blob([]), () => {}), /沒有可匯出/);
  await assert.rejects(exportFeedbackZip([{ ...report(), isSubmitted: false }], async () => new Blob([]), () => {}), /尚未送出/);
  const invalid = report(); invalid.screenshots[0].path = "someone-else/private.png";
  await assert.rejects(exportFeedbackZip([invalid], async () => new Blob(bytes), () => {}), /截圖資料不完整/);
});
