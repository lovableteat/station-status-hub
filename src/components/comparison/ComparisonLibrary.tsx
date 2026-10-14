import { useEffect, useRef, useState } from "react";
import { BookOpen, FileUp, Search, X, Download, ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { replaceWorkspaceHistory } from "@/lib/workspaceHistory";
import type { ComparisonRuntime } from "./runtime";
import type { InputFile } from "./types";
import { downloadLocal } from "./downloads";
import { DatasheetFiles } from "./DatasheetFiles";
import { filePath } from "./files";
import { DATASHEET_FILE_LIMIT, DATASHEET_COUNT_LIMIT } from "./datasheetSelection";

export interface LibraryResult { entries: Record<string, unknown>[]; yaml: string; errors: string[]; warnings: string[]; }
interface DatasheetDraft { entry: Record<string, unknown>; entry_yaml: string; pages: number[]; notes: string[]; pageTexts?: { page: number; text: string }[]; }
interface DraftWork { name: string; mpn: string; draft: DatasheetDraft | null; candidate: string; confirmed: boolean; state: "new" | "working" | "ready" | "error" | "signed"; error: string; }
const draftStates = { new: "尚未辨識", working: "辨識中", ready: "待核對", error: "辨識失敗", signed: "已簽核" };
function emptyDraft(file: File, index: number): DraftWork {
  const path = filePath(file).replace(/\.pdf$/i, "");
  const stem = file.name.replace(/\.pdf$/i, "");
  return { name: path.length <= 120 ? path : `${path.slice(0, 100)}…${index + 1}`, mpn: stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), draft: null, candidate: "", confirmed: false, state: "new", error: "" };
}
function text(value: unknown) { return value === undefined || value === null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value); }
export function ComparisonLibrary({ runtime, yaml, entries, onEntries, onSave, canEdit, signedBy, busy, runJob }: { runtime: ComparisonRuntime; yaml: string; entries: Record<string, unknown>[]; onEntries: (entries: Record<string, unknown>[]) => void; onSave: (yaml: string) => Promise<void>; canEdit: boolean; signedBy: string; busy: boolean; runJob: <T>(work: () => Promise<T>) => Promise<T | undefined> }) {
  const [editor, setEditor] = useState(yaml);
  const [pdfs, setPdfs] = useState<File[]>([]);
  const [activePath, setActivePath] = useState("");
  const [work, setWork] = useState<Record<string, DraftWork>>({});
  const [batchProgress, setBatchProgress] = useState("");
  const batchPending = useRef(false);
  const pdf = pdfs.find(file => filePath(file) === activePath) ?? null;
  const active = work[activePath] ?? (pdf ? emptyDraft(pdf, pdfs.indexOf(pdf)) : null);
  const { draft = null, candidate = "", name = "", mpn = "", confirmed = false } = active ?? {};
  const [who, setWho] = useState(signedBy);
  const [issues, setIssues] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const loadGeneration = useRef(0);
  const mounted = useRef(false);
  const initialLoadStarted = useRef(false);
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("librarySearch") ?? "");
  const [verification, setVerification] = useState(() => { const value = new URLSearchParams(window.location.search).get("librarySigned"); return value === "signed" || value === "unsigned" ? value : "all"; });
  const upload = useRef<HTMLInputElement>(null);
  const updateActive = (update: Partial<DraftWork>) => { if (active) setWork(current => ({ ...current, [activePath]: { ...active, ...update } })); };
  const setCandidate = (value: string) => updateActive({ candidate: value, confirmed: false, state: "ready" });
  const setConfirmed = (value: boolean) => updateActive({ confirmed: value });
  const setName = (value: string) => updateActive({ name: value, draft: null, candidate: "", confirmed: false, state: "new" });
  const setMpn = (value: string) => updateActive({ mpn: value, draft: null, candidate: "", confirmed: false, state: "new" });
  const selectFiles = (next: File[]) => {
    if (batchPending.current) return;
    const paths = new Set(next.map(filePath));
    setPdfs(next); setWork(current => Object.fromEntries(Object.entries(current).filter(([path]) => paths.has(path))));
    if (!paths.has(activePath)) setActivePath(next.length ? filePath(next[0]) : "");
    setIssues([]); setMessage(""); setBatchProgress("");
  };
  const selectDraft = (path: string) => {
    if (batchPending.current) return;
    setActivePath(path); setIssues([]);
    setWork(current => current[path] ? { ...current, [path]: { ...current[path], confirmed: false } } : current);
  };
  useEffect(() => setEditor(yaml), [yaml]);
  useEffect(() => { const restore = () => { const params = new URLSearchParams(window.location.search); setQuery(params.get("librarySearch") ?? ""); const value = params.get("librarySigned"); setVerification(value === "signed" || value === "unsigned" ? value : "all"); }; window.addEventListener("popstate", restore); return () => window.removeEventListener("popstate", restore); }, []);
  useEffect(() => { const url = new URL(window.location.href); if (query) url.searchParams.set("librarySearch", query); else url.searchParams.delete("librarySearch"); if (verification !== "all") url.searchParams.set("librarySigned", verification); else url.searchParams.delete("librarySigned"); if (url.href !== window.location.href) replaceWorkspaceHistory(url); }, [query, verification]);
  const validate = async (sign = false) => {
    const generation = runtime.generation;
    const path = activePath;
    setMessage(""); setIssues([]);
    const result = await runJob(() => runtime.request<LibraryResult>("library", { yaml: editor, ...(sign ? { entryYaml: candidate, signedBy: who } : {}) }));
    if (!result || !mounted.current || generation !== runtime.generation) return;
    setIssues([...result.errors, ...result.warnings]);
    if (result.errors.length) return;
    const saved = await runJob(async () => { await onSave(result.yaml); return true; });
    if (saved === undefined || !mounted.current || generation !== runtime.generation) return;
    if (sign) setWork(current => current[path] ? { ...current, [path]: { ...current[path], state: "signed", confirmed: false } } : current);
    onEntries(result.entries); setLoadState("ready"); setLoadError(""); setEditor(result.yaml); setMessage(sign ? "已簽核並儲存；下次比對使用這份位址庫" : "使用者位址庫已儲存");
  };
  const load = async () => {
    const generation = ++loadGeneration.current;
    setLoadState("loading"); setLoadError("");
    let failure = "載入未完成，請在目前作業結束後重試";
    const result = await runJob(async () => {
      try { return await runtime.request<LibraryResult>("library", { yaml }); }
      catch (error) { failure = error instanceof Error ? error.message : String(error); throw error; }
    });
    if (!mounted.current || generation !== loadGeneration.current) return;
    if (!result) { setLoadState("error"); setLoadError(failure); return; }
    onEntries(result.entries); setIssues(result.warnings);
    if (result.errors.length) { setLoadState("error"); setLoadError(result.errors.join("；")); return; }
    setLoadState("ready");
  };
  const loadOnMount = useRef(load);
  useEffect(() => {
    mounted.current = true;
    if (!initialLoadStarted.current) { initialLoadStarted.current = true; void loadOnMount.current(); }
    return () => { mounted.current = false; if (batchPending.current) runtime.cancel?.("已離開位址庫，批次辨識已停止"); };
  }, [runtime]);
  const makeDrafts = async (files: File[]) => {
    if (!files.length || batchPending.current || !canEdit) return;
    batchPending.current = true;
    const generation = runtime.generation;
    const current = () => mounted.current && generation === runtime.generation;
    setIssues([]); setMessage("");
    let completed = 0, failed = 0;
    try {
      await runJob(async () => {
        for (let index = 0; index < files.length; index++) {
          if (!current()) throw new Error("已停止批次辨識");
          const selected = files[index], path = filePath(selected);
          const item = work[path] ?? emptyDraft(selected, pdfs.indexOf(selected));
          setBatchProgress(`正在辨識 ${index + 1}／${files.length}：${path}`);
          setWork(previous => ({ ...previous, [path]: { ...item, state: "working", confirmed: false, error: "" } }));
          try {
            if (selected.size > DATASHEET_FILE_LIMIT) throw new Error("Datasheet PDF 不可超過 64 MiB");
            const bytes = await selected.arrayBuffer();
            if (!current()) throw new Error("已停止批次辨識");
            const file: InputFile = { path, bytes };
            const result = await runtime.request<DatasheetDraft>("datasheet", { file, name: item.name, mpn: item.mpn });
            if (!current()) throw new Error("已停止批次辨識");
            setWork(previous => ({ ...previous, [path]: { ...item, draft: result, candidate: result.entry_yaml, confirmed: false, state: "ready", error: "" } }));
            completed++;
          } catch (error) {
            if (!current()) throw error;
            setWork(previous => ({ ...previous, [path]: { ...item, state: "error", confirmed: false, error: error instanceof Error ? error.message : String(error) } }));
            failed++;
          }
        }
      });
    } finally {
      batchPending.current = false;
      if (mounted.current) {
        setBatchProgress("");
        setWork(previous => Object.fromEntries(Object.entries(previous).map(([path, item]) => [path, item.state === "working" ? { ...item, state: "error", error: "辨識已中斷，可重試這份 PDF" } : item])));
        setMessage(`本批完成 ${completed} 份${failed ? `，${failed} 份失敗` : ""}；候選規則需逐份核對後簽核`);
      }
    }
  };
  const filtered = entries.filter(entry => (!query.trim() || Object.values(entry).map(text).join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) && (verification === "all" || (verification === "signed" ? Boolean(entry.verified) : !entry.verified)));
  return <div className="comparison-library">
    <section className="comparison-section"><div className="comparison-section-heading"><div><h2><BookOpen />I²C 位址庫</h2><p>搜尋內建與已核對的使用者規則。使用者位址庫優先套用。</p></div><Button variant="ghost" onClick={() => void load()} disabled={busy || loadState === "loading"}><RefreshCw />重新整理</Button></div><div className="comparison-filterbar"><label className="comparison-search"><Search /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜尋名稱、料號或出處" aria-label="搜尋位址庫" /></label><Select value={verification} onValueChange={setVerification}><SelectTrigger aria-label="位址規則驗證狀態"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部驗證狀態</SelectItem><SelectItem value="signed">已驗證</SelectItem><SelectItem value="unsigned">待核對</SelectItem></SelectContent></Select></div>{(query || verification !== "all") && <div className="comparison-filter-chips">{query && <Button variant="outline" size="sm" onClick={() => setQuery("")} aria-label="清除位址庫搜尋條件">搜尋：{query}<X /></Button>}{verification !== "all" && <Button variant="outline" size="sm" onClick={() => setVerification("all")} aria-label="清除位址庫驗證條件">狀態：{verification === "signed" ? "已驗證" : "待核對"}<X /></Button>}<Button variant="ghost" size="sm" onClick={() => { setQuery(""); setVerification("all"); }}>全部清除</Button></div>}<Table className="comparison-library-table" aria-busy={loadState === "loading"}><TableHeader><TableRow><TableHead>名稱</TableHead><TableHead>料號規則</TableHead><TableHead>位址／類型</TableHead><TableHead>驗證</TableHead><TableHead>簽核／出處</TableHead></TableRow></TableHeader><TableBody>{loadState === "error" && <TableRow><TableCell colSpan={5}><div className="comparison-library-load-error" role="alert"><p>{loadError}</p><Button variant="outline" disabled={busy} onClick={() => load()}>重新載入</Button></div></TableCell></TableRow>}{filtered.map((entry, index) => <TableRow key={`${text(entry.name)}-${index}`}><TableCell><strong>{text(entry.name)}</strong><small>{text(entry.origin)}</small></TableCell><TableCell>{text(entry.mpn ?? entry.match ?? entry.part_regex)}</TableCell><TableCell>{entry.fixed !== undefined ? `固定 ${text(entry.fixed)}` : entry.base !== undefined ? `Base ${text(entry.base)}` : entry.table ? "位址對照表" : text(entry.kind) || "—"}</TableCell><TableCell><Badge className={entry.verified ? "comparison-verification is-signed" : "comparison-verification"}>{entry.verified ? "已驗證" : "待核對"}</Badge></TableCell><TableCell>{text(entry.signed_by)} {text(entry.signed_date)}<small>{text(entry.source ?? entry.src)}</small></TableCell></TableRow>)}{!filtered.length && loadState !== "error" && <TableRow><TableCell colSpan={5} className="comparison-empty-result">{loadState === "loading" ? <div role="status"><span className="comparison-progress-indicator" /><strong>正在載入位址庫…</strong><p>首次使用需下載執行套件，載入後即可搜尋與核對</p></div> : query || verification !== "all" ? "目前篩選條件沒有符合的位址規則" : <div><strong>位址庫目前沒有規則</strong><p>可展開下方工具，匯入 YAML 或核對 Datasheet 後新增</p></div>}</TableCell></TableRow>}</TableBody></Table><div className="comparison-library-footer" role="status">{loadState === "loading" ? "正在讀取內建與使用者位址規則" : `顯示 ${filtered.length} / ${entries.length} 筆位址規則`}</div></section>
    <details className="comparison-section comparison-library-candidates"><summary>整批匯入 Datasheet，建立位址規則</summary>
      <p className="comparison-help">整個資料夾一次選好，按「批次產生候選規則」。系統逐份辨識 PDF；完成後在下方選擇要核對的規格書，再個別簽核。</p>
      <DatasheetFiles value={pdfs} onChange={selectFiles} disabled={!canEdit || busy || batchPending.current} maxTotalBytes={DATASHEET_FILE_LIMIT * DATASHEET_COUNT_LIMIT} inputPrefix="comparison-library-datasheets" />
      <div className="comparison-actions"><Button disabled={!pdfs.some(file => work[filePath(file)]?.state !== "signed" && work[filePath(file)]?.state !== "ready") || !canEdit || busy || batchPending.current} onClick={() => void makeDrafts(pdfs.filter(file => work[filePath(file)]?.state !== "signed" && work[filePath(file)]?.state !== "ready"))}><FileUp />批次產生候選規則</Button><p className="comparison-help">已完成與已簽核的項目會保留；單份失敗可重試。候選暫存在此頁，離開前請核對並簽核。</p></div>
      {batchProgress && <p className="comparison-datasheets-notice" role="status">{batchProgress}</p>}
      {!!pdfs.length && <div className="comparison-datasheet-review-picker"><Label htmlFor="compare-datasheet-review">要核對的 Datasheet</Label><Select value={activePath} onValueChange={selectDraft} disabled={busy || batchPending.current}><SelectTrigger id="compare-datasheet-review" aria-label="要核對的 Datasheet"><SelectValue /></SelectTrigger><SelectContent>{pdfs.map(file => <SelectItem key={filePath(file)} value={filePath(file)}>{filePath(file)} · {draftStates[work[filePath(file)]?.state ?? "new"]}</SelectItem>)}</SelectContent></Select><p className="comparison-help">已選 {pdfs.length} 份 · 待核對 {Object.values(work).filter(item => item.state === "ready").length} 份 · 已簽核 {Object.values(work).filter(item => item.state === "signed").length} 份 · 失敗 {Object.values(work).filter(item => item.state === "error").length} 份</p></div>}
      {pdf && <div className="comparison-datasheet-inputs"><div><Label htmlFor="compare-library-name">這份規則名稱</Label><Input id="compare-library-name" value={name} maxLength={120} disabled={!canEdit || busy} onChange={event => setName(event.target.value)} /></div><div><Label htmlFor="compare-library-mpn">適用 IC 料號規則</Label><Input id="compare-library-mpn" value={mpn} maxLength={300} placeholder="例如 MP5926" disabled={!canEdit || busy} onChange={event => setMpn(event.target.value)} /></div><Button disabled={!canEdit || busy || batchPending.current} onClick={() => void makeDrafts([pdf])}><FileUp />{active?.state === "error" ? "重試這份 PDF" : "產生這份候選規則"}</Button></div>}
      {active?.error && <p className="comparison-datasheets-error" role="alert">{active.error}</p>}{draft && <><div className="comparison-draft-grid"><div><Label htmlFor="compare-entry-yaml">候選規則 YAML</Label><Textarea id="compare-entry-yaml" className="comparison-yaml" value={candidate} onChange={event => { setCandidate(event.target.value); }} disabled={!canEdit || busy} /><p className="comparison-help">0 = GND、1 = VDD、Z = 浮接；SDA／SCL 表示接自己的訊號。</p></div><div className="comparison-datasheet-text"><h3>PDF 原文</h3>{draft.pageTexts?.map(item => <details key={item.page} open><summary>第 {item.page} 頁</summary><pre>{item.text}</pre></details>)}{!draft.pageTexts?.length && <p>未找到可確認的位址表，請核對 PDF 並補齊候選規則。</p>}</div></div><div className="comparison-signoff"><label><Checkbox checked={confirmed} onCheckedChange={value => setConfirmed(value === true)} disabled={!canEdit || busy} />我已對照 PDF 核對這份位址規則</label><Input aria-label="位址規則簽核人" value={who} onChange={event => setWho(event.target.value)} maxLength={120} disabled={!canEdit || busy} /><Button disabled={!canEdit || busy || !confirmed || !who.trim()} onClick={() => void validate(true)}><ShieldCheck />簽核並儲存</Button></div></>}</details>
    <details className="comparison-section"><summary>使用者位址庫 YAML／匯入匯出</summary><p className="comparison-help">可載入原 AutoCheck 的 i2c_devices_user.yaml；內建庫不會被覆寫。</p><Textarea aria-label="使用者位址庫 YAML" className="comparison-yaml" value={editor} onChange={event => setEditor(event.target.value)} disabled={!canEdit || busy} maxLength={2_000_000} /><input ref={upload} type="file" accept=".yaml,.yml" className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) void runJob(async () => { if (file.size > 2 * 1024 * 1024) throw new Error("位址庫不可超過 2 MiB"); setEditor(await file.text()); }); event.target.value = ""; }} /><div className="comparison-actions"><Button variant="outline" disabled={!canEdit || busy} onClick={() => upload.current?.click()}>匯入 YAML</Button><Button variant="outline" onClick={() => downloadLocal(yaml || "devices: []\n", "i2c_devices_user.yaml", "text/yaml")}><Download />匯出 YAML</Button><Button disabled={!canEdit || busy} onClick={() => void validate()}>驗證並儲存</Button></div></details>{!!issues.length && <div className="comparison-notice" role="status">{issues.map((issue, index) => <p key={index}>{issue}</p>)}</div>}{message && <p className="comparison-good" role="status">{message}</p>}
  </div>;
}
