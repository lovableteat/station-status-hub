import { useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { BOM_SERIES_NAME_LIMIT, BOM_VERSION_LABEL_LIMIT, BOM_VERSION_NOTE_LIMIT, nextBomVersionNumber, type BomSeries } from "./bomVersioning";
import { CHIP, CHIP_TONE } from "./bomVersionPresentation";
import type { MaterialWorkbookPayload } from "./materialRequestUtils";

export const NEW_BOM_SERIES_TARGET = "__new-series__";

export interface PendingBomUpload {
  key: string;
  file: File;
  payload: MaterialWorkbookPayload;
  importNotes: string[];
  /** NEW_BOM_SERIES_TARGET or the id of an existing series. */
  target: string;
  seriesName: string;
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
  open, uploads, seriesList, activeProjectName, busy, onChange, onConfirm, onCancel,
}: {
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
  const targets = useMemo(() => seriesList.filter((series) => !series.archive), [seriesList]);
  const problems = uploads.map((upload) => (upload.target === NEW_BOM_SERIES_TARGET && !upload.seriesName.trim() ? "請填寫新系列名稱" : ""));
  const canConfirm = uploads.length > 0 && !busy && problems.every((problem) => !problem);
  const update = (key: string, patch: Partial<PendingBomUpload>) => onChange(uploads.map((upload) => (upload.key === key ? { ...upload, ...patch } : upload)));

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
      <DialogContent data-testid="bom-upload-dialog" className="flex max-h-[92vh] w-[min(94vw,980px)] max-w-[min(94vw,980px)] flex-col gap-4 overflow-hidden p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-xl">確認上傳 BOM</DialogTitle>
          <DialogDescription>
            每次上傳都會保存為獨立版本，不會覆蓋舊資料。同一塊板請選「作為既有系列的新版本」，RD 的追蹤紀錄會依位號與料號帶到新版；全新的板子請建立新系列{activeProjectName ? `（會歸入專案「${activeProjectName}」）` : ""}。
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {uploads.map((upload, index) => {
            const targetSeries = targets.find((series) => series.id === upload.target);
            return (
              <div key={upload.key} className="rounded-xl border border-border bg-background/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 flex-none text-primary" aria-hidden="true" />
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={upload.file.name}>{upload.file.name}</p>
                  <span className="text-xs text-muted-foreground">工作表 {upload.payload.sheetName} · {upload.payload.recordCount.toLocaleString()} 筆</span>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div>
                    <Label htmlFor={`bom-upload-target-${index}`} className="text-xs text-muted-foreground">這份檔案是</Label>
                    <Select value={upload.target} onValueChange={(value) => update(upload.key, { target: value })} disabled={busy}>
                      <SelectTrigger id={`bom-upload-target-${index}`} className="mt-1 h-10 text-sm"><SelectValue /></SelectTrigger>
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
                      {problems[index] && <p className="mt-1 text-xs text-destructive">{problems[index]}</p>}
                    </div>
                  ) : targetSeries ? (
                    <p className="self-end pb-2 text-xs text-foreground/80">
                      會與 {targetSeries.current.displayNumber}（{targetSeries.current.workspace.payload.recordCount.toLocaleString()} 筆）比對並帶入追蹤；上傳後可在版本管理查看差異。
                    </p>
                  ) : null}
                </div>
                {upload.importNotes.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-warning">
                    {upload.importNotes.map((item) => <li key={item} className="flex gap-1.5"><span className={cn(CHIP, "flex-none", CHIP_TONE.warning)}>注意</span><span className="min-w-0">{item}</span></li>)}
                  </ul>
                )}
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

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel} className="h-10">取消</Button>
          <Button type="button" disabled={!canConfirm} onClick={() => onConfirm({ label: label.trim(), note: note.trim() })} className="h-10">{busy ? "上傳中…" : uploads.length > 1 ? `確認上傳 ${uploads.length} 個檔案` : "確認上傳"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
