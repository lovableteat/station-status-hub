import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function align4(value) {
  return (value + 3) & ~3;
}

function parseArgs(argv) {
  const options = { scale: 0.001 };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--input") options.input = value;
    else if (key === "--output") options.output = value;
    else if (key === "--scale") options.scale = Number(value);
    else continue;
    index += 1;
  }
  if (!options.input || !options.output || !Number.isFinite(options.scale)) {
    throw new Error("--input, --output and a finite --scale are required.");
  }
  return options;
}

function readGlb(buffer) {
  if (buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2) {
    throw new Error("Only binary glTF 2.0 files are supported.");
  }
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a) throw new Error("GLB JSON chunk is missing.");
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8").trim());
  const binaryHeader = 20 + jsonLength;
  const binaryLength = buffer.readUInt32LE(binaryHeader);
  const binaryType = buffer.readUInt32LE(binaryHeader + 4);
  if (binaryType !== 0x004e4942) throw new Error("GLB binary chunk is missing.");
  return { json, binary: buffer.subarray(binaryHeader + 8, binaryHeader + 8 + binaryLength) };
}

function writeGlb(json, binary) {
  const jsonBytes = Buffer.from(JSON.stringify(json), "utf8");
  const jsonLength = align4(jsonBytes.length);
  const jsonChunk = Buffer.alloc(jsonLength, 0x20);
  jsonBytes.copy(jsonChunk);
  const binaryLength = align4(binary.length);
  const binaryChunk = Buffer.alloc(binaryLength);
  binary.copy(binaryChunk);
  const totalLength = 12 + 8 + jsonLength + 8 + binaryLength;
  const output = Buffer.allocUnsafe(totalLength);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(jsonLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(output, 20);
  const binaryHeader = 20 + jsonLength;
  output.writeUInt32LE(binaryLength, binaryHeader);
  output.writeUInt32LE(0x004e4942, binaryHeader + 4);
  binaryChunk.copy(output, binaryHeader + 8);
  return output;
}

const options = parseArgs(process.argv.slice(2));
const source = await readFile(resolve(options.input));
const { json, binary } = readGlb(source);
const sceneIndex = Number.isInteger(json.scene) ? json.scene : 0;
const scene = json.scenes?.[sceneIndex];
if (!scene) throw new Error(`GLB scene ${sceneIndex} is missing.`);
const sourceRoots = [...(scene.nodes || [])];
const rootIndex = json.nodes.length;
json.nodes.push({
  name: "STEP millimeter-to-meter root",
  scale: [options.scale, options.scale, options.scale],
  children: sourceRoots,
});
scene.nodes = [rootIndex];
await writeFile(resolve(options.output), writeGlb(json, binary));
console.log(JSON.stringify({ input: options.input, output: options.output, scale: options.scale }));
