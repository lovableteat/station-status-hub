import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, ArrowRight, FileText, FileUp, History, PenLine, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { circuitPdfKind, compactCircuitOfficialHistory, type CircuitPdfDocument, type CircuitPdfKind } from "./circuitPdf";
import { loadCircuitPdfOfficialHistory, type CircuitPdfOfficialChange } from "./officialPdfStorage";
import type { CircuitPdfModel } from "./useCircuitPdfs";
import { CircuitBusyIcon, CircuitProgress, CircuitSpinner } from "./CircuitFeedback";
import "./circuitOfficialVersions.css";

const dateTime = (value: string) => value ? new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "";
const drawingDate = ({ date, label }: Pick<CircuitPdfDocument, "date" | "label">) => label ? `${date} · ${label}` : date;
const isPdf = (file: File) => /\.pdf$/i.test(file.name) || /pdf/i.test(file.type);
const GROUPS: ReadonlyArray<{ kind: CircuitPdfKind; title: string; upload: string; uploadHint: string; move: string; empty: string }> = [
  { kind: "official", title: "官方版本", upload: "上傳官方 PDF", uploadHint: "上傳原廠或已發行的 PDF，列在官方版本；傳完可以直接設為目前的官方版本", move: "移到自己畫的", empty: "還沒有官方版本的 PDF。按「上傳官方 PDF」加入原廠或已發行的圖。" },
  { kind: "own", title: "自己畫的版本", upload: "上傳自己畫的 PDF", uploadHint: "上傳自己畫的 PDF，列在自己畫的版本（線路 Review 上傳的 PDF 也在這裡）", move: "移到官方版本", empty: "還沒有自己畫的 PDF。線路 Review 上傳的 PDF 會列在這裡。" },
];
type Confirm = { id: string; action: "official" | "delete" } | null;

/**
 * 官方版本 (2026-11-23: 「要能分成官方版本以及自己畫的版本，並能夠刪除我想刪除的檔案…每次上傳會生成上傳時間等資訊。我要能看到」):
 * the board's PDFs in two groups, each with its drawing date, pages, when and by whom it was uploaded and, for official
 * ones, when it was last set official. A PDF can be set official, moved to the other group or deleted (restorable). The
 * full 更換紀錄 is folded away, without the changes of deleted PDFs and with repeats merged.
 */
export function CircuitOfficialVersions({ seriesId, pdfs, canEdit, onOpen }: {
  seriesId: string; pdfs: CircuitPdfModel; canEdit: boolean; onOpen: (documentId: string) => void;
}) {
  const official = pdfs.official;
  const [history, setHistory] = useState<CircuitPdfOfficialChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busyId, setBusyId] = useState("");
  const [failure, setFailure] = useState("");
  const [saved, setSaved] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadKind = useRef<CircuitPdfKind>("official");
  const before = useRef<{ ids: Set<string>; kind: CircuitPdfKind } | null>(null);

  useEffect(() => {
    let active = true; setLoading(true); setLoadError("");
    loadCircuitPdfOfficialHistory(seriesId)
      .then(rows => { if (active) setHistory(rows); })
      .catch(error => { if (active) setLoadError(error instanceof Error ? error.message : "更換紀錄讀取失敗，請重試。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [seriesId, reload, official?.id]);
  // An official PDF uploaded from here is offered as the new official version as soon as it is in the list.
  useEffect(() => {
    if (!before.current) return;
    const added = pdfs.documents.find(row => !before.current!.ids.has(row.id));
    if (!added) return;
    const offer = before.current.kind === "official";
    before.current = null;
    if (offer && canEdit && !added.localOnly && added.path) setConfirm({ id: added.id, action: "official" });
    setSaved(`已加入「${added.name}」。`);
  }, [pdfs.documents, canEdit]);
  useEffect(() => { if (!saved) return; const timer = setTimeout(() => setSaved(""), 5000); return () => clearTimeout(timer); }, [saved]);

  const lastSet = useMemo(() => {
    const byDocument = new Map<string, CircuitPdfOfficialChange>();
    for (const change of history) if (!byDocument.has(change.documentId)) byDocument.set(change.documentId, change);
    return byDocument;
  }, [history]);
  const everOfficial = useMemo(() => new Set(history.map(change => change.documentId)), [history]);
  const groups = useMemo(() => {
    const listed: Record<CircuitPdfKind, CircuitPdfDocument[]> = { official: [], own: [] };
    for (const row of pdfs.documents) listed[circuitPdfKind(row, { officialId: official?.id, everOfficial })].push(row);
    // The current official version first; the rest keep the list order (newest drawing date first).
    listed.official.sort((left, right) => Number(right.id === official?.id) - Number(left.id === official?.id));
    return listed;
  }, [pdfs.documents, official?.id, everOfficial]);
  const removed = useMemo(() => pdfs.registry.documents.filter(row => row.removedAt).sort((left, right) => (right.removedAt || "").localeCompare(left.removedAt || "")), [pdfs.registry.documents]);
  const removedIds = useMemo(() => new Set(removed.map(row => row.id)), [removed]);
  const compact = useMemo(() => compactCircuitOfficialHistory(history, removedIds), [history, removedIds]);
  const currentChange = official ? lastSet.get(official.id) || null : null;

  function chooseUpload(kind: CircuitPdfKind) {
    uploadKind.current = kind; setFailure("");
    fileInput.current?.click();
  }
  function upload(files: File[]) {
    const pdfFiles = files.filter(isPdf);
    if (!pdfFiles.length) { setFailure("請選擇 PDF 檔案。"); return; }
    const kind = uploadKind.current;
    setFailure(""); setConfirm(null); before.current = { ids: new Set(pdfs.documents.map(row => row.id)), kind };
    void (async () => { for (const file of pdfFiles) await pdfs.upload(file, { kind }).catch(() => { before.current = null; }); })();
  }
  async function act(row: CircuitPdfDocument, run: () => Promise<void>, done: string) {
    setBusyId(row.id); setFailure("");
    try { await run(); setConfirm(null); setSaved(done); }
    catch (error) { setFailure(error instanceof Error ? error.message : "沒有儲存成功，請重試。"); }
    finally { setBusyId(""); }
  }
  const setOfficial = (row: CircuitPdfDocument) => act(row, async () => { await pdfs.setOfficial(row.id); setReload(value => value + 1); }, `已把「${row.name}」設為官方版本，並記入更換紀錄。`);
  const remove = (row: CircuitPdfDocument) => act(row, () => pdfs.removeDocument(row.id), `已刪除「${row.name}」，可在「已刪除的 PDF」還原。`);
  const restore = (row: CircuitPdfDocument) => act(row, () => pdfs.restoreDocument(row.id), `已還原「${row.name}」。`);
  function move(row: CircuitPdfDocument, to: CircuitPdfKind) {
    pdfs.updateDocument(row.id, { kind: to });
    setSaved(`已把「${row.name}」移到${to === "official" ? "官方版本" : "自己畫的版本"}。`);
  }

  function fileRow(row: CircuitPdfDocument, kind: CircuitPdfKind) {
    const isCurrent = row.id === official?.id;
    const change = lastSet.get(row.id);
    const asking = confirm?.id === row.id ? confirm.action : null;
    const busy = busyId === row.id;
    const group = GROUPS.find(entry => entry.kind === kind)!;
    return <li key={row.id} data-current={isCurrent} data-confirm={asking || undefined} data-testid="circuit-official-file">
      <div className="circuit-official-file">
        <FileText aria-hidden="true" />
        <div>
          <p className="circuit-official-file-name"><strong title={row.name}>{row.name}</strong>{isCurrent && <span className="circuit-official-current-tag">目前生效</span>}{row.localOnly && <span className="circuit-official-local-tag" title="超過 50 MB，只存在上傳者的電腦">僅本機</span>}</p>
          <p className="circuit-official-file-meta">
            <span title="圖面上的日期">圖面 {drawingDate(row)}</span>
            <span>{row.pages.toLocaleString("zh-TW")} 頁</span>
            <span data-testid="circuit-official-uploaded" title={`${row.uploadedByName || "同仁"} 在 ${dateTime(row.uploadedAt)} 上傳`}>上傳 <time dateTime={row.uploadedAt}>{dateTime(row.uploadedAt) || "—"}</time> · {row.uploadedByName || "同仁"}</span>
            {change && <span title={`${change.byName || "同仁"} 在 ${dateTime(change.at)} 把它設為官方版本`}>設為官方 <time dateTime={change.at}>{dateTime(change.at)}</time> · {change.byName || "同仁"}</span>}
          </p>
        </div>
      </div>
      <div className="circuit-official-row-actions">
        {asking === "official" ? <span className="circuit-official-confirm" role="group" aria-label={`把「${row.name}」設為官方版本`}>
          <span>改用這份當官方版本？</span>
          <Button title="不更換" type="button" variant="outline" disabled={busy} onClick={() => setConfirm(null)}>取消</Button>
          <Button data-circuit-tone="official" data-fill="solid" title="改用這份當官方版本，並記入更換紀錄" type="button" disabled={busy} aria-busy={busy || undefined} onClick={() => void setOfficial(row)}><CircuitBusyIcon busy={busy}><ShieldCheck /></CircuitBusyIcon>{busy ? "儲存中…" : "確定更換"}</Button>
        </span> : asking === "delete" ? <span className="circuit-official-confirm" role="group" aria-label={`刪除「${row.name}」`}>
          <span>刪除後可在「已刪除的 PDF」還原</span>
          <Button title="不刪除" type="button" variant="outline" disabled={busy} onClick={() => setConfirm(null)}>取消</Button>
          <Button data-circuit-tone="delete" data-fill="solid" title={`刪除「${row.name}」；問題的截圖與 AI 比對紀錄都保留`} type="button" disabled={busy} aria-busy={busy || undefined} onClick={() => void remove(row)}><CircuitBusyIcon busy={busy}><Trash2 /></CircuitBusyIcon>{busy ? "刪除中…" : "確定刪除"}</Button>
        </span> : <>
          <Button data-circuit-tone="view" title={`在線路 Review 打開「${row.name}」`} aria-label={`開啟：${row.name}`} type="button" variant="outline" onClick={() => onOpen(row.id)}>開啟<ArrowRight aria-hidden="true" /></Button>
          {canEdit && !isCurrent && <Button data-circuit-tone="official" title={row.localOnly || !row.path ? "只存在上傳者電腦的 PDF 不能當官方版本" : `改用「${row.name}」當官方版本`} aria-label={`設為官方版本：${row.name}`} type="button" variant="outline" disabled={Boolean(busyId) || row.localOnly || !row.path} onClick={() => { setFailure(""); setConfirm({ id: row.id, action: "official" }); }}><ShieldCheck aria-hidden="true" />設為官方版本</Button>}
          {/* The current official version stays where it is: to move or delete it, first set another PDF official. */}
          {canEdit && !isCurrent && <Button data-circuit-tone="edit" title={`把「${row.name}」改列在${kind === "official" ? "自己畫的版本" : "官方版本"}`} aria-label={`${group.move}：${row.name}`} type="button" variant="outline" disabled={Boolean(busyId)} onClick={() => move(row, kind === "official" ? "own" : "official")}><ArrowLeftRight aria-hidden="true" />{group.move}</Button>}
          {canEdit && !isCurrent && <Button data-circuit-tone="delete" title={`刪除「${row.name}」，之後可以在「已刪除的 PDF」還原`} aria-label={`刪除：${row.name}`} type="button" variant="outline" disabled={Boolean(busyId)} onClick={() => { setFailure(""); setConfirm({ id: row.id, action: "delete" }); }}><Trash2 aria-hidden="true" />刪除</Button>}
          {canEdit && isCurrent && <span className="circuit-official-locked" title="目前生效的官方版本不能刪除或移走；要換掉它，在另一份按「設為官方版本」">換掉才能刪除</span>}
        </>}
      </div>
    </li>;
  }

  return <section className="circuit-official" aria-label="官方版本" data-testid="circuit-official-versions">
    <input ref={fileInput} type="file" accept=".pdf,application/pdf" multiple className="sr-only" aria-label="上傳 PDF 到官方版本頁" onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ""; upload(files); }} />
    <div className="circuit-official-scroll">
      <div className="circuit-official-current" data-configured={Boolean(official)}>
        <div className="circuit-official-identity">
          <ShieldCheck aria-hidden="true" />
          <div>
            <h3>目前的官方版本</h3>
            <p className="circuit-official-filename">{official?.name || "還沒有設定"}</p>
            {!official && <p className="circuit-official-hint">在下面的官方版本按「設為官方版本」；還沒有 PDF 時先按「上傳官方 PDF」。</p>}
          </div>
        </div>
        <div className="circuit-official-actions">
          {official && <Button data-circuit-tone="view" title="在線路 Review 打開這份官方版本" type="button" variant="outline" onClick={() => onOpen(official.id)}>開啟這份<ArrowRight aria-hidden="true" /></Button>}
        </div>
        {official && <dl className="circuit-official-metadata">
          <div><dt>圖面日期</dt><dd>{drawingDate(official)}</dd></div>
          <div><dt>頁數</dt><dd>{official.pages.toLocaleString("zh-TW")} 頁</dd></div>
          <div><dt>上傳</dt><dd>{official.uploadedAt ? <><time dateTime={official.uploadedAt}>{dateTime(official.uploadedAt)}</time> · {official.uploadedByName || "同仁"}</> : "—"}</dd></div>
          <div><dt>設為官方</dt><dd>{currentChange ? <><time dateTime={currentChange.at}>{dateTime(currentChange.at)}</time> · {currentChange.byName || "同仁"}</> : "—"}</dd></div>
        </dl>}
      </div>
      {saved && <p className="circuit-official-note" role="status">{saved}</p>}
      {(failure || pdfs.error) && <p className="circuit-official-error" role="alert">{failure || pdfs.error}</p>}
      {pdfs.uploading && <p className="circuit-official-note" role="status"><span className="circuit-wait-line"><CircuitSpinner />正在上傳「{pdfs.uploading}」…</span><CircuitProgress /></p>}
      {GROUPS.map(group => {
        const rows = groups[group.kind];
        return <section key={group.kind} className="circuit-official-group" data-kind={group.kind} aria-label={`${group.title} PDF`} data-testid={`circuit-official-group-${group.kind}`}>
          <header>
            <h3>{group.kind === "official" ? <ShieldCheck aria-hidden="true" /> : <PenLine aria-hidden="true" />}{group.title}<span className="circuit-official-count">{rows.length} 份</span></h3>
            {canEdit && <Button data-circuit-tone="add" title={group.uploadHint} type="button" variant="outline" disabled={Boolean(pdfs.uploading)} onClick={() => chooseUpload(group.kind)}><FileUp aria-hidden="true" />{group.upload}</Button>}
          </header>
          {rows.length ? <ul className="circuit-official-files">{rows.map(row => fileRow(row, group.kind))}</ul> : <p className="circuit-official-empty">{pdfs.loading ? "讀取中…" : group.empty}</p>}
        </section>;
      })}
      {removed.length > 0 && <details className="circuit-official-fold" data-testid="circuit-official-removed">
        <summary title="刪除的 PDF 不會出現在線路 Review、AI 比對與上面的清單；需要時可以還原"><Trash2 aria-hidden="true" />已刪除的 PDF<span className="circuit-official-count">{removed.length} 份</span></summary>
        <ul className="circuit-official-files">{removed.map(row => <li key={row.id} data-testid="circuit-official-removed-file">
          <div className="circuit-official-file">
            <FileText aria-hidden="true" />
            <div>
              <p className="circuit-official-file-name"><strong title={row.name}>{row.name}</strong></p>
              <p className="circuit-official-file-meta"><span>圖面 {drawingDate(row)}</span><span>{row.pages.toLocaleString("zh-TW")} 頁</span><span>上傳 <time dateTime={row.uploadedAt}>{dateTime(row.uploadedAt) || "—"}</time> · {row.uploadedByName || "同仁"}</span><span>刪除 <time dateTime={row.removedAt}>{dateTime(row.removedAt || "")}</time></span></p>
            </div>
          </div>
          <div className="circuit-official-row-actions">
            {canEdit && <Button data-circuit-tone="done" title={`把「${row.name}」放回清單`} aria-label={`還原：${row.name}`} type="button" variant="outline" disabled={Boolean(busyId)} aria-busy={busyId === row.id || undefined} onClick={() => void restore(row)}><CircuitBusyIcon busy={busyId === row.id}><RotateCcw /></CircuitBusyIcon>還原</Button>}
          </div>
        </li>)}</ul>
      </details>}
      <details className="circuit-official-fold" data-testid="circuit-official-history">
        <summary title="每次設定官方版本的時間與設定人；已刪除的 PDF 不列出，同一份連續設定合成一筆"><History aria-hidden="true" />官方版本更換紀錄
          <span className="circuit-official-count" role="status">{loading ? "讀取中…" : loadError ? "讀取失敗" : `${compact.entries.length} 筆${compact.hidden ? `（已刪除的 PDF ${compact.hidden} 筆不列出）` : ""}`}</span></summary>
        {loadError ? <p className="circuit-official-error" role="alert">{loadError}<Button title="重新讀取更換紀錄" type="button" variant="ghost" onClick={() => setReload(value => value + 1)}><RotateCcw aria-hidden="true" />重試</Button></p> : null}
        {compact.entries.length > 0 && <ol className="circuit-official-timeline">
          {compact.entries.map((change, index) => {
            const isCurrent = index === 0 && change.documentId === official?.id;
            return <li key={`${change.revision}:${change.documentId}`} data-current={isCurrent}>
              <div className="circuit-official-history-file">
                <FileText aria-hidden="true" />
                <div><strong>{change.document.name}</strong><span>{drawingDate(change.document)} · {change.document.pages.toLocaleString("zh-TW")} 頁{change.repeats > 1 ? ` · 連續設定 ${change.repeats} 次` : ""}</span></div>
                {isCurrent && <span className="circuit-official-current-tag">目前生效</span>}
              </div>
              <dl className="circuit-official-history-meta">
                <div><dt>設定時間</dt><dd><time dateTime={change.at}>{dateTime(change.at)}</time></dd></div>
                <div><dt>設定人</dt><dd>{change.byName || "同仁"}</dd></div>
              </dl>
            </li>;
          })}
        </ol>}
        {!loading && !loadError && !compact.entries.length && <p className="circuit-official-empty">還沒有更換紀錄</p>}
      </details>
    </div>
  </section>;
}
