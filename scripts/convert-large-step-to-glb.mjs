import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const loadOcct = require("occt-import-js");
const MILLIMETERS_TO_METERS = 0.001;

function parseArgs(argv) {
  const options = {
    linearDeflection: 2.5,
    angularDeflection: 0.5,
    upAxis: "y",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--input") options.input = value;
    else if (key === "--output") options.output = value;
    else if (key === "--metadata") options.metadata = value;
    else if (key === "--linear-deflection") options.linearDeflection = Number(value);
    else if (key === "--angular-deflection") options.angularDeflection = Number(value);
    else if (key === "--up-axis") options.upAxis = value?.toLowerCase();
    else continue;
    index += 1;
  }
  if (!options.input || !options.output) {
    throw new Error("--input and --output are required.");
  }
  if (!["x", "y", "z"].includes(options.upAxis)) {
    throw new Error("--up-axis must be x, y, or z.");
  }
  return options;
}

function log(stage, detail = {}) {
  const memory = process.memoryUsage();
  console.log(JSON.stringify({
    time: new Date().toISOString(),
    stage,
    rssGiB: Number((memory.rss / 1024 ** 3).toFixed(2)),
    ...detail,
  }));
}

function align4(value) {
  return (value + 3) & ~3;
}

function colorKey(color) {
  return color.map((value) => Number(value).toFixed(5)).join(":");
}

function safeColor(color) {
  if (!Array.isArray(color) || color.length < 3) return [0.72, 0.75, 0.78];
  return color.slice(0, 3).map((value) => Math.max(0, Math.min(1, Number(value))));
}

function addChunk(state, source, target) {
  const typed = source instanceof target ? source : target.from(source);
  const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
  const byteOffset = state.byteLength;
  state.chunks.push(bytes);
  state.byteLength += bytes.byteLength;
  const padding = align4(state.byteLength) - state.byteLength;
  if (padding) {
    state.chunks.push(Buffer.alloc(padding));
    state.byteLength += padding;
  }
  return { byteOffset, byteLength: bytes.byteLength };
}

function positionBounds(positions, globalBounds) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = Number(positions[index + axis]);
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
      globalBounds.min[axis] = Math.min(globalBounds.min[axis], value);
      globalBounds.max[axis] = Math.max(globalBounds.max[axis], value);
    }
  }
  return { min, max };
}

function dimensionMetadata(bounds, upAxis) {
  const minimum = bounds.min.map((value) => value / MILLIMETERS_TO_METERS);
  const maximum = bounds.max.map((value) => value / MILLIMETERS_TO_METERS);
  const spans = maximum.map((value, index) => value - minimum[index]);
  const rounded = spans.map((value) => Math.round(value * 10) / 10);
  const dimensions = upAxis === "y"
    ? { widthMm: rounded[0], depthMm: rounded[2], heightMm: rounded[1] }
    : upAxis === "z"
      ? { widthMm: rounded[0], depthMm: rounded[1], heightMm: rounded[2] }
      : { widthMm: rounded[1], depthMm: rounded[2], heightMm: rounded[0] };
  return {
    minimum,
    maximum,
    spans: { x: rounded[0], y: rounded[1], z: rounded[2] },
    dimensions,
  };
}

function hierarchyNames(root) {
  const names = new Map();
  const visit = (node, path = []) => {
    if (!node) return;
    const currentName = String(node.name || "").trim();
    const nextPath = currentName ? [...path, currentName] : path;
    for (const meshIndex of node.meshes || []) {
      if (!names.has(meshIndex)) names.set(meshIndex, nextPath.join(" / "));
    }
    for (const child of node.children || []) visit(child, nextPath);
  };
  visit(root);
  return names;
}

function buildGlb(result) {
  const binary = { chunks: [], byteLength: 0 };
  const gltf = {
    asset: { version: "2.0", generator: "station-status-hub large STEP converter" },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    materials: [],
    accessors: [],
    bufferViews: [],
    buffers: [{ byteLength: 0 }],
  };
  const materials = new Map();
  const names = hierarchyNames(result.root);
  const globalBounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  let triangleCount = 0;

  const materialIndex = (inputColor) => {
    const color = safeColor(inputColor);
    const key = colorKey(color);
    if (materials.has(key)) return materials.get(key);
    const index = gltf.materials.length;
    gltf.materials.push({
      name: `STEP ${key}`,
      doubleSided: true,
      pbrMetallicRoughness: {
        baseColorFactor: [...color, 1],
        metallicFactor: 0.12,
        roughnessFactor: 0.48,
      },
    });
    materials.set(key, index);
    return index;
  };

  for (let meshIndex = 0; meshIndex < result.meshes.length; meshIndex += 1) {
    const sourceMesh = result.meshes[meshIndex];
    const sourcePositions = sourceMesh.attributes?.position?.array;
    const sourceIndices = sourceMesh.index?.array;
    if (!sourcePositions?.length || !sourceIndices?.length) continue;

    // glTF uses meters. STEP assemblies in this workflow are authored in millimeters.
    const positions = Float32Array.from(
      sourcePositions,
      (value) => Number(value) * MILLIMETERS_TO_METERS,
    );
    const normals = sourceMesh.attributes?.normal?.array?.length
      ? Float32Array.from(sourceMesh.attributes.normal.array)
      : null;
    const indices = Uint32Array.from(sourceIndices);
    triangleCount += indices.length / 3;

    const positionChunk = addChunk(binary, positions, Float32Array);
    const positionView = gltf.bufferViews.push({
      buffer: 0,
      byteOffset: positionChunk.byteOffset,
      byteLength: positionChunk.byteLength,
      byteStride: 12,
      target: 34962,
    }) - 1;
    const bounds = positionBounds(positions, globalBounds);
    const positionAccessor = gltf.accessors.push({
      bufferView: positionView,
      componentType: 5126,
      count: positions.length / 3,
      type: "VEC3",
      min: bounds.min,
      max: bounds.max,
    }) - 1;

    let normalAccessor = null;
    if (normals) {
      const normalChunk = addChunk(binary, normals, Float32Array);
      const normalView = gltf.bufferViews.push({
        buffer: 0,
        byteOffset: normalChunk.byteOffset,
        byteLength: normalChunk.byteLength,
        byteStride: 12,
        target: 34962,
      }) - 1;
      normalAccessor = gltf.accessors.push({
        bufferView: normalView,
        componentType: 5126,
        count: normals.length / 3,
        type: "VEC3",
      }) - 1;
    }

    const attributes = { POSITION: positionAccessor };
    if (normalAccessor !== null) attributes.NORMAL = normalAccessor;
    const groupedIndices = new Map();
    const faces = Array.isArray(sourceMesh.brep_faces) ? sourceMesh.brep_faces : [];
    const triangleTotal = indices.length / 3;
    let triangleIndex = 0;
    let faceIndex = 0;
    const defaultColor = safeColor(sourceMesh.color);

    while (triangleIndex < triangleTotal) {
      const face = faces[faceIndex];
      let lastTriangle;
      let color;
      if (!face) {
        lastTriangle = triangleTotal;
        color = defaultColor;
      } else if (triangleIndex < face.first) {
        lastTriangle = face.first;
        color = defaultColor;
      } else {
        lastTriangle = face.last + 1;
        color = face.color || defaultColor;
        faceIndex += 1;
      }
      const firstIndex = triangleIndex * 3;
      const lastIndex = lastTriangle * 3;
      if (lastIndex > firstIndex) {
        const material = materialIndex(color);
        const group = groupedIndices.get(material) || [];
        for (let index = firstIndex; index < lastIndex; index += 1) {
          group.push(indices[index]);
        }
        groupedIndices.set(material, group);
      }
      triangleIndex = lastTriangle;
    }

    // A STEP assembly can contain tens of thousands of colored faces. Grouping
    // same-color faces per part preserves appearance without one draw call per face.
    const primitives = [];
    for (const [material, group] of groupedIndices) {
      const grouped = Uint32Array.from(group);
      const indexChunk = addChunk(binary, grouped, Uint32Array);
      const indexView = gltf.bufferViews.push({
        buffer: 0,
        byteOffset: indexChunk.byteOffset,
        byteLength: indexChunk.byteLength,
        target: 34963,
      }) - 1;
      const accessor = gltf.accessors.push({
        bufferView: indexView,
        componentType: 5125,
        count: grouped.length,
        type: "SCALAR",
      }) - 1;
      primitives.push({ attributes, indices: accessor, material });
    }

    const sourceName = String(sourceMesh.name || "").trim();
    const nodeName = sourceName || names.get(meshIndex) || `STEP part ${meshIndex + 1}`;
    const targetMesh = gltf.meshes.push({ name: nodeName, primitives }) - 1;
    const node = gltf.nodes.push({ name: nodeName, mesh: targetMesh }) - 1;
    gltf.scenes[0].nodes.push(node);
  }

  gltf.buffers[0].byteLength = binary.byteLength;
  const binaryBuffer = Buffer.concat(binary.chunks, binary.byteLength);
  const jsonBytes = Buffer.from(JSON.stringify(gltf), "utf8");
  const jsonLength = align4(jsonBytes.length);
  const jsonChunk = Buffer.alloc(jsonLength, 0x20);
  jsonBytes.copy(jsonChunk);
  const totalLength = 12 + 8 + jsonLength + 8 + binaryBuffer.length;
  const output = Buffer.allocUnsafe(totalLength);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(jsonLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(output, 20);
  const binaryHeader = 20 + jsonLength;
  output.writeUInt32LE(binaryBuffer.length, binaryHeader);
  output.writeUInt32LE(0x004e4942, binaryHeader + 4);
  binaryBuffer.copy(output, binaryHeader + 8);

  return {
    output,
    meshCount: gltf.meshes.length,
    materialCount: gltf.materials.length,
    triangleCount,
    bounds: globalBounds,
  };
}

const options = parseArgs(process.argv.slice(2));
const inputPath = resolve(options.input);
const outputPath = resolve(options.output);
const metadataPath = resolve(options.metadata ?? `${outputPath}.json`);

log("initializing", { input: inputPath });
const occt = await loadOcct({
  locateFile: (path) => resolve("node_modules", "occt-import-js", "dist", path),
});
log("reading-step");
const source = await readFile(inputPath);
log("step-loaded", { sourceBytes: source.byteLength });
const result = occt.ReadStepFile(source, {
  linearUnit: "millimeter",
  linearDeflectionType: "absolute_value",
  linearDeflection: options.linearDeflection,
  angularDeflection: options.angularDeflection,
});
if (!result?.success || !Array.isArray(result.meshes) || !result.meshes.length) {
  throw new Error("OpenCascade failed to import the STEP assembly.");
}
log("step-parsed", { sourceMeshCount: result.meshes.length });
const converted = buildGlb(result);
log("glb-generated", {
  outputBytes: converted.output.byteLength,
  meshCount: converted.meshCount,
  materialCount: converted.materialCount,
  triangleCount: converted.triangleCount,
});
await writeFile(outputPath, converted.output);
const geometry = dimensionMetadata(converted.bounds, options.upAxis);
const metadata = {
  sourceFileName: basename(inputPath),
  sourceBytes: source.byteLength,
  outputFileName: basename(outputPath),
  outputBytes: converted.output.byteLength,
  convertedAt: new Date().toISOString(),
  converter: "occt-import-js-xcaf",
  sourceUpAxis: options.upAxis,
  upAxis: options.upAxis,
  linearDeflection: options.linearDeflection,
  angularDeflection: options.angularDeflection,
  meshCount: converted.meshCount,
  materialCount: converted.materialCount,
  triangleCount: converted.triangleCount,
  ...geometry,
};
await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
log("complete", { output: outputPath, metadata: metadataPath });
