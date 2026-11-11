import { useEffect, useRef, useState } from "react";
import { ArrowRight, FileText, FileUp, History, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CircuitPdfDocument } from "./circuitPdf";
import { loadCircuitPdfOfficialHistory, type CircuitPdfOfficialChange } from "./officialPdfStorage";
import type { CircuitPdfModel } from "./useCircuitPdfs";
import "./circuitOfficialVersions.css";

const dateTime = (value: string) => value ? new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "";
const drawingDate = ({ date, label }: CircuitPdfDocument) => label ? `${date} · ${label}` : date;
const isPdf = (file: File) => /\.pdf$/i.test(file.name) || /pdf/i.test(file.type);

/**
 * 官方版本: the reference PDF the new drawing is compared with. It changes now and then; this page only records which PDF
 * is the official one, who set it and when. Changing it keeps every old PDF, problem and AI comparison.
 */
export function CircuitOfficialVersions({ seriesId, pdfs, canEdit, onOpen }: {
  seriesId: string; pdfs: CircuitPdfModel; canEdit: boolean; onOpen: (documentId: string) => void;
}) {
  const official = pdfs.official;
  const [history, setHistory] = useState<CircuitPdfOfficialChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [choosing, setChoosing] = useState(false);
  const [candidate, setCandidate] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");
  const [saved, setSaved] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const before = useRef<Set<string> | null>(null);
  const choices = pdfs.documents.filter(row => row.id !== official?.id);
  const current = history.find(change => change.documentId === official?.id) || null;

  useEffect(() => {
    let active = true; setLoading(true); setLoadError("");
    loadCircuitPdfOfficialHistory(seriesId)
      .then(rows => { if (active) setHistory(rows); })
      .catch(error => { if (active) setLoadError(error instanceof Error ? error.message : "更換紀錄讀取失敗，請重試。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [seriesId, reload, official?.id]);
  // A PDF uploaded from here is offered as the new official version as soon as it is in the list.
  useEffect(() => {
    if (!before.current) return;
    const added = pdfs.documents.find(row => !before.current!.has(row.id));
    if (added) { before.current = null; setChoosing(true); setCandidate(added.id); }
  }, [pdfs.documents]);
  useEffect(() => { if (!saved) return; const timer = setTimeout(() => setSaved(""), 5000); return () => clearTimeout(timer); }, [saved]);

  function upload(files: File[]) {
    const pdfFiles = files.filter(isPdf);
    if (!pdfFiles.length) { setFailure("請選擇 PDF 檔案。"); return; }
    setFailure(""); before.current = new Set(pdfs.documents.map(row => row.id));
    void (async () => { for (const file of pdfFiles) await pdfs.upload(file).catch(() => { before.current = null; }); })();
  }
  async function confirm(row: CircuitPdfDocument) {
    setSaving(true); setFailure("");
    try { await pdfs.setOfficial(row.id); setCandidate(""); setChoosing(false); setSaved(`已把「${row.name}」設為官方版本，並記入更換紀錄。`); setReload(value => value + 1); }
    catch (error) { setFailure(error instanceof Error ? error.message : "官方版本尚未儲存，請重試。"); }
    finally { setSaving(false); }
  }

  return <section className="circuit-official" aria-label="官方版本" data-testid="circuit-official-versions">
    <input ref={fileInput} type="file" accept=".pdf,application/pdf" className="sr-only" aria-label="上傳新的官方版本 PDF" onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ""; upload(files); }} />
    <div className="circuit-official-scroll">
      <div className="circuit-official-current" data-configured={Boolean(official)}>
        <div className="circuit-official-identity">
          <ShieldCheck aria-hidden="true" />
          <div>
            <h3>目前的官方版本</h3>
            <p className="circuit-official-filename">{official?.name || "還沒有設定"}</p>
            {!official && <p className="circuit-official-hint">選擇原廠或已發行的 PDF，作為這張板子的正式參考版本。</p>}
          </div>
        </div>
        <div className="circuit-official-actions">
          {official && <Button data-circuit-tone="view" title="在線路 Review 打開這份官方版本" type="button" variant="outline" onClick={() => onOpen(official.id)}>開啟這份<ArrowRight aria-hidden="true" /></Button>}
          {canEdit && <Button data-circuit-tone="official" data-fill="solid" title="從已上傳的 PDF 選一份，或上傳一份 PDF 當官方版本" type="button" aria-expanded={choosing} disabled={saving} onClick={() => { setChoosing(value => !value); setCandidate(""); setFailure(""); }}>{official ? "更換官方版本" : "設定官方版本"}</Button>}
        </div>
        {official && <dl className="circuit-official-metadata">
          <div><dt>圖面日期</dt><dd>{drawingDate(official)}</dd></div>
          <div><dt>頁數</dt><dd>{official.pages.toLocaleString("zh-TW")} 頁</dd></div>
          <div><dt>設定人</dt><dd>{current?.byName || "—"}</dd></div>
          <div><dt>設定時間</dt><dd>{current ? <time dateTime={current.at}>{dateTime(current.at)}</time> : "—"}</dd></div>
        </dl>}
      </div>
      {saved && <p className="circuit-official-note" role="status">{saved}</p>}
      {failure && <p className="circuit-official-error" role="alert">{failure}</p>}
      {pdfs.uploading && <p className="circuit-official-note" role="status">正在上傳「{pdfs.uploading}」…上傳完成後確認即可設為官方版本。</p>}
      {choosing && canEdit && <section className="circuit-official-choose" aria-label="選擇新的官方版本">
        <header><h3>選擇要設為官方版本的 PDF</h3><Button data-circuit-tone="add" title="上傳一份 PDF，傳完再確認是否設為官方版本" type="button" variant="outline" disabled={saving || Boolean(pdfs.uploading)} onClick={() => fileInput.current?.click()}><FileUp aria-hidden="true" />上傳 PDF</Button></header>
        {choices.length ? <ul>{choices.map(row => <li key={row.id} data-candidate={candidate === row.id}>
          <div><strong>{row.name}</strong><small>{drawingDate(row)} · {row.pages} 頁 · {row.uploadedByName || "同仁"} 上傳{row.localOnly ? " · 僅本機可用" : ""}</small></div>
          {candidate === row.id
            ? <span className="circuit-official-confirm"><Button title="不更換" type="button" variant="outline" disabled={saving} onClick={() => setCandidate("")}>取消</Button><Button data-circuit-tone="official" data-fill="solid" title="改用這份當官方版本，並記入更換紀錄" type="button" disabled={saving} onClick={() => void confirm(row)}>{saving ? "儲存中…" : "確定更換"}</Button></span>
            : <Button title={row.localOnly || !row.path ? "只存在上傳者電腦的 PDF 不能當官方版本" : `改用「${row.name}」當官方版本`} type="button" variant="outline" disabled={saving || row.localOnly || !row.path} aria-label={`設為官方版本：${row.name}`} onClick={() => setCandidate(row.id)}>設為官方版本</Button>}
        </li>)}</ul> : <p className="circuit-official-empty">還沒有其他 PDF。按「上傳 PDF」加入一份。</p>}
      </section>}
      <section className="circuit-official-history" aria-label="官方版本更換紀錄">
        <header><h3><History aria-hidden="true" />更換紀錄</h3><span role="status">{loading ? "讀取中…" : loadError ? "" : `${history.length} 筆紀錄`}</span></header>
        {loadError ? <p className="circuit-official-error" role="alert">{loadError}<Button title="重新讀取更換紀錄" type="button" variant="ghost" onClick={() => setReload(value => value + 1)}><RotateCcw aria-hidden="true" />重試</Button></p> : null}
        {history.length > 0 && <ol className="circuit-official-timeline">
          {history.map((change, index) => {
            const isCurrent = index === 0 && change.documentId === official?.id;
            return <li key={`${change.revision}:${change.documentId}`} data-current={isCurrent}>
              <div className="circuit-official-history-file">
                <FileText aria-hidden="true" />
                <div><strong>{change.document.name}</strong><span>{drawingDate(change.document)} · {change.document.pages.toLocaleString("zh-TW")} 頁</span></div>
                {isCurrent && <span className="circuit-official-current-tag">目前生效</span>}
              </div>
              <dl className="circuit-official-history-meta">
                <div><dt>設定時間</dt><dd><time dateTime={change.at}>{dateTime(change.at)}</time></dd></div>
                <div><dt>設定人</dt><dd>{change.byName || "同仁"}</dd></div>
              </dl>
            </li>;
          })}
        </ol>}
        {!loading && !loadError && !history.length && <p className="circuit-official-empty">還沒有更換紀錄</p>}
      </section>
    </div>
  </section>;
}
