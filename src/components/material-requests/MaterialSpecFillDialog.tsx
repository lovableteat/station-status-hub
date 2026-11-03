import { useEffect, useId, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { Check, Copy, Download, FileText, ImagePlus, Loader2, ScanText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { MaterialWorkbookRecord } from "./materialRequestUtils";
import { getMaterialSpecDocuments } from "./materialAttachments";
import { downloadBlob } from "./materialRequestExport";
import { createSpecFillPhotosWorkbook } from "./materialSpecFillExport";
import { specFillTablesHtml, specFillTablesTsv, type SpecFillTable, type SpecFillSource } from "./materialSpecFill";
import { analyzeSpecFillPhotos, canReadSpecForFill, downloadSpecForFill, loadSpecFillModels, SPEC_FILL_ACCEPT, SPEC_FILL_MAX_BYTES, SPEC_FILL_MAX_PHOTOS, type SpecFillInput, type SpecFillModel } from "./materialSpecFillService";

type FormPhoto = { id: string; file: File };
function FormPhotoPreview({ photo, index, busy, onRemove, onPreview }: {
  photo: FormPhoto; index: number; busy: boolean; onRemove: () => void; onPreview: (name: string, url: string) => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo.file); setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo.file]);
  return <figure className="spec-fill-photo-card" data-testid="spec-fill-photo-preview">
    <button type="button" className="spec-fill-photo-thumbnail" disabled={busy || !url} aria-label={`預覽第 ${index + 1} 張照片：${photo.file.name}`} onClick={() => onPreview(photo.file.name, url)}>{url && <img src={url} alt={`第 ${index + 1} 張表格照片：${photo.file.name}`} />}</button>
    <figcaption><span className="min-w-0 flex-1"><strong className="block text-xs">第 {index + 1} 張</strong><span className="block truncate text-xs text-muted-foreground" title={photo.file.name}>{photo.file.name}</span></span><Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" disabled={busy} aria-label={`移除第 ${index + 1} 張照片：${photo.file.name}`} onClick={onRemove}><X className="h-4 w-4" /></Button></figcaption>
  </figure>;
}

export function MaterialSpecFillDialog({ records, workspaceName, open, onOpenChange }: {
  records: MaterialWorkbookRecord[]; workspaceName: string; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const uid = useId();
  const [partId, setPartId] = useState(records[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const part = records.find(record => record.id === partId);
  const docs = useMemo(() => part ? getMaterialSpecDocuments(part) : [], [part]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [photos, setPhotos] = useState<FormPhoto[]>([]);
  const photosRef = useRef<FormPhoto[]>([]);
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null);
  const [localSpecs, setLocalSpecs] = useState<File[]>([]);
  const [models, setModels] = useState<SpecFillModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState("");
  const [loadKey, setLoadKey] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<SpecFillTable[] | null>(null);
  const [sources, setSources] = useState<SpecFillSource[]>([]);
  const [showInputs, setShowInputs] = useState(true);
  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const alive = useRef(true);
  const photoInput = useRef<HTMLInputElement>(null);
  const specInput = useRef<HTMLInputElement>(null);
  const model = models.find(item => item.id === modelId);
  const inputCount = selectedPaths.length + localSpecs.length;
  const choices = useMemo(() => {
    const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return records.filter(record => tokens.every(token => `${record.refDes} ${record.manufacturerPartNumber} ${record.manufacturer} ${record.name}`.toLocaleLowerCase().includes(token)));
  }, [query, records]);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; active.current?.abort(); };
  }, []);
  useEffect(() => { if (!open) { active.current?.abort(); active.current = null; setBusy(false); setResult(null); setPreview(null); setShowInputs(true); } }, [open]);
  useEffect(() => {
    let current = true;
    setModelsLoading(true); setModelsError(""); setModels([]); setModelId("");
    void loadSpecFillModels().then(items => { if (current) { setModels(items); setModelId(items[0]?.id ?? ""); } }).catch(() => { if (current) setModelsError("無法載入 AI 服務，請確認權限或重試。"); }).finally(() => { if (current) setModelsLoading(false); });
    return () => { current = false; };
  }, [loadKey]);
  const invalidate = () => { generation.current++; active.current?.abort(); active.current = null; setBusy(false); setResult(null); setSources([]); setError(""); setNotice(""); setShowInputs(true); };
  const replacePhotos = (next: FormPhoto[]) => { photosRef.current = next; setPhotos(next); setPreview(null); };
  const choosePart = (id: string) => { invalidate(); setPartId(id); setSelectedPaths([]); setLocalSpecs([]); };
  const choosePhotos = (files: File[]) => {
    if (busy || !files.length) return;
    const added: FormPhoto[] = [], failures: string[] = [];
    for (const [index, original] of files.entries()) {
      const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as Record<string, string>)[original.type];
      const file = !original.name && extension ? new File([original], `表格照片-${Date.now()}-${index + 1}.${extension}`, { type: original.type }) : original;
      if (!/\.(png|jpe?g|webp)$/i.test(file.name)) failures.push(`${file.name || "未命名檔案"}（請用 PNG、JPG 或 WEBP）`);
      else if (!file.size || file.size > SPEC_FILL_MAX_BYTES) failures.push(`${file.name}（空檔或超過 18 MB）`);
      else if (photosRef.current.length + added.length >= SPEC_FILL_MAX_PHOTOS) failures.push(`${file.name}（本次最多 ${SPEC_FILL_MAX_PHOTOS} 張，可分批分析）`);
      else added.push({ id: crypto.randomUUID(), file });
    }
    if (added.length) { invalidate(); replacePhotos([...photosRef.current, ...added]); }
    if (failures.length) setError(`未加入：${failures.join("、")}。其餘照片與原有照片已保留，不需壓縮。`);
  };
  const pastePhoto = (event: ClipboardEvent) => {
    const images = event.clipboardData.files.length ? Array.from(event.clipboardData.files) : Array.from(event.clipboardData.items).filter(item => item.kind === "file").flatMap(item => { const file = item.getAsFile(); return file ? [file] : []; });
    if (!images.length) return;
    event.preventDefault(); choosePhotos(images);
  };
  const addSpecs = (files: File[]) => {
    const rejected = files.filter(file => !canReadSpecForFill(file.name) || !file.size || file.size > SPEC_FILL_MAX_BYTES);
    const accepted = files.filter(file => !rejected.includes(file));
    if (!accepted.length) { setError(`無法判讀：${rejected.map(file => file.name).join("、")}。請選 PDF、圖片或文字版 SPEC；原工程附件仍可照常使用。`); return; }
    invalidate(); setLocalSpecs(current => [...current, ...accepted.filter(file => !current.some(old => old.name === file.name && old.size === file.size && old.lastModified === file.lastModified))]);
    if (rejected.length) setError(`未加入：${rejected.map(file => file.name).join("、")}（格式不支援、空檔或超過 18 MB）。其餘檔案已保留。`);
  };
  const analyze = async () => {
    if (active.current || !part || !photos.length || !model || !inputCount) return;
    const request = new AbortController(); active.current = request;
    const stamp = ++generation.current;
    setBusy(true); setResult(null); setShowInputs(true); setPreview(null); setError(""); setNotice("");
    try {
      // Download only explicitly selected attachments belonging to this record.
      const chosen = docs.filter(document => selectedPaths.includes(document.path));
      if (chosen.length !== selectedPaths.length) throw new Error("附件已變更，請重新選擇 SPEC。");
      const total = photos.reduce((sum, photo) => sum + photo.file.size, 0) + chosen.reduce((sum, doc) => sum + doc.size, 0) + localSpecs.reduce((sum, file) => sum + file.size, 0);
      if (total > SPEC_FILL_MAX_BYTES) throw new Error("本次分析合計超過 18 MB，請分次選取相關 SPEC 或頁面，不必壓縮。");
      if (inputCount > 20) throw new Error("本次最多分析 20 份 SPEC，請分次選擇，不必壓縮。");
      const inputs: SpecFillInput[] = [];
      for (const document of chosen) inputs.push({ id: `spec-${inputs.length + 1}`, name: document.name, blob: await downloadSpecForFill(document, request.signal) });
      localSpecs.forEach(file => inputs.push({ id: `spec-${inputs.length + 1}`, name: file.name, blob: file }));
      const answer = await analyzeSpecFillPhotos({ part, photos: photos.map(({ file }, index) => ({ id: `template-${index + 1}`, name: file.name, blob: file })), sources: inputs, model, note, signal: request.signal });
      if (!alive.current || stamp !== generation.current || request.signal.aborted) return;
      setSources(inputs.map(({ id, name }) => ({ id, name }))); setResult(answer); setShowInputs(false);
    } catch (failure) {
      if (alive.current && stamp === generation.current && !request.signal.aborted) setError(failure instanceof Error ? failure.message.replace("正在嘗試其他可用模型。", "請稍後重試，或選擇其他模型。") : "分析失敗，請稍後重試。照片與已選 SPEC 已保留。");
    } finally {
      if (active.current === request) { active.current = null; if (alive.current) setBusy(false); }
    }
  };
  const cancel = () => { generation.current++; active.current?.abort(); active.current = null; setBusy(false); setNotice("已停止分析，照片與 SPEC 選擇已保留。"); };
  const copy = async (tables = result) => {
    if (!tables) return;
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) await navigator.clipboard.write([new ClipboardItem({
        "text/plain": new Blob([specFillTablesTsv(tables)], { type: "text/plain" }),
        "text/html": new Blob([specFillTablesHtml(tables)], { type: "text/html" }),
      })]);
      else await navigator.clipboard.writeText(specFillTablesTsv(tables));
      setNotice(`已複製 ${tables.length} 張表格，可直接貼到 Excel。`);
    }
    catch { setError("無法使用剪貼簿，請下載 Excel，或選取結果文字複製。"); }
  };
  const exportResult = async () => {
    if (!result || !part || exporting) return;
    const stamp = generation.current; setExporting(true); setError("");
    try {
      const workbook = await createSpecFillPhotosWorkbook(result, sources, part.manufacturerPartNumber, model?.label ?? "");
      const data = await workbook.xlsx.writeBuffer();
      if (!alive.current || stamp !== generation.current) return;
      downloadBlob(new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${part.manufacturerPartNumber.replace(/[\\/:*?"<>|]/g, "_")}_依照片填表.xlsx`);
    } catch { if (alive.current && stamp === generation.current) setError("Excel 匯出失敗，請重試或使用複製表格。"); }
    finally { if (alive.current) setExporting(false); }
  };
  return <Dialog open={open} onOpenChange={value => { if (!value) cancel(); onOpenChange(value); }}>
    <DialogContent className="material-spec-fill-dialog flex flex-col overflow-hidden" data-testid="material-spec-fill-dialog">
      <DialogHeader className="shrink-0 pr-12">
        <DialogTitle className="flex items-center gap-2"><ScanText className="h-5 w-5 text-primary" />依照片填表</DialogTitle>
        <DialogDescription className="break-words">{workspaceName} · 從指定料件的 SPEC 找數據，依你貼上的表格填寫</DialogDescription>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain">
        {result && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm"><strong className="break-all">{part?.manufacturerPartNumber}</strong><span className="text-muted-foreground">{part?.manufacturer}</span><Button variant="outline" className="h-9 sm:ml-auto" onClick={() => setShowInputs(value => !value)}>{showInputs ? "收合原圖與 SPEC" : "查看原圖與 SPEC"}</Button></div>}
        {showInputs && <>
          <section className="spec-fill-section">
            <label htmlFor={`${uid}-part-search`} className="spec-fill-heading">1. 指定料件</label>
            <div className="grid gap-2 sm:grid-cols-[minmax(140px,1fr)_minmax(0,2fr)]">
              <Input id={`${uid}-part-search`} aria-label="尋找要填表的料件" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜尋 MPN、位號或廠商" disabled={busy} />
              <select aria-label="指定料件" value={partId} disabled={busy} onChange={event => choosePart(event.target.value)}>
                {!choices.some(record => record.id === partId) && part && <option value={part.id}>{part.manufacturerPartNumber || "未填 MPN"} · {part.refDes}</option>}
                {choices.slice(0, 300).map(record => <option key={record.id} value={record.id}>{record.manufacturerPartNumber || "未填 MPN"} · {record.manufacturer || "未填廠商"} · {record.refDes}</option>)}
              </select>
            </div>
            {!choices.length && <p className="text-xs text-muted-foreground">沒有符合的料件，請調整搜尋。</p>}
            {choices.length > 300 && <p className="text-xs text-muted-foreground">顯示前 300 筆，請輸入 MPN 縮小選擇。</p>}
            <p className="mt-2 break-words text-xs text-muted-foreground">{part?.name} {!part?.manufacturerPartNumber.trim() && <span className="text-amber-300">請先為此料件填寫完整 MPN，才能核對 SPEC。</span>}</p>
          </section>
          <div className="spec-fill-input-grid">
            <section className="spec-fill-section">
              <h3 className="spec-fill-heading">2. 貼上要填的表格照片</h3>
              <input type="file" ref={photoInput} className="sr-only" tabIndex={-1} aria-label="選擇表格照片檔案" accept=".png,.jpg,.jpeg,.webp" multiple disabled={busy} onChange={event => { choosePhotos(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
              <div role="group" tabIndex={0} className={`spec-fill-photo ${photos.length ? "spec-fill-photo--compact" : ""}`} onPaste={event => { if (!busy) pastePhoto(event); }} onDragOver={event => { event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (!busy) choosePhotos(Array.from(event.dataTransfer.files)); }} aria-label="貼上表格照片區" aria-disabled={busy}>
                <ImagePlus className="h-6 w-6 text-primary" /><strong>{photos.length ? "可繼續貼上或拖入多張照片" : "點這個區域，按 Ctrl+V 貼上多張照片"}</strong><span>也可一次拖入或選取多張，依加入順序逐張填表</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><Button variant="outline" className="h-9 px-2 text-xs" disabled={busy || photos.length >= SPEC_FILL_MAX_PHOTOS} onClick={() => photoInput.current?.click()}>{photos.length ? "新增照片" : "選擇照片"}</Button><span className="text-xs text-muted-foreground" role="status">已加入 {photos.length}／{SPEC_FILL_MAX_PHOTOS} 張</span>{photos.length > 0 && <Button variant="ghost" className="ml-auto h-9 px-2 text-xs" disabled={busy} onClick={() => { invalidate(); replacePhotos([]); }}>清除全部照片</Button>}</div>
              {photos.length > 0 && <div className="spec-fill-photo-list" aria-label="已加入的表格照片">{photos.map((photo, index) => <FormPhotoPreview key={photo.id} photo={photo} index={index} busy={busy} onPreview={(name, url) => setPreview({ name, url })} onRemove={() => { invalidate(); replacePhotos(photosRef.current.filter(item => item.id !== photo.id)); }} />)}</div>}
            </section>
            <section className="spec-fill-section" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy) addSpecs(Array.from(event.dataTransfer.files)); }}>
              <div className="mb-2 flex items-center justify-between gap-2"><h3 className="spec-fill-heading mb-0">3. 選擇這顆料的 SPEC</h3><Button variant="outline" className="h-8 px-2 text-xs" disabled={busy} onClick={() => specInput.current?.click()}>從電腦加入</Button></div>
              <input type="file" ref={specInput} className="sr-only" tabIndex={-1} aria-label="選擇本機 SPEC 檔案" accept={SPEC_FILL_ACCEPT} multiple disabled={busy} onChange={event => { addSpecs(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
              <div className="spec-fill-files">
                {!docs.length && !localSpecs.length && <p className="p-3 text-sm text-muted-foreground">這顆料尚無 SPEC。把 PDF、圖片或文字檔拖到這裡，或從電腦加入。</p>}
                {docs.map(document => <label key={document.path} className="spec-fill-file"><input type="checkbox" checked={selectedPaths.includes(document.path)} disabled={busy || !canReadSpecForFill(document.name)} onChange={event => { invalidate(); setSelectedPaths(current => event.target.checked ? [...current, document.path] : current.filter(path => path !== document.path)); }} /><FileText className="h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 break-all">{document.name}{!canReadSpecForFill(document.name) && <small className="block text-muted-foreground">請另選 PDF／圖片版供 AI 判讀</small>}</span></label>)}
                {localSpecs.map((file, index) => <div key={`${file.name}:${index}`} className="spec-fill-file"><Check className="h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 flex-1 break-all">{file.name}<small className="block text-muted-foreground">本次使用，不會上傳到 BOM</small></span><button disabled={busy} className="p-2" aria-label={`移除 ${file.name}`} onClick={() => { invalidate(); setLocalSpecs(current => current.filter((_, i) => i !== index)); }}><X className="h-4 w-4" /></button></div>)}
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">已選 {inputCount} 份。可一次加入多份，不需壓縮。本次分析合計上限 18 MB；原工程附件的上傳與下載不受影響。</p>
            </section>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="spec-fill-heading" htmlFor={`${uid}-model`}>AI 服務</label><select id={`${uid}-model`} className="w-full" value={modelId} disabled={busy || modelsLoading} onChange={event => { invalidate(); setModelId(event.target.value); }}>{!models.length && <option value="">{modelsLoading ? "載入已設定的 AI…" : "沒有可用的 AI 服務"}</option>}{models.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>{!modelsLoading && (!models.length || modelsError) && <p className="mt-1 text-xs text-amber-300">{modelsError || "請管理員在後台設定可讀圖片／PDF 的 AI 模型，並開放目前帳號使用。"}<button className="ml-2 underline" onClick={() => setLoadKey(key => key + 1)}>重新載入</button></p>}</div>
            <div><label className="spec-fill-heading" htmlFor={`${uid}-note`}>補充查找條件（選填）</label><Input id={`${uid}-note`} value={note} maxLength={4000} disabled={busy} onChange={event => { invalidate(); setNote(event.target.value); }} placeholder="例如：只填工作電壓，保留 Min／Typ／Max" /></div>
          </div>
        </>}
        {error && <p role="alert" className="rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
        {result && <section className="space-y-4" aria-label="依照片填表結果">
          <p className="text-sm font-semibold">已完成 {result.length} 張照片的表格</p>
          {result.map((table, tableIndex) => <section key={table.templateId} className="spec-fill-result" aria-label={`第 ${tableIndex + 1} 張填表結果`}>
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><p className="break-all text-xs text-muted-foreground">第 {tableIndex + 1} 張 · {table.templateName}</p><h3 className="font-semibold">{table.title}</h3></div><span className="text-xs text-muted-foreground">{table.rows.length} 列 · {table.columns.length} 欄 · AI 整理，請核對來源</span>{result.length > 1 && <Button variant="outline" className="h-9 text-xs" onClick={() => void copy([table])}>複製這張表格</Button>}</div>
          {table.warnings.map((warning, i) => <p key={i} className="mt-2 text-sm text-amber-300">{warning}</p>)}
          <div className="spec-fill-table-scroll" tabIndex={0} role="region" aria-label={`第 ${tableIndex + 1} 張可複製的填表結果（可左右捲動）`}><table><thead><tr>{table.columns.map((column, i) => <th key={i} scope="col">{column}</th>)}</tr></thead><tbody>{table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className={cell.kind === "missing" ? "text-amber-300" : ""}><div className="whitespace-pre-wrap">{cell.value}</div>{cell.kind === "source" && <details className="mt-1 text-xs text-primary"><summary>{cell.sourceId} · {/^(圖片|文字)$/.test(cell.page ?? "") ? cell.page : `p.${cell.page}`}</summary><p className="mt-2 break-words text-muted-foreground">{sources.find(source => source.id === cell.sourceId)?.name}<br />{cell.quote}</p></details>}{cell.kind === "missing" && <p className="mt-1 text-xs text-muted-foreground">{cell.quote}</p>}</td>)}</tr>)}</tbody></table></div>
          </section>)}
          <div className="mt-2 text-xs text-muted-foreground">{sources.map(source => <p key={source.id} className="break-words">{source.id}：{source.name}</p>)}</div>
        </section>}
      </div>
      <footer className="spec-fill-footer">
        <p className="text-xs leading-5 text-muted-foreground">按開始後，僅將此料件、表格照片與已選 SPEC 傳給所選 AI。結果不會自動寫回 BOM。</p>
        <div className="flex flex-wrap justify-end gap-2">
          {result && <><Button variant="outline" className="h-10" onClick={() => void copy()}><Copy className="h-4 w-4" />{result.length > 1 ? "複製全部表格" : "複製表格"}</Button><Button variant="outline" className="h-10" disabled={exporting} onClick={() => void exportResult()}><Download className="h-4 w-4" />{exporting ? "匯出中…" : "下載 Excel"}</Button></>}
          {busy ? <Button variant="outline" className="h-10" onClick={cancel}><Loader2 className="h-4 w-4 animate-spin" />停止分析</Button> : <Button className="h-10" disabled={!photos.length || !inputCount || !model || !part?.manufacturerPartNumber.trim()} onClick={() => void analyze()}><ScanText className="h-4 w-4" />{result ? "重新分析" : "開始依照片填表"}</Button>}
        </div>
      </footer>
      <Dialog open={Boolean(preview)} onOpenChange={value => { if (!value) setPreview(null); }}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle className="break-all">{preview?.name ?? "照片預覽"}</DialogTitle><DialogDescription>要填寫的表格原圖</DialogDescription></DialogHeader>{preview && <img src={preview.url} alt={preview.name} className="max-h-[75dvh] w-full object-contain" />}</DialogContent></Dialog>
    </DialogContent>
  </Dialog>;
}
