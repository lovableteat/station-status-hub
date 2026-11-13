import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CircuitPdfAiReview } from "./CircuitPdfAiReviewDialog";
import { circuitPdfAiReviewKey, type CircuitPdfAiReviewReport } from "./circuitPdfAiReview";
import { loadCircuitPdfAiReviews, saveCircuitPdfAiReview, type SavedCircuitPdfAiReview } from "./pdfAiReviewStorage";
import type { CircuitPdfModel } from "./useCircuitPdfs";

export function CircuitPdfAiReviewSession({ open, onOpenChange, seriesId, userId, userName, canEdit, pdfs, focusFinding }: {
  open: boolean; onOpenChange: (open: boolean) => void; seriesId: string; userId: string; userName: string; canEdit: boolean; pdfs: CircuitPdfModel;
  /** A finding chosen on the drawing, opened unfolded in the review. */
  focusFinding?: string;
}) {
  const baseline = pdfs.compare && pdfs.comparePdf ? { id: pdfs.compare.id, name: pdfs.compare.name, page: pdfs.comparePage, pdf: pdfs.comparePdf } : null;
  const working = pdfs.active && pdfs.activePdf ? { id: pdfs.active.id, name: pdfs.active.name, page: pdfs.page, pdf: pdfs.activePdf } : null;
  const validSources = Boolean(baseline && working && baseline.id !== working.id);
  const key = validSources && baseline && working && baseline.page > 0 ? circuitPdfAiReviewKey({ officialVersionId: baseline.id, workingVersionId: working.id, officialPage: baseline.page, workingPage: working.page }) : "";
  const officialOffset = pdfs.compareOffset;
  // The drawing matches every page by content and the user's pins; without that (older callers) one offset applies to all.
  const matchedPageFor = pdfs.comparePageFor;
  const mappingKey = pdfs.alignmentKey ?? String(officialOffset);
  const scope = `${open}:${seriesId}:${userId}:${canEdit}:${baseline?.id}:${working?.id}:${working?.page}:${key}:${mappingKey}`;
  const current = useRef(scope); current.current = scope;
  const [loaded, setLoaded] = useState("");
  const [rows, setRows] = useState<SavedCircuitPdfAiReview[]>([]);
  const rowsRef = useRef<SavedCircuitPdfAiReview[]>([]);
  const loadedPages = useRef(new Set<string>());
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open || !validSources) return;
    let active = true; setError(""); setLoaded(""); rowsRef.current = []; setRows([]); loadedPages.current.clear();
    if (!key) { setLoaded(scope); return; }
    void loadCircuitPdfAiReviews(seriesId, key).then(value => { if (active && current.current === scope) { rowsRef.current = value; setRows(value); loadedPages.current.add(key); setLoaded(scope); } })
      .catch(failure => { if (active && current.current === scope) setError(failure instanceof Error ? failure.message : "無法讀取已儲存初審。"); });
    return () => { active = false; };
  }, [open, key, scope, validSources, seriesId, retry]);

  const pageKey = (page: number) => {
    const officialPage = matchedPageFor ? matchedPageFor(page) : page + officialOffset;
    if (!baseline || !working || !Number.isInteger(page) || page < 1 || page > working.pdf.numPages || officialPage < 1 || officialPage > baseline.pdf.numPages) throw new Error("這一頁沒有有效的基準對應頁。");
    return circuitPdfAiReviewKey({ officialVersionId: baseline.id, workingVersionId: working.id, officialPage, workingPage: page });
  };
  const savePage = async (report: CircuitPdfAiReviewReport) => {
    if (!canEdit || current.current !== scope || report.key !== pageKey(report.workingPage)) throw new Error("版本、頁碼或權限已變更，請重新開啟初審。");
    const previous = rowsRef.current.find(row => row.report.id === report.id);
    const value = await saveCircuitPdfAiReview(seriesId, report, previous?.revision ?? 0);
    if (current.current !== scope) return;
    const next = (previous ? rowsRef.current.map(row => row.report.id === report.id ? value : row) : [value, ...rowsRef.current])
      .sort((a, b) => b.report.createdAt.localeCompare(a.report.createdAt));
    rowsRef.current = next; setRows(next);
  };
  const save = async (report: CircuitPdfAiReviewReport) => {
    if (report.key !== key) throw new Error("版本、頁碼或權限已變更，請重新開啟初審。");
    await savePage(report);
  };
  const loadPage = async (page: number) => {
    if (current.current !== scope) throw new Error("版本、頁碼或權限已變更，請重新開啟初審。");
    const target = pageKey(page);
    if (loadedPages.current.has(target)) return;
    const value = await loadCircuitPdfAiReviews(seriesId, target);
    if (current.current !== scope) throw new Error("版本、頁碼或權限已變更，請重新開啟初審。");
    const next = [...rowsRef.current.filter(row => row.report.key !== target), ...value].sort((a, b) => b.report.createdAt.localeCompare(a.report.createdAt));
    rowsRef.current = next; setRows(next); loadedPages.current.add(target);
  };
  if (!open) return null;
  if (!validSources || loaded !== scope) return <Dialog open onOpenChange={onOpenChange}><DialogContent><DialogTitle>AI 比對新舊版</DialogTitle><DialogDescription>{!validSources ? "請先開啟兩份不同的 PDF。" : error || "正在讀取這兩個版本的初審紀錄…"}</DialogDescription>{error && <Button type="button" onClick={() => setRetry(value => value + 1)}>重試讀取</Button>}</DialogContent></Dialog>;
  return <CircuitPdfAiReview open onOpenChange={onOpenChange} official={baseline} working={working} userName={userName} disabled={!canEdit}
    savedReport={rows.find(row => row.report.key === key)?.report} previousReports={rows.map(row => row.report)} onSave={save} focusFinding={focusFinding}
    allPages={{ officialOffset, officialPageFor: matchedPageFor, mappingKey, onLoadPage: loadPage, onSave: savePage }} />;
}
