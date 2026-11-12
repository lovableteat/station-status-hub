import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const { loader } = createRequire(import.meta.url)("./support/renderHarness.cjs");
const { buildNvBomTableIndex, matchNvBomTableChange } = loader({})("src/components/material-requests/nvBomTableMatch.ts");

const record = (id, refDes, manufacturerPartNumber, extra = {}) => ({
  id, refDes, manufacturerPartNumber, refGroup: "", manufacturerPartNumberAlt: "",
  manufacturer: "Vendor", partNumber: "PEGA-PHYSICAL", virtualAlternative: "PEGA-VIRTUAL", ...extra,
});
const part = (refs, mpn, partNumber = "NV-001") => ({ refs, mpn, partNumber, manufacturer: "", description: "", qty: "1", sourceRows: [2] });
const change = (before, after) => ({ id: "diff", kind: before ? (after ? "changed" : "removed") : "added", before, after, changedFields: [] });
const match = (changeValue, records) => matchNvBomTableChange(changeValue, buildNvBomTableIndex("current-bom", records));

test("matching uses the exact alternate vendor row and reports its saved PEGA fields", () => {
  const records = [record("primary", "C1", "MAIN"), record("alternate", "C1,C2", "ABC-01"), record("unrelated", "C10", "ABC-01")];
  const result = match(change(undefined, part("ｃ１；C2", "abc-01")), records);
  assert.equal(result.state, "matched");
  assert.equal(result.candidates.length, 1);
  assert.deepEqual({ ...result.candidates[0] }, {
    id: "alternate", workspaceId: "current-bom", refDes: "C1,C2", mpn: "ABC-01", manufacturer: "Vendor",
    physicalPartNumber: "PEGA-PHYSICAL", virtualPartNumber: "PEGA-VIRTUAL",
  });
});

test("NV part numbers, prefixes, partial placement coverage and ranges cannot locate a row", () => {
  const records = [record("r1", "R1", "PART-001", { partNumber: "NV-001" }), record("r10", "R10", "PART-010")];
  for (const value of [part("R1", ""), part("R1", "PART"), part("R10", "PART-001"), part("R1,R2", "PART-001"), part("R1-R2", "PART-001")]) {
    assert.equal(match(change(undefined, value), records).state, "missing");
  }
  assert.equal(matchNvBomTableChange(change(undefined, part("R1", "PART-001")), null).state, "unavailable");
});

test("different old and new records or duplicate location matches stay explicit", () => {
  const records = [record("old", "J1", "OLD"), record("new", "J1", "NEW", { sourceRow: 12, sectionName: "Board A" }),
    record("duplicate", "J1", "NEW", { sourceRow: 89, sectionName: "Board B", assemblyName: "Module B" })];
  const result = match(change(part("J1", "OLD"), part("J1", "NEW")), records);
  assert.equal(result.state, "ambiguous");
  assert.deepEqual(Array.from(result.candidates, candidate => candidate.id), ["new", "duplicate", "old"]);
  assert.equal(result.candidates[0].sourceRow, 12);
  assert.equal(result.candidates[0].sectionName, "Board A");
  assert.equal(result.candidates[1].sourceRow, 89);
  assert.equal(result.candidates[1].sectionName, "Board B");
  assert.equal(result.candidates[1].assemblyName, "Module B");
  assert.equal(match(change(part("J1", "OLD")), records).state, "matched");
  assert.equal(match(change(part("J1", "OLD"), part("J1", "OLD")), records).state, "matched");
});

test("legacy Ref Group and alternate MPN fields are only used as fallbacks", () => {
  const records = [record("legacy", "", "", { refGroup: "U2", manufacturerPartNumberAlt: "LEGACY", partNumber: "未提供", virtualAlternative: undefined }),
    record("not-legacy", "U3", "PRIMARY", { refGroup: "U2", manufacturerPartNumberAlt: "LEGACY" })];
  const result = match(change(undefined, part("U2", "LEGACY")), records);
  assert.equal(result.state, "matched");
  assert.equal(result.candidates[0].id, "legacy");
  assert.equal(result.candidates[0].physicalPartNumber, "");
  assert.equal(result.candidates[0].virtualPartNumber, "");
});

test("an internal number or name copied into Ref Group cannot stand in for a placement", () => {
  const records = [record("from-pn", "", "PART-01", { refGroup: "R17", partNumber: "R17" }),
    record("from-name", "", "PART-01", { refGroup: "R17", name: "R17" })];
  assert.equal(match(change(undefined, part("R17", "PART-01")), records).state, "missing");
});

test("an exact known maker resolves ties, and a conflicting maker requires confirmation", () => {
  const query = change(undefined, { ...part("R1", "PART-01"), manufacturer: "Maker A" });
  const exact = record("maker-a", "R1", "PART-01", { manufacturer: "Maker A" });
  const conflict = record("maker-b", "R1", "PART-01", { manufacturer: "Maker B" });
  const result = match(query, [conflict, exact]);
  assert.equal(result.state, "matched");
  assert.equal(result.candidates[0].id, exact.id);
  const conflictingResult = match(query, [conflict]);
  assert.equal(conflictingResult.state, "ambiguous");
  assert.equal(conflictingResult.reason, "manufacturer-mismatch");
  assert.equal(conflictingResult.candidates[0].id, conflict.id);
  assert.equal(match(query, [{ ...conflict, manufacturer: "" }]).state, "matched");
  const renamedMaker = change({ ...query.after, manufacturer: "Old maker label" }, query.after);
  assert.equal(match(renamedMaker, [exact]).state, "matched");
});
