import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Search, X, ChevronLeft, ChevronRight, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsCompactLayout } from "@/hooks/use-mobile";
import { MobileRecordCard } from "@/components/layout/mobile";
import { filterTrackingRows, type ComparisonFilters } from "./filters";
import type { ComparisonSession, ReviewReply, TrackRow } from "./types";
import { ComparisonBatchReview, ComparisonSideBySide } from "./ComparisonReviewTools";
import { readPdfLocations, rootCauseView, type ReplyPatches } from "./reviewTools";

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
function FilterMulti({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Option[] }) {
  const selected = value === "all" ? [] : value.split(",");
  return <Popover><PopoverTrigger asChild><Button variant="outline" aria-label={label}>{selected.length ? `${label} · ${selected.map(item => options.find(option => option.value === item)?.label ?? item).join("、")}` : `全部${label}`}</Button></PopoverTrigger><PopoverContent className="comparison-multi-filter" align="start"><strong>{label}（可多選）</strong><Button variant="ghost" size="sm" onClick={() => onChange("all")}>全部清除</Button>{options.map(option => <label key={option.value}><input type="checkbox" checked={selected.includes(option.value)} onChange={event => { const next = event.target.checked ? [...selected, option.value] : selected.filter(item => item !== option.value); onChange(next.length ? next.join(",") : "all"); }} />{option.label}</label>)}</PopoverContent></Popover>;
}
export function ComparisonResults({ session, filters, update, clear, canEdit, onSaveReply, pdfUrl, pdfUrlA, busy, review = false, onSaveReplies, onRemember }: { session: ComparisonSession; filters: ComparisonFilters; update: <K extends keyof ComparisonFilters>(key: K, value: ComparisonFilters[K]) => void; clear: () => void; canEdit: boolean; onSaveReply: (key: string, reply: ReviewReply) => Promise<void>; pdfUrl?: string; pdfUrlA?: string; busy: boolean; review?: boolean; onSaveReplies?: (patches: ReplyPatches) => Promise<void>; onRemember?: (key: string) => Promise<void> }) {
  const compact = useIsCompactLayout();
  const [mobileView, setMobileView] = useState<"cards" | "table">("cards");
  const [selected, setSelected] = useState<TrackRow | null>(null);
  const [draft, setDraft] = useState<ReviewReply>(emptyReply);
  const [saved, setSaved] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const [reviewMode, setReviewMode] = useState<"list" | "side" | "batch">("side");
  const [fold, setFold] = useState(true);
  const [reviewKey, setReviewKey] = useState(session.lastReviewKey ?? "");
  const [revealKey, setRevealKey] = useState("");
  const reviewAnchor = useRef<HTMLDivElement>(null);
  const locationsA = useMemo(() => readPdfLocations(session.result.artifacts, "a"), [session.result.artifacts]);
  const locationsB = useMemo(() => readPdfLocations(session.result.artifacts, "b"), [session.result.artifacts]);
  const matched = useMemo(() => filterTrackingRows(session.result.rows, session.replies, filters), [session.result.rows, session.replies, filters]);
  const rows = useMemo(() => review ? rootCauseView(session.result.rows, matched, fold, locationsB, revealKey) : matched, [review, session.result.rows, matched, fold, locationsB, revealKey]);
  const selectReview = (key: string) => { setReviewKey(key); setRevealKey(key); };
  useEffect(() => { setRevealKey(""); }, [filters]);
  // Row numbers (#n) follow the engine's row order, the same numbers the Excel 父項 column and the PDF index use.
  const rowNumbers = useMemo(() => new Map(session.result.rows.map((row, index) => [row.key, index + 1])), [session.result.rows]);
  const parentLabel = (row: TrackRow) => row.parent && rowNumbers.has(row.parent) ? `同根因 → #${rowNumbers.get(row.parent)}` : "";
  const childrenLabel = (row: TrackRow) => row.children?.length ? `含 ${row.children.length} 筆子項 ${row.children.map(key => `#${rowNumbers.get(key) ?? "?"}`).join(" ")}` : "";
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
    { key: "rule" as const, field: "規則", label: filters.rule, value: filters.rule || "all", fallback: "all" },
    { key: "disposition" as const, field: "處置", label: filters.disposition, value: filters.disposition || "all", fallback: "all" },
    { key: "revisionStatus" as const, field: "版本狀態", label: filters.revisionStatus?.split(",").map(value => statusLabels[value] ?? value).join("、"), value: filters.revisionStatus || "all", fallback: "all" },
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
  const pageRows = rows.slice(currentPage * 50, (currentPage + 1) * 50);
  const emptyText = active.length || session.result.rows.length ? "目前篩選條件沒有符合的比對結果" : "本次比對沒有檢查項目，請核對輸入完整性與報表";
  const openInReview = (row: TrackRow) => {
    selectReview(row.key);
    setReviewMode("side");
    if (canEdit) void onRemember?.(row.key).catch(() => {});
    requestAnimationFrame(() => reviewAnchor.current?.scrollIntoView({ block: "start" }));
  };
  const inspect = (row: TrackRow) => { if (review && onSaveReplies) openInReview(row); else open(row); };
  const currentReviewKey = (rows.find(item => item.key === reviewKey) ?? rows[0])?.key;
  const showCards = compact && mobileView === "cards";
  return <section className="comparison-results" aria-label="檢查結果">
    <div className="comparison-section-heading"><div><h2>{filters.tab === "review" ? "審查追蹤" : "檢查結果"}</h2><p>{session.projectName} · {session.result.meta.a.label} → {session.result.meta.b.label} · {session.result.meta.generated}</p></div><Badge variant="secondary">{rows.length} / {session.result.rows.length} 筆</Badge>{compact && <div className="comparison-results-view" role="group" aria-label="結果呈現方式">{([["cards", "卡片"], ["table", "表格"]] as const).map(([key, title]) => <Button key={key} size="sm" variant={mobileView === key ? "secondary" : "outline"} aria-pressed={mobileView === key} onClick={() => setMobileView(key)}>{title}</Button>)}</div>}</div>
    {review && <div className="comparison-review-modes" role="group" aria-label="審查操作方式">{([["side", "並排瀏覽"], ["batch", "批次填寫"], ["list", "結果清單"]] as const).map(([key, title]) => <Button key={key} variant={reviewMode === key ? "secondary" : "outline"} aria-pressed={reviewMode === key} onClick={() => setReviewMode(key)}>{title}</Button>)}<label><input type="checkbox" checked={fold} onChange={event => setFold(event.target.checked)} />摺疊同根因子項</label></div>}
    <div className="comparison-filterbar"><label className="comparison-search"><Search /><Input value={filters.query} onChange={event => update("query", event.target.value)} placeholder="搜尋 RefDes、Net、規則或說明" aria-label="搜尋比對結果" /></label><FilterSelect label="狀態" value={filters.status} onChange={value => update("status", value)} options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} /><FilterSelect label="負責人" value={filters.owner} onChange={value => update("owner", value)} options={[{ value: "all", label: "全部負責人" }, { value: "unassigned", label: "未指派" }, ...owners.map(value => ({ value, label: value }))]} /><FilterMulti label="嚴重度" value={filters.severity} onChange={value => update("severity", value)} options={["ERROR", "WARN", "INFO"].map(value => ({ value, label: value }))} /><FilterSelect label="類別" value={filters.category} onChange={value => update("category", value)} options={[{ value: "all", label: "全部類別" }, ...categories.map(value => ({ value, label: categoryLabels[value] ?? value }))]} /><FilterMulti label="版本狀態" value={filters.revisionStatus || "all"} onChange={value => update("revisionStatus", value)} options={["NEW", "EXISTING", "CHANGE"].map(value => ({ value, label: statusLabels[value] }))} /><FilterMulti label="檢查規則" value={filters.rule || "all"} onChange={value => update("rule", value)} options={[...new Set(session.result.rows.map(row => row.rule))].sort().map(value => ({ value, label: value }))} /><FilterSelect label="處置篩選" value={filters.disposition || "all"} onChange={value => update("disposition", value)} options={[{ value: "all", label: "全部處置" }, ...dispositions.map(value => ({ value, label: value }))]} /><FilterSelect label="線路圖頁碼" value={filters.page} onChange={value => update("page", value)} options={[{ value: "all", label: "全部頁碼" }, ...pages.map(value => ({ value, label: value === "unknown" ? "未知頁" : `第 ${value} 頁` }))]} /></div>
    {!!active.length && <div className="comparison-filter-chips">{active.map(chip => <Button key={chip.key} variant="outline" size="sm" aria-label={`清除${chip.field}條件`} onClick={() => update(chip.key, chip.fallback)}>{chip.field}：{chip.label}<X /></Button>)}<Button variant="ghost" size="sm" onClick={clear}>全部清除</Button></div>}
    {review && onSaveReplies && <>
      <div ref={reviewAnchor} className="comparison-review-anchor" hidden={reviewMode !== "side"}><ComparisonSideBySide session={session} rows={rows} selectedKey={reviewKey} onSelect={selectReview} locationsA={locationsA} locationsB={locationsB} urls={{ a: pdfUrlA, b: pdfUrl }} canEdit={canEdit} busy={busy} onSave={onSaveReplies} onRemember={onRemember ?? (async () => {})} /></div>
      <div hidden={reviewMode !== "batch"}><ComparisonBatchReview session={session} rows={rows} canEdit={canEdit} busy={busy} onSave={onSaveReplies} onOpen={openInReview} /></div>
    </>}
    <div hidden={review && reviewMode === "batch"}>
    {showCards && <div className="comparison-result-cards" data-testid="comparison-result-cards">{pageRows.map(row => <MobileRecordCard key={row.key} testId="comparison-result-card" title={row.title} titleAttr={row.title} subtitle={`#${rowNumbers.get(row.key)} · ${row.rule}${childrenLabel(row) ? ` · ${childrenLabel(row)}` : ""}${parentLabel(row) ? ` · ${parentLabel(row)}` : ""}`} badges={<><Badge className={`comparison-severity is-${row.severity.toLowerCase()}`}>{row.severity}</Badge><span className={`comparison-row-status is-${row.status.toLowerCase()}`}>{statusLabels[row.status] ?? row.status}</span></>} meta={[
      { key: "refdes", label: "RefDes", value: row.refdes.join(", ") || "—", mono: true, wide: row.refdes.join(", ").length > 24 },
      { key: "net", label: "Net", value: row.nets.join(", ") || "—", mono: true, wide: row.nets.join(", ").length > 24 },
      { key: "page", label: "頁", value: row.page ?? "—" },
      ...(review ? [{ key: "locate", label: "A／B 定位", value: `A ${locationsA.get(row.key)?.page ? `p.${locationsA.get(row.key)!.page}` : "—"} · B ${locationsB.get(row.key)?.page ? `p.${locationsB.get(row.key)!.page}` : "—"}` }] : []),
      { key: "reply", label: "處置／負責人", value: `${session.replies[row.key]?.disp || "未填"} · ${session.replies[row.key]?.owner || "未指派"}` },
    ]} actions={[{ key: "inspect", label: "檢視", tone: "primary", onClick: () => inspect(row) }]} />)}{!rows.length && <p className="comparison-empty-result">{emptyText}</p>}</div>}
    {!showCards && <Table className="comparison-result-table"><TableHeader><TableRow><TableHead>項次</TableHead><TableHead>嚴重度</TableHead><TableHead>狀態</TableHead><TableHead>規則與說明</TableHead><TableHead>RefDes / Net</TableHead><TableHead>頁</TableHead>{review && <TableHead>A／B 定位</TableHead>}<TableHead>處置／負責人</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>{pageRows.map(row => <TableRow key={row.key} data-severity={row.severity} data-current={review && row.key === currentReviewKey}><TableCell>#{rowNumbers.get(row.key)}</TableCell><TableCell><Badge className={`comparison-severity is-${row.severity.toLowerCase()}`}>{row.severity}</Badge></TableCell><TableCell><span className={`comparison-row-status is-${row.status.toLowerCase()}`}>{statusLabels[row.status] ?? row.status}</span></TableCell><TableCell>{parentLabel(row) && <small className="comparison-rootcause">{parentLabel(row)}</small>}<strong>{row.title}</strong><small>{row.rule}{childrenLabel(row) && ` · ${childrenLabel(row)}`}</small></TableCell><TableCell><span>{row.refdes.join(", ") || "—"}</span><small>{row.nets.join(", ") || "—"}</small></TableCell><TableCell>{row.page ?? "—"}</TableCell>{review && <TableCell><span>A {locationsA.get(row.key)?.page ? `✓ p.${locationsA.get(row.key)!.page}` : "—"}</span><small>B {locationsB.get(row.key)?.page ? `✓ p.${locationsB.get(row.key)!.page}` : "—"}</small></TableCell>}<TableCell>{session.replies[row.key]?.disp || "未填"}<small>{session.replies[row.key]?.owner || "未指派"}</small></TableCell><TableCell><Button variant="outline" size="sm" aria-label={`檢視 ${row.key}`} onClick={() => inspect(row)}>檢視</Button></TableCell></TableRow>)}{!rows.length && <TableRow><TableCell colSpan={review ? 9 : 8} className="comparison-empty-result">{emptyText}</TableCell></TableRow>}</TableBody></Table>}
    <footer className="comparison-results-footer"><span>每頁 50 筆 · 第 {currentPage + 1} / {pageCount} 頁</span><div><Button variant="ghost" size="icon" aria-label="上一頁結果" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft /></Button><Button variant="ghost" size="icon" aria-label="下一頁結果" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight /></Button></div></footer>
    </div>
    {review && !!session.history.length && <details className="comparison-history"><summary>全部修改紀錄（最近 200 筆）</summary>{session.history.slice(-200).reverse().map((change, index) => <p key={`${change.at}-${index}`}><time>{new Date(change.at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</time> · #{rowNumbers.get(change.key) ?? "舊項目"} · {fieldLabels[change.field]}：{change.old || "空白"} → {change.value || "空白"}</p>)}</details>}
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open && !saving) setSelected(null); }}><DialogContent className="comparison-detail-dialog"><DialogHeader><DialogTitle>{selected?.title}</DialogTitle><DialogDescription>#{selected ? rowNumbers.get(selected.key) : ""} · {selected?.key} · {selected?.page ? `第 ${selected.page} 頁 ${selected.page_title}` : "未取得頁碼"}{selected && parentLabel(selected) && ` · ${parentLabel(selected)}`}{selected && childrenLabel(selected) && ` · ${childrenLabel(selected)}`}</DialogDescription></DialogHeader>{selected && <><div className="comparison-detail-tags"><Badge className={`comparison-severity is-${selected.severity.toLowerCase()}`}>{selected.severity}</Badge><Badge variant="secondary">{statusLabels[selected.status] ?? selected.status}</Badge>{pdfUrl && <Button asChild variant="outline" size="sm"><a href={`${pdfUrl}#nameddest=${encodeURIComponent(selected.dest)}`} target="_blank" rel="noopener noreferrer"><ExternalLink />看圖</a></Button>}</div><dl className="comparison-detail-meta"><div><dt>RefDes</dt><dd>{selected.refdes.join(", ") || "—"}</dd></div><div><dt>Net</dt><dd>{selected.nets.join(", ") || "—"}</dd></div><div><dt>Pin</dt><dd>{selected.pins.join(", ") || "—"}</dd></div></dl><p className="comparison-detail-text">{selected.detail}</p><div className="comparison-review-form"><h3><ClipboardCheck />審查回覆</h3><div className="comparison-review-fields"><div><Label htmlFor="compare-disp">處置</Label><Select value={draft.disp || "blank"} disabled={!canEdit || saving} onValueChange={value => { setDraft(current => ({ ...current, disp: value === "blank" ? "" : value })); setSaved(""); }}><SelectTrigger id="compare-disp"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="blank">未填</SelectItem>{dispositions.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="compare-owner">負責人</Label><Input id="compare-owner" value={draft.owner} maxLength={120} disabled={!canEdit || saving} onChange={event => { setDraft(current => ({ ...current, owner: event.target.value })); setSaved(""); }} /></div><div><Label htmlFor="compare-target">預計版次</Label><Input id="compare-target" value={draft.target_rev} maxLength={120} disabled={!canEdit || saving} onChange={event => { setDraft(current => ({ ...current, target_rev: event.target.value })); setSaved(""); }} /></div></div><Label htmlFor="compare-note">備註</Label><Textarea id="compare-note" value={draft.note} maxLength={10000} disabled={!canEdit || saving} onChange={event => { setDraft(current => ({ ...current, note: event.target.value })); setSaved(""); }} /><div className="comparison-review-save"><span role="status">{saved || (canEdit ? "編輯後儲存回覆；原始檢查內容會保留" : "目前為唯讀權限")}</span><Button disabled={!canEdit || saving || busy} onClick={() => void save()}>{saving ? "儲存中…" : "儲存回覆"}</Button></div>{dialogError && <p role="alert" className="comparison-alert">{dialogError}</p>}</div>{!!session.history.filter(change => change.key === selected.key).length && <details className="comparison-history"><summary>這筆的修改紀錄</summary>{session.history.filter(change => change.key === selected.key).slice().reverse().slice(0, 20).map((change, index) => <p key={`${change.at}-${index}`}><time>{change.at}</time> {fieldLabels[change.field]}：{change.old || "空白"} → {change.value || "空白"}</p>)}</details>}</>}</DialogContent></Dialog>
  </section>;
}
