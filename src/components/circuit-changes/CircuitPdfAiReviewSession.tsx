import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CircuitPdfAiReview } from "./CircuitPdfAiReviewDialog";
import { circuitPdfAiReviewKey, type CircuitPdfAiReviewReport } from "./circuitPdfAiReview";
import { loadCircuitPdfAiReviews, saveCircuitPdfAiReview, type SavedCircuitPdfAiReview } from "./pdfAiReviewStorage";
import type { CircuitPdfModel } from "./useCircuitPdfs";

export function CircuitPdfAiReviewSession({ open, onOpenChange, seriesId, userId, userName, canEdit, pdfs }: {
  open: boolean; onOpenChange: (open: boolean) => void; seriesId: string; userId: string; userName: string; canEdit: boolean; pdfs: CircuitPdfModel;
}) {
  const official = pdfs.official && pdfs.officialPdf ? { id: pdfs.official.id, name: pdfs.official.name, page: pdfs.officialPage, pdf: pdfs.officialPdf } : null;
  const working = pdfs.active && pdfs.activePdf ? { id: pdfs.active.id, name: pdfs.active.name, page: pdfs.page, pdf: pdfs.activePdf } : null;
  const validSources = Boolean(official && working && official.id !== working.id);
  const key = official && working && official.page > 0 ? circuitPdfAiReviewKey({ officialVersionId: official.id, workingVersionId: working.id, officialPage: official.page, workingPage: working.page }) : "";
  const officialOffset = pdfs.compare?.id === official?.id ? pdfs.compareOffset : official && working && official.page > 0 ? official.page - working.page : 0;
  const scope = `${open}:${seriesId}:${userId}:${canEdit}:${official?.id}:${working?.id}:${key}:${officialOffset}`;
  const current = useRef(scope); current.current = scope;
  const [loaded, setLoaded] = useState("");
  const [rows, setRows] = useState<SavedCircuitPdfAiReview[]>([]);
  const rowsRef = useRef(rows); rowsRef.current = rows;
  const loadedPages = useRef(new Set<string>());
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open || !validSources) return;
    let active = true; setError(""); setLoaded(""); setRows([]); loadedPages.current.clear();
    if (!key) { rowsRef.current = []; setLoaded(scope); return; }
    void loadCircuitPdfAiReviews(seriesId, key).then(value => { if (active && current.current === scope) { rowsRef.current = value; setRows(value); loadedPages.current.add(key); setLoaded(scope); } })
      .catch(failure => { if (active && current.current === scope) setError(failure instanceof Error ? failure.message : "無法讀取已儲存初審。"); });
    return () => { active = false; };
  }, [open, key, scope, validSources, seriesId, retry]);

  const pageKey = (page: number) => {
    const officialPage = page + officialOffset;
    if (!official || !working || !Number.isInteger(page) || page < 1 || page > working.pdf.numPages || officialPage < 1 || officialPage > official.pdf.numPages) throw new Error("這一頁沒有有效的官方對應頁。");
    return circuitPdfAiReviewKey({ officialVersionId: official.id, workingVersionId: working.id, officialPage, workingPage: page });
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
  if (!validSources || loaded !== scope) return <Dialog open onOpenChange={onOpenChange}><DialogContent><DialogTitle>AI 逐頁初審</DialogTitle><DialogDescription>{!validSources ? "先指定官方基準與另一份工作 PDF。" : error || "正在讀取這兩個版本的初審紀錄…"}</DialogDescription>{error && <Button type="button" onClick={() => setRetry(value => value + 1)}>重試讀取</Button>}</DialogContent></Dialog>;
  return <CircuitPdfAiReview open onOpenChange={onOpenChange} official={official} working={working} userName={userName} disabled={!canEdit}
    savedReport={rows.find(row => row.report.key === key)?.report} previousReports={rows.map(row => row.report)} onSave={save}
    allPages={{ officialOffset, onLoadPage: loadPage, onSave: savePage }} />;
}
