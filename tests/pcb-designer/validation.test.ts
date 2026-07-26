import test from "node:test";
import assert from "node:assert/strict";
import { parseProjectJson } from "../../src/components/pcb-designer/core/validation.ts";
import type { PcbProject } from "../../src/components/pcb-designer/types.ts";

function validProject(): PcbProject {
  return {
    schemaVersion: 1,
    id: "project-1",
    name: "Validation test",
    description: "",
    status: "draft",
    board: { width: 100, height: 80, gridSize: 1, showGrid: true, snapToGrid: true, background: "#000" },
    components: [{
      id: "library-u1", name: "IC", type: "IC", manufacturer: "Acme", partNumber: "U1",
      width: 4, height: 4, maxHeight: 1, color: "#fff", source: "custom", createdAt: "2026-01-01T00:00:00.000Z",
      instanceId: "U1", reference: "U1", x: 20, y: 20, rotation: 0, layer: "top", locked: false,
    }],
    keepouts: [{ id: "keepout-1", name: "No parts", x: 40, y: 40, width: 5, height: 5, color: "#f00" }],
    measurements: [{ id: "measure-1", x1: 0, y1: 0, x2: 10, y2: 10, color: "#0f0" }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

test("parses a valid project without mutating the parsed input", () => {
  const input = validProject();
  const before = structuredClone(input);
  const result = parseProjectJson(input);

  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value, input);
  assert.deepEqual(input, before);
});

test("rejects unsupported schema versions and invalid board ranges", () => {
  const wrongVersion = { ...validProject(), schemaVersion: 2 };
  const invalidBoard = { ...validProject(), board: { ...validProject().board, width: Infinity, gridSize: 0.05 } };

  assert.equal(parseProjectJson(wrongVersion).ok, false);
  assert.equal(parseProjectJson(invalidBoard).ok, false);
});

test("rejects non-finite dimensions and positions", () => {
  const project = validProject();
  project.components[0].width = Number.NaN;
  project.components[0].rotation = Infinity;
  project.keepouts[0].height = 0;
  project.measurements[0].x2 = Number.NaN;

  assert.equal(parseProjectJson(project).ok, false);
});

test("rejects duplicate object identifiers and invalid enum values", () => {
  const project = validProject();
  project.components.push({ ...project.components[0] });
  project.keepouts.push({ ...project.keepouts[0] });
  project.measurements.push({ ...project.measurements[0] });
  const invalid = { ...project, status: "published", components: project.components.map((component) => ({ ...component, layer: "inner", source: "vendor" })) };

  assert.equal(parseProjectJson(invalid).ok, false);
});

test("rejects missing required strings and non-array collections", () => {
  const project = validProject();
  const invalid = { ...project, id: "", components: {} };

  assert.equal(parseProjectJson(invalid).ok, false);
});
