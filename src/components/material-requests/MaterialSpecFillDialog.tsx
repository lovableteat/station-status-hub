import { useEffect, useId, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { ArrowLeft, Check, Copy, Download, FileSearch, FileText, ImagePlus, Loader2, MessageSquare, ScanText, Send, Table2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { MaterialWorkbookRecord } from "./materialRequestUtils";
import { getMaterialSpecDocuments } from "./materialAttachments";
import { downloadBlob } from "./materialRequestExport";
import { createSpecFillPhotosWorkbook } from "./materialSpecFillExport";
import { specFillTablesHtml, specFillTablesTsv, type SpecFillTable, type SpecFillSource, type SpecFillTurn, type SpecFillCell, getSpecFillReviewSummary } from "./materialSpecFill";
import { askSpecFillQuestion, analyzeSpecFillConversation, canReadSpecForFill, downloadSpecForFill, loadSpecFillModels, SPEC_FILL_ACCEPT, SPEC_FILL_MAX_BYTES, SPEC_FILL_MAX_PHOTOS, type SpecFillInput, type SpecFillModel, type SpecFillPrecision } from "./materialSpecFillService";

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
  const [precision, setPrecision] = useState<SpecFillPrecision>("high");
  const [view, setView] = useState<"table" | "conversation">("table");
  const [evidence, setEvidence] = useState<SpecFillCell | null>(null);
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
  const [turns, setTurns] = useState<Array<SpecFillTurn & { sources: SpecFillSource[]; warnings: string[]; modelLabel?: string; citations?: Array<{sourceId: string; page: string; quote: string}> }>>([]);
  const [question, setQuestion] = useState("");
  const [selectedTurn, setSelectedTurn] = useState(0);
  const [selectedTable, setSelectedTable] = useState("");
  const [showEvidence, setShowEvidence] = useState(false);
  const preparedSources = useRef<SpecFillInput[] | null>(null);
  const sourceWarnings = useRef<string[]>([]);
  const conversationScroll = useRef<HTMLElement>(null);
  const workspaceScroll = useRef<HTMLDivElement>(null);
  const [showInputs, setShowInputs] = useState(true);
  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const alive = useRef(true);
  const photoInput = useRef<HTMLInputElement>(null);
  const specInput = useRef<HTMLInputElement>(null);
  const model = models.find(item => item.id === modelId);
  const review = getSpecFillReviewSummary(result ?? []);
  const inputCount = selectedPaths.length + localSpecs.length;
  const canAnalyze = Boolean(part?.manufacturerPartNumber.trim() && inputCount && model && !busy);
  const choices = useMemo(() => {
    const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return records.filter(record => tokens.every(token => `${record.refDes} ${record.manufacturerPartNumber} ${record.manufacturer} ${record.name}`.toLocaleLowerCase().includes(token)));
  }, [query, records]);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; active.current?.abort(); };
  }, []);
  useEffect(() => {
    const scroller = workspaceScroll.current;
    if (!scroller || !open) return;
    scroller.scrollTop = view === "conversation" && !showInputs ? scroller.scrollHeight : 0;
  }, [turns.length, view, showInputs, open]);
  useEffect(() => { if (!open) { generation.current++; active.current?.abort(); active.current = null; setBusy(false); setPreview(null); setEvidence(null); } }, [open]);
  useEffect(() => {
    let current = true;
    setModelsLoading(true); setModelsError(""); setModels([]); setModelId("");
    void loadSpecFillModels().then(items => { if (current) { setModels(items); setModelId(items[0]?.id ?? ""); } }).catch(() => { if (current) setModelsError("無法載入 AI 服務，請確認權限或重試。"); }).finally(() => { if (current) setModelsLoading(false); });
    return () => { current = false; };
  }, [loadKey]);
  const invalidate = () => { generation.current++; active.current?.abort(); active.current = null; setBusy(false); setResult(null); setTurns([]); setQuestion(""); preparedSources.current = null; sourceWarnings.current = []; setSources([]); setError(""); setNotice(""); setShowInputs(true); setEvidence(null); };
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
  const analyze = async (followup = false) => {
    if (active.current || !part || !model || !inputCount || (followup ? !question.trim() : !photos.length)) return;
    const request = new AbortController(); active.current = request;
    const stamp = ++generation.current;
    const asked = question.trim() || note.trim() || "依照片表格，從指定料件 SPEC 填寫並列出來源。";
    setBusy(true); setPreview(null); setError(""); setNotice("");
    try {
      // Download only explicitly selected attachments belonging to this record.
      const chosen = docs.filter(document => selectedPaths.includes(document.path));
      if (chosen.length !== selectedPaths.length) throw new Error("附件已變更，請重新選擇 SPEC。");
      const total = photos.reduce((sum, photo) => sum + photo.file.size, 0) + chosen.reduce((sum, doc) => sum + doc.size, 0) + localSpecs.reduce((sum, file) => sum + file.size, 0);
      if (total > SPEC_FILL_MAX_BYTES) throw new Error("本次分析合計超過 18 MB，請分次選取相關 SPEC 或頁面，不必壓縮。");
      if (inputCount > 20) throw new Error("本次最多分析 20 份 SPEC，請分次選擇，不必壓縮。");
      const inputs: SpecFillInput[] = followup && preparedSources.current ? [...preparedSources.current] : [];
      if (!inputs.length) {
        for (const document of chosen) inputs.push({ id: `spec-${inputs.length + 1}`, name: document.name, blob: await downloadSpecForFill(document, request.signal) });
        localSpecs.forEach(file => inputs.push({ id: `spec-${inputs.length + 1}`, name: file.name, blob: file }));
      }
      const runner = followup ? askSpecFillQuestion : analyzeSpecFillConversation;
      const answer = await runner({ part, precision, photos: photos.map(({ file }, index) => ({ id: `template-${index + 1}`, name: file.name, blob: file })), sources: inputs, model, note, question: asked, history: turns.map(({ question, reply, tables }) => ({ question, reply, tables })), signal: request.signal });
      if (!alive.current || stamp !== generation.current || request.signal.aborted) return;
      preparedSources.current = answer.preparedSources;
      sourceWarnings.current = [...new Set([...sourceWarnings.current, ...answer.warnings])];
      const turn = { question: asked, reply: answer.reply, tables: answer.tables, sources: answer.sources, warnings: sourceWarnings.current, modelLabel: model.label, citations: "citations" in answer ? answer.citations : [] };
      setTurns(current => [...current, turn]);
      setSources(answer.sources); if (answer.tables.length) { setSelectedTurn(turns.length); setResult(answer.tables); setSelectedTable(answer.tables[0]?.templateId ?? ""); setView("table"); } else setView("conversation"); setQuestion(""); setShowInputs(false);
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
      const workbook = await createSpecFillPhotosWorkbook(result, sources, part.manufacturerPartNumber, turns[selectedTurn]?.modelLabel ?? model?.label ?? "");
      const data = await workbook.xlsx.writeBuffer();
      if (!alive.current || stamp !== generation.current) return;
      downloadBlob(new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${part.manufacturerPartNumber.replace(/[\\/:*?"<>|]/g, "_")}_依照片填表.xlsx`);
    } catch { if (alive.current && stamp === generation.current) setError("Excel 匯出失敗，請重試或使用複製表格。"); }
    finally { if (alive.current) setExporting(false); }
  };
  return <Dialog open={open} onOpenChange={value => { if (!value && active.current) cancel(); onOpenChange(value); }}>
    <DialogContent className="material-spec-fill-dialog flex flex-col overflow-hidden" data-testid="material-spec-fill-dialog" hideCloseButton>
      <DialogHeader className="spec-fill-header">
        <Button type="button" variant="ghost" className="spec-fill-back" onClick={() => { if (active.current) cancel(); onOpenChange(false); }}><ArrowLeft className="h-4 w-4" />返回待處理料</Button>
        <div className="spec-fill-title-row"><div><DialogTitle>依照片填表</DialogTitle><DialogDescription>{workspaceName}</DialogDescription></div><div className="spec-fill-part-identity"><strong>{part?.manufacturerPartNumber || "請指定料件"}</strong><span>{part?.manufacturer || "尚未填寫廠商"}</span></div></div>
      </DialogHeader>
      <div className="spec-fill-toolbar">
        <label className="spec-fill-model-label" htmlFor={`${uid}-model`}>AI 模型<select id={`${uid}-model`} value={modelId} disabled={busy || modelsLoading} onChange={event => setModelId(event.target.value)}>{!models.length && <option value="">{modelsLoading ? "載入 AI 服務…" : "沒有可用的 AI 服務"}</option>}{models.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label htmlFor={`${uid}-precision`}>判讀模式<select id={`${uid}-precision`} value={precision} disabled={busy} onChange={event => setPrecision(event.target.value as SpecFillPrecision)}><option value="high">精細判讀（較慢）</option><option value="standard">標準判讀</option></select></label>
        <Button variant="outline" aria-expanded={showInputs} className="h-10" onClick={() => setShowInputs(value => !value)}>{showInputs ? "收合照片與 SPEC" : "照片與 SPEC"}<span className="spec-fill-count">{photos.length}／{inputCount}</span></Button>
        {turns.length > 0 && <div className="spec-fill-view-switch" role="group" aria-label="結果檢視"><Button variant="ghost" aria-pressed={view === "table"} disabled={!result} onClick={() => setView("table")}><Table2 className="h-4 w-4" />表格結果</Button><Button variant="ghost" aria-pressed={view === "conversation"} onClick={() => setView("conversation")}><MessageSquare className="h-4 w-4" />對話 {turns.length}</Button></div>}
      </div>
      {!modelsLoading && (!models.length || modelsError) && <p className="spec-fill-inline-warning">{modelsError || "請管理員設定可讀圖片／PDF 的 AI 服務，並開放目前帳號使用。"}<button className="ml-2 underline" onClick={() => setLoadKey(key => key + 1)}>重新載入</button></p>}
      <div ref={workspaceScroll} className="spec-fill-workspace">
        {showInputs && <div className="spec-fill-setup">
          <section className="spec-fill-part-picker">
            <label htmlFor={`${uid}-part-search`} className="spec-fill-heading">指定料件</label>
            <div className="spec-fill-part-fields"><Input id={`${uid}-part-search`} aria-label="尋找要填表的料件" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜尋 MPN、位號或廠商" disabled={busy} /><select aria-label="指定料件" value={partId} disabled={busy} onChange={event => choosePart(event.target.value)}>{!choices.some(record => record.id === partId) && part && <option value={part.id}>{part.manufacturerPartNumber || "未填 MPN"} · {part.refDes}</option>}{choices.slice(0, 300).map(record => <option key={record.id} value={record.id}>{record.manufacturerPartNumber || "未填 MPN"} · {record.manufacturer || "未填廠商"} · {record.refDes}</option>)}</select></div>
            {!choices.length && <p className="spec-fill-help">沒有符合的料件，請調整搜尋。</p>}{choices.length > 300 && <p className="spec-fill-help">顯示前 300 筆，請輸入 MPN 縮小選擇。</p>}
            <p className="spec-fill-help">{part?.name}{!part?.manufacturerPartNumber.trim() && <span className="text-amber-300"> 請先填寫完整 MPN，才能核對 SPEC。</span>}</p>
          </section>
          <div className="spec-fill-input-grid">
            <section className="spec-fill-section">
              <div className="spec-fill-section-title"><h3>要填的表格照片 <span>{photos.length}／{SPEC_FILL_MAX_PHOTOS}</span></h3><Button variant="outline" className="h-9 px-3" disabled={busy || photos.length >= SPEC_FILL_MAX_PHOTOS} onClick={() => photoInput.current?.click()}><ImagePlus className="h-4 w-4" />{photos.length ? "新增照片" : "選擇照片"}</Button></div>
              <input type="file" ref={photoInput} className="sr-only" tabIndex={-1} aria-label="選擇表格照片檔案" accept=".png,.jpg,.jpeg,.webp" multiple disabled={busy} onChange={event => { choosePhotos(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
              <div role="group" tabIndex={0} className={`spec-fill-photo ${photos.length ? "spec-fill-photo--compact" : ""}`} onPaste={event => { if (!busy) pastePhoto(event); }} onDragOver={event => { event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (!busy) choosePhotos(Array.from(event.dataTransfer.files)); }} aria-label="貼上表格照片區" aria-disabled={busy}><ImagePlus className="h-5 w-5 text-primary" /><strong>貼上或拖入多張表格照片</strong><span>點這裡按 Ctrl+V；照片只定義欄位，數據從 SPEC 查找。</span></div>
              {photos.length > 0 && <><div className="spec-fill-photo-list" aria-label="已加入的表格照片">{photos.map((photo, index) => <FormPhotoPreview key={photo.id} photo={photo} index={index} busy={busy} onPreview={(name, url) => setPreview({ name, url })} onRemove={() => { invalidate(); replacePhotos(photosRef.current.filter(item => item.id !== photo.id)); }} />)}</div><Button variant="ghost" className="mt-1 h-8 px-2 text-xs" disabled={busy} onClick={() => { invalidate(); replacePhotos([]); }}>清除全部照片</Button></>}
            </section>
            <section className="spec-fill-section" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy) addSpecs(Array.from(event.dataTransfer.files)); }}>
              <div className="spec-fill-section-title"><h3>SPEC 來源 <span>已選 {inputCount} 份</span></h3><Button variant="outline" className="h-9 px-3" disabled={busy} onClick={() => specInput.current?.click()}>從電腦加入</Button></div>
              <input type="file" ref={specInput} className="sr-only" tabIndex={-1} aria-label="選擇本機 SPEC 檔案" accept={SPEC_FILL_ACCEPT} multiple disabled={busy} onChange={event => { addSpecs(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
              <div className="spec-fill-files">{!docs.length && !localSpecs.length && <p className="p-3 text-sm text-muted-foreground">選取此料件附件，或拖入 PDF、圖片、文字、RAR、STEP。</p>}{docs.map(document => <label key={document.path} className="spec-fill-file"><input type="checkbox" checked={selectedPaths.includes(document.path)} disabled={busy || !canReadSpecForFill(document.name)} onChange={event => { invalidate(); setSelectedPaths(current => event.target.checked ? [...current, document.path] : current.filter(path => path !== document.path)); }} /><FileText className="h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 break-all">{document.name}{!canReadSpecForFill(document.name) && <small className="block text-muted-foreground">請另選 PDF／圖片版供 AI 判讀</small>}</span></label>)}{localSpecs.map((file, index) => <div key={`${file.name}:${index}`} className="spec-fill-file"><Check className="h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 flex-1 break-all">{file.name}<small className="block text-muted-foreground">本次使用，不寫入 BOM</small></span><Button variant="ghost" size="icon" disabled={busy} aria-label={`移除 ${file.name}`} onClick={() => { invalidate(); setLocalSpecs(current => current.filter((_, i) => i !== index)); }}><X className="h-4 w-4" /></Button></div>)}</div>
              <p className="spec-fill-help">可多檔加入，不需壓縮。合計及解壓後上限 18 MB／20 份；STEP 外框不能作為電氣規格或公差。</p>
            </section>
          </div>
          <label className="spec-fill-note" htmlFor={`${uid}-note`}>填表條件（選填）<Input id={`${uid}-note`} value={note} maxLength={4000} disabled={busy} onChange={event => { invalidate(); setNote(event.target.value); }} placeholder="例如：保留 Min／Typ／Max、單位與量測條件" /></label>
        </div>}
        {error && <p role="alert" className="spec-fill-inline-error">{error}</p>}{notice && <p role="status" className="spec-fill-notice">{notice}</p>}
        {busy && <div className="spec-fill-busy" role="status"><Loader2 className="h-4 w-4 animate-spin" /><span>{precision === "high" ? "正在精細判讀照片與 SPEC…" : "正在讀取所選照片與 SPEC…"} 完成前可停止，原有結果會保留。</span></div>}
        {result && <section className="spec-fill-results" aria-label="依照片填表結果" hidden={view !== "table"}>
          <div className="spec-fill-results-toolbar"><div><strong>第 {selectedTurn + 1} 次結果</strong><p>{result.length} 張表格 · {review.sourced} 格列有來源 · <span className={review.missing ? "text-amber-300" : ""}>{review.missing} 格待確認</span></p></div><label><input type="checkbox" checked={showEvidence} onChange={event => setShowEvidence(event.target.checked)} />表格顯示來源原文</label><Button variant="outline" disabled={busy} className="h-9" onClick={() => { setShowInputs(true); setView("table"); }}>調整照片與條件</Button></div>
          {result.length > 1 && <div className="spec-fill-table-tabs" role="group" aria-label="選擇結果表格">{result.map((table, i) => <Button key={table.templateId} variant="ghost" aria-pressed={selectedTable === table.templateId} onClick={() => setSelectedTable(table.templateId)}>第 {i + 1} 張 · {table.title}</Button>)}</div>}
          {result.map((table, tableIndex) => table.templateId !== selectedTable ? null : <section key={table.templateId} className="spec-fill-result" aria-label={`第 ${tableIndex + 1} 張填表結果`}><div className="spec-fill-table-title"><h3>{table.title}</h3><span>{table.rows.length} 列 × {table.columns.length} 欄</span><Button variant="ghost" className="h-8 text-xs" onClick={() => void copy([table])}>複製這張表格</Button></div>{table.warnings.length > 0 && <ul className="spec-fill-warnings">{table.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
          <div className="spec-fill-table-scroll" tabIndex={0} role="region" aria-label={`第 ${tableIndex + 1} 張可複製的填表結果（可左右捲動）`}><table style={{ minWidth: Math.max(640, table.columns.length * 120) }}><thead><tr>{table.columns.map((column, i) => <th key={i} scope="col">{column}</th>)}</tr></thead><tbody>{table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} data-cell-kind={cell.kind}><div className="spec-fill-cell-value">{cell.value}</div>{cell.kind === "source" && <><button type="button" className="spec-fill-citation" aria-label={`查看來源：第 ${i + 1} 列 ${table.columns[j]}`} onClick={() => setEvidence(cell)}><FileSearch className="h-3.5 w-3.5" />{sources.find(source => source.id === cell.sourceId)?.name} · {/^(圖片|文字|模型)$/.test(cell.page ?? "") ? cell.page : `p.${cell.page}`}</button>{showEvidence && <p className="spec-fill-cell-quote">{cell.quote}</p>}</>}{cell.kind === "missing" && <p className="spec-fill-cell-quote">{cell.quote || "所選 SPEC 未提供，請補充資料。"}</p>}</td>)}</tr>)}</tbody></table></div></section>)}
          <p className="spec-fill-help">來源標示由 AI 擷取，請點選查核原文；待確認的欄位不會補造數值。</p>
        </section>}
        {turns.length > 0 && <section ref={conversationScroll} className="spec-fill-conversation" aria-label="填表對話紀錄" hidden={view !== "conversation"}><div className="spec-fill-conversation-heading"><h3>對話紀錄</h3>{!busy && <Button variant="ghost" onClick={invalidate}>重新開始對話</Button>}</div>{turns.map((turn, index) => <article key={index} className="spec-fill-turn"><div className="spec-fill-question"><span>你 · {index + 1}</span><p>{turn.question}</p></div><div className="spec-fill-answer"><span>AI · {turn.modelLabel}</span><p>{turn.reply}</p>{turn.citations?.map((citation, citationIndex) => <button key={citationIndex} type="button" className="spec-fill-citation" onClick={() => setEvidence({ kind: "source", value: "回覆引用來源", ...citation })}><FileSearch className="h-3.5 w-3.5" />{turn.sources.find(source => source.id === citation.sourceId)?.name} · {citation.page}</button>)}{turn.warnings.length > 0 && <ul className="spec-fill-warnings">{turn.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>}{turn.tables.length > 0 && <Button variant="outline" className="mt-3 h-9" aria-pressed={selectedTurn === index} disabled={busy} onClick={() => { setSelectedTurn(index); setResult(turn.tables); setSources(turn.sources); setSelectedTable(turn.tables[0]?.templateId ?? ""); setView("table"); }}>查看第 {index + 1} 次結果</Button>}</div></article>)}</section>}
      </div>
      <div className="spec-fill-composer"><label htmlFor={`${uid}-followup`} className="sr-only">接續提問</label><Textarea id={`${uid}-followup`} aria-label="接續提問" value={question} maxLength={4000} disabled={busy} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void analyze(true); } }} placeholder={photos.length ? "說明要填的內容，或追問數值、單位及來源…" : "也可先選 SPEC，直接詢問這顆料的規格…"} /><Button disabled={!canAnalyze || !question.trim()} onClick={() => void analyze(true)}><Send className="h-4 w-4" />{turns.length ? "送出追問" : "送出問題"}</Button></div>
      <footer className="spec-fill-footer"><p>{photos.length} 張照片 · {inputCount} 份 SPEC · 結果不自動寫入 BOM</p><div className="spec-fill-footer-actions">{result && <><Button variant="outline" onClick={() => void copy()}><Copy className="h-4 w-4" />{result.length > 1 ? "複製全部表格" : "複製表格"}</Button><Button variant="outline" disabled={exporting} onClick={() => void exportResult()}><Download className="h-4 w-4" />{exporting ? "匯出中…" : "下載 Excel"}</Button></>}{busy ? <Button variant="outline" onClick={cancel}><Loader2 className="h-4 w-4 animate-spin" />停止分析</Button> : <Button disabled={!photos.length || !canAnalyze} onClick={() => void analyze()}><ScanText className="h-4 w-4" />{result ? question.trim() ? "依問題更新表格" : "重新填表" : "開始依照片填表"}</Button>}</div></footer>
      <Dialog open={Boolean(preview)} onOpenChange={value => { if (!value) setPreview(null); }}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle className="break-all">{preview?.name ?? "照片預覽"}</DialogTitle><DialogDescription>要填寫的表格原圖</DialogDescription></DialogHeader>{preview && <img src={preview.url} alt={preview.name} className="max-h-[75dvh] w-full object-contain" />}</DialogContent></Dialog>
      <Dialog open={Boolean(evidence)} onOpenChange={value => { if (!value) setEvidence(null); }}><DialogContent className="spec-fill-source-dialog"><DialogHeader><DialogTitle>查核 SPEC 來源</DialogTitle><DialogDescription>{sources.find(source => source.id === evidence?.sourceId)?.name} · {evidence?.page}</DialogDescription></DialogHeader><div className="spec-fill-evidence-value">{evidence?.value}</div><h3 className="text-sm font-semibold">AI 引用原文</h3><blockquote className="whitespace-pre-wrap break-words text-sm leading-7">{evidence?.quote}</blockquote><p className="text-xs text-muted-foreground">請核對型號、單位與條件；有引用原文不等於數值已經過人工驗證。</p><Button variant="outline" onClick={() => { const file = preparedSources.current?.find(source => source.id === evidence?.sourceId); if (file) downloadBlob(file.blob, file.name); }}><Download className="h-4 w-4" />下載來源原檔</Button></DialogContent></Dialog>
    </DialogContent>
  </Dialog>;
}
