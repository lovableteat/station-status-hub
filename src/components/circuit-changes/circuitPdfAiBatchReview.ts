import { AiRequestFailure } from "../api-management/aiRequestRecovery";
import type { CircuitPdfAiReviewReport } from "./circuitPdfAiReview";

export const CIRCUIT_PDF_AI_BATCH_CONCURRENCY = 3;
const MAX_PROVIDER_WAIT_MS = 10_000;
const providerWideFailures = new Set(["busy", "minute-quota", "daily-quota", "billing", "auth", "model-access", "tracking"]);

export interface CircuitPdfAiBatchPage {
  workingPage: number;
  officialPage: number | null;
  status: "pending" | "analysing" | "saving" | "complete" | "failed" | "unsaved" | "unmatched";
  report?: CircuitPdfAiReviewReport;
  error?: string;
}

export function parseCircuitPdfAiPageSelection(input: string, workingCount: number): { pages: number[]; error?: never } | { error: string; pages?: never } {
  const normalized = input.normalize("NFKC").replace(/、/g, ",").replace(/[–—−]/g, "-").trim();
  if (!normalized) return { pages: [] };
  const pages = new Set<number>();
  for (const item of normalized.split(",")) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(item.trim());
    if (!match) return { error: "請用逗號分隔頁碼或範圍，例如 2, 5–8, 11。" };
    const start = Number(match[1]), end = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < 1 || start > workingCount || end > workingCount) {
      return { error: `頁碼須在 1–${workingCount} 之間。` };
    }
    if (start > end) return { error: "範圍的起始頁不能大於結束頁。" };
    for (let page = start; page <= end; page++) pages.add(page);
  }
  return { pages: [...pages].sort((a, b) => a - b) };
}

/** Keep requested working pages visible, including pages without an official counterpart. */
/** `officialOffset`: one offset for every page, or the baseline page for each working page (0 when it has none). */
export function buildCircuitPdfAiBatchPages(officialCount: number, workingCount: number, officialOffset: number | ((workingPage: number) => number), selectedPages?: readonly number[]): CircuitPdfAiBatchPage[] {
  const count = Number.isInteger(workingCount) && workingCount > 0 ? workingCount : 0;
  const pages = selectedPages ?? Array.from({ length: count }, (_, index) => index + 1);
  return pages.map(workingPage => {
    const officialPage = typeof officialOffset === "function" ? officialOffset(workingPage) : workingPage + officialOffset;
    const matched = Number.isInteger(officialPage) && officialPage > 0 && officialPage <= officialCount;
    return { workingPage, officialPage: matched ? officialPage : null, status: matched ? "pending" : "unmatched" };
  });
}

function failureMessage(failure: unknown, fallback: string): string {
  return failure && typeof failure === "object" && "message" in failure && typeof failure.message === "string" && failure.message.trim()
    ? failure.message : fallback;
}

/** Bound live page pairs, and save each report as soon as that pair finishes. */
export async function runCircuitPdfAiBatchReview({ pages, signal, analyse, save, onUpdate, onCooldown }: {
  pages: CircuitPdfAiBatchPage[];
  signal: AbortSignal;
  analyse: (page: CircuitPdfAiBatchPage, attemptNumber: number) => Promise<CircuitPdfAiReviewReport>;
  save: (report: CircuitPdfAiReviewReport) => Promise<void>;
  onUpdate: (page: CircuitPdfAiBatchPage) => void;
  onCooldown?: (retryAt: number) => void;
}): Promise<void> {
  const retrySave = (page: CircuitPdfAiBatchPage) => page.status === "unsaved" && Boolean(page.report);
  const queue = pages.filter(page => page.status !== "complete" && page.status !== "unmatched" && page.officialPage !== null)
    .sort((a, b) => Number(retrySave(b)) - Number(retrySave(a)));
  const stopWaiting = new AbortController();
  let next = 0;
  let retryAt = 0;
  let halted: AiRequestFailure | undefined;

  async function waitForProvider() {
    while (!signal.aborted && !halted && retryAt > Date.now()) {
      await new Promise<void>(resolve => {
        const finish = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", finish);
          stopWaiting.signal.removeEventListener("abort", finish);
          resolve();
        };
        const timer = setTimeout(finish, retryAt - Date.now());
        signal.addEventListener("abort", finish, { once: true });
        stopWaiting.signal.addEventListener("abort", finish, { once: true });
      });
    }
  }

  async function processPage(source: CircuitPdfAiBatchPage) {
    const page = { ...source, error: undefined };
    let report = source.status === "unsaved" ? source.report : undefined;
    if (!report) {
      const analysing: CircuitPdfAiBatchPage = { ...page, status: "analysing", report: undefined };
      onUpdate(analysing);
      for (let attempt = 1; attempt <= 2 && !signal.aborted && !halted; attempt++) {
        let releaseAbort = () => {};
        try {
          report = await new Promise<CircuitPdfAiReviewReport | undefined>((resolve, reject) => {
            const cancel = () => resolve(undefined);
            releaseAbort = () => signal.removeEventListener("abort", cancel);
            signal.addEventListener("abort", cancel, { once: true });
            // Observe late results without allowing a cancelled request to save.
            analyse(analysing, attempt).then(resolve, reject);
          });
          break;
        } catch (failure) {
          if (signal.aborted) break;
          if (failure instanceof AiRequestFailure) {
            const canWait = failure.kind === "minute-quota" || failure.kind === "busy";
            const delay = failure.retryAfterMs || (failure.kind === "busy" ? 1_000 : 0);
            if (!halted && attempt === 1 && canWait && delay > 0 && delay <= MAX_PROVIDER_WAIT_MS) {
              const until = Date.now() + delay;
              if (until > retryAt) { retryAt = until; onCooldown?.(retryAt); }
              await waitForProvider();
              continue;
            }
            if (!halted && providerWideFailures.has(failure.kind)) {
              halted = failure;
              stopWaiting.abort();
            }
          }
          onUpdate({ ...page, status: "failed", report: undefined, error: failureMessage(failure, "本頁比對失敗，請重試。") });
          return;
        } finally {
          releaseAbort();
        }
      }
      if (signal.aborted || (!report && halted)) {
        onUpdate({ ...page, status: "pending", report: undefined });
        return;
      }
    }
    if (!report) {
      onUpdate({ ...page, status: "failed", report: undefined, error: "AI 未提供本頁初審結果，請重試。" });
      return;
    }
    onUpdate({ ...page, status: "saving", report });
    try {
      // Once a save starts, observe its outcome even when the queue is cancelled.
      await save(report);
      onUpdate({ ...page, status: "complete", report });
    } catch (failure) {
      onUpdate({ ...page, status: "unsaved", report, error: failureMessage(failure, "本頁結果尚未儲存，請重試儲存。") });
    }
  }

  async function worker() {
    while (!signal.aborted && next < queue.length) {
      const source = queue[next];
      if (!retrySave(source)) {
        if (halted) return;
        if (retryAt > Date.now()) { await waitForProvider(); continue; }
      }
      next++;
      await processPage(source);
    }
  }

  await Promise.all(Array.from({ length: Math.min(queue.length, CIRCUIT_PDF_AI_BATCH_CONCURRENCY) }, worker));
  if (halted && !signal.aborted) throw halted;
}
