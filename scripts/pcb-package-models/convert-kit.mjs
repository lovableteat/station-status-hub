// Converts the Blender package kit (GLB, metres-as-millimetres, +Y up) into the JSON mesh kit the
// PCB Designer assembles at runtime. Node transforms are baked; colours go back to display RGB.
// usage: node scripts/pcb-package-models/convert-kit.mjs <kit.glb> <out.json>
import { readFile, writeFile } from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("usage: convert-kit.mjs <kit.glb> <out.json>");

const io = new NodeIO();
const document = await io.readBinary(new Uint8Array(await readFile(input)));
const root = document.getRoot();
const round = (value) => Math.round(value * 10_000) / 10_000;
const toDisplay = (linear) => {
  const value = Math.min(1, Math.max(0, linear));
  return round(value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055);
};
const multiply = (m, [x, y, z]) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];
const determinant = (m) => m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);

const pieces = {};
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const name = node.getName();
  const matrix = node.getWorldMatrix();
  const flip = determinant(matrix) < 0;
  const positions = [];
  const indices = [];
  let color = [0.7, 0.72, 0.75];
  for (const primitive of mesh.listPrimitives()) {
    const position = primitive.getAttribute("POSITION");
    if (!position) continue;
    const base = positions.length / 3;
    for (let i = 0; i < position.getCount(); i++) positions.push(...multiply(matrix, position.getElement(i, [])).map(round));
    const index = primitive.getIndices();
    const count = index ? index.getCount() : position.getCount();
    for (let i = 0; i < count; i += 3) {
      const a = index ? index.getScalar(i) : i, b = index ? index.getScalar(i + 1) : i + 1, c = index ? index.getScalar(i + 2) : i + 2;
      if (flip) indices.push(base + a, base + c, base + b); else indices.push(base + a, base + b, base + c);
    }
    const factor = primitive.getMaterial()?.getBaseColorFactor();
    if (factor) color = factor.slice(0, 3).map(toDisplay);
  }
  if (!positions.length || !indices.length) continue;
  if (!positions.every(Number.isFinite) || indices.some((i) => i < 0 || i >= positions.length / 3)) throw new Error(`invalid mesh: ${name}`);
  pieces[name] = { color, positions, indices };
}

const kit = { schemaVersion: 1, source: "scripts/pcb-package-models/pcb-package-kit.glb (Blender 5.2)", units: "mm", up: "y", pieces };
await writeFile(output, JSON.stringify(kit));
const triangles = Object.values(pieces).reduce((sum, piece) => sum + piece.indices.length / 3, 0);
console.log(JSON.stringify({ pieces: Object.keys(pieces).length, triangles, bytes: JSON.stringify(kit).length }));
