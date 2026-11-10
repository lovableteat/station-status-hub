import { useEffect, useRef, useState } from "react";
import { ArrowRight, FileUp, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { circuitPdfVersionLabel, type CircuitPdfDocument } from "./circuitPdf";
import { loadCircuitPdfOfficialHistory, type CircuitPdfOfficialChange } from "./officialPdfStorage";
import type { CircuitPdfModel } from "./useCircuitPdfs";

const dateTime = (value: string) => value ? new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "";
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
        <ShieldCheck aria-hidden="true" />
        {official ? <div>
          <span>目前的官方版本</span>
          <strong title={official.name}>{official.name}</strong>
          <small>{circuitPdfVersionLabel(official)} · {official.pages} 頁{current ? ` · ${current.byName || "同仁"} 於 ${dateTime(current.at)} 設定` : ""}</small>
        </div> : <div>
          <span>官方版本</span>
          <strong>還沒有設定</strong>
          <small>選一份原廠或已發行的 PDF 當官方版本，AI 比對會拿新版跟它比。</small>
        </div>}
        <div className="circuit-official-actions">
          {official && <Button title="在線路 Review 打開這份官方版本" type="button" variant="outline" onClick={() => onOpen(official.id)}>開啟這份<ArrowRight aria-hidden="true" /></Button>}
          {canEdit && <Button title="從已上傳的 PDF 選一份，或上傳新的 PDF 當官方版本" type="button" aria-expanded={choosing} onClick={() => { setChoosing(value => !value); setCandidate(""); setFailure(""); }}>{official ? "更換官方版本" : "設定官方版本"}</Button>}
        </div>
      </div>
      {saved && <p className="circuit-official-note" role="status">{saved}</p>}
      {failure && <p className="circuit-official-error" role="alert">{failure}</p>}
      {pdfs.uploading && <p className="circuit-official-note" role="status">正在上傳「{pdfs.uploading}」…上傳完成後確認即可設為官方版本。</p>}
      {choosing && canEdit && <section className="circuit-official-choose" aria-label="選擇新的官方版本">
        <header><h3>選一份 PDF 當官方版本</h3><Button title="上傳一份 PDF，傳完再確認是否設為官方版本" type="button" variant="outline" disabled={Boolean(pdfs.uploading)} onClick={() => fileInput.current?.click()}><FileUp aria-hidden="true" />上傳新的 PDF</Button></header>
        {choices.length ? <ul>{choices.map(row => <li key={row.id} data-candidate={candidate === row.id}>
          <div><strong title={row.name}>{row.name}</strong><small>{circuitPdfVersionLabel(row)} · {row.pages} 頁 · {row.uploadedByName || "同仁"} 上傳{row.localOnly ? " · 只在上傳者電腦，不能當官方版本" : ""}</small></div>
          {candidate === row.id
            ? <span className="circuit-official-confirm">確定改用這份？<Button title="不更換" type="button" variant="outline" disabled={saving} onClick={() => setCandidate("")}>取消</Button><Button title="改用這份當官方版本，並記入更換紀錄" type="button" disabled={saving} onClick={() => void confirm(row)}>{saving ? "儲存中…" : "確定更換"}</Button></span>
            : <Button title={row.localOnly || !row.path ? "只存在上傳者電腦的 PDF 不能當官方版本" : `改用「${row.name}」當官方版本`} type="button" variant="outline" disabled={saving || row.localOnly || !row.path} aria-label={`設為官方版本：${row.name}`} onClick={() => setCandidate(row.id)}>設為官方版本</Button>}
        </li>)}</ul> : <p className="circuit-official-empty">還沒有其他 PDF。按「上傳新的 PDF」加入一份。</p>}
        <p className="circuit-official-hint">更換只會改用新的參考原檔；舊的 PDF、問題紀錄與 AI 比對結果都保留。</p>
      </section>}
      <section className="circuit-official-history" aria-label="官方版本更換紀錄">
        <header><h3>更換紀錄</h3><span>{loading ? "讀取中…" : `${history.length} 次`}</span></header>
        {loadError ? <p className="circuit-official-error" role="alert">{loadError}<Button title="重新讀取更換紀錄" type="button" variant="ghost" onClick={() => setReload(value => value + 1)}><RotateCcw aria-hidden="true" />重試</Button></p> : null}
        <table>
          <thead><tr><th scope="col">設定時間</th><th scope="col">官方版本</th><th scope="col">圖面日期</th><th scope="col">設定人</th></tr></thead>
          <tbody>
            {history.map((change, index) => <tr key={`${change.revision}:${change.documentId}`} data-current={index === 0 && change.documentId === official?.id}>
              <td>{dateTime(change.at)}</td>
              <td><span title={change.document.name}>{change.document.name}</span>{index === 0 && change.documentId === official?.id && <em>目前</em>}</td>
              <td>{circuitPdfVersionLabel(change.document)}</td>
              <td>{change.byName || "同仁"}</td>
            </tr>)}
            {!loading && !history.length && <tr><td colSpan={4} className="circuit-official-empty">還沒有更換紀錄</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  </section>;
}
