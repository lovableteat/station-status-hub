import type { SpecFillInput } from "./materialSpecFillService";
export const SPEC_FILL_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.tsv,.md,.rar,.stp,.step";
export function canReadSpecForFill(name: string) { return /\.(pdf|png|jpe?g|webp|txt|csv|tsv|md|rar|stp|step)$/i.test(name); }

async function readEngineeringSource(input: SpecFillInput, signal: AbortSignal): Promise<Array<{ name: string; bytes: Uint8Array }>> {
  signal.throwIfAborted();
  const bytes = await input.blob.arrayBuffer();
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./materialSpecFillSource.worker.ts", import.meta.url), { type: "module" });
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); worker.terminate(); };
    const abort = () => { finish(); reject(new DOMException("已停止解析", "AbortError")); };
    const timer = setTimeout(() => { finish(); reject(new Error(`${input.name} 解析超過 60 秒，請選較小的工程檔。`)); }, 60000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => { finish(); if (data.error) reject(new Error(`${input.name}：${data.error}`)); else resolve(data.files); };
    worker.onerror = () => { finish(); reject(new Error(`${input.name} 解析器無法執行，請重試。`)); };
    worker.postMessage({ name: input.name, bytes }, [bytes]);
  });
}

export async function prepareSpecFillSources(inputs: SpecFillInput[], signal: AbortSignal) {
  const prepared: SpecFillInput[] = [], warnings: string[] = [];
  let size = 0;
  const queue = inputs.map(input => ({ ...input, archive: false }));
  for (const input of queue) {
    signal.throwIfAborted();
    if (!input.blob.size || input.blob.size > 18 * 1024 * 1024) throw new Error(`${input.name} 是空檔或超過 18 MB。`);
    if (/\.rar$/i.test(input.name) && !input.archive) {
      const files = await readEngineeringSource(input, signal);
      if (!files.length) throw new Error(`${input.name} 內沒有檔案。`);
      for (const file of files) {
        const name = `${input.name}/${file.name}`;
        if (/\.rar$/i.test(file.name) || !canReadSpecForFill(file.name)) { warnings.push(`未讀取 ${name}：不支援此內部格式，巢狀壓縮檔不會自動展開。`); continue; }
        queue.push({ id: "", name, blob: new Blob([new Uint8Array(file.bytes)]), archive: true });
      }
      continue;
    }
    if (!canReadSpecForFill(input.name)) throw new Error(`不支援 ${input.name}。`);
    if (/\.(stp|step)$/i.test(input.name)) {
      const [summary] = await readEngineeringSource(input, signal);
      prepared.push({ id: `spec-${prepared.length + 1}`, name: summary.name, blob: new Blob([new Uint8Array(summary.bytes)]) });
    } else prepared.push({ id: `spec-${prepared.length + 1}`, name: input.name, blob: input.blob });
    size += prepared.at(-1)!.blob.size;
    if (size > 18 * 1024 * 1024 || prepared.length > 20) throw new Error("SPEC 解壓／解析後超過 18 MB 或 20 份，請選擇較少文件。");
  }
  if (!prepared.length) throw new Error(`沒有可讀取的 SPEC。${warnings.join("\n")}`);
  return { inputs: prepared, warnings };
}
