import test from "node:test";
import assert from "node:assert/strict";
import { createBlankProject } from "../../src/components/pcb-designer/defaults.ts";
import { resizeBoard } from "../../src/components/pcb-designer/core/resizeBoard.ts";

const seed = () => {
  const project = createBlankProject("resize");
  return {
    ...project,
    board: { ...project.board, width: 100, height: 80, cuts: [
      { id: "v", orientation: "vertical" as const, position: 40 },
      { id: "h", orientation: "horizontal" as const, position: 30 },
    ] },
    components: [{ ...(project.components[0] ?? {}), instanceId: "c1", x: 10, y: 20 }],
    keepouts: [{ ...(project.keepouts[0] ?? {}), id: "k1", x: 50, y: 60 }],
    measurements: [{ ...(project.measurements[0] ?? {}), id: "m1", x1: 0, y1: 0, x2: 10, y2: 10 }],
  } as ReturnType<typeof createBlankProject>;
};

test("anchoring the left edge leaves content where it is", () => {
  const next = resizeBoard(seed(), { width: 140 }, "top-left");
  assert.equal(next.board.width, 140);
  assert.equal(next.components[0].x, 10);
  assert.equal(next.components[0].y, 20);
});

test("anchoring the right edge moves content by the whole delta", () => {
  const next = resizeBoard(seed(), { width: 140 }, "top-right");
  assert.equal(next.components[0].x, 50); // 10 + 40
  assert.equal(next.components[0].y, 20); // height unchanged
});

test("centring splits the delta on both axes", () => {
  const next = resizeBoard(seed(), { width: 140, height: 120 }, "center");
  assert.equal(next.components[0].x, 30); // 10 + 40/2
  assert.equal(next.components[0].y, 40); // 20 + 40/2
});

test("shrinking from the bottom-right pulls content back", () => {
  const next = resizeBoard(seed(), { width: 60, height: 40 }, "bottom-right");
  assert.equal(next.board.width, 60);
  assert.equal(next.components[0].x, -30); // 10 + (60-100)
  assert.equal(next.components[0].y, -20); // 20 + (40-80)
});

test("cuts follow their own axis only", () => {
  const next = resizeBoard(seed(), { width: 140, height: 120 }, "bottom-right");
  const vertical = next.board.cuts?.find((cut) => cut.id === "v");
  const horizontal = next.board.cuts?.find((cut) => cut.id === "h");
  assert.equal(vertical?.position, 80); // 40 + 40 (width delta)
  assert.equal(horizontal?.position, 70); // 30 + 40 (height delta)
});

test("measurements move by both endpoints", () => {
  const next = resizeBoard(seed(), { width: 140 }, "right");
  assert.deepEqual(
    [next.measurements[0].x1, next.measurements[0].x2],
    [40, 50],
  );
});

test("a no-op resize returns content untouched", () => {
  const next = resizeBoard(seed(), { width: 100, height: 80 }, "center");
  assert.equal(next.components[0].x, 10);
  assert.equal(next.measurements[0].x2, 10);
});
