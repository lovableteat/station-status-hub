import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, FileSearch, Loader2, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { SpecFillModel } from "./materialSpecFillService";
import type { PdfPageTitle } from "./bomPagePdfAi";
import { inspectPdfTitlePage, readPdfPageTitles } from "./bomPagePdfAiService";
import "./bomPagePdfAi.css";

export function BomPagePdfAiDialog({ open, onOpenChange, onApply, maxPages }: {
  open: boolean; onOpenChange: (open: boolean) => void; onApply: (pages: PdfPageTitle[]) => void; maxPages: number;
}) {
  const [models, setModels] = useState<SpecFillModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [rows, setRows] = useState<Array<PdfPageTitle & { previewUrl: string }>>([]);
  const [previewPage, setPreviewPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [preview, setPreview] = useState<{ pageNumber: number; url: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [mobileView, setMobileView] = useState("preview");
  const [zoom, setZoom] = useState(1);
  const [viewport, setViewport] = useState<{ height: number; top: number }>();
  const active = useRef<AbortController | null>(null);
  const inspecting = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const selectedRow = useRef<HTMLDivElement>(null);
  const urls = useRef<string[]>([]);
  const previewUrl = useRef("");
  const clearResults = () => { urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current = []; setRows([]); };
  const abort = () => { active.current?.abort(); active.current = null; inspecting.current?.abort(); inspecting.current = null; setBusy(false); setPreparing(false); };

  useEffect(() => {
    if (!open) { abort(); return; }
    if (file && !totalPages) void inspect(file);
    let current = true;
    setLoadingModels(true); setError("");
    void import("./materialSpecFillService").then(module => module.loadSpecFillModels()).then(items => {
      if (current) { setModels(items); setModelId(previous => items.some(item => item.id === previous) ? previous : items[0]?.id ?? ""); }
    }).catch(reason => { if (current) setError(reason instanceof Error ? reason.message : "無法載入 AI 服務。"); })
      .finally(() => { if (current) setLoadingModels(false); });
    return () => { current = false; active.current?.abort(); active.current = null; inspecting.current?.abort(); inspecting.current = null; };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const visual = window.visualViewport;
    const resize = () => { const height = visual?.height || window.innerHeight; if (height) setViewport({ height, top: visual?.offsetTop || 0 }); };
    resize(); window.addEventListener("resize", resize); visual?.addEventListener("resize", resize); visual?.addEventListener("scroll", resize);
    return () => { window.removeEventListener("resize", resize); visual?.removeEventListener("resize", resize); visual?.removeEventListener("scroll", resize); };
  }, [open]);
  useEffect(() => () => { active.current?.abort(); inspecting.current?.abort(); urls.current.forEach(url => URL.revokeObjectURL(url)); if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);
  useEffect(() => { selectedRow.current?.scrollIntoView({ block: "nearest" }); }, [previewPage, rows.length, mobileView]);

  const model = models.find(item => item.id === modelId);
  const selected = rows.find(row => row.pageNumber === previewPage);
  const shownUrl = selected?.previewUrl || (preview?.pageNumber === previewPage ? preview.url : "");
  const missing = rows.filter(row => !row.title.trim()).length;
  const viewportStyle = viewport ? { "--bom-pdf-height": `${viewport.height}px`, "--bom-pdf-top": `${viewport.top}px` } as CSSProperties : undefined;

  async function inspect(next: File, pageNumber = 1) {
    inspecting.current?.abort();
    const controller = new AbortController(); inspecting.current = controller;
    setPreparing(true); setError("");
    try {
      const result = await inspectPdfTitlePage(next, controller.signal, maxPages, pageNumber);
      if (controller.signal.aborted) return;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(result.preview);
      setPreview({ pageNumber: result.pageNumber, url: previewUrl.current }); setTotalPages(result.totalPages);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "無法讀取 PDF，請重新選擇檔案。");
    } finally { if (inspecting.current === controller) { inspecting.current = null; setPreparing(false); } }
  }
  function chooseFile(next: File | null) {
    abort(); clearResults(); setFile(next); setTotalPages(0); setPreview(null); setPreviewPage(1); setPageInput("1"); setZoom(1); setError(""); setMobileView("preview");
    if (previewUrl.current) { URL.revokeObjectURL(previewUrl.current); previewUrl.current = ""; }
    if (next) void inspect(next);
  }
  function goToPage(number: number) {
    if (!Number.isInteger(number) || number < 1 || number > totalPages) { setPageInput(String(previewPage)); return; }
    setPreviewPage(number); setPageInput(String(number)); setZoom(1);
    if (file && !rows.some(row => row.pageNumber === number)) void inspect(file, number);
  }
  const run = async () => {
    if (!file || !model || busy || preparing || !totalPages) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(""); setProgress({ done: 0, total: totalPages });
    try {
      const result = await readPdfPageTitles(file, model, controller.signal, (done, total) => {
        if (!controller.signal.aborted) setProgress({ done, total });
      }, maxPages);
      if (controller.signal.aborted) return;
      clearResults();
      setRows(result.map(row => { const url = URL.createObjectURL(row.preview); urls.current.push(url); return { pageNumber: row.pageNumber, title: row.title, previewUrl: url }; }));
      setPreviewPage(1); setPageInput("1"); setZoom(1); setMobileView("titles");
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "PDF 辨識失敗，沒有套用任何資料。");
    } finally { if (active.current === controller) { active.current = null; setBusy(false); } }
  };
  const close = (next: boolean) => { if (!next) abort(); onOpenChange(next); };

  return <Dialog open={open} onOpenChange={close}>
    <DialogContent hideCloseButton data-testid="bom-page-pdf-ai" className="bom-pdf-dialog" data-compact={viewport ? viewport.height < 620 : false} style={viewportStyle}>
      <header className="bom-pdf-header"><div><DialogTitle><FileSearch aria-hidden="true" />PDF AI</DialogTitle><DialogDescription>先預覽標題截圖，再辨識與核對。原有完成狀態、備註與既有頁面會保留。</DialogDescription></div><Button type="button" variant="ghost" aria-label="關閉 PDF AI" onClick={() => close(false)}><X aria-hidden="true" /></Button></header>
      <div className="bom-pdf-controls">
        <div className="bom-pdf-file"><span>PDF 檔案 · 最多 {maxPages} 頁／50 MB</span><input ref={fileInput} type="file" accept=".pdf,application/pdf" disabled={busy} aria-label="選擇標題辨識 PDF" className="sr-only" onChange={event => { chooseFile(event.target.files?.[0] ?? null); event.target.value = ""; }} /><div><Button type="button" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>{file ? "更換 PDF" : "選擇 PDF"}</Button><div data-testid="bom-pdf-selected-file"><strong title={file?.name}>{file?.name || "尚未選擇 PDF"}</strong><small>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB${totalPages ? ` · 實際 ${totalPages} 頁` : preparing ? " · 讀取頁數與截圖中…" : ""}` : "選取後立即顯示頁數與標題截圖"}</small></div></div></div>
        <label className="bom-pdf-model"><span>AI 服務</span><select aria-label="PDF AI 服務" value={modelId} disabled={busy || loadingModels} onChange={event => setModelId(event.target.value)}>{!models.length && <option value="">{loadingModels ? "載入中…" : "沒有可用的 AI 服務"}</option>}{models.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <Button type="button" className="bom-pdf-recognize" disabled={!file || !model || busy || preparing || loadingModels || !totalPages} onClick={() => void run()}>{busy ? <><Loader2 className="animate-spin" aria-hidden="true" />辨識中</> : "辨識全部頁面"}</Button>
      </div>
      {busy && <div className="bom-pdf-progress" role="status"><span>已辨識 {progress.done} / {progress.total} 頁 · 每批 8 頁</span><Button type="button" variant="outline" onClick={() => { active.current?.abort(); active.current = null; setBusy(false); setError("已取消，未套用任何資料。"); }}>取消辨識</Button></div>}
      {error && <p role="alert" className="bom-pdf-error">{error}</p>}
      <div className="bom-pdf-body">
        <div className="bom-pdf-navigation"><span>{totalPages ? `實際 PDF 共 ${totalPages} 頁` : `支援完整 ${maxPages} 頁 PDF`}</span><div><Button type="button" variant="ghost" aria-label="上一個 PDF 頁面" disabled={previewPage <= 1 || !totalPages || preparing} onClick={() => goToPage(previewPage - 1)}><ChevronLeft aria-hidden="true" /></Button><Input type="number" aria-label="跳至 PDF 頁碼" min={1} max={totalPages || maxPages} value={pageInput} disabled={!totalPages} onChange={event => setPageInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); goToPage(Number(pageInput)); } }} /><span>/ {totalPages || "—"}</span><Button type="button" variant="ghost" aria-label="下一個 PDF 頁面" disabled={previewPage >= totalPages || !totalPages || preparing} onClick={() => goToPage(previewPage + 1)}><ChevronRight aria-hidden="true" /></Button><Button type="button" variant="outline" disabled={!totalPages || preparing} onClick={() => goToPage(Number(pageInput))}>前往頁面</Button></div></div>
        <div className="bom-pdf-mobile-tabs" role="group" aria-label="PDF 預覽檢視"><button type="button" aria-pressed={mobileView === "preview"} onClick={() => setMobileView("preview")}>截圖預覽</button><button type="button" aria-pressed={mobileView === "titles"} onClick={() => setMobileView("titles")}>標題清單{rows.length ? ` ${rows.length}` : ""}</button></div>
        <div className="bom-pdf-workspace" data-mobile-view={mobileView}>
          <section className="bom-pdf-preview" data-testid="bom-pdf-preview" aria-label="標題截圖預覽"><header><strong>第 {previewPage} 頁標題截圖</strong>{shownUrl && <a href={shownUrl} target="_blank" rel="noreferrer"><span className="bom-pdf-desktop-link">放大預覽</span><span className="bom-pdf-mobile-link">右下原圖</span></a>}</header><div className="bom-pdf-preview-scroll">{preparing ? <p role="status">正在產生清晰截圖…</p> : shownUrl ? <img src={shownUrl} alt={`第 ${previewPage} 頁右下角標題原圖`} style={{ width: `${zoom * 100}%` }} /> : <p>{file ? "讀取 PDF 後顯示截圖；尚未送出 AI 辨識。" : "選擇 PDF，即可先看每頁標題截圖。"}</p>}</div><div className="bom-pdf-zoom"><Button type="button" variant="ghost" aria-label="縮小截圖" disabled={!shownUrl || zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - .5))}><Minus aria-hidden="true" /></Button><Button type="button" variant="ghost" disabled={!shownUrl} onClick={() => setZoom(1)}>符合寬度</Button><Button type="button" variant="ghost" aria-label="放大截圖" disabled={!shownUrl || zoom >= 4} onClick={() => setZoom(value => Math.min(4, value + .5))}><Plus aria-hidden="true" /></Button><span>{Math.round(zoom * 100)}%</span></div></section>
          <section className="bom-pdf-titles"><header><strong>逐頁標題</strong><span>{rows.length ? missing ? `${missing} 頁需補填` : `${rows.length} 頁已辨識` : "辨識後可逐頁修正"}</span></header><div className="bom-pdf-title-list" data-testid="bom-pdf-title-list">{rows.length ? rows.map(row => <div key={row.pageNumber} ref={row.pageNumber === previewPage ? selectedRow : undefined} data-selected={row.pageNumber === previewPage} onClick={() => goToPage(row.pageNumber)}><Button type="button" variant="ghost" aria-label={`預覽 PDF 第 ${row.pageNumber} 頁`} aria-pressed={row.pageNumber === previewPage} onClick={event => { event.stopPropagation(); goToPage(row.pageNumber); setMobileView("preview"); }}>{`第 ${row.pageNumber} 頁`}</Button><Input value={row.title} aria-label={`PDF 第 ${row.pageNumber} 頁標題`} placeholder="未辨識，請參照截圖補填" maxLength={300} onFocus={() => goToPage(row.pageNumber)} onChange={event => setRows(current => current.map(item => item.pageNumber === row.pageNumber ? { ...item, title: event.target.value } : item))} /></div>) : <p className="bom-pdf-empty">{busy ? "正在逐批辨識，完成後會列出全部頁面。" : "確認截圖與 AI 服務後，按「辨識全部頁面」。辨識結果不會直接寫入 BOM。"}</p>}</div></section>
        </div>
      </div>
      <footer className="bom-pdf-footer"><p>{rows.length ? "套用後請按「儲存頁數進度」。空白標題不覆蓋舊值，較短 PDF 保留既有頁面。" : `PDF 實際頁數與上限分開顯示，最多處理 ${maxPages} 頁，不會只截取前幾頁。`}</p><div><Button type="button" variant="outline" onClick={() => close(false)}>取消</Button><Button type="button" disabled={!rows.length || busy || preparing} onClick={() => { onApply(rows.map(({ pageNumber, title }) => ({ pageNumber, title }))); close(false); }}>套用 {rows.length || ""} 頁</Button></div></footer>
    </DialogContent>
  </Dialog>;
}
