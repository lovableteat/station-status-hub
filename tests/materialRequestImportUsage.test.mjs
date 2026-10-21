import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";

import { buildMaterialDataset, parseMaterialWorkbookFile } from "../src/components/material-requests/materialRequestUtils.ts";
import { MATERIAL_CE_EXAMPLE_ROWS, MATERIAL_CE_FIELDS } from "../src/components/material-requests/materialUploadContract.mjs";

const ceHeaders = MATERIAL_CE_FIELDS.map(field => field.header);
const exampleRow = values => ceHeaders.map((header, index) => Object.hasOwn(values, header) ? values[header] : MATERIAL_CE_EXAMPLE_ROWS[0][index]);

async function importRows(headers, rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("CE BOM").addRows([headers, ...rows]);
  return parseMaterialWorkbookFile(new File([await workbook.xlsx.writeBuffer()], "CE-reviewed.xlsx"));
}

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

for (const alias of ["零件狀態", "Part Usage Status", "Design Usage Status", "新設計使用狀態"]) {
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
