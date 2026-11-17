/**
 * AI review of an uploaded BOM's columns, run when a file is staged for upload. Uses the models set up in API 管理 (an
 * OpenAI model first). Each finding names the Excel row, the column and the concrete reason, in the same shape as the
 * rule checks (bomUploadChecks.ts). Nothing is written; the result only informs the person uploading.
 *
 * The rows go out in batches. A batch that fails is tried once more after a short wait; one that still fails is
 * reported by number so 重試 sends only those, and what the other batches found is kept.
 */
import { normalizeApiKeyPermissions } from "../api-management/apiKeyHelpers";
import { askNvBomModel, loadNvBomModels, type NvBomModel } from "./nvBomCompareAi";
import { AI_REVIEW_BATCH_ROWS, countAiReviewBatches, type BomAiReviewResult, type BomUploadColumn, type BomUploadIssue } from "./bomUploadChecks";
import type { MaterialWorkbookRecord } from "./materialRequestUtils";

const CONCURRENCY = 2;
const RETRY_WAIT_MS = 3000;
const COLUMNS: BomUploadColumn[] = ["Ref Des", "Qty", "Manufacturer", "Manufacturer Part Number", "虛擬料號", "實體料號", "Name"];

const INSTRUCTION = `你是電子料號（BOM）資料檢查員。輸入是一份 CE 交付格式 BOM 的部分列，每列一家廠商的一顆料：
row=Excel 列號、refDes=位號、qty=用量、name=料名、manufacturer=廠商、mpn=廠商料號（Manufacturer Part Number）、virtual=虛擬料號、physical=實體料號、spec=規格。
同一組位號可有多列（主料與替代料），替代料列的 qty 可以是空的。實體料號是公司料號（例如 1022-0DK80AK、0603-0021000），TEMP- 開頭是暫時料號；虛擬料號是群組料號，可以空白。
只找出「這一列的欄位內容看起來填錯」的情況，例如：廠商與廠商料號互換、廠商料號被截斷或被逗號拆成兩列、廠商料號明顯不屬於這個廠商（例如 GRM 開頭卻寫 YAGEO）、料名與規格或廠商料號互相矛盾（電阻值、容值、封裝不同）、實體料號格式不像公司料號、虛擬料號與實體料號相同、用量與位號數量不符。
不要回報正常的資料，不要回報只是缺少選填欄位。每個問題用繁體中文寫具體原因（引用該格的值，說明應該是什麼）。
只回傳 JSON：{"issues":[{"row":列號,"column":"Ref Des"|"Qty"|"Manufacturer"|"Manufacturer Part Number"|"虛擬料號"|"實體料號"|"Name","reason":"原因"}]}，沒有問題就回傳 {"issues":[]}。每批最多 30 個。`;

/** The model to use: an OpenAI one first, then any other that is not marked unavailable. */
export async function pickBomReviewModel(): Promise<NvBomModel | null> {
  const models = (await loadNvBomModels()).filter((model) => model.availability?.state !== "unavailable");
  const provider = (model: NvBomModel) => normalizeApiKeyPermissions(model.record.permissions).metadata.provider.trim().toLowerCase();
  return models.find((model) => provider(model) === "openai") ?? models[0] ?? null;
}

/** The comparison feature's wording ("已完成的差異表仍保留") does not belong in the upload window. */
const describeFailure = (error: unknown) => (error instanceof Error ? error.message : "請稍後再試").replace("已完成的差異表仍保留，", "").replace("重試這項 AI。", "重試。");

const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => { signal.removeEventListener("abort", stop); resolve(); }, ms);
  const stop = () => { clearTimeout(timer); reject(signal.reason ?? new DOMException("Aborted", "AbortError")); };
  signal.addEventListener("abort", stop, { once: true });
});

export async function reviewBomRowsWithAi(
  records: readonly MaterialWorkbookRecord[],
  model: NvBomModel,
  { onProgress, signal, onlyBatches }: { onProgress?: (done: number, total: number) => void; signal: AbortSignal; onlyBatches?: readonly number[] },
): Promise<BomAiReviewResult> {
  signal.throwIfAborted();
  const totalBatches = countAiReviewBatches(records.length);
  const queue = (onlyBatches ?? Array.from({ length: totalBatches }, (_, index) => index)).filter((index) => index >= 0 && index < totalBatches);
  const issues: BomUploadIssue[] = [];
  const failedBatches: number[] = [];
  let failure: string | undefined;
  let done = 0;
  onProgress?.(0, queue.length);
  const ask = (batch: readonly MaterialWorkbookRecord[]) => askNvBomModel(model, INSTRUCTION, {
    rows: batch.map((record) => ({
      row: record.sourceRow, refDes: String(record.refDes ?? "").slice(0, 160), qty: record.qty, name: record.name, manufacturer: record.manufacturer,
      mpn: record.manufacturerPartNumber, virtual: record.virtualAlternative ?? "", physical: record.partNumber, spec: String(record.partSpec ?? "").slice(0, 80),
    })),
  }, signal);
  const run = async (index: number) => {
    const batch = records.slice(index * AI_REVIEW_BATCH_ROWS, (index + 1) * AI_REVIEW_BATCH_ROWS);
    // Only rows of this batch: a row number from elsewhere is a misread, and a retry can never list a finding twice.
    const byRow = new Map(batch.map((record) => [record.sourceRow, record] as const));
    let answer: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 2 && !answer; attempt += 1) {
      try {
        const reply = await ask(batch);
        if (!reply || typeof reply !== "object" || !Array.isArray((reply as { issues?: unknown }).issues)) throw new Error("AI 沒有回傳可讀取的結果，請重試。");
        answer = reply;
      } catch (error) {
        signal.throwIfAborted();
        if (attempt === 0) { await wait(RETRY_WAIT_MS, signal); continue; }
        failedBatches.push(index);
        failure ??= describeFailure(error);
      }
    }
    for (const item of (Array.isArray(answer?.issues) ? answer.issues : []).slice(0, 30)) {
      const entry = item as { row?: unknown; column?: unknown; reason?: unknown };
      const row = Number(entry.row);
      const column = COLUMNS.find((name) => name === entry.column);
      const reason = typeof entry.reason === "string" ? entry.reason.trim().slice(0, 300) : "";
      const record = byRow.get(row);
      if (!record || !column || !reason) continue;
      issues.push({
        row, refDes: String(record.refDes ?? ""), part: [record.manufacturer, record.manufacturerPartNumber].filter(Boolean).join(" / ") || record.name,
        column, reason, level: "warning", source: "ai",
      });
    }
    done += 1;
    onProgress?.(done, queue.length);
  };
  // Two requests at a time keeps a 900-row BOM to about a minute without tripping rate limits.
  for (let start = 0; start < queue.length; start += CONCURRENCY) {
    signal.throwIfAborted();
    await Promise.all(queue.slice(start, start + CONCURRENCY).map(run));
  }
  return {
    issues: issues.sort((left, right) => (left.row ?? 0) - (right.row ?? 0)),
    totalBatches,
    failedBatches: failedBatches.sort((left, right) => left - right),
    ...(failure ? { failure } : {}),
  };
}
