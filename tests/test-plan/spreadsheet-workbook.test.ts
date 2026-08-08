import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";
import * as XLSX from "xlsx";

const workbookModule = await import("../../src/components/test-plan/spreadsheetWorkbook.ts")
  .catch(() => null);

test("translates row references without touching strings, structured refs, or other sheets", () => {
  assert.ok(workbookModule?.translateSpreadsheetFormula, "formula translation must be available");

  assert.equal(
    workbookModule.translateSpreadsheetFormula(
      'SUM(A2:$B$3,C$4,$D5,"A3",Table1[A3],\'Other\'!A3,\'Data Sheet\'!E3)',
      "row",
      3,
      "Data Sheet",
      "Data Sheet",
    ),
    'SUM(A2:$B$4,C$5,$D6,"A3",Table1[A3],\'Other\'!A3,\'Data Sheet\'!E4)',
  );
  assert.equal(
    workbookModule.translateSpreadsheetFormula(
      "A3+'Data Sheet'!$B$3+Other!C3",
      "row",
      3,
      "Calc",
      "Data Sheet",
    ),
    "A3+'Data Sheet'!$B$4+Other!C3",
  );
  assert.equal(
    workbookModule.translateSpreadsheetFormula(
      "LOG10(A3)+T3[A3]+A3",
      "row",
      3,
      "Data Sheet",
      "Data Sheet",
    ),
    "LOG10(A4)+T3[A3]+A4",
  );
});

test("translates column references including quoted target sheet names", () => {
  assert.ok(workbookModule?.translateSpreadsheetFormula, "formula translation must be available");

  assert.equal(
    workbookModule.translateSpreadsheetFormula(
      'A1:$B$2+C3+"B2"+Table1[B2]+\'O\'\'Brien\'!D4',
      "column",
      2,
      "O'Brien",
      "O'Brien",
    ),
    'A1:$C$2+D3+"B2"+Table1[B2]+\'O\'\'Brien\'!E4',
  );
  assert.equal(
    workbookModule.translateSpreadsheetFormula(
      "B2+'O''Brien'!$B$2+Other!B2",
      "column",
      2,
      "Calc",
      "O'Brien",
    ),
    "B2+'O''Brien'!$C$2+Other!B2",
  );
});

test("classifies quoted and unquoted Unicode sheet qualifiers", () => {
  assert.ok(workbookModule?.translateSpreadsheetFormula, "formula translation must be available");

  assert.equal(
    workbookModule.translateSpreadsheetFormula("工作表2!A3", "row", 3, "工作表1", "工作表1"),
    "工作表2!A3",
  );
  assert.equal(
    workbookModule.translateSpreadsheetFormula("工作表1!A3", "row", 3, "工作表2", "工作表1"),
    "工作表1!A4",
  );
  assert.equal(
    workbookModule.translateSpreadsheetFormula("'工作表 2'!A3", "row", 3, "工作表 1", "工作表 1"),
    "'工作表 2'!A3",
  );
  assert.equal(
    workbookModule.translateSpreadsheetFormula("'工作表 1'!A3", "row", 3, "工作表 2", "工作表 1"),
    "'工作表 1'!A4",
  );
});

test("leaves external-workbook and 3D references byte-for-byte unchanged", () => {
  assert.ok(workbookModule?.translateSpreadsheetFormula, "formula translation must be available");

  const references = [
    { formula: "[Other.xlsx]工作表1!A3", target: "工作表1" },
    { formula: "'[Other.xlsx]工作表 1'!A3", target: "工作表 1" },
    { formula: "Sheet1:Sheet3!A3", target: "Sheet3" },
    { formula: "'Sheet 1':'Sheet 3'!A3", target: "Sheet 3" },
  ];
  references.forEach(({ formula, target }) => {
    assert.equal(
      workbookModule.translateSpreadsheetFormula(formula, "row", 3, target, target),
      formula,
    );
  });
});

test("translates whole-row ranges for the target sheet only", () => {
  assert.ok(workbookModule?.translateSpreadsheetFormula, "formula translation must be available");

  assert.equal(
    workbookModule.translateSpreadsheetFormula(
      'SUM(3:5,2:5,$3:$5,"3:5",Table1[3:5],工作表2!3:5,工作表1!3:5)',
      "row",
      3,
      "工作表1",
      "工作表1",
    ),
    'SUM(4:6,2:6,$4:$6,"3:5",Table1[3:5],工作表2!3:5,工作表1!4:6)',
  );
});

test("translates whole-column ranges for the target sheet only", () => {
  assert.ok(workbookModule?.translateSpreadsheetFormula, "formula translation must be available");

  assert.equal(
    workbookModule.translateSpreadsheetFormula(
      'SUM(C:E,B:E,$C:$E,"C:E",Table1[C:E],工作表2!C:E,工作表1!C:E)',
      "column",
      3,
      "工作表1",
      "工作表1",
    ),
    'SUM(D:F,B:F,$D:$F,"C:E",Table1[C:E],工作表2!C:E,工作表1!D:F)',
  );
});

test("formatted row insertion translates workbook formulas and shared masters through write/read", async () => {
  assert.ok(workbookModule, "spreadsheet workbook mutations must be available");

  const workbook = new ExcelJS.Workbook();
  const target = workbook.addWorksheet("Target Sheet");
  const calc = workbook.addWorksheet("Calc");
  workbook.addWorksheet("Other");
  target.getCell("A1").value = 1;
  target.getCell("A2").value = 2;
  target.getCell("A3").value = 3;
  target.getCell("B1").value = { formula: "SUM(A1:A3)", result: 6 };
  target.getCell("B3").value = { formula: "A3+$A$3", result: 6 };
  target.getCell("C3").value = {
    formula: "A3+1",
    result: 4,
    shareType: "shared",
    ref: "C3:D3",
  };
  target.getCell("D3").value = { sharedFormula: "C3", result: 4 };
  calc.getCell("A1").value = { formula: "'Target Sheet'!A3+1", result: 4 };
  calc.getCell("A2").value = { formula: "A3+'Other'!A3", result: 7 };

  workbookModule.insertFormattedWorksheet(
    target,
    { anchor: { row: 1, column: 1 }, focus: { row: 1, column: 1 } },
    "row",
    { rows: 4, columns: 4 },
  );

  assert.deepEqual(target.getCell("B1").value, { formula: "SUM(A1:A4)", result: 6 });
  assert.deepEqual(target.getCell("B4").value, { formula: "A4+$A$4", result: 6 });
  assert.deepEqual(target.getCell("C4").value, {
    formula: "A4+1",
    result: 4,
    shareType: "shared",
    ref: "C4:D4",
  });
  assert.deepEqual(target.getCell("D4").value, { sharedFormula: "C4", result: 4 });
  assert.deepEqual(calc.getCell("A1").value, { formula: "'Target Sheet'!A4+1", result: 4 });
  assert.deepEqual(calc.getCell("A2").value, { formula: "A3+'Other'!A3", result: 7 });

  const output = await workbook.xlsx.writeBuffer();
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(output);
  assert.equal(reloaded.getWorksheet("Target Sheet")?.getCell("B1").formula, "SUM(A1:A4)");
  assert.equal(reloaded.getWorksheet("Target Sheet")?.getCell("C4").formula, "A4+1");
  assert.equal(
    (reloaded.getWorksheet("Target Sheet")?.getCell("D4").value as { sharedFormula?: string }).sharedFormula,
    "C4",
  );
  assert.equal(reloaded.getWorksheet("Calc")?.getCell("A1").formula, "'Target Sheet'!A4+1");
});

test("formatted column insertion translates stationary, moved, and cross-sheet formulas", async () => {
  assert.ok(workbookModule, "spreadsheet workbook mutations must be available");

  const workbook = new ExcelJS.Workbook();
  const target = workbook.addWorksheet("O'Brien");
  const calc = workbook.addWorksheet("Calc");
  target.getCell("A1").value = 1;
  target.getCell("B1").value = 2;
  target.getCell("C1").value = 3;
  target.getCell("A2").value = { formula: "C1", result: 3 };
  target.getCell("D1").value = { formula: "SUM(A1:C1)+$C$1", result: 9 };
  target.getCell("C3").value = {
    formula: "C1+1",
    result: 4,
    shareType: "shared",
    ref: "C3:C4",
  };
  target.getCell("C4").value = { sharedFormula: "C3", result: 4 };
  calc.getCell("A1").value = { formula: "'O''Brien'!C1", result: 3 };
  calc.getCell("A2").value = { formula: "C1", result: 7 };

  workbookModule.insertFormattedWorksheet(
    target,
    { anchor: { row: 1, column: 1 }, focus: { row: 1, column: 1 } },
    "column",
    { rows: 4, columns: 5 },
  );

  assert.deepEqual(target.getCell("A2").value, { formula: "D1", result: 3 });
  assert.deepEqual(target.getCell("E1").value, { formula: "SUM(A1:D1)+$D$1", result: 9 });
  assert.deepEqual(target.getCell("D3").value, {
    formula: "D1+1",
    result: 4,
    shareType: "shared",
    ref: "D3:D4",
  });
  assert.deepEqual(target.getCell("D4").value, { sharedFormula: "D3", result: 4 });
  assert.deepEqual(calc.getCell("A1").value, { formula: "'O''Brien'!D1", result: 3 });
  assert.deepEqual(calc.getCell("A2").value, { formula: "C1", result: 7 });

  const output = await workbook.xlsx.writeBuffer();
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(output);
  assert.equal(reloaded.getWorksheet("O'Brien")?.getCell("E1").formula, "SUM(A1:D1)+$D$1");
  assert.equal(
    (reloaded.getWorksheet("O'Brien")?.getCell("D4").value as { sharedFormula?: string }).sharedFormula,
    "D3",
  );
  assert.equal(reloaded.getWorksheet("Calc")?.getCell("A1").formula, "'O''Brien'!D1");
});

test("formatted insertion translates a merged master formula exactly once", () => {
  assert.ok(workbookModule, "spreadsheet workbook mutations must be available");

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Merged Formula");
  worksheet.getCell("A1").value = { formula: "SUM(A3:A3)", result: 3 };
  worksheet.mergeCells("A1:B1");
  worksheet.getCell("A3").value = 3;

  workbookModule.insertFormattedWorksheet(
    worksheet,
    { anchor: { row: 1, column: 1 }, focus: { row: 1, column: 1 } },
    "row",
    { rows: 4, columns: 2 },
  );

  assert.deepEqual(worksheet.getCell("A1").value, { formula: "SUM(A4:A4)", result: 3 });
});

test("legacy row insertion translates all workbook formulas through write/read", () => {
  assert.ok(workbookModule, "spreadsheet workbook mutations must be available");

  const target = XLSX.utils.aoa_to_sheet([[1, null], [2, null], [3, null]]);
  target.B1 = { t: "n", f: "SUM(A1:A3)", v: 6 };
  target.B3 = { t: "n", f: "A3+$A$3", v: 6 };
  const calc = XLSX.utils.aoa_to_sheet([[null], [null]]);
  calc.A1 = { t: "n", f: "'Target Sheet'!A3+1", v: 4 };
  calc.A2 = { t: "n", f: "A3+'Other'!A3", v: 0 };
  const workbook = {
    SheetNames: ["Target Sheet", "Calc"],
    Sheets: { "Target Sheet": target, Calc: calc },
  };

  workbookModule.insertLegacyWorksheet(
    XLSX,
    target,
    { anchor: { row: 1, column: 1 }, focus: { row: 1, column: 1 } },
    "row",
    { rows: 4, columns: 2 },
    workbook,
    "Target Sheet",
  );

  assert.equal(target.B1.f, "SUM(A1:A4)");
  assert.equal(target.B4.f, "A4+$A$4");
  assert.equal(target.B4.v, 6);
  assert.equal(calc.A1.f, "'Target Sheet'!A4+1");
  assert.equal(calc.A2.f, "A3+'Other'!A3");

  const output = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const reloaded = XLSX.read(output, { type: "array", cellFormula: true });
  assert.equal(reloaded.Sheets["Target Sheet"].B1.f, "SUM(A1:A4)");
  assert.equal(reloaded.Sheets["Target Sheet"].B4.f, "A4+$A$4");
  assert.equal(reloaded.Sheets.Calc.A1.f, "'Target Sheet'!A4+1");
});

test("legacy column insertion translates all workbook formulas through write/read", () => {
  assert.ok(workbookModule, "spreadsheet workbook mutations must be available");

  const target = XLSX.utils.aoa_to_sheet([[1, 2, 3, null], [null, null, null, null]]);
  target.A2 = { t: "n", f: "C1", v: 3 };
  target.D1 = { t: "n", f: "SUM(A1:C1)+$C$1", v: 9 };
  const calc = XLSX.utils.aoa_to_sheet([[null], [null]]);
  calc.A1 = { t: "n", f: "'Target Sheet'!C1", v: 3 };
  calc.A2 = { t: "n", f: "C1", v: 0 };
  const workbook = {
    SheetNames: ["Target Sheet", "Calc"],
    Sheets: { "Target Sheet": target, Calc: calc },
  };

  workbookModule.insertLegacyWorksheet(
    XLSX,
    target,
    { anchor: { row: 1, column: 1 }, focus: { row: 1, column: 1 } },
    "column",
    { rows: 2, columns: 5 },
    workbook,
    "Target Sheet",
  );

  assert.equal(target.A2.f, "D1");
  assert.equal(target.E1.f, "SUM(A1:D1)+$D$1");
  assert.equal(target.E1.v, 9);
  assert.equal(calc.A1.f, "'Target Sheet'!D1");
  assert.equal(calc.A2.f, "C1");

  const output = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const reloaded = XLSX.read(output, { type: "array", cellFormula: true });
  assert.equal(reloaded.Sheets["Target Sheet"].A2.f, "D1");
  assert.equal(reloaded.Sheets["Target Sheet"].E1.f, "SUM(A1:D1)+$D$1");
  assert.equal(reloaded.Sheets.Calc.A1.f, "'Target Sheet'!D1");
});

test("formatted row insertion preserves shifted row metadata and shifts autofilter through write/read", async () => {
  assert.ok(workbookModule, "spreadsheet workbook mutations must be available");

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Metadata");
  worksheet.getCell("A1").value = "header";
  worksheet.getCell("A2").value = "hidden";
  worksheet.getCell("A3").value = "outlined";
  worksheet.autoFilter = "A1:B3";
  worksheet.getRow(1).height = 24;
  worksheet.getRow(1).hidden = true;
  worksheet.getRow(1).outlineLevel = 3;
  worksheet.getRow(2).height = 30;
  worksheet.getRow(2).hidden = true;
  worksheet.getRow(2).outlineLevel = 2;
  worksheet.getRow(3).height = 40;
  worksheet.getRow(3).hidden = false;
  worksheet.getRow(3).outlineLevel = 1;

  workbookModule.insertFormattedWorksheet(
    worksheet,
    { anchor: { row: 1, column: 1 }, focus: { row: 1, column: 1 } },
    "row",
    { rows: 4, columns: 2 },
  );

  assert.equal(worksheet.getRow(2).height, 24);
  assert.equal(worksheet.getRow(2).hidden, false);
  assert.equal(worksheet.getRow(2).outlineLevel, 0);
  assert.equal(worksheet.getRow(3).height, 30);
  assert.equal(worksheet.getRow(3).hidden, true);
  assert.equal(worksheet.getRow(3).outlineLevel, 2);
  assert.equal(worksheet.getRow(4).height, 40);
  assert.equal(worksheet.getRow(4).hidden, false);
  assert.equal(worksheet.getRow(4).outlineLevel, 1);
  assert.equal(worksheet.autoFilter, "A1:B4");

  const output = await workbook.xlsx.writeBuffer();
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(output);
  const reloadedSheet = reloaded.getWorksheet("Metadata");
  assert.equal(reloadedSheet?.getRow(3).hidden, true);
  assert.equal(reloadedSheet?.getRow(3).outlineLevel, 2);
  assert.equal(reloadedSheet?.getRow(4).outlineLevel, 1);
  assert.equal(reloadedSheet?.autoFilter, "A1:B4");
});

test("formatted column insertion preserves shifted metadata without leaking it and shifts autofilter", async () => {
  assert.ok(workbookModule, "spreadsheet workbook mutations must be available");

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Metadata");
  worksheet.getCell("A1").value = "header";
  worksheet.getCell("B1").value = "hidden";
  worksheet.getCell("C1").value = "outlined";
  worksheet.autoFilter = "A1:C2";
  worksheet.getColumn(1).width = 18;
  worksheet.getColumn(1).hidden = true;
  worksheet.getColumn(1).outlineLevel = 3;
  worksheet.getColumn(2).width = 22;
  worksheet.getColumn(2).hidden = true;
  worksheet.getColumn(2).outlineLevel = 2;
  worksheet.getColumn(3).width = 30;
  worksheet.getColumn(3).hidden = false;
  worksheet.getColumn(3).outlineLevel = 1;

  workbookModule.insertFormattedWorksheet(
    worksheet,
    { anchor: { row: 1, column: 1 }, focus: { row: 1, column: 1 } },
    "column",
    { rows: 2, columns: 4 },
  );

  assert.equal(worksheet.getColumn(2).width, 18);
  assert.equal(worksheet.getColumn(2).hidden, false);
  assert.equal(worksheet.getColumn(2).outlineLevel, 0);
  assert.equal(worksheet.getColumn(3).width, 22);
  assert.equal(worksheet.getColumn(3).hidden, true);
  assert.equal(worksheet.getColumn(3).outlineLevel, 2);
  assert.equal(worksheet.getColumn(4).width, 30);
  assert.equal(worksheet.getColumn(4).hidden, false);
  assert.equal(worksheet.getColumn(4).outlineLevel, 1);
  assert.equal(worksheet.autoFilter, "A1:D2");

  const output = await workbook.xlsx.writeBuffer();
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(output);
  const reloadedSheet = reloaded.getWorksheet("Metadata");
  assert.equal(reloadedSheet?.getColumn(3).hidden, true);
  assert.equal(reloadedSheet?.getColumn(3).outlineLevel, 2);
  assert.equal(reloadedSheet?.getColumn(4).outlineLevel, 1);
  assert.equal(reloadedSheet?.autoFilter, "A1:D2");
});

test("legacy row insertion preserves shifted row metadata and shifts autofilter through write/read", () => {
  assert.ok(workbookModule, "spreadsheet workbook mutations must be available");

  const worksheet = XLSX.utils.aoa_to_sheet([["header"], ["hidden"], ["outlined"]]);
  worksheet["!autofilter"] = { ref: "A1:B3" };
  worksheet["!rows"] = [
    { hpt: 24, hidden: true, level: 3 },
    { hpt: 30, hidden: true, level: 2 },
    { hpt: 40, hidden: false, level: 1 },
  ];
  const workbook = { SheetNames: ["Metadata"], Sheets: { Metadata: worksheet } };

  workbookModule.insertLegacyWorksheet(
    XLSX,
    worksheet,
    { anchor: { row: 1, column: 1 }, focus: { row: 1, column: 1 } },
    "row",
    { rows: 4, columns: 2 },
    workbook,
    "Metadata",
  );

  assert.deepEqual(worksheet["!rows"]?.[1], { hpt: 24, hpx: undefined });
  assert.equal(worksheet["!rows"]?.[2]?.hidden, true);
  assert.equal(worksheet["!rows"]?.[2]?.level, 2);
  assert.equal(worksheet["!rows"]?.[3]?.level, 1);
  assert.equal(worksheet["!autofilter"]?.ref, "A1:B4");

  const output = XLSX.write(workbook, { type: "array", bookType: "xlsx", cellStyles: true });
  const reloaded = XLSX.read(output, { type: "array", cellStyles: true });
  assert.equal(reloaded.Sheets.Metadata["!rows"]?.[2]?.hidden, true);
  assert.equal(reloaded.Sheets.Metadata["!rows"]?.[2]?.level, 2);
  assert.equal(reloaded.Sheets.Metadata["!autofilter"]?.ref, "A1:B4");
});

test("legacy column insertion preserves shifted metadata and shifts autofilter through write/read", () => {
  assert.ok(workbookModule, "spreadsheet workbook mutations must be available");

  const worksheet = XLSX.utils.aoa_to_sheet([["header", "hidden", "outlined"]]);
  worksheet["!autofilter"] = { ref: "A1:C2" };
  worksheet["!cols"] = [
    { wch: 18, hidden: true, level: 3 },
    { wch: 22, hidden: true, level: 2 },
    { wch: 30, hidden: false, level: 1 },
  ];
  const workbook = { SheetNames: ["Metadata"], Sheets: { Metadata: worksheet } };

  workbookModule.insertLegacyWorksheet(
    XLSX,
    worksheet,
    { anchor: { row: 1, column: 1 }, focus: { row: 1, column: 1 } },
    "column",
    { rows: 2, columns: 4 },
    workbook,
    "Metadata",
  );

  assert.deepEqual(worksheet["!cols"]?.[1], { width: undefined, wpx: undefined, wch: 18 });
  assert.equal(worksheet["!cols"]?.[2]?.hidden, true);
  assert.equal(worksheet["!cols"]?.[2]?.level, 2);
  assert.equal(worksheet["!cols"]?.[3]?.level, 1);
  assert.equal(worksheet["!autofilter"]?.ref, "A1:D2");

  const output = XLSX.write(workbook, { type: "array", bookType: "xlsx", cellStyles: true });
  const reloaded = XLSX.read(output, { type: "array", cellStyles: true });
  assert.equal(reloaded.Sheets.Metadata["!cols"]?.[2]?.hidden, true);
  assert.equal(reloaded.Sheets.Metadata["!cols"]?.[2]?.level, 2);
  assert.equal(reloaded.Sheets.Metadata["!autofilter"]?.ref, "A1:D2");
});

test("formatted insertion restores the complete worksheet model after a partial mutation failure", () => {
  assert.ok(workbookModule, "spreadsheet workbook mutations must be available");

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Atomic");
  worksheet.getCell("A1").value = "above";
  worksheet.getCell("A2").value = "merged";
  worksheet.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF0000" } };
  worksheet.mergeCells("A2:B2");
  worksheet.getCell("B2").border = { bottom: { style: "thick", color: { argb: "FF0000FF" } } };
  worksheet.getRow(2).hidden = true;
  worksheet.getRow(2).outlineLevel = 2;
  worksheet.autoFilter = "A1:B2";
  const before = JSON.parse(JSON.stringify(worksheet.model));
  const originalSpliceRows = worksheet.spliceRows.bind(worksheet);
  worksheet.spliceRows = ((...arguments_: Parameters<typeof worksheet.spliceRows>) => {
    originalSpliceRows(...arguments_);
    throw new Error("forced formatted failure");
  }) as typeof worksheet.spliceRows;

  try {
    assert.throws(
      () => workbookModule.insertFormattedWorksheet(
        worksheet,
        { anchor: { row: 1, column: 1 }, focus: { row: 1, column: 1 } },
        "row",
        { rows: 3, columns: 2 },
      ),
      /forced formatted failure/,
    );
  } finally {
    worksheet.spliceRows = originalSpliceRows;
  }

  assert.deepEqual(JSON.parse(JSON.stringify(worksheet.model)), before);
  assert.deepEqual(worksheet.model.merges, ["A2:B2"]);
  assert.equal(worksheet.getCell("A2").fill.fgColor?.argb, "FFFF0000");
  assert.equal(worksheet.getCell("B2").border.bottom?.style, "thick");
});

test("legacy insertion restores every original sheet key after a partial mutation failure", () => {
  assert.ok(workbookModule, "spreadsheet workbook mutations must be available");

  const worksheet = XLSX.utils.aoa_to_sheet([["above"], ["below"], ["merged"]]);
  worksheet.A1.s = { fill: { fgColor: { rgb: "00FF00" } } };
  worksheet["!merges"] = [{ s: { r: 2, c: 0 }, e: { r: 2, c: 1 } }];
  worksheet["!autofilter"] = { ref: "A1:B3" };
  const before = structuredClone(worksheet);
  const failingSpreadsheet = {
    ...XLSX,
    utils: {
      ...XLSX.utils,
      encode_range: () => {
        throw new Error("forced legacy failure");
      },
    },
  } as typeof XLSX;

  assert.throws(
    () => workbookModule.insertLegacyWorksheet(
      failingSpreadsheet,
      worksheet,
      { anchor: { row: 1, column: 1 }, focus: { row: 1, column: 1 } },
      "row",
      { rows: 3, columns: 2 },
    ),
    /forced legacy failure/,
  );

  assert.deepEqual(worksheet, before);
});

test("formatted insertion rolls back every worksheet after cross-sheet formula translation fails", () => {
  assert.ok(workbookModule, "spreadsheet workbook mutations must be available");

  const workbook = new ExcelJS.Workbook();
  const target = workbook.addWorksheet("Target");
  const calc = workbook.addWorksheet("Calc");
  const failing = workbook.addWorksheet("Failing");
  target.getCell("A1").value = "above";
  target.getCell("A3").value = 3;
  calc.getCell("A1").value = { formula: "'Target'!A3", result: 3 };
  calc.getCell("C1").value = "merged";
  calc.mergeCells("C1:D1");
  calc.getCell("D1").border = { bottom: { style: "thick", color: { argb: "FF0000FF" } } };
  const failingCell = failing.getCell("A1");
  const failingValue = { formula: "'Target'!A3", result: 3 };
  failingCell.value = failingValue;
  Object.defineProperty(failingCell, "value", {
    configurable: true,
    get: () => failingValue,
    set: () => {
      assert.equal(calc.getCell("A1").formula, "'Target'!A4");
      throw new Error("forced cross-sheet formatted failure");
    },
  });
  const before = new Map(workbook.worksheets.map((worksheet) => (
    [worksheet.name, JSON.parse(JSON.stringify(worksheet.model))]
  )));

  assert.throws(
    () => workbookModule.insertFormattedWorksheet(
      target,
      { anchor: { row: 1, column: 1 }, focus: { row: 1, column: 1 } },
      "row",
      { rows: 4, columns: 2 },
    ),
    /forced cross-sheet formatted failure/,
  );

  workbook.worksheets.forEach((worksheet) => {
    assert.deepEqual(JSON.parse(JSON.stringify(worksheet.model)), before.get(worksheet.name));
  });
  assert.equal(calc.getCell("A1").formula, "'Target'!A3");
  assert.equal(calc.getCell("D1").border.bottom?.style, "thick");
});

test("legacy insertion rolls back every provided workbook sheet after formula translation fails", () => {
  assert.ok(workbookModule, "spreadsheet workbook mutations must be available");

  const target = XLSX.utils.aoa_to_sheet([["above"], ["middle"], [3]]);
  const calc = XLSX.utils.aoa_to_sheet([[null]]);
  calc.A1 = { t: "n", f: "'Target'!A3", v: 3 };
  calc["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  const failing = XLSX.utils.aoa_to_sheet([[null]]);
  const failingCell = { t: "n", f: "'Target'!A3", v: 3 };
  failing.A1 = failingCell;
  Object.defineProperty(failingCell, "f", {
    configurable: true,
    enumerable: true,
    get: () => "'Target'!A3",
    set: () => {
      assert.equal(calc.A1.f, "'Target'!A4");
      throw new Error("forced cross-sheet legacy failure");
    },
  });
  const workbook = {
    SheetNames: ["Target", "Calc", "Failing"],
    Sheets: { Target: target, Calc: calc, Failing: failing },
  };
  const before = Object.fromEntries(workbook.SheetNames.map((name) => (
    [name, structuredClone(workbook.Sheets[name as keyof typeof workbook.Sheets])]
  )));

  assert.throws(
    () => workbookModule.insertLegacyWorksheet(
      XLSX,
      target,
      { anchor: { row: 1, column: 1 }, focus: { row: 1, column: 1 } },
      "row",
      { rows: 4, columns: 2 },
      workbook,
      "Target",
    ),
    /forced cross-sheet legacy failure/,
  );

  workbook.SheetNames.forEach((name) => {
    assert.deepEqual(workbook.Sheets[name as keyof typeof workbook.Sheets], before[name]);
  });
  assert.equal(calc.A1.f, "'Target'!A3");
});

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
