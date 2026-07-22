import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Matrix4, Quaternion, Vector3 } from "three";

const JSON_CHUNK_TYPE = 0x4e4f534a;
const TRIANGLES_MODE = 4;

function getNodeLocalMatrix(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) {
    return new Matrix4().fromArray(node.matrix);
  }

  const position = new Vector3(...(node.translation ?? [0, 0, 0]));
  const rotation = new Quaternion(...(node.rotation ?? [0, 0, 0, 1]));
  const scale = new Vector3(...(node.scale ?? [1, 1, 1]));
  return new Matrix4().compose(position, rotation, scale);
}

function getWorldBounds(document) {
  const nodes = document.nodes ?? [];
  const meshes = document.meshes ?? [];
  const accessors = document.accessors ?? [];
  const minimum = new Vector3(Infinity, Infinity, Infinity);
  const maximum = new Vector3(-Infinity, -Infinity, -Infinity);
  const childNodeIndexes = new Set(nodes.flatMap((node) => node.children ?? []));
  const sceneRoots =
    document.scenes?.[document.scene ?? 0]?.nodes
    ?? nodes.map((_, index) => index).filter((index) => !childNodeIndexes.has(index));

  const visit = (nodeIndex, parentMatrix, activePath) => {
    if (activePath.has(nodeIndex)) throw new Error(`glTF node cycle detected at ${nodeIndex}.`);
    const node = nodes[nodeIndex];
    if (!node) return;

    const worldMatrix = parentMatrix.clone().multiply(getNodeLocalMatrix(node));
    if (node.mesh !== undefined) {
      for (const primitive of meshes[node.mesh]?.primitives ?? []) {
        const accessor = accessors[primitive.attributes?.POSITION];
        if (!accessor?.min || !accessor?.max) continue;
        for (const x of [accessor.min[0], accessor.max[0]]) {
          for (const y of [accessor.min[1], accessor.max[1]]) {
            for (const z of [accessor.min[2], accessor.max[2]]) {
              const point = new Vector3(Number(x), Number(y), Number(z)).applyMatrix4(worldMatrix);
              minimum.min(point);
              maximum.max(point);
            }
          }
        }
      }
    }

    const nextPath = new Set(activePath).add(nodeIndex);
    for (const childIndex of node.children ?? []) {
      visit(childIndex, worldMatrix, nextPath);
    }
  };

  for (const rootIndex of sceneRoots) {
    visit(rootIndex, new Matrix4(), new Set());
  }

  if (![minimum.x, minimum.y, minimum.z, maximum.x, maximum.y, maximum.z].every(Number.isFinite)) {
    return null;
  }

  const minimumValues = minimum.toArray();
  const maximumValues = maximum.toArray();
  return {
    minimum: minimumValues,
    maximum: maximumValues,
    spans: maximumValues.map((value, axis) => value - minimumValues[axis]),
  };
}

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

  const materialColorFactors = (document.materials ?? []).map((material) =>
    (material.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1])
      .slice(0, 4)
      .map((channel) => Number(channel)),
  );
  const materialColors = new Set(
    materialColorFactors.map((color) =>
      color.map((channel) => channel.toFixed(4)).join(","),
    ),
  );
  const saturatedMaterialCount = materialColorFactors.filter((color) => {
    const rgb = color.slice(0, 3);
    return Math.max(...rgb) - Math.min(...rgb) >= 0.08;
  }).length;

  return {
    bytes: buffer.length,
    nodeCount: document.nodes?.length ?? 0,
    nodeNames: (document.nodes ?? [])
      .map((node) => node.name)
      .filter((name) => typeof name === "string" && name.length > 0),
    meshCount: document.meshes?.length ?? 0,
    primitiveCount,
    materialCount: document.materials?.length ?? 0,
    coloredMaterialCount: materialColors.size,
    saturatedMaterialCount,
    materialColorFactors,
    vertexCount,
    triangleCount,
    positionAccessorBounds: {
      minimum,
      maximum,
      spans: maximum.map((value, axis) => value - minimum[axis]),
    },
    worldBounds: getWorldBounds(document),
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
