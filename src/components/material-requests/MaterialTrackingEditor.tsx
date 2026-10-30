import { type ClipboardEvent, useEffect, useId, useRef, useState } from "react";
import { ChevronRight, CircleCheck, CircleDot, ClipboardPaste, History, ImagePlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createClipboardImageName } from "./materialRequestPresentation";
import { getLatestTrackingEntry, type MaterialTrackingHistoryImage, type MaterialWorkbookRecord } from "./materialRequestUtils";
import { MATERIAL_TRACKING_STATUS_OPTIONS, normalizeMaterialRequestUrl, type MaterialTrackingDraft } from "./materialTrackingDraft";
import { getMaterialTrackingStatusMeaning, materialTrackingStatusTone, materialTrackingStatusPresentation } from "./materialTrackingStatus";

export interface MaterialTrackingEditorProps {
  record: MaterialWorkbookRecord;
  draft: MaterialTrackingDraft;
  onDraftChange: (draft: MaterialTrackingDraft) => void;
  disabled?: boolean;
  defaultAuthor?: string;
}

function statusLabel(status: string, hasContent = false) {
  return status.trim() || (hasContent ? "處理中" : "未處理");
}

function TrackingStatusBadge({ status }: { status: string }) {
  const label = statusLabel(status);
  const tone = materialTrackingStatusTone(label);
  const meaning = getMaterialTrackingStatusMeaning(label);
  const Icon = label === "已完成" ? CircleCheck : CircleDot;
  return <span data-testid="tracking-status-badge" data-status={label} className={`inline-flex flex-wrap items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-semibold ${tone}`}><Icon className="h-4 w-4" aria-hidden="true" />{label}{meaning && <span className="border-l border-current/30 pl-1.5 text-xs font-normal">{meaning}</span>}</span>;
}

function formatTime(value: string) {
  if (!value) return "舊版狀態";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-TW", { hour12: false });
}

function readImageFile(file: File) {
  return new Promise<MaterialTrackingHistoryImage>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return reject(new Error(`圖片「${file.name}」讀取失敗`));
      resolve({ id: `tracking-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: file.name, mimeType: file.type, size: file.size, dataUrl: reader.result });
    };
    reader.onerror = () => reject(new Error(`圖片「${file.name}」讀取失敗`));
    reader.readAsDataURL(file);
  });
}

function RequestLink({ ticket, url }: { ticket?: string; url?: string }) {
  const href = normalizeMaterialRequestUrl(url ?? "");
  if (!ticket && !url) return null;
  return href
    ? <a href={href} target="_blank" rel="noreferrer" className="break-all text-sm text-primary underline underline-offset-4">{ticket ? `單號 ${ticket}` : url}</a>
    : <span className="break-all text-sm text-foreground">{ticket ? `單號 ${ticket}` : url}</span>;
}

export function MaterialTrackingEditor({ record, draft, onDraftChange, disabled = false, defaultAuthor = "" }: MaterialTrackingEditorProps) {
  const id = useId();
  const [previewImage, setPreviewImage] = useState<MaterialTrackingHistoryImage | null>(null);
  const [imageError, setImageError] = useState("");
  const imageInput = useRef<HTMLInputElement>(null);
  const draftRef = useRef(draft);
  const scopeRef = useRef("");
  const mountedRef = useRef(true);
  draftRef.current = draft;
  scopeRef.current = `${record.id}:${draft.sessionId}:${defaultAuthor}:${disabled}`;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => {
    setPreviewImage(null);
    setImageError("");
  }, [record.id, draft.sessionId, defaultAuthor]);

  const updateDraft = (patch: Partial<MaterialTrackingDraft>) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    onDraftChange(next);
  };

  const appendImages = async (files: File[], clipboard = false) => {
    if (disabled || !files.length) return;
    const scope = scopeRef.current;
    const validFiles = files.filter((file) => file.type.startsWith("image/"));
    setImageError(validFiles.length < files.length ? "只支援圖片檔案，其他檔案未加入。" : "");
    if (!validFiles.length) return;
    const timestamp = new Date();
    const images = validFiles.map((file, index) => {
      if (!clipboard) return file;
      const baseName = createClipboardImageName(file.type, timestamp);
      const name = index ? baseName.replace(/(\.[^.]+)$/, `-${index + 1}$1`) : baseName;
      return new File([file], name, { type: file.type, lastModified: timestamp.getTime() });
    });
    updateDraft({ pendingImageReads: draftRef.current.pendingImageReads + 1 });
    try {
      const loaded = await Promise.all(images.map(readImageFile));
      if (!mountedRef.current || scopeRef.current !== scope) return;
      updateDraft({ images: [...draftRef.current.images, ...loaded], pendingImageReads: draftRef.current.pendingImageReads - 1 });
    } catch (error) {
      if (!mountedRef.current || scopeRef.current !== scope) return;
      updateDraft({ pendingImageReads: draftRef.current.pendingImageReads - 1 });
      setImageError(error instanceof Error ? error.message : "圖片讀取失敗，請重新選擇。");
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLElement>) => {
    if (disabled) return;
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .flatMap((item) => { const file = item.getAsFile(); return file ? [file] : []; });
    if (!files.length) return;
    event.preventDefault();
    void appendImages(files, true);
  };

  const latest = getLatestTrackingEntry(record);
  const history = record.trackingHistory?.length ? [...record.trackingHistory].reverse() : latest ? [latest] : [];
  const latestStatus = statusLabel(latest?.status || record.trackingStatus || "", Boolean(latest?.note?.trim() || latest?.createdBy?.trim() || latest?.requestInfo?.trim()));
  const hasUnselectedProgress = !draft.status && Boolean(draft.note.trim() || draft.createdBy.trim() || draft.requestInfo.trim() || draft.images.length);
  const thumbnails = (images: MaterialTrackingHistoryImage[], removable = false) => (
    <div className="flex flex-wrap gap-2">
      {images.map((image) => (
        <div key={image.id} className="relative w-28">
          <button type="button" onClick={() => setPreviewImage(image)} className="block aspect-[4/3] w-full overflow-hidden rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`預覽圖片：${image.name}`}>
            <img src={image.dataUrl} alt={image.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          </button>
          {removable && !disabled && <Button type="button" variant="secondary" size="icon" className="absolute right-0 top-0 h-10 w-10" aria-label={`移除圖片：${image.name}`} onClick={() => updateDraft({ images: draftRef.current.images.filter((item) => item.id !== image.id) })}><X /></Button>}
          <p className="mt-1 truncate text-xs text-muted-foreground" title={image.name}>{image.name}</p>
        </div>
      ))}
    </div>
  );

  return (
    <section data-testid="material-tracking-editor" className="min-w-0 space-y-4" onPaste={handlePaste} aria-label="狀態追蹤">
      <div data-testid="tracking-current-summary" className={`space-y-3 rounded-lg border p-4 ${materialTrackingStatusPresentation(latestStatus).surface}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">目前狀態</h3>
          <TrackingStatusBadge status={latestStatus} />
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">更新時間</dt><dd className="mt-1">{latest?.createdAt ? formatTime(latest.createdAt) : latest ? "舊版紀錄未提供時間" : "尚無紀錄"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">更新人</dt><dd className="mt-1">{latest?.createdBy || "未提供"}</dd></div>
        </dl>
        {latest?.requestInfo && <div className="space-y-1"><p className="text-xs text-muted-foreground">申請狀態資訊</p><p className="break-words text-sm font-medium">{normalizeMaterialRequestUrl(latest.requestInfo) ? <RequestLink url={latest.requestInfo} /> : latest.requestInfo}</p></div>}
      </div>

      <fieldset disabled={disabled} className="material-tracking-fields min-w-0 space-y-4 border-t border-border pt-4">
        <legend className="sr-only">編輯追蹤資料</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor={`${id}-ticket`}>單號</Label><Input id={`${id}-ticket`} className="h-11" value={draft.requestTicket} onChange={(event) => updateDraft({ requestTicket: event.target.value })} placeholder="Excel 單號 / ticket" /></div>
          <div className="space-y-1.5"><Label htmlFor={`${id}-url`}>連結</Label><Input id={`${id}-url`} className="h-11" value={draft.requestUrl} onChange={(event) => updateDraft({ requestUrl: event.target.value })} placeholder="request URL" /></div>
        </div>
        <div className="space-y-1"><div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold">本次新增紀錄</h4>{draft.status && <Badge variant="outline" className="border-warning/35 text-warning">尚未儲存</Badge>}</div><p className="text-sm text-muted-foreground">選擇本次狀態，再按底部「儲存資料與追蹤」才會更新目前狀態。只修改單號或連結不新增紀錄。</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-status`}>本次狀態</Label>
            <Select disabled={disabled} value={draft.status || "none"} onValueChange={(value) => updateDraft({ status: value === "none" ? "" : value })}>
              <SelectTrigger id={`${id}-status`} data-testid="tracking-status-trigger" className="material-tracking-status-trigger h-11" aria-invalid={hasUnselectedProgress}><SelectValue>{draft.status || "不新增紀錄（保留目前狀態）"}</SelectValue></SelectTrigger>
              <SelectContent data-testid="tracking-status-menu" className="material-tracking-status-menu" position="popper" side="bottom" align="start" sideOffset={4} avoidCollisions={false} collisionPadding={12}>
                <SelectGroup>
                  <SelectItem value="none" className="material-tracking-status-option">不新增紀錄（保留目前狀態）</SelectItem>
                  {MATERIAL_TRACKING_STATUS_OPTIONS.map(status => <SelectItem key={status} value={status} textValue={status} className="material-tracking-status-option">
                    <span className="material-tracking-status-option-content">
                      <span data-status={status} className={`inline-flex shrink-0 items-center gap-2 text-sm font-semibold ${materialTrackingStatusPresentation(status).text}`}><CircleDot className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{statusLabel(status)}</span>
                      {getMaterialTrackingStatusMeaning(status) && <span className="text-xs text-muted-foreground">{getMaterialTrackingStatusMeaning(status)}</span>}
                    </span>
                  </SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor={`${id}-author`}>更新人</Label><Input id={`${id}-author`} className="h-11" value={draft.createdBy || defaultAuthor} onChange={(event) => updateDraft({ createdBy: event.target.value })} placeholder="更新人姓名" /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor={`${id}-info`}>申請狀態資訊</Label><Input id={`${id}-info`} className="h-11" value={draft.requestInfo} onChange={(event) => updateDraft({ requestInfo: event.target.value })} placeholder="申請狀態或相關連結" /></div>
        <div className="space-y-1.5"><Label htmlFor={`${id}-note`}>追蹤說明</Label><Textarea id={`${id}-note`} className="min-h-24 text-sm" value={draft.note} onChange={(event) => updateDraft({ note: event.target.value })} placeholder="這次做了什麼、卡在哪、下一步" /></div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" className="h-11" disabled={disabled} onClick={() => imageInput.current?.click()}><ImagePlus />選擇圖片</Button><span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><ClipboardPaste className="h-4 w-4" />或在此區域 Ctrl+V 貼圖</span></div>
          <input ref={imageInput} type="file" accept="image/*" multiple className="hidden" aria-label="選擇追蹤圖片" disabled={disabled} onChange={(event) => { void appendImages(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
          {draft.images.length > 0 && thumbnails(draft.images, true)}
          {draft.pendingImageReads > 0 && <p role="status" className="text-sm text-muted-foreground">圖片讀取中，完成後即可儲存。</p>}
          {imageError && <p role="alert" className="text-sm text-destructive">{imageError}</p>}
          {hasUnselectedProgress && <p role="alert" className="text-sm text-warning">請選擇追蹤狀態，才能儲存這次進度與圖片。</p>}
        </div>
      </fieldset>

      <div data-testid="tracking-history-panel" className="space-y-3 border-t border-border pt-4">
        <h4 className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-muted-foreground" />歷史紀錄 <span className="text-xs font-normal text-muted-foreground">{history.length} 筆 · 由新到舊</span></h4>
        {history.length === 0 && <p className="text-sm text-muted-foreground">還沒有歷史紀錄</p>}
        {history.map((entry, index) => <details key={`${entry.id}-${index}`} open={index === 0} className="group rounded-lg border border-border bg-background/30">
          <summary className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <ChevronRight className="mt-1.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
            <span className="min-w-0 flex-1 space-y-2">
              <span className="flex flex-wrap items-center gap-2"><TrackingStatusBadge status={entry.status} />{index === 0 && <span className="text-xs font-medium text-primary">最新紀錄</span>}{!!entry.images?.length && <span className="text-xs text-muted-foreground">{entry.images.length} 張圖片</span>}</span>
              <span className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground"><span>更新時間：{formatTime(entry.createdAt)}</span><span>更新人：<span className="text-foreground">{entry.createdBy || "未提供"}</span></span></span>
            </span>
          </summary>
          <div className="space-y-3 border-t border-border px-4 py-3 sm:pl-10">
            {entry.note && <div className="space-y-1"><p className="text-xs text-muted-foreground">追蹤說明</p><p className="whitespace-pre-wrap break-words text-sm leading-6">{entry.note}</p></div>}
            <RequestLink ticket={entry.requestTicket} url={entry.requestUrl} />
            {entry.requestInfo && <div className="space-y-1"><p className="text-xs text-muted-foreground">申請狀態資訊</p><p className="break-words text-sm font-medium">{normalizeMaterialRequestUrl(entry.requestInfo) ? <RequestLink url={entry.requestInfo} /> : entry.requestInfo}</p></div>}
            {!!entry.images?.length && thumbnails(entry.images)}
          </div>
        </details>)}
      </div>

      <Dialog open={Boolean(previewImage)} onOpenChange={(open) => { if (!open) setPreviewImage(null); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle className="break-all text-base">{previewImage?.name ?? "圖片預覽"}</DialogTitle><DialogDescription>{previewImage ? `${(previewImage.size / 1024).toFixed(1)} KB` : "追蹤附件圖片"}</DialogDescription></DialogHeader>
          {previewImage && <><img src={previewImage.dataUrl} alt={previewImage.name} className="max-h-[70vh] w-full object-contain" /><div className="flex justify-end"><Button asChild variant="secondary"><a href={previewImage.dataUrl} download={previewImage.name}>下載圖片</a></Button></div></>}
        </DialogContent>
      </Dialog>
    </section>
  );
}
