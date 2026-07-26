import test from "node:test";
import assert from "node:assert/strict";
import { aggregateBom, exportBomCsv, exportProjectJson } from "../../src/components/pcb-designer/core/exports.ts";
import type { PcbPlacedComponent, PcbProject } from "../../src/components/pcb-designer/types.ts";

function component(reference: string, overrides: Partial<PcbPlacedComponent> = {}): PcbPlacedComponent {
  return {
    id: `lib-${reference}`, name: "Resistor", type: "Resistor", manufacturer: "Yageo", partNumber: "RC1",
    width: 1.6, height: 0.8, maxHeight: 0.5, color: "#fff", source: "bom", createdAt: "2026-01-01T00:00:00.000Z",
    instanceId: reference, reference, x: 1, y: 1, rotation: 0, layer: "top", locked: false, ...overrides,
  };
}

test("aggregates BOM rows by manufacturer, part number, and dimensions with stable references", () => {
  const result = aggregateBom([component("R10"), component("R2"), component("C1", { partNumber: "C1", name: "Cap, \"special\"" })]);

  assert.deepEqual(result.map((row) => ({ partNumber: row.partNumber, quantity: row.quantity, reference: row.reference })), [
    { partNumber: "C1", quantity: 1, reference: "C1" },
    { partNumber: "RC1", quantity: 2, reference: "R2, R10" },
  ]);
});

test("exports BOM CSV with UTF-8 BOM and correct CSV escaping", () => {
  const csv = exportBomCsv([component("R1", { name: "Line 1\n\"quoted\"" })]);

  assert.equal(csv.startsWith("\uFEFFReference,Name,Type,Manufacturer,Part Number,Quantity,Width,Height,Max Height,Layer\n"), true);
  assert.match(csv, /R1,"Line 1\n""quoted""",Resistor,Yageo,RC1,1,1.6,0.8,0.5,top/);
});

test("exports a schema version 1 project JSON document", () => {
  const project = { schemaVersion: 1, id: "project", name: "Board" } as PcbProject;
  const exported = exportProjectJson(project);

  assert.deepEqual(JSON.parse(exported), project);
  assert.match(exported, /"schemaVersion": 1/);
});
