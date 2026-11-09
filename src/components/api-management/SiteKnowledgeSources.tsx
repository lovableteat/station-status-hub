import { BookOpen, ExternalLink } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { SiteKnowledgeReport } from "./siteKnowledge";

export function SiteKnowledgeControl({ enabled, onChange, allowed, loading }: { enabled: boolean; onChange: (value: boolean) => void; allowed: boolean; loading: boolean }) {
  return <section className="rounded-lg border border-primary/25 bg-primary/5 p-3" data-site-knowledge-control><label className="flex min-h-11 items-center justify-between gap-3"><span className="font-semibold text-primary">全站資料</span><Switch aria-label="全站資料" checked={enabled && allowed} disabled={!allowed || loading} onCheckedChange={onChange} /></label><p className="text-xs leading-6 text-muted-foreground">依問題查詢你可讀的網站資料與操作說明，回答附來源。檔案本文與 SPEC 深度分析仍須另選來源；私人或鎖定內容不會繞過權限。</p></section>;
}
export function SiteKnowledgeSources({ report }: { report: SiteKnowledgeReport }) {
  return <details className="mt-3 rounded-lg border border-primary/25 p-3" data-site-knowledge-sources><summary className="cursor-pointer text-sm font-medium text-primary"><BookOpen aria-hidden="true" className="mr-2 inline h-4 w-4" />全站資料來源 · {report.citations.length} 則</summary><div className="mt-3 space-y-3 text-xs leading-6"><p className="text-muted-foreground">每次提問重新查詢；以下為本次檢索範圍，不代表已讀取所有檔案全文。</p>{report.sources.map(source => <p key={source.label} className={source.error ? "text-destructive" : "text-muted-foreground"}><strong>{source.label}</strong>：{source.error ? `查詢失敗 · ${source.error}` : `符合 ${source.count ?? "未知"} 筆／引用 ${source.shown} 筆。${source.note ?? ""}`}</p>)}<ol className="space-y-2">{report.citations.map(item => <li key={item.id}><a href={item.href} className="inline-flex min-h-9 items-center gap-2 text-primary underline underline-offset-4">[{item.id}] {item.title}<ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" /></a></li>)}</ol></div></details>;
}
