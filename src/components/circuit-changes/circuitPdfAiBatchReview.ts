import { AiRequestFailure } from "../api-management/aiRequestRecovery";
import type { CircuitPdfAiReviewReport } from "./circuitPdfAiReview";

export const CIRCUIT_PDF_AI_BATCH_CONCURRENCY = 3;
/**
 * How a batch behaves when something goes wrong (2026-11-19). Before, any failure other than a short provider wait
 * marked the page failed at once: a network drop failed every remaining page within seconds and each had to be retried
 * by hand, while a page that kept failing was paid for again and again.
 */
export interface CircuitPdfAiBatchPolicy {
  /** AI requests per page, the first one included. */
  attempts: number;
  /** The same, when the provider answered but the answer could not be used: each such request was paid for. */
  answerAttempts: number;
  /** Wait before the second, third… request of a page; a provider's own Retry-After wins when it is longer. */
  backoffMs: readonly number[];
  /** Waits while the network (or this system's own backend) cannot be reached; when they run out the batch pauses. */
  networkWaitsMs: readonly number[];
  /** Pages failing one after another (each after all its attempts) before the batch stops, so no more tokens are spent. */
  stopAfterFailures: number;
  /** Waits between attempts to store a finished page. */
  saveBackoffMs: readonly number[];
  /** A provider wait longer than this is not waited for; the page fails over to the next attempt or fails. */
  maxProviderWaitMs: number;
}
export const CIRCUIT_PDF_AI_BATCH_POLICY: CircuitPdfAiBatchPolicy = {
  attempts: 3, answerAttempts: 2, backoffMs: [2_000, 8_000], networkWaitsMs: [5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 120_000, 120_000, 300_000, 300_000],
  stopAfterFailures: 3, saveBackoffMs: [1_500, 5_000], maxProviderWaitMs: 60_000,
};
/** Failures no retry can cure: the key, the account's money or the day's quota. */
const providerWideFailures = new Set(["daily-quota", "billing", "auth", "model-access"]);
/** The request never reached the provider: this system's backend or the network is unreachable. */
const unreachableFailures = new Set(["network", "tracking"]);

/** Why a batch stopped by itself with pages left. */
export class CircuitPdfAiBatchStop extends Error {
  constructor(message: string, public reason: "failures" | "network" | "provider") { super(message); this.name = "CircuitPdfAiBatchStop"; }
}

export interface CircuitPdfAiBatchPage {
  workingPage: number;
  officialPage: number | null;
  /** checking: 本機比對 is reading the page (before any AI request). */
  status: "pending" | "checking" | "analysing" | "saving" | "complete" | "failed" | "unsaved" | "unmatched";
  report?: CircuitPdfAiReviewReport;
  error?: string;
  /** AI requests made for this page in the current run. */
  attempts?: number;
}

/** What the batch is waiting for, shown instead of a silent pause. */
export interface CircuitPdfAiBatchWait { kind: "network" | "provider" | "retry"; until: number; page?: number }

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

const realPause = (ms: number, signal: AbortSignal) => new Promise<void>(resolve => {
  if (signal.aborted || ms <= 0) { resolve(); return; }
  const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
  const timer = setTimeout(finish, ms);
  signal.addEventListener("abort", finish, { once: true });
});

/**
 * Runs the pages a few at a time and stores each one as soon as it is finished.
 * - A page with a ready report (`unsaved`: settled by 本機比對, or an AI answer whose save failed) is only stored.
 * - A failed AI request is tried again after a wait, up to `policy.attempts`; an answer that cannot be read counts too.
 * - When the network or this system's backend cannot be reached, nothing fails: the batch waits and tries again, and
 *   pauses with every unfinished page still pending when the waits run out.
 * - Pages failing one after another stop the batch (止損), as do failures no retry can cure. What is finished stays stored.
 */
export async function runCircuitPdfAiBatchReview({ pages, signal, analyse, save, onUpdate, onCooldown, onWait, policy = CIRCUIT_PDF_AI_BATCH_POLICY, pause = realPause }: {
  pages: CircuitPdfAiBatchPage[];
  signal: AbortSignal;
  analyse: (page: CircuitPdfAiBatchPage, attemptNumber: number) => Promise<CircuitPdfAiReviewReport>;
  save: (report: CircuitPdfAiReviewReport) => Promise<void>;
  onUpdate: (page: CircuitPdfAiBatchPage) => void;
  onCooldown?: (retryAt: number) => void;
  onWait?: (wait: CircuitPdfAiBatchWait | null) => void;
  policy?: CircuitPdfAiBatchPolicy;
  pause?: (ms: number, signal: AbortSignal) => Promise<void>;
}): Promise<void> {
  const retrySave = (page: CircuitPdfAiBatchPage) => page.status === "unsaved" && Boolean(page.report);
  const queue = pages.filter(page => page.status !== "complete" && page.status !== "unmatched" && page.officialPage !== null)
    .sort((a, b) => Number(retrySave(b)) - Number(retrySave(a)));
  // Waits end when the user stops the batch or the batch stops itself.
  const stopWaiting = new AbortController();
  const waitSignal = stopWaiting.signal;
  const stopOnAbort = () => stopWaiting.abort();
  if (signal.aborted) stopOnAbort(); else signal.addEventListener("abort", stopOnAbort, { once: true });
  let next = 0;
  let retryAt = 0;
  let halted: Error | undefined;
  let failuresInARow = 0;
  let unreachable = 0;
  /** AI requests under way; after a failure no new page starts until these have answered (see worker). */
  let inFlight = 0;

  const halt = (reason: Error) => { if (!halted) { halted = reason; stopWaiting.abort(); } };
  async function waitForProvider() {
    while (!signal.aborted && !halted && retryAt > Date.now()) await pause(retryAt - Date.now(), waitSignal);
  }
  /** Everyone waits together: a provider that is busy for one page is busy for all of them. */
  async function holdAll(ms: number, wait: CircuitPdfAiBatchWait["kind"], page: number) {
    const until = Date.now() + ms;
    if (until > retryAt) { retryAt = until; onCooldown?.(retryAt); onWait?.({ kind: wait, until, page }); }
    await waitForProvider();
    if (retryAt <= Date.now()) onWait?.(null);
  }

  async function processPage(source: CircuitPdfAiBatchPage) {
    const page: CircuitPdfAiBatchPage = { ...source, error: undefined };
    let report = source.status === "unsaved" ? source.report : undefined;
    if (!report) {
      let attempt = 0;
      const analysing: CircuitPdfAiBatchPage = { ...page, status: "analysing", report: undefined };
      onUpdate(analysing);
      inFlight++;
      try {
      while (!report && !signal.aborted && !halted) {
        let releaseAbort = () => {};
        try {
          attempt++;
          report = await new Promise<CircuitPdfAiReviewReport | undefined>((resolve, reject) => {
            const cancel = () => resolve(undefined);
            releaseAbort = () => signal.removeEventListener("abort", cancel);
            signal.addEventListener("abort", cancel, { once: true });
            // Observe late results without allowing a cancelled request to save.
            analyse({ ...analysing, attempts: attempt }, attempt).then(resolve, reject);
          });
          if (report) { failuresInARow = 0; unreachable = 0; }
          break;
        } catch (failure) {
          if (signal.aborted) break;
          const kind = failure instanceof AiRequestFailure ? failure.kind : "answer";
          if (unreachableFailures.has(kind)) {
            // Nothing was spent and nothing is wrong with the page: wait for the connection instead of failing it.
            attempt--;
            // The pages in flight all fail together; they share one wait instead of using up three.
            if (retryAt > Date.now()) { await waitForProvider(); continue; }
            const wait = policy.networkWaitsMs[unreachable];
            if (wait === undefined) { halt(new CircuitPdfAiBatchStop("網路或系統連線一直無法恢復，比對已暫停。已完成的頁面都已保留，連線恢復後按「繼續未完成頁面」。", "network")); break; }
            unreachable++;
            await holdAll(wait, "network", page.workingPage);
            continue;
          }
          if (providerWideFailures.has(kind)) {
            halt(failure as Error);
            onUpdate({ ...page, status: "failed", report: undefined, attempts: attempt, error: failureMessage(failure, "本頁比對失敗，請重試。") });
            return;
          }
          const providerWait = failure instanceof AiRequestFailure ? failure.retryAfterMs : 0;
          if ((kind === "busy" || kind === "minute-quota") && providerWait > policy.maxProviderWaitMs) {
            // The provider asks for a long pause: every page would fail the same way, so the batch stops here.
            halt(failure as Error);
            onUpdate({ ...page, status: "pending", report: undefined });
            return;
          }
          // A malformed request (kind "invalid") fails the same way every time; everything else may pass on another try.
          const again = kind !== "invalid" && attempt < (kind === "answer" ? policy.answerAttempts : policy.attempts);
          if (!again) {
            onUpdate({ ...page, status: "failed", report: undefined, attempts: attempt, error: failureMessage(failure, "本頁比對失敗，請重試。") });
            if (++failuresInARow >= policy.stopAfterFailures) halt(new CircuitPdfAiBatchStop(`連續 ${failuresInARow} 頁比對失敗，已自動停止，避免繼續消耗 token。已完成的頁面都已保留，可以先下載報告；排除原因後再按「繼續未完成頁面」。`, "failures"));
            return;
          }
          const delay = Math.max(providerWait, policy.backoffMs[Math.min(attempt, policy.backoffMs.length) - 1] ?? 0);
          if (kind === "busy" || kind === "minute-quota") await holdAll(delay, "provider", page.workingPage);
          else { onWait?.({ kind: "retry", until: Date.now() + delay, page: page.workingPage }); await pause(delay, waitSignal); if (retryAt <= Date.now()) onWait?.(null); }
        } finally {
          releaseAbort();
        }
      }
      } finally { inFlight--; }
      if (!report) {
        // Stopped or paused before an answer: the page waits for the next run, nothing is marked failed.
        onUpdate({ ...page, status: "pending", report: undefined });
        return;
      }
    }
    onUpdate({ ...page, status: "saving", report });
    for (let attempt = 0; ; attempt++) {
      try {
        // Once a save starts, observe its outcome even when the queue is cancelled.
        await save(report);
        unreachable = 0;
        onUpdate({ ...page, status: "complete", report });
        return;
      } catch (failure) {
        if (failure instanceof AiRequestFailure && unreachableFailures.has(failure.kind) && !signal.aborted && !halted) {
          // The answer is in hand and only the connection is missing: wait for it like a request would, then store again.
          attempt--;
          if (retryAt > Date.now()) { await waitForProvider(); continue; }
          const networkWait = policy.networkWaitsMs[unreachable];
          if (networkWait !== undefined) { unreachable++; await holdAll(networkWait, "network", page.workingPage); continue; }
          halt(new CircuitPdfAiBatchStop("網路或系統連線一直無法恢復，比對已暫停。已完成的頁面都已保留，連線恢復後按「繼續未完成頁面」。", "network"));
        }
        const wait = policy.saveBackoffMs[attempt];
        if (wait === undefined || signal.aborted || halted) {
          // The paid answer is kept on the page; the next run stores it without asking the provider again.
          onUpdate({ ...page, status: "unsaved", report, error: failureMessage(failure, "本頁結果尚未儲存，請重試儲存。") });
          return;
        }
        await pause(wait, waitSignal);
        // Stopped while waiting: the answer stays on the page, nothing more is sent.
        if (signal.aborted || halted) { onUpdate({ ...page, status: "unsaved", report, error: failureMessage(failure, "本頁結果尚未儲存，請重試儲存。") }); return; }
      }
    }
  }

  async function worker() {
    while (!signal.aborted && next < queue.length) {
      const source = queue[next];
      if (!retrySave(source)) {
        if (halted) return;
        if (retryAt > Date.now()) { await waitForProvider(); continue; }
        // After a page has failed, the next one is a single probe: the pages still under way answer first, so a
        // provider that is failing everything costs at most the requests already sent.
        if (failuresInARow > 0 && inFlight > 0) { await pause(50, waitSignal); continue; }
      }
      next++;
      await processPage(source);
    }
  }

  await Promise.all(Array.from({ length: Math.min(queue.length, CIRCUIT_PDF_AI_BATCH_CONCURRENCY) }, worker));
  signal.removeEventListener("abort", stopOnAbort);
  if (queue.length) onWait?.(null);
  if (halted && !signal.aborted) throw halted;
}
