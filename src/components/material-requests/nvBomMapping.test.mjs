import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const { loader } = createRequire(import.meta.url)("../../../tests/support/renderHarness.cjs");
const { inferNvBomMapping, inferNvBomMappingAt, getNvBomHeaderAmbiguities, validateNvBomHeaderMapping } =
  loader({})("src/components/material-requests/nvBomMapping.ts");
const sheet = (...rows) => ({ name: "QA", rows });

test("detects a NVIDIA report below its title and separates Number, MPN, Qty and Alt Qty", () => {
  const workbook = sheet(
    ["Nvidia Multi-Level BOM With AML"], ["Target Part :", "ASSEMBLY-A"], ["Execution Time :", "QA"], ["Configuration :", "QA"], [],
    ["Level", "Item Type", "Number", "Name", "Version", "State", "Find #", "Qty", "Alt Qty", "Primary", "Ref Des", "Manufacturer Part Number", "Ordering Restrictions", "Manufacturer"],
    ["2", "Library Part", "0001", "Resistor", "A", "Released", "123", "2", "99", "True", "R1,R2", "R100", "", "QA maker"],
  );
  assert.deepEqual({ ...inferNvBomMapping(workbook) }, { headerRow: 6, partNumber: 3, mpn: 12, manufacturer: 14, description: 4, qty: 8, refs: 11 });
  assert.deepEqual(Array.from(getNvBomHeaderAmbiguities(workbook, 6)), []);
  assert.throws(() => validateNvBomHeaderMapping({ ...inferNvBomMapping(workbook), qty: 9 }, workbook), /Alt Qty.*不是數量/);
});

test("matches localized aliases and keeps the correct positions after column reorder", () => {
  const workbook = sheet(["ＭＰＮ", "參考位號", "製造商", "NVIDIA P／N", "數量", "品名"], ["M-01", "U1", "QA", "0002", "1", "IC"]);
  assert.deepEqual({ ...inferNvBomMapping(workbook) }, { headerRow: 1, partNumber: 4, mpn: 1, manufacturer: 3, description: 6, qty: 5, refs: 2 });
});

test("leaves duplicated field labels for the user to confirm", () => {
  const workbook = sheet(["NV PN", "MPN", "Vendor Part Number", "Qty", "Qty"], ["0001", "A", "B", "1", "2"]);
  const suggested = inferNvBomMapping(workbook);
  assert.equal(suggested.partNumber, 1);
  assert.equal(suggested.mpn, null);
  assert.equal(suggested.qty, null);
  assert.deepEqual(Array.from(getNvBomHeaderAmbiguities(workbook, 1)), ["mpn", "qty"]);
  assert.equal(validateNvBomHeaderMapping({ ...suggested, mpn: 3, qty: 4 }, workbook).mpn, 3);
});

test("a bare Number or conflicting plausible table headers do not choose a source automatically", () => {
  const workbook = sheet(["Number", "Name", "Quantity"], ["1", "Resistor", "2"]);
  assert.equal(inferNvBomMapping(workbook), null);
  assert.equal(inferNvBomMappingAt(workbook, 1).partNumber, null);
  assert.equal(inferNvBomMapping(sheet(["NV PN", "Qty"], ["01", "1"], ["MPN", "Qty"], ["A", "1"])), null);
});

test("blocks swapped identity fields and blank columns while supporting explicit custom headings", () => {
  const workbook = sheet(["NV P/N", "Mfr Part Number", "工程自訂", ""], ["0001", "M-01", "4", "data"]);
  const mapping = inferNvBomMapping(workbook);
  assert.throws(() => validateNvBomHeaderMapping({ ...mapping, partNumber: 2, mpn: 1 }, workbook), /Mfr Part Number.*不是NV／來源料號/);
  assert.throws(() => validateNvBomHeaderMapping({ ...mapping, qty: 4 }, workbook), /空白表頭.*不是數量/);
  assert.equal(validateNvBomHeaderMapping({ ...mapping, qty: 3 }, workbook).qty, 3);
});
