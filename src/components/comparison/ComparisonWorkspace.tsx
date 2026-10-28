import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GitCompareArrows, Play, Square, Download, Upload, Plus, CheckCircle2, TriangleAlert, FileText, ChevronDown, FilePlus2, X } from "lucide-react";
import { useUser } from "@/components/auth/UserContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useWorkspaceMutationScope } from "@/hooks/useWorkspaceMutationScope";
import { MaintenancePageHeader } from "@/components/maintenance/MaintenancePageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ComparisonInputs, type RevisionInput } from "./ComparisonInputs";
import { ComparisonResults } from "./ComparisonResults";
import { ComparisonLibrary } from "./ComparisonLibrary";
import { DatasheetFiles } from "./DatasheetFiles";
import { downloadLocal } from "./downloads";
import { ComparisonCharts } from "./ComparisonCharts";
import { createRuntime, type EngineRuntime } from "./runtime";
import { engineHost, readEngineSettings, writeEngineSettings, type EngineSettings } from "./engineSettings";
import { EngineSettingsControl } from "./EngineSettingsControl";
import { inspectRevision, readRevision, validateRevision, selectedRevisionFiles, formatBytes, filePath } from "./files";
import { exportBackup, importBackup } from "./backup";
import { listSessions, saveSession, readLibrary, saveLibrary } from "./storage";
import { useComparisonFilters } from "./useComparisonFilters";
import { ComparisonFeedback } from "./feedback/ComparisonFeedback";
import { ComparisonGuide } from "./ComparisonGuide";
import { DATASHEET_BATCH_LIMIT, DATASHEET_COUNT_LIMIT, mergeDatasheetFiles } from "./datasheetSelection";
import type { Artifact, ComparisonResult, ComparisonSession, InputFile, ReviewChange, ReviewReply } from "./types";
import "./comparison.css";

const ComparisonDiagramEditor = lazy(() => import("./ComparisonDiagramWorkspace"));
const tabLabels = { compare: "比對檢查", review: "審查追蹤", power: "Power Tree", i2c: "I²C Map", library: "位址庫", diagram: "圖表編輯器" } as const;
type DiagramSource = { accountId: string; sessionId: string; kind: "power" | "i2c"; revision: "a" | "b" };
type OptionalKey = "config" | "railMap" | "railDomain" | "i2cDeclared";
const optionalInputs: Array<{ key: OptionalKey; label: string; accept: string }> = [{ key: "config", label: "規則設定 YAML", accept: ".yaml,.yml" }, { key: "railMap", label: "Net 電壓對照 CSV", accept: ".csv" }, { key: "railDomain", label: "電源域 CSV", accept: ".csv" }, { key: "i2cDeclared", label: "I²C Block Diagram 對照 CSV", accept: ".csv" }];
const blankRevision = (): RevisionInput => ({ files: [], selected: {} });

// Optional inputs use the same picker language as the A/B panels instead of a bare native file control.
function OptionalFileField({ id, label, accept, file, disabled, onChange }: { id: string; label: string; accept: string; file: File | undefined; disabled: boolean; onChange: (file: File | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return <div className="comparison-optional-field">
    <Label htmlFor={id}>{label}</Label>
    <div className="comparison-optional-picker" data-has-file={Boolean(file)}>
      <input id={id} ref={input} type="file" accept={accept} className="sr-only" disabled={disabled} onChange={event => onChange(event.target.files?.[0])} />
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => input.current?.click()}><FilePlus2 />{file ? "重新選擇" : "選擇檔案"}</Button>
      <span className="comparison-optional-file" title={file?.name}>{file ? `${file.name} · ${formatBytes(file.size)}` : "未選擇，沿用內建設定"}</span>
      {file && <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={`移除${label}`} onClick={() => { if (input.current) input.current.value = ""; onChange(undefined); }}><X /></Button>}
    </div>
  </div>;
}

export default function ComparisonWorkspace() {
  const { user } = useUser();
  const { canEditModule } = usePermissions();
  const canEdit = canEditModule("ai-chat");
  const accountId = user?.userId ?? "";
  const scope = useWorkspaceMutationScope(accountId || null, canEdit);
  const { filters, update, clear } = useComparisonFilters();
  const [a, setA] = useState<RevisionInput>(blankRevision);
  const [b, setB] = useState<RevisionInput>(blankRevision);
  const [aLabel, setALabel] = useState("EVT");
  const [bLabel, setBLabel] = useState("DVT");
  const [projectName, setProjectName] = useState("");
  const [optional, setOptional] = useState<Partial<Record<OptionalKey, File>>>({});
  const [datasheets, setDatasheets] = useState<File[]>([]);
  const [sessions, setSessions] = useState<ComparisonSession[]>([]);
  const [session, setSession] = useState<ComparisonSession | null>(null);
  const sessionRef = useRef<ComparisonSession | null>(null);
  const [libraryYaml, setLibraryYaml] = useState("devices: []\n");
  const [libraryEntries, setLibraryEntries] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [restoring, setRestoring] = useState(true);
  const [restoredAccountId, setRestoredAccountId] = useState("");
  const [diagramSource, setDiagramSource] = useState<DiagramSource | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [engine, setEngine] = useState<EngineSettings>(() => readEngineSettings());
  const runtimeRef = useRef<EngineRuntime>(createRuntime(engine));
  const epoch = useRef(0);
  const importInput = useRef<HTMLInputElement>(null);
  const allArtifacts = session?.result.artifacts;
  const setCurrent = useCallback((next: ComparisonSession | null) => { sessionRef.current = next; setSession(next); }, []);
  const invalidateRuntime = useCallback(() => { ++epoch.current; runtimeRef.current.cancel(); }, []);
  // Switching where the engine runs replaces the runtime; the page code above it is the same for both.
  const changeEngine = (next: EngineSettings) => {
    if (busyRef.current) return;
    runtimeRef.current.cancel(); runtimeRef.current = createRuntime(next); writeEngineSettings(next); setEngine(next); setError("");
    setNotice(next.mode === "server" ? `之後的比對會送到 ${engineHost(next.url)} 處理；結果仍只存在這台電腦的瀏覽器` : "之後的比對在這台電腦的瀏覽器處理");
  };

  useEffect(() => {
    const currentEpoch = ++epoch.current;
    runtimeRef.current.cancel(); busyRef.current = false; setBusy(false); setProgress(""); setError(""); setNotice("");
    setCurrent(null); setSessions([]); setLibraryEntries([]); setLibraryYaml("devices: []\n"); setA(blankRevision()); setB(blankRevision()); setOptional({}); setDatasheets([]); setProjectName(""); setRestoring(true); setRestoredAccountId(accountId); setDiagramSource(null);
    if (!accountId) { setRestoring(false); return; }
    void Promise.all([listSessions(accountId), readLibrary(accountId)]).then(([stored, yaml]) => {
      if (epoch.current !== currentEpoch) return;
      setSessions(stored); setLibraryYaml(yaml || "devices: []\n");
      if (stored[0]) { setCurrent(stored[0]); setProjectName(stored[0].projectName); setALabel(stored[0].result.meta.a.label); setBLabel(stored[0].result.meta.b.label); setLibraryEntries(stored[0].result.library); }
    }).catch(error => { if (epoch.current === currentEpoch) setError(error instanceof Error ? error.message : String(error)); }).finally(() => { if (epoch.current === currentEpoch) setRestoring(false); });
    return invalidateRuntime;
  }, [accountId, canEdit, setCurrent, invalidateRuntime]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const artifact of allArtifacts ?? []) if (artifact.mime === "application/pdf") next[artifact.key] = URL.createObjectURL(new Blob([artifact.bytes], { type: "application/pdf" }));
    setUrls(next);
    return () => Object.values(next).forEach(url => URL.revokeObjectURL(url));
  }, [allArtifacts]);

  const runJob = async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    if (busyRef.current) return undefined;
    const currentEpoch = epoch.current;
    busyRef.current = true; setBusy(true); setError(""); setProgress("準備處理資料…");
    try { const result = await work(); return currentEpoch === epoch.current ? result : undefined; }
    catch (error) { if (currentEpoch === epoch.current) setError(error instanceof Error ? error.message : String(error)); return undefined; }
    finally { if (currentEpoch === epoch.current) { busyRef.current = false; setBusy(false); setProgress(""); } }
  };
  const showProgress = (message: string) => setProgress(message);
  const persist = async (next: ComparisonSession, token: ReturnType<typeof scope.capture>) => {
    scope.assertCurrent(token);
    const selectedId = sessionRef.current?.id;
    await saveSession(token.accountId, next);
    scope.assertCurrent(token);
    if (sessionRef.current?.id === selectedId) setCurrent(next);
    setSessions(current => [next, ...current.filter(item => item.id !== next.id)]);
  };
  const readOption = async (file: File): Promise<InputFile> => {
    if (file.size > 64 * 1024 * 1024) throw new Error(`${file.name} 不可超過 64 MiB`);
    return { path: file.name, bytes: await file.arrayBuffer() };
  };
  const inputErrors = useMemo(() => [...validateRevision(inspectRevision(a.files), a.selected).map(message => `A：${message}`), ...validateRevision(inspectRevision(b.files), b.selected).map(message => `B：${message}`)], [a, b]);
  // The run button is disabled on any validation error; once files are chosen,
  // show the actual blocker instead of a generic netlist reminder.
  const noFilesYet = !a.files.length && !b.files.length;
  // Same label rules start() enforces, surfaced before the click so the hint
  // never says the run is ready when it will fail.
  const labelError = !aLabel.trim() || !bLabel.trim() ? "A、B 都要填版本名稱" : aLabel.trim() === bLabel.trim() ? "A、B 版本名稱不能一樣" : [aLabel, bLabel].some(label => Array.from(label).some(char => "/\\[]:*?".includes(char) || char.charCodeAt(0) < 32)) ? "版本名稱不能有 / \\ [ ] : * ?" : "";
  const blockers = labelError ? [...inputErrors, labelError] : inputErrors;
  const start = async () => {
    await runJob(async () => {
      const token = scope.capture();
      const name = projectName.trim();
      if (!name || name.length > 120) throw new Error("請填寫比對名稱（最多 120 字），用來保存這個板件的結果與回覆");
      if (!aLabel.trim() || !bLabel.trim() || aLabel.trim() === bLabel.trim()) throw new Error("請填寫兩個不同的版本名稱");
      if ([aLabel, bLabel].some(label => Array.from(label).some(char => "/\\[]:*?".includes(char) || char.charCodeAt(0) < 32))) throw new Error("版次名稱不可包含 / \\ [ ] : * ? 或控制字元");
      if (inputErrors.length) throw new Error(inputErrors.join("\n"));
      // Bound the entire worker payload before reading any large file buffers.
      if (datasheets.length) mergeDatasheetFiles([], datasheets);
      const runFiles = [...selectedRevisionFiles(inspectRevision(a.files), a.selected), ...selectedRevisionFiles(inspectRevision(b.files), b.selected), ...Object.values(optional).filter((file): file is File => Boolean(file)), ...datasheets];
      if (runFiles.length > DATASHEET_COUNT_LIMIT || runFiles.reduce((sum, file) => sum + file.size, 0) > DATASHEET_BATCH_LIMIT) throw new Error("本次 A、B、選用工具與 Datasheet 合計不可超過 1000 份／128 MiB；大量 Datasheet 可到位址庫分批逐份處理");
      const [aFiles, bFiles] = await Promise.all([readRevision(inspectRevision(a.files), a.selected), readRevision(inspectRevision(b.files), b.selected)]);
      const options: Record<string, unknown> = { library: libraryYaml || "devices: []\n" };
      for (const [key, file] of Object.entries(optional)) if (file) options[key] = await readOption(file);
      options.datasheets = await Promise.all(datasheets.map(async file => ({ path: filePath(file), bytes: await file.arrayBuffer() })));
      scope.assertCurrent(token);
      const result = await runtimeRef.current.request<ComparisonResult>("run", { a: aFiles, b: bFiles, aLabel: aLabel.trim(), bLabel: bLabel.trim(), options }, showProgress);
      scope.assertCurrent(token);
      const id = JSON.stringify([name, result.meta.a.label, result.meta.b.label]);
      const old = sessions.find(item => item.id === id);
      const next: ComparisonSession = { version: 1, projectName: name, id, result, replies: { ...old?.replies }, history: [...(old?.history ?? [])], savedAt: new Date().toISOString(), libraryYaml };
      setCurrent(next); setLibraryEntries(result.library);
      try { await persist(next, token); setNotice("比對完成，結果已儲存在此帳號的本機瀏覽器"); }
      catch (error) { scope.assertCurrent(token); throw new Error(`結果已產生，但本機儲存失敗；請立即匯出備份。${error instanceof Error ? error.message : String(error)}`); }
      return next;
    });
  };
  const saveReply = async (key: string, draft: ReviewReply) => {
    const token = scope.capture();
    const current = sessionRef.current;
    if (!current) throw new Error("找不到目前比對");
    const old = current.replies[key] ?? { disp: "", owner: "", target_rev: "", note: "", filled: "" };
    const now = new Date().toISOString();
    const reply = { ...draft, disp: draft.disp.trim(), owner: draft.owner.trim(), target_rev: draft.target_rev.trim(), note: draft.note.trim(), filled: now.slice(0, 10) };
    const changes: ReviewChange[] = (["disp", "owner", "target_rev", "note"] as const).filter(field => old[field] !== reply[field]).map(field => ({ key, field, old: old[field], value: reply[field], at: now }));
    if (!changes.length) return;
    await persist({ ...current, replies: { ...current.replies, [key]: reply }, history: [...current.history, ...changes], savedAt: now }, token);
  };
  const tracker = async (current: ComparisonSession) => {
    const template = current.result.artifacts.find(artifact => artifact.key === "xlsx");
    if (!template) throw new Error("這份結果沒有 Excel 範本，請重新執行比對");
    return runtimeRef.current.request<Artifact>("tracker", { template: template.bytes, replies: current.replies, rows: current.result.rows, aLabel: current.result.meta.a.label, bLabel: current.result.meta.b.label }, showProgress);
  };
  const exportSession = async () => {
    const current = sessionRef.current;
    if (!current) return;
    await runJob(async () => {
      const currentEpoch = epoch.current;
      const updatedTracker = current.result.artifacts.some(artifact => artifact.key === "xlsx") ? await tracker(current) : null;
      if (currentEpoch !== epoch.current) return;
      const updated = updatedTracker ? { ...current, result: { ...current.result, artifacts: current.result.artifacts.map(artifact => artifact.key === "xlsx" ? updatedTracker : artifact) } } : current;
      downloadLocal(await exportBackup(updated), `${current.projectName}_${current.result.meta.a.label}_vs_${current.result.meta.b.label}.autocheck.zip`, "application/zip");
      setNotice("備份已匯出，包含比對結果、審查回覆與原始報表");
      return true;
    });
  };
  const chooseSession = (id: string) => { const current = sessions.find(item => item.id === id); if (!current) return; setCurrent(current); setProjectName(current.projectName); setALabel(current.result.meta.a.label); setBLabel(current.result.meta.b.label); setLibraryEntries(current.result.library); setA(blankRevision()); setB(blankRevision()); setOptional({}); setDatasheets([]); setNotice(""); };
  const importSession = async (file: File) => {
    await runJob(async () => {
      const token = scope.capture(); const restored = await importBackup(file); scope.assertCurrent(token);
      if (sessions.some(item => item.id === restored.id)) {
        const suffix = `（匯入 ${Date.now()}）`;
        restored.projectName = `${restored.projectName.slice(0, 120 - suffix.length)}${suffix}`;
        restored.id = JSON.stringify([restored.projectName, restored.result.meta.a.label, restored.result.meta.b.label]);
      }
      await persist(restored, token); setProjectName(restored.projectName); setALabel(restored.result.meta.a.label); setBLabel(restored.result.meta.b.label); setLibraryEntries(restored.result.library); setA(blankRevision()); setB(blankRevision()); setOptional({}); setDatasheets([]); setNotice("備份已匯入；同名比對保留為另一份，原資料未被覆寫"); return true;
    });
  };
  const saveUserLibrary = async (yaml: string) => { const token = scope.capture(); await saveLibrary(token.accountId, yaml); scope.assertCurrent(token); setLibraryYaml(yaml); };
  const counts = session ? { errors: session.result.rows.filter(row => row.severity === "ERROR").length, warnings: session.result.rows.filter(row => row.severity === "WARN").length, answered: session.result.rows.filter(row => session.replies[row.key]?.disp).length } : null;
  const schematic = session?.result.artifacts.find(artifact => artifact.key === "schematic");
  const downloadArtifact = (artifact: Artifact) => { if (artifact.key !== "xlsx") downloadLocal(artifact.bytes, artifact.name, artifact.mime); else if (session) void runJob(async () => { const updated = await tracker(session); downloadLocal(updated.bytes, updated.name, updated.mime); return true; }); };
  const editorSession = restoredAccountId === accountId ? session : null;
  const editorSource = diagramSource?.accountId === accountId && diagramSource.sessionId === editorSession?.id ? diagramSource : undefined;
  const editorInitialSource = useMemo(() => editorSource ? { kind: editorSource.kind, revision: editorSource.revision } : undefined, [editorSource]);
  const consumeDiagramSource = useCallback(() => setDiagramSource(current => current === editorSource ? null : current), [editorSource]);
  const captureDiagramPersistence = useCallback(() => { const token = scope.capture(); return () => scope.assertCurrent(token); }, [scope]);
  const editChart = (kind: "power" | "i2c") => {
    if (!canEdit || !accountId || !editorSession || busy) return;
    setDiagramSource({ accountId, sessionId: editorSession.id, kind, revision: "b" });
    update("tab", "diagram");
  };
  // The feedback API keeps its established tab contract; identify the new
  // editor in its existing project context without changing the cloud format.
  const feedbackProjectName = filters.tab === "diagram" ? [projectName.slice(0, 112), "圖表編輯器"].filter(Boolean).join(" · ") : projectName;

  return <div className="comparison-workspace" data-comparison-workspace="true">
    <section className="comparison-page-header"><MaintenancePageHeader title="AutoCheck" description="線路改版比對與審查追蹤" icon={GitCompareArrows} wrapActionsOnMobile actions={<><ComparisonGuide /><ComparisonFeedback tab={filters.tab === "diagram" ? "compare" : filters.tab} projectName={feedbackProjectName} revisionA={aLabel} revisionB={bLabel} /><Button variant="ghost" disabled={!session || busy} onClick={() => void exportSession()}><Download />匯出備份</Button><Button variant="ghost" disabled={!canEdit || busy} onClick={() => importInput.current?.click()}><Upload />匯入備份</Button><Button variant="outline" disabled={!canEdit || busy} onClick={() => { setCurrent(null); setProjectName(""); setA(blankRevision()); setB(blankRevision()); setOptional({}); setDatasheets([]); setNotice(""); update("tab", "compare"); }}><Plus />新比對</Button></>} /></section>
    <input ref={importInput} type="file" accept=".zip" className="sr-only" aria-label="匯入 AutoCheck 備份" onChange={event => { const file = event.target.files?.[0]; if (file) void importSession(file); event.target.value = ""; }} />
    <div className="comparison-workspace-nav"><nav aria-label="比對系統頁面">{Object.entries(tabLabels).map(([key, label]) => <Button key={key} variant={filters.tab === key ? "secondary" : "ghost"} aria-current={filters.tab === key ? "page" : undefined} onClick={() => update("tab", key as keyof typeof tabLabels)}>{label}</Button>)}</nav>{canEdit ? <EngineSettingsControl settings={engine} onChange={changeEngine} disabled={busy} /> : <Badge variant="outline">唯讀</Badge>}</div>
    {!!sessions.length && <div className="comparison-session-picker"><Label>已儲存的比對</Label><Select value={session?.id ?? "new"} disabled={busy} onValueChange={chooseSession}><SelectTrigger aria-label="已儲存的比對"><SelectValue placeholder="選擇比對" /></SelectTrigger><SelectContent>{!session && <SelectItem value="new" disabled>新比對</SelectItem>}{sessions.map(item => <SelectItem key={item.id} value={item.id}>{item.projectName} · {item.result.meta.a.label} → {item.result.meta.b.label}</SelectItem>)}</SelectContent></Select><span>儲存於目前帳號與瀏覽器</span></div>}
    {error && <div className="comparison-alert" role="alert"><TriangleAlert /><p>{error}</p><Button variant="ghost" size="icon" aria-label="關閉錯誤訊息" onClick={() => setError("")}>×</Button></div>}
    {notice && <div className="comparison-notice" role="status"><CheckCircle2 /><p>{notice}</p></div>}
    {busy && <div className="comparison-progress" role="status" aria-live="polite"><div><span className="comparison-progress-indicator" /><p>{progress || "正在處理…"}</p><small>{engine.mode === "server" ? `檔案已上傳到 ${engineHost(engine.url)} 處理；結果仍只存在這台電腦的瀏覽器` : "首次使用會下載執行套件；工程檔案留在本機"}</small></div><Button variant="outline" onClick={() => runtimeRef.current.cancel()}><Square />取消</Button></div>}
    {restoring ? <div className="comparison-loading" role="status">正在讀取本機比對紀錄…</div> : <>
      {filters.tab === "compare" && <details key={session?.id ?? "new"} className="comparison-source-settings" open={!session} data-new={!session}>
        <summary>展開來源檔案，重新比對<ChevronDown /></summary>
        <section className="comparison-section comparison-run-settings">
        <div className="comparison-setup-heading"><div className="comparison-section-heading"><div><h2>A / B 版本比對</h2><p>選取舊版與新版工程檔，檢查連線、元件、BOM 與線路規則。</p></div></div><div className="comparison-setup-controls"><div className="comparison-project-name" data-empty={!projectName.trim()}><Label htmlFor="comparison-project">比對名稱{!projectName.trim() && <span className="comparison-required-chip">必填</span>}</Label><Input id="comparison-project" placeholder="例如 CATANIA PDB" value={projectName} maxLength={120} aria-required="true" disabled={!canEdit || busy} onChange={event => setProjectName(event.target.value)} /></div><div className="comparison-run-actions"><div><strong>{busy ? "處理中" : !canEdit ? "唯讀" : blockers.length ? (noFilesYet ? "先選 A、B 兩版的檔案" : "還不能比對") : !projectName.trim() ? "填好比對名稱就能開始" : "可以開始比對"}</strong><p id="comparison-run-hint" title={busy ? undefined : blockers.length ? blockers.join("；") : undefined}>{busy ? "跑完才能再操作" : !canEdit ? "這個帳號沒有編輯權限，不能選檔案或比對" : blockers.length ? (noFilesYet ? "每版都要有 Netlist 三份 .dat、BOM 用料表、電路圖 PDF" : `${blockers[0]}${blockers.length > 1 ? `，還有 ${blockers.length - 1} 項` : ""}`) : "必要資料已選齊；DSN、IC Datasheet 與規則設定是選用工具"}</p></div><Button size="lg" aria-describedby="comparison-run-hint" disabled={!canEdit || busy || !projectName.trim() || blockers.length > 0} onClick={() => void start()}><Play />{busy ? "比對中…" : session ? "重新比對" : "開始比對"}</Button></div></div></div>
        <div className="comparison-revision-grid"><ComparisonInputs side="A" label={aLabel} onLabel={setALabel} value={a} onChange={setA} disabled={!canEdit || busy} /><ComparisonInputs side="B" label={bLabel} onLabel={setBLabel} value={b} onChange={setB} disabled={!canEdit || busy} /></div>
        <details className="comparison-optional"><summary>選用工具：IC Datasheet 與進階設定<ChevronDown /></summary><div className="comparison-optional-grid">{optionalInputs.map(option => <OptionalFileField key={option.key} id={`comparison-option-${option.key}`} label={option.label} accept={option.accept} file={optional[option.key]} disabled={!canEdit || busy} onChange={file => setOptional(current => ({ ...current, [option.key]: file }))} />)}<div className="comparison-datasheets-run"><Label>IC Datasheet 規格書 PDF（選用）</Label><DatasheetFiles value={datasheets} onChange={setDatasheets} disabled={!canEdit || busy} inputPrefix="comparison-run-datasheets" /></div></div><p>已保存的使用者位址庫會自動套用；可在「位址庫」核對與管理。</p></details>
        </section>
      </details>}
      {session && filters.tab !== "library" && filters.tab !== "diagram" && <>
        <div className="comparison-summary"><span><strong className="comparison-error-count">{counts?.errors}</strong> ERROR</span><span><strong className="comparison-warning-count">{counts?.warnings}</strong> WARN</span><span><strong>{counts?.answered} / {session.result.rows.length}</strong> 已回覆</span><span>引擎 {session.result.meta.tool_version} · 規則 {session.result.meta.rules_version}</span></div>
        {(filters.tab === "compare" || filters.tab === "review") && <>{!!session.result.inputIssues.length && <details className="comparison-input-issues" open={session.result.inputIssues.some(([level]) => level === "ERROR")}><summary>輸入完整性 · {session.result.inputIssues.length} 項提醒</summary>{session.result.inputIssues.map(([level, message], index) => <div key={index} className="comparison-input-issue"><Badge className={`comparison-severity is-${level.toLowerCase()}`}>{level}</Badge><span>{message}</span></div>)}</details>}<ComparisonResults session={session} filters={filters} update={update} clear={clear} canEdit={canEdit} onSaveReply={saveReply} pdfUrl={urls.schematic} busy={busy} /></>}
        {(filters.tab === "power" || filters.tab === "i2c") && <ComparisonCharts key={filters.tab} kind={filters.tab} artifact={session.result.artifacts.find(artifact => artifact.key === (filters.tab === "power" ? "ptree_html" : "i2c_html"))} blockArtifact={filters.tab === "i2c" ? session.result.artifacts.find(artifact => artifact.key === "i2c_block_html") : undefined} drawioArtifact={session.result.artifacts.find(artifact => artifact.key === `${filters.tab === "power" ? "power" : "i2c"}_drawio_b`)} pdfUrl={urls.schematic} schematicName={schematic?.name} canEdit={canEdit && !busy} onEdit={editChart} />}
        <details className="comparison-section comparison-reports"><summary><FileText />報表與完整資料 · {session.result.artifacts.length} 份</summary><div className="comparison-report-list">{session.result.artifacts.map(artifact => <div key={artifact.key}><div><strong>{artifact.name}</strong><small>{formatBytes(artifact.bytes.byteLength)}</small></div><Button variant="outline" disabled={busy} onClick={() => downloadArtifact(artifact)}><Download />{artifact.key === "xlsx" ? "下載（含回覆）" : "下載"}</Button>{artifact.mime === "application/pdf" && <Button asChild variant="ghost"><a href={urls[artifact.key]} target="_blank" rel="noopener noreferrer">開啟</a></Button>}</div>)}</div>{!!session.result.warnings.length && <details><summary>解析與輸出提示 · {session.result.warnings.length}</summary>{session.result.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</details>}</details>
      </>}
      {!session && filters.tab !== "compare" && filters.tab !== "library" && filters.tab !== "diagram" && <section className="comparison-section comparison-start-empty"><GitCompareArrows /><h2>先建立一份比對</h2><p>選擇 A／B 資料後執行檢查，結果會出現在審查表與圖表中。也可以匯入之前的備份。</p><Button onClick={() => update("tab", "compare")}>前往比對檢查</Button></section>}
      {filters.tab === "library" && <ComparisonLibrary key={accountId} runtime={runtimeRef.current} yaml={libraryYaml} entries={libraryEntries} onEntries={setLibraryEntries} onSave={saveUserLibrary} canEdit={canEdit} signedBy={user?.displayName ?? ""} busy={busy} runJob={runJob} />}
    </>}
    {/* Keep the same account's draft mounted while permission changes refresh comparison records. */}
    {filters.tab === "diagram" && (accountId ? <Suspense fallback={<div className="comparison-loading" role="status">正在載入圖表編輯器…</div>}><ComparisonDiagramEditor key={accountId} accountId={accountId} session={editorSession} canEdit={canEdit && !busy} pdfUrl={editorSession ? urls.schematic : undefined} initialSource={editorInitialSource} onSourceConsumed={consumeDiagramSource} capturePersistence={captureDiagramPersistence} /></Suspense> : <section className="comparison-section"><p>請先登入後使用圖表編輯器。</p></section>)}
  </div>;
}
