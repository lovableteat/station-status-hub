import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = ts.transpileModule(fs.readFileSync(new URL("./nvBomCompare.ts", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { compareNvBomSheets, validateNvBomMapping } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const columns = ["NV PN", "MPN", "Manufacturer", "Description", "Qty", "Ref Des"];
const mapping = { headerRow: 1, partNumber: 1, mpn: 2, manufacturer: 3, description: 4, qty: 5, refs: 6 };
const sheet = rows => ({ name: "BOM", rows: [columns, ...rows] });
const part = (pn, mpn, qty = "1", refs = "R1") => [pn, mpn, "Maker", "Part", qty, refs];

test("new and removed original NV parts retain source rows and leading zeros", () => {
  const diff = compareNvBomSheets(sheet([part("001", "KEEP"), part("002", "OLD")]), sheet([part("003", "NEW"), part("001", "KEEP")]), mapping, mapping);
  assert.equal(diff.unchanged, 1);
  assert.deepEqual(diff.changes.map(row => [row.kind, (row.after ?? row.before).partNumber]), [["removed", "002"], ["added", "003"]]);
  assert.deepEqual(diff.changes[0].before.sourceRows, [3]);
  assert.deepEqual(diff.changes[1].after.sourceRows, [2]);
});
test("different header order is mapped without changing source values", () => {
  const after = { name: "New", rows: [["Title"], ["MPN", "Ref Des", "NV PN", "Qty", "Description", "Manufacturer"], ["A", "R2, R1", "001", "2", "Part", "Maker"]] };
  const other = { headerRow: 2, partNumber: 3, mpn: 1, manufacturer: 6, description: 5, qty: 4, refs: 2 };
  const diff = compareNvBomSheets(sheet([part("001", "A", "2", "R1,R2")]), after, mapping, other);
  assert.equal(diff.unchanged, 1); assert.equal(diff.changes.length, 0);
});
test("multiple uses of a part combine exact decimal quantities and locations", () => {
  const diff = compareNvBomSheets(sheet([part("001", "A", "0.1", "R1"), part("001", "A", "0.2", "R2")]), sheet([part("001", "A", "0.3", "R2,R1")]), mapping, mapping);
  assert.equal(diff.unchanged, 1); assert.equal(diff.changes.length, 0);
});
test("same item with quantity and location edits is changed rather than added/removed", () => {
  const diff = compareNvBomSheets(sheet([part("001", "A", "1", "R1")]), sheet([part("001", "A", "2", "R1,R2")]), mapping, mapping);
  assert.equal(diff.changes[0].kind, "changed"); assert.deepEqual(diff.changes[0].changedFields, ["qty", "refs"]);
});
test("a missing manufacturer column is not interpreted as every part being deleted", () => {
  const diff = compareNvBomSheets(sheet([part("001", "A")]), sheet([part("001", "A")]), mapping, { ...mapping, manufacturer: null });
  assert.equal(diff.unchanged, 1); assert.equal(diff.changes.length, 0); assert.match(diff.warnings.join(), /廠商僅一份/);
});
test("rows with no common identifier are reported, and are not collapsed into a made-up part", () => {
  const diff = compareNvBomSheets(sheet([part("001", ""), part("002", ""), part("003", "A")]), sheet([part("003", "A")]), mapping, { ...mapping, partNumber: null });
  assert.equal(diff.beforeCount, 1); assert.equal(diff.unchanged, 1); assert.match(diff.warnings.join(), /舊版 2 列/);
});
test("incompatible identity columns and duplicate AI column mappings are explicit errors", () => {
  assert.throws(() => compareNvBomSheets(sheet([part("001", "A")]), sheet([part("001", "A")]), { ...mapping, mpn: null }, { ...mapping, partNumber: null }), /沒有可共同核對/);
  assert.throws(() => validateNvBomMapping({ ...mapping, mpn: 1 }, sheet([part("001", "A")])), /欄位無法確認/);
});
