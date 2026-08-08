import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";
import * as XLSX from "xlsx";

const workbookModule = await import("../../src/components/test-plan/spreadsheetWorkbook.ts")
  .catch(() => null);

test("formatted insertion shifts styled merges while copying only adjacent styles into blank cells", () => {
  assert.ok(workbookModule, "spreadsheet workbook mutations must be available");

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Formatted");
  worksheet.getCell("A1").value = "above";
  worksheet.getCell("B1").value = "above-right";
  worksheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF00FF00" } };
  worksheet.getCell("B1").font = { bold: true, color: { argb: "FF0000FF" } };
  worksheet.getCell("A2").value = "middle";
  worksheet.getCell("A3").value = { formula: "1+2", result: 3 };
  worksheet.getCell("A3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF0000" } };
  worksheet.getCell("A3").font = { italic: true, color: { argb: "FFFFFFFF" } };
  worksheet.mergeCells("A3:B3");

  const inserted = workbookModule.insertFormattedWorksheet(
    worksheet,
    { anchor: { row: 1, column: 1 }, focus: { row: 1, column: 1 } },
    "row",
    { rows: 4, columns: 2 },
  );

  assert.deepEqual(inserted, { anchor: { row: 2, column: 1 }, focus: { row: 2, column: 1 } });
  assert.equal(worksheet.getCell("A2").value, null);
  assert.equal(worksheet.getCell("B2").value, null);
  assert.equal(worksheet.getCell("A2").fill.fgColor?.argb, "FF00FF00");
  assert.equal(worksheet.getCell("B2").font.color?.argb, "FF0000FF");
  assert.equal(worksheet.getCell("B2").font.bold, true);
  assert.deepEqual(worksheet.model.merges, ["A4:B4"]);
  assert.deepEqual(worksheet.getCell("A4").value, { formula: "1+2", result: 3 });
  assert.equal(worksheet.getCell("A4").fill.fgColor?.argb, "FFFF0000");
  assert.equal(worksheet.getCell("A4").font.italic, true);
});

test("legacy row insertion creates blank style-only cells and shifts formulas and merges", () => {
  assert.ok(workbookModule, "spreadsheet workbook mutations must be available");

  const worksheet = XLSX.utils.aoa_to_sheet([["above", "right"], ["middle", "middle-right"], [3, 4]]);
  worksheet.A1.s = { fill: { fgColor: { rgb: "00FF00" } } };
  worksheet.B1.s = { font: { bold: true } };
  worksheet.A3 = { t: "n", f: "SUM(A1:A1)", v: 1, s: { fill: { fgColor: { rgb: "FF0000" } } } };
  worksheet["!rows"] = [{ hpt: 24 }];
  worksheet["!merges"] = [{ s: { r: 2, c: 0 }, e: { r: 2, c: 1 } }];

  const inserted = workbookModule.insertLegacyWorksheet(
    XLSX,
    worksheet,
    { anchor: { row: 1, column: 1 }, focus: { row: 1, column: 1 } },
    "row",
    { rows: 4, columns: 2 },
  );

  assert.deepEqual(inserted, { anchor: { row: 2, column: 1 }, focus: { row: 2, column: 1 } });
  assert.deepEqual(worksheet.A2, { t: "z", s: worksheet.A1.s });
  assert.deepEqual(worksheet.B2, { t: "z", s: worksheet.B1.s });
  assert.equal(worksheet.A4.f, "SUM(A1:A1)");
  assert.equal(worksheet.A4.v, 1);
  assert.deepEqual(worksheet["!merges"], [{ s: { r: 3, c: 0 }, e: { r: 3, c: 1 } }]);
  assert.equal(worksheet["!rows"]?.[1]?.hpt, 24);
});

test("legacy column insertion creates blank style-only cells and shifts values and merges", () => {
  assert.ok(workbookModule, "spreadsheet workbook mutations must be available");

  const worksheet = XLSX.utils.aoa_to_sheet([["left", "middle", 3], ["below", "middle-below", 4]]);
  worksheet.A1.s = { fill: { fgColor: { rgb: "00FF00" } } };
  worksheet.A2.s = { font: { italic: true } };
  worksheet.C1 = { t: "n", f: "SUM(A1:A1)", v: 1, s: { fill: { fgColor: { rgb: "FF0000" } } } };
  worksheet["!cols"] = [{ wch: 18 }];
  worksheet["!merges"] = [{ s: { r: 0, c: 2 }, e: { r: 1, c: 2 } }];

  const inserted = workbookModule.insertLegacyWorksheet(
    XLSX,
    worksheet,
    { anchor: { row: 1, column: 1 }, focus: { row: 1, column: 1 } },
    "column",
    { rows: 2, columns: 4 },
  );

  assert.deepEqual(inserted, { anchor: { row: 1, column: 2 }, focus: { row: 1, column: 2 } });
  assert.deepEqual(worksheet.B1, { t: "z", s: worksheet.A1.s });
  assert.deepEqual(worksheet.B2, { t: "z", s: worksheet.A2.s });
  assert.equal(worksheet.D1.f, "SUM(A1:A1)");
  assert.equal(worksheet.D1.v, 1);
  assert.deepEqual(worksheet["!merges"], [{ s: { r: 0, c: 3 }, e: { r: 1, c: 3 } }]);
  assert.equal(worksheet["!cols"]?.[1]?.wch, 18);
});
