import assert from "node:assert/strict";
import test from "node:test";

import {
  collectInspectablePartNames,
  getInspectablePartName,
} from "../src/components/data-center/modelParts.mjs";
import { readFile } from "node:fs/promises";

const viewerSource = await readFile(
  new URL("../src/components/data-center/DataCenterModelViewer.tsx", import.meta.url),
  "utf8",
);

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

test("model viewer uses one deterministic camera fit instead of refitting loading geometry", () => {
  assert.doesNotMatch(viewerSource, /<Bounds/);
  assert.match(viewerSource, /function InspectionCameraRig/);
  assert.match(viewerSource, /frameloop="demand"/);
  assert.match(viewerSource, /<Suspense fallback=\{null\}>/);
  assert.match(viewerSource, /data-\[state=open\]:!animate-none/);
  assert.match(viewerSource, /h-\[min\(94svh,920px\)\]/);
});

test("model detail controls have visible named groups for each task", () => {
  for (const label of ["顯示模式", "剖面檢視", "視角控制", "零件結構", "模型規格"]) {
    const section = viewerSource.match(new RegExp(`<section className="dc-preview-section" aria-label="${label}">([\\s\\S]*?)<\\/section>`));
    assert.ok(section, `${label} must be a named section`);
    assert.match(section[1], new RegExp(`<h3 className="dc-preview-section-title">[\\s\\S]*?${label}<\\/h3>`));
  }
  const modes = viewerSource.match(/aria-label="顯示模式">([\s\S]*?)<\/section>/)[1];
  assert.match(modes, /實體/);
  assert.match(modes, /透視/);
  assert.match(modes, /線框/);
  assert.doesNotMatch(modes, /重設視角|sectionEnabled/);
});

test("model detail categories preserve narrow-screen data access and readable names", async () => {
  const css = await readFile(new URL("../src/components/data-center/data-center.css", import.meta.url), "utf8");
  assert.match(viewerSource, /lg:grid-cols-\[280px_minmax\(0,1fr\)\]/);
  assert.match(viewerSource, /<span className="dc-preview-part-name">\{partName\}<\/span>/);
  assert.doesNotMatch(viewerSource, /hidden space-y-3[^\n]+lg:block/);
  assert.match(css, /\.dc-preview-section-title \{[^}]*background: hsl\(var\(--secondary\)\)/);
  assert.match(css, /\.dc-preview-section \+ \.dc-preview-section \{[^}]*margin-top: 16px/);
  assert.match(css, /\.dc-preview-part-name \{[^}]*overflow-wrap: anywhere/);
});
