import { useEffect, useMemo, useState } from "react";
import { circuitPdfAiReviewKey, type CircuitPdfAiFinding, type CircuitPdfAiReviewReport } from "./circuitPdfAiReview";
import { loadCircuitPdfAiPairReviews } from "./pdfAiReviewStorage";

/** The saved AI review of one working page, as matched to its baseline page on the drawing. */
export interface CircuitPdfAiPageResult {
  report: CircuitPdfAiReviewReport;
  /** Findings still standing (not marked 不採用). */
  live: CircuitPdfAiFinding[];
  pending: number; confirmed: number;
}
export interface CircuitPdfAiResults {
  loading: boolean; error: string; retry: () => void;
  /** Per working page; only pages whose saved review is for the baseline page matched now. */
  pages: ReadonlyMap<number, CircuitPdfAiPageResult>;
}

/**
 * What AI 比對 found on each page of the pair on screen, so the page overview and the drawings can show it without opening
 * the review. Read again whenever `refresh` changes (the review was closed) and when the page match changes.
 */
export function useCircuitPdfAiResults({ open, seriesId, baselineId, workingId, workingPages, comparePageFor, alignmentKey, refresh }: {
  open: boolean; seriesId: string; baselineId?: string; workingId?: string; workingPages: number;
  comparePageFor: (page: number) => number; alignmentKey: string; refresh: number;
}): CircuitPdfAiResults {
  const pair = open && seriesId && baselineId && workingId && baselineId !== workingId ? `${seriesId}|${baselineId}|${workingId}` : "";
  const [loaded, setLoaded] = useState<{ pair: string; reports: CircuitPdfAiReviewReport[] }>({ pair: "", reports: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!pair || !baselineId || !workingId) { setLoading(false); setError(""); return; }
    let current = true;
    setLoading(true); setError("");
    loadCircuitPdfAiPairReviews(seriesId, baselineId, workingId)
      .then(rows => { if (current) setLoaded({ pair, reports: rows.map(row => row.report) }); })
      .catch(failure => { if (current) setError(failure instanceof Error ? failure.message : "AI 比對結果讀取失敗，請重試。"); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [pair, seriesId, baselineId, workingId, refresh, retry]);
  const pages = useMemo(() => {
    const result = new Map<number, CircuitPdfAiPageResult>();
    if (!pair || loaded.pair !== pair || !baselineId || !workingId) return result;
    // The newest review of each page pair is the current one (later manual judgement keeps its id and creation time).
    const latest = new Map<string, CircuitPdfAiReviewReport>();
    for (const report of loaded.reports) { const known = latest.get(report.key); if (!known || report.createdAt > known.createdAt) latest.set(report.key, report); }
    for (let page = 1; page <= workingPages; page++) {
      const officialPage = comparePageFor(page);
      if (!officialPage) continue;
      const report = latest.get(circuitPdfAiReviewKey({ officialVersionId: baselineId, workingVersionId: workingId, officialPage, workingPage: page }));
      if (!report) continue;
      const live = report.findings.filter(item => item.decision !== "dismissed");
      result.set(page, { report, live, pending: live.filter(item => item.decision === "pending").length, confirmed: live.filter(item => item.decision === "confirmed").length });
    }
    return result;
  // comparePageFor changes together with alignmentKey.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair, loaded, workingPages, alignmentKey, baselineId, workingId]);
  return { loading, error, retry: () => setRetry(value => value + 1), pages };
}
