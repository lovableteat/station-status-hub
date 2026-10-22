import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const presentationSource = await readFile(new URL("../src/components/material-requests/materialRequestPresentation.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(presentationSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { collectPartSiblingPatches, getPartIdentity, groupPendingMaterials, mergePendingMaterialsByPart, sumMaterialQuantities } = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);

const group = (key, displayRef, manufacturer, mpn, qty = "1", name = "VREG CONTROLLER", alternates = []) => {
  const primaryRecord = { id: `${key}-0`, manufacturer, manufacturerPartNumber: mpn };
  return {
    key, displayRef, name, qty, searchText: `${displayRef} ${name} ${mpn}`.toLowerCase(),
    primaryRecord,
    records: [primaryRecord, ...alternates.map(([vendor, part], index) => ({ id: `${key}-${index + 1}`, manufacturer: vendor, manufacturerPartNumber: part }))],
  };
};

test("a part identity is one manufacturer plus one MPN, tolerant of spacing and case", () => {
  assert.equal(getPartIdentity({ manufacturer: "Renesas ", manufacturerPartNumber: "raa228942ra7hc0c00" }), getPartIdentity({ manufacturer: "renesas", manufacturerPartNumber: "RAA228942RA7HC0C00 " }));
  assert.notEqual(getPartIdentity({ manufacturer: "Renesas", manufacturerPartNumber: "RAA228942" }), getPartIdentity({ manufacturer: "Infineon", manufacturerPartNumber: "RAA228942" }));
  assert.equal(getPartIdentity({ manufacturer: "Renesas", manufacturerPartNumber: "" }), "");
  assert.equal(getPartIdentity({ manufacturer: "", manufacturerPartNumber: "X" }), getPartIdentity({ manufacturer: null, manufacturerPartNumber: "x" }));
});

test("pending groups collapse into one application per manufacturer + MPN with every location listed", () => {
  const parts = mergePendingMaterialsByPart([
    group("g1", "U1_C0P1", "Renesas", "RAA228942RA7HC0C00", "1"),
    group("g2", "U1_C0P2", "Renesas", "RAA228942RA7HC0C00", "1"),
    group("g3", "U370", "Infineon", "XDPE1A2G7C-032C-81", "1", "VREG CONTROLLER B"),
    group("g4", "U1_C1P1", "renesas", "RAA228942RA7HC0C00 ", "2"),
    group("g5", "U100", "", "", "1", "ASSY, EdgeLock"),
    group("g6", "U1550", "", "", "1", "ASSY, CPLD FW"),
    group("g7", "C1_C0P1", "Samsung", "CL21X476MRYNNNE", "x"),
    group("g8", "C1_C0P2", "Samsung", "CL21X476MRYNNNE", "3"),
  ]);
  assert.deepEqual(parts.map((part) => [part.key.startsWith("part:") ? "part" : "group", part.displayRef, part.qty, part.groups.length]), [
    ["part", "U1_C0P1, U1_C0P2, U1_C1P1", "4", 3],
    ["part", "U370", "1", 1],
    ["group", "U100", "1", 1],
    ["group", "U1550", "1", 1],
    ["part", "C1_C0P1, C1_C0P2", "x / 3", 2],
  ]);
  assert.equal(parts[0].manufacturer, "Renesas");
  assert.equal(parts[0].manufacturerPartNumber, "RAA228942RA7HC0C00");
  assert.equal(parts[0].record.id, "g1-0", "the first row of the part is the one to edit");
  assert.match(parts[0].searchText, /u1_c1p1/);
  assert.deepEqual(groupPendingMaterials(parts).map((category) => [category.key, category.groups.length]), [["ic", 4], ["rlc", 1]]);
});

test("quantities add up only when every location has a number", () => {
  assert.equal(sumMaterialQuantities(["2", "3", 4]), "9");
  assert.equal(sumMaterialQuantities(["2", "", "3"]), "2 / 3");
  assert.equal(sumMaterialQuantities(["-", "-"]), "-");
  assert.equal(sumMaterialQuantities([]), "-");
});

test("every approved vendor of one location is its own application, shared across locations", () => {
  const parts = mergePendingMaterialsByPart([
    group("a", "J274", "Amphenol", "AMP-1", "2", "CONN 15x11", [["Molex", "MLX-9"], ["Amphenol", "amp-1"]]),
    group("b", "J275", "Amphenol", "AMP-1", "2", "CONN 15x11", [["Molex", "MLX-9"]]),
    group("c", "J300", "Molex", "MLX-9", "1", "CONN 15x11"),
  ]);
  assert.deepEqual(parts.map((part) => [part.manufacturer, part.manufacturerPartNumber, part.displayRef, part.qty, part.record.id]), [
    ["Amphenol", "AMP-1", "J274, J275", "4", "a-0"],
    ["Molex", "MLX-9", "J274, J275, J300", "5", "a-1"],
  ]);
  assert.match(parts[1].searchText, /mlx-9/);
});

test("a saved part number fills the empty fields of every other row of the same manufacturer + MPN only", () => {
  const saved = { id: "r1", manufacturer: "Coilforce", manufacturerPartNumber: "CCCA-0520-2R2-M-73", partNumber: "1A40-0001", virtualAlternative: "", partName: "IND 2.2uH" };
  const rows = [
    saved,
    { id: "r2", manufacturer: "coilforce ", manufacturerPartNumber: "ccca-0520-2r2-m-73", partNumber: "", virtualAlternative: "", partName: "" },
    { id: "r3", manufacturer: "Coilforce", manufacturerPartNumber: "CCCA-0520-2R2-M-73", partNumber: "1A40-9999", virtualAlternative: "1AT-1", partName: "" },
    { id: "r4", manufacturer: "Cyntec", manufacturerPartNumber: "CCCA-0520-2R2-M-73", partNumber: "", virtualAlternative: "", partName: "" },
    { id: "r5", manufacturer: "Coilforce", manufacturerPartNumber: "OTHER", partNumber: "", virtualAlternative: "", partName: "" },
    { id: "r6", manufacturer: "Coilforce", manufacturerPartNumber: "CCCA-0520-2R2-M-73", partNumber: "1A40-0001", virtualAlternative: "", partName: "IND 2.2uH" },
    { id: "r2", manufacturer: "Coilforce", manufacturerPartNumber: "CCCA-0520-2R2-M-73", partNumber: "", virtualAlternative: "", partName: "" },
  ];
  assert.deepEqual(collectPartSiblingPatches(saved, rows).map(({ record, patch }) => [record.id, patch]), [
    ["r2", { partNumber: "1A40-0001", partName: "IND 2.2uH" }],
    ["r3", { partName: "IND 2.2uH" }],
  ]);
  assert.deepEqual(collectPartSiblingPatches({ ...saved, manufacturerPartNumber: "" }, rows), []);
  assert.deepEqual(collectPartSiblingPatches({ ...saved, partNumber: "", partName: "" }, rows), []);
});
