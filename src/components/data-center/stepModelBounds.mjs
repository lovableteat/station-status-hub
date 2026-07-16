function roundMillimeters(value) {
  return Math.max(0, Math.round(value * 10) / 10);
}

function detectUpAxis(spans) {
  const largest = Math.max(...spans);
  if (spans[0] === largest) return "x";
  if (spans[1] === largest) return "y";
  return "z";
}

export function getCanonicalModelBounds(boxes) {
  if (!boxes.length) {
    throw new Error("STEP 檔案沒有可量測的 3D 組立資料。");
  }

  const min = [
    Math.min(...boxes.map((box) => Number(box.xmin))),
    Math.min(...boxes.map((box) => Number(box.ymin))),
    Math.min(...boxes.map((box) => Number(box.zmin))),
  ];
  const max = [
    Math.max(...boxes.map((box) => Number(box.xmax))),
    Math.max(...boxes.map((box) => Number(box.ymax))),
    Math.max(...boxes.map((box) => Number(box.zmax))),
  ];

  if (![...min, ...max].every(Number.isFinite)) {
    throw new Error("STEP 檔案的模型尺寸無法辨識。");
  }

  const spans = max.map((value, axis) => value - min[axis]);
  const sourceUpAxis = detectUpAxis(spans);
  let dimensions;

  if (sourceUpAxis === "x") {
    dimensions = {
      widthMm: roundMillimeters(spans[1]),
      depthMm: roundMillimeters(spans[2]),
      heightMm: roundMillimeters(spans[0]),
    };
  } else if (sourceUpAxis === "z") {
    dimensions = {
      widthMm: roundMillimeters(spans[0]),
      depthMm: roundMillimeters(spans[1]),
      heightMm: roundMillimeters(spans[2]),
    };
  } else {
    dimensions = {
      widthMm: roundMillimeters(spans[0]),
      depthMm: roundMillimeters(spans[2]),
      heightMm: roundMillimeters(spans[1]),
    };
  }

  if (!dimensions.widthMm || !dimensions.depthMm || !dimensions.heightMm) {
    throw new Error("STEP 模型缺少完整的寬、深、高尺寸。");
  }

  return { dimensions, sourceUpAxis };
}
