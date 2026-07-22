import assert from "node:assert/strict";
import test from "node:test";

import { inspectGlb } from "../scripts/inspect-glb.mjs";

const BUILT_IN_L10_MODELS = [
  {
    name: "VR200 L10",
    expectedSpansMeters: [0.4972, 0.044, 0.8991],
    file: new URL(
      "../public/models/data-center/vera-rubin-vr-1u-20260715.glb",
      import.meta.url,
    ),
    mobileFile: new URL(
      "../public/models/data-center/vera-rubin-vr-1u-20260715.mobile.glb",
      import.meta.url,
    ),
  },
  {
    name: "GB300 L10",
    expectedSpansMeters: [0.4821, 0.0438, 0.9123],
    file: new URL(
      "../public/models/data-center/carlo-next-l10-20260715.glb",
      import.meta.url,
    ),
    mobileFile: new URL(
      "../public/models/data-center/carlo-next-l10-20260715.mobile.glb",
      import.meta.url,
    ),
  },
];

const BUILT_IN_RACK_MODELS = [
  {
    name: "GB300 L11",
    file: new URL(
      "../public/models/data-center/nv-mgx-rack-v1-2-rev7.glb",
      import.meta.url,
    ),
  },
];

for (const model of BUILT_IN_L10_MODELS) {
  test(`${model.name} keeps STEP assembly parts and source colors`, async () => {
    const inspection = await inspectGlb(model.file);

    assert.ok(
      inspection.meshCount >= 10,
      `${model.name} was flattened to ${inspection.meshCount} mesh(es)`,
    );
    assert.ok(
      inspection.primitiveCount >= 10,
      `${model.name} was flattened to ${inspection.primitiveCount} primitive(s)`,
    );
    assert.ok(
      inspection.materialCount >= 3,
      `${model.name} only contains ${inspection.materialCount ?? 0} material(s)`,
    );
    assert.ok(
      inspection.coloredMaterialCount >= 3,
      `${model.name} does not preserve enough distinct STEP colors`,
    );
    assert.ok(
      inspection.saturatedMaterialCount >= 2,
      `${model.name} does not preserve the non-neutral STEP colors`,
    );
  });

  test(`${model.name} retains its named top-cover assembly`, async () => {
    const inspection = await inspectGlb(model.file);

    assert.ok(
      inspection.nodeNames.some((name) => /top[\s_-]*cover/i.test(name)),
      `${model.name} is missing its named top-cover assembly`,
    );
  });

  test(`${model.name} keeps the authoritative horizontal 1U world envelope`, async () => {
    const inspection = await inspectGlb(model.file);

    assert.ok(inspection.worldBounds, `${model.name} has no measurable world bounds`);
    model.expectedSpansMeters.forEach((expected, axis) => {
      const actual = inspection.worldBounds.spans[axis];
      const relativeError = Math.abs(actual - expected) / expected;
      assert.ok(
        relativeError <= 0.03,
        `${model.name} axis ${axis} changed from ${expected}m to ${actual}m`,
      );
    });
  });

  test(`${model.name} mobile asset remains colored and lightweight`, async () => {
    const inspection = await inspectGlb(model.mobileFile);

    assert.ok(
      inspection.meshCount >= 3,
      `${model.name} mobile asset was flattened to ${inspection.meshCount} mesh(es)`,
    );
    assert.ok(
      inspection.materialCount >= 3,
      `${model.name} mobile asset only contains ${inspection.materialCount} material(s)`,
    );
    assert.ok(
      inspection.saturatedMaterialCount >= 2,
      `${model.name} mobile asset lost the non-neutral STEP colors`,
    );
    assert.ok(
      inspection.triangleCount <= 250_000,
      `${model.name} mobile asset contains ${inspection.triangleCount} triangles`,
    );
  });
}

for (const model of BUILT_IN_RACK_MODELS) {
  test(`${model.name} keeps its STEP assembly parts and source colors`, async () => {
    const inspection = await inspectGlb(model.file);

    assert.ok(
      inspection.meshCount >= 10,
      `${model.name} was flattened to ${inspection.meshCount} mesh(es)`,
    );
    assert.ok(
      inspection.materialCount >= 3,
      `${model.name} only contains ${inspection.materialCount} material(s)`,
    );
    assert.ok(
      inspection.saturatedMaterialCount >= 2,
      `${model.name} does not preserve the non-neutral STEP colors`,
    );
  });
}
