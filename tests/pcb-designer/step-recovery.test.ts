import assert from "node:assert/strict";
import test from "node:test";
import { findRecoverableStepModels } from "../../src/components/pcb-designer/core/stepRecovery.ts";
import { createBlankProject } from "../../src/components/pcb-designer/defaults.ts";
import type { PcbModelAssetMetadata } from "../../src/components/pcb-designer/types.ts";

const asset = (id: string, fileName = `${id}.step`, widthMm = 10): PcbModelAssetMetadata => ({
  schemaVersion: 1, id, fileName, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  dimensions: { widthMm, depthMm: 8, heightMm: 2 }, calibratedDimensions: { widthMm, depthMm: 8, heightMm: 2 },
  upAxis: "z", bounds: { min: [0, 0, 0], max: [widthMm, 8, 2] }, parts: [],
});

test("manual STEP recovery excludes library and board references and retains fingerprint de-duplication", () => {
  const libraryAsset = asset("library", "same.step"), boardAsset = asset("board");
  const unreferenced = asset("recover", "Recover.step"), duplicate = asset("duplicate", " recover.STEP ");
  const project = createBlankProject("Synthetic");
  project.components = [{ modelAssetId: boardAsset.id } as never];
  const input = [libraryAsset, boardAsset, asset("same-file", "SAME.step"), unreferenced, duplicate, asset("different-size", "same.step", 11)];
  const result = findRecoverableStepModels(input, [{ modelAssetId: libraryAsset.id } as never], [project]);
  assert.deepEqual(result.map(item => item.id), ["recover", "different-size"]);
  assert.equal(input.length, 6);
});

test("a deliberately deleted STEP is offered only as an unselected recovery candidate", () => {
  const removed = asset("deliberately-removed");
  assert.deepEqual(findRecoverableStepModels([removed], [], []), [removed]);
});
