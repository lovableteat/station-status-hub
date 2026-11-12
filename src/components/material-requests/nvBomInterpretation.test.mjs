import assert from "node:assert/strict";
import test from "node:test";
import { compareNvBomSheets } from "./nvBomCompare.ts";
import { inferNvBomMapping } from "./nvBomMapping.ts";
import { interpretNvBomDiff, nvBomSourceListDelta } from "./nvBomInterpretation.ts";

const columns = ["Level", "Parent Number", "Part Number", "Part Description", "Manufacturer", "Manufacturer Part Number", "Qty", "Location", "S/D", "Material Category", "Source", "Population"];
const sheet = (rows, header = columns) => ({ name: "QA", rows: [header, ...rows] });
const placed = ["2", "QA-BOARD", "PN-R", "Resistor", "QA maker", "MPN-R", "1", "R1", "SMT", "JR", "Single", ""];
const alt = ["A", "QA-BOARD", "PN-R-ALT", "Alternate source", "QA alt", "MPN-R-ALT", "", "", "", "JR", "", ""];
const board = ["2", "QA-BOARD", "PN-PCB", "PCB Test Board", "QA fab", "MPN-PCB", "1", "", "SMT", "QB", "Single", ""];
const altBoard = ["A", "QA-BOARD", "PN-PCB-ALT", "PCB Test Board", "QA fab 2", "MPN-PCB-ALT", "", "", "", "QB", "", ""];
function compare(oldRows, newRows, header = columns) {
  const before = sheet(oldRows, header), after = sheet(newRows, header);
  const mapping = inferNvBomMapping(before);
  assert.ok(mapping);
  return interpretNvBomDiff(compareNvBomSheets(before, after, mapping, mapping));
}

test("explains the exact additions and removals in NV source lists", () => {
  assert.deepEqual(nvBomSourceListDelta("MPN-A;MPN-B;MPN-C", "mpn-c；MPN-NEW\nMPN-A;MPN-B;MPN-NEW"),
    { added: ["MPN-NEW"], removed: [] });
  assert.deepEqual(nvBomSourceListDelta("MURATA, INC.;YAGEO;—", "murata, inc.\r\nTAIYO;N/A"),
    { added: ["TAIYO"], removed: ["YAGEO"] });
  assert.deepEqual(nvBomSourceListDelta("MURATA;YAGEO", "YAGEO;MURATA"), { added: [], removed: [] });
});

test("uses explicit population-only changes and Qty 0 at matching placements", () => {
  const marked = [...placed.slice(0, -1), "DNP"];
  const explicit = compare([placed], [marked]);
  assert.deepEqual(explicit.entries.map(entry => [entry.kind, entry.unmountedRefs, entry.change.changedFields, entry.change.changedMetadata]), [["unmount", ["R1"], [], ["population"]]]);
  const zero = placed.map((value, index) => index === 6 ? "0" : value);
  assert.deepEqual(compare([zero], [placed]).entries.map(entry => [entry.kind, entry.mountedRefs]), [["mount", ["R1"]]]);
  const missingQty = placed.map((value, index) => index === 6 ? "" : value);
  assert.equal(compare([placed], [missingQty]).entries[0].kind, "qty");
  assert.equal(compare([placed], [zero.map((value, index) => index === 7 ? "R2" : value)]).entries[0].kind, "refs");
});

test("preserves added and removed rows while separating PCB and alternate sources", () => {
  const added = compare([placed, board], [placed, alt, board, altBoard]);
  assert.deepEqual(added.entries.map(entry => [entry.change.kind, entry.kind, entry.scope, entry.relatedSourceRows.after]), [
    ["added", "sourceAdded", "board", [4]], ["added", "sourceAdded", "component", [2]],
  ]);
  assert.equal(added.counts.sourceAdded, 2);
  assert.equal(added.componentCount, 1);
  assert.equal(added.otherCount, 1);
  assert.deepEqual(added.entries.find(entry => entry.scope === "component").relatedMain.after,
    { sourceRow: 2, partNumber: "PN-R", mpn: "MPN-R", manufacturer: "QA maker", refs: "R1" });
  const removed = compare([placed, alt, board, altBoard], [placed, board]);
  assert.equal(removed.counts.sourceRemoved, 2);
  assert.equal(removed.counts.unmount, 0);
  assert.deepEqual(compare([placed], [board]).entries.map(entry => [entry.kind, entry.scope]), [["added", "board"], ["removed", "component"]]);
});

test("identifies approved manufacturer additions in the AML format by find number and placement", () => {
  const header = ["Level", "Item Type", "Number", "Name", "Find #", "Qty", "Alt Qty", "Primary", "Ref Des", "Manufacturer Part Number", "Manufacturer"];
  const old = ["2", "Library Part", "PN-R", "Resistor", "100", "1", "", "True", "R1", "MPN-R", "QA maker"];
  const alternate = [...old.slice(0, 9), "MPN-R-ALT", "QA alternate"];
  const additions = compare([old], [alternate, old], header);
  assert.deepEqual(additions.entries.map(entry => [entry.kind, entry.relatedSourceRows.after]), [["sourceAdded", [3]]]);
  const another = [...alternate];
  another[4] = "101";
  assert.equal(compare([old], [old, another], header).entries[0].kind, "added");
});

test("reports true replacement, moved locations and unclassified data separately", () => {
  const replacement = placed.map((value, index) => index === 2 || index === 5 ? "NEW-" + value : value);
  const changed = compare([placed], [replacement]);
  assert.equal(changed.entries[0].kind, "replacement");
  assert.equal(changed.entries[0].change.kind, "changed");
  const moved = placed.map((value, index) => index === 7 ? "R2, R3" : value);
  assert.deepEqual(compare([placed], [moved]).entries.map(entry => [entry.kind, entry.removedRefs, entry.addedRefs]), [["refs", ["R1"], ["R2", "R3"]]]);
  const unclassified = ["2", "QA-BOARD", "PN-U", "Service item", "", "", "1", "", "", "UNRECOGNIZED", "", ""];
  assert.equal(compare([placed], [placed, unclassified]).entries[0].scope, "unknown");
  const testPoint = unclassified.map((value, index) => index === 7 ? "TP1" : value);
  assert.equal(compare([placed], [placed, testPoint]).entries[0].scope, "unknown");
});

test("keeps parent conflicts and placeholder part numbers from over-interpreting a match", () => {
  const differentParent = placed.map((value, index) => index === 1 ? "QA-OTHER-BOARD" : index === 6 ? "0" : value);
  assert.equal(compare([placed], [differentParent]).entries[0].kind, "qty");
  const original = placed.map((value, index) => index === 2 ? "—" : value);
  const replacement = original.map((value, index) => index === 5 ? "MPN-NEW" : value);
  assert.equal(compare([original], [replacement]).entries[0].kind, "replacement");
});

test("does not interpret missing population columns or source strategy alone as mounting changes", () => {
  const marked = [...placed.slice(0, -1), "DNP"];
  const before = sheet([marked]);
  const after = sheet([placed.slice(0, -1)], columns.slice(0, -1));
  const result = compareNvBomSheets(before, after, inferNvBomMapping(before), inferNvBomMapping(after));
  assert.equal(result.changes.length, 0);
  const strategy = placed.map((value, index) => index === 10 ? "Multiple" : value);
  assert.deepEqual(compare([placed], [strategy]).entries.map(entry => [entry.kind, entry.change.changedMetadata]), [["sourceChanged", ["source"]]]);
});
