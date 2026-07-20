import assert from "node:assert/strict";
import test from "node:test";

import {
  collectInspectablePartNames,
  getInspectablePartName,
} from "../src/components/data-center/modelParts.mjs";

function createNode(name, { isMesh = false, children = [] } = {}) {
  const node = { name, isMesh, children, parent: null };
  for (const child of children) child.parent = node;
  node.traverse = (visitor) => {
    visitor(node);
    for (const child of children) child.traverse(visitor);
  };
  return node;
}

test("model viewer maps generated mesh names to their STEP assembly names", () => {
  const topCoverMesh = createNode("mesh_104_3", { isMesh: true });
  const topCover = createNode("1_TOP-COVER_VR", {
    children: [topCoverMesh],
  });
  const chassisMesh = createNode("mesh_22", { isMesh: true });
  const chassis = createNode("01_CHASSIS-VERARUBIN-L5-MGX_VR", {
    children: [chassisMesh],
  });
  const root = createNode("00_VERARUBIN-NVL72_VR_ASM", {
    children: [topCover, chassis],
  });

  assert.equal(getInspectablePartName(topCoverMesh), "1_TOP-COVER_VR");
  assert.equal(
    getInspectablePartName(chassisMesh),
    "01_CHASSIS-VERARUBIN-L5-MGX_VR",
  );
  assert.deepEqual(collectInspectablePartNames(root), [
    "01_CHASSIS-VERARUBIN-L5-MGX_VR",
    "1_TOP-COVER_VR",
  ]);
});

test("model viewer skips converter instance names in favor of STEP assembly names", () => {
  const generatedMesh = createNode("mesh_18", { isMesh: true });
  const generatedInstance = createNode("_instance_4", {
    children: [generatedMesh],
  });
  const topAssembly = createNode("00_VERARUBIN-NVL72_VR_ASM", {
    children: [generatedInstance],
  });

  assert.equal(
    getInspectablePartName(generatedMesh),
    "00_VERARUBIN-NVL72_VR_ASM",
  );
  assert.deepEqual(collectInspectablePartNames(topAssembly), [
    "00_VERARUBIN-NVL72_VR_ASM",
  ]);
});

test("model viewer falls back to mesh names when no STEP assembly name exists", () => {
  const generatedMesh = createNode("mesh_7", { isMesh: true });
  const root = createNode("", { children: [generatedMesh] });

  assert.equal(getInspectablePartName(generatedMesh), "mesh_7");
  assert.deepEqual(collectInspectablePartNames(root), ["mesh_7"]);
});
