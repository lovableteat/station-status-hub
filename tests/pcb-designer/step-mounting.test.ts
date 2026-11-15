// Tall STEP parts and Bottom mounting, checked against the bounds of real KiCad models
// (TO-220-3_Vertical, CP_Radial_D10.0mm_P5.00mm, PinHeader_1x05_P2.54mm_Vertical, SOIC-8): Z-up, seating plane at Z = 0.
import assert from "node:assert/strict";
import test from "node:test";
import { getPcbStepDimensions, inferPcbStepUpAxis, orientImportedStepModel } from "../../src/components/pcb-designer/core/stepOrientation.ts";
import { getPcbModelLocalYRange, mapPcbModelPartToComponentSpace, toPcbModelAsset } from "../../src/components/pcb-designer/core/modelAssets.ts";
import {
  SOFTWARE_RENDER_ORDER,
  clipSoftwarePolygonToBoardSide,
  getPcb3DFloorY,
  getPcbComponentWorldYRange,
  getPcbMountY,
  transformPcbComponentPoint,
} from "../../src/components/pcb-designer/core/software3d.ts";
import type { ImportedStepBounds, ImportedStepModel } from "../../src/components/data-center/dataCenterTypes.ts";

const bounds = (min: [number, number, number], max: [number, number, number]): ImportedStepBounds => ({ min, max });
const REAL: Record<string, { bounds: ImportedStepBounds; size: [number, number, number] }> = {
  "TO-220 vertical": { bounds: bounds([-2.59, -1.29, -9.75], [7.66, 3.16, 18.77]), size: [10.3, 4.5, 28.5] },
  "CP radial D10": { bounds: bounds([-2.5, -5, -2], [7.5, 5, 10]), size: [10, 10, 12] },
  "Pin header 1x05": { bounds: bounds([-1.27, -11.43, -3], [1.27, 1.27, 8.54]), size: [2.5, 12.7, 11.5] },
  "SOIC-8": { bounds: bounds([-3, -2.45, 0], [3, 2.45, 1.75]), size: [6, 4.9, 1.8] },
};

/** A box model with the given bounds: the corners are enough for the mapping and the extents. */
function boxModel(b: ImportedStepBounds): ImportedStepModel {
  const position: number[] = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) position.push(x, y, z);
  const model = {
    id: "step-test", fileName: "part.step", importedAt: "2026-11-15T00:00:00.000Z", sourceUnit: "millimeter" as const, upAxis: "y" as const,
    bounds: b, parts: [{ id: "p", name: "body", position: Float32Array.from(position), index: Uint32Array.from([0, 1, 2, 3, 4, 5, 6, 7, 0]) }],
    dimensions: { widthMm: 1, depthMm: 1, heightMm: 1 }, calibratedDimensions: { widthMm: 1, depthMm: 1, heightMm: 1 },
  };
  return model;
}

test("real tall through-hole parts import standing up (Z-up), not on their thinnest side", () => {
  for (const [name, { bounds: b, size }] of Object.entries(REAL)) {
    assert.equal(inferPcbStepUpAxis(b), "z", name);
    const d = getPcbStepDimensions(b, "z");
    assert.deepEqual([d.widthMm, d.depthMm, d.heightMm], size, `${name} 長×寬×高`);
  }
});

test("files without a seating plane at Z = 0, or centred on the origin, keep the thinnest-side guess", () => {
  // A Y-up mechanical export of an SMD body centred in Z: Z = 0 is in the middle, the thin Y side is up.
  assert.equal(inferPcbStepUpAxis(bounds([-3, 0, -2.45], [3, 1.75, 2.45])), "y");
  // Everything above Z = 0 (an arbitrary origin): no seating plane to trust.
  assert.equal(inferPcbStepUpAxis(bounds([10, 20, 5], [16, 21.75, 9.9])), "y");
  // Fully below Z = 0.
  assert.equal(inferPcbStepUpAxis(bounds([0, 0, -8], [2, 6, -1])), "x");
});

test("choosing another up axis changes only the axis and the size, never the geometry", () => {
  const model = boxModel(REAL["TO-220 vertical"].bounds);
  const lying = orientImportedStepModel(model, "y");
  const standing = orientImportedStepModel(model, "z");
  assert.equal(standing.parts, model.parts);
  assert.equal(standing.bounds, model.bounds);
  assert.deepEqual(standing.calibratedDimensions, { widthMm: 10.3, depthMm: 4.5, heightMm: 28.5 });
  assert.deepEqual(lying.calibratedDimensions, { widthMm: 10.3, depthMm: 28.5, heightMm: 4.5 });
  assert.notEqual(standing.calibratedDimensions, standing.dimensions, "the calibrated size is its own copy");
});

test("the seating plane lands on the board surface, Top and Bottom, with the real lead length as insertion depth", () => {
  const model = orientImportedStepModel(boxModel(REAL["TO-220 vertical"].bounds), "z");
  const asset = toPcbModelAsset(model);
  const size = model.calibratedDimensions;
  for (const layer of ["top", "bottom"] as const) {
    const component = { width: size.widthMm, height: size.depthMm, maxHeight: size.heightMm, layer, insertionDepth: 9.75 };
    const local = mapPcbModelPartToComponentSpace(asset.parts[0], asset, component);
    const ys = local.filter((_, index) => index % 3 === 1);
    const mount = getPcbMountY(component, 1.6);
    const sign = layer === "top" ? 1 : -1;
    const world = ys.map((y) => sign * y + mount).sort((a, b) => a - b);
    const range = getPcbComponentWorldYRange(component, getPcbModelLocalYRange(asset, component), 1.6);
    assert.ok(Math.abs(range[0] - world[0]) < 1e-9 && Math.abs(range[1] - world.at(-1)!) < 1e-9, `${layer}: range helper matches the mapped geometry`);
    // File Z = 0 is 9.75 / 28.52 of the way up the model; after mounting it sits on the surface (±0.8).
    const seat = layer === "top" ? world[0] + 9.75 * (28.5 / 28.52) : world.at(-1)! - 9.75 * (28.5 / 28.52);
    assert.ok(Math.abs(seat - sign * 0.8) < 0.02, `${layer}: seating plane ${seat}`);
  }
});

test("turning the part 90° on the board keeps its heights and proportions and swaps its footprint", () => {
  const model = orientImportedStepModel(boxModel(REAL["TO-220 vertical"].bounds), "z");
  const asset = toPcbModelAsset(model);
  const size = model.calibratedDimensions;
  const extents = (rotation: number) => {
    const component = { width: size.widthMm, height: size.depthMm, maxHeight: size.heightMm, layer: "bottom" as const, insertionDepth: 9.75, x: 50, y: 40, rotation };
    const local = mapPcbModelPartToComponentSpace(asset.parts[0], asset, component);
    const world = [] as Array<{ x: number; y: number; z: number }>;
    for (let index = 0; index < local.length; index += 3) {
      world.push(transformPcbComponentPoint({ x: local[index], y: local[index + 1], z: local[index + 2] }, component, { width: 100, height: 80 }, 1.6));
    }
    const span = (key: "x" | "y" | "z") => Math.max(...world.map((point) => point[key])) - Math.min(...world.map((point) => point[key]));
    return { x: span("x"), y: span("y"), z: span("z"), low: Math.min(...world.map((point) => point.y)) };
  };
  const flat = extents(0);
  const turned = extents(90);
  assert.ok(Math.abs(flat.y - turned.y) < 1e-9 && Math.abs(flat.low - turned.low) < 1e-9, "same height and same lowest point");
  assert.ok(Math.abs(flat.x - turned.z) < 1e-6 && Math.abs(flat.z - turned.x) < 1e-6, "footprint swapped, not stretched");
});

test("a 模型朝向 rotation raises the top of the range; the lowest point stays at -maxHeight / 2", () => {
  const model = orientImportedStepModel(boxModel(REAL["TO-220 vertical"].bounds), "y");
  const asset = toPcbModelAsset(model);
  const size = model.calibratedDimensions;
  const component = { width: size.widthMm, height: size.depthMm, maxHeight: size.heightMm, modelRotation: { x: 270, y: 0, z: 0 } };
  const [low, high] = getPcbModelLocalYRange(asset, component);
  assert.equal(low, -size.heightMm / 2);
  assert.ok(Math.abs(high - low - 28.5) < 1e-6, "stood up: the full 28.5 mm, not the 4.5 mm box height");
});

test("the 3D floor goes under the lowest mounted point, so a Bottom part or a lead through the board is never behind it", () => {
  assert.ok(Math.abs(getPcb3DFloorY([], 1.6) - -1.45) < 1e-9, "empty board: just under the board, as before");
  assert.ok(Math.abs(getPcb3DFloorY([[0.8, 2.6]], 1.6) - -1.45) < 1e-9, "Top parts only");
  assert.ok(Math.abs(getPcb3DFloorY([[0.8, 2.6], [-10.8, 1.2]], 1.6) - -11.4) < 1e-9, "a 10 mm capacitor on Bottom");
  assert.ok(Math.abs(getPcb3DFloorY([[-8.95, 19.55]], 1.6) - -9.55) < 1e-9, "TO-220 leads through the board");
});

const square = (x0: number, x1: number, y0: number, y1: number) => [
  { x: x0, y: y0, z: 0 }, { x: x1, y: y0, z: 0 }, { x: x1, y: y1, z: 0 }, { x: x0, y: y1, z: 0 },
];
const overBoard = (x: number, z: number) => Math.abs(x) <= 50 && Math.abs(z) <= 40;

test("compat 3D: seen from above, a lead inside the board is cut at the top surface and drawn after the board", () => {
  const lead = square(0, 0.6, -8.95, 3);
  const visible = clipSoftwarePolygonToBoardSide(lead, 60, 1.6, overBoard);
  assert.equal(visible.nearSide, true);
  assert.ok(visible.points.length >= 3);
  assert.ok(visible.points.every((point) => point.y >= 0.8 - 1e-9), "nothing below the top surface");
  assert.ok(Math.abs(Math.min(...visible.points.map((point) => point.y)) - 0.8) < 1e-9, "cut exactly at the surface");
  assert.equal(SOFTWARE_RENDER_ORDER.nearObject > SOFTWARE_RENDER_ORDER.board, true);
});

test("compat 3D: from above a Bottom part is hidden; from below its body shows and a Top lead pokes through", () => {
  const bottomBody = square(10, 20, -10.8, -0.8);
  assert.deepEqual(clipSoftwarePolygonToBoardSide(bottomBody, 60, 1.6, overBoard).points, [], "hidden by the board from above");
  const fromBelow = clipSoftwarePolygonToBoardSide(bottomBody, -60, 1.6, overBoard);
  assert.equal(fromBelow.points.length, 4);
  const topLead = clipSoftwarePolygonToBoardSide(square(0, 0.6, -8.95, 3), -60, 1.6, overBoard);
  assert.equal(topLead.nearSide, true, "drawn after the board when seen from below");
  assert.ok(topLead.points.every((point) => point.y <= -0.8 + 1e-9), "only the part under the board");
});

test("compat 3D: faces outside the board outline and edge-on views are left alone", () => {
  const overhang = square(55, 60, -3, 3);
  assert.deepEqual(clipSoftwarePolygonToBoardSide(overhang, 60, 1.6, overBoard), { points: overhang, nearSide: false });
  const lead = square(0, 0.6, -8.95, 3);
  assert.deepEqual(clipSoftwarePolygonToBoardSide(lead, 0.2, 1.6, overBoard), { points: lead, nearSide: false });
});
