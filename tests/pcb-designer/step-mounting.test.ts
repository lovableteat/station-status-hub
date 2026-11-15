// Tall STEP parts and Bottom mounting, checked against the bounds of real KiCad models
// (TO-220-3_Vertical, CP_Radial_D10.0mm_P5.00mm, PinHeader_1x05_P2.54mm_Vertical, SOIC-8): Z-up, seating plane at Z = 0.
import assert from "node:assert/strict";
import test from "node:test";
import { getPcbStepDimensions, inferPcbStepUpAxis, orientImportedStepModel, pickPcbStepUpAxisForBox } from "../../src/components/pcb-designer/core/stepOrientation.ts";
import { getPcbModelLocalYRange, mapPcbModelPartToComponentSpace, toPcbModelAsset } from "../../src/components/pcb-designer/core/modelAssets.ts";
import {
  SOFTWARE_RENDER_ORDER,
  getPcb3DFloorY,
  getPcbComponentWorldYRange,
  getPcbMountY,
  MAX_SOFTWARE_PIECE_GROUPS,
  addSoftwarePieceBounds,
  isSoftwarePieceInsideBoardMaterial,
  mergeSoftwarePieceBounds,
  splitSoftwarePolygonAtBoardSurface,
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

test("binding a STEP to a part with a size picks the axis that stretches it least, never worse than before", () => {
  // Codex's case: a flat Y-up model (its Z range starts at 0) bound to a part that was sized for it lying flat.
  const flatYUp = bounds([0, 0, 0], [10, 2, 8]);
  assert.equal(inferPcbStepUpAxis(flatYUp), "z", "the file rule alone would pick Z");
  assert.equal(pickPcbStepUpAxisForBox(flatYUp, { width: 10, height: 8, maxHeight: 2 }), "y", "but the part's size says Y");
  const to220 = REAL["TO-220 vertical"].bounds;
  assert.equal(pickPcbStepUpAxisForBox(to220, { width: 10.3, height: 4.5, maxHeight: 28.5 }), "z", "a part sized standing up");
  assert.equal(pickPcbStepUpAxisForBox(to220, { width: 10.3, height: 28.5, maxHeight: 4.5 }), "y", "a part sized lying down keeps fitting");
  assert.equal(pickPcbStepUpAxisForBox(to220, { width: 10, height: 10, maxHeight: 10 }), "z", "no clear fit: the file-based suggestion");
  assert.equal(pickPcbStepUpAxisForBox(to220, { width: Number.NaN, height: 4.5, maxHeight: 28.5 }), "z", "an invalid size falls back to the suggestion");
  // Uniform scaling is not distortion: the same flat model in a part four times its size keeps its proportions with Y.
  assert.equal(pickPcbStepUpAxisForBox(flatYUp, { width: 40, height: 32, maxHeight: 8 }), "y", "4/4/4 beats 4/16/1");
});

test("binding never picks an axis that distorts more than the old thinnest-side choice", () => {
  const thinnest = (b: ImportedStepBounds) => {
    const spans = [0, 1, 2].map((axis) => b.max[axis] - b.min[axis]);
    return (["x", "y", "z"] as const)[spans.indexOf(Math.min(...spans))];
  };
  const spread = (b: ImportedStepBounds, axis: "x" | "y" | "z", box: { width: number; height: number; maxHeight: number }) => {
    const d = getPcbStepDimensions(b, axis);
    const scales = [box.width / d.widthMm, box.height / d.depthMm, box.maxHeight / d.heightMm].map(Math.log);
    return Math.max(...scales) - Math.min(...scales);
  };
  const boxes = [[10, 8, 2], [40, 32, 8], [10, 10, 10], [10.3, 4.5, 28.5], [1.6, 0.8, 0.5], [30, 5, 12]].map(([width, height, maxHeight]) => ({ width, height, maxHeight }));
  const models = [...Object.values(REAL).map(({ bounds: b }) => b), bounds([0, 0, 0], [10, 2, 8]), bounds([-3, 0, -2.45], [3, 1.75, 2.45])];
  for (const b of models) for (const box of boxes) {
    const picked = pickPcbStepUpAxisForBox(b, box);
    assert.ok(spread(b, picked, box) <= spread(b, thinnest(b), box) + 0.05, `${JSON.stringify(b)} into ${JSON.stringify(box)}: ${picked}`);
  }
});

const square = (x0: number, x1: number, y0: number, y1: number) => [
  { x: x0, y: y0, z: 0 }, { x: x1, y: y0, z: 0 }, { x: x1, y: y1, z: 0 }, { x: x0, y: y1, z: 0 },
];

const yMax = (points: Array<{ y: number }>) => Math.max(...points.map((point) => point.y));
const yMin = (points: Array<{ y: number }>) => Math.min(...points.map((point) => point.y));
const assertRange = (points: Array<{ y: number }>, [low, high]: [number, number], message: string) =>
  assert.ok(Math.abs(yMin(points) - low) < 1e-9 && Math.abs(yMax(points) - high) < 1e-9, `${message}: ${yMin(points)}…${yMax(points)}`);

test("compat 3D: seen from above, a lead through the board is cut into above / inside / under the board; nothing is lost", () => {
  const { near, within, beyond } = splitSoftwarePolygonAtBoardSurface(square(0, 0.6, -8.95, 3), 60, 1.6);
  assert.ok(near.length >= 3 && within.length >= 3 && beyond.length >= 3);
  assertRange(near, [0.8, 3], "drawn after the board: only above the top surface");
  assert.ok(Math.abs(yMin(within) - -0.8) < 1e-9 && Math.abs(yMax(within) - 0.8) < 1e-9, "inside the board thickness");
  assertRange(beyond, [-8.95, -0.8], "under the board: drawn before it, hidden where it covers it");
  assert.equal(SOFTWARE_RENDER_ORDER.farObject < SOFTWARE_RENDER_ORDER.board && SOFTWARE_RENDER_ORDER.board < SOFTWARE_RENDER_ORDER.nearObject, true);
});

test("compat 3D: a Bottom part is drawn before the board from above (so it shows past the board edge) and after it from below", () => {
  const bottomBody = square(46, 48, -10, -8);
  assert.deepEqual(splitSoftwarePolygonAtBoardSurface(bottomBody, 60, 1.6), { near: [], within: [], beyond: bottomBody }, "kept, behind the board");
  assert.deepEqual(splitSoftwarePolygonAtBoardSurface(bottomBody, 0.3, 1.6), { near: [], within: [], beyond: bottomBody }, "low views keep it too: no jump");
  assert.deepEqual(splitSoftwarePolygonAtBoardSurface(bottomBody, -60, 1.6), { near: bottomBody, within: [], beyond: [] });
  const topLead = splitSoftwarePolygonAtBoardSurface(square(0, 0.6, -8.95, 3), -60, 1.6);
  assertRange(topLead.near, [-8.95, -0.8], "from below only the part under the board is in front");
  assertRange(topLead.beyond, [0.8, 3], "range");
});

test("compat 3D: a face inside the board thickness is its own band, so the board material can hide it outright", () => {
  const insideNearEdge = square(49.8, 49.9, 0.4, 0.6);
  assert.deepEqual(splitSoftwarePolygonAtBoardSurface(insideNearEdge, 60, 1.6), { near: [], within: insideNearEdge, beyond: [] });
  assert.deepEqual(splitSoftwarePolygonAtBoardSurface(insideNearEdge, -60, 1.6), { near: [], within: insideNearEdge, beyond: [] });
});

test("compat 3D click areas: two lead ends far apart get two areas; touching pieces share one", () => {
  const point = (x: number, y: number) => ({ x, y, depth: 100, visible: true });
  const groups: Parameters<typeof addSoftwarePieceBounds>[0] = [];
  addSoftwarePieceBounds(groups, [point(100, 100), point(104, 100), point(104, 110)]);
  addSoftwarePieceBounds(groups, [point(300, 100), point(304, 100), point(304, 110)]);
  addSoftwarePieceBounds(groups, [point(105, 102), point(108, 112)]);
  const merged = mergeSoftwarePieceBounds(groups);
  assert.equal(merged.length, 2, "the gap between the leads is not clickable");
  const near = merged.find((group) => group.left === 100)!;
  assert.deepEqual([near.left, near.right, near.top, near.bottom], [100, 108, 100, 112], "the touching piece joined the first lead");
  addSoftwarePieceBounds(groups, [point(0, 0), { x: 50, y: 50, depth: 1, visible: false }]);
  assert.equal(groups.some((group) => group.right === 50), false, "points behind the camera are ignored");
});

test("compat 3D click areas: a big STEP piece list does not overflow the stack", () => {
  const groups: Parameters<typeof addSoftwarePieceBounds>[0] = [];
  const many = Array.from({ length: 200_000 }, (_, index) => ({ x: index % 400, y: Math.floor(index / 400), depth: 50, visible: true }));
  assert.doesNotThrow(() => addSoftwarePieceBounds(groups, many));
  assert.deepEqual([groups[0].left, groups[0].top, groups[0].right, groups[0].bottom], [0, 0, 399, 499]);
});

test("compat 3D: a face lying on the surface facing the camera stays in front of the board, Top and Bottom", () => {
  const onTop = square(0, 6, 0.8, 0.8);
  assert.deepEqual(splitSoftwarePolygonAtBoardSurface(onTop, 60, 1.6), { near: onTop, within: [], beyond: [] });
  const onBottom = square(-5, 5, -0.8, -0.8);
  assert.deepEqual(splitSoftwarePolygonAtBoardSurface(onBottom, -60, 1.6), { near: onBottom, within: [], beyond: [] }, "seen from below");
});

test("compat 3D: only a piece wholly inside the board material is hidden; one crossing the edge or a cut-out edge is kept", () => {
  const board = (x: number, z: number) => Math.abs(x) <= 50 && Math.abs(z) <= 50 && !(Math.abs(x) < 10 && Math.abs(z) < 10);
  const inside = splitSoftwarePolygonAtBoardSurface(square(49.8, 49.9, 0.4, 0.6), 60, 1.6).within;
  assert.equal(isSoftwarePieceInsideBoardMaterial(inside, board), true, "next to the edge, inside: hidden");
  const acrossEdge = splitSoftwarePolygonAtBoardSurface(square(46, 52, 0.4, 6), 60, 1.6).within;
  assert.equal(isSoftwarePieceInsideBoardMaterial(acrossEdge, board), false, "crosses the board edge: kept");
  const acrossCutOut = splitSoftwarePolygonAtBoardSurface(square(-12, -9, 0.4, 6), 60, 1.6).within;
  assert.equal(isSoftwarePieceInsideBoardMaterial(acrossCutOut, board), false, "crosses the cut-out edge: kept");
  assert.equal(isSoftwarePieceInsideBoardMaterial([], board), false);
  // A piece spanning the whole 20 x 20 cut-out: every corner is on material, but the cut-out is under it.
  const corners = [[-50, -50], [50, -50], [50, 50], [-50, 50], [-10, -10], [10, -10], [10, 10], [-10, 10]].map(([x, z]) => ({ x, z }));
  const overCutOut = [{ x: -12, y: 0.5, z: -12 }, { x: 12, y: 0.5, z: -12 }, { x: 12, y: 0.5, z: 12 }];
  assert.equal(isSoftwarePieceInsideBoardMaterial(overCutOut, board), true, "without the corners it would be dropped");
  assert.equal(isSoftwarePieceInsideBoardMaterial(overCutOut, board, corners), false, "spans the cut-out: kept");
  assert.equal(isSoftwarePieceInsideBoardMaterial(inside, board, corners), true, "a lead inside the material is still hidden");
});

test("compat 3D click areas: a part with very many separate pieces collapses to one area instead of slowing down", () => {
  const groups: Parameters<typeof addSoftwarePieceBounds>[0] = [];
  for (let index = 0; index < 65; index += 1) addSoftwarePieceBounds(groups, [{ x: index * 10, y: 0, depth: 1, visible: true }]);
  assert.equal(groups.length, 65, "a 65-pin connector keeps one area per pin");
  for (let index = 65; index < 600; index += 1) addSoftwarePieceBounds(groups, [{ x: index * 10, y: 0, depth: 1, visible: true }]);
  assert.ok(groups.length <= MAX_SOFTWARE_PIECE_GROUPS);
  const all = groups.reduce((a, b) => ({ ...a, left: Math.min(a.left, b.left), right: Math.max(a.right, b.right) }));
  assert.deepEqual([all.left, all.right], [0, 5990], "every piece is still clickable");
});
