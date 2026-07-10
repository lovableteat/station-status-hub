import occtimportjs from "occt-import-js";
import occtWasmUrl from "occt-import-js/dist/occt-import-js.wasm?url";

import type {
  ImportedStepBounds,
  ImportedStepDimensions,
  ImportedStepModel,
  ImportedStepPart,
  ModelUpAxis,
} from "./dataCenterTypes";

function roundMm(value: number) {
  return Math.max(0, Math.round(value * 10) / 10);
}

function detectUpAxis(spans: [number, number, number]): ModelUpAxis {
  const largest = Math.max(...spans);
  if (spans[0] === largest) return "x";
  if (spans[1] === largest) return "y";
  return "z";
}

function getCanonicalDimensions(
  bounds: ImportedStepBounds,
  upAxis: ModelUpAxis
): ImportedStepDimensions {
  const spans: [number, number, number] = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ];

  if (upAxis === "x") {
    return {
      widthMm: roundMm(spans[1]),
      depthMm: roundMm(spans[2]),
      heightMm: roundMm(spans[0]),
    };
  }

  if (upAxis === "y") {
    return {
      widthMm: roundMm(spans[0]),
      depthMm: roundMm(spans[2]),
      heightMm: roundMm(spans[1]),
    };
  }

  return {
    widthMm: roundMm(spans[0]),
    depthMm: roundMm(spans[1]),
    heightMm: roundMm(spans[2]),
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
    linearDeflection: 0.004,
    angularDeflection: 0.4,
  });

  if (!result.success || !result.meshes.length) {
    throw new Error("STEP 解析失敗，檔案沒有可顯示的 3D 組立資料。");
  }

  const bounds: ImportedStepBounds = {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  };

  const parts: ImportedStepPart[] = [];

  result.meshes.forEach((mesh, index) => {
    const rawPositions = mesh.attributes?.position?.array ?? [];
    const rawIndices = mesh.index?.array ?? [];
    if (!rawPositions.length || !rawIndices.length) {
      return;
    }

    const position = Float32Array.from(rawPositions);
    const normal = mesh.attributes.normal
      ? Float32Array.from(mesh.attributes.normal.array)
      : undefined;
    const meshIndex = Uint32Array.from(rawIndices);

    for (let offset = 0; offset < position.length; offset += 3) {
      const x = position[offset];
      const y = position[offset + 1];
      const z = position[offset + 2];

      if (x < bounds.min[0]) bounds.min[0] = x;
      if (y < bounds.min[1]) bounds.min[1] = y;
      if (z < bounds.min[2]) bounds.min[2] = z;
      if (x > bounds.max[0]) bounds.max[0] = x;
      if (y > bounds.max[1]) bounds.max[1] = y;
      if (z > bounds.max[2]) bounds.max[2] = z;
    }

    parts.push({
      id: `${file.name}-part-${index}`,
      name: mesh.name || `Part ${index + 1}`,
      color: mesh.color,
      position,
      normal,
      index: meshIndex,
    });
  });

  if (!parts.length || !bounds.min.every(Number.isFinite) || !bounds.max.every(Number.isFinite)) {
    throw new Error(
      "此 AP242 STEP 在瀏覽器轉檔器中沒有產生網格。請先轉為 GLB 再匯入；公司 MGX Rev7 模型已完成內建轉檔。"
    );
  }

  const spans: [number, number, number] = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ];
  const upAxis = detectUpAxis(spans);
  const dimensions = getCanonicalDimensions(bounds, upAxis);

  if (!dimensions.widthMm || !dimensions.depthMm || !dimensions.heightMm) {
    throw new Error("STEP 尺寸無效，請檢查模型單位與座標軸。");
  }

  return {
    id: `step-${crypto.randomUUID()}`,
    fileName: file.name,
    importedAt: new Date().toISOString(),
    sourceUnit: "millimeter",
    upAxis,
    bounds,
    parts,
    dimensions,
    calibratedDimensions: dimensions,
  };
}
