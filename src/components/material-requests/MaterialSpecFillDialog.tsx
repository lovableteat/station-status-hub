import { useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronsUpDown, Copy, Download, FileSearch, FileText, ImagePlus, Loader2, MessageSquare, ScanText, Send, Settings2, Table2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import type { MaterialWorkbookRecord } from "./materialRequestUtils";
import { getMaterialSpecDocuments } from "./materialAttachments";
import { downloadBlob } from "./materialRequestExport";
import { createSpecFillPhotosWorkbook } from "./materialSpecFillExport";
import { specFillTablesHtml, specFillTablesTsv, type SpecFillTable, type SpecFillSource, type SpecFillTurn, type SpecFillCell, getSpecFillReviewSummary } from "./materialSpecFill";
import { askSpecFillQuestion, analyzeSpecFillConversation, canReadSpecForFill, downloadSpecForFill, loadSpecFillModels, SPEC_FILL_ACCEPT, SPEC_FILL_MAX_BYTES, SPEC_FILL_MAX_PHOTOS, type SpecFillInput, type SpecFillModel, type SpecFillPrecision } from "./materialSpecFillService";

type FormPhoto = { id: string; file: File };
type SpecFillMode = "photo" | "ask";
type RunInputs = { partId: string; photos: FormPhoto[]; selectedPaths: string[]; localSpecs: File[]; note: string; mode: SpecFillMode };
function FormPhotoPreview({ photo, index, busy, onRemove, onPreview }: {
  photo: FormPhoto; index: number; busy: boolean; onRemove?: () => void; onPreview: (name: string, url: string) => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo.file); setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo.file]);
  return <figure className="spec-fill-photo-card" data-testid="spec-fill-photo-preview">
    <button type="button" className="spec-fill-photo-thumbnail" disabled={busy || !url} aria-label={`預覽第 ${index + 1} 張照片：${photo.file.name}`} onClick={() => onPreview(photo.file.name, url)}>{url && <img src={url} alt={photo.file.name} />}</button>
    <figcaption><span className="min-w-0 flex-1"><strong className="block text-xs">第 {index + 1} 張</strong><span className="block truncate text-xs text-muted-foreground" title={photo.file.name}>{photo.file.name}</span></span>{onRemove && <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" disabled={busy} aria-label={`移除第 ${index + 1} 張照片：${photo.file.name}`} onClick={onRemove}><X className="h-4 w-4" /></Button>}</figcaption>
  </figure>;
}

function pastedFiles(event: ClipboardEvent) {
  const { files, items } = event.clipboardData;
  return files.length ? Array.from(files) : Array.from(items).flatMap(item => {
    const file = item.kind === "file" ? item.getAsFile() : null;
    return file ? [file] : [];
  });
}

function QuestionComposer({ label, placeholder, question, images, busy, onChange, onImages, onRemove, onPreview, onSubmit, children }: {
  label: string; placeholder: string; question: string; images: FormPhoto[]; busy: boolean;
  onChange: (value: string) => void; onImages: (files: File[]) => void; onRemove: (id: string) => void;
  onPreview: (name: string, url: string) => void; onSubmit: () => void; children?: ReactNode;
}) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  return <section className="spec-fill-question-entry" onPaste={event => {
    const files = pastedFiles(event);
    if (!files.length) return;
    event.preventDefault();
    if (!busy) onImages(files);
  }} onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDrop={event => {
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    if (!busy) onImages(Array.from(event.dataTransfer.files));
  }}>
    <label htmlFor={id} className="spec-fill-heading">{label}</label>
    <div className="spec-fill-question-box">
      <Textarea id={id} aria-label={label} aria-describedby={`${id}-hint`} value={question} maxLength={4000} disabled={busy} onChange={event => onChange(event.target.value)} onKeyDown={event => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); onSubmit(); }
      }} placeholder={placeholder} />
      {images.length > 0 && <div className="spec-fill-question-images" aria-label="已加入的問題圖片">{images.map((photo, index) => <FormPhotoPreview key={photo.id} photo={photo} index={index} busy={busy} onPreview={onPreview} onRemove={() => onRemove(photo.id)} />)}</div>}
      <div className="spec-fill-question-tools">
        <input type="file" ref={fileInput} className="sr-only" tabIndex={-1} aria-label="選擇問題圖片檔案" accept=".png,.jpg,.jpeg,.webp" multiple disabled={busy} onChange={event => { onImages(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        <Button type="button" variant="outline" size="sm" disabled={busy || images.length >= SPEC_FILL_MAX_PHOTOS} onClick={() => fileInput.current?.click()}><ImagePlus data-icon="inline-start" />加入圖片</Button>
        <span id={`${id}-hint`} aria-live="polite">可直接在輸入框貼上或拖入圖片{images.length > 0 && ` · ${images.length} 張`}</span>
        {children}
      </div>
    </div>
  </section>;
}

export function MaterialSpecFillDialog({ records, workspaceName, open, onOpenChange }: {
  records: MaterialWorkbookRecord[]; workspaceName: string; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const uid = useId();
  const [partId, setPartId] = useState("");
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);
  const [mode, setMode] = useState<SpecFillMode>("photo");
  const lastRun = useRef<RunInputs | null>(null);
  const part = records.find(record => record.id === partId);
  const docs = useMemo(() => part ? getMaterialSpecDocuments(part) : [], [part]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [photos, setPhotos] = useState<FormPhoto[]>([]);
  const [questionPhotos, setQuestionPhotos] = useState<FormPhoto[]>([]);
  const photosRef = useRef<FormPhoto[]>([]);
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null);
  const [localSpecs, setLocalSpecs] = useState<File[]>([]);
  const [models, setModels] = useState<SpecFillModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [precision, setPrecision] = useState<SpecFillPrecision>("high");
  const [view, setView] = useState<"table" | "conversation">("table");
  const [evidence, setEvidence] = useState<SpecFillCell | null>(null);
  const [evidenceSources, setEvidenceSources] = useState<SpecFillSource[]>([]);
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
  const [turns, setTurns] = useState<Array<SpecFillTurn & { images: FormPhoto[]; sources: SpecFillSource[]; warnings: string[]; modelLabel?: string; citations?: Array<{sourceId: string; page: string; quote: string}> }>>([]);
  const [question, setQuestion] = useState("");
  const [selectedTurn, setSelectedTurn] = useState(0);
  const [selectedTable, setSelectedTable] = useState("");
  const [showEvidence, setShowEvidence] = useState(false);
  const preparedSources = useRef<SpecFillInput[] | null>(null);
  const sourceWarnings = useRef<string[]>([]);
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
  const previous = lastRun.current;
  const continuing = previous && previous.partId === partId && previous.photos === photos && previous.selectedPaths === selectedPaths && previous.localSpecs === localSpecs && previous.note === note && previous.mode === mode;
  const hasPart = Boolean(part?.manufacturerPartNumber.trim());
  const hasQuestion = Boolean(question.trim() || questionPhotos.length);
  const hasQuestionPhotos = questionPhotos.length > 0 || Boolean(continuing && turns.some(turn => turn.images.length));
  const canFill = Boolean(hasPart && inputCount && photos.length && model && !busy);
  const canAsk = Boolean(model && !busy && hasQuestion && (mode === "photo" ? canFill : inputCount ? hasPart : hasQuestionPhotos));
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
  const clearFeedback = () => { setError(""); setNotice(""); };
  const invalidate = () => { generation.current++; lastRun.current = null; setResult(null); setTurns([]); setQuestion(""); setQuestionPhotos([]); preparedSources.current = null; sourceWarnings.current = []; setSources([]); clearFeedback(); setShowInputs(true); setEvidence(null); };
  const replacePhotos = (next: FormPhoto[]) => { photosRef.current = next; setPhotos(next); setPreview(null); };
  const choosePart = (id: string) => {
    setPicking(false); setQuery("");
    if (id === partId) return;
    if (partId) { setQuestion(""); setQuestionPhotos([]); }
    clearFeedback(); setPartId(id); setSelectedPaths([]); setLocalSpecs([]);
  };
  const restoreResult = () => {
    const previous = lastRun.current;
    if (!previous) return;
    if (previous.partId !== partId) { setQuestion(""); setQuestionPhotos([]); }
    setPartId(previous.partId); replacePhotos(previous.photos); setSelectedPaths(previous.selectedPaths); setLocalSpecs(previous.localSpecs); setNote(previous.note); setMode(previous.mode);
    clearFeedback(); setShowInputs(false);
  };
  const choosePhotos = (files: File[], forQuestion = false) => {
    if (busy || !files.length) return;
    const current = forQuestion ? questionPhotos : photosRef.current;
    const added: FormPhoto[] = [], failures: string[] = [];
    for (const [index, original] of files.entries()) {
      const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as Record<string, string>)[original.type];
      const file = !original.name && extension ? new File([original], `${forQuestion ? "問題圖片" : "表格照片"}-${Date.now()}-${index + 1}.${extension}`, { type: original.type }) : original;
      if (!/\.(png|jpe?g|webp)$/i.test(file.name)) failures.push(`${file.name || "未命名檔案"}（請用 PNG、JPG 或 WEBP）`);
      else if (!file.size || file.size > SPEC_FILL_MAX_BYTES) failures.push(`${file.name}（空檔或超過 18 MB）`);
      else if (current.length + added.length >= SPEC_FILL_MAX_PHOTOS) failures.push(`${file.name}（本次最多 ${SPEC_FILL_MAX_PHOTOS} 張，可分批分析）`);
      else added.push({ id: crypto.randomUUID(), file });
    }
    if (added.length) {
      clearFeedback();
      if (forQuestion) setQuestionPhotos(items => [...items, ...added]);
      else replacePhotos([...current, ...added]);
    }
    if (failures.length) setError(`未加入：${failures.join("、")}。其餘照片與原有照片已保留，不需壓縮。`);
  };
  const pastePhoto = (event: ClipboardEvent) => {
    const images = pastedFiles(event);
    if (!images.length) return;
    event.preventDefault(); choosePhotos(images);
  };
  const addSpecs = (files: File[]) => {
    const rejected = files.filter(file => !canReadSpecForFill(file.name) || !file.size || file.size > SPEC_FILL_MAX_BYTES);
    const accepted = files.filter(file => !rejected.includes(file));
    if (!accepted.length) { setError(`無法判讀：${rejected.map(file => file.name).join("、")}。請選 PDF、圖片或文字版 SPEC；原工程附件仍可照常使用。`); return; }
    clearFeedback(); setLocalSpecs(current => [...current, ...accepted.filter(file => !current.some(old => old.name === file.name && old.size === file.size && old.lastModified === file.lastModified))]);
    if (rejected.length) setError(`未加入：${rejected.map(file => file.name).join("、")}（格式不支援、空檔或超過 18 MB）。其餘檔案已保留。`);
  };
  const analyze = async (followup = false, refillFromQuestion = false) => {
    if (active.current || !model || (followup ? !canAsk : !canFill || (refillFromQuestion && !hasQuestion))) return;
    const request = new AbortController(); active.current = request;
    const stamp = ++generation.current;
    const currentInputs = { partId, photos, selectedPaths, localSpecs, note, mode };
    const includedPhotos = mode === "photo" ? photos : [];
    const turnPhotos = followup || refillFromQuestion ? questionPhotos : [];
    const questionImages = [...(continuing ? turns.flatMap(turn => turn.images) : []), ...turnPhotos];
    const asked = followup || refillFromQuestion ? question.trim() || "請讀取我附上的圖片，整理能確認的規格、單位與條件。" : note.trim() || "依照片表格，從指定料件 SPEC 填寫並列出來源。";
    setBusy(true); setPreview(null); setError(""); setNotice("");
    try {
      // Download only explicitly selected attachments belonging to this record.
      const chosen = docs.filter(document => selectedPaths.includes(document.path));
      if (chosen.length !== selectedPaths.length) throw new Error("附件已變更，請重新選擇 SPEC。");
      const total = [...includedPhotos, ...questionImages].reduce((sum, photo) => sum + photo.file.size, 0) + chosen.reduce((sum, doc) => sum + doc.size, 0) + localSpecs.reduce((sum, file) => sum + file.size, 0);
      if (total > SPEC_FILL_MAX_BYTES) throw new Error("本次分析合計超過 18 MB，請分次選取相關 SPEC 或頁面，不必壓縮。");
      if (inputCount > 20) throw new Error("本次最多分析 20 份 SPEC，請分次選擇，不必壓縮。");
      const inputs: SpecFillInput[] = continuing && preparedSources.current ? [...preparedSources.current] : [];
      if (!inputs.length) {
        for (const document of chosen) inputs.push({ id: `spec-${inputs.length + 1}`, name: document.name, blob: await downloadSpecForFill(document, request.signal) });
        localSpecs.forEach(file => inputs.push({ id: `spec-${inputs.length + 1}`, name: file.name, blob: file }));
      }
      const requestInput = { precision, photos: includedPhotos.map(({ file }, index) => ({ id: `template-${index + 1}`, name: file.name, blob: file })), questionImages: questionImages.map(({ id, file }) => ({ id: `image-${id}`, name: file.name, blob: file })), sources: inputs, model, note: mode === "photo" ? note : "", question: asked, history: continuing ? turns.map(({ question, reply, tables }) => ({ question, reply, tables })) : [], signal: request.signal };
      const answer = !followup && part ? await analyzeSpecFillConversation({ ...requestInput, part }) : await askSpecFillQuestion({ ...requestInput, part: hasPart ? part : undefined });
      if (!alive.current || stamp !== generation.current || request.signal.aborted) return;
      preparedSources.current = answer.preparedSources;
      lastRun.current = currentInputs;
      sourceWarnings.current = [...new Set([...(continuing ? sourceWarnings.current : []), ...answer.warnings])];
      const turn = { question: asked, images: turnPhotos, reply: answer.reply, tables: answer.tables, sources: answer.sources, warnings: sourceWarnings.current, modelLabel: model.label, citations: "citations" in answer ? answer.citations : [] };
      setTurns(current => [...(continuing ? current : []), turn]);
      if (answer.tables.length) { setSources(answer.sources); setSelectedTurn(continuing ? turns.length : 0); setResult(answer.tables); setSelectedTable(answer.tables[0]?.templateId ?? ""); setView("table"); }
      else { if (!continuing) { setResult(null); setSources([]); } setView("conversation"); }
      if (followup || refillFromQuestion) { setQuestion(""); setQuestionPhotos([]); }
      setShowInputs(false);
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
  const showPreview = (name: string, url: string) => setPreview({ name, url });
  const questionComposerProps = {
    question, images: questionPhotos, busy, onChange: setQuestion,
    onImages: (files: File[]) => choosePhotos(files, true),
    onRemove: (id: string) => { clearFeedback(); setQuestionPhotos(items => items.filter(item => item.id !== id)); },
    onPreview: showPreview,
    onSubmit: () => void analyze(true),
  };
  const footerText = busy ? "正在讀取已選的資料…" : !showInputs ? "結果可貼到 Excel 或下載" : mode === "ask" && !inputCount
    ? hasQuestionPhotos ? "圖片會與問題一起送出" : "加入圖片，或選擇料件與 SPEC"
    : !hasPart ? "請選擇有 MPN 的料件" : !inputCount ? "選擇此料件的 SPEC，或從電腦加入"
    : mode === "photo" && !photos.length ? "加入要填寫的表格照片" : mode === "ask" && !hasQuestion ? "輸入想查的規格，或加入圖片"
    : `${mode === "photo" ? `${photos.length} 張照片 · ` : ""}${inputCount} 份 SPEC`;
  const evidenceImage = turns.flatMap(turn => turn.images).find(image => `image-${image.id}` === evidence?.sourceId);
  return <Dialog open={open} onOpenChange={value => { if (!value && active.current) cancel(); onOpenChange(value); }}>
    <DialogContent className="material-spec-fill-dialog flex flex-col overflow-hidden" data-testid="material-spec-fill-dialog" hideCloseButton>
      <DialogHeader className="spec-fill-header">
        <Button type="button" variant="ghost" className="spec-fill-back" onClick={() => { if (active.current) cancel(); onOpenChange(false); }}><ArrowLeft className="h-4 w-4" />返回待處理料</Button>
        <div className="spec-fill-title-row">
          <div><DialogTitle>{mode === "photo" ? "依照片填表" : "問 SPEC 規格"}</DialogTitle><DialogDescription>{workspaceName}{!showInputs && part?.manufacturerPartNumber && ` · ${part.manufacturerPartNumber} · ${part.manufacturer}`}</DialogDescription></div>
          <Popover><PopoverTrigger asChild><Button variant="ghost" size="sm" aria-label="AI 設定"><Settings2 className="h-4 w-4" />AI 設定</Button></PopoverTrigger>
            <PopoverContent align="end" className="spec-fill-ai-settings">
              <label htmlFor={`${uid}-model`}>AI 模型<select id={`${uid}-model`} value={modelId} disabled={busy || modelsLoading} onChange={event => setModelId(event.target.value)}>{!models.length && <option value="">{modelsLoading ? "載入 AI 服務…" : "沒有可用的 AI 服務"}</option>}{models.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label htmlFor={`${uid}-precision`}>判讀模式<select id={`${uid}-precision`} value={precision} disabled={busy} onChange={event => setPrecision(event.target.value as SpecFillPrecision)}><option value="high">精細判讀（較慢）</option><option value="standard">標準判讀</option></select></label>
            </PopoverContent>
          </Popover>
        </div>
      </DialogHeader>
      <div className="spec-fill-toolbar">
        {showInputs ? <div className="spec-fill-view-switch" role="group" aria-label="選擇作業">
          <Button variant="ghost" aria-pressed={mode === "photo"} disabled={busy} onClick={() => { setMode("photo"); clearFeedback(); }}><ScanText className="h-4 w-4" />依照片填表</Button>
          <Button variant="ghost" aria-pressed={mode === "ask"} disabled={busy} onClick={() => { setMode("ask"); clearFeedback(); }}><MessageSquare className="h-4 w-4" />問 SPEC 規格</Button>
        </div> : <div className="spec-fill-view-switch" role="group" aria-label="結果檢視">
          {result && <Button variant="ghost" aria-pressed={view === "table"} onClick={() => setView("table")}><Table2 className="h-4 w-4" />表格結果</Button>}
          <Button variant="ghost" aria-pressed={view === "conversation"} onClick={() => setView("conversation")}><MessageSquare className="h-4 w-4" />對話</Button>
        </div>}
        {lastRun.current && <Button className="spec-fill-edit-inputs" variant="ghost" size="sm" disabled={busy} onClick={() => { if (showInputs) restoreResult(); else { clearFeedback(); setShowInputs(true); } }}>{showInputs ? "返回結果" : "調整資料"}</Button>}
      </div>
      {!modelsLoading && (!models.length || modelsError) && <p className="spec-fill-inline-warning">{modelsError || "請管理員設定可讀圖片／PDF 的 AI 服務，並開放目前帳號使用。"}<button className="ml-2 underline" onClick={() => setLoadKey(key => key + 1)}>重新載入</button></p>}
      <div ref={workspaceScroll} className="spec-fill-workspace">
        {showInputs && <div className="spec-fill-setup">
          {mode === "ask" && <QuestionComposer label="想確認什麼？" placeholder="例如：這顆料的最大額定電流是多少？" {...questionComposerProps} />}
          <section className="spec-fill-part-picker">
            <span className="spec-fill-heading">指定料件{mode === "ask" && "（可選，加入圖片即可提問）"}</span>
            <Popover open={picking} onOpenChange={value => { setPicking(value); if (!value) setQuery(""); }}>
              <PopoverTrigger asChild><Button type="button" variant="outline" className="spec-fill-part-trigger" disabled={busy} aria-label="指定料件">
                <span><strong>{part?.manufacturerPartNumber || "選擇料件"}</strong>{part && <small>{[part.manufacturer, part.refDes, part.name].filter(Boolean).join(" · ")}</small>}</span><ChevronsUpDown className="h-4 w-4 shrink-0" />
              </Button></PopoverTrigger>
              <PopoverContent className="spec-fill-part-options p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput autoFocus aria-label="尋找要填表的料件" placeholder="搜尋 MPN、位號、料名或廠商" value={query} onValueChange={setQuery} />
                  <CommandList><CommandEmpty>沒有符合的料件。</CommandEmpty>
                    {choices.slice(0, 80).map(record => <CommandItem key={record.id} value={record.id} onSelect={() => choosePart(record.id)}><span><strong>{record.manufacturerPartNumber || "未填 MPN"}</strong><small>{[record.manufacturer, record.refDes, record.name].filter(Boolean).join(" · ")}</small></span>{record.id === partId && <Check className="ml-auto h-4 w-4 shrink-0" />}</CommandItem>)}
                  </CommandList>
                  {choices.length > 80 && <p className="spec-fill-part-more">顯示前 80 筆，輸入料號可縮小範圍。</p>}
                </Command>
              </PopoverContent>
            </Popover>
            {part && !part.manufacturerPartNumber.trim() && <p className="spec-fill-help">此料件還沒有 MPN，請先補上或選擇其他料件。</p>}
          </section>
          <div className="spec-fill-input-grid" data-mode={mode}>
            {mode === "photo" && <section className="spec-fill-section">
              <div className="spec-fill-section-title"><h3>表格照片 <span>{photos.length}／{SPEC_FILL_MAX_PHOTOS}</span></h3><Button variant="outline" className="h-9 px-3" disabled={busy || photos.length >= SPEC_FILL_MAX_PHOTOS} onClick={() => photoInput.current?.click()}><ImagePlus className="h-4 w-4" />{photos.length ? "新增照片" : "選擇照片"}</Button></div>
              <input type="file" ref={photoInput} className="sr-only" tabIndex={-1} aria-label="選擇表格照片檔案" accept=".png,.jpg,.jpeg,.webp" multiple disabled={busy} onChange={event => { choosePhotos(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
              <div role="group" tabIndex={0} className={`spec-fill-photo ${photos.length ? "spec-fill-photo--compact" : ""}`} onPaste={event => { if (!busy) pastePhoto(event); }} onDragOver={event => { event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (!busy) choosePhotos(Array.from(event.dataTransfer.files)); }} aria-label="貼上表格照片區" aria-disabled={busy}><ImagePlus className="h-5 w-5 text-primary" /><strong>貼上或拖入多張表格照片</strong><span>點這裡按 Ctrl+V，或用「選擇照片」一次加入。</span></div>
              {photos.length > 0 && <><div className="spec-fill-photo-list" aria-label="已加入的表格照片">{photos.map((photo, index) => <FormPhotoPreview key={photo.id} photo={photo} index={index} busy={busy} onPreview={(name, url) => setPreview({ name, url })} onRemove={() => { clearFeedback(); replacePhotos(photosRef.current.filter(item => item.id !== photo.id)); }} />)}</div><Button variant="ghost" className="mt-1 h-8 px-2 text-xs" disabled={busy} onClick={() => { clearFeedback(); replacePhotos([]); }}>清除全部照片</Button></>}
            </section>}
            <section className="spec-fill-section" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy && part) addSpecs(Array.from(event.dataTransfer.files)); }}>
              <div className="spec-fill-section-title"><h3>料件 SPEC <span>已選 {inputCount} 份</span></h3><Button variant="outline" className="h-9 px-3" disabled={busy || !part} onClick={() => specInput.current?.click()}>從電腦加入</Button></div>
              <input type="file" ref={specInput} className="sr-only" tabIndex={-1} aria-label="選擇本機 SPEC 檔案" accept={SPEC_FILL_ACCEPT} multiple disabled={busy} onChange={event => { addSpecs(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
              <div className="spec-fill-files">{!docs.length && !localSpecs.length && <p className="p-3 text-sm text-muted-foreground">{part ? "這顆料還沒有 SPEC 附件，可拖入或從電腦加入。" : "選擇料件後，這裡會顯示可用的附件。"}</p>}{docs.map(document => <label key={document.path} className="spec-fill-file"><input type="checkbox" checked={selectedPaths.includes(document.path)} disabled={busy || !canReadSpecForFill(document.name)} onChange={event => { clearFeedback(); setSelectedPaths(current => event.target.checked ? [...current, document.path] : current.filter(path => path !== document.path)); }} /><FileText className="h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 break-all">{document.name}{!canReadSpecForFill(document.name) && <small className="block text-muted-foreground">請另選 PDF／圖片版供 AI 判讀</small>}</span></label>)}{localSpecs.map((file, index) => <div key={`${file.name}:${index}`} className="spec-fill-file"><Check className="h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 flex-1 break-all">{file.name}<small className="block text-muted-foreground">本次使用，不寫入 BOM</small></span><Button variant="ghost" size="icon" disabled={busy} aria-label={`移除 ${file.name}`} onClick={() => { clearFeedback(); setLocalSpecs(current => current.filter((_, i) => i !== index)); }}><X className="h-4 w-4" /></Button></div>)}</div>
              <p className="spec-fill-help">可拖入多份 PDF、圖片、文字、RAR 或 STEP。</p>
            </section>
          </div>
          {mode === "photo" && <details className="spec-fill-conditions"><summary>填表條件{note ? " · 已填寫" : "（選填）"}</summary><Input aria-label="填表條件" value={note} maxLength={4000} disabled={busy} onChange={event => { clearFeedback(); setNote(event.target.value); }} placeholder="例如：保留 Min／Typ／Max、單位與量測條件" /></details>}
        </div>}
        {!showInputs && result && <section className="spec-fill-results" aria-label="依照片填表結果" hidden={view !== "table"}>
          <div className="spec-fill-results-toolbar"><div><strong>第 {selectedTurn + 1} 次結果</strong><p>{result.length} 張表格 · {review.sourced} 格列有來源 · <span className={review.missing ? "text-amber-300" : ""}>{review.missing} 格待確認</span></p></div><label><input type="checkbox" checked={showEvidence} onChange={event => setShowEvidence(event.target.checked)} />表格顯示來源原文</label><Button variant="outline" disabled={busy} className="h-9" onClick={() => setView("conversation")}>追問規格</Button></div>
          {result.length > 1 && <div className="spec-fill-table-tabs" role="group" aria-label="選擇結果表格">{result.map((table, i) => <Button key={table.templateId} variant="ghost" aria-pressed={selectedTable === table.templateId} onClick={() => setSelectedTable(table.templateId)}>第 {i + 1} 張 · {table.title}</Button>)}</div>}
          {result.map((table, tableIndex) => table.templateId !== selectedTable ? null : <section key={table.templateId} className="spec-fill-result" aria-label={`第 ${tableIndex + 1} 張填表結果`}><div className="spec-fill-table-title"><h3>{table.title}</h3><span>{table.rows.length} 列 × {table.columns.length} 欄</span><Button variant="ghost" className="h-8 text-xs" onClick={() => void copy([table])}>複製這張表格</Button></div>{table.warnings.length > 0 && <ul className="spec-fill-warnings">{table.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
          <div className="spec-fill-table-scroll" tabIndex={0} role="region" aria-label={`第 ${tableIndex + 1} 張可複製的填表結果（可左右捲動）`}><table style={{ minWidth: Math.max(640, table.columns.length * 120) }}><thead><tr>{table.columns.map((column, i) => <th key={i} scope="col">{column}</th>)}</tr></thead><tbody>{table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} data-cell-kind={cell.kind}><div className="spec-fill-cell-value">{cell.value}</div>{cell.kind === "source" && <><button type="button" className="spec-fill-citation" aria-label={`查看來源：第 ${i + 1} 列 ${table.columns[j]}`} onClick={() => { setEvidenceSources(sources); setEvidence(cell); }}><FileSearch className="h-3.5 w-3.5" />{sources.find(source => source.id === cell.sourceId)?.name} · {/^(圖片|文字|模型)$/.test(cell.page ?? "") ? cell.page : `p.${cell.page}`}</button>{showEvidence && <p className="spec-fill-cell-quote">{cell.quote}</p>}</>}{cell.kind === "missing" && <p className="spec-fill-cell-quote">{cell.quote || "所選 SPEC 未提供，請補充資料。"}</p>}</td>)}</tr>)}</tbody></table></div></section>)}
          <p className="spec-fill-help">來源標示由 AI 擷取，請點選查核原文；待確認的欄位不會補造數值。</p>
        </section>}
        {!showInputs && turns.length > 0 && <section className="spec-fill-conversation" aria-label="填表對話紀錄" hidden={view !== "conversation"}>
          <div className="spec-fill-conversation-heading"><h3>對話紀錄</h3>{!busy && <Button variant="ghost" onClick={invalidate}>重新開始對話</Button>}</div>
          {turns.map((turn, index) => <article key={index} className="spec-fill-turn">
            <div className="spec-fill-question"><span>你 · {index + 1}</span><p>{turn.question}</p>
              {turn.images.length > 0 && <div className="spec-fill-question-images" aria-label={`第 ${index + 1} 則問題的圖片`}>
                {turn.images.map((photo, imageIndex) => <FormPhotoPreview key={photo.id} photo={photo} index={imageIndex} busy={busy} onPreview={showPreview} />)}
              </div>}
            </div>
            <div className="spec-fill-answer"><span>AI · {turn.modelLabel}</span><p>{turn.reply}</p>{turn.citations?.map((citation, citationIndex) => <button key={citationIndex} type="button" className="spec-fill-citation" onClick={() => { setEvidenceSources(turn.sources); setEvidence({ kind: "source", value: "回覆引用來源", ...citation }); }}><FileSearch className="h-3.5 w-3.5" />{turn.sources.find(source => source.id === citation.sourceId)?.name} · {citation.page}</button>)}{turn.warnings.length > 0 && <ul className="spec-fill-warnings">{turn.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>}{turn.tables.length > 0 && <Button variant="outline" className="mt-3 h-9" aria-pressed={selectedTurn === index} disabled={busy} onClick={() => { setSelectedTurn(index); setResult(turn.tables); setSources(turn.sources); setSelectedTable(turn.tables[0]?.templateId ?? ""); setView("table"); }}>查看第 {index + 1} 次結果</Button>}</div>
          </article>)}
        </section>}
      </div>
      {error && <p role="alert" className="spec-fill-inline-error">{error}</p>}{notice && <p role="status" className="spec-fill-notice">{notice}</p>}
      {!showInputs && view === "conversation" && <div className="spec-fill-composer">
        <QuestionComposer label="接續提問" placeholder="追問數值、單位、量測條件或出處…" {...questionComposerProps}>
        {!busy && <div className="spec-fill-composer-actions">
          {result && mode === "photo" && <Button variant="ghost" disabled={!canFill || !hasQuestion} onClick={() => void analyze(false, true)}>依問題更新表格</Button>}
          <Button disabled={!canAsk} onClick={() => void analyze(true)}><Send className="h-4 w-4" />送出追問</Button>
        </div>}
        </QuestionComposer>
      </div>}
      {(showInputs || view === "table" || busy) && <footer className="spec-fill-footer">
        <p>{footerText}</p>
        <div className="spec-fill-footer-actions">
          {!showInputs && result && view === "table" && <><Button variant="outline" onClick={() => void copy()}><Copy className="h-4 w-4" />{result.length > 1 ? "複製全部表格" : "複製表格"}</Button><Button variant="outline" disabled={exporting} onClick={() => void exportResult()}><Download className="h-4 w-4" />{exporting ? "匯出中…" : "下載 Excel"}</Button></>}
          {busy ? <Button variant="outline" onClick={cancel}><Loader2 className="h-4 w-4 animate-spin" />停止分析</Button> : showInputs && <Button disabled={mode === "photo" ? !canFill : !canAsk} onClick={() => void analyze(mode === "ask")}>{mode === "photo" ? <ScanText className="h-4 w-4" /> : <Send className="h-4 w-4" />}{mode === "photo" ? (result ? "重新填表" : "開始依照片填表") : "送出問題"}</Button>}
        </div>
      </footer>}
      <Dialog open={Boolean(preview)} onOpenChange={value => { if (!value) setPreview(null); }}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle className="break-all">{preview?.name ?? "照片預覽"}</DialogTitle><DialogDescription>已加入的原始圖片</DialogDescription></DialogHeader>{preview && <img src={preview.url} alt={preview.name} className="max-h-[75dvh] w-full object-contain" />}</DialogContent></Dialog>
      <Dialog open={Boolean(evidence)} onOpenChange={value => { if (!value) setEvidence(null); }}><DialogContent className="spec-fill-source-dialog"><DialogHeader><DialogTitle>查核 SPEC 來源</DialogTitle><DialogDescription>{evidenceSources.find(source => source.id === evidence?.sourceId)?.name} · {evidence?.page}</DialogDescription></DialogHeader><div className="spec-fill-evidence-value">{evidence?.value}</div><h3 className="text-sm font-semibold">AI 引用原文</h3><blockquote className="whitespace-pre-wrap break-words text-sm leading-7">{evidence?.quote}</blockquote><p className="text-xs text-muted-foreground">請核對型號、單位與條件；有引用原文不等於數值已經過人工驗證。</p><Button variant="outline" onClick={() => { if (evidenceImage) downloadBlob(evidenceImage.file, evidenceImage.file.name); else { const file = preparedSources.current?.find(source => source.id === evidence?.sourceId); if (file) downloadBlob(file.blob, file.name); } }}><Download className="h-4 w-4" />下載來源原檔</Button></DialogContent></Dialog>
    </DialogContent>
  </Dialog>;
}
