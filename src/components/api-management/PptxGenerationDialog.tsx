import { useEffect, useRef, useState } from "react";
import { Download, FileText, LoaderCircle, Presentation, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PRESENTATION_SLIDE_MAX, PRESENTATION_SLIDE_MIN, type PresentationDraft } from "./pptxGeneration";
import { isPresentationSource, PRESENTATION_FILE_ACCEPT, PRESENTATION_MAX_FILES, PRESENTATION_MAX_FILE_BYTES, PRESENTATION_MAX_TEXT } from "./presentationSources";

export interface PresentationRequest {
  files: readonly File[];
  sourceText: string;
  instruction: string;
  slideCount: number;
}

export function PptxGenerationDialog({ compact, model, progress, onClose, onGenerate }: {
  compact: boolean;
  model: string;
  progress: string;
  onClose: () => void;
  onGenerate: (request: PresentationRequest) => Promise<{ draft: PresentationDraft; model: string }>;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [sourceText, setSourceText] = useState("");
  const [instruction, setInstruction] = useState("");
  const [slideCount, setSlideCount] = useState(6);
  const [result, setResult] = useState<{ draft: PresentationDraft; model: string }>();
  const draft = result?.draft;
  const [running, setRunning] = useState<"generate" | "download">();
  const [error, setError] = useState("");
  const [fileWarnings, setFileWarnings] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    if (result) previewRef.current?.scrollIntoView({ block: "start" });
  }, [result]);

  function addFiles(incoming: readonly File[]) {
    if (!incoming.length || runningRef.current) return;
    const next = [...files];
    const warnings: string[] = [];
    let bytes = next.reduce((sum, file) => sum + file.size, 0);
    for (const file of incoming) {
      if (!file.size || !isPresentationSource(file)) warnings.push(`${file.name}（空檔或格式不支援）`);
      else if (next.length >= PRESENTATION_MAX_FILES || bytes + file.size > PRESENTATION_MAX_FILE_BYTES) warnings.push(`${file.name}（超過附件容量）`);
      else {
        next.push(file);
        bytes += file.size;
      }
    }
    setFiles(next);
    setFileWarnings(warnings);
    if (next.length !== files.length) setResult(undefined);
  }

  async function generate() {
    if (runningRef.current || (!files.length && !sourceText.trim())) return;
    runningRef.current = true;
    setRunning("generate");
    setError("");
    try {
      setResult(await onGenerate({ files, sourceText: sourceText.trim(), instruction: instruction.trim(), slideCount }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "簡報產生失敗，請再試一次。");
    } finally {
      runningRef.current = false;
      setRunning(undefined);
    }
  }

  async function download() {
    if (!draft || runningRef.current) return;
    runningRef.current = true;
    setRunning("download");
    setError("");
    try {
      const { downloadAiPresentation } = await import("@/lib/aiPresentationExport");
      await downloadAiPresentation(draft);
    } catch {
      setError("PowerPoint 檔案下載失敗，請再試一次。");
    } finally {
      runningRef.current = false;
      setRunning(undefined);
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !runningRef.current) onClose(); }}>
      <DialogContent data-ai-mobile-dialog={compact ? "presentation" : undefined} className="flex max-h-[calc(100dvh_-_1rem)] w-[calc(100%_-_1rem)] max-w-[760px] flex-col gap-0 overflow-hidden p-0 sm:max-h-[90dvh]">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-4 pr-12 sm:px-6 sm:pr-12">
          <DialogTitle className="flex items-center gap-2"><Presentation className="size-5 text-primary" />製作 PPT</DialogTitle>
          <DialogDescription>上傳或貼上資料，整理成可編輯的 PowerPoint 簡報。</DialogDescription>
        </DialogHeader>

        <div data-ai-mobile-dialog-body className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6" onPaste={event => {
          const incoming = Array.from(event.clipboardData.files);
          if (incoming.length) { event.preventDefault(); addFiles(incoming); }
        }}>
          <fieldset className="grid gap-4" disabled={Boolean(running)}>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">來源資料</h3>
              <input ref={inputRef} type="file" accept={PRESENTATION_FILE_ACCEPT} multiple className="hidden" aria-label="簡報來源檔案" onChange={event => {
                addFiles(Array.from(event.target.files ?? []));
                event.target.value = "";
              }} />
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 sm:p-4" onDragOver={event => event.preventDefault()} onDrop={event => {
                event.preventDefault();
                addFiles(Array.from(event.dataTransfer.files));
              }}>
                <div className="min-w-0">
                  <p className="text-sm font-medium">拖放資料檔案或貼上圖片</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">PDF、Excel、Word (.docx)、PPTX、CSV、文字與圖片。最多 12 個檔案，合計 24 MB。</p>
                  <p className="text-xs leading-5 text-muted-foreground">Office 檔讀取文字和儲存的數值。圖表或圖片可另附 PDF 或圖片。</p>
                </div>
                <Button type="button" variant="outline" className="gap-2" onClick={() => inputRef.current?.click()}><Upload className="size-4" />選擇檔案</Button>
              </div>
              {files.length > 0 && <ul className="max-h-32 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {files.map((file, index) => <li key={index} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <FileText className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate" title={file.name}>{file.name}</span>
                  <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label={`移除 ${file.name}`} onClick={() => {
                    setFiles(current => current.filter((_, item) => item !== index));
                    setFileWarnings([]);
                    setResult(undefined);
                  }}><X className="size-4" /></Button>
                </li>)}
              </ul>}
              {fileWarnings.length > 0 && <p role="status" className="break-words text-xs text-warning">未加入 {fileWarnings.join("、")}</p>}
              <Label htmlFor="ppt-source-text">貼上文字或表格</Label>
              <Textarea id="ppt-source-text" rows={2} maxLength={PRESENTATION_MAX_TEXT} placeholder="例如會議紀錄、測試結果、Excel 表格" value={sourceText} onChange={event => { setSourceText(event.target.value); setResult(undefined); }} />
            </div>

            <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
              <div className="space-y-2">
                <Label htmlFor="ppt-instruction">簡報需求 <span className="font-normal text-muted-foreground">（選填）</span></Label>
                <Textarea id="ppt-instruction" rows={2} maxLength={1200} placeholder="例如給主管看的週報，先講結論和下一步" value={instruction} onChange={event => { setInstruction(event.target.value); setResult(undefined); }} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ppt-slide-count">總頁數</Label>
                <select id="ppt-slide-count" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" value={slideCount} onChange={event => { setSlideCount(Number(event.target.value)); setResult(undefined); }}>
                  {Array.from({ length: PRESENTATION_SLIDE_MAX - PRESENTATION_SLIDE_MIN + 1 }, (_, index) => PRESENTATION_SLIDE_MIN + index).map(count => <option key={count} value={count}>{count} 頁</option>)}
                </select>
              </div>
            </div>
          </fieldset>

          {result && draft && <section ref={previewRef} className="rounded-xl border border-border bg-muted/25 p-3 sm:p-4" aria-label="簡報預覽">
            <h3 className="text-sm font-semibold">{draft.title} <span className="ml-1 font-normal text-muted-foreground">· {draft.slides.length} 頁</span></h3>
            <p className="mt-1 text-xs text-muted-foreground">產生模型 {result.model}</p>
            <ol className="mt-2 grid gap-2 sm:grid-cols-2">
              {draft.slides.map((slide, index) => <li key={index} className="min-w-0">
                <details open={index === 0} className="rounded-lg border border-border bg-background p-2 text-sm">
                  <summary className="cursor-pointer break-words">{index + 1}. {slide.title}</summary>
                  <ul className="list-disc space-y-1 break-words pl-5 pt-2 text-xs leading-5 text-muted-foreground">{slide.bullets.map((bullet, bulletIndex) => <li key={bulletIndex}>{bullet}</li>)}</ul>
                  {slide.source && <p className="mt-2 break-words text-xs text-muted-foreground">來源 {slide.source}</p>}
                </details>
              </li>)}
            </ol>
          </section>}
          {error && <p role="alert" className="break-words rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="shrink-0 flex-row flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 sm:px-6">
          <p role="status" className="mr-auto min-w-0 break-words text-xs text-muted-foreground">{running === "generate" ? progress || "正在整理來源…" : model ? `下次使用 ${model}` : "請先選擇可用的 AI 模型"}</p>
          <Button type="button" variant={draft ? "outline" : "default"} disabled={Boolean(running) || !model || (!files.length && !sourceText.trim())} onClick={() => void generate()} className="gap-2">
            {running === "generate" ? <LoaderCircle className="size-4 animate-spin" /> : <Presentation className="size-4" />}
            {running === "generate" ? "產生中…" : draft ? "重新產生" : "產生簡報"}
          </Button>
          {draft && <Button type="button" disabled={Boolean(running)} onClick={() => void download()} className="gap-2"><Download className="size-4" />下載 PowerPoint</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
