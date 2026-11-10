import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Copy, Download, FileSpreadsheet, LoaderCircle, Search, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MaterialTableScroll } from "./MaterialTableScroll";
import { NV_BOM_CHANGE_LABELS, NV_BOM_FIELDS, exportNvBomComparison, readNvBomFile, type NvBomAnnotation, type NvBomFile, type NvBomMapping } from "./nvBomCompare";
import { loadNvBomModels, runNvBomComparison, type NvBomAiResult, type NvBomModel } from "./nvBomCompareAi";
import "./nvBomCompare.css";

type Source = { file: NvBomFile; sheet: number };
type Run = { state: "running" | "done" | "failed" | "cancelled"; progress: string; error?: string; result?: NvBomAiResult };
const emptyMapping = (): NvBomMapping => ({ headerRow: 1, partNumber: null, mpn: null, manufacturer: null, description: null, qty: null, refs: null });
const PAGE_SIZE = 50;
const EMPTY_NOTES: Record<string, NvBomAnnotation> = {};

function SourcePicker({ side, value, busy, manual, mapping, onMapping, onChange, onReading }: {
  side: "before" | "after"; value: Source | null; busy: boolean; manual: boolean; mapping: NvBomMapping;
  onMapping: (mapping: NvBomMapping) => void; onChange: (source: Source) => void; onReading: (reading: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null), request = useRef(0);
  const [reading, setReading] = useState(false), [error, setError] = useState("");
  useEffect(() => () => { request.current++; }, []);
  const label = side === "before" ? "舊版 NV BOM" : "新版 NV BOM";
  const sheet = value?.file.sheets[value.sheet];
  async function accept(files: FileList | File[] | null) {
    if (!files?.length || busy || reading) return;
    if (files.length !== 1) { setError("每個區域放一份 BOM，請分別放入舊版與新版。"); return; }
    const captured = ++request.current; setReading(true); onReading(true); setError("");
    try { const file = await readNvBomFile(files[0]); if (captured === request.current) { onChange({ file, sheet: 0 }); onMapping(emptyMapping()); } }
    catch (failure) { if (captured === request.current) setError(failure instanceof Error ? failure.message : "讀取失敗，請重新選擇檔案。"); }
    finally { if (captured === request.current) { setReading(false); onReading(false); } }
  }
  return <section className="nv-bom-source" data-side={side} aria-label={label} onDragOver={event => { event.preventDefault(); }} onDrop={event => { event.preventDefault(); void accept(event.dataTransfer.files); }}>
    <div className="nv-bom-source-heading"><strong><span>{side === "before" ? "A" : "B"}</span>{label}</strong><Button type="button" variant="outline" disabled={busy || reading} onClick={() => input.current?.click()}><Upload aria-hidden="true" />{value ? "更換檔案" : "選擇檔案"}</Button></div>
    <input ref={input} type="file" accept=".xlsx,.xls,.xlsm,.csv" aria-label={`選擇${label}`} className="sr-only" disabled={busy || reading} onChange={event => { void accept(event.target.files); event.target.value = ""; }} />
    {reading ? <p role="status"><LoaderCircle className="nv-spin" aria-hidden="true" />讀取 Excel 中…</p> : value ? <><p className="nv-bom-filename"><FileSpreadsheet aria-hidden="true" /><span title={value.file.name}>{value.file.name}</span></p><label>工作表<select aria-label={`${label}工作表`} value={value.sheet} disabled={busy} onChange={event => { onChange({ ...value, sheet: Number(event.target.value) }); onMapping(emptyMapping()); }}>{value.file.sheets.map((item, index) => <option key={item.name} value={index}>{item.name} · {item.rows.length.toLocaleString()} 列</option>)}</select></label></> : <button className="nv-bom-drop" type="button" disabled={busy} onClick={() => input.current?.click()}><FileSpreadsheet aria-hidden="true" /><span>將{side === "before" ? "舊版" : "新版"} Excel 拖入這裡</span><small>XLSX、XLS、XLSM 或 CSV</small></button>}
    {error && <p role="alert" className="nv-bom-error">{error}</p>}
    {manual && sheet && <div className="nv-bom-mapping"><label>表頭在第幾列<input type="number" min={1} max={sheet.rows.length - 1} value={mapping.headerRow} disabled={busy} onChange={event => onMapping({ ...emptyMapping(), headerRow: Math.min(sheet.rows.length - 1, Math.max(1, Number(event.target.value) || 1)) })} /></label>{NV_BOM_FIELDS.map(field => <label key={field.key}>{field.label}<select aria-label={`${label}${field.label}對應欄位`} value={mapping[field.key] ?? ""} disabled={busy} onChange={event => onMapping({ ...mapping, [field.key]: event.target.value ? Number(event.target.value) : null })}><option value="">沒有此欄位</option>{(sheet.rows[mapping.headerRow - 1] ?? []).map((cell, index) => <option key={index} value={index + 1}>{index + 1} · {cell || "（空白表頭）"}</option>)}</select></label>)}</div>}
  </section>;
}

export default function NvBomComparePanel({ active, onBack }: { active: boolean; onBack: () => void }) {
  const [before, setBefore] = useState<Source | null>(null), [after, setAfter] = useState<Source | null>(null);
  const [beforeReading, setBeforeReading] = useState(false), [afterReading, setAfterReading] = useState(false);
  const [models, setModels] = useState<NvBomModel[]>([]), [selected, setSelected] = useState<string[]>([]), [loading, setLoading] = useState(false), [modelError, setModelError] = useState("");
  const [runs, setRuns] = useState<Record<string, Run>>({}), [selectedResult, setSelectedResult] = useState("");
  const [busy, setBusy] = useState(false), [settings, setSettings] = useState(true), [manual, setManual] = useState(false);
  const [beforeMap, setBeforeMap] = useState(emptyMapping), [afterMap, setAfterMap] = useState(emptyMapping);
  const [annotations, setAnnotations] = useState<Record<string, Record<string, NvBomAnnotation>>>({});
  const [query, setQuery] = useState(""), [kind, setKind] = useState("all"), [checked, setChecked] = useState("all"), [page, setPage] = useState(1);
  const [notice, setNotice] = useState(""), [exporting, setExporting] = useState(false);
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
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return (result?.diff.changes ?? []).filter(item => (kind === "all" || item.kind === kind) && (checked === "all" || Boolean(notes[item.id]?.checked) === (checked === "checked"))
      && (!keyword || [item.before?.partNumber, item.after?.partNumber, item.before?.mpn, item.after?.mpn, item.before?.manufacturer, item.after?.manufacturer, item.before?.description, item.after?.description, item.before?.refs, item.after?.refs, notes[item.id]?.note].some(value => value?.toLocaleLowerCase().includes(keyword))));
  }, [result, query, kind, checked, notes]);
  useEffect(() => { setPage(1); }, [query, kind, checked, selectedResult]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), shown = filtered.slice((Math.min(page, pageCount) - 1) * PAGE_SIZE, Math.min(page, pageCount) * PAGE_SIZE);
  const counts = result?.diff.changes.reduce((value, item) => { value[item.kind]++; return value; }, { added: 0, removed: 0, changed: 0 });
  function clearResults() { setRuns({}); setAnnotations({}); setSelectedResult(""); setNotice(""); setPage(1); }
  async function run(ids = selected) {
    if (!beforeSheet || !afterSheet || busy || beforeReading || afterReading || !ids.length) return;
    const targets = models.filter(model => ids.includes(model.id));
    if (!targets.length) return;
    const request = new AbortController(); controller.current = request; setBusy(true); setNotice("");
    setSelectedResult(current => ids.includes(current) ? current : targets[0].id);
    setRuns(current => ({ ...current, ...Object.fromEntries(targets.map(model => [model.id, { state: "running", progress: "準備比對…" }])) }));
    let index = 0;
    const update = (id: string, patch: Partial<Run>) => { if (mounted.current && controller.current === request) setRuns(current => ({ ...current, [id]: { ...current[id], ...patch } })); };
    const worker = async () => {
      while (index < targets.length) {
        const model = targets[index++];
        if (request.signal.aborted) { update(model.id, { state: "cancelled", progress: "已停止" }); continue; }
        try {
          await runNvBomComparison({ before: beforeSheet, after: afterSheet, model, signal: request.signal,
            ...(manual ? { mappings: { before: beforeMap, after: afterMap } } : {}),
            onProgress: progress => update(model.id, { progress }), onResult: value => { update(model.id, { result: value }); if (mounted.current && !request.signal.aborted) setSettings(false); } });
          update(model.id, { state: "done" });
        } catch (failure) {
          update(model.id, request.signal.aborted ? { state: "cancelled", progress: "已停止；完成的表格保留" } : { state: "failed", progress: "尚未完成", error: failure instanceof Error ? failure.message : "AI 比對失敗，請重試。" });
        }
      }
    };
    await Promise.allSettled(Array.from({ length: Math.min(2, targets.length) }, worker));
    if (mounted.current && controller.current === request) { controller.current = null; setBusy(false); }
  }
  function annotate(id: string, patch: Partial<NvBomAnnotation>) {
    setAnnotations(current => ({ ...current, [selectedResult]: { ...current[selectedResult], [id]: { checked: false, note: "", ...current[selectedResult]?.[id], ...patch } } }));
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice(`已複製 ${value}`); }
    catch { setNotice("未能自動複製，請選取料號文字後按 Ctrl+C。"); }
  }
  async function download() {
    if (!result || !before || !after || exporting) return;
    setExporting(true); setNotice("");
    try { await exportNvBomComparison({ diff: result.diff, annotations: notes, modelLabel: result.modelLabel, beforeName: `${before.file.name} · ${beforeSheet!.name}`, afterName: `${after.file.name} · ${afterSheet!.name}` }); setNotice("已匯出此 AI 的全部差異與人工備註。"); }
    catch (failure) { setNotice(failure instanceof Error ? failure.message : "匯出失敗，請重試。"); }
    finally { if (mounted.current) setExporting(false); }
  }
  if (!active) return null;
  return <section className="nv-bom-compare" data-testid="nv-bom-compare" aria-label="NV 原始 BOM 比對">
    <div className="nv-bom-actions"><Button type="button" variant="ghost" onClick={() => { controller.current?.abort(); onBack(); }}><ArrowLeft aria-hidden="true" />返回版本管理</Button><p>上傳兩份原始 BOM，選擇 AI，查看新增料與刪除料。</p><Button type="button" variant="outline" disabled={!result || exporting} onClick={() => void download()}><Download aria-hidden="true" />{exporting ? "匯出中…" : "匯出此 AI 結果"}</Button></div>
    <details className="nv-bom-settings" open={settings} onToggle={event => setSettings(event.currentTarget.open)}><summary><FileSpreadsheet aria-hidden="true" /><strong>比對來源與 AI</strong><span>{before?.file.name ?? "選擇舊版"} → {after?.file.name ?? "選擇新版"}</span><small>{selected.length} 項 AI</small></summary><div className="nv-bom-settings-content">
      <div className="nv-bom-sources"><SourcePicker side="before" value={before} busy={busy} manual={manual} mapping={beforeMap} onMapping={setBeforeMap} onReading={setBeforeReading} onChange={value => { clearResults(); setBefore(value); }} /><SourcePicker side="after" value={after} busy={busy} manual={manual} mapping={afterMap} onMapping={setAfterMap} onReading={setAfterReading} onChange={value => { clearResults(); setAfter(value); }} /></div>
      <div className="nv-bom-model-heading"><strong>選擇要用的 AI，可複選{!loading && models.length > 0 && ` · ${models.length} 個選項`}</strong><Button type="button" variant="ghost" disabled={busy || loading || !models.length} onClick={() => setSelected(models.map(model => model.id))}>全選</Button><Button type="button" variant="ghost" disabled={busy || !selected.length} onClick={() => setSelected([])}>清除選取</Button><label className="nv-bom-manual"><input type="checkbox" checked={manual} disabled={busy} onChange={event => setManual(event.target.checked)} />自行指定欄位</label></div>
      {loading && <p role="status">正在讀取可用 AI…</p>}{modelError && <p role="alert" className="nv-bom-error">{modelError}<Button type="button" variant="ghost" onClick={() => void loadModels()}>重試讀取</Button></p>}
      {!loading && !modelError && !models.length && <p className="nv-bom-help">目前沒有可使用的 AI，請在後台 API 設定加入服務並開放使用權限。</p>}
      <div className="nv-bom-models" role="group" aria-label="BOM 比對 AI 服務">{models.map(model => <label key={model.id}><input type="checkbox" disabled={busy} checked={selected.includes(model.id)} onChange={event => setSelected(current => event.target.checked ? [...current, model.id] : current.filter(id => id !== model.id))} /><span>{model.label}</span></label>)}</div>
      <p className="nv-bom-help">AI 辨識欄位後，逐列比對選取工作表的全部資料，再核對差異並提供手動修改建議。每個 AI 獨立產生結果；不會自動修改網站 BOM。</p>
    </div></details>
    <div className="nv-bom-runbar"><Button type="button" disabled={busy || beforeReading || afterReading || !beforeSheet || !afterSheet || !selected.length} onClick={() => void run()}><Sparkles aria-hidden="true" />開始 AI 比對{selected.length ? `（${selected.length}）` : ""}</Button>{busy && <Button type="button" variant="outline" onClick={() => controller.current?.abort()}>停止比對</Button>}<span role="status">{notice || (busy ? "比對進行中，已完成的結果可先查看。" : "備註與核對標記保留在本次視窗，可匯出 Excel。")}</span></div>
    {!!Object.keys(runs).length && <div className="nv-bom-results-tabs" role="tablist" aria-label="各 AI 比對結果">{models.filter(model => runs[model.id]).map(model => <button key={model.id} type="button" role="tab" aria-selected={selectedResult === model.id} onClick={() => setSelectedResult(model.id)}><span>{model.label}</span><small>{runs[model.id].state === "running" ? <LoaderCircle className="nv-spin" aria-hidden="true" /> : runs[model.id].state === "done" ? <Check aria-hidden="true" /> : null}{runs[model.id].progress}</small></button>)}</div>}
    {activeRun?.error && <p role="alert" className="nv-bom-error">{activeRun.error}{!busy && <Button type="button" variant="outline" onClick={() => void run([selectedResult])}>重試這個 AI</Button>}</p>}
    {result ? <>
      <div className="nv-bom-summary"><strong>新增 <b>{counts!.added}</b></strong><strong>刪除 <b>{counts!.removed}</b></strong><strong>資料變更 <b>{counts!.changed}</b></strong><span>舊版 {result.diff.beforeCount.toLocaleString()} 料 · 新版 {result.diff.afterCount.toLocaleString()} 料 · 未變更 {result.diff.unchanged.toLocaleString()} 料</span><small>AI 已核對 {result.reviewed}／{result.diff.changes.length} 筆差異</small></div>
      {(result.diff.warnings.length > 0 || result.warnings.length > 0) && <details className="nv-bom-warnings"><summary>有 {result.diff.warnings.length + result.warnings.length} 項來源資料需核對</summary>{[...result.warnings, ...result.diff.warnings].map((note, index) => <p key={index}>{note}</p>)}</details>}
      <details className="nv-bom-mapping-review"><summary>檢視此 AI 辨識的欄位對應</summary>{(["before", "after"] as const).map(side => { const mapping = side === "before" ? result.beforeMapping : result.afterMapping; const sheet = side === "before" ? beforeSheet! : afterSheet!; return <p key={side}><strong>{side === "before" ? "舊版" : "新版"} · 表頭第 {mapping.headerRow} 列：</strong>{NV_BOM_FIELDS.map(field => `${field.label}＝${mapping[field.key] ? `${mapping[field.key]}（${sheet.rows[mapping.headerRow - 1]?.[mapping[field.key]! - 1] ?? ""}）` : "沒有此欄位"}`).join("；")}</p>; })}<Button type="button" variant="ghost" onClick={() => { setBeforeMap(result.beforeMapping); setAfterMap(result.afterMapping); setManual(true); setSettings(true); }}>調整欄位後重新比對</Button></details>
      <div className="nv-bom-filters"><label className="nv-bom-search"><Search aria-hidden="true" /><input aria-label="搜尋 NV BOM 差異" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜尋料號、MPN、廠商、位號或備註" /></label><select aria-label="差異類型" value={kind} onChange={event => setKind(event.target.value)}><option value="all">全部差異</option>{Object.entries(NV_BOM_CHANGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="人工核對狀態" value={checked} onChange={event => setChecked(event.target.value)}><option value="all">全部核對狀態</option><option value="pending">尚未核對</option><option value="checked">已核對</option></select><span>{filtered.length.toLocaleString()}／{result.diff.changes.length.toLocaleString()} 筆</span></div>
      {(query || kind !== "all" || checked !== "all") && <div className="nv-bom-chips">{query && <button onClick={() => setQuery("")}>搜尋：{query}<X aria-hidden="true" /></button>}{kind !== "all" && <button onClick={() => setKind("all")}>差異：{NV_BOM_CHANGE_LABELS[kind as keyof typeof NV_BOM_CHANGE_LABELS]}<X aria-hidden="true" /></button>}{checked !== "all" && <button onClick={() => setChecked("all")}>核對：{checked === "checked" ? "已核對" : "尚未核對"}<X aria-hidden="true" /></button>}<button onClick={() => { setQuery(""); setKind("all"); setChecked("all"); }}>全部清除</button></div>}
      <div className="nv-bom-table"><MaterialTableScroll><table><thead><tr><th>核對</th><th>差異</th><th>NV／來源料號</th><th>MPN／廠商</th><th>料名／描述</th><th>數量<br />舊 → 新</th><th>位號<br />舊 → 新</th><th>來源列<br />舊 → 新</th><th>AI 手動修改建議</th><th>人工備註</th></tr></thead><tbody>{!shown.length ? <tr><td colSpan={10} className="nv-bom-empty">{result.diff.changes.length ? "目前篩選條件沒有符合的差異" : "這兩份工作表沒有新增、刪除或資料變更"}</td></tr> : shown.map(item => { const part = (item.after ?? item.before)!; return <tr key={item.id} data-kind={item.kind} data-checked={Boolean(notes[item.id]?.checked)}><td><input type="checkbox" aria-label={`已核對 ${part.partNumber || part.mpn}`} checked={Boolean(notes[item.id]?.checked)} onChange={event => annotate(item.id, { checked: event.target.checked })} /></td><td><span className="nv-bom-kind">{NV_BOM_CHANGE_LABELS[item.kind]}</span></td><td><div className="nv-bom-copy"><span>{part.partNumber || "—"}</span>{part.partNumber && <button type="button" aria-label={`複製料號 ${part.partNumber}`} onClick={() => void copy(part.partNumber)}><Copy aria-hidden="true" /></button>}</div></td><td><div className="nv-bom-copy"><span>{part.mpn || "—"}</span>{part.mpn && <button type="button" aria-label={`複製 MPN ${part.mpn}`} onClick={() => void copy(part.mpn)}><Copy aria-hidden="true" /></button>}</div><small>{part.manufacturer}</small></td><td>{part.description || "—"}</td><td><span>{item.before?.qty || "—"}</span><b>→ {item.after?.qty || "—"}</b></td><td><span>{item.before?.refs || "—"}</span><b>→ {item.after?.refs || "—"}</b></td><td><span>{item.before?.sourceRows.join(", ") || "—"}</span><b>→ {item.after?.sourceRows.join(", ") || "—"}</b></td><td>{item.advice ? <><span>{item.advice}</span><small>{item.aiNote}</small></> : <span className="nv-bom-unreviewed">尚未完成 AI 核對</span>}</td><td><textarea aria-label={`${part.partNumber || part.mpn} 人工備註`} rows={2} value={notes[item.id]?.note ?? ""} onChange={event => annotate(item.id, { note: event.target.value })} placeholder="手動修改紀錄…" /></td></tr>; })}</tbody></table></MaterialTableScroll></div>
      <footer className="nv-bom-pagination"><span>每頁 {PAGE_SIZE} 筆 · 第 {Math.min(page, pageCount)}／{pageCount} 頁</span><Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>上一頁</Button><Button type="button" variant="outline" disabled={page >= pageCount} onClick={() => setPage(value => value + 1)}>下一頁</Button></footer>
    </> : !busy && <div className="nv-bom-empty"><Sparkles aria-hidden="true" /><h3>找出新版增加與刪除的料</h3><p>分別放入兩份 NV 原始 BOM，勾選想用的 AI，再按「開始 AI 比對」。</p></div>}
  </section>;
}
