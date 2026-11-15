import assert from "node:assert/strict";
import test from "node:test";
import { getKeepoutCorners, keepoutResizeAnchor, resizeKeepout } from "../../src/components/pcb-designer/core/keepoutGeometry.ts";
import { getMarqueeSelectionIds } from "../../src/components/pcb-designer/core/selection.ts";
import { createBlankProject } from "../../src/components/pcb-designer/defaults.ts";

const keepout = { id: "K1", name: "測試禁制區", x: 30, y: 30, width: 20, height: 10, rotation: 30, color: "#fff" };
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 0.0002, `${actual} != ${expected}`);

test("30-degree keepout selection corners follow the rendered rectangle", () => {
  const corners = getKeepoutCorners(keepout);
  near(corners.nw.x, 33.839746);
  near(corners.nw.y, 25.669873);
  near(corners.se.x, 46.160254);
  near(corners.se.y, 44.330127);
  assert.deepEqual(keepoutResizeAnchor(keepout, "nw"), corners.se);
});

test("resizing each rotated corner keeps the opposite world corner fixed", () => {
  for (const handle of ["nw", "ne", "sw", "se"] as const) {
    const anchor = keepoutResizeAnchor(keepout, handle);
    const signX = handle.endsWith("w") ? -1 : 1;
    const signY = handle.startsWith("n") ? -1 : 1;
    const angle = Math.PI / 6;
    const target = {
      x: anchor.x + signX * 25 * Math.cos(angle) - signY * 12 * Math.sin(angle),
      y: anchor.y + signX * 25 * Math.sin(angle) + signY * 12 * Math.cos(angle),
    };
    const resized = resizeKeepout(anchor, handle, target, 0.1, { width: 100, height: 100 }, 30);
    near(resized.width, 25);
    near(resized.height, 12);
    const fixed = keepoutResizeAnchor({ ...resized, rotation: 30 }, handle);
    near(fixed.x, anchor.x);
    near(fixed.y, anchor.y);
    const corner = getKeepoutCorners({ ...resized, rotation: 30 })[handle];
    near(corner.x, target.x);
    near(corner.y, target.y);
  }
});

test("axis-aligned resizing still clamps to board and enforces minimum size", () => {
  assert.deepEqual(resizeKeepout({ x: 30, y: 30 }, "se", { x: 120, y: 120 }, 1, { width: 100, height: 100 }, 0),
    { x: 30, y: 30, width: 70, height: 70 });
  assert.deepEqual(resizeKeepout({ x: 30, y: 30 }, "se", { x: 20, y: 20 }, 1, { width: 100, height: 100 }, 0),
    { x: 30, y: 30, width: 1, height: 1 });
});

test("marquee includes the rotated keepout corner beyond its unrotated bounds", () => {
  const project = createBlankProject("旋轉框選測試");
  project.keepouts = [keepout];
  assert.deepEqual(getMarqueeSelectionIds(project, { x: 33, y: 25 }, { x: 35, y: 27 }, "top"), ["K1"]);
});
