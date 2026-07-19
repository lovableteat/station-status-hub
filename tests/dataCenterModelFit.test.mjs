import assert from "node:assert/strict";
import test from "node:test";

import { getUniformModelFit } from "../src/components/data-center/modelFit.mjs";

test("CAD models keep one uniform scale across all three axes", () => {
  const fit = getUniformModelFit(
    {
      min: { x: -0.44, y: -0.0625, z: -0.9 },
      max: { x: 0.44, y: 0.0625, z: 0.9 },
    },
    {
      widthMm: 482.6,
      depthMm: 800,
      heightMm: 44.45,
    },
  );

  assert.deepEqual(fit.scale, [fit.uniformScale, fit.uniformScale, fit.uniformScale]);
  assert.equal(fit.uniformScale, 0.3556);
  assert.deepEqual(fit.position, [0, 0.0625, 0]);
});

test("CAD models are centered horizontally and rest on the rack floor", () => {
  const fit = getUniformModelFit(
    {
      min: { x: 1, y: -2, z: 5 },
      max: { x: 3, y: 6, z: 9 },
    },
    {
      widthMm: 1000,
      depthMm: 2000,
      heightMm: 4000,
    },
  );

  assert.deepEqual(fit.position, [-2, 2, -7]);
  assert.deepEqual(fit.fittedSizeMeters, {
    width: 1,
    height: 4,
    depth: 2,
  });
});

test("a shallow accessory can anchor to the front of a deeper envelope", () => {
  const fit = getUniformModelFit(
    {
      min: { x: -0.2486, y: -0.8238, z: -0.0437 },
      max: { x: 0.2486, y: 0.0753, z: 0 },
    },
    {
      widthMm: 497.2,
      depthMm: 889.6,
      heightMm: 899.1,
    },
    {
      depthAlignment: "front",
    },
  );

  assert.equal(fit.depthOffsetMeters, 0.42295);
  assert.equal(fit.fittedSizeMeters.depth, 0.0437);
});
