import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Search, X, ChevronLeft, ChevronRight, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { filterTrackingRows, type ComparisonFilters } from "./filters";
import type { ComparisonSession, ReviewReply, TrackRow } from "./types";

const dispositions = ["修改", "刻意設計", "誤報", "待討論", "N/A"];
const categoryLabels: Record<string, string> = Object.assign(Object.create(null), { PART: "元件", BOM: "BOM 差異", CONN: "連線差異", DRC: "DRC", CAPV: "電容耐壓", BOMCHK: "BOM 檢查", NETRULE: "線路規則", I2C: "I²C" });
const statusLabels: Record<string, string> = Object.assign(Object.create(null), { all: "全部狀態", unfilled: "未回覆", filled: "已回覆", NEW: "新增問題", EXISTING: "既有問題", CHANGE: "改版差異" });
const fieldLabels = { disp: "處置", owner: "負責人", target_rev: "預計版次", note: "備註", filled: "填寫日期" };
const emptyReply: ReviewReply = { disp: "", owner: "", target_rev: "", note: "", filled: "" };
type Option = { value: string; label: string };
function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Option[] }) {
  const currentOptions = options.some(option => option.value === value) ? options : [...options, { value, label: value }];
  return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent>{currentOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>;
}
export function ComparisonResults({ session, filters, update, clear, canEdit, onSaveReply, pdfUrl, busy }: { session: ComparisonSession; filters: ComparisonFilters; update: <K extends keyof ComparisonFilters>(key: K, value: ComparisonFilters[K]) => void; clear: () => void; canEdit: boolean; onSaveReply: (key: string, reply: ReviewReply) => Promise<void>; pdfUrl?: string; busy: boolean }) {
  const [selected, setSelected] = useState<TrackRow | null>(null);
  const [draft, setDraft] = useState<ReviewReply>(emptyReply);
  const [saved, setSaved] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const rows = useMemo(() => filterTrackingRows(session.result.rows, session.replies, filters), [session, filters]);
  useEffect(() => { setPage(0); }, [filters, session.id]);
  useEffect(() => { setSelected(null); }, [session.id]);
  const owners = [...new Set(Object.values(session.replies).map(reply => reply.owner).filter(Boolean))].sort();
  const categories = [...new Set(session.result.rows.map(row => row.category))].sort();
  const pages = [...new Set(session.result.rows.map(row => String(row.page ?? "unknown")))].sort((a, b) => Number(a) - Number(b));
  const active = [
    { key: "query" as const, field: "搜尋", label: filters.query, value: filters.query, fallback: "" },
    { key: "status" as const, field: "狀態", label: statusLabels[filters.status] ?? filters.status, value: filters.status, fallback: "all" },
    { key: "owner" as const, field: "負責人", label: filters.owner === "unassigned" ? "未指派" : filters.owner, value: filters.owner, fallback: "all" },
    { key: "severity" as const, field: "嚴重度", label: filters.severity, value: filters.severity, fallback: "all" },
    { key: "category" as const, field: "類別", label: categoryLabels[filters.category] ?? filters.category, value: filters.category, fallback: "all" },
    { key: "page" as const, field: "頁碼", label: filters.page === "unknown" ? "未知頁" : filters.page, value: filters.page, fallback: "all" },
  ].filter(chip => chip.value !== chip.fallback);
  const open = (row: TrackRow) => { setDraft({ ...emptyReply, ...session.replies[row.key] }); setSaved(""); setDialogError(""); setSelected(row); };
  const save = async () => {
    if (!selected) return;
    setSaving(true); setDialogError("");
    try { await onSaveReply(selected.key, draft); setSaved("回覆已儲存"); }
    catch (error) { setDialogError(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  };
  const pageCount = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  return <section className="comparison-results" aria-label="檢查結果">
    <div className="comparison-section-heading"><div><h2>{filters.tab === "review" ? "審查追蹤" : "檢查結果"}</h2><p>{session.projectName} · {session.result.meta.a.label} → {session.result.meta.b.label} · {session.result.meta.generated}</p></div><Badge variant="secondary">{rows.length} / {session.result.rows.length} 筆</Badge></div>
    <div className="comparison-filterbar"><label className="comparison-search"><Search /><Input value={filters.query} onChange={event => update("query", event.target.value)} placeholder="搜尋 RefDes、Net、規則或說明" aria-label="搜尋比對結果" /></label><FilterSelect label="狀態" value={filters.status} onChange={value => update("status", value)} options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} /><FilterSelect label="負責人" value={filters.owner} onChange={value => update("owner", value)} options={[{ value: "all", label: "全部負責人" }, { value: "unassigned", label: "未指派" }, ...owners.map(value => ({ value, label: value }))]} /><FilterSelect label="嚴重度" value={filters.severity} onChange={value => update("severity", value)} options={[{ value: "all", label: "全部嚴重度" }, ...["ERROR", "WARN", "INFO"].map(value => ({ value, label: value }))]} /><FilterSelect label="類別" value={filters.category} onChange={value => update("category", value)} options={[{ value: "all", label: "全部類別" }, ...categories.map(value => ({ value, label: categoryLabels[value] ?? value }))]} /><FilterSelect label="線路圖頁碼" value={filters.page} onChange={value => update("page", value)} options={[{ value: "all", label: "全部頁碼" }, ...pages.map(value => ({ value, label: value === "unknown" ? "未知頁" : `第 ${value} 頁` }))]} /></div>
    {!!active.length && <div className="comparison-filter-chips">{active.map(chip => <Button key={chip.key} variant="outline" size="sm" aria-label={`清除${chip.field}條件`} onClick={() => update(chip.key, chip.fallback)}>{chip.field}：{chip.label}<X /></Button>)}<Button variant="ghost" size="sm" onClick={clear}>全部清除</Button></div>}
    <Table className="comparison-result-table"><TableHeader><TableRow><TableHead>嚴重度</TableHead><TableHead>狀態</TableHead><TableHead>規則與說明</TableHead><TableHead>RefDes / Net</TableHead><TableHead>頁</TableHead><TableHead>處置／負責人</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{rows.slice(currentPage * 50, (currentPage + 1) * 50).map(row => <TableRow key={row.key} data-severity={row.severity}><TableCell><Badge className={`comparison-severity is-${row.severity.toLowerCase()}`}>{row.severity}</Badge></TableCell><TableCell><span className={`comparison-row-status is-${row.status.toLowerCase()}`}>{statusLabels[row.status] ?? row.status}</span></TableCell><TableCell><strong>{row.title}</strong><small>{row.rule}</small></TableCell><TableCell><span>{row.refdes.join(", ") || "—"}</span><small>{row.nets.join(", ") || "—"}</small></TableCell><TableCell>{row.page ?? "—"}</TableCell><TableCell>{session.replies[row.key]?.disp || "未填"}<small>{session.replies[row.key]?.owner || "未指派"}</small></TableCell><TableCell><Button variant="outline" size="sm" aria-label={`檢視 ${row.key}`} onClick={() => open(row)}>檢視</Button></TableCell></TableRow>)}{!rows.length && <TableRow><TableCell colSpan={7} className="comparison-empty-result">{active.length || session.result.rows.length ? "目前篩選條件沒有符合的比對結果" : "本次比對沒有檢查項目，請核對輸入完整性與報表"}</TableCell></TableRow>}</TableBody></Table>
    <footer className="comparison-results-footer"><span>每頁 50 筆 · 第 {currentPage + 1} / {pageCount} 頁</span><div><Button variant="ghost" size="icon" aria-label="上一頁結果" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft /></Button><Button variant="ghost" size="icon" aria-label="下一頁結果" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight /></Button></div></footer>
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open && !saving) setSelected(null); }}><DialogContent className="comparison-detail-dialog"><DialogHeader><DialogTitle>{selected?.title}</DialogTitle><DialogDescription>{selected?.key} · {selected?.page ? `第 ${selected.page} 頁 ${selected.page_title}` : "未取得頁碼"}</DialogDescription></DialogHeader>{selected && <><div className="comparison-detail-tags"><Badge className={`comparison-severity is-${selected.severity.toLowerCase()}`}>{selected.severity}</Badge><Badge variant="secondary">{statusLabels[selected.status] ?? selected.status}</Badge>{pdfUrl && <Button asChild variant="outline" size="sm"><a href={`${pdfUrl}#nameddest=${encodeURIComponent(selected.dest)}`} target="_blank" rel="noopener noreferrer"><ExternalLink />看圖</a></Button>}</div><dl className="comparison-detail-meta"><div><dt>RefDes</dt><dd>{selected.refdes.join(", ") || "—"}</dd></div><div><dt>Net</dt><dd>{selected.nets.join(", ") || "—"}</dd></div><div><dt>Pin</dt><dd>{selected.pins.join(", ") || "—"}</dd></div></dl><p className="comparison-detail-text">{selected.detail}</p><div className="comparison-review-form"><h3><ClipboardCheck />審查回覆</h3><div className="comparison-review-fields"><div><Label htmlFor="compare-disp">處置</Label><Select value={draft.disp || "blank"} disabled={!canEdit || saving} onValueChange={value => { setDraft(current => ({ ...current, disp: value === "blank" ? "" : value })); setSaved(""); }}><SelectTrigger id="compare-disp"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="blank">未填</SelectItem>{dispositions.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="compare-owner">負責人</Label><Input id="compare-owner" value={draft.owner} maxLength={120} disabled={!canEdit || saving} onChange={event => { setDraft(current => ({ ...current, owner: event.target.value })); setSaved(""); }} /></div><div><Label htmlFor="compare-target">預計版次</Label><Input id="compare-target" value={draft.target_rev} maxLength={120} disabled={!canEdit || saving} onChange={event => { setDraft(current => ({ ...current, target_rev: event.target.value })); setSaved(""); }} /></div></div><Label htmlFor="compare-note">備註</Label><Textarea id="compare-note" value={draft.note} maxLength={10000} disabled={!canEdit || saving} onChange={event => { setDraft(current => ({ ...current, note: event.target.value })); setSaved(""); }} /><div className="comparison-review-save"><span role="status">{saved || (canEdit ? "編輯後儲存回覆；原始檢查內容會保留" : "目前為唯讀權限")}</span><Button disabled={!canEdit || saving || busy} onClick={() => void save()}>{saving ? "儲存中…" : "儲存回覆"}</Button></div>{dialogError && <p role="alert" className="comparison-alert">{dialogError}</p>}</div>{!!session.history.filter(change => change.key === selected.key).length && <details className="comparison-history"><summary>這筆的修改紀錄</summary>{session.history.filter(change => change.key === selected.key).slice().reverse().slice(0, 20).map((change, index) => <p key={`${change.at}-${index}`}><time>{change.at}</time> {fieldLabels[change.field]}：{change.old || "空白"} → {change.value || "空白"}</p>)}</details>}</>}</DialogContent></Dialog>
  </section>;
}
