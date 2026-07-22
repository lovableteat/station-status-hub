import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error("Usage: node scripts/apply-cad-display-materials.mjs <input.glb> <output.glb>");
  process.exit(1);
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const document = await io.read(inputPath);
const root = document.getRoot();

const palette = {
  cover: createMaterial("CAD cover green", [0.025, 0.24, 0.105, 1], 0.42, 0.38),
  pcb: createMaterial("CAD PCB green", [0.015, 0.42, 0.13, 1], 0.22, 0.5),
  cooling: createMaterial("CAD cooling cyan", [0.02, 0.62, 0.74, 1], 0.32, 0.32),
  connector: createMaterial("CAD connector blue", [0.045, 0.22, 0.72, 1], 0.38, 0.3),
  carrier: createMaterial("CAD carrier gold", [0.92, 0.62, 0.035, 1], 0.48, 0.28),
  accent: createMaterial("CAD connector rose", [0.72, 0.16, 0.28, 1], 0.3, 0.36),
  metal: createMaterial("CAD machined metal", [0.54, 0.6, 0.64, 1], 0.78, 0.24),
  chassis: createMaterial("CAD chassis graphite", [0.17, 0.22, 0.24, 1], 0.68, 0.34),
  dark: createMaterial("CAD polymer dark", [0.035, 0.045, 0.055, 1], 0.18, 0.58),
};

function createMaterial(name, color, metalness, roughness) {
  return document
    .createMaterial(name)
    .setBaseColorFactor(color)
    .setMetallicFactor(metalness)
    .setRoughnessFactor(roughness)
    .setDoubleSided(true);
}

function chooseMaterial(name) {
  const value = name.toUpperCase();

  if (/TOP[_ -]*COVER|SECTION[_ -]*COVER|CAGE[_ -]*COVER/.test(value)) return palette.cover;
  if (/PCB|PDB|BOARD|BF3|OCP|FIO|NIC|OSFP|SFP/.test(value)) return palette.pcb;
  if (/QD|MANIFOLD|COLD|COOL|LIQUID|TUBE|PIPE/.test(value)) return palette.cooling;
  if (/CONNECTOR|CONN|PORT|SOCKET|CABLE/.test(value)) return palette.connector;
  if (/E1S|CARRIER|TRAY|CAGE|BRIDGE/.test(value)) return palette.carrier;
  if (/MYLAR|FOAM|GASKET|MAGNET|RUBBER/.test(value)) return palette.dark;
  if (/LATCH|HANDLE|LEVER|KNOB/.test(value)) return palette.accent;
  if (/SCREW|SCW|RIVET|PIN|SPRING|WASHER|WSR|BOLT|NUT|BRACKET|BKT|RAIL/.test(value)) {
    return palette.metal;
  }
  if (/CHASSIS|BASE|DIVIDER|FRAME|PANEL|PLATE|SHEET|STIFFENER|SUPPORT/.test(value)) {
    return palette.chassis;
  }

  return palette.metal;
}

for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const material = chooseMaterial(`${node.getName()} ${mesh.getName()}`);
  for (const primitive of mesh.listPrimitives()) primitive.setMaterial(material);
}

// FreeCAD exports this STEP with Z as height. The application uses Y-up.
for (const scene of root.listScenes()) {
  const originalChildren = [...scene.listChildren()];
  const axisCorrection = document
    .createNode("GB300_L10_Y_UP")
    .setRotation([Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
  scene.addChild(axisCorrection);
  for (const child of originalChildren) axisCorrection.addChild(child);
}

await io.write(outputPath, document);

console.log(
  JSON.stringify(
    {
      inputPath,
      outputPath,
      nodes: root.listNodes().length,
      meshes: root.listMeshes().length,
      materials: root.listMaterials().map((material) => material.getName()),
    },
    null,
    2,
  ),
);
