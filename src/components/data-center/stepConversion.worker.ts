import { OcctKernel } from "occt-wasm";

import { getCanonicalModelBounds } from "./stepModelBounds.mjs";

function report(stage: string, label: string) {
  self.postMessage({ type: "progress", progress: { stage, label } });
}

self.onmessage = async (event: MessageEvent<{ file: File }>) => {
  const { file } = event.data;
  let document: ReturnType<OcctKernel["importXCAFFromSTEP"]> | undefined;
  let kernel: OcctKernel | undefined;
  try {
    report("loading-engine", "載入 OpenCascade 8 轉換引擎");
    kernel = await OcctKernel.init();

    report("reading", `讀取 ${file.name}`);
    const stepText = new TextDecoder().decode(await file.arrayBuffer());

    report("parsing", "解析 AP242 組立、名稱與顏色");
    document = kernel.importXCAFFromSTEP(stepText);
    const rootLabels = document.getRoots();
    const rootHandles = rootLabels
      .map((label) => document?.getLabelInfo(label).shapeHandle ?? null)
      .filter((handle) => handle !== null);
    if (!rootHandles.length) {
      throw new Error("STEP 解析完成，但沒有找到可顯示的 3D 組立。");
    }

    const boxes = rootHandles.map((handle) => kernel?.getBoundingBox(handle, false));
    rootHandles.forEach((handle) => kernel?.release(handle));
    const { dimensions, sourceUpAxis } = getCanonicalModelBounds(boxes);

    report("building-glb", "產生輕量化 GLB 顯示模型");
    const glbBytes = document.exportGLTF({
      linearDeflection: 1,
      angularDeflection: 0.5,
    });
    const glb = new ArrayBuffer(glbBytes.byteLength);
    new Uint8Array(glb).set(glbBytes);
    const header = new DataView(glb);
    if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2) {
      throw new Error("STEP 已解析，但產生的 GLB 格式不完整。");
    }

    report("complete", "GLB 轉換完成");
    (self as unknown as Worker).postMessage(
      {
        type: "complete",
        result: { dimensions, glb, sourceUpAxis, upAxis: "y" },
      },
      [glb]
    );
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "模型轉換失敗。";
    const message = /memory|allocation|Array buffer/i.test(rawMessage)
      ? "模型需要的記憶體超過目前瀏覽器可用容量，請關閉其他大型程式後重試。"
      : rawMessage;
    self.postMessage({ type: "error", message });
  } finally {
    document?.close();
    kernel?.[Symbol.dispose]();
  }
};
