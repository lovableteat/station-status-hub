import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const JSON_CHUNK_TYPE = 0x4e4f534a;
const TRIANGLES_MODE = 4;

export async function inspectGlb(filePath) {
  const buffer = await readFile(filePath);
  if (buffer.toString("ascii", 0, 4) !== "glTF") {
    throw new Error(`${filePath} is not a binary glTF file.`);
  }

  let offset = 12;
  let document;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (type === JSON_CHUNK_TYPE) {
      document = JSON.parse(buffer.toString("utf8", start, start + length));
      break;
    }
    offset = start + length;
  }
  if (!document) {
    throw new Error(`${filePath} does not contain a JSON chunk.`);
  }

  let triangleCount = 0;
  let vertexCount = 0;
  let primitiveCount = 0;
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (const mesh of document.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      primitiveCount += 1;
      const positionAccessor = document.accessors?.[primitive.attributes?.POSITION];
      vertexCount += Number(positionAccessor?.count ?? 0);
      for (let axis = 0; axis < 3; axis += 1) {
        minimum[axis] = Math.min(minimum[axis], Number(positionAccessor?.min?.[axis] ?? Infinity));
        maximum[axis] = Math.max(maximum[axis], Number(positionAccessor?.max?.[axis] ?? -Infinity));
      }
      if ((primitive.mode ?? TRIANGLES_MODE) !== TRIANGLES_MODE) continue;
      const indexAccessor = document.accessors?.[primitive.indices];
      const indexCount = Number(indexAccessor?.count ?? positionAccessor?.count ?? 0);
      triangleCount += Math.floor(indexCount / 3);
    }
  }

  return {
    bytes: buffer.length,
    meshCount: document.meshes?.length ?? 0,
    primitiveCount,
    vertexCount,
    triangleCount,
    positionAccessorBounds: {
      minimum,
      maximum,
      spans: maximum.map((value, axis) => value - minimum[axis]),
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const files = process.argv.slice(2);
  if (!files.length) {
    throw new Error("Usage: node scripts/inspect-glb.mjs <file.glb> [...]");
  }
  for (const filePath of files) {
    console.log(JSON.stringify({ filePath, ...(await inspectGlb(filePath)) }));
  }
}
