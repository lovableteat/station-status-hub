import occtimportjs from "occt-import-js";
import occtWasmUrl from "occt-import-js/dist/occt-import-js.wasm?url";

import type { ImportedStepDimensions, ImportedStepModel, ImportedStepPart } from "./dataCenterTypes";

function roundMm(value: number) {
  return Math.max(0, Math.round(value * 10) / 10);
}

function getDimensionsFromBounds(min: [number, number, number], max: [number, number, number]): ImportedStepDimensions {
  return {
    widthMm: roundMm(max[0] - min[0]),
    depthMm: roundMm(max[1] - min[1]),
    heightMm: roundMm(max[2] - min[2]),
  };
}

export async function importStepModel(file: File): Promise<ImportedStepModel> {
  const occt = await occtimportjs({
    locateFile: (path) => (path.endsWith(".wasm") ? occtWasmUrl : path),
  });

  const fileBuffer = new Uint8Array(await file.arrayBuffer());
  const result = occt.ReadStepFile(fileBuffer, {
    linearUnit: "millimeter",
    linearDeflectionType: "bounding_box_ratio",
    linearDeflection: 0.002,
    angularDeflection: 0.3,
  });

  if (!result.success || !result.meshes.length) {
    throw new Error("STEP 檔案無法解析，請確認模型內容正常，或重新輸出一次 STEP。");
  }

  const boundsMin: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const boundsMax: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];

  const parts: ImportedStepPart[] = result.meshes.map((mesh, index) => {
    const position = Float32Array.from(mesh.attributes.position.array);
    const normal = mesh.attributes.normal ? Float32Array.from(mesh.attributes.normal.array) : undefined;
    const meshIndex = Uint32Array.from(mesh.index.array);

    for (let offset = 0; offset < position.length; offset += 3) {
      const x = position[offset];
      const y = position[offset + 1];
      const z = position[offset + 2];

      if (x < boundsMin[0]) boundsMin[0] = x;
      if (y < boundsMin[1]) boundsMin[1] = y;
      if (z < boundsMin[2]) boundsMin[2] = z;

      if (x > boundsMax[0]) boundsMax[0] = x;
      if (y > boundsMax[1]) boundsMax[1] = y;
      if (z > boundsMax[2]) boundsMax[2] = z;
    }

    return {
      id: `${file.name}-part-${index}`,
      name: mesh.name || `Part ${index + 1}`,
      color: mesh.color,
      position,
      normal,
      index: meshIndex,
    };
  });

  const dimensions = getDimensionsFromBounds(boundsMin, boundsMax);

  return {
    id: `step-${Date.now()}`,
    fileName: file.name,
    importedAt: new Date().toISOString(),
    sourceUnit: "millimeter",
    parts,
    dimensions,
    calibratedDimensions: dimensions,
  };
}
