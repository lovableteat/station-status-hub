import { useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { BOM_SERIES_NAME_LIMIT, BOM_VERSION_LABEL_LIMIT, BOM_VERSION_NOTE_LIMIT, nextBomVersionNumber, type BomSeries } from "./bomVersioning";
import { CHIP, CHIP_TONE } from "./bomVersionPresentation";
import type { MaterialWorkbookPayload, MaterialWorkbookRecord } from "./materialRequestUtils";
import { AI_REVIEW_AUTO_ROWS, countAiReviewBatches, type BomAiReviewResult, type BomUploadIssue } from "./bomUploadChecks";
import "./bomUploadDialog.css";

export const NEW_BOM_SERIES_TARGET = "__new-series__";

export interface PendingBomUpload {
  key: string;
  file: File;
  payload: MaterialWorkbookPayload;
  importNotes: string[];
  /** Rule checks on the columns, found while the file was read. */
  checks: BomUploadIssue[];
  /** NEW_BOM_SERIES_TARGET or the id of an existing series. */
  target: string;
  seriesName: string;
}

/** The AI review of one staged file: null result means no AI service is set up in API 管理. onlyBatches retries those batches. */
export type BomUploadReview = (
  records: readonly MaterialWorkbookRecord[],
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
  onlyBatches?: readonly number[],
) => Promise<({ modelLabel: string } & BomAiReviewResult) | null>;

type ReviewDone = { modelLabel: string } & BomAiReviewResult;
type ReviewState =
  /** A large file: the AI review waits for 「AI 檢查全部」 so dozens of requests are never sent unasked. */
  | { state: "waiting" }
  | { state: "running"; done: number; total: number }
  | ({ state: "done" } & ReviewDone)
  | { state: "none" }
  | { state: "error"; message: string };

/** Finished reviews by file, so closing the window and staging the same file again does not pay for the requests twice. */
const reviewCache = new Map<string, ReviewDone>();
const reviewCacheKey = (upload: PendingBomUpload) => [upload.file.name, upload.file.size, upload.file.lastModified, upload.payload.recordCount].join("\u0001");
const byRow = (left: BomUploadIssue, right: BomUploadIssue) => (left.row ?? 0) - (right.row ?? 0);

/** The findings of one file, worst first: row, Ref Des, part, column and reason, rule and AI alike. */
function UploadChecks({ checks, rows, stagedRows, review, onStart, onRetry }: { checks: BomUploadIssue[]; rows: number; stagedRows: number; review?: ReviewState; onStart: () => void; onRetry: () => void }) {
  const aiIssues = review?.state === "done" ? review.issues : [];
  const issues = [...checks, ...aiIssues].sort((left, right) => (left.level === right.level ? 0 : left.level === "error" ? -1 : 1) || byRow(left, right));
  const errors = issues.filter((issue) => issue.level === "error").length;
  const failed = review?.state === "done" ? review.failedBatches.length : 0;
  const status = !review ? "AI 檢查排隊中（一次檢查一個檔案）…"
    : review.state === "waiting" ? `${stagedRows > rows ? `這次共選了 ${stagedRows.toLocaleString()} 列；` : ""}這個檔案 ${rows.toLocaleString()} 列，AI 檢查要送 ${countAiReviewBatches(rows)} 次請求，按右邊按鈕才開始`
      : review.state === "running" ? `AI 檢查中（${review.done} / ${review.total || "?"} 批）…`
        : review.state === "done" ? failed === 0
          ? `AI（${review.modelLabel}）找到 ${review.issues.length} 筆`
          : `AI（${review.modelLabel}）找到 ${review.issues.length} 筆；${failed} / ${review.totalBatches} 批沒有完成（${review.failure ?? "請稍後再試"}）`
          : review.state === "none" ? "沒有可用的 AI 服務（可在 API 管理設定），只做了規則檢查"
            : `AI 檢查失敗：${review.message}`;
  return (
    <div data-testid="bom-upload-checks" className="mt-2 rounded-lg border border-border bg-background/40 p-2 text-xs">
      <p className="flex flex-wrap items-center gap-2">
        <strong className={cn("font-semibold", issues.length === 0 ? "text-success" : errors > 0 ? "text-destructive" : "text-warning")}>
          欄位檢查：{issues.length === 0
            ? review?.state === "none" || (review?.state === "done" && failed === 0) ? "沒有發現問題" : "規則檢查沒有發現問題"
            : `${issues.length} 筆問題${errors > 0 ? `（${errors} 筆建議修正）` : ""}`}
        </strong>
        <span className="text-muted-foreground">規則 {checks.length} 筆 · {status}</span>
        {review?.state === "running" && <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />}
        {review?.state === "waiting" && <Button type="button" variant="outline" size="sm" onClick={onStart} title={`把 ${rows.toLocaleString()} 列分 ${countAiReviewBatches(rows)} 批送給 API 管理設定的 AI 檢查欄位`} className="h-7 px-2 text-xs">AI 檢查全部 {rows.toLocaleString()} 列</Button>}
        {review?.state === "error" && <Button type="button" variant="outline" size="sm" onClick={onRetry} title="重新送出 AI 欄位檢查" className="h-7 px-2 text-xs">重試 AI 檢查</Button>}
        {failed > 0 && <Button type="button" variant="outline" size="sm" onClick={onRetry} title="只重送沒有完成的批次，已找到的問題會保留" className="h-7 px-2 text-xs">重試沒完成的 {failed} 批</Button>}
      </p>
      {issues.length > 0 && (
        <ul data-testid="bom-upload-issues" className="mt-2 max-h-56 space-y-1 overflow-auto pr-1">
          {issues.map((issue, index) => (
            <li key={`${issue.source}:${issue.row}:${issue.column}:${index}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 rounded-md border border-border/60 px-2 py-1">
              <span className={cn(CHIP, "row-span-2 self-start", issue.level === "error" ? CHIP_TONE.danger : CHIP_TONE.warning)} title={issue.level === "error" ? "幾乎確定填錯，建議改好原檔再上傳；不會擋上傳" : "可能有問題，請對照原檔確認；不會擋上傳"}>{issue.level === "error" ? "建議修正" : "請檢查"}{issue.source === "ai" ? " · AI" : ""}</span>
              <span className="min-w-0 truncate text-foreground" title={`第 ${issue.row ?? "?"} 列 · ${issue.refDes} · ${issue.part}`}>第 {issue.row ?? "?"} 列 · <span className="font-mono">{issue.refDes || "（無位號）"}</span> · {issue.part}</span>
              <span className="min-w-0 text-foreground/85"><b className="font-semibold">{issue.column}</b>：{issue.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface BomUploadMeta {
  label: string;
  note: string;
}

/**
 * Every upload is confirmed before anything is written: the user sees what was
 * parsed and decides whether a file starts a new series or becomes the next
 * version of an existing one. Nothing is overwritten by file name any more.
 */
export function BomUploadDialog({
  open, uploads, seriesList, activeProjectName, busy, onChange, onConfirm, onCancel, reviewUpload,
}: {
  /** Runs the AI column review of a staged file automatically; absent in tests. */
  reviewUpload?: BomUploadReview;
  open: boolean;
  uploads: PendingBomUpload[];
  seriesList: BomSeries[];
  activeProjectName?: string | null;
  busy: boolean;
  onChange: (next: PendingBomUpload[]) => void;
  onConfirm: (meta: BomUploadMeta) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  // The dialog stays mounted: every new batch starts with an empty label and note, never the previous upload's.
  useEffect(() => { if (open) { setLabel(""); setNote(""); } }, [open]);
  const targets = useMemo(() => seriesList.filter((series) => !series.archive), [seriesList]);
  const problems = uploads.map((upload) => (upload.target === NEW_BOM_SERIES_TARGET && !upload.seriesName.trim() ? "請填寫新系列名稱" : ""));
  const canConfirm = uploads.length > 0 && !busy && problems.every((problem) => !problem);
  const update = (key: string, patch: Partial<PendingBomUpload>) => onChange(uploads.map((upload) => (upload.key === key ? { ...upload, ...patch } : upload)));
  // Each staged file is reviewed by AI as soon as it is shown, one file at a time so several files never send a burst of
  // requests together. When the files staged together exceed AI_REVIEW_AUTO_ROWS, each waits for its own button.
  // Closing the window stops what is still running. A retry after some batches failed sends only those and keeps what
  // the others found.
  const [reviews, setReviews] = useState<Record<string, ReviewState>>({});
  const reviewsRef = useRef(reviews);
  reviewsRef.current = reviews;
  const [reviewRequests, setReviewRequests] = useState<Record<string, number>>({});
  const [queueTick, setQueueTick] = useState(0);
  const started = useRef(new Map<string, AbortController>());
  const active = useRef<AbortController | null>(null);
  const stagedRows = uploads.reduce((sum, upload) => sum + upload.payload.records.length, 0);
  useEffect(() => {
    if (!open || !reviewUpload) return;
    for (const upload of uploads) {
      const attempt = reviewRequests[upload.key] ?? 0;
      const runKey = `${upload.key}#${attempt}`;
      if (started.current.has(runKey)) continue;
      const cacheKey = reviewCacheKey(upload);
      const cached = attempt === 0 ? reviewCache.get(cacheKey) : undefined;
      if (attempt === 0 && (cached || stagedRows > AI_REVIEW_AUTO_ROWS)) {
        started.current.set(runKey, new AbortController());
        setReviews((current) => ({ ...current, [upload.key]: cached ? { state: "done", ...cached } : { state: "waiting" } }));
        continue;
      }
      // One review at a time: the next file starts when this one finishes (queueTick).
      if (active.current) continue;
      const prior = reviewsRef.current[upload.key];
      const previous = prior?.state === "done" && prior.failedBatches.length > 0 ? prior : undefined;
      const controller = new AbortController();
      started.current.set(runKey, controller);
      active.current = controller;
      const live = () => !controller.signal.aborted;
      setReviews((current) => ({ ...current, [upload.key]: { state: "running", done: 0, total: 0 } }));
      reviewUpload(upload.payload.records, (done, total) => { if (live()) setReviews((current) => ({ ...current, [upload.key]: { state: "running", done, total } })); }, controller.signal, previous?.failedBatches)
        .then((result) => {
          if (!live()) return;
          if (!result) { setReviews((current) => ({ ...current, [upload.key]: { state: "none" } })); return; }
          const merged: ReviewDone = previous ? { ...result, totalBatches: previous.totalBatches, issues: [...previous.issues, ...result.issues].sort(byRow) } : result;
          if (merged.failedBatches.length === 0) reviewCache.set(cacheKey, merged);
          setReviews((current) => ({ ...current, [upload.key]: { state: "done", ...merged } }));
        })
        .catch((error) => {
          if (!live()) return;
          const message = error instanceof Error ? error.message : "請稍後再試";
          // A failure before any batch ran (the model list could not be read) leaves the earlier findings in place.
          setReviews((current) => ({ ...current, [upload.key]: previous ? { ...previous, failure: message } : { state: "error", message } }));
        })
        .finally(() => {
          if (active.current !== controller) return;
          active.current = null;
          setQueueTick((tick) => tick + 1);
        });
    }
  }, [open, uploads, reviewUpload, reviewRequests, queueTick, stagedRows]);
  const requestReview = (key: string) => setReviewRequests((current) => ({ ...current, [key]: (current[key] ?? 0) + 1 }));
  useEffect(() => {
    if (open) return;
    for (const controller of started.current.values()) controller.abort();
    started.current.clear();
    active.current = null;
    setReviews({});
    setReviewRequests({});
  }, [open]);
  useEffect(() => () => {
    for (const controller of started.current.values()) controller.abort();
  }, []);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
      <DialogContent data-testid="bom-upload-dialog" hideCloseButton={busy} className="bom-upload-dialog flex max-h-[92dvh] w-[min(94vw,980px)] max-w-[min(94vw,980px)] flex-col gap-4 overflow-hidden p-4 sm:p-6">
        <DialogHeader className="pr-10">
          <DialogTitle className="flex items-center gap-2 text-xl"><FileSpreadsheet className="size-5 shrink-0 text-primary" aria-hidden="true" />確認上傳 BOM</DialogTitle>
          <DialogDescription>
            每個檔案選擇建立新系列（新板子），或成為既有系列的新版本（同一塊板）。
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {uploads.map((upload, index) => {
            const targetSeries = targets.find((series) => series.id === upload.target);
            return (
              <div key={upload.key} className="bom-upload-file min-w-0 rounded-xl border border-border bg-background/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 flex-none text-primary" aria-hidden="true" />
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={upload.file.name}>{upload.file.name}</p>
                  <span className="max-w-full truncate text-xs text-muted-foreground" title={upload.payload.sheetName}>工作表 {upload.payload.sheetName} · {upload.payload.recordCount.toLocaleString()} 筆</span>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="min-w-0">
                    <Label htmlFor={`bom-upload-target-${index}`} className="text-xs text-muted-foreground">上傳方式</Label>
                    <Select value={upload.target} onValueChange={(value) => update(upload.key, { target: value })} disabled={busy}>
                      <SelectTrigger id={`bom-upload-target-${index}`} className="mt-1 h-10 min-w-0 text-sm [&>span]:min-w-0 [&>span]:truncate"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NEW_BOM_SERIES_TARGET}>建立新 BOM 系列</SelectItem>
                        {targets.map((series) => (
                          <SelectItem key={series.id} value={series.id}>{series.name} 的新版本（目前 {series.current.displayNumber} → V{nextBomVersionNumber(series)}）</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {upload.target === NEW_BOM_SERIES_TARGET ? (
                    <div>
                      <Label htmlFor={`bom-upload-name-${index}`} className="text-xs text-muted-foreground">新系列名稱</Label>
                      <Input id={`bom-upload-name-${index}`} value={upload.seriesName} maxLength={BOM_SERIES_NAME_LIMIT} disabled={busy} onChange={(event) => update(upload.key, { seriesName: event.target.value })} aria-invalid={Boolean(problems[index])} className={cn("mt-1 h-10 text-sm", problems[index] && "border-destructive")} />
                      {problems[index] ? <p className="mt-1 text-xs text-destructive">{problems[index]}</p> : activeProjectName && <p className="mt-1 text-xs text-muted-foreground">會歸入「{activeProjectName}」</p>}
                    </div>
                  ) : targetSeries ? (
                    <p className="self-end pb-2 text-xs text-foreground/80">
                      <strong className="text-primary">{targetSeries.current.displayNumber} → V{nextBomVersionNumber(targetSeries)}</strong>
                      {" · 保留舊版，依位號與料號帶入追蹤、Note、負責人與 SPEC 附件；完成後可直接看差異。"}
                    </p>
                  ) : null}
                </div>
                {upload.importNotes.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-warning">
                    {upload.importNotes.map((item) => <li key={item} className="flex gap-1.5"><span className={cn(CHIP, "flex-none", CHIP_TONE.warning)}>注意</span><span className="min-w-0">{item}</span></li>)}
                  </ul>
                )}
                <UploadChecks checks={upload.checks ?? []} rows={upload.payload.records.length} stagedRows={stagedRows} review={reviewUpload ? reviews[upload.key] : { state: "none" }} onStart={() => requestReview(upload.key)} onRetry={() => requestReview(upload.key)} />
              </div>
            );
          })}
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div>
            <Label htmlFor="bom-upload-label" className="text-xs text-muted-foreground">版本標籤（選填，例如 EVT rev B）</Label>
            <Input id="bom-upload-label" value={label} maxLength={BOM_VERSION_LABEL_LIMIT} disabled={busy} onChange={(event) => setLabel(event.target.value)} className="mt-1 h-10 text-sm" />
          </div>
          <div>
            <Label htmlFor="bom-upload-note" className="text-xs text-muted-foreground">版本說明（選填，寫改版原因給工廠與同事看）</Label>
            <Textarea id="bom-upload-note" value={note} maxLength={BOM_VERSION_NOTE_LIMIT} disabled={busy} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-1 min-h-10 text-sm" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          <span className="sr-only" role="status">{busy ? "正在建立 BOM 版本…" : ""}</span>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel} className="h-10">取消</Button>
          <Button type="button" disabled={!canConfirm} data-pending={busy || undefined} onClick={() => onConfirm({ label: label.trim(), note: note.trim() })} className="bom-upload-confirm h-10 min-w-[11rem]">
            {busy ? <Loader2 className="motion-safe:animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
            {busy ? "正在建立 BOM 版本…" : uploads.length > 1 ? `確認上傳 ${uploads.length} 個檔案` : "確認上傳"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
