import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidBoard,
  normalizePcbSaveState,
  parseProjectJson,
} from "../../src/components/pcb-designer/core/validation.ts";
import { createBoardGridCuts } from "../../src/components/pcb-designer/core/boardCuts.ts";
import type { PcbProject } from "../../src/components/pcb-designer/types.ts";

function validProject(): PcbProject {
  return {
    schemaVersion: 1,
    id: "project-1",
    name: "Validation test",
    description: "",
    status: "draft",
    board: {
      width: 100,
      height: 80,
      gridSize: 1,
      showGrid: true,
      snapToGrid: true,
      background: "#000",
      layerColors: { top: "#114422", bottom: "#221144" },
    },
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

test("uses the same strict board ranges for inspector edits and imported projects", () => {
  assert.equal(typeof isValidBoard, "function");
  assert.equal(isValidBoard({
    width: 20,
    height: 1000,
    gridSize: 0.1,
    showGrid: true,
    snapToGrid: true,
    background: "#000",
    layerColors: { top: "#114422", bottom: "#221144" },
  }), true);
  assert.equal(isValidBoard({ width: 19.99, height: 80, gridSize: 1, showGrid: true, snapToGrid: true, background: "#000" }), false);
  assert.equal(isValidBoard({ width: 100, height: 1001, gridSize: 1, showGrid: true, snapToGrid: true, background: "#000" }), false);
  assert.equal(isValidBoard({ width: 100, height: 80, gridSize: 0.09, showGrid: true, snapToGrid: true, background: "#000" }), false);
  assert.equal(isValidBoard({ width: 100, height: 80, gridSize: 50.01, showGrid: true, snapToGrid: true, background: "#000" }), false);
});

test("accepts legacy boards without layer colors, but validates them when present", () => {
  const legacyBoard = {
    width: 100,
    height: 80,
    gridSize: 1,
    showGrid: true,
    snapToGrid: true,
    background: "#000",
  };

  assert.equal(isValidBoard(legacyBoard), true);
  assert.equal(isValidBoard({ ...legacyBoard, layerColors: { top: "", bottom: "#221144" } }), false);
  assert.equal(isValidBoard({ ...legacyBoard, layerColors: { top: "#114422", bottom: "" } }), false);
});

test("normalizes legacy project boards with default top and bottom colors", () => {
  const project = validProject();
  const legacyProject = {
    ...project,
    board: {
      width: project.board.width,
      height: project.board.height,
      gridSize: project.board.gridSize,
      showGrid: project.board.showGrid,
      snapToGrid: project.board.snapToGrid,
      background: project.board.background,
    },
  };

  const normalized = normalizePcbSaveState({
    projects: [legacyProject as PcbProject],
    templates: [],
    library: [],
    activeProjectId: legacyProject.id,
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

  assert.equal(normalized.projects[0].board.background, project.board.background);
  assert.equal(typeof normalized.projects[0].board.layerColors.top, "string");
  assert.equal(typeof normalized.projects[0].board.layerColors.bottom, "string");
  assert.notEqual(normalized.projects[0].board.layerColors.top, normalized.projects[0].board.layerColors.bottom);
  assert.equal(normalized.projects[0].components[0].shape, "rectangle");
  assert.equal(normalized.projects[0].keepouts[0].rotation, 0);
});

test("creates deterministic panel cuts inside the board bounds", () => {
  const cuts = createBoardGridCuts({ width: 100, height: 80 }, 3, 2);

  assert.deepEqual(
    cuts.map(({ orientation, position }) => ({ orientation, position })),
    [
      { orientation: "vertical", position: 100 / 3 },
      { orientation: "vertical", position: 200 / 3 },
      { orientation: "horizontal", position: 40 },
    ],
  );
  assert.equal(new Set(cuts.map((cut) => cut.id)).size, cuts.length);
  assert.equal(cuts.every((cut) =>
    cut.position > 0 && (cut.orientation === "vertical" ? cut.position < 100 : cut.position < 80),
  ), true);
});

test("validates and preserves optional board cuts", () => {
  const project = validProject();
  project.board.cuts = createBoardGridCuts(project.board, 2, 2);
  const parsed = parseProjectJson(project);

  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.value.board.cuts, project.board.cuts);
  assert.equal(isValidBoard({ ...project.board, cuts: [{ ...project.board.cuts[0], position: 0 }] }), false);
  assert.equal(isValidBoard({ ...project.board, cuts: [{ ...project.board.cuts[0], id: project.board.cuts[0].id }, project.board.cuts[0]] }), false);
});

test("normalizes legacy project JSON before it reaches the editor", () => {
  const project = validProject();
  const legacyProject = {
    ...project,
    board: {
      width: project.board.width,
      height: project.board.height,
      gridSize: project.board.gridSize,
      showGrid: project.board.showGrid,
      snapToGrid: project.board.snapToGrid,
      background: project.board.background,
    },
  };

  const parsed = parseProjectJson(legacyProject);

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.board.background, project.board.background);
    assert.notEqual(parsed.value.board.layerColors.top, parsed.value.board.layerColors.bottom);
  }
});

test("accepts optional last editor metadata without changing legacy projects", () => {
  const project = validProject();
  const parsed = parseProjectJson({
    ...project,
    lastEditedBy: "Vincent",
    lastEditedById: "user-vincent",
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.lastEditedBy, "Vincent");
    assert.equal(parsed.value.lastEditedById, "user-vincent");
  }
  assert.equal(parseProjectJson(project).ok, true);
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

test("round-trips a placed BOM component without manufacturer or part number", () => {
  const project = validProject();
  project.components[0].manufacturer = "";
  project.components[0].partNumber = "";

  const result = parseProjectJson(JSON.stringify(project));

  assert.equal(result.ok, true);
});

test("rejects component rotations outside the normalized 0–359 degree range", () => {
  const negative = validProject();
  negative.components[0].rotation = -1;
  const fullTurn = validProject();
  fullTurn.components[0].rotation = 360;

  assert.equal(parseProjectJson(negative).ok, false);
  assert.equal(parseProjectJson(fullTurn).ok, false);
});
