import { useState } from "react";
import { createMaterialSpecUrl } from "../material-requests/materialSpecDocuments";
import type { MaterialSpecReport } from "./materialSpecKnowledge";
export function MaterialSpecCitationList({ report, allowed }: { report: MaterialSpecReport; allowed: boolean }) {
  const [error, setError] = useState("");
  const counts = { read: 0, partial: 0, unread: 0 };
  report.files.forEach(file => counts[file.status]++);
  const labels = { read: "已解析", partial: "部分解析", unread: "未讀取" };
  const download = async (path: string, name: string) => {
    if (!allowed) return;
    try { const url = await createMaterialSpecUrl(path, name.includes("/") ? name.split("/")[0] : name); const anchor = document.createElement("a"); anchor.href = url; anchor.rel = "noopener noreferrer"; anchor.target = "_blank"; anchor.click(); }
    catch { setError("無法下載來源，請確認目前附件權限。"); }
  };
  return <details className="mt-4 rounded-xl border border-primary/25 bg-background/40 p-3" data-testid="material-spec-citations"><summary className="cursor-pointer text-sm font-semibold text-primary">料號 SPEC 來源 · {report.files.length} 項 · 已解析 {counts.read}／部分 {counts.partial}／未讀 {counts.unread}</summary><p className="mt-2 text-xs text-muted-foreground">{report.scope}。壓縮內檔案另列；引用 [S編號] 可對照下列原檔，內部項目下載其原始壓縮檔。</p>{report.contextTruncated && <p className="mt-2 text-xs text-amber-300">本次已檢查整份清單，但模型容量不足以引用全部原文；未引用不等於沒有相關資料。</p>}
    <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">{report.files.map(file => <li key={file.id} className="rounded-lg border border-border p-2 text-xs"><div className="flex items-start justify-between gap-2"><span className="min-w-0 break-all font-semibold">[{file.id}] {file.name}</span><span className={`shrink-0 ${file.status === "unread" ? "text-rose-300" : file.status === "partial" ? "text-amber-300" : "text-primary"}`}>{labels[file.status]}</span></div><p className="mt-1 break-words text-muted-foreground">{file.parts.map(part => `${part.bomName} · ${part.mpn} · ${part.refDes}`).join("；")}</p><p className="mt-1 text-muted-foreground">{file.method}{file.included ? " · 已提供本次模型上下文" : " · 本次未引用原文"}</p>{file.note && <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{file.note}</p>}<button className="mt-1 min-h-9 text-primary underline disabled:opacity-40" disabled={!allowed} onClick={() => void download(file.path, file.name)}>下載原始附件</button></li>)}</ul>{error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}</details>;
}
