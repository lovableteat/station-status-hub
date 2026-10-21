import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ExcelJS from "exceljs";
import ts from "typescript";

import { buildMaterialDataset, getLatestTrackingEntry, parseMaterialWorkbookFile } from "../src/components/material-requests/materialRequestUtils.ts";
import {
  MATERIAL_CE_DATA_START_ROW,
  MATERIAL_CE_EXAMPLE_ROWS,
  MATERIAL_CE_FIELDS,
  MATERIAL_CE_HEADER_ROW,
  MATERIAL_CE_LEGACY_MEANING_SCHEMAS,
  MATERIAL_CE_MEANING_ROW,
} from "../src/components/material-requests/materialUploadContract.mjs";

const ceHeaders = MATERIAL_CE_FIELDS.map(field => field.header);
const ceMeanings = MATERIAL_CE_FIELDS.map(field => field.meaning);
const exampleRow = values => ceHeaders.map((header, index) => Object.hasOwn(values, header) ? values[header] : MATERIAL_CE_EXAMPLE_ROWS[0][index]);

async function importRows(headers, rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("CE BOM").addRows([headers, ...rows]);
  return parseMaterialWorkbookFile(new File([await workbook.xlsx.writeBuffer()], "CE-reviewed.xlsx"));
}

async function importTemplateRows(rows, { meanings = ceMeanings, headers = ceHeaders, blueGroupRows = [] } = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("上傳資料");
  sheet.getRow(1).values = ["CE BOM 交付格式"];
  sheet.getRow(MATERIAL_CE_HEADER_ROW).values = headers;
  if (meanings) sheet.getRow(MATERIAL_CE_MEANING_ROW).values = meanings;
  const firstRow = meanings ? MATERIAL_CE_DATA_START_ROW : MATERIAL_CE_MEANING_ROW;
  rows.forEach((row, index) => { sheet.getRow(firstRow + index).values = row; });
  for (const dataIndex of blueGroupRows) {
    sheet.getCell(firstRow + dataIndex, headers.indexOf("Name") + 1).fill = {
      type: "pattern", pattern: "solid", fgColor: { argb: "FFDCEAF7" },
    };
  }
  return parseMaterialWorkbookFile(new File([await workbook.xlsx.writeBuffer()], "CE-format.xlsx"));
}

test("the CE meaning row is metadata and an otherwise blank new format has no material records", async () => {
  assert.equal(MATERIAL_CE_HEADER_ROW, 4);
  assert.equal(MATERIAL_CE_MEANING_ROW, 5);
  assert.equal(MATERIAL_CE_DATA_START_ROW, 6);
  assert.equal(ceMeanings.length, 15);
  assert.ok(!ceHeaders.includes("Symbol"));
  assert.equal(ceMeanings[ceHeaders.indexOf("Schematic_Part")], "原理圖符號(orcad要能叫出原理圖符號)");
  assert.equal(ceMeanings[ceHeaders.indexOf("PCB_Footprint")], "零件footprint");
  assert.ok(ceMeanings.every(value => typeof value === "string" && value.trim()));
  await assert.rejects(importTemplateRows([]), /找不到可解析的料號資料/);
});

test("the first CE record starts at row 6 without a Symbol property and retains independent source statuses", async () => {
  const payload = await importTemplateRows([MATERIAL_CE_EXAMPLE_ROWS[1]]);
  assert.equal(payload.recordCount, 1);
  assert.equal(payload.records[0].sourceRow, MATERIAL_CE_DATA_START_ROW);
  assert.equal(payload.records[0].manufacturerPartNumber, "DEMO-CAP-ALT");
  assert.equal(Object.hasOwn(payload.records[0], "symbolStatus"), false);
  assert.equal(payload.records[0].sourcingStatus, "Approved");
  assert.match(payload.records[0].partUsageStatus, /ODM 不建議用料/);
  assert.deepEqual(payload.records[0].trackingHistory, []);
});

test("legacy CE records directly below the row 4 header remain data at row 5", async () => {
  const payload = await importTemplateRows([MATERIAL_CE_EXAMPLE_ROWS[0]], { meanings: null });
  assert.equal(payload.recordCount, 1);
  assert.equal(payload.records[0].sourceRow, 5);
  assert.equal(payload.records[0].partNumber, "000-DEMO-001");
});

test("a real row with a Chinese name and a nonnumeric Level is not mistaken for CE meanings", async () => {
  const payload = await importTemplateRows([
    exampleRow({ Level: "料件層級", Name: "電源輸入濾波電容", "Manufacturer Part Number": "REAL-CAP-001" }),
  ], { meanings: null });
  assert.equal(payload.recordCount, 1);
  assert.equal(payload.records[0].sourceRow, 5);
  assert.equal(payload.records[0].name, "電源輸入濾波電容");
  assert.equal(payload.records[0].manufacturerPartNumber, "REAL-CAP-001");
});

test("all CE meanings must match before any row is discarded", async () => {
  const similarRow = ceMeanings.map((value, index) => index === 1 ? "實際料名" : value);
  const payload = await importTemplateRows([], { meanings: similarRow });
  assert.equal(payload.recordCount, 1);
  assert.equal(payload.records[0].sourceRow, 5);
  assert.equal(payload.records[0].name, "實際料名");
});

test("meaning detection follows the mapped headers if the CE columns are rearranged or aliased", async () => {
  const reverse = values => values.toReversed();
  const headers = reverse(ceHeaders).map(header => header === "Manufacturer Part Number" ? "MPN" : header);
  const payload = await importTemplateRows([reverse(MATERIAL_CE_EXAMPLE_ROWS[1])], {
    headers,
    meanings: reverse(ceMeanings),
  });
  assert.equal(payload.recordCount, 1);
  assert.equal(payload.records[0].sourceRow, 6);
  assert.equal(payload.records[0].manufacturerPartNumber, "DEMO-CAP-ALT");
  assert.equal(payload.records[0].partNumber, "000-DEMO-ALT");
  assert.equal(Object.hasOwn(payload.records[0], "symbolStatus"), false);
});

test("Level 0 and Level 1 context is retained after the CE meanings and in old row 5 files", async () => {
  const hierarchy = [
    exampleRow({ Level: 0, Name: "系統 A" }),
    exampleRow({ Level: 1, Name: "模組 B" }),
    MATERIAL_CE_EXAMPLE_ROWS[0],
  ];
  for (const meanings of [ceMeanings, null]) {
    const payload = await importTemplateRows(hierarchy, { meanings });
    assert.equal(payload.recordCount, 1);
    assert.equal(payload.records[0].sectionName, "系統 A");
    assert.equal(payload.records[0].assemblyName, "模組 B");
    assert.equal(payload.records[0].sourceRow, meanings ? 8 : 7);
  }
});

for (const schema of MATERIAL_CE_LEGACY_MEANING_SCHEMAS) {
  test(`the exact previous ${schema.length}-column meaning row remains metadata and preserves legacy Symbol`, async () => {
    const oldHeaders = schema.map(field => field.header);
    const oldMeanings = schema.map(field => field.meaning);
    const currentValues = new Map(ceHeaders.map((header, index) => [header, MATERIAL_CE_EXAMPLE_ROWS[1][index]]));
    const oldRow = oldHeaders.map(header => header === "Symbol" ? "C" : currentValues.get(header));
    for (const meanings of [oldMeanings, null]) {
      const payload = await importTemplateRows([oldRow], { headers: oldHeaders, meanings });
      assert.equal(payload.recordCount, 1);
      assert.equal(payload.records[0].id, "上傳資料-4");
      assert.equal(payload.records[0].sourceRow, meanings ? 6 : 5);
      assert.equal(payload.records[0].symbolStatus, "C");
      assert.match(payload.records[0].partUsageStatus, /ODM 不建議用料/);
      assert.equal(Object.hasOwn(payload.records[0], "phaseOutStatus"), oldHeaders.includes("phase out"));
      if (oldHeaders.includes("phase out")) assert.equal(payload.records[0].phaseOutStatus, "ACTIVE");
    }
  });
}

test("adding the meaning row preserves record, blue-group and imported-tracking identities", async () => {
  const headers = [...ceHeaders, "料號追蹤", "單號", "EE"];
  const rows = [
    [...exampleRow({ Name: "料件 A", "Ref Des": "C1", "Manufacturer Part Number": "MPN-A" }), "來源追蹤 A", "REQ-A", "RD-A"],
    [...exampleRow({ Name: "料件 B", "Ref Des": "C2", "Manufacturer Part Number": "MPN-B" }), "來源追蹤 B", "REQ-B", "RD-B"],
  ];
  const options = { headers, blueGroupRows: [0, 1] };
  const oldPayload = await importTemplateRows(rows, { ...options, meanings: null });
  const newPayload = await importTemplateRows(rows, { ...options, meanings: [...ceMeanings, "", "", ""] });
  assert.deepEqual(newPayload.records.map(record => record.id), oldPayload.records.map(record => record.id));
  assert.deepEqual(newPayload.records.map(record => record.sourceGroupKey), oldPayload.records.map(record => record.sourceGroupKey));
  assert.deepEqual(newPayload.records.map(record => record.trackingHistory[0].id), oldPayload.records.map(record => record.trackingHistory[0].id));
  assert.deepEqual(oldPayload.records.map(record => record.sourceRow), [5, 6]);
  assert.deepEqual(newPayload.records.map(record => record.sourceRow), [6, 7]);

  const page = await readFile(new URL("../src/components/material-requests/MaterialRequestPage.tsx", import.meta.url), "utf8");
  const helpers = page.slice(page.indexOf("function isImportedTrackingEntry("), page.indexOf("function getBestTrackingRecord("));
  const merge = page.slice(page.indexOf("function mergeImportedWorkspace("), page.indexOf("function parseSearchTokens("));
  assert.ok(helpers.includes("function mergeTrackingHistories("));
  assert.ok(merge.includes("const existingRecords"));
  const compiled = ts.transpileModule(`${helpers}\n${merge}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const mergeImportedWorkspace = vm.runInNewContext(`${compiled}; mergeImportedWorkspace`, { getLatestTrackingEntry });
  const existingPayload = {
    ...oldPayload,
    records: oldPayload.records.map((record, index) => ({
      ...record,
      remark: `RD 手動備註 ${index + 1}`,
      trackingHistory: [...record.trackingHistory, {
        id: `manual-${index + 1}`, status: "處理中", note: `RD 手動追蹤 ${index + 1}`,
        createdAt: "2026-10-21T00:00:00.000Z", images: [],
      }],
    })),
  };
  const merged = mergeImportedWorkspace({ id: "bom:ce-format", payload: existingPayload }, "bom:ce-format", newPayload);
  assert.equal(merged.payload.records.length, 2);
  for (const [index, record] of merged.payload.records.entries()) {
    assert.equal(record.manufacturerPartNumber, index === 0 ? "MPN-A" : "MPN-B");
    assert.equal(record.remark, `RD 手動備註 ${index + 1}`);
    assert.deepEqual(Array.from(record.trackingHistory, entry => entry.id), [oldPayload.records[index].trackingHistory[0].id, `manual-${index + 1}`]);
    assert.equal(record.trackingHistory.at(-1).note, `RD 手動追蹤 ${index + 1}`);
  }
});

test("the shared CE example imports four rows and three groups while keeping source statuses independent", async () => {
  const payload = await importRows(ceHeaders, MATERIAL_CE_EXAMPLE_ROWS);
  assert.equal(payload.recordCount, 4);
  const record = payload.records[1];
  assert.equal(record.sourcingStatus, "Approved");
  assert.equal(record.partUsageStatus, "新設計產品不建議使用-ODM 不建議用料");
  assert.equal(payload.records[0].partUsageStatus, "待確認");
  assert.ok(payload.records.every(item => item.trackingHistory.length === 0));
  assert.ok(payload.records.every(item => item.trackingStatus === "" && item.trackingNote === "" && item.remark === ""));

  const dataset = buildMaterialDataset(payload);
  assert.equal(dataset.groups.length, 3);
  assert.ok(dataset.records.every(item => item.isRisk));
  assert.ok(dataset.records.every(item => !item.isApproved), "Approved/Active cannot override a CE usage restriction or 待確認");
  assert.ok(dataset.records[1].searchText.includes("odm 不建議用料"));
  assert.equal(dataset.stats.riskRecords, 4);
});

for (const alias of ["新設計使用限制", "零件狀態", "Part Usage Status", "Design Usage Status", "新設計使用狀態"]) {
  test(`usage header ${alias} preserves its own value alongside Sourcing Status`, async () => {
    const payload = await importRows(
      ceHeaders.map(header => header === "零件狀態" ? alias : header),
      [exampleRow({ "Sourcing Status": "Active", "零件狀態": "禁用" })],
    );
    assert.equal(payload.records[0].sourcingStatus, "Active");
    assert.equal(payload.records[0].partUsageStatus, "禁用");
    assert.deepEqual(payload.records[0].trackingHistory, []);
  });
}

for (const alias of ["phase out", "Phaseout", "Phase Out Status", "零件狀態（phase out）"]) {
  test(`${alias} preserves company part status independently of sourcing and design usage restrictions`, async () => {
    const payload = await importRows(
      ["Name", "Ref Des", "MPN", "Sourcing Status", alias, "零件狀態", "Symbol"],
      [["CAP", "C1", "MPN-1", "Approved", "ACTIVE", "ODM 不建議用料", "C"]],
    );
    assert.equal(payload.records[0].phaseOutStatus, "ACTIVE");
    assert.equal(payload.records[0].sourcingStatus, "Approved");
    assert.equal(payload.records[0].partUsageStatus, "ODM 不建議用料");
    assert.equal(payload.records[0].symbolStatus, "C");
    assert.deepEqual(payload.records[0].trackingHistory, []);
    const record = buildMaterialDataset(payload).records[0];
    assert.equal(record.isRisk, true);
    assert.equal(record.isApproved, false);
    assert.ok(record.searchText.includes("active"));
  });
}

test("phase-out values remain raw and do not change sourcing approval, readiness, risk or Symbol", async () => {
  const values = ["PHASEOUT", "PHASE OUT", "Obsolete", "NRND", "ACTIVE", "UNDERREVIEW", "prePHASEOUT", ""];
  const payload = await importRows(
    ["Name", "Ref Des", "MPN", "phase out", "零件狀態", "Sourcing Status", "實體料號", "Symbol"],
    values.map((value, index) => [`IC ${index}`, `U${index + 1}`, `MPN-${index + 1}`, value, "", "Approved", "000-IC-00", "C"]),
  );
  assert.deepEqual(payload.records.map(record => record.phaseOutStatus), values);
  assert.ok(payload.records.every(record => record.sourcingStatus === "Approved" && record.partUsageStatus === "" && record.symbolStatus === "C"));
  const dataset = buildMaterialDataset(payload);
  assert.ok(dataset.records.every(record => record.isRisk === false && record.isApproved === true && record.isReady === true), "phase out and a retained legacy Symbol code must not classify or gate readiness");
  assert.ok(dataset.records[5].searchText.includes("underreview"));

  const withoutSourcing = await importRows(
    ["Name", "Ref Des", "phase out", "Symbol"],
    [["CAP", "C1", "ACTIVE", "無"], ["CAP", "C2", "ACTIVE", "有"]],
  );
  assert.deepEqual(withoutSourcing.records.map(record => record.symbolStatus), ["無", "有"]);
  assert.ok(withoutSourcing.records.every(record => record.phaseOutStatus === "ACTIVE"));
  assert.ok(buildMaterialDataset(withoutSourcing).records.every(record => record.isApproved === false), "raw ACTIVE must not create a sourcing approval");
});

test("a legacy bare 零件狀態 column retains its design-restriction meaning", async () => {
  const payload = await importRows(
    ["Name", "Ref Des", "MPN", "零件狀態"],
    [["CAP", "C1", "MPN-1", "ODM 不建議用料"]],
  );
  const record = payload.records[0];
  assert.equal(record.partUsageStatus, "ODM 不建議用料");
  assert.equal(Object.hasOwn(record, "phaseOutStatus"), false);
  assert.equal(Object.hasOwn(buildMaterialDataset(payload).records[0], "phaseOutStatus"), false);
});

test("CE usage risk terms remain distinct from ordinary sourcing status", async () => {
  const values = ["禁用", "ODM 不建議用料", "新設計產品不建議使用", "新設計產品不建議使用-EOL", "待確認", "可用", ""];
  const payload = await importRows(
    ceHeaders,
    values.map((value, index) => exampleRow({ "Ref Des": `U${index + 1}`, Ref_tmp: `U${index + 1}`, "Sourcing Status": "Approved", "零件狀態": value })),
  );
  const dataset = buildMaterialDataset(payload);
  assert.deepEqual(dataset.records.map(record => record.isRisk), [true, true, true, true, true, false, false]);
  assert.deepEqual(dataset.records.map(record => record.isApproved), [false, false, false, false, false, true, true]);
  assert.deepEqual(dataset.records.map(record => record.partUsageStatus), values);
  assert.ok(dataset.records.every(record => record.trackingHistory.length === 0));
});

test("legacy workbooks omit the optional usage field and retain sourcing risk behavior", async () => {
  const payload = await importRows(
    ["Name", "Qty", "Ref Des", "MPN", "Sourcing Status"],
    [["R", 1, "R1", "MPN-1", "Approved"], ["C", 1, "C1", "MPN-2", "Obsolete"]],
  );
  assert.ok(payload.records.every(record => !Object.hasOwn(record, "partUsageStatus")));
  const dataset = buildMaterialDataset(payload);
  assert.deepEqual(dataset.records.map(record => record.isRisk), [false, true]);
  assert.deepEqual(dataset.records.map(record => record.isApproved), [true, false]);
  assert.ok(dataset.records.every(record => !Object.hasOwn(record, "partUsageStatus")));
});

test("location aliases Ref Des so equal names at R1 and R2 are not merged", async () => {
  const payload = await importRows(
    ["Name", "Qty", " location ", "MPN"],
    [["Resistor", 1, "R1", "MPN-R1"], ["Resistor", 1, "R2", "MPN-R2"]],
  );
  assert.deepEqual(payload.records.map(record => record.refDes), ["R1", "R2"]);
  const dataset = buildMaterialDataset(payload);
  assert.equal(dataset.groups.length, 2);
  assert.deepEqual(dataset.groups.map(group => group.displayRef), ["R1", "R2"]);
});

test("RD tracking imports only its own fields when a CE usage restriction is present", async () => {
  const payload = await importRows(
    ["Name", "Qty", "MPN", "Sourcing Status", "零件狀態", "料號追蹤", "單號", "EE"],
    [["IC", 1, "MPN-IC", "Approved", "禁用", "已提出申請", "REQ-1", "RD owner"]],
  );
  const record = payload.records[0];
  assert.equal(record.partUsageStatus, "禁用");
  assert.equal(record.sourcingStatus, "Approved");
  assert.equal(record.trackingHistory.length, 1);
  assert.equal(record.trackingHistory[0].note, "已提出申請");
  assert.equal(record.trackingHistory[0].requestInfo, "REQ-1");
  assert.equal(record.trackingHistory[0].createdBy, "RD owner");
  assert.equal(record.trackingHistory[0].status, "處理中");
});
