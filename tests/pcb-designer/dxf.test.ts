import test from "node:test";
import assert from "node:assert/strict";
import { parseDxfOutline } from "../../src/components/pcb-designer/core/dxf.ts";

/** DXF is code/value pairs on alternating lines. */
const dxf = (...pairs: (string | number)[]) => pairs.join("\n") + "\n";

const withEntities = (body: (string | number)[]) =>
  dxf(0, "SECTION", 2, "ENTITIES", ...body, 0, "ENDSEC", 0, "EOF");

test("reads a rectangle drawn as four LINEs and reports its extents", () => {
  const text = withEntities([
    0, "LINE", 10, 0, 20, 0, 11, 215, 21, 0,
    0, "LINE", 10, 215, 20, 0, 11, 215, 21, 200,
    0, "LINE", 10, 215, 20, 200, 11, 0, 21, 200,
    0, "LINE", 10, 0, 20, 200, 11, 0, 21, 0,
  ]);
  const outline = parseDxfOutline(text);
  assert.equal(outline.width, 215);
  assert.equal(outline.height, 200);
  assert.equal(outline.paths.length, 4);
});

test("closes a flagged LWPOLYLINE back to its first point", () => {
  const text = withEntities([
    0, "LWPOLYLINE", 70, 1,
    10, 0, 20, 0, 10, 50, 20, 0, 10, 50, 20, 30, 10, 0, 20, 30,
  ]);
  const outline = parseDxfOutline(text);
  assert.equal(outline.paths.length, 1);
  assert.equal(outline.paths[0].length, 5);
  assert.deepEqual(outline.paths[0][0], outline.paths[0][4]);
  assert.equal(outline.width, 50);
  assert.equal(outline.height, 30);
});

test("collects POLYLINE vertices until SEQEND", () => {
  const text = withEntities([
    0, "POLYLINE",
    0, "VERTEX", 10, 0, 20, 0,
    0, "VERTEX", 10, 10, 20, 0,
    0, "VERTEX", 10, 10, 20, 8,
    0, "SEQEND",
  ]);
  const outline = parseDxfOutline(text);
  assert.equal(outline.paths.length, 1);
  assert.equal(outline.paths[0].length, 3);
  assert.equal(outline.width, 10);
});

test("flattens a CIRCLE to its bounding square", () => {
  const text = withEntities([0, "CIRCLE", 10, 10, 20, 10, 40, 5]);
  const outline = parseDxfOutline(text);
  assert.ok(Math.abs(outline.width - 10) < 0.01);
  assert.ok(Math.abs(outline.height - 10) < 0.01);
});

test("normalises to the origin and flips Y for board coordinates", () => {
  // A line well away from the origin, drawn upward in DXF terms.
  const text = withEntities([0, "LINE", 10, 100, 20, 50, 11, 140, 21, 90]);
  const outline = parseDxfOutline(text);
  assert.equal(outline.width, 40);
  assert.equal(outline.height, 40);
  // DXF start (100,50) is the lowest point, so after the flip it is the bottom.
  assert.deepEqual(outline.paths[0][0], { x: 0, y: 40 });
  assert.deepEqual(outline.paths[0][1], { x: 40, y: 0 });
});

test("reports unsupported entity types instead of failing", () => {
  const text = withEntities([
    0, "LINE", 10, 0, 20, 0, 11, 10, 21, 0,
    0, "MTEXT", 1, "SCALE 1:1",
    0, "DIMENSION", 1, "215",
  ]);
  const outline = parseDxfOutline(text);
  assert.equal(outline.width, 10);
  assert.deepEqual(outline.skipped.sort(), ["DIMENSION", "MTEXT"]);
});

test("a file with no usable geometry yields an empty outline", () => {
  assert.deepEqual(parseDxfOutline("not a dxf at all"), {
    paths: [], width: 0, height: 0, skipped: [],
  });
});
