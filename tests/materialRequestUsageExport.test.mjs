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
    phaseOutStatus: "ACTIVE",
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
    partName: "公司實體電阻料名",
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
  assert.equal(values.getCell(columnFor(sheet, "phase out（零件狀態）")).value, row.phaseOutStatus);
  assert.equal(values.getCell(columnFor(sheet, "供應／核准狀態（Sourcing Status）")).value, "Approved");
  assert.equal(values.getCell(columnFor(sheet, "目前狀態")).value, "處理中");
  assert.equal(values.getCell(columnFor(sheet, "狀態追蹤")).value, "RD 持續追蹤");
  assert.equal(values.getCell(columnFor(sheet, "建料狀態")).value, "待建料");
  assert.equal(values.getCell(columnFor(sheet, "單號")).value, "REQ-1");
  assert.deepEqual(values.getCell(columnFor(sheet, "申請連結")).value, { text: row.requestUrl, hyperlink: row.requestUrl });
  assert.equal(values.getCell(columnFor(sheet, "實體料號")).value, row.internalPartNumber);
  assert.equal(values.getCell(columnFor(sheet, "實體料名（Part Name）")).value, row.partName);
  assert.equal(values.getCell(columnFor(sheet, "虛擬料號")).value, row.tx);
  assert.equal(values.getCell(columnFor(sheet, "舊檔第二 MPN")).value, row.manufacturerPartNumberAlt);
  assert.equal(values.getCell(columnFor(sheet, "料件規格（Part Spec）")).value, row.specification);
  assert.equal(sheet.autoFilter, "A11:AA11");
  assert.equal(sheet.getCell("AA1").master.address, "A1");
  assert.equal(sheet.views[0].ySplit, 11);
  assert.equal(sheet.views[0].xSplit, 3);
});

test("new reports keep manual build status and omit obsolete Symbol source and inferred requirement columns", async () => {
  const row = reportRow({ actionStatus: "OK", buildRequirement: "REMOVED-BUILD-REQUIREMENT", symbolStatus: "REMOVED-SYMBOL-CODE" });
  const sheet = await exportedSheet([row]);
  assert.equal(sheet.getRow(12).getCell(columnFor(sheet, "建料狀態")).value, "OK");
  assert.ok(!sheet.getRow(11).values.includes("Symbol"));
  assert.ok(!sheet.getRow(11).values.includes("實體料／Symbol缺件判斷"));
  assert.ok(!sheet.getRow(12).values.includes(row.symbolStatus));
  assert.ok(!sheet.getRow(12).values.includes(row.buildRequirement));
  const html = await (await captureExport(exportMaterialReportHtml, snapshot([row]))).text();
  assert.match(html, /<th>建料狀態<\/th><th>料件規格（Part Spec）<\/th>/);
  assert.match(html, /<td>OK<\/td>\s*<td>10 kΩ<\/td>/);
  assert.doesNotMatch(html, /<th>Symbol<\/th>|實體料／Symbol缺件判斷|REMOVED-BUILD-REQUIREMENT|REMOVED-SYMBOL-CODE/);
});

test("Excel preserves Schematic_Part source text without a second Symbol column", async () => {
  const rows = [
    reportRow({ symbol: "RES_0402", symbolStatus: "C" }),
    reportRow({ item: "2", symbol: "無法叫出 <unknown> & 'C'", symbolStatus: "REMOVED-LEGACY-STATUS" }),
  ];
  const sheet = await exportedSheet(rows);
  assert.equal(columnFor(sheet, "原理圖符號（Schematic_Part）"), 8);
  assert.equal(columnFor(sheet, "PCB 封裝名稱（PCB_Footprint）"), 9);
  rows.forEach((row, index) => {
    const exported = sheet.getRow(index + 12);
    assert.equal(exported.getCell(columnFor(sheet, "原理圖符號（Schematic_Part）")).value, row.symbol);
    assert.equal(exported.getCell(columnFor(sheet, "PCB 封裝名稱（PCB_Footprint）")).value, row.footprint);
    assert.equal(exported.getCell(columnFor(sheet, "供應／核准狀態（Sourcing Status）")).value, row.sourcingStatus);
    assert.equal(exported.getCell(columnFor(sheet, "零件狀態")).value, row.partUsageStatus);
    assert.equal(exported.getCell(columnFor(sheet, "目前狀態")).value, row.trackingStatus);
  });
  assert.ok(!sheet.getRow(11).values.includes("Symbol"));
  assert.equal(columnFor(sheet, "phase out（零件狀態）"), 14);
});

test("Excel insertion preserves widths, status alignment and image placement", async () => {
  const row = reportRow({ images: [{ id: "image-1", name: "測試圖片.jpg", mimeType: "image/jpeg", dataUrl: "data:image/jpeg;base64,/9j/2Q==" }] });
  const sheet = await exportedSheet([row], { includeImage: true });
  assert.deepEqual(sheet.columns.map((column) => column.width ?? 9), [10, 8, 20, 20, 30, 22, 9, 26, 20, 20, 28, 24, 22, 25, 45, 16, 34, 18, 30, 26, 18, 25, 18, 22, 28, 38, 18]);
  for (const header of ["項次", "標記", "Qty", "phase out（零件狀態）", "零件狀態", "目前狀態", "建料狀態"]) {
    assert.equal(sheet.getRow(12).getCell(columnFor(sheet, header)).alignment.horizontal, "center");
  }
  assert.equal(sheet.getRow(12).getCell(columnFor(sheet, "狀態追蹤")).alignment.horizontal, "left");
  assert.equal(sheet.getRow(12).getCell(columnFor(sheet, "申請連結")).font.underline, true);
  assert.equal(sheet.getRow(12).getCell(columnFor(sheet, "圖片")).value, "測試圖片.jpg");
  assert.equal(sheet.getImages().length, 1);
  assert.equal(sheet.getImages()[0].range.tl.nativeCol, columnFor(sheet, "圖片") - 1);
});

test("legacy rows with no optional usage export blank without borrowing names or other statuses", async () => {
  const legacy = reportRow();
  delete legacy.partUsageStatus;
  delete legacy.partName;
  delete legacy.symbolStatus;
  delete legacy.phaseOutStatus;
  delete legacy.buildRequirement;
  const sheet = await exportedSheet([legacy]);
  assert.ok(["", null].includes(sheet.getRow(12).getCell(columnFor(sheet, "零件狀態")).value));
  assert.ok(["", null].includes(sheet.getRow(12).getCell(columnFor(sheet, "實體料名（Part Name）")).value));
  assert.equal(sheet.getRow(12).getCell(columnFor(sheet, "原理圖符號（Schematic_Part）")).value, "RES");
  assert.equal(sheet.getRow(12).getCell(columnFor(sheet, "供應／核准狀態（Sourcing Status）")).value, "Approved");
  const html = await (await captureExport(exportMaterialReportHtml, snapshot([legacy]))).text();
  assert.match(html, /<th>虛擬料號<\/th><th>phase out（零件狀態）<\/th><th>零件狀態<\/th><th>狀態追蹤<\/th>/);
  assert.match(html, /<td>TX-1<\/td>\s*<td><\/td>\s*<td><\/td>\s*<td><span class="status">處理中<\/span>/);
  assert.match(html, /原理圖符號（Schematic_Part）：RES<br>PCB 封裝名稱（PCB_Footprint）：0402<br>實體料名（Part Name）：<\/small><\/td>\s*<td>TX-1<\/td>/);
  assert.match(html, /<td>Approved<\/td>/);
  assert.match(html, /<td>待建料<\/td>\s*<td>10 kΩ<\/td>/);
  assert.doesNotMatch(html.match(/<tbody>([\s\S]*?)<\/tbody>/)[1], /undefined|null/);
});

for (const format of ["html", "zip"]) {
  test(`${format} export separates and escapes CE fields without publishing obsolete Symbol data`, async () => {
    const row = reportRow({ phaseOutStatus: 'PHASEOUT <script>alert("phase")</script> & raw', partUsageStatus: 'DNP <script>alert("usage")</script> & \'quoted\'', sourcingStatus: "CE <Approved> & sourcing", symbol: "RES <name>", symbolStatus: 'C <script>alert("symbol")</script> & \'quoted\'', actionStatus: "OK", buildRequirement: '只需補Symbol <script>alert("build")</script> & \'quoted\'' });
    const blob = await captureExport(format === "zip" ? exportMaterialReportHtmlZip : exportMaterialReportHtml, snapshot([row]));
    const html = format === "zip"
      ? await (await JSZip.loadAsync(await blob.arrayBuffer())).file("料號申請篩選報表.html").async("string")
      : await blob.text();
    assert.match(html, /<th>虛擬料號<\/th><th>phase out（零件狀態）<\/th><th>零件狀態<\/th><th>狀態追蹤<\/th>/);
    assert.match(html, /<th>申請資訊<\/th><th>供應／核准狀態（Sourcing Status）<\/th><th>建料狀態<\/th><th>料件規格（Part Spec）<\/th>/);
    assert.match(html, /<th>實體料號 \/ 符號與封裝 \/ 實體料名<\/th><th>虛擬料號<\/th>/);
    assert.match(html, /原理圖符號（Schematic_Part）：RES &lt;name&gt;<br>PCB 封裝名稱（PCB_Footprint）：0402/);
    assert.match(html, /<td>DNP &lt;script&gt;alert\(&quot;usage&quot;\)&lt;\/script&gt; &amp; &#039;quoted&#039;<\/td>/);
    assert.match(html, /<td>CE &lt;Approved&gt; &amp; sourcing<\/td>/);
    assert.match(html, /<td>OK<\/td>\s*<td>10 kΩ<\/td>/);
    assert.doesNotMatch(html, /&quot;symbol&quot;|&quot;build&quot;|<th>Symbol<\/th>|實體料／Symbol缺件判斷/);
    assert.match(html, /<span class="status">處理中<\/span><small>RD 持續追蹤<\/small>/);
    assert.match(html, /<td>PHASEOUT &lt;script&gt;alert\(&quot;phase&quot;\)&lt;\/script&gt; &amp; raw<\/td>/);
    assert.doesNotMatch(html, /<script>alert\("phase"\)<\/script>/);
    assert.doesNotMatch(html, /<script>alert\("usage"\)<\/script>/);
    assert.doesNotMatch(html, /<script>alert\("symbol"\)<\/script>/);
    assert.doesNotMatch(html, /<script>alert\("build"\)<\/script>/);
    const headerCount = (html.match(/<th>/g) ?? []).length;
    const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
    assert.equal(headerCount, 15);
    assert.equal((body.match(/<td(?:\s[^>]*)?>/g) ?? []).length, headerCount);
  });
}


test("page snapshots and actual exports keep each physical candidate's own CE fields, including blanks", async () => {
  const pageSource = await readFile(new URL("../src/components/material-requests/MaterialRequestPage.tsx", import.meta.url), "utf8");
  const start = pageSource.indexOf("  const createExportSnapshot = () => {");
  const end = pageSource.indexOf("  const prepareExportSnapshot = async () => {", start);
  assert.ok(start > 0 && end > start);
  const compileSnapshot = ts.transpileModule(pageSource.slice(start, end), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const candidates = [
    { name: "CAP A", manufacturer: "Maker A", manufacturerPartNumber: "MPN-A", partNumber: "PHYSICAL-A", partName: "實體料 A", partSpec: "0.1uF", schematicPart: "CAP_A", pcbFootprint: "0402_A", symbolStatus: "缺 Symbol", phaseOutStatus: "ACTIVE" },
    { name: "CAP B", manufacturer: "Maker B", manufacturerPartNumber: "MPN-B", partNumber: "PHYSICAL-B", partName: "實體料 B", partSpec: "100nF", schematicPart: "CAP_B", pcbFootprint: "0402_B", symbolStatus: "C", phaseOutStatus: "PHASEOUT" },
    { name: "CAP C", manufacturer: "Maker C", manufacturerPartNumber: "MPN-C", partNumber: "", partName: "", partSpec: "", schematicPart: "", pcbFootprint: "", symbolStatus: "待確認", phaseOutStatus: "UNDERREVIEW" },
  ].map((record, index) => ({ ...record, id: `candidate-${index}`, virtualAlternative: "SHARED-VIRTUAL", refDes: "C101", trackingHistory: [], partUsageStatus: "待確認", sourcingStatus: "Approved", manufacturerPartNumberAlt: "" }));
  const group = { key: "shared-group", records: candidates, primaryRecord: candidates[0], assemblyName: "Module", name: "GROUP NAME MUST NOT REPLACE ROW", qty: 1, schematicPart: "GROUP SYMBOL MUST NOT FILL BLANKS", footprint: "GROUP FOOTPRINT MUST NOT FILL BLANKS", partName: "GROUP NAME MUST NOT BECOME SPEC", partSpec: "GROUP SPEC MUST NOT FILL BLANKS", displayRef: "C101" };
  const bindings = {
    filteredGroups: [group], getMatchingRecords: value => value.records,
    getLatestTrackingEntry: () => undefined, getTrackingRequestMeta: () => ({ ticket: "", url: "" }),
    getActionLabel: () => "", getGroupItemValue: () => 1, markedGroupKeySet: new Set(),
    getMaterialBuildRequirementLabel: () => "待確認", getTrackingWorkflowStatus: () => "",
    activeFilterChips: [], user: { displayName: "Test" }, SORT_MODE_LABELS: { reference: "Ref" }, sortMode: "reference",
    dataset: { stats: { totalGroups: 1 }, meta: { sheetName: "CE", sourceFile: "test.xlsx" } },
    activeWorkspace: { name: "Test BOM" }, getMaterialExportScopeLabel: () => "全部資料",
    setExportSnapshot() {}, setExportProgress() {}, setExportDialogOpen() {},
  };
  const report = new Function(...Object.keys(bindings), `${compileSnapshot}; return createExportSnapshot();`)(...Object.values(bindings));
  const sheet = await exportedSheet(report.rows);
  const html = await (await captureExport(exportMaterialReportHtml, report)).text();
  candidates.forEach((record, index) => {
    const row = report.rows[index];
    assert.equal(row.partName, record.partName);
    assert.equal(row.specification, record.partSpec);
    assert.equal(row.symbol, record.schematicPart);
    assert.equal(row.footprint, record.pcbFootprint);
    assert.equal(row.materialName, record.name);
    assert.equal(row.tx, "SHARED-VIRTUAL");
    assert.equal(row.phaseOutStatus, record.phaseOutStatus);
    assert.equal(Object.hasOwn(row, "symbolStatus"), false);
    assert.equal(Object.hasOwn(row, "buildRequirement"), false);
    const excel = sheet.getRow(index + 12);
    for (const [header, expected] of [["phase out（零件狀態）", record.phaseOutStatus], ["實體料名（Part Name）", record.partName], ["料件規格（Part Spec）", record.partSpec], ["原理圖符號（Schematic_Part）", record.schematicPart], ["PCB 封裝名稱（PCB_Footprint）", record.pcbFootprint]]) {
      assert.equal(excel.getCell(columnFor(sheet, header)).value ?? "", expected);
    }
  });
  assert.match(html, /實體料名（Part Name）：實體料 A/);
  assert.match(html, /實體料名（Part Name）：實體料 B/);
  assert.doesNotMatch(html, /GROUP (?:NAME|SYMBOL|FOOTPRINT|SPEC) MUST/);
});

test("不建議料匯出 collects the physical part numbers whose 零件狀態 is a usage restriction", () => {
  const rows = moduleExports.collectDiscouragedMaterialRows([
    { refDes: "U9", refGroup: "U9", name: "IC B", manufacturerPartNumber: "MPN-B", manufacturer: "Vendor", partNumber: "000-B", virtualAlternative: "", partUsageStatus: "新設計產品不建議使用 - ODM不建議用料" },
    { refDes: "C1", refGroup: "C1", name: "CAP", manufacturerPartNumber: "MPN-C", manufacturer: "Vendor", partNumber: "", virtualAlternative: "1AT-1", partUsageStatus: "ODM 不建議用料" },
    { refDes: "R1", refGroup: "R1", name: "RES", manufacturerPartNumber: "MPN-R", manufacturer: "Vendor", partNumber: "000-R", virtualAlternative: "", partUsageStatus: "可用" },
    { refDes: "", refGroup: "D2", name: "DIODE", manufacturerPartNumber: "MPN-D", manufacturer: "Vendor", partNumber: "000-D", virtualAlternative: "", partUsageStatus: "" },
  ]);
  assert.deepEqual(rows.map((row) => [row.refDes, row.partNumber, row.partUsageStatus]), [
    ["C1", "", "ODM 不建議用料"],
    ["U9", "000-B", "新設計產品不建議使用 - ODM不建議用料"],
  ]);
  assert.deepEqual(moduleExports.DISCOURAGED_EXPORT_HEADERS, ["Ref Des", "Name", "Manufacturer Part Number", "Manufacturer", "實體料號", "虛擬料號", "零件狀態"]);
});
