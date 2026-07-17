import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { OcctKernel } from "occt-wasm";

const AXES = ["x", "y", "z"];

function parseArgs(argv) {
  const options = {
    linearDeflection: 2,
    angularDeflection: 0.5,
    upAxis: "auto",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--input") options.input = value;
    else if (arg === "--output") options.output = value;
    else if (arg === "--metadata") options.metadata = value;
    else if (arg === "--linear-deflection") options.linearDeflection = Number(value);
    else if (arg === "--angular-deflection") options.angularDeflection = Number(value);
    else if (arg === "--up-axis") options.upAxis = value?.toLowerCase();
    else continue;
    index += 1;
  }

  if (!options.input || !options.output) {
    throw new Error(
      "Usage: node scripts/convert-step-to-glb.mjs --input model.stp --output model.glb " +
        "[--metadata model.json] [--up-axis auto|x|y|z]",
    );
  }
  if (options.upAxis !== "auto" && !AXES.includes(options.upAxis)) {
    throw new Error("--up-axis must be auto, x, y, or z.");
  }
  if (!Number.isFinite(options.linearDeflection) || options.linearDeflection <= 0) {
    throw new Error("--linear-deflection must be a positive number.");
  }
  if (!Number.isFinite(options.angularDeflection) || options.angularDeflection <= 0) {
    throw new Error("--angular-deflection must be a positive number.");
  }

  return options;
}

function memorySnapshot() {
  const memory = process.memoryUsage();
  return Object.fromEntries(
    Object.entries(memory).map(([key, value]) => [key, `${(value / 1024 ** 3).toFixed(2)} GiB`]),
  );
}

function log(stage, detail = {}) {
  console.log(
    JSON.stringify({
      time: new Date().toISOString(),
      stage,
      memory: memorySnapshot(),
      ...detail,
    }),
  );
}

function roundMillimeters(value) {
  return Math.max(0, Math.round(value * 10) / 10);
}

function dimensionsFromBounds(bounds, requestedUpAxis) {
  const min = [
    Math.min(...bounds.map((box) => Number(box.xmin))),
    Math.min(...bounds.map((box) => Number(box.ymin))),
    Math.min(...bounds.map((box) => Number(box.zmin))),
  ];
  const max = [
    Math.max(...bounds.map((box) => Number(box.xmax))),
    Math.max(...bounds.map((box) => Number(box.ymax))),
    Math.max(...bounds.map((box) => Number(box.zmax))),
  ];
  const spans = max.map((value, index) => value - min[index]);
  const detectedUpAxis = AXES[spans.indexOf(Math.max(...spans))];
  const sourceUpAxis = requestedUpAxis === "auto" ? detectedUpAxis : requestedUpAxis;

  const axisDimensions = {
    x: {
      widthMm: roundMillimeters(spans[1]),
      depthMm: roundMillimeters(spans[2]),
      heightMm: roundMillimeters(spans[0]),
    },
    y: {
      widthMm: roundMillimeters(spans[0]),
      depthMm: roundMillimeters(spans[2]),
      heightMm: roundMillimeters(spans[1]),
    },
    z: {
      widthMm: roundMillimeters(spans[0]),
      depthMm: roundMillimeters(spans[1]),
      heightMm: roundMillimeters(spans[2]),
    },
  };

  return {
    min,
    max,
    spans: {
      x: roundMillimeters(spans[0]),
      y: roundMillimeters(spans[1]),
      z: roundMillimeters(spans[2]),
    },
    detectedUpAxis,
    sourceUpAxis,
    dimensions: axisDimensions[sourceUpAxis],
  };
}

const options = parseArgs(process.argv.slice(2));
const inputPath = resolve(options.input);
const outputPath = resolve(options.output);
const metadataPath = resolve(options.metadata ?? `${outputPath}.json`);

let kernel;
let document;
let rootHandles = [];

try {
  log("initializing", { input: inputPath, output: outputPath });
  kernel = await OcctKernel.init();

  log("reading-step");
  const stepText = await readFile(inputPath, "utf8");
  log("step-loaded", { characters: stepText.length });

  document = kernel.importXCAFFromSTEP(stepText);
  log("step-parsed");

  const roots = document.getRoots();
  rootHandles = roots
    .map((label) => document.getLabelInfo(label).shapeHandle)
    .filter((handle) => handle !== null);
  if (!rootHandles.length) {
    throw new Error("The STEP file did not contain any renderable root shapes.");
  }

  const boxes = rootHandles.map((handle) => kernel.getBoundingBox(handle, false));
  const geometry = dimensionsFromBounds(boxes, options.upAxis);
  log("bounds-measured", { rootCount: rootHandles.length, ...geometry });

  const glb = document.exportGLTF({
    linearDeflection: options.linearDeflection,
    angularDeflection: options.angularDeflection,
  });
  if (glb.byteLength < 12 || new DataView(glb.buffer, glb.byteOffset).getUint32(0, true) !== 0x46546c67) {
    throw new Error("OpenCascade returned an invalid GLB file.");
  }
  log("glb-generated", { glbBytes: glb.byteLength });

  await writeFile(outputPath, glb);
  const metadata = {
    sourceFileName: basename(inputPath),
    sourceBytes: stepText.length,
    outputFileName: basename(outputPath),
    outputBytes: glb.byteLength,
    convertedAt: new Date().toISOString(),
    linearDeflection: options.linearDeflection,
    angularDeflection: options.angularDeflection,
    ...geometry,
  };
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  log("complete", { metadata: metadataPath });
} finally {
  rootHandles.forEach((handle) => kernel?.release(handle));
  document?.close();
  kernel?.[Symbol.dispose]();
}
