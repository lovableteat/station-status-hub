import assert from "node:assert/strict";
import test from "node:test";
import XLSX from "xlsx";
import { compareNvBomSheets, readNvBomFile, validateNvBomMapping } from "./nvBomCompare.ts";

const columns = ["NV PN", "MPN", "Manufacturer", "Description", "Qty", "Ref Des"];
const mapping = { headerRow: 1, partNumber: 1, mpn: 2, manufacturer: 3, description: 4, qty: 5, refs: 6 };
const sheet = rows => ({ name: "BOM", rows: [columns, ...rows] });
const part = (pn, mpn, qty = "1", refs = "R1") => [pn, mpn, "Maker", "Part", qty, refs];

test("new and removed original NV parts retain source rows and leading zeros", () => {
  const diff = compareNvBomSheets(sheet([part("001", "KEEP"), part("002", "OLD", "1", "R2")]), sheet([part("003", "NEW", "1", "R3"), part("001", "KEEP")]), mapping, mapping);
  assert.equal(diff.unchanged, 1);
  assert.deepEqual(diff.changes.map(row => [row.kind, (row.after ?? row.before).partNumber]), [["removed", "002"], ["added", "003"]]);
  assert.deepEqual(diff.changes[0].before.sourceRows, [3]);
  assert.deepEqual(diff.changes[1].after.sourceRows, [2]);
});

test("an NV Green Factor summary stays out of material results and preserves real source rows", () => {
  const headers = ["Level", "Parent Number", "Part Number", "Part Description", "Manufacturer", "Manufacturer Part Number", "Qty", "Location"];
  const nvMapping = { headerRow: 2, partNumber: 3, description: 4, manufacturer: 5, mpn: 6, qty: 7, refs: 8 };
  const keep = ["A", "QA-PARENT", "QA-KEEP", "Alternate", "QA maker", "QA-MPN-KEEP", "1", ""];
  const before = { name: "QA", rows: [["Report"], headers, ["2", "QA-PARENT", "QA-OLD", "Resistor", "QA maker", "QA-MPN-OLD", "1", "R1"], keep, [],
    ["Green Factor Type Summary"], ["Green Factor", "Count"], ["Compliant", "2"]] };
  const same = compareNvBomSheets(before, before, nvMapping, nvMapping);
  assert.equal(same.unchanged, 2);
  assert.deepEqual(same.changes, []);
  assert.deepEqual(same.unresolved, []);

  const replacement = ["2", "QA-PARENT", "QA-REPLACEMENT", "Resistor", "QA maker", "QA-MPN-REPLACEMENT", "1", "R1"];
  const diff = compareNvBomSheets(before, { ...before, rows: before.rows.map((row, index) => index === 2 ? replacement : row) }, nvMapping, nvMapping);
  assert.deepEqual(diff.changes.map(change => [change.kind, change.before?.sourceRows, change.after?.sourceRows]), [["changed", [3], [3]]]);
  assert.deepEqual(diff.unresolved, []);

  const removed = compareNvBomSheets(before, { ...before, rows: before.rows.filter((_, index) => index !== 2) }, nvMapping, nvMapping);
  assert.deepEqual(removed.changes.map(change => [change.kind, change.before?.sourceRows]), [["removed", [3]]]);
  assert.deepEqual(removed.unresolved, []);

  const malformedMaterial = { ...before, rows: [...before.rows, ["2", "QA-PARENT"]] };
  const incomplete = compareNvBomSheets(malformedMaterial, malformedMaterial, nvMapping, nvMapping);
  assert.deepEqual(incomplete.unresolved.map(row => row.part.sourceRows), [[9], [9]]);
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

test("a unique placement with a replacement shows one change with both source rows", () => {
  const diff = compareNvBomSheets(sheet([part("001", "OLD", "1", "U17")]), sheet([part("002", "NEW", "1", "U17")]), mapping, mapping);
  assert.equal(diff.unresolved.length, 0);
  assert.deepEqual(diff.changes.map(({ kind, changedFields }) => [kind, changedFields]), [["changed", ["partNumber", "mpn"]]]);
  assert.deepEqual(diff.changes[0].before.sourceRows, [2]);
  assert.deepEqual(diff.changes[0].after.sourceRows, [2]);
});

test("one newly filled identifier with the same unique identity is a change", () => {
  const diff = compareNvBomSheets(sheet([part("001", "", "1", "-")]), sheet([part("001", "NEW", "1", "-")]), mapping, mapping);
  assert.deepEqual(diff.changes.map(({ kind, changedFields }) => [kind, changedFields]), [["changed", ["mpn"]]]);
  assert.equal(diff.unresolved.length, 0);
});

test("a compatible MPN takes precedence over a new occupant at the old placement", () => {
  const before = sheet([["", "A", "", "Part", "1", "R1"]]);
  const after = sheet([part("", "A", "1", "R2"), part("", "B", "1", "R1")]);
  const diff = compareNvBomSheets(before, after, mapping, mapping);
  assert.deepEqual(diff.changes.map(({ kind, before, after }) => [kind, before?.mpn, after?.mpn]), [["changed", "A", "A"], ["added", undefined, "B"]]);
  assert.deepEqual(diff.changes[0].changedFields, ["manufacturer", "refs"]);
  assert.equal(diff.unresolved.length, 0);
});

test("a location cannot overrule another plausible MPN with conflicting manufacturer", () => {
  const before = sheet([part("", "A", "1", "R1")]);
  const after = sheet([["", "A", "Other Maker", "Part", "1", "R2"], part("", "B", "1", "R1")]);
  const diff = compareNvBomSheets(before, after, mapping, mapping);
  assert.deepEqual(diff.changes, []);
  assert.equal(diff.unresolved.length, 3);
});

test("different sole identifiers with the same placement are listed for manual review", () => {
  const diff = compareNvBomSheets(sheet([part("001", "", "1", "R1")]), sheet([part("", "A", "1", "R1")]), mapping, mapping);
  assert.deepEqual(diff.changes, []);
  assert.deepEqual(diff.unresolved.map(({ side, part }) => [side, part.sourceRows]), [["before", [2]], ["after", [2]]]);
});

test("one-sided identity values alone cannot prove additions or removals", () => {
  const diff = compareNvBomSheets(sheet([part("001", "", "1", "-")]), sheet([part("", "A", "1", "-")]), mapping, mapping);
  assert.deepEqual(diff.changes, []);
  assert.equal(diff.unresolved.length, 2);
  assert.ok(diff.unresolved.every(row => row.reason.includes("識別欄位填寫不一致")));
});

test("reused reference designators do not turn unrelated AML rows into a replacement", () => {
  const before = sheet([part("001", "KEEP"), part("002", "OLD")]);
  const after = sheet([part("003", "NEW"), part("001", "KEEP")]);
  const diff = compareNvBomSheets(before, after, mapping, mapping);
  assert.equal(diff.unchanged, 1);
  assert.deepEqual(diff.changes, []);
  assert.deepEqual(diff.unresolved.map(({ side, part }) => [side, part.mpn]), [["before", "OLD"], ["after", "NEW"]]);
});

test("overlapping duplicate quantities and conflicting descriptions remain visible as original rows", () => {
  const before = sheet([part("001", "A", "1", "R1"), part("001", "A", "1", "R1"), part("002", "B", "1", "R2"), ["002", "B", "Maker", "Different description", "1", "R3"]]);
  const after = sheet([part("001", "A", "2", "R1"), part("002", "B", "2", "R2,R3")]);
  const diff = compareNvBomSheets(before, after, mapping, mapping);
  assert.deepEqual(diff.changes, []);
  assert.equal(diff.unchanged, 0);
  assert.deepEqual(diff.unresolved.map(({ id, part }) => [id, part.qty]), [["before:2", "1"], ["before:3", "1"], ["before:4", "1"], ["before:5", "1"], ["after:2", "2"], ["after:3", "2"]]);
});

test("an additional approved manufacturer stays an addition and does not inflate quantity", () => {
  const original = part("001", "A");
  const diff = compareNvBomSheets(sheet([original]), sheet([original, ["001", "B", "Alternate", "Part", "1", "R1"]]), mapping, mapping);
  assert.equal(diff.unchanged, 1);
  assert.deepEqual(diff.changes.map(({ kind, after }) => [kind, after.mpn, after.qty]), [["added", "B", "1"]]);
  assert.deepEqual(diff.unresolved, []);
});

test("repeated headers are omitted while preserving each original Excel row number", () => {
  const diff = compareNvBomSheets(sheet([part("001", "OLD", "1", "R1")]), sheet([columns, part("002", "NEW", "1", "R2")]), mapping, mapping);
  assert.deepEqual(diff.changes.map(({ kind, before, after }) => [kind, (before ?? after).sourceRows]), [["removed", [2]], ["added", [3]]]);
});

test("the reader preserves physical Excel columns and rows and leading-zero CSV identifiers", async () => {
  const book = XLSX.utils.book_new(), worksheet = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(worksheet, [["NV PN", "MPN"], ["000001", "0002"]], { origin: "B6" });
  XLSX.utils.book_append_sheet(book, worksheet, "Coordinates");
  const xlsx = await readNvBomFile(new File([XLSX.write(book, { type: "array", bookType: "xlsx" })], "coordinates.xlsx"));
  assert.deepEqual(xlsx.sheets[0].rows[5], ["", "NV PN", "MPN"]);
  assert.deepEqual(xlsx.sheets[0].rows[6], ["", "000001", "0002"]);
  const csv = await readNvBomFile(new File(["NV PN,MPN\n000001,0002"], "leading-zero.csv"));
  assert.deepEqual(csv.sheets[0].rows[1], ["000001", "0002"]);
});
