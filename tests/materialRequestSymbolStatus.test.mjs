import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";

import {
  buildMaterialDataset,
  getMaterialBuildRequirementLabel,
  getMaterialBuildRequirements,
  getSymbolAvailability,
  parseMaterialWorkbookFile,
} from "../src/components/material-requests/materialRequestUtils.ts";
import { MATERIAL_CE_EXAMPLE_ROWS, MATERIAL_CE_FIELDS } from "../src/components/material-requests/materialUploadContract.mjs";

async function importRows(headers, rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("CE Symbol").addRows([headers, ...rows]);
  return parseMaterialWorkbookFile(new File([await workbook.xlsx.writeBuffer()], "CE-symbol.xlsx"));
}

test("the shared CE examples demonstrate independent Symbol availability and source usage restrictions", async () => {
  const payload = await importRows(MATERIAL_CE_FIELDS.map(field => field.header), MATERIAL_CE_EXAMPLE_ROWS);
  const dataset = buildMaterialDataset(payload);
  assert.equal(dataset.records.length, 4);
  assert.equal(dataset.groups.length, 3);
  assert.deepEqual(dataset.records.map(record => record.symbolStatus), ["無", "C", "有", "無"]);
  assert.deepEqual(dataset.records.map(record => getMaterialBuildRequirements(record).status), [
    "needs-symbol", "needs-confirmation", "complete", "needs-part-symbol",
  ]);
  assert.deepEqual(dataset.records.map(record => record.isReady), [false, false, true, false]);
  assert.ok(dataset.records.every(record => record.isRisk && !record.isApproved), "Part/Symbol completeness does not override usage restrictions");
  assert.ok(dataset.records.every(record => record.trackingHistory.length === 0 && record.actionKind === "other"));
});

test("Symbol availability recognizes only the confirmed explicit values and preserves unknown codes", () => {
  for (const value of ["有", "已建立", "Yes", " YES ", "Ｙｅｓ"]) {
    assert.equal(getSymbolAvailability(value), "present", value);
  }
  for (const value of ["無", "未建立", "No", " no ", "Ｎｏ"]) {
    assert.equal(getSymbolAvailability(value), "missing", value);
  }
  for (const value of [undefined, null, "", " ", "C", "CAP", "待確認", "pending", "1", 1, true, "無法確認", "已有待確認"]) {
    assert.equal(getSymbolAvailability(value), "unknown", String(value));
  }
});

test("build requirements distinguish missing Part and missing Symbol without inferring blank or C", () => {
  const cases = [
    ["000-ABC-00", "無", "needs-symbol", true, false, true],
    ["", "未建立", "needs-part-symbol", false, true, true],
    ["000-ABC-00", "有", "complete", true, false, false],
    ["", "Yes", "needs-part", false, true, false],
    ["000-ABC-00", "", "needs-confirmation", true, false, null],
    ["000-ABC-00", "C", "needs-confirmation", true, false, null],
    ["", "待確認", "needs-confirmation", false, true, null],
  ];
  for (const [partNumber, symbolStatus, status, hasPartNumber, needsPart, needsSymbol] of cases) {
    const result = getMaterialBuildRequirements({ partNumber, symbolStatus });
    assert.deepEqual(result, {
      status, hasPartNumber, needsPart, needsSymbol,
      symbolAvailability: getSymbolAvailability(symbolStatus),
    });
  }
});

test("the shared build labels describe each source combination and never infer legacy Symbol names", () => {
  const cases = [
    [{ partNumber: "000-ABC-00", symbolStatus: "無" }, "已有 Part，待補 Symbol"],
    [{ partNumber: "", symbolStatus: "無" }, "待補 Part／Symbol"],
    [{ partNumber: "", symbolStatus: "有" }, "已有 Symbol，待補 Part"],
    [{ partNumber: "000-ABC-00", symbolStatus: "有" }, "Part／Symbol 已齊備"],
    [{ partNumber: "000-ABC-00", symbolStatus: "C" }, "已有 Part，Symbol 待確認"],
    [{ partNumber: "", symbolStatus: "" }, "Part 待補，Symbol 待確認"],
    [{ partNumber: "000-ABC-00", schematicPart: "CAP" }, "已有 Part，Symbol 待確認"],
  ];
  for (const [record, expected] of cases) assert.equal(getMaterialBuildRequirementLabel(record), expected);
});

for (const alias of ["Symbol", "Symbol Status", "Symbol建置狀態", "Symbol 建置狀態", "Symbol 狀態"]) {
  test(`${alias} imports availability separately from Schematic_Part name and RD tracking`, async () => {
    const payload = await importRows(
      ["Name", "Qty", "Ref Des", "MPN", "Part Number", alias, "Schematic_Part", "Sourcing Status"],
      [["Capacitor", 1, "C1", "MPN-C1", "000-CAP-00", "C", "CAP_DECOUPLING", "Approved"]],
    );
    const raw = payload.records[0];
    assert.equal(raw.symbolStatus, "C");
    assert.equal(raw.schematicPart, "CAP_DECOUPLING");
    assert.equal(raw.partNumber, "000-CAP-00");
    assert.deepEqual(raw.trackingHistory, []);
    assert.equal(raw.remark, "");
    const record = buildMaterialDataset(payload).records[0];
    assert.equal(getMaterialBuildRequirements(record).status, "needs-confirmation");
    assert.equal(record.actionKind, "other");
    assert.ok(record.searchText.includes("cap_decoupling"));
  });
}

test("a blank Symbol cell is retained as an unfilled status instead of a missing Symbol", async () => {
  const payload = await importRows(
    ["Name", "Ref Des", "Part Number", "Symbol", "Schematic_Part"],
    [["IC", "U1", "000-IC-00", "", "POWER_IC"]],
  );
  assert.ok(Object.hasOwn(payload.records[0], "symbolStatus"));
  assert.equal(payload.records[0].symbolStatus, "");
  assert.equal(getMaterialBuildRequirements(payload.records[0]).needsSymbol, null);
  assert.equal(getMaterialBuildRequirements(payload.records[0]).status, "needs-confirmation");
});

test("legacy Schematic_Part stays a name and does not manufacture Symbol availability or alter manual remarks", async () => {
  const payload = await importRows(
    ["Name", "Ref Des", "Part Number", "Schematic_Part"],
    [["IC", "U1", "000-IC-00", "POWER_IC"]],
  );
  const raw = payload.records[0];
  assert.equal(raw.schematicPart, "POWER_IC");
  assert.ok(!Object.hasOwn(raw, "symbolStatus"));
  assert.equal(getMaterialBuildRequirements(raw).status, "needs-confirmation");
  assert.equal(buildMaterialDataset(payload).records[0].isReady, true);
  const manual = buildMaterialDataset({ ...payload, records: [{ ...raw, remark: "需申請 Symbol" }] }).records[0];
  assert.equal(manual.remark, "需申請 Symbol");
  assert.equal(manual.actionKind, "pending-symbol");
  assert.equal(manual.isPending, true);
  assert.equal(manual.isReady, false);
});

test("explicit Symbol source gaps constrain readiness while leaving manual actions and tracking intact", async () => {
  const payload = await importRows(
    ["Name", "Ref Des", "Part Number", "Symbol", "Schematic_Part"],
    [
      ["IC", "U1", "000-IC-00", "無", "POWER_IC"],
      ["IC", "U2", "000-IC-00", "C", "POWER_IC"],
      ["IC", "U3", "000-IC-00", "有", "POWER_IC"],
      ["IC", "U4", "", "有", "POWER_IC"],
      ["IC", "U5", "000-IC-00", "", "POWER_IC"],
    ],
  );
  const records = buildMaterialDataset({
    ...payload,
    records: payload.records.map(record => ({ ...record, remark: "OK" })),
  }).records;
  assert.deepEqual(records.map(record => record.isReady), [false, false, true, false, false]);
  assert.deepEqual(records.map(record => record.isPreferred), [false, false, true, false, false]);
  assert.ok(records.every(record => record.actionKind === "ok" && record.remark === "OK"));
  assert.ok(records.every(record => record.isPending === false), "source gaps must not rewrite manual pending or create applications");
  assert.ok(records.every(record => record.trackingHistory.length === 0));

  const manualPending = buildMaterialDataset({
    ...payload,
    records: [{ ...payload.records[2], remark: "需申請 Symbol" }],
  }).records[0];
  assert.equal(getMaterialBuildRequirements(manualPending).status, "complete");
  assert.equal(manualPending.isReady, false, "complete source fields must not erase a manual pending action");
  assert.equal(manualPending.isPending, true);
  assert.equal(manualPending.actionKind, "pending-symbol");
});
