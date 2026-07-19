import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import { getModelAxisRotation } from "../src/components/data-center/modelOrientation.mjs";

async function loadBounds(relativePath, upAxis) {
  const file = await readFile(new URL(relativePath, import.meta.url));
  const arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const gltf = await new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.parse(arrayBuffer, "", resolve, reject);
  });
  gltf.scene.rotation.set(...getModelAxisRotation(upAxis));
  gltf.scene.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
}

test("VR200 L10 stays horizontal after scene axis conversion", async () => {
  const size = await loadBounds(
    "../public/models/data-center/vera-rubin-vr-1u-20260715.glb",
    "z",
  );

  assert.ok(size.x > size.y * 10, `expected width to exceed 1U height, got ${size.toArray()}`);
  assert.ok(size.z > size.y * 15, `expected depth to exceed 1U height, got ${size.toArray()}`);
  assert.ok(Math.abs(size.x / size.z - 497.2 / 899.1) < 0.02);
});

test("GB300 L10 stays horizontal after scene axis conversion", async () => {
  const size = await loadBounds(
    "../public/models/data-center/carlo-next-l10-20260715.glb",
    "z",
  );

  assert.ok(size.x > size.y * 10, `expected width to exceed 1U height, got ${size.toArray()}`);
  assert.ok(size.z > size.y * 15, `expected depth to exceed 1U height, got ${size.toArray()}`);
  assert.ok(Math.abs(size.x / size.z - 481.5 / 889.6) < 0.02);
});
