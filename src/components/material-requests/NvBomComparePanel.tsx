import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Download, FileSpreadsheet, LoaderCircle, Search, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NV_BOM_FIELDS, compareNvBomSheets, exportNvBomComparison, readNvBomFile, type NvBomAnnotation, type NvBomChange, type NvBomFile, type NvBomMapping } from "./nvBomCompare";
import { loadNvBomModels, resolveNvBomMappings, runNvBomComparison, type NvBomAiResult, type NvBomComparison, type NvBomModel } from "./nvBomCompareAi";
import { getNvBomHeaderAmbiguities, inferNvBomMapping, inferNvBomMappingAt, validateNvBomHeaderMapping } from "./nvBomMapping";
import { interpretNvBomDiff, NV_BOM_INTERPRETATION_LABELS, NV_BOM_SCOPE_LABELS, type NvBomInterpretedChange } from "./nvBomInterpretation";
import { NvBomReviewRow, type NvBomReviewLink } from "./NvBomReviewList";
import { currentBomCandidateLabel, NV_BOM_TABLE_LINK_LABELS, type NvBomTableCandidate, type NvBomTableLink } from "./nvBomTableMatch";
import "./nvBomCompare.css";

type Source = { file: NvBomFile; sheet: number };
type Run = { state: "running" | "done" | "failed" | "cancelled"; progress: string; error?: string; result?: NvBomAiResult };
type ReviewKind = "all" | NvBomInterpretedChange["kind"];
type ReviewScope = "all" | NvBomInterpretedChange["scope"];
export interface NvBomCompareSession {
  before: Source | null;
  after: Source | null;
  beforeMap: NvBomMapping;
  afterMap: NvBomMapping;
  manual: { before: boolean; after: boolean };
  mappingModel: string;
  selected: string[];
  runs: Record<string, Run>;
  selectedResult: string;
  annotations: Record<string, Record<string, NvBomAnnotation>>;
  query: string;
  kind: ReviewKind;
  scope: ReviewScope;
  checked: string;
  page: number;
}
const emptyMapping = (): NvBomMapping => ({ headerRow: 1, partNumber: null, mpn: null, manufacturer: null, description: null, qty: null, refs: null });
const PAGE_SIZE = 50;
const LOCAL_RESULT = "local";
const EMPTY_NOTES: Record<string, NvBomAnnotation> = {};

function matchReviewRow(entry: NvBomInterpretedChange, match: (change: NvBomChange) => NvBomTableLink): NvBomReviewLink {
  const { change, relatedMain } = entry;
  const before = change.before, after = change.after;
  const direct = match({ ...change,
    before: before && { ...before, refs: before.refs || relatedMain.before?.refs || "" },
    after: after && { ...after, refs: after.refs || relatedMain.after?.refs || "" },
  });
  if (direct.state !== "missing" || !(relatedMain.before || relatedMain.after)) return direct;
  const main = match({ ...change,
    before: before && relatedMain.before ? { ...before, ...relatedMain.before } : undefined,
    after: after && relatedMain.after ? { ...after, ...relatedMain.after } : undefined,
  });
  return main.state === "matched" || main.state === "ambiguous" ? { ...main, relatedMain: true } : direct;
}

function SourcePicker({ side, value, busy, mapping, onMapping, onChange, onReading }: {
  side: "before" | "after"; value: Source | null; busy: boolean; mapping: NvBomMapping;
  onMapping: (mapping: NvBomMapping) => void; onChange: (source: Source) => void; onReading: (reading: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null), request = useRef(0);
  const [reading, setReading] = useState(false), [error, setError] = useState("");
  useEffect(() => () => { request.current++; }, []);
  const label = side === "before" ? "舊版 NV BOM" : "新版 NV BOM";
  const sheet = value?.file.sheets[value.sheet];
  const header = sheet?.rows[mapping.headerRow - 1] ?? [];
  const duplicateFields = useMemo(() => sheet ? getNvBomHeaderAmbiguities(sheet, mapping.headerRow) : [], [sheet, mapping.headerRow]);
  async function accept(files: FileList | File[] | null) {
    if (!files?.length || busy || reading) return;
    if (files.length !== 1) { setError("每個區域放一份 BOM，請分別放入舊版與新版。"); return; }
    const captured = ++request.current; setReading(true); onReading(true); setError("");
    try { const file = await readNvBomFile(files[0]); if (captured === request.current) onChange({ file, sheet: 0 }); }
    catch (failure) { if (captured === request.current) setError(failure instanceof Error ? failure.message : "讀取失敗，請重新選擇檔案。"); }
    finally { if (captured === request.current) { setReading(false); onReading(false); } }
  }
  return <section className="nv-bom-source" data-side={side} aria-label={label} onDragOver={event => { event.preventDefault(); }} onDrop={event => { event.preventDefault(); void accept(event.dataTransfer.files); }}>
    <div className="nv-bom-source-heading"><strong><span>{side === "before" ? "A" : "B"}</span>{label}</strong><Button type="button" variant="outline" disabled={busy || reading} onClick={() => input.current?.click()}><Upload aria-hidden="true" />{value ? "更換檔案" : "選擇檔案"}</Button></div>
    <input ref={input} type="file" accept=".xlsx,.xls,.xlsm,.csv" aria-label={`選擇${label}`} className="sr-only" disabled={busy || reading} onChange={event => { void accept(event.target.files); event.target.value = ""; }} />
    {reading ? <p role="status"><LoaderCircle className="nv-spin" aria-hidden="true" />讀取 Excel 中…</p> : value ? <><p className="nv-bom-filename"><FileSpreadsheet aria-hidden="true" /><span title={value.file.name}>{value.file.name}</span></p><label>工作表<select aria-label={`${label}工作表`} value={value.sheet} disabled={busy} onChange={event => onChange({ ...value, sheet: Number(event.target.value) })}>{value.file.sheets.map((item, index) => <option key={item.name} value={index}>{item.name} · {item.rows.length.toLocaleString()} 列</option>)}</select></label></> : <button className="nv-bom-drop" type="button" disabled={busy} onClick={() => input.current?.click()}><FileSpreadsheet aria-hidden="true" /><span>將{side === "before" ? "舊版" : "新版"} Excel 拖入這裡</span><small>XLSX、XLS、XLSM 或 CSV</small></button>}
    {error && <p role="alert" className="nv-bom-error">{error}</p>}
    {sheet && <div className="nv-bom-mapping">
      <label>表頭在第幾列<input aria-label={`${label}表頭列`} type="number" min={1} max={Math.max(1, sheet.rows.length - 1)} value={mapping.headerRow} disabled={busy}
        onChange={event => onMapping(inferNvBomMappingAt(sheet, Math.max(1, Math.min(sheet.rows.length - 1, Number(event.target.value) || 1))))} /></label>
      {NV_BOM_FIELDS.map(field => <label key={field.key}>{field.label}
        <select aria-label={`${label}${field.label}對應欄位`} value={mapping[field.key] ?? ""} disabled={busy}
          onChange={event => onMapping({ ...mapping, [field.key]: event.target.value ? Number(event.target.value) : null })}>
          <option value="">略過／沒有此欄</option>
          {header.map((cell, index) => <option key={index} value={index + 1} disabled={!cell.trim()}>{index + 1} · {cell || "（空白表頭）"}</option>)}
        </select>
        {mapping[field.key] === null && duplicateFields.includes(field.key) && <small>有多個可能欄位，請確認</small>}
      </label>)}
    </div>}
  </section>;
}

export default function NvBomComparePanel({ active, onBack, currentBomName, matchCurrentBom, onLocateCurrentBom, initialSession }: {
  active: boolean;
  onBack: () => void;
  currentBomName?: string;
  matchCurrentBom?: (change: NvBomChange) => NvBomTableLink;
  onLocateCurrentBom?: (candidate: NvBomTableCandidate, session: NvBomCompareSession) => void;
  initialSession?: NvBomCompareSession;
}) {
  const [before, setBefore] = useState(initialSession?.before ?? null), [after, setAfter] = useState(initialSession?.after ?? null);
  const [beforeReading, setBeforeReading] = useState(false), [afterReading, setAfterReading] = useState(false);
  const [models, setModels] = useState<NvBomModel[]>([]), [selected, setSelected] = useState<string[]>(initialSession?.selected ?? []), [loading, setLoading] = useState(false), [modelError, setModelError] = useState("");
  const [runs, setRuns] = useState<Record<string, Run>>(initialSession?.runs ?? {}), [selectedResult, setSelectedResult] = useState(initialSession?.selectedResult ?? "");
  const [busy, setBusy] = useState(false), [settings, setSettings] = useState(!initialSession);
  const [beforeMap, setBeforeMap] = useState(() => initialSession?.beforeMap ?? emptyMapping()), [afterMap, setAfterMap] = useState(() => initialSession?.afterMap ?? emptyMapping());
  const [manual, setManual] = useState(initialSession?.manual ?? { before: false, after: false });
  const [mappingModel, setMappingModel] = useState(initialSession?.mappingModel ?? "");
  const [annotations, setAnnotations] = useState<Record<string, Record<string, NvBomAnnotation>>>(initialSession?.annotations ?? {});
  const [query, setQuery] = useState(initialSession?.query ?? ""), [kind, setKind] = useState<ReviewKind>(initialSession?.kind ?? "all"), [scope, setScope] = useState<ReviewScope>(initialSession?.scope ?? "all");
  const [checked, setChecked] = useState(initialSession?.checked ?? "all"), [page, setPage] = useState(initialSession?.page ?? 1);
  const [notice, setNotice] = useState(""), [exporting, setExporting] = useState(false);
  const [compareError, setCompareError] = useState("");
  const [unresolvedLimit, setUnresolvedLimit] = useState(PAGE_SIZE);
  const controller = useRef<AbortController | null>(null), mounted = useRef(true), started = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { if (!active) controller.current?.abort(); }, [active]);
  async function loadModels() {
    setLoading(true); setModelError("");
    try { const items = await loadNvBomModels(); if (mounted.current) setModels(items); }
    catch (failure) { if (mounted.current) setModelError(failure instanceof Error ? failure.message : "無法讀取 AI 服務。"); }
    finally { if (mounted.current) setLoading(false); }
  }
  useEffect(() => { if (active && !started.current) { started.current = true; void loadModels(); } }, [active]);
  const activeRun = runs[selectedResult], result = activeRun?.result, notes = annotations[selectedResult] ?? EMPTY_NOTES;
  const beforeSheet = before?.file.sheets[before.sheet], afterSheet = after?.file.sheets[after.sheet];
  const baseDiff = runs[LOCAL_RESULT]?.result?.diff;
  const interpretation = useMemo(() => baseDiff ? interpretNvBomDiff(baseDiff) : undefined, [baseDiff]);
  const visibleChanges = useMemo(() => new Map(result?.diff.changes.map(change => [change.id, change])), [result]);
  const links = useMemo(() => new Map(interpretation?.entries.map(entry => [entry.change.id, matchCurrentBom && matchReviewRow(entry, matchCurrentBom)])), [interpretation, matchCurrentBom]);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return (interpretation?.entries ?? []).filter(entry => {
      const { change } = entry;
      if (kind !== "all" && entry.kind !== kind || scope !== "all" && entry.scope !== scope || checked !== "all" && Boolean(notes[change.id]?.checked) !== (checked === "checked")) return false;
      if (!keyword) return true;
      const fields = [change.before, change.after].flatMap(part => part ? NV_BOM_FIELDS.map(({ key }) => part[key]) : []);
      const current = links.get(change.id)?.candidates.flatMap(item => [item.physicalPartNumber, item.virtualPartNumber, item.refDes, item.mpn]) ?? [];
      return [...fields, ...current, entry.summary, NV_BOM_INTERPRETATION_LABELS[entry.kind], NV_BOM_SCOPE_LABELS[entry.scope], notes[change.id]?.note].some(value => value?.toLocaleLowerCase().includes(keyword));
    });
  }, [interpretation, links, query, kind, scope, checked, notes]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), shown = filtered.slice((Math.min(page, pageCount) - 1) * PAGE_SIZE, Math.min(page, pageCount) * PAGE_SIZE);
  const scopeCounts = useMemo(() => interpretation?.entries.reduce((counts, entry) => {
    counts[entry.scope] = (counts[entry.scope] ?? 0) + 1;
    return counts;
  }, {} as Partial<Record<NvBomInterpretedChange["scope"], number>>), [interpretation]);
  function clearResults() {
    setRuns({}); setAnnotations({}); setSelectedResult(""); setNotice(""); setCompareError(""); setMappingModel(""); setPage(1); setUnresolvedLimit(PAGE_SIZE);
  }
  function editMapping(side: "before" | "after", value: NvBomMapping) {
    (side === "before" ? setBeforeMap : setAfterMap)(value);
    setManual(current => ({ ...current, [side]: true }));
    clearResults();
  }
  function selectSource(side: "before" | "after", source: Source) {
    const mapping = inferNvBomMapping(source.file.sheets[source.sheet]) ?? emptyMapping();
    if (side === "before") { setBefore(source); setBeforeMap(mapping); }
    else { setAfter(source); setAfterMap(mapping); }
    setManual(current => ({ ...current, [side]: false }));
    clearResults();
  }
  async function run(ids = selected) {
    if (!beforeSheet || !afterSheet || controller.current || beforeReading || afterReading) return;
    setCompareError(""); setNotice("");
    const targets = models.filter(model => ids.includes(model.id));
    const request = new AbortController(); controller.current = request;
    const current = () => mounted.current && controller.current === request;
    try {
      const previous = runs[LOCAL_RESULT]?.result;
      const needsMapping = (mapping: NvBomMapping) => NV_BOM_FIELDS.some(({ key }) => mapping[key] === null);
      const sources = { before: !manual.before && needsMapping(beforeMap) ? beforeSheet : undefined,
        after: !manual.after && needsMapping(afterMap) ? afterSheet : undefined };
      let beforeMapping = beforeMap, afterMapping = afterMap;
      const shouldResolve = !mappingModel && targets[0] && (sources.before || sources.after);
      if (shouldResolve) {
        setBusy(true); setNotice("AI 正在辨識 Excel 表頭與欄位…");
        const resolved = await resolveNvBomMappings({ sources, model: targets[0], signal: request.signal });
        request.signal.throwIfAborted();
        beforeMapping = resolved.before ?? beforeMapping;
        afterMapping = resolved.after ?? afterMapping;
      }
      beforeMapping = validateNvBomHeaderMapping(beforeMapping, beforeSheet);
      afterMapping = validateNvBomHeaderMapping(afterMapping, afterSheet);
      const mappingChanged = (old: NvBomMapping, next: NvBomMapping) => old.headerRow !== next.headerRow || NV_BOM_FIELDS.some(({ key }) => old[key] !== next[key]);
      const changed = mappingChanged(beforeMap, beforeMapping) || mappingChanged(afterMap, afterMapping);
      const comparison: NvBomComparison = { beforeMapping, afterMapping, diff: previous && !changed ? previous.diff : compareNvBomSheets(beforeSheet, afterSheet, beforeMapping, afterMapping) };
      if (shouldResolve) {
        setBeforeMap(beforeMapping); setAfterMap(afterMapping);
        setMappingModel(targets[0].label);
        if (changed) setAnnotations({});
      }
      const local = { ...comparison, modelId: LOCAL_RESULT, modelLabel: "本機比對", reviewed: 0 };
      setNotice(""); setSettings(false); setPage(1);
      setSelectedResult(value => targets.some(model => model.id === value) ? value : targets[0]?.id ?? LOCAL_RESULT);
      setRuns(value => ({ ...(changed ? {} : value), [LOCAL_RESULT]: { state: "done", progress: "依已辨識欄位", result: local },
        ...Object.fromEntries(targets.map(model => [model.id, { state: "running", progress: "等待 AI 核對…", result: { ...local, modelId: model.id, modelLabel: model.label } }])) }));
      if (!targets.length) return;
      setBusy(true);
      let index = 0;
      const update = (id: string, patch: Partial<Run>) => { if (current()) setRuns(value => ({ ...value, [id]: { ...value[id], ...patch } })); };
      const worker = async () => {
        while (index < targets.length) {
          const model = targets[index++];
          if (request.signal.aborted) { update(model.id, { state: "cancelled", progress: "已停止" }); continue; }
          try {
            await runNvBomComparison({ comparison, model, signal: request.signal,
              onProgress: progress => update(model.id, { progress }), onResult: result => update(model.id, { result }) });
            update(model.id, { state: "done" });
          } catch (failure) {
            update(model.id, request.signal.aborted ? { state: "cancelled", progress: "已停止；完成的表格保留" } : { state: "failed", progress: "尚未完成", error: failure instanceof Error ? failure.message : "AI 比對失敗，請重試。" });
          }
        }
      };
      await Promise.allSettled(Array.from({ length: Math.min(2, targets.length) }, worker));
    } catch (failure) {
      if (current()) {
        setNotice(request.signal.aborted ? "已停止 AI 核對。" : "");
        setSettings(true);
        if (!request.signal.aborted) setCompareError(failure instanceof Error ? failure.message : "無法比對，請核對新舊工作表和欄位。");
      }
    } finally {
      if (current()) { controller.current = null; setBusy(false); }
    }
  }
  function annotate(id: string, patch: Partial<NvBomAnnotation>) {
    setAnnotations(current => ({ ...current, [selectedResult]: { ...current[selectedResult], [id]: { checked: false, note: "", ...current[selectedResult]?.[id], ...patch } } }));
  }
  function changeFilter<T>(setter: (value: T) => void, value: T) {
    setter(value); setPage(1);
  }
  function locate(candidate: NvBomTableCandidate) {
    onLocateCurrentBom?.(candidate, { before, after, beforeMap, afterMap, manual, mappingModel, selected, selectedResult, annotations, query, kind, scope, checked, page,
      runs: Object.fromEntries(Object.entries(runs).map(([id, run]) => [id, run.state === "running" ? { ...run, state: "cancelled", progress: "已停止" } : run])) });
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice(`已複製 ${value}`); }
    catch { setNotice("未能自動複製，請選取料號文字後按 Ctrl+C。"); }
  }
  async function download() {
    if (!result || !before || !after || exporting) return;
    setExporting(true); setNotice("");
    try {
      await exportNvBomComparison({ diff: result.diff, annotations: notes, modelLabel: result.modelLabel, beforeName: `${before.file.name} · ${beforeSheet!.name}`, afterName: `${after.file.name} · ${afterSheet!.name}`,
        review: { currentBomName: currentBomName ?? "未選取", rows: Object.fromEntries((interpretation?.entries ?? []).map(entry => {
          const link = links.get(entry.change.id);
          const candidates = link?.candidates.map(candidate => [candidate.refDes, candidate.mpn, currentBomCandidateLabel(candidate)].filter(Boolean).join(" · ")) ?? [];
          return [entry.change.id, { scope: NV_BOM_SCOPE_LABELS[entry.scope], action: NV_BOM_INTERPRETATION_LABELS[entry.kind], summary: entry.summary,
            removedRefs: entry.removedRefs.join("、"), addedRefs: entry.addedRefs.join("、"), mountedRefs: entry.mountedRefs.join("、"), unmountedRefs: entry.unmountedRefs.join("、"), currentMatch: [link && `${link.relatedMain ? "關聯主料 · " : ""}${NV_BOM_TABLE_LINK_LABELS[link.state]}`, ...candidates].filter(Boolean).join("\n") }];
        })) } });
      setNotice("已匯出差異、目前表格對應、待人工核對項目與備註。");
    }
    catch (failure) { setNotice(failure instanceof Error ? failure.message : "匯出失敗，請重試。"); }
    finally { if (mounted.current) setExporting(false); }
  }
  if (!active) return null;
  return <section className="nv-bom-compare" data-testid="nv-bom-compare" aria-label="NV 原始 BOM 比對">
    <div className="nv-bom-actions"><Button type="button" variant="ghost" onClick={() => { controller.current?.abort(); onBack(); }}><ArrowLeft aria-hidden="true" />返回版本管理</Button>{!result && <p>選擇新舊工作表，確認料號、用量與位號欄位。</p>}<Button type="button" variant="outline" disabled={!result || exporting} onClick={() => void download()}><Download aria-hidden="true" />{exporting ? "匯出中…" : selectedResult && selectedResult !== LOCAL_RESULT ? "匯出此 AI 結果" : "匯出比對結果"}</Button></div>
    <details className="nv-bom-settings" open={settings} onToggle={event => setSettings(event.currentTarget.open)}><summary><FileSpreadsheet aria-hidden="true" /><strong>比對來源與欄位</strong><span>{before?.file.name ?? "選擇舊版"} → {after?.file.name ?? "選擇新版"}</span></summary><div className="nv-bom-settings-content">
      <div className="nv-bom-sources">
        <SourcePicker side="before" value={before} busy={busy} mapping={beforeMap} onMapping={value => editMapping("before", value)} onReading={setBeforeReading} onChange={value => selectSource("before", value)} />
        <SourcePicker side="after" value={after} busy={busy} mapping={afterMap} onMapping={value => editMapping("after", value)} onReading={setAfterReading} onChange={value => selectSource("after", value)} />
      </div>
      <div className="nv-bom-model-heading"><strong>AI 辨識與核對（選用）{!loading && models.length > 0 && ` · ${models.length} 個選項`}</strong><Button type="button" variant="ghost" disabled={busy || loading || !models.length} onClick={() => setSelected(models.map(model => model.id))}>全選</Button><Button type="button" variant="ghost" disabled={busy || !selected.length} onClick={() => setSelected([])}>清除選取</Button></div>
      {loading && <p role="status">正在讀取可用 AI…</p>}{modelError && <p role="alert" className="nv-bom-error">{modelError}<Button type="button" variant="ghost" onClick={() => void loadModels()}>重試讀取</Button></p>}
      {!loading && !modelError && !models.length && <p className="nv-bom-help">目前無可用的 AI 核對服務，可直接在本機比對。</p>}
      <div className="nv-bom-models" role="group" aria-label="BOM 比對 AI 服務">{models.map(model => <label key={model.id}><input type="checkbox" disabled={busy} checked={selected.includes(model.id)} onChange={event => setSelected(current => event.target.checked ? [...current, model.id] : current.filter(id => id !== model.id))} /><span>{model.label}</span></label>)}</div>
      <p className="nv-bom-help">勾選 AI 後，格式有變時會自動辨識表頭。料件配對在本機完成，再交由勾選的 AI 核對差異。手動指定的欄位優先使用。</p>
    </div></details>
    {(!result || settings || busy) ? <div className="nv-bom-runbar"><Button type="button" disabled={busy || beforeReading || afterReading || !beforeSheet || !afterSheet} onClick={() => void run()}><Check aria-hidden="true" />確認欄位並比對{selected.length ? `（${selected.length} 項 AI 核對）` : ""}</Button>{busy && <Button type="button" variant="outline" onClick={() => controller.current?.abort()}>停止 AI 核對</Button>}<span role="status">{notice || (busy ? "AI 核對中，可先查看本機結果。" : "")}</span></div> : notice && <p className="nv-bom-help" role="status">{notice}</p>}
    {compareError && <p role="alert" className="nv-bom-error">{compareError}</p>}
    {Object.keys(runs).length > 1 && <div className="nv-bom-results-tabs" role="tablist" aria-label="比對結果"><button type="button" role="tab" aria-selected={selectedResult === LOCAL_RESULT} onClick={() => changeFilter(setSelectedResult, LOCAL_RESULT)}><span>本機比對</span><small>依確認欄位</small></button>{models.filter(model => runs[model.id]).map(model => <button key={model.id} type="button" role="tab" aria-selected={selectedResult === model.id} onClick={() => changeFilter(setSelectedResult, model.id)}><span>{model.label}</span><small>{runs[model.id].state === "running" ? <LoaderCircle className="nv-spin" aria-hidden="true" /> : runs[model.id].state === "done" ? <Check aria-hidden="true" /> : null}{runs[model.id].progress}</small></button>)}</div>}
    {activeRun?.error && <p role="alert" className="nv-bom-error">{activeRun.error}{!busy && <Button type="button" variant="outline" onClick={() => void run([selectedResult])}>重試這個 AI</Button>}</p>}
    {result ? <>
      <div className="nv-bom-summary">
        <div className="nv-bom-summary-heading"><h3>{result.diff.changes.length.toLocaleString()} 筆差異</h3><span>未變更 {result.diff.unchanged.toLocaleString()} 組</span>{selectedResult !== LOCAL_RESULT && <small>AI 已核對 {result.reviewed}／{result.diff.changes.length} 筆</small>}</div>
        {currentBomName && <p className="nv-bom-table-context"><strong>對照目前表格</strong> <span>{currentBomName}</span></p>}
        <div className="nv-bom-scope-buttons" aria-label="項目類別">
          <button type="button" aria-pressed={scope === "all"} onClick={() => changeFilter(setScope, "all")}>全部 <b>{result.diff.changes.length}</b></button>
          {(Object.entries(NV_BOM_SCOPE_LABELS) as [NvBomInterpretedChange["scope"], string][]).map(([value, label]) => Boolean(scopeCounts?.[value]) && <button type="button" key={value} aria-pressed={scope === value} onClick={() => changeFilter(setScope, value)}>{label} <b>{scopeCounts?.[value]}</b></button>)}
        </div>
      </div>
      {result.diff.unresolved.length > 0 && <details className="nv-bom-unresolved">
        <summary>待人工核對 {result.diff.unresolved.length.toLocaleString()} 筆</summary>
        <ul>{result.diff.unresolved.slice(0, unresolvedLimit).map(item => <li key={item.id}>
          <strong>{item.side === "before" ? "舊版" : "新版"}第 {item.part.sourceRows.join("、")} 列</strong>
          <span>{[item.part.partNumber, item.part.mpn, item.part.manufacturer, item.part.refs].filter(Boolean).join(" · ") || item.part.description || "缺少識別資料"}</span>
          <small>{item.reason}</small>
        </li>)}</ul>
        {unresolvedLimit < result.diff.unresolved.length && <Button type="button" variant="outline" onClick={() => setUnresolvedLimit(value => value + PAGE_SIZE)}>顯示更多待核對項目</Button>}
      </details>}
      {result.diff.warnings.length > 0 && <details className="nv-bom-warnings"><summary>有 {result.diff.warnings.length} 項來源資料需核對</summary>{result.diff.warnings.map((note, index) => <p key={index}>{note}</p>)}</details>}
      <details className="nv-bom-mapping-review"><summary>檢視已確認的欄位對應</summary>{mappingModel && <p>表頭辨識由 {mappingModel} 協助</p>}{(["before", "after"] as const).map(side => { const mapping = side === "before" ? result.beforeMapping : result.afterMapping; const sheet = side === "before" ? beforeSheet! : afterSheet!; return <p key={side}><strong>{side === "before" ? "舊版" : "新版"} · 表頭第 {mapping.headerRow} 列：</strong>{NV_BOM_FIELDS.map(field => `${field.label}＝${mapping[field.key] ? `${mapping[field.key]}（${sheet.rows[mapping.headerRow - 1]?.[mapping[field.key]! - 1] ?? ""}）` : "略過"}`).join("；")}</p>; })}<Button type="button" variant="ghost" onClick={() => setSettings(true)}>調整欄位後重新比對</Button></details>
      <div className="nv-bom-filters"><label className="nv-bom-search"><Search aria-hidden="true" /><input aria-label="搜尋 NV BOM 差異" value={query} onChange={event => changeFilter(setQuery, event.target.value)} placeholder="搜尋位號、NV／PEGA 料號、MPN 或備註" /></label><select aria-label="差異類型" value={kind} onChange={event => changeFilter(setKind, event.target.value as ReviewKind)}><option value="all">全部變更</option>{Object.entries(NV_BOM_INTERPRETATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="人工核對狀態" value={checked} onChange={event => changeFilter(setChecked, event.target.value)}><option value="all">全部核對狀態</option><option value="pending">尚未核對</option><option value="checked">已核對</option></select><span>{filtered.length.toLocaleString()}／{result.diff.changes.length.toLocaleString()} 筆</span></div>
      {(query || kind !== "all" || scope !== "all" || checked !== "all") && <div className="nv-bom-chips">{query && <button onClick={() => changeFilter(setQuery, "")}>搜尋：{query}<X aria-hidden="true" /></button>}{kind !== "all" && <button onClick={() => changeFilter(setKind, "all")}>變更：{NV_BOM_INTERPRETATION_LABELS[kind]}<X aria-hidden="true" /></button>}{scope !== "all" && <button onClick={() => changeFilter(setScope, "all")}>項目：{NV_BOM_SCOPE_LABELS[scope]}<X aria-hidden="true" /></button>}{checked !== "all" && <button onClick={() => changeFilter(setChecked, "all")}>核對：{checked === "checked" ? "已核對" : "尚未核對"}<X aria-hidden="true" /></button>}<button onClick={() => { setQuery(""); setKind("all"); setScope("all"); setChecked("all"); setPage(1); }}>全部清除</button></div>}
      <div className="nv-bom-result" aria-label="NV BOM 變更清單">
        <div className="nv-bom-result-line nv-bom-result-heading" aria-hidden="true"><span>核對</span><span>實際變更</span><span>位號</span><span>目前表格</span><span>原始資料</span></div>
        {!shown.length ? <p className="nv-bom-empty">{result.diff.changes.length ? "目前篩選條件沒有符合的差異" : "這兩份工作表沒有可確認的差異"}</p> : shown.map(entry => {
          const id = entry.change.id;
          return <NvBomReviewRow key={`${selectedResult}:${id}`} entry={{ ...entry, change: visibleChanges.get(id) ?? entry.change }} link={links.get(id)} note={notes[id]} showAi={selectedResult !== LOCAL_RESULT}
            onAnnotate={patch => annotate(id, patch)} onCopy={value => void copy(value)} onLocate={onLocateCurrentBom && locate} />;
        })}
      </div>
      <footer className="nv-bom-pagination"><span>每頁 {PAGE_SIZE} 筆 · 第 {Math.min(page, pageCount)}／{pageCount} 頁</span><Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>上一頁</Button><Button type="button" variant="outline" disabled={page >= pageCount} onClick={() => setPage(value => value + 1)}>下一頁</Button></footer>
    </> : !busy && <div className="nv-bom-empty"><Sparkles aria-hidden="true" /><h3>比對兩份 NV 原始 BOM</h3><p>選擇新舊工作表，核對畫面上的欄位後再開始。</p></div>}
  </section>;
}
