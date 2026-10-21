import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";

import {
  buildMaterialDataset,
  getMaterialBuildRequirements,
  parseMaterialWorkbookFile,
} from "../src/components/material-requests/materialRequestUtils.ts";

async function importRows(headers, rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("CE materials").addRows([headers, ...rows]);
  return parseMaterialWorkbookFile(new File([await workbook.xlsx.writeBuffer()], "CE-materials.xlsx"));
}

test("one shared virtual PN preserves the distinct manufacturer-specific physical parts at one location", async () => {
  const payload = await importRows(
    ["Name", "Ref Des", "Manufacturer", "Manufacturer Part Number", "虛擬料號", "實體料號", "Symbol"],
    [
      ["CAP", "C101", "Maker A", "MPN-A", "000-VIRTUAL-01", "000-PHYSICAL-A", "有"],
      ["CAP", "C101", "Maker B", "MPN-B", "000-VIRTUAL-01", "000-PHYSICAL-B", "無"],
    ],
  );

  assert.deepEqual(payload.records.map(record => [
    record.virtualAlternative, record.partNumber, record.manufacturer, record.manufacturerPartNumber,
  ]), [
    ["000-VIRTUAL-01", "000-PHYSICAL-A", "Maker A", "MPN-A"],
    ["000-VIRTUAL-01", "000-PHYSICAL-B", "Maker B", "MPN-B"],
  ]);
  const dataset = buildMaterialDataset(payload);
  assert.equal(dataset.groups.length, 1);
  assert.equal(dataset.groups[0].records.length, 2);
  assert.deepEqual(dataset.groups[0].internalPartNumbers, ["000-PHYSICAL-A", "000-PHYSICAL-B"]);
  assert.deepEqual(dataset.records.map(record => getMaterialBuildRequirements(record).status), ["complete", "needs-symbol"]);
});

for (const alias of ["實體料號", "實體料", "Physical PN", "Physical Part Number", "Part Number", "PEGA P/N", "PEGA PN"]) {
  test(`${alias} imports as a physical PN without creating a virtual PN`, async () => {
    const payload = await importRows(["Name", "Qty", alias], [["CAP", 1, "000-PHYSICAL-01"]]);
    assert.equal(payload.records[0].partNumber, "000-PHYSICAL-01");
    assert.equal(payload.records[0].virtualAlternative, "");
  });
}

for (const physicalHeader of ["實體料號", "Part Number"]) {
  for (const pegaFirst of [true, false]) {
    test(`${physicalHeader} wins over the legacy PEGA alias with PEGA ${pegaFirst ? "first" : "last"}`, async () => {
      const physicalColumns = pegaFirst
        ? ["PEGA P/N", physicalHeader]
        : [physicalHeader, "PEGA P/N"];
      const physicalValues = pegaFirst
        ? ["LEGACY-PHYSICAL", "000-EXPLICIT-PHYSICAL"]
        : ["000-EXPLICIT-PHYSICAL", "LEGACY-PHYSICAL"];
      const payload = await importRows(
        ["Name", "Ref Des", ...physicalColumns, "虛擬料號"],
        [["CAP", "C101", ...physicalValues, "000-VIRTUAL"]],
      );
      assert.equal(payload.records[0].partNumber, "000-EXPLICIT-PHYSICAL");
      assert.equal(payload.records[0].virtualAlternative, "000-VIRTUAL");
    });
  }
}

test("a legacy PEGA value can fill an empty physical column but never the empty virtual column", async () => {
  const payload = await importRows(
    ["Name", "Ref Des", "實體料號", "PEGA PN", "虛擬料號"],
    [["CAP", "C101", "", "000-PEGA-PHYSICAL", ""]],
  );
  assert.equal(payload.records[0].partNumber, "000-PEGA-PHYSICAL");
  assert.equal(payload.records[0].virtualAlternative, "");
});

for (const virtualHeader of ["虛擬料號", "Virtual PN"]) {
  test(`${virtualHeader} has priority over legacy TX regardless of column order`, async () => {
    for (const txFirst of [true, false]) {
      const virtualColumns = txFirst ? ["TX", virtualHeader] : [virtualHeader, "TX"];
      const virtualValues = txFirst ? ["LEGACY-TX", "000-VIRTUAL"] : ["000-VIRTUAL", "LEGACY-TX"];
      const payload = await importRows(
        ["Name", "Ref Des", ...virtualColumns, "PEGA PN"],
        [["CAP", "C101", ...virtualValues, "000-PHYSICAL"]],
      );
      assert.equal(payload.records[0].virtualAlternative, "000-VIRTUAL");
      assert.equal(payload.records[0].partNumber, "000-PHYSICAL");
    }
  });
}

test("legacy TX remains a virtual alias when the preferred virtual field is empty", async () => {
  const payload = await importRows(
    ["Name", "Ref Des", "Virtual PN", "TX", "實體料號"],
    [["CAP", "C101", "", "LEGACY-TX", "000-PHYSICAL"]],
  );
  assert.equal(payload.records[0].virtualAlternative, "LEGACY-TX");
  assert.equal(payload.records[0].partNumber, "000-PHYSICAL");
});

test("a virtual PN does not invent a missing physical PN or satisfy its Symbol build requirements", async () => {
  const payload = await importRows(
    ["Name", "Ref Des", "虛擬料號", "實體料號", "Symbol"],
    [["CAP", "C101", "000-VIRTUAL", "", "有"]],
  );
  const record = payload.records[0];
  assert.equal(record.partNumber, "");
  assert.equal(record.virtualAlternative, "000-VIRTUAL");
  assert.equal(getMaterialBuildRequirements(record).status, "needs-part");
  assert.equal(buildMaterialDataset(payload).records[0].isReady, false);
});

test("sharing a virtual PN does not merge separate BOM locations", async () => {
  const payload = await importRows(
    ["Name", "Ref Des", "Manufacturer", "Manufacturer Part Number", "虛擬料號", "實體料號"],
    [
      ["CAP", "C101", "Maker A", "MPN-A", "000-VIRTUAL", "000-PHYSICAL-A"],
      ["CAP", "C102", "Maker B", "MPN-B", "000-VIRTUAL", "000-PHYSICAL-B"],
    ],
  );
  const dataset = buildMaterialDataset(payload);
  assert.equal(dataset.groups.length, 2);
  assert.deepEqual(dataset.groups.map(group => group.displayRef), ["C101", "C102"]);
  assert.ok(dataset.groups.every(group => group.records.length === 1));
});

test("legacy second MPN imports remain supported without becoming a company PN", async () => {
  const payload = await importRows(
    ["Name", "Ref Des", "Manufacturer Part Number(1)", "Manufacturer Part Number(2)", "PEGA P/N"],
    [["CAP", "C101", "MPN-A", "MPN-B", "000-PHYSICAL"]],
  );
  const record = payload.records[0];
  assert.equal(record.manufacturerPartNumber, "MPN-A");
  assert.equal(record.manufacturerPartNumberAlt, "MPN-B");
  assert.equal(record.partNumber, "000-PHYSICAL");
  assert.equal(record.virtualAlternative, "");
});

test("building an existing stored payload does not migrate or reinterpret its PN values", async () => {
  const payload = await importRows(
    ["Name", "Ref Des", "MPN", "Virtual PN", "Part Number"],
    [["CAP", "C101", "MPN-A", "PREVIOUSLY-STORED-VIRTUAL", "PREVIOUSLY-STORED-PHYSICAL"]],
  );
  const stored = structuredClone(payload);
  const dataset = buildMaterialDataset(payload);
  assert.deepEqual(payload, stored);
  assert.equal(dataset.records[0].virtualAlternative, "PREVIOUSLY-STORED-VIRTUAL");
  assert.equal(dataset.records[0].partNumber, "PREVIOUSLY-STORED-PHYSICAL");
});
