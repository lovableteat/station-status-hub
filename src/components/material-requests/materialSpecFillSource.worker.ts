import unrarWasmUrl from "node-unrar-js/esm/js/unrar.wasm?url";
import { importStepModel } from "../data-center/stepImport";
import { extractSpecFillRar, summarizeSpecFillStep } from "./materialSpecFillEngineering";

self.onmessage = async ({ data }: MessageEvent<{ name: string; bytes: ArrayBuffer }>) => {
  try {
    if (/\.rar$/i.test(data.name)) {
      const response = await fetch(unrarWasmUrl);
      if (!response.ok) throw new Error("RAR 解析器載入失敗。");
      const files = await extractSpecFillRar(data.bytes, await response.arrayBuffer());
      self.postMessage({ files });
    } else {
      const text = new TextDecoder().decode(data.bytes);
      if (!/^\s*ISO-10303-21;/i.test(text) || !/END-ISO-10303-21;/i.test(text)) throw new Error("不是有效的 STEP 檔案。");
      const model = await importStepModel(new File([data.bytes], data.name));
      const bytes = new TextEncoder().encode(summarizeSpecFillStep(data.name, model, text));
      self.postMessage({ files: [{ name: `${data.name}（模型解析）.txt`, bytes }] });
    }
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "工程檔解析失敗。" }); }
};
