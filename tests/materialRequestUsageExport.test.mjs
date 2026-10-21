import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import ts from "typescript";

// Match the application's CommonJS dependency interop while exercising the real
// ExcelJS and JSZip writers; native Node imports expose ExcelJS only as default.
const exportSource = await readFile(new URL("../src/components/material-requests/materialRequestExport.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(exportSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const moduleExports = {};
new Function("require", "exports", compiled)(createRequire(import.meta.url), moduleExports);
const { exportMaterialReportExcel, exportMaterialReportHtml, exportMaterialReportHtmlZip } = moduleExports;

function reportRow(overrides = {}) {
  return {
    item: "1",
    marked: true,
    refGroup: "R1",
    refDes: "R1, R2",
    materialName: "電阻",
    assembly: "主板",
    qty: "2",
    symbol: "RES",
    symbolStatus: "C",
    footprint: "0402",
    manufacturer: "Test Manufacturer",
    manufacturerPartNumber: "TEST-MPN",
    manufacturerPartNumberAlt: "TEST-ALT",
    tx: "TX-1",
    partUsageStatus: "新設計產品不建議使用-ODM 不建議用料",
    trackingStatus: "處理中",
    trackingSummary: "RD 持續追蹤",
    requestTicket: "REQ-1",
    requestUrl: "https://example.com/requests/1",
    requestInfo: "申請中",
    trackingOwner: "測試工程師",
    sourcingStatus: "Approved",
    actionStatus: "待建料",
    buildRequirement: "只需補Symbol",
    internalPartNumber: "TEST-0001",
    specification: "10 kΩ",
    images: [],
    ...overrides,
  };
}

function snapshot(rows = [reportRow()]) {
  return {
    dataAsOf: "2026-10-21T03:00:00.000Z",
    exportedAt: "2026-10-21T03:01:00.000Z",
    exportedBy: "測試使用者",
    filteredGroupCount: 1,
    filterSummary: [],
    id: "usage-export-fixture",
    originalGroupCount: 1,
    reportName: "料件測試報表",
    rows,
    sheetName: "CE BOM",
    scopeLabel: "全部資料",
    sourceFile: "test-bom.xlsx",
    statusCounts: { 處理中: rows.length },
    workspaceName: "測試 BOM",
  };
}

async function captureExport(exporter, report, { includeImage = false } = {}) {
  const globals = ["document", "window", "Image"];
  const descriptors = new Map(globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let blob;
  URL.createObjectURL = (value) => { blob = value; return "blob:material-export-test"; };
  URL.revokeObjectURL = () => {};
  globalThis.document = {
    createElement: (name) => name === "canvas"
      ? {
          getContext: () => ({ fillRect() {}, drawImage() {} }),
          toDataURL: () => "data:image/jpeg;base64,/9j/2Q==",
        }
      : { click() {}, remove() {} },
    body: { appendChild() {} },
  };
  globalThis.window = { setTimeout: (callback) => { callback(); return 0; } };
  if (includeImage) {
    globalThis.Image = class {
      naturalWidth = 1;
      naturalHeight = 1;
      set src(_value) { this.onload(); }
    };
  }
  try {
    await exporter(report);
    assert.ok(blob instanceof Blob);
    return blob;
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    globals.forEach((name) => {
      const descriptor = descriptors.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    });
  }
}

async function exportedSheet(rows, options) {
  const blob = await captureExport(exportMaterialReportExcel, snapshot(rows), options);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());
  return workbook.worksheets[0];
}

function columnFor(sheet, header) {
  const index = sheet.getRow(11).values.indexOf(header);
  assert.ok(index > 0, `Missing export header: ${header}`);
  return index;
}

test("Excel keeps CE usage, source sourcing and RD tracking in separate columns", async () => {
  const row = reportRow();
  const sheet = await exportedSheet([row]);
  const values = sheet.getRow(12);
  assert.equal(sheet.columnCount, 27);
  assert.equal(columnFor(sheet, "零件狀態"), 15);
  assert.equal(values.getCell(columnFor(sheet, "零件狀態")).value, row.partUsageStatus);
  assert.equal(values.getCell(columnFor(sheet, "Sourcing Status")).value, "Approved");
  assert.equal(values.getCell(columnFor(sheet, "目前狀態")).value, "處理中");
  assert.equal(values.getCell(columnFor(sheet, "狀態追蹤")).value, "RD 持續追蹤");
  assert.equal(values.getCell(columnFor(sheet, "建料狀態")).value, "待建料");
  assert.equal(values.getCell(columnFor(sheet, "單號")).value, "REQ-1");
  assert.deepEqual(values.getCell(columnFor(sheet, "申請連結")).value, { text: row.requestUrl, hyperlink: row.requestUrl });
  assert.equal(values.getCell(columnFor(sheet, "內部料號")).value, row.internalPartNumber);
  assert.equal(values.getCell(columnFor(sheet, "規格 / 備註")).value, row.specification);
  assert.equal(sheet.autoFilter, "A11:AA11");
  assert.equal(sheet.getCell("AA1").master.address, "A1");
  assert.equal(sheet.views[0].ySplit, 11);
  assert.equal(sheet.views[0].xSplit, 3);
});

test("manual OK and Part/Symbol build requirements remain independent in Excel and HTML", async () => {
  const row = reportRow({ actionStatus: "OK", buildRequirement: "只需補Symbol" });
  const sheet = await exportedSheet([row]);
  assert.equal(sheet.getRow(12).getCell(columnFor(sheet, "建料狀態")).value, "OK");
  assert.equal(sheet.getRow(12).getCell(columnFor(sheet, "Part／Symbol缺件判斷")).value, "只需補Symbol");
  assert.equal(columnFor(sheet, "Part／Symbol缺件判斷"), columnFor(sheet, "建料狀態") + 1);
  const html = await (await captureExport(exportMaterialReportHtml, snapshot([row]))).text();
  assert.match(html, /<th>建料狀態<\/th><th>Part／Symbol缺件判斷<\/th>/);
  assert.match(html, /<td>OK<\/td>\s*<td>只需補Symbol<\/td>/);
});

test("Excel preserves schematic names and raw Symbol build statuses, including C and unknown values", async () => {
  const rows = [
    reportRow({ symbol: "RES_0402", symbolStatus: "C" }),
    reportRow({ item: "2", symbol: "CAP_0402", symbolStatus: "future <unknown> & 'C'" }),
  ];
  const sheet = await exportedSheet(rows);
  assert.equal(columnFor(sheet, "Schematic_Part（名稱）"), 8);
  assert.equal(columnFor(sheet, "Symbol建置狀態"), 9);
  assert.equal(columnFor(sheet, "Footprint"), 10);
  rows.forEach((row, index) => {
    const exported = sheet.getRow(index + 12);
    assert.equal(exported.getCell(columnFor(sheet, "Schematic_Part（名稱）")).value, row.symbol);
    assert.equal(exported.getCell(columnFor(sheet, "Symbol建置狀態")).value, row.symbolStatus);
    assert.equal(exported.getCell(columnFor(sheet, "Footprint")).value, row.footprint);
    assert.equal(exported.getCell(columnFor(sheet, "Sourcing Status")).value, row.sourcingStatus);
    assert.equal(exported.getCell(columnFor(sheet, "零件狀態")).value, row.partUsageStatus);
    assert.equal(exported.getCell(columnFor(sheet, "目前狀態")).value, row.trackingStatus);
  });
  assert.ok(!sheet.getRow(11).values.includes("Symbol"));
});

test("Excel insertion preserves widths, status alignment and image placement", async () => {
  const row = reportRow({ images: [{ id: "image-1", name: "測試圖片.jpg", mimeType: "image/jpeg", dataUrl: "data:image/jpeg;base64,/9j/2Q==" }] });
  const sheet = await exportedSheet([row], { includeImage: true });
  assert.deepEqual(sheet.columns.map((column) => column.width ?? 9), [10, 8, 20, 20, 30, 22, 9, 26, 18, 20, 20, 24, 24, 22, 45, 16, 34, 18, 30, 26, 18, 18, 18, 28, 22, 38, 18]);
  for (const header of ["項次", "標記", "Qty", "Symbol建置狀態", "零件狀態", "目前狀態", "建料狀態", "Part／Symbol缺件判斷"]) {
    assert.equal(sheet.getRow(12).getCell(columnFor(sheet, header)).alignment.horizontal, "center");
  }
  assert.equal(sheet.getRow(12).getCell(columnFor(sheet, "狀態追蹤")).alignment.horizontal, "left");
  assert.equal(sheet.getRow(12).getCell(columnFor(sheet, "申請連結")).font.underline, true);
  assert.equal(sheet.getRow(12).getCell(columnFor(sheet, "圖片")).value, "測試圖片.jpg");
  assert.equal(sheet.getImages().length, 1);
  assert.equal(sheet.getImages()[0].range.tl.nativeCol, columnFor(sheet, "圖片") - 1);
});

test("legacy rows with no optional usage, Symbol status or build requirement export blank without borrowing names or other statuses", async () => {
  const legacy = reportRow();
  delete legacy.partUsageStatus;
  delete legacy.symbolStatus;
  delete legacy.buildRequirement;
  const sheet = await exportedSheet([legacy]);
  assert.ok(["", null].includes(sheet.getRow(12).getCell(columnFor(sheet, "零件狀態")).value));
  assert.ok(["", null].includes(sheet.getRow(12).getCell(columnFor(sheet, "Symbol建置狀態")).value));
  assert.ok(["", null].includes(sheet.getRow(12).getCell(columnFor(sheet, "Part／Symbol缺件判斷")).value));
  assert.equal(sheet.getRow(12).getCell(columnFor(sheet, "Schematic_Part（名稱）")).value, "RES");
  assert.equal(sheet.getRow(12).getCell(columnFor(sheet, "Sourcing Status")).value, "Approved");
  const html = await (await captureExport(exportMaterialReportHtml, snapshot([legacy]))).text();
  assert.match(html, /<th>TX<\/th><th>零件狀態<\/th><th>狀態追蹤<\/th>/);
  assert.match(html, /<td>TX-1<\/td>\s*<td><\/td>\s*<td><span class="status">處理中<\/span>/);
  assert.match(html, /Schematic_Part（名稱）：RES<br>Footprint：0402<\/small><\/td>\s*<td><\/td>\s*<td>TX-1<\/td>/);
  assert.match(html, /<td>Approved<\/td>/);
  assert.match(html, /<td>待建料<\/td>\s*<td><\/td>\s*<td>10 kΩ<\/td>/);
  assert.doesNotMatch(html.match(/<tbody>([\s\S]*?)<\/tbody>/)[1], /undefined|null/);
});

for (const format of ["html", "zip"]) {
  test(`${format} export separates and escapes CE usage, source sourcing, Symbol and build requirements`, async () => {
    const row = reportRow({ partUsageStatus: 'DNP <script>alert("usage")</script> & \'quoted\'', sourcingStatus: "CE <Approved> & sourcing", symbol: "RES <name>", symbolStatus: 'C <script>alert("symbol")</script> & \'quoted\'', actionStatus: "OK", buildRequirement: '只需補Symbol <script>alert("build")</script> & \'quoted\'' });
    const blob = await captureExport(format === "zip" ? exportMaterialReportHtmlZip : exportMaterialReportHtml, snapshot([row]));
    const html = format === "zip"
      ? await (await JSZip.loadAsync(await blob.arrayBuffer())).file("料號申請篩選報表.html").async("string")
      : await blob.text();
    assert.match(html, /<th>TX<\/th><th>零件狀態<\/th><th>狀態追蹤<\/th>/);
    assert.match(html, /<th>申請資訊<\/th><th>Sourcing Status<\/th><th>建料狀態<\/th><th>Part／Symbol缺件判斷<\/th><th>規格 \/ 備註<\/th>/);
    assert.match(html, /<th>內部料號 \/ 圖面名稱<\/th><th>Symbol建置狀態<\/th><th>TX<\/th>/);
    assert.match(html, /Schematic_Part（名稱）：RES &lt;name&gt;<br>Footprint：0402/);
    assert.match(html, /<td>DNP &lt;script&gt;alert\(&quot;usage&quot;\)&lt;\/script&gt; &amp; &#039;quoted&#039;<\/td>/);
    assert.match(html, /<td>CE &lt;Approved&gt; &amp; sourcing<\/td>/);
    assert.match(html, /<td>C &lt;script&gt;alert\(&quot;symbol&quot;\)&lt;\/script&gt; &amp; &#039;quoted&#039;<\/td>/);
    assert.match(html, /<td>OK<\/td>\s*<td>只需補Symbol &lt;script&gt;alert\(&quot;build&quot;\)&lt;\/script&gt; &amp; &#039;quoted&#039;<\/td>/);
    assert.match(html, /<span class="status">處理中<\/span><small>RD 持續追蹤<\/small>/);
    assert.doesNotMatch(html, /<script>alert\("usage"\)<\/script>/);
    assert.doesNotMatch(html, /<script>alert\("symbol"\)<\/script>/);
    assert.doesNotMatch(html, /<script>alert\("build"\)<\/script>/);
    const headerCount = (html.match(/<th>/g) ?? []).length;
    const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
    assert.equal(headerCount, 16);
    assert.equal((body.match(/<td(?:\s[^>]*)?>/g) ?? []).length, headerCount);
  });
}
