import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import ExcelJS from "exceljs";
import * as XLSX from "xlsx";

const expectedArtifact = "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz";
const packageJsonUrl = new URL("../package.json", import.meta.url);
const packageLockUrl = new URL("../package-lock.json", import.meta.url);
const materialUtilsUrl = new URL(
  "../src/components/material-requests/materialRequestUtils.ts",
  import.meta.url,
);

const { buildMaterialDataset, parseMaterialWorkbookFile } = await import(materialUtilsUrl);

function createWorkbookFile(workbook, name, bookType) {
  const bytes = XLSX.write(workbook, {
    bookType,
    cellStyles: true,
    type: "array",
  });

  return new File([bytes], name);
}

function appendWorksheet(workbook, name, rows) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
  return worksheet;
}

test("uses the exact official SheetJS 0.20.3 artifact with lockfile integrity", async () => {
  const [packageJson, packageLock] = await Promise.all([
    readFile(packageJsonUrl, "utf8").then(JSON.parse),
    readFile(packageLockUrl, "utf8").then(JSON.parse),
  ]);
  const lockedXlsx = packageLock.packages["node_modules/xlsx"];

  assert.equal(packageJson.dependencies.xlsx, expectedArtifact);
  assert.equal(packageLock.packages[""].dependencies.xlsx, expectedArtifact);
  assert.equal(lockedXlsx.version, "0.20.3");
  assert.equal(lockedXlsx.resolved, expectedArtifact);
  assert.match(lockedXlsx.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/);
  assert.equal(XLSX.version, "0.20.3");
});

test("material XLSX import retains Chinese text, blue groups, hyperlinks, sheets, merges, and duplicates", async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Readme").addRow(["請使用物料清單工作表"]);
  const materials = workbook.addWorksheet("物料清單");
  materials.addRows([
    ["物料匯入", "", "", "", "", "", ""],
    ["Level", "Name", "Qty", "Ref Des", "MPN", "Part Number", "Request URL"],
    [2, "連接器", 2, "J1, J2", "CONN-001", "INT-001", "申請單"],
    [2, "替代連接器", 1, "J1, J2", "CONN-001", "INT-001", ""],
    [2, "電阻", 5, "R1-R5", "RES-10K", "INT-002", ""],
  ]);
  materials.mergeCells("A1:G1");
  for (const address of ["B3", "B5"]) {
    materials.getCell(address).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFDCEAF7" },
    };
  }
  materials.getCell("G3").value = {
    text: "申請單",
    hyperlink: "https://example.test/requests/REQ-001",
  };
  workbook.addWorksheet("Backup").addRows([
    ["Level", "Name", "Qty", "Ref Des", "MPN", "Part Number", "Request URL"],
    [2, "備用資料", 1, "B1", "BACKUP-1", "INT-BACKUP", ""],
  ]);
  const bytes = await workbook.xlsx.writeBuffer();

  const payload = await parseMaterialWorkbookFile(
    new File([bytes], "中文物料.xlsx"),
  );

  assert.equal(payload.sourceFile, "中文物料.xlsx");
  assert.equal(payload.sheetName, "物料清單");
  assert.equal(payload.recordCount, 3);
  assert.deepEqual(payload.records.map((record) => record.name), [
    "連接器",
    "替代連接器",
    "電阻",
  ]);
  assert.equal(payload.records[0].requestUrl, "https://example.test/requests/REQ-001");
  assert.equal(payload.records[0].isGroupStart, true);
  assert.equal(payload.records[1].isGroupStart, false);
  assert.equal(payload.records[2].isGroupStart, true);
  assert.equal(payload.records[0].sourceGroupKey, payload.records[1].sourceGroupKey);
  assert.notEqual(payload.records[1].sourceGroupKey, payload.records[2].sourceGroupKey);

  const dataset = buildMaterialDataset(payload);
  assert.equal(dataset.records.length, 3, "duplicate material rows remain real records");
  assert.equal(dataset.groups.length, 2, "duplicate locations merge only in the derived group view");
  assert.equal(dataset.groups.find((group) => group.displayRef.includes("J1"))?.totalCount, 2);
});

test("material import reads legacy XLS workbooks with Chinese values", async () => {
  const workbook = XLSX.utils.book_new();
  appendWorksheet(workbook, "舊格式", [
    ["Level", "Name", "Qty", "Ref Des", "MPN", "Part Number"],
    [2, "保險絲", 3, "F1-F3", "FUSE-001", "INT-FUSE"],
  ]);

  const payload = await parseMaterialWorkbookFile(
    createWorkbookFile(workbook, "舊物料.xls", "biff8"),
  );

  assert.equal(payload.sheetName, "舊格式");
  assert.equal(payload.recordCount, 1);
  assert.equal(payload.records[0].name, "保險絲");
  assert.equal(payload.records[0].manufacturerPartNumber, "FUSE-001");
});

test("material import rejects empty and malformed workbook uploads", async () => {
  const emptyWorkbook = XLSX.utils.book_new();
  appendWorksheet(emptyWorkbook, "Empty", [[]]);

  await assert.rejects(
    parseMaterialWorkbookFile(createWorkbookFile(emptyWorkbook, "empty.xlsx", "xlsx")),
  );
  await assert.rejects(
    parseMaterialWorkbookFile(new File([Uint8Array.from([0, 1, 2, 3, 4])], "broken.xlsx")),
  );
});

test("material import keeps its 100000-row bound and parses a large representative workbook", async () => {
  const rowCount = 2_500;
  const rows = [
    ["Level", "Name", "Qty", "Ref Des", "MPN", "Part Number"],
    ...Array.from({ length: rowCount }, (_, index) => [
      2,
      `物料-${index + 1}`,
      1,
      `R${index + 1}`,
      `MPN-${index + 1}`,
      `INT-${index + 1}`,
    ]),
  ];
  const workbook = XLSX.utils.book_new();
  appendWorksheet(workbook, "Large", rows);

  const payload = await parseMaterialWorkbookFile(
    createWorkbookFile(workbook, "large.xlsx", "xlsx"),
  );
  const source = await readFile(materialUtilsUrl, "utf8");

  assert.equal(payload.recordCount, rowCount);
  assert.equal(payload.records.at(-1)?.name, `物料-${rowCount}`);
  assert.match(source, /sheetRows:\s*100_000/);
});
