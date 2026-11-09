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
  const official = pdfs.official && pdfs.officialPdf && pdfs.officialPage > 0 ? { id: pdfs.official.id, name: pdfs.official.name, page: pdfs.officialPage, pdf: pdfs.officialPdf } : null;
  const working = pdfs.active && pdfs.activePdf ? { id: pdfs.active.id, name: pdfs.active.name, page: pdfs.page, pdf: pdfs.activePdf } : null;
  const key = official && working ? circuitPdfAiReviewKey({ officialVersionId: official.id, workingVersionId: working.id, officialPage: official.page, workingPage: working.page }) : "";
  const scope = `${open}:${seriesId}:${userId}:${canEdit}:${key}`;
  const current = useRef(scope); current.current = scope;
  const [loaded, setLoaded] = useState("");
  const [rows, setRows] = useState<SavedCircuitPdfAiReview[]>([]);
  const rowsRef = useRef(rows); rowsRef.current = rows;
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open || !key) return;
    let active = true; setError(""); setLoaded(""); setRows([]);
    void loadCircuitPdfAiReviews(seriesId, key).then(value => { if (active && current.current === scope) { setRows(value); setLoaded(scope); } })
      .catch(failure => { if (active && current.current === scope) setError(failure instanceof Error ? failure.message : "無法讀取已儲存初審。"); });
    return () => { active = false; };
  }, [open, key, scope, seriesId, retry]);

  const save = async (report: CircuitPdfAiReviewReport) => {
    if (!canEdit || current.current !== scope || report.key !== key) throw new Error("版本、頁碼或權限已變更，請重新開啟初審。");
    const previous = rowsRef.current.find(row => row.report.id === report.id);
    const value = await saveCircuitPdfAiReview(seriesId, report, previous?.revision ?? 0);
    if (current.current !== scope) return;
    const next = previous ? rowsRef.current.map(row => row.report.id === report.id ? value : row) : [value, ...rowsRef.current];
    rowsRef.current = next; setRows(next);
  };
  if (!open) return null;
  if (!key || loaded !== scope) return <Dialog open onOpenChange={onOpenChange}><DialogContent><DialogTitle>AI 逐頁初審</DialogTitle><DialogDescription>{!key ? "先指定官方基準、工作 PDF 與對應頁碼。" : error || "正在讀取這兩個版本的初審紀錄…"}</DialogDescription>{error && <Button type="button" onClick={() => setRetry(value => value + 1)}>重試讀取</Button>}</DialogContent></Dialog>;
  return <CircuitPdfAiReview open onOpenChange={onOpenChange} official={official} working={working} userName={userName} disabled={!canEdit}
    savedReport={rows[0]?.report} previousReports={rows.map(row => row.report)} onSave={save} />;
}
