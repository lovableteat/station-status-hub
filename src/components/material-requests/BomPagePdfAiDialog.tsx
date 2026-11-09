import { useEffect, useRef, useState } from "react";
import { FileSearch, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { SpecFillModel } from "./materialSpecFillService";
import type { PdfPageTitle } from "./bomPagePdfAi";
import { readPdfPageTitles } from "./bomPagePdfAiService";

export function BomPagePdfAiDialog({ open, onOpenChange, onApply, maxPages }: {
  open: boolean; onOpenChange: (open: boolean) => void; onApply: (pages: PdfPageTitle[]) => void; maxPages: number;
}) {
  const [models, setModels] = useState<SpecFillModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Array<PdfPageTitle & { previewUrl: string }>>([]);
  const [previewPage, setPreviewPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const active = useRef<AbortController | null>(null);
  const urls = useRef<string[]>([]);
  const clearResults = () => { urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current = []; setRows([]); };
  useEffect(() => {
    if (!open) { setBusy(false); return; }
    let current = true;
    setLoadingModels(true); setError("");
    void import("./materialSpecFillService").then(module => module.loadSpecFillModels()).then(items => {
      if (!current) return;
      setModels(items); setModelId(previous => items.some(item => item.id === previous) ? previous : items[0]?.id ?? "");
    }).catch(reason => { if (current) setError(reason instanceof Error ? reason.message : "無法載入 AI 服務。"); })
      .finally(() => { if (current) setLoadingModels(false); });
    return () => { current = false; active.current?.abort(); active.current = null; };
  }, [open]);
  useEffect(() => () => { active.current?.abort(); urls.current.forEach(url => URL.revokeObjectURL(url)); }, []);

  const model = models.find(item => item.id === modelId);
  const selected = rows.find(row => row.pageNumber === previewPage);
  const missing = rows.filter(row => !row.title.trim()).length;
  const run = async () => {
    if (!file || !model || busy) return;
    const controller = new AbortController(); active.current = controller;
    clearResults(); setBusy(true); setError(""); setProgress({ done: 0, total: 0 });
    try {
      const result = await readPdfPageTitles(file, model, controller.signal, (done, total) => {
        if (!controller.signal.aborted) setProgress({ done, total });
      }, maxPages);
      if (controller.signal.aborted) return;
      const next = result.map(row => { const previewUrl = URL.createObjectURL(row.preview); urls.current.push(previewUrl); return { pageNumber: row.pageNumber, title: row.title, previewUrl }; });
      setRows(next); setPreviewPage(1);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "PDF 辨識失敗，沒有套用任何資料。");
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  };
  const close = (next: boolean) => { if (!next) { active.current?.abort(); active.current = null; setBusy(false); } onOpenChange(next); };

  return <Dialog open={open} onOpenChange={close}>
    <DialogContent data-testid="bom-page-pdf-ai" className="flex h-[92dvh] w-[calc(100vw-20px)] max-w-5xl flex-col gap-3 overflow-hidden p-4 sm:p-5">
      <DialogHeader className="shrink-0 pr-10 text-left">
        <DialogTitle className="flex items-center gap-2"><FileSearch className="size-5 text-primary" />PDF AI</DialogTitle>
        <DialogDescription>自動讀取 PDF 實際頁數與每頁右下角標題欄。預覽後套用，原有完成狀態與備註會保留。</DialogDescription>
      </DialogHeader>
      <div className={rows.length ? "hidden" : "grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto]"}>
        <label className="min-w-0 space-y-1 text-xs">PDF 檔案（50 MB 以內）<Input type="file" accept=".pdf,application/pdf" disabled={busy} aria-label="選擇標題辨識 PDF" className="h-11 text-sm" onChange={event => { setFile(event.target.files?.[0] ?? null); event.target.value = ""; clearResults(); setError(""); }} /></label>
        <label className="min-w-0 space-y-1 text-xs">AI 服務<select aria-label="PDF AI 服務" value={modelId} disabled={busy || loadingModels} onChange={event => setModelId(event.target.value)} className="block h-11 w-full min-w-0 rounded-md border border-input bg-background px-2 text-base sm:text-sm">
          {!models.length && <option value="">{loadingModels ? "載入中…" : "沒有可用的 AI 服務"}</option>}
          {models.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
        <Button type="button" className="col-span-2 h-11 self-end sm:col-span-1" disabled={!file || !model || busy || loadingModels} onClick={() => void run()}>{busy ? <><Loader2 className="mr-2 size-4 animate-spin" />辨識中</> : "辨識全部頁面"}</Button>
      </div>
      {file && <div className="flex shrink-0 items-center justify-between gap-2 text-xs text-muted-foreground"><p className="min-w-0 truncate" title={file.name}>{file.name} · 僅辨識右下角截圖</p>{rows.length > 0 && <Button type="button" variant="ghost" className="h-11 shrink-0 px-2 text-xs" onClick={clearResults}>更換 PDF／模型</Button>}</div>}
      {busy && <div className="flex shrink-0 items-center justify-between gap-2" role="status"><span className="text-sm">{progress.total ? `已辨識 ${progress.done} / ${progress.total} 頁` : "讀取 PDF…"}</span><Button type="button" variant="outline" className="h-11" onClick={() => { active.current?.abort(); active.current = null; setBusy(false); setError("已取消，未套用任何資料。"); }}>取消辨識</Button></div>}
      {error && <p role="alert" className="shrink-0 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
      {rows.length ? <div className="grid min-h-0 flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="hidden min-h-0 flex-col gap-2 sm:flex">
          <div className="flex items-center justify-between gap-2 text-sm"><span>第 {previewPage} 頁右下角</span>{selected && <a href={selected.previewUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center px-2 text-primary underline">放大預覽</a>}</div>
          <div className="max-h-40 min-h-0 overflow-auto rounded-md border bg-white sm:max-h-none sm:flex-1">{selected && <img src={selected.previewUrl} alt={`第 ${previewPage} 頁右下角標題原圖`} className="w-full" />}</div>
        </div>
        <div className="flex min-h-0 flex-col overflow-hidden rounded-md border">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-secondary px-3 py-2 text-xs"><span>實際 PDF 共 {rows.length} 頁</span><span>{missing ? `${missing} 頁標題需補填` : "全部標題已填入"}</span>{selected && <a href={selected.previewUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 shrink-0 items-center text-primary underline sm:hidden">右下原圖</a>}</div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.map(row => <div key={row.pageNumber} className="flex items-center gap-2 border-b px-2 py-1 last:border-b-0">
              <Button type="button" variant={row.pageNumber === previewPage ? "secondary" : "ghost"} className="h-11 w-16 shrink-0 px-1" aria-label={`預覽 PDF 第 ${row.pageNumber} 頁`} onClick={() => setPreviewPage(row.pageNumber)}>第 {row.pageNumber} 頁</Button>
              <Input value={row.title} aria-label={`PDF 第 ${row.pageNumber} 頁標題`} placeholder="未辨識，請參照原圖補填" maxLength={300} className="h-11 min-w-0 text-base sm:text-sm" onFocus={() => setPreviewPage(row.pageNumber)} onChange={event => setRows(current => current.map(item => item.pageNumber === row.pageNumber ? { ...item, title: event.target.value } : item))} />
            </div>)}
          </div>
        </div>
      </div> : <div className="flex min-h-20 flex-1 items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm text-muted-foreground">選取電路圖 PDF，讀取每一頁右下角的 Title／標題欄。</div>}
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t pt-3">
        <span className="mr-auto text-xs text-muted-foreground">{rows.length ? "套用後，請按「儲存頁數進度」。空白辨識不蓋舊標題，較短 PDF 保留既有頁面。" : "檔案頁數超過上限時會停止，不會截斷頁面。"}</span>
        <Button type="button" variant="outline" className="h-11" onClick={() => close(false)}>取消</Button>
        <Button type="button" className="h-11" disabled={!rows.length || busy} onClick={() => { onApply(rows.map(({ pageNumber, title }) => ({ pageNumber, title }))); close(false); }}>套用 {rows.length || ""} 頁</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
