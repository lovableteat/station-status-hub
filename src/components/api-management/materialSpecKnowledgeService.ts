import { supabase } from "@/integrations/supabase/client";
import { withReadDeadline } from "@/lib/readDeadline";
import { MATERIAL_SPEC_BUCKET } from "../material-requests/materialSpecDocuments";
import type { MaterialWorkbookRecord } from "../material-requests/materialRequestUtils";
import { buildMaterialSpecCatalogue, materialSpecExcerpt, selectMaterialSpecExcerpts, type MaterialSpecBom, type MaterialSpecNativeFile, type MaterialSpecReadFile } from "./materialSpecKnowledge";
// BOM tables predate the generated client schema; reads still use the signed-in user's RLS.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = supabase as any;

export async function loadMaterialSpecBomOptions(signal: AbortSignal): Promise<MaterialSpecBom[]> {
  const rows: MaterialSpecBom[] = [];
  for (let start = 0; ; start += 1000) {
    signal.throwIfAborted();
    const { data, error } = await withReadDeadline<{ data: MaterialSpecBom[] | null; error: unknown }>(deadline => client.from("material_bom_workspaces").select("id,name").order("id").range(start, start + 999).abortSignal(AbortSignal.any([signal, deadline])), 15000);
    if (error || !Array.isArray(data)) throw new Error("無法讀取料號系統 BOM，請確認權限後重試。");
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

export async function loadMaterialSpecCatalogue(scope: string, signal: AbortSignal, assertAccess: () => void) {
  assertAccess();
  const boms = await loadMaterialSpecBomOptions(signal);
  const selected = scope === "all" ? boms : boms.filter(bom => bom.id === scope);
  if (scope !== "all" && !selected.length) throw new Error("指定 BOM 已無法存取，請重新選擇範圍。");
  const groups = [];
  for (const bom of selected) {
    const records: MaterialWorkbookRecord[] = [];
    for (let start = 0; ; start += 1000) {
      assertAccess(); signal.throwIfAborted();
      const { data, error } = await withReadDeadline<{ data: Array<{ data: MaterialWorkbookRecord }> | null; error: unknown }>(deadline => client.from("material_bom_records").select("record_id,data").eq("workspace_id", bom.id).order("record_id").range(start, start + 999).abortSignal(AbortSignal.any([signal, deadline])), 15000);
      if (error || !Array.isArray(data)) throw new Error(`無法完整讀取 ${bom.name} 的料件，未使用不完整清單。`);
      records.push(...data.map(row => row.data));
      if (data.length < 1000) break;
    }
    groups.push({ bom, records });
  }
  assertAccess(); signal.throwIfAborted();
  return { files: buildMaterialSpecCatalogue(groups), scope: scope === "all" ? `全部可讀 BOM（${selected.length} 份，含歷史／封存）` : selected[0].name };
}

export async function searchMaterialSpecs({ query, scope, signal, assertAccess, onProgress, inspectNative }: {
  query: string; scope: string; signal: AbortSignal; assertAccess: () => void;
  onProgress: (text: string) => void;
  inspectNative: (files: MaterialSpecNativeFile[], query: string) => Promise<string>;
}) {
  onProgress("正在列出全部料號 SPEC…");
  const catalogue = await loadMaterialSpecCatalogue(scope, signal, assertAccess);
  const { readMaterialSpecDocument } = await import("./materialSpecDocumentReaders");
  const files: MaterialSpecReadFile[] = [];
  let expandedBytes = 0, batchBytes = 0;
  let visualFailure = "";
  let visualBatch: Array<{ file: MaterialSpecReadFile; blob: Blob; mimeType: string }> = [];
  const flush = async () => {
    if (!visualBatch.length) return;
    const batch = visualBatch; visualBatch = []; batchBytes = 0;
    assertAccess(); signal.throwIfAborted();
    onProgress(`AI 正在判讀 ${batch.map(item => item.file.id).join("、")} 的圖像／掃描頁…`);
    const native: MaterialSpecNativeFile[] = [];
    for (const item of batch) {
      const bytes = new Uint8Array(await item.blob.arrayBuffer()); let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
      native.push({ id: item.file.id, name: item.file.name, mimeType: item.mimeType, data: btoa(binary) });
    }
    try {
    const answer = await inspectNative(native, query);
    assertAccess(); signal.throwIfAborted();
    const parsed = JSON.parse(answer.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    if (!parsed || !Array.isArray(parsed.files) || parsed.files.length !== batch.length || new Set(parsed.files.map(item => item.id)).size !== batch.length || parsed.files.some(item => !batch.some(target => target.file.id === item.id) || typeof item.text !== "string")) throw new Error("AI 沒有完整回傳每份圖像／掃描文件的判讀，未當成全部已讀。");
    for (const item of batch) {
      const text = parsed.files.find(source => source.id === item.file.id).text.slice(0, 20000);
      item.file.text = materialSpecExcerpt(query, `${item.file.text}\nAI 圖像判讀摘錄（需核對原檔）：\n${text}`);
      item.file.status = "partial"; item.file.method += "＋AI 圖像判讀";
    }
    } catch (error) {
      signal.throwIfAborted(); assertAccess();
      visualFailure = error instanceof Error ? error.message : "AI 圖像判讀失敗。";
      for (const item of batch) { item.file.status = item.file.text.trim() ? "partial" : "unread"; item.file.note = `${item.file.note ?? ""} 圖像／掃描頁未判讀：${visualFailure}`; }
    }
  };
  const queue = catalogue.files.map(file => ({ file, blob: null as Blob | null, depth: 0 }));
  for (let index = 0; index < queue.length; index++) {
    assertAccess(); signal.throwIfAborted();
    const item = queue[index];
    onProgress(`正在讀取 SPEC ${index + 1}／${queue.length}：${item.file.name}`);
    const report: MaterialSpecReadFile = { ...item.file, status: "unread", method: "附件讀取", text: "" }; files.push(report);
    try {
      let blob = item.blob;
      if (!blob) {
        const { data, error } = await withReadDeadline(() => supabase.storage.from(MATERIAL_SPEC_BUCKET).download(item.file.path), 20000);
        if (error || !data) throw new Error("無法下載原檔（權限、刪除或網路錯誤）；未繞過附件權限。");
        blob = data;
      }
      assertAccess(); signal.throwIfAborted();
      const decoded = await withReadDeadline(deadline => readMaterialSpecDocument(item.file.name, blob!, AbortSignal.any([signal, deadline])), 60000);
      report.status = decoded.status; report.method = decoded.method; report.note = decoded.note;
      report.text = materialSpecExcerpt(query, decoded.text);
      if (decoded.children?.length) {
        if (item.depth >= 3) {
          report.status = "partial"; report.note = "已到 3 層解壓／內嵌深度，內部項目另列為未讀取。";
          decoded.children.forEach((child, childIndex) => files.push({ ...item.file, id: `${item.file.id}.${childIndex + 1}`, name: `${item.file.name}/${child.name}`, size: child.bytes.length, status: "unread", method: "巢狀層數限制", note: "超過 3 層解壓／內嵌深度，本次未判讀。", text: "" }));
        }
        else for (const [childIndex, child] of decoded.children.entries()) {
          const childFile = { ...item.file, id: `${item.file.id}.${childIndex + 1}`, name: `${item.file.name}/${child.name}`, size: child.bytes.length };
          expandedBytes += child.bytes.length;
          if (expandedBytes > 200 * 1024 * 1024 || queue.length >= 5000) files.push({ ...childFile, status: "unread", method: "容量限制", note: "本次展開累計超過 200 MB／5000 項；未視為已讀。", text: "" });
          else queue.push({ file: childFile, blob: new Blob([new Uint8Array(child.bytes)]), depth: item.depth + 1 });
        }
      }
      for (const native of decoded.native ?? []) {
        if (visualFailure) { report.status = report.text.trim() ? "partial" : "unread"; report.note = `前次 AI 圖像判讀失敗，本項未續送：${visualFailure}`; continue; }
        if (native.blob.size > 16 * 1024 * 1024) { report.status = "partial"; report.note = `${report.note ?? ""} 圖像／掃描原檔超過 16 MB，本次未送給 AI。`; continue; }
        if (batchBytes + native.blob.size > 16 * 1024 * 1024 || visualBatch.length >= 4) await flush();
        if (visualFailure) { report.status = report.text.trim() ? "partial" : "unread"; report.note = `前次 AI 圖像判讀失敗，本項未續送：${visualFailure}`; continue; }
        visualBatch.push({ file: report, blob: native.blob, mimeType: native.mimeType }); batchBytes += native.blob.size;
      }
    } catch (error) {
      signal.throwIfAborted(); assertAccess();
      report.status = "unread"; report.text = ""; report.note = error instanceof Error ? error.message : "附件無法讀取。";
    }
  }
  await flush(); assertAccess(); signal.throwIfAborted();
  const result = selectMaterialSpecExcerpts(query, files);
  return { ...result, scope: catalogue.scope };
}
