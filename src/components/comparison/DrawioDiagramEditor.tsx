import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Download, Expand, FilePlus2, FileText, FolderOpen, Moon, RefreshCw, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createBlankDrawioDocument, MAX_DRAWIO_BYTES, validateDrawioXml, type DrawioDocument } from "./drawioDocument";
import { listDrawioDocuments, saveDrawioDocument } from "./drawioStorage";
import { DRAWIO_ORIGIN, drawioEditorUrl, readDrawioMessage } from "./drawioEmbed";
import { readDiagramAppearance, writeDiagramAppearance } from "./diagramTheme";
import { downloadLocal } from "./downloads";
import "./diagramEditor.css";

interface Props {
  accountId: string;
  canEdit: boolean;
  initialDocument?: DrawioDocument;
  onInitialConsumed?: () => void;
  onQuickEditor: () => void;
  capturePersistence?: () => () => void;
}
type Pending = { requestId: string; resolve: (xml: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
const errorText = (error: unknown) => error instanceof Error ? error.message : "DRAWIO 操作未完成，請重試";
const filename = (title: string) => `${Array.from(title.replace(/[<>:"/\\|?*]/g, "_")).map(character => character.charCodeAt(0) < 32 ? "_" : character).join("").slice(0, 200) || "未命名圖表"}.drawio`;

export default function DrawioDiagramEditor({ accountId, canEdit, initialDocument, onInitialConsumed, onQuickEditor, capturePersistence }: Props) {
  const [document, setDocument] = useState<DrawioDocument | null>(null);
  const [saved, setSaved] = useState<DrawioDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [frameError, setFrameError] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("正在讀取本機圖稿…");
  const [appearance, setAppearance] = useState(readDiagramAppearance);
  const [generation, setGeneration] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [failedInitial, setFailedInitial] = useState<DrawioDocument | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const current = useRef(document); current.current = document;
  const capability = useRef({ accountId, canEdit }); capability.current = { accountId, canEdit };
  const alive = useRef(true);
  const readyRef = useRef(false);
  const pending = useRef<Pending | null>(null);
  const writes = useRef(Promise.resolve());
  const writesPending = useRef(0);
  const operation = useRef(false);
  const loadedInitial = useRef<DrawioDocument | undefined>(undefined);
  const latestInitial = useRef(initialDocument); latestInitial.current = initialDocument;
  const consumed = useRef(onInitialConsumed); consumed.current = onInitialConsumed;
  const send = useCallback((value: Record<string, unknown>) => frame.current?.contentWindow?.postMessage(JSON.stringify(value), DRAWIO_ORIGIN), []);
  const cancelRequest = useCallback((message: string) => {
    const request = pending.current;
    if (request) { clearTimeout(request.timer); pending.current = null; request.reject(new Error(message)); }
  }, []);
  const persist = useCallback((snapshot: DrawioDocument) => {
    const owner = accountId;
    let assertCurrent: (() => void) | undefined;
    try { assertCurrent = capturePersistence?.(); } catch (caught) { return Promise.reject(caught); }
    ++writesPending.current;
    setStatus("儲存中…");
    const task = writes.current.catch(() => {}).then(async () => {
      if ((!alive.current && !assertCurrent) || !capability.current.canEdit || capability.current.accountId !== owner) throw new Error("帳號或編輯權限已變更，圖稿未儲存");
      assertCurrent?.();
      await saveDrawioDocument(owner, snapshot);
      if (!alive.current || capability.current.accountId !== owner) return;
      setSaved(items => [snapshot, ...items.filter(item => item.id !== snapshot.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      if (current.current?.id === snapshot.id && current.current.updatedAt === snapshot.updatedAt && current.current.xml === snapshot.xml && current.current.title === snapshot.title) { setStatus("已存於本機"); setError(""); send({ action: "status", message: "已存於本機", modified: false }); }
    }).finally(() => { --writesPending.current; });
    writes.current = task;
    void task.catch(caught => { if (alive.current) { setError(errorText(caught)); setStatus("尚未儲存 · 請下載 .drawio 備份"); } });
    return task;
  }, [accountId, send, capturePersistence]);
  const updateXml = useCallback((xml: string) => {
    if (!capability.current.canEdit || capability.current.accountId !== accountId || !current.current) return;
    validateDrawioXml(xml);
    if (xml === current.current.xml) return;
    const next = { ...current.current, title: current.current.title.trim() || "未命名 DRAWIO 圖表", xml, updatedAt: new Date().toISOString() };
    current.current = next; setDocument(next); void persist(next).catch(() => {});
  }, [accountId, persist]);
  const requestXml = useCallback(() => {
    if (!readyRef.current) return Promise.resolve(current.current?.xml ?? "");
    if (pending.current) return Promise.reject(new Error("正在讀取圖稿，請稍候"));
    return new Promise<string>((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => { pending.current = null; reject(new Error("DRAWIO 沒有回應，原圖稿已保留。請重試或下載已保存的版本。")); }, 12000);
      pending.current = { requestId, resolve, reject, timer };
      send({ action: "export", format: "xml", requestId });
    });
  }, [send]);
  const flush = useCallback(async () => {
    if (capability.current.canEdit && readyRef.current) updateXml(await requestXml());
    await writes.current.catch(caught => {
      if (!current.current || !capability.current.canEdit) throw caught;
      return persist({ ...current.current, title: current.current.title.trim() || "未命名 DRAWIO 圖表" });
    });
  }, [requestXml, updateXml, persist]);
  const run = async (action: () => Promise<void> | void) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true); setError("");
    try { await action(); } catch (caught) { if (alive.current) setError(errorText(caught)); }
    finally { operation.current = false; if (alive.current) setBusy(false); }
  };
  const replace = async (next: DrawioDocument) => {
    await flush();
    if (!capability.current.canEdit || capability.current.accountId !== accountId) return;
    if (next.id === current.current?.id) return;
    await persist(next); readyRef.current = false; setReady(false); setFrameError(false);
    current.current = next; setDocument(next); setStatus("已存於本機"); setGeneration(value => value + 1);
  };
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; readyRef.current = false; cancelRequest("DRAWIO 編輯器已關閉"); };
  }, [cancelRequest]);
  useEffect(() => {
    let active = true;
    void listDrawioDocuments(accountId).then(items => {
      if (!active) return;
      setSaved(items);
      const source = latestInitial.current;
      const next = source ?? items[0] ?? createBlankDrawioDocument();
      loadedInitial.current = source;
      current.current = next; setDocument(next); setStatus(items.some(item => item.id === next.id) ? "已存於本機" : "新圖稿");
      if (source && capability.current.canEdit) void persist(next).catch(() => {});
      if (source) consumed.current?.();
    }).catch(caught => {
      if (!active) return;
      const next = latestInitial.current ?? createBlankDrawioDocument(); current.current = next; setDocument(next);
      setError(errorText(caught)); setStatus("尚未儲存 · 可下載 .drawio 備份");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Initial loading belongs to this account. Later source requests are handled separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);
  useEffect(() => {
    if (loading || busy || !initialDocument || initialDocument === loadedInitial.current || initialDocument === failedInitial || !canEdit) return;
    void run(async () => { try { await replace(initialDocument); loadedInitial.current = initialDocument; setFailedInitial(null); if (latestInitial.current === initialDocument) consumed.current?.(); } catch (caught) { setFailedInitial(initialDocument); throw caught; } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDocument, loading, canEdit, busy, failedInitial]);
  useEffect(() => {
    if (!canEdit) { readyRef.current = false; setReady(false); cancelRequest("編輯權限已變更"); }
  }, [canEdit, cancelRequest]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (!alive.current || !capability.current.canEdit || capability.current.accountId !== accountId) return;
      const data = readDrawioMessage(event, frame.current?.contentWindow ?? null);
      if (!data) return;
      try {
        if (data.event === "configure") send({ action: "configure", config: { darkColor: "#1c1c1e", defaultGridColor: appearance === "dark" ? "#444448" : "#e6e6e6", defaultDarkGridColor: "#444448", sidebarWidth: 200, defaultFonts: ["Arial", "Helvetica", "Noto Sans TC"] } });
        else if (data.event === "init" && current.current) send({ action: "load", xml: current.current.xml, title: filename(current.current.title), autosave: 1, noExitBtn: 1 });
        else if (data.event === "load") { readyRef.current = true; setReady(true); setFrameError(false); }
        else if ((data.event === "autosave" || data.event === "save") && typeof data.xml === "string") updateXml(data.xml);
        else if (data.event === "export" && data.format === "xml" && pending.current && data.message?.requestId === pending.current.requestId) {
          const request = pending.current; pending.current = null; clearTimeout(request.timer);
          if (data.error || typeof data.xml !== "string") request.reject(new Error(data.error || "DRAWIO 未傳回圖稿"));
          else { try { validateDrawioXml(data.xml); request.resolve(data.xml); } catch (caught) { request.reject(new Error(errorText(caught))); } }
        }
      } catch (caught) { cancelRequest(errorText(caught)); setError(errorText(caught)); }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [accountId, appearance, cancelRequest, send, updateXml]);
  useEffect(() => {
    if (!document || !canEdit || ready) return;
    const timer = setTimeout(() => setFrameError(true), 25000);
    return () => clearTimeout(timer);
  }, [document?.id, generation, canEdit, ready, document]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (writesPending.current || pending.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const previous = window.document.body.style.overflow; window.document.body.style.overflow = "hidden";
    return () => { window.document.body.style.overflow = previous; };
  }, [expanded]);
  const download = async () => {
    // A storage failure must not prevent a backup of the latest editor contents.
    const xml = canEdit && readyRef.current ? await requestXml() : current.current?.xml;
    if (!xml || !current.current) return;
    validateDrawioXml(xml); updateXml(xml);
    downloadLocal(xml, filename(current.current.title), "application/vnd.jgraph.mxfile");
  };
  const editor = <section className={`comparison-diagram-editor drawio-editor${expanded ? " is-expanded" : ""}`} data-diagram-theme={appearance} aria-label="DRAWIO 圖表編輯器">
    <header className="diagram-document-header"><FileText className="diagram-document-icon" aria-hidden="true" /><div className="diagram-document-identity"><label className="sr-only" htmlFor="drawio-title">DRAWIO 圖稿名稱</label><Input id="drawio-title" value={document?.title ?? ""} maxLength={240} disabled={!canEdit || loading || busy} onChange={event => { if (!current.current || !capability.current.canEdit) return; const next = { ...current.current, title: event.target.value, updatedAt: new Date().toISOString() }; current.current = next; setDocument(next); }} onBlur={() => { if (!current.current || !canEdit) return; const next = { ...current.current, title: current.current.title.trim() || "未命名 DRAWIO 圖表", updatedAt: new Date().toISOString() }; current.current = next; setDocument(next); void persist(next).catch(() => {}); }} /><div className="diagram-document-meta"><span>draw.io · 完整圖形庫</span><span role="status">{canEdit ? status : "唯讀"}</span></div></div><div className="diagram-document-actions"><Button variant="ghost" size="icon" disabled={busy || loading} aria-label={appearance === "dark" ? "切換淺色模式" : "切換深色模式"} onClick={() => void run(async () => { await flush(); const next = appearance === "dark" ? "light" : "dark"; writeDiagramAppearance(next); setAppearance(next); readyRef.current = false; setReady(false); setFrameError(false); setGeneration(value => value + 1); })}>{appearance === "dark" ? <Sun /> : <Moon />}</Button><Button variant="ghost" size="icon" aria-label={expanded ? "離開全畫布" : "展開全畫布"} disabled={busy || loading} onClick={() => void run(async () => { await flush(); readyRef.current = false; setReady(false); setExpanded(value => !value); setGeneration(value => value + 1); })}>{expanded ? <X /> : <Expand />}</Button></div></header>
    <div className="drawio-document-tools" role="toolbar" aria-label="DRAWIO 檔案工具"><Button variant="ghost" size="sm" disabled={!canEdit || loading || busy} onClick={() => void run(() => replace(createBlankDrawioDocument()))}><FilePlus2 />新增圖稿</Button><Button variant="ghost" size="sm" disabled={!canEdit || loading || busy} onClick={() => input.current?.click()}><FolderOpen />開啟 .drawio</Button><Button variant="ghost" size="sm" disabled={loading || busy} onClick={() => setSavedOpen(true)}><FolderOpen />本機圖稿</Button><Button variant="outline" size="sm" disabled={!document || busy} onClick={() => void run(download)}><Download />下載 .drawio</Button><Button variant="ghost" size="sm" disabled={loading || busy} onClick={() => void run(async () => { await flush(); onQuickEditor(); })}>快速繪圖</Button></div>
    <input ref={input} type="file" className="sr-only" accept=".drawio,.xml,application/vnd.jgraph.mxfile,text/xml,application/xml" aria-label="開啟 DRAWIO 檔案" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; void run(async () => { if (!capability.current.canEdit) return; if (file.size > MAX_DRAWIO_BYTES) throw new Error("DRAWIO 檔案不可超過 20 MiB"); const xml = validateDrawioXml(await file.text()); const next = { ...createBlankDrawioDocument(file.name.replace(/\.(drawio|xml)$/i, "")), xml }; await replace(next); }); }} />
    {error && <div className="diagram-error" role="alert">{error}{failedInitial === initialDocument && failedInitial && <Button variant="ghost" size="sm" disabled={busy} onClick={() => setFailedInitial(null)}>重試帶入圖稿</Button>}</div>}
    {loading ? <div className="drawio-state" role="status">正在讀取本機圖稿…</div> : !canEdit ? <div className="drawio-state"><p>目前帳號只有檢視權限。可下載已保存的 .drawio 圖稿。</p></div> : document && <div className="drawio-frame-container" aria-busy={!ready}>
      <iframe key={`${document.id}:${generation}`} ref={frame} title="draw.io 完整圖形編輯器" src={drawioEditorUrl(appearance === "dark")} sandbox="allow-scripts allow-same-origin allow-downloads allow-modals" referrerPolicy="no-referrer" onError={() => setFrameError(true)} />
      {(!ready || frameError) && <div className="drawio-frame-status" role="status">{frameError ? <><p>無法連上 DRAWIO，圖稿仍保留在本機。</p><div><Button variant="outline" disabled={busy} onClick={() => { readyRef.current = false; setReady(false); setFrameError(false); setGeneration(value => value + 1); }}><RefreshCw />重新載入</Button><Button variant="ghost" disabled={busy} onClick={onQuickEditor}>返回快速繪圖</Button></div></> : <p>正在載入 DRAWIO 完整圖形庫…</p>}</div>}
    </div>}
    <footer className="diagram-statusbar"><span>此帳號的瀏覽器本機儲存 · .drawio 可攜出編輯</span><span>diagrams.net · 需連線載入</span></footer>
    <Dialog open={savedOpen} onOpenChange={setSavedOpen}><DialogContent className="diagram-saved-dialog" data-diagram-theme={appearance}><DialogHeader><DialogTitle>本機 DRAWIO 圖稿</DialogTitle><DialogDescription>此帳號在目前瀏覽器的圖稿；切換前會先儲存目前內容。</DialogDescription></DialogHeader><div className="diagram-saved-list">{saved.length ? saved.map(item => <button type="button" key={item.id} disabled={busy || !canEdit} onClick={() => void run(async () => { await replace(item); setSavedOpen(false); })}><FileText /><span><strong>{item.title}</strong><small>{new Date(item.updatedAt).toLocaleString("zh-TW")}</small></span>{document?.id === item.id && <Check />}</button>) : <p>尚未儲存 DRAWIO 圖稿。</p>}</div></DialogContent></Dialog>
  </section>;
  return expanded ? createPortal(editor, window.document.body) : editor;
}
