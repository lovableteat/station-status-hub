import type { ImportedStepDimensions, ModelUpAxis } from "./dataCenterTypes";

export interface ModelConversionProgress {
  label: string;
  stage: string;
}

export interface ConvertedStepGlb {
  dimensions: ImportedStepDimensions;
  glb: ArrayBuffer;
  sourceUpAxis: ModelUpAxis;
  upAxis: "y";
}

type WorkerMessage =
  | { type: "progress"; progress: ModelConversionProgress }
  | { type: "complete"; result: ConvertedStepGlb }
  | { type: "error"; message: string };

export function convertStepToGlb(
  file: File,
  onProgress?: (progress: ModelConversionProgress) => void,
  signal?: AbortSignal
): Promise<ConvertedStepGlb> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./stepConversion.worker.ts", import.meta.url), {
      type: "module",
    });
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", handleAbort);
      worker.terminate();
      callback();
    };

    const handleAbort = () => {
      finish(() => reject(new DOMException("模型轉換已取消。", "AbortError")));
    };

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.type === "progress") {
        onProgress?.(message.progress);
        return;
      }
      if (message.type === "complete") {
        finish(() => resolve(message.result));
        return;
      }
      finish(() => reject(new Error(message.message)));
    };
    worker.onerror = (event) => {
      finish(() => reject(new Error(event.message || "背景模型轉換程序發生錯誤。")));
    };

    if (signal?.aborted) {
      handleAbort();
      return;
    }
    if (signal) signal.addEventListener("abort", handleAbort, { once: true });
    worker.postMessage({ file });
  });
}
