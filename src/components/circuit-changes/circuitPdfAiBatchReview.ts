import type { CircuitPdfAiReviewReport } from "./circuitPdfAiReview";

export interface CircuitPdfAiBatchPage {
  workingPage: number;
  officialPage: number | null;
  status: "pending" | "analysing" | "saving" | "complete" | "failed" | "unsaved" | "unmatched";
  report?: CircuitPdfAiReviewReport;
  error?: string;
}

/** Keep every working page visible, including pages without an official counterpart. */
export function buildCircuitPdfAiBatchPages(officialCount: number, workingCount: number, officialOffset: number): CircuitPdfAiBatchPage[] {
  const count = Number.isInteger(workingCount) && workingCount > 0 ? workingCount : 0;
  return Array.from({ length: count }, (_, index) => {
    const workingPage = index + 1, officialPage = workingPage + officialOffset;
    const matched = Number.isInteger(officialPage) && officialPage > 0 && officialPage <= officialCount;
    return { workingPage, officialPage: matched ? officialPage : null, status: matched ? "pending" : "unmatched" };
  });
}

function failureMessage(failure: unknown, fallback: string): string {
  return failure && typeof failure === "object" && "message" in failure && typeof failure.message === "string" && failure.message.trim()
    ? failure.message : fallback;
}

/** Review and save one pair at a time so completed pages survive cancellation or a later failure. */
export async function runCircuitPdfAiBatchReview({ pages, signal, analyse, save, onUpdate }: {
  pages: CircuitPdfAiBatchPage[];
  signal: AbortSignal;
  analyse: (page: CircuitPdfAiBatchPage) => Promise<CircuitPdfAiReviewReport>;
  save: (report: CircuitPdfAiReviewReport) => Promise<void>;
  onUpdate: (page: CircuitPdfAiBatchPage) => void;
}): Promise<void> {
  for (const source of pages) {
    if (signal.aborted) return;
    if (source.status === "complete" || source.status === "unmatched" || source.officialPage === null) continue;
    const page = { ...source, error: undefined };
    let report = source.status === "unsaved" ? source.report : undefined;
    if (!report) {
      const analysing: CircuitPdfAiBatchPage = { ...page, status: "analysing", report: undefined };
      onUpdate(analysing);
      let releaseAbort = () => {};
      try {
        report = await new Promise<CircuitPdfAiReviewReport | undefined>((resolve, reject) => {
          const cancel = () => resolve(undefined);
          releaseAbort = () => signal.removeEventListener("abort", cancel);
          signal.addEventListener("abort", cancel, { once: true });
          if (signal.aborted) { cancel(); return; }
          // Resolve cancellation immediately even if the provider cannot stop its request.
          // A late success or rejection is observed here but cannot change the settled queue.
          analyse(analysing).then(resolve, reject);
        });
      } catch (failure) {
        if (signal.aborted) {
          onUpdate({ ...page, status: "pending", report: undefined });
          return;
        }
        onUpdate({ ...page, status: "failed", report: undefined, error: failureMessage(failure, "本頁比對失敗，請重試。") });
        continue;
      } finally {
        releaseAbort();
      }
      // An analyser may finish after cancellation even if its provider ignores AbortSignal.
      if (signal.aborted) {
        onUpdate({ ...page, status: "pending", report: undefined });
        return;
      }
    }
    if (!report) {
      onUpdate({ ...page, status: "failed", report: undefined, error: "AI 未提供本頁初審結果，請重試。" });
      continue;
    }
    onUpdate({ ...page, status: "saving", report });
    try {
      // Once a save starts, observe its outcome even when the queue is cancelled.
      await save(report);
      onUpdate({ ...page, status: "complete", report });
    } catch (failure) {
      onUpdate({ ...page, status: "unsaved", report, error: failureMessage(failure, "本頁結果尚未儲存，請重試儲存。") });
    }
    if (signal.aborted) return;
  }
}
