import { useEffect, useRef, useState } from "react";
import { Check, Copy, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "./files";
import type { FailureLog } from "./failureLog";
import { isConnectionProblem } from "./failureLogStore";

/**
 * off: nothing is sent (demo or not signed in safely) · sending · saved: the backend has it ·
 * queued: kept on this computer until the backend can be reached · rejected: the backend refused it.
 */
export type FailureRecordState = "off" | "sending" | "saved" | "queued" | "rejected";
export interface ComparisonFailureState { id: string; log: FailureLog; record: FailureRecordState; recordNote?: string }

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    // Clipboard access can be refused (http page, permission): fall back to a selection the browser copies itself.
    const area = document.createElement("textarea");
    area.value = text; area.setAttribute("readonly", ""); area.style.position = "fixed"; area.style.opacity = "0";
    document.body.appendChild(area); area.select();
    try { return document.execCommand("copy"); } catch { return false; } finally { area.remove(); }
  }
}

/** A failed job in words a user can act on, the start of the file that could not be read, and whether the backend has the record. */
export function ComparisonFailureNotice({ failure, onClose }: { failure: ComparisonFailureState; onClose: () => void }) {
  const { log, record } = failure;
  const [copied, setCopied] = useState<"" | "done" | "failed">("");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const box = useRef<HTMLElement>(null);
  // The button that started the job can be far down the page (on a phone it is below both file lists): bring the
  // notice to where the user is looking, once per failure.
  useEffect(() => { setCopied(""); box.current?.scrollIntoView({ block: "start" }); }, [failure.id]);
  const copy = async () => {
    setCopied(await copyText(log.copyText) ? "done" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(""), 2400);
  };
  const recordText = record === "saved" ? `已記到後台（編號 ${failure.id.slice(0, 8)}）：原因、檔名、上面這段檔案開頭與引擎訊息。管理員在「意見收集 → 回報管理」看得到這筆紀錄，不用另外傳 LOG。`
    : record === "sending" ? "正在把這次失敗記到後台…"
      : record === "queued" ? (failure.recordNote && !isConnectionProblem(failure.recordNote)
        ? `後台這次沒有收下這筆紀錄（${failure.recordNote}）。紀錄先留在這台電腦，下次開啟這一頁時會再送；要管理員馬上看，請按「複製紀錄」。`
        : "還沒送到後台（連不上）。紀錄先留在這台電腦，連線恢復或下次開啟這一頁時會自動補送。")
        : record === "rejected" ? `後台沒有收下這筆紀錄${failure.recordNote ? `（${failure.recordNote}）` : ""}。請按「複製紀錄」把內容傳給管理員。`
          : "這次失敗沒有送到後台：目前不是安全登入的帳號。需要管理員看時，請按「複製紀錄」。";
  return <section ref={box} className="comparison-failure" role="alert" aria-labelledby="comparison-failure-title" data-testid="comparison-failure">
    <header>
      <TriangleAlert aria-hidden="true" />
      <div><h2 id="comparison-failure-title">{log.job}沒有完成：{log.explanation.headline}</h2>{log.explanation.detail && <p>{log.explanation.detail}</p>}</div>
      <Button variant="outline" size="sm" title="把完整的失敗紀錄（原因、檔案開頭、引擎訊息）複製起來，可以貼到信件或訊息" onClick={() => void copy()}>{copied === "done" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied === "done" ? "已複製" : copied === "failed" ? "複製失敗" : "複製紀錄"}</Button>
      <Button variant="ghost" size="icon" aria-label="關閉失敗訊息" title="收起這則訊息；已記到後台的紀錄不會被刪除" onClick={onClose}><X aria-hidden="true" /></Button>
    </header>
    {!!log.explanation.steps.length && <ol className="comparison-failure-steps">{log.explanation.steps.map(step => <li key={step}>{step}</li>)}</ol>}
    {log.previews.map(preview => <div key={`${preview.side}:${preview.path}`} className="comparison-failure-file">
      <p><strong>{preview.side}｜{preview.path}</strong><span>{formatBytes(preview.size)} · {preview.format}</span></p>
      {preview.notes.map(note => <p key={note} className="comparison-failure-finding"><b>判斷</b>{note}</p>)}
      {!!preview.lines.length && <><p className="comparison-failure-caption">這份檔案的開頭（左邊是行號，⇥ 代表 Tab）</p><pre tabIndex={0} aria-label={`${preview.path} 的開頭內容`}>{preview.lines.join("\n")}</pre></>}
    </div>)}
    <p className="comparison-failure-record" data-state={record} role="status">{record === "saved" && <Check aria-hidden="true" />}{recordText}</p>
    {(log.summary.traceback || log.raw !== log.explanation.headline) && <details className="comparison-failure-raw"><summary title="這次失敗原本的訊息，一字不改；給管理員或工程師看">{log.summary.traceback ? "引擎原始訊息" : "原始訊息"}</summary><pre tabIndex={0}>{log.raw}</pre></details>}
  </section>;
}
