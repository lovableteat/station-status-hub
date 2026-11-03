import { useMemo, useState } from "react";
import { CalendarDays, Download, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { MaterialWorkbookRecord } from "./materialRequestUtils";
import { MATERIAL_TRACKING_STATUS_OPTIONS, materialTrackingStatusTone } from "./materialTrackingStatus";
import { buildMaterialWeeklyProgress, filterMaterialWeeklyProgress, getMaterialProgressWeeks, materialProgressTimestamp, NO_WEEKLY_HISTORY, summarizeMaterialWeeklyProgress, taipeiProgressDate } from "./materialWeeklyProgress";
import { exportMaterialWeeklyExcel } from "./materialWeeklyProgressExport";

const PAGE_SIZE = 50;

export function MaterialWeeklyProgressDialog({ records, workspaceName, exportedBy, open, ready, onOpenChange }: {
  records: MaterialWorkbookRecord[];
  workspaceName: string;
  exportedBy: string;
  open: boolean;
  ready: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [asOf, setAsOf] = useState(Date.now);
  const [endDate, setEndDate] = useState(() => taipeiProgressDate(Date.now()));
  const [weekCount, setWeekCount] = useState(6);
  const [view, setView] = useState<"parts" | "summary" | "simple">("parts");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [owner, setOwner] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const weeks = useMemo(() => getMaterialProgressWeeks(endDate, weekCount, asOf), [endDate, weekCount, asOf]);
  const rows = useMemo(() => ready ? buildMaterialWeeklyProgress(records, weeks, asOf) : [], [records, weeks, asOf, ready]);
  const filtered = useMemo(() => filterMaterialWeeklyProgress(rows, query, status, owner), [rows, query, status, owner]);
  const summary = useMemo(() => summarizeMaterialWeeklyProgress(filtered, weeks, view === "simple"), [filtered, weeks, view]);
  const statuses = useMemo(() => {
    const present = new Set(rows.map(row => row.currentStatus));
    const known = new Set<string>(MATERIAL_TRACKING_STATUS_OPTIONS);
    return [...MATERIAL_TRACKING_STATUS_OPTIONS.filter(value => present.has(value)), ...Array.from(present).filter(value => !known.has(value)).sort((a, b) => a.localeCompare(b, "zh-TW"))];
  }, [rows]);
  const owners = useMemo(() => Array.from(new Set(rows.map(row => row.record.requestOwnerName?.trim() || "未指定"))).sort((a, b) => a.localeCompare(b, "zh-TW")), [rows]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const indexes = weeks.map((_, index) => index).reverse();
  const hasFilters = Boolean(query.trim() || status || owner);
  const filterChips: Array<{ value: string; label: string; clear: () => void }> = [
    { value: query.trim(), label: "搜尋", clear: () => changeFilter(setQuery, "") },
    { value: status, label: "目前狀態", clear: () => changeFilter(setStatus, "") },
    { value: owner, label: "負責人", clear: () => changeFilter(setOwner, "") },
  ];
  const scope = ["目前 BOM 申請追蹤料（含已完成，與待處理料清單同範圍）", query.trim() && `搜尋：${query.trim()}`, status && `目前狀態：${status}`, owner && `負責人：${owner}`].filter(Boolean).join(" · ");
  const undated = rows.filter(row => row.undatedCount > 0).length;
  const exportReport = async () => {
    if (exporting || !ready || !weeks.length || !filtered.length) return;
    setExporting(true); setError("");
    try { await exportMaterialWeeklyExcel({ rows: filtered, weeks, workspaceName, exportedBy, asOf, scope }); }
    catch { setError("匯出失敗，請重試。料件與追蹤紀錄未被更動。"); }
    finally { setExporting(false); }
  };
  const changeFilter = (setValue: (value: string) => void, value: string) => { setValue(value); setPage(1); };
  const renderStatus = (value: string) => value === NO_WEEKLY_HISTORY
    ? <span className="text-muted-foreground">無追蹤紀錄</span>
    : <span className={`material-weekly-status ${materialTrackingStatusTone(value)}`}>{value}</span>;

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="material-weekly-dialog flex flex-col overflow-hidden" data-testid="material-weekly-dialog">
      <DialogHeader className="pr-11">
        <DialogTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" />每週申請進度</DialogTitle>
        <DialogDescription className="break-words">{workspaceName} · {ready ? `${records.length.toLocaleString()} 筆申請追蹤料（含已完成紀錄）` : "正在載入申請追蹤料…"}</DialogDescription>
      </DialogHeader>
      <div className="material-weekly-tools">
        <label className="material-weekly-control">截至週別<Input type="date" aria-label="截至週別" value={endDate} max={taipeiProgressDate(asOf)} onChange={event => { setEndDate(event.target.value); setPage(1); }} className="h-10 w-40" /></label>
        <label className="material-weekly-control">顯示<select aria-label="顯示週數" value={weekCount} onChange={event => setWeekCount(Number(event.target.value))}><option value={4}>4 週</option><option value={6}>6 週</option><option value={12}>12 週</option></select></label>
        <Button variant="outline" className="h-10" onClick={() => { const now = Date.now(); setAsOf(now); setEndDate(taipeiProgressDate(now)); setPage(1); }}>回到本週</Button>
        <Button data-testid="material-weekly-export" className="h-10 sm:ml-auto" disabled={exporting || !ready || !filtered.length || !weeks.length} onClick={() => void exportReport()}><Download className="h-4 w-4" />{exporting ? "匯出中…" : `匯出 Excel（${filtered.length.toLocaleString()}）`}</Button>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">週一至週日・台北時間・由新到舊。每週取最後一筆有效追蹤，無更新則延續前週。{undated > 0 && ` ${undated.toLocaleString()} 筆料含無日期資料，僅列目前狀態，不回填舊週。`}</p>
      <div className="flex flex-wrap gap-1 border-b border-border" role="group" aria-label="週報檢視">
        {([ ["parts", "各料進度"], ["summary", "每週彙總"], ["simple", "五狀態彙總"] ] as const).map(([value, label]) => <Button key={value} variant="ghost" aria-pressed={view === value} className={`h-9 rounded-b-none border-b-2 px-4 ${view === value ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`} onClick={() => setView(value)}>{label}</Button>)}
      </div>
      {view === "simple" && <p className="text-xs leading-5 text-muted-foreground">其他狀態統一計入「料號申請中」；無有效追蹤紀錄不計入該週，原始狀態不變。</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="material-weekly-results flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
        <div className="material-weekly-filters">
          <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="搜尋週報" placeholder="搜尋位號、料名、MPN、廠商或料號" className="h-10 pl-9" value={query} onChange={event => changeFilter(setQuery, event.target.value)} /></div>
          <select aria-label="目前狀態" value={status} onChange={event => changeFilter(setStatus, event.target.value)}><option value="">全部狀態</option>{statuses.map(value => <option key={value}>{value}</option>)}</select>
          <select aria-label="負責人" value={owner} onChange={event => changeFilter(setOwner, event.target.value)}><option value="">全部負責人</option>{owners.map(value => <option key={value}>{value}</option>)}</select>
          {hasFilters && <div className="flex basis-full flex-wrap items-center gap-2 text-xs">
            {filterChips.filter(chip => chip.value).map(chip => <button key={chip.label} className="inline-flex min-h-8 max-w-full items-center gap-2 rounded-md border border-primary/40 px-2 text-primary" aria-label={`清除${chip.label}篩選`} onClick={chip.clear}><span className="truncate">{chip.label}：{chip.value}</span><X className="h-3 w-3 shrink-0" /></button>)}
            <button className="min-h-8 px-2 text-destructive" onClick={() => { setQuery(""); setStatus(""); setOwner(""); setPage(1); }}>全部清除</button>
          </div>}
        </div>
        <div className="min-h-0 flex-1 overflow-auto" tabIndex={0} role="region" aria-label={view === "parts" ? "每週料件進度表（可左右捲動）" : view === "simple" ? "每週五狀態彙總表（可左右捲動）" : "每週申請彙總表（可左右捲動）"}>
          {view === "parts" ? <table className="material-weekly-table" data-testid="material-weekly-parts">
            <thead><tr><th scope="col" className="material-weekly-part">料件／位號</th><th scope="col">廠商料號／廠商</th><th scope="col">負責人／目前狀態</th>{indexes.map(index => <th key={weeks[index].key} scope="col">{weeks[index].label}{weeks[index].isCurrent && <span className="ml-2 text-primary">本週</span>}<span className="block text-xs font-normal text-muted-foreground">{weeks[index].isCurrent ? `截至 ${new Date(asOf).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false })}` : "週末狀態"}</span></th>)}</tr></thead>
            <tbody>{!ready || !weeks.length || !pageRows.length ? <tr><td colSpan={3 + weeks.length} className="p-8 text-center text-muted-foreground">{!ready ? "正在載入完整 BOM，完成後才會產生週報" : !weeks.length ? "請選擇截至週別" : "目前篩選條件沒有符合的料件"}</td></tr> : pageRows.map(row => <tr key={row.record.id}>
              <th scope="row" className="material-weekly-part"><span className="block break-words font-mono font-semibold">{row.record.refDes || "未設定位號"}</span><span className="mt-1 line-clamp-2 text-xs font-normal text-muted-foreground" title={row.record.name}>{row.record.name}</span></th>
              <td><span className="block select-text break-all font-mono text-sm">{row.record.manufacturerPartNumber || "未填 MPN"}</span><span className="mt-1 block text-xs text-muted-foreground">{row.record.manufacturer || "未填廠商"}</span></td>
              <td><span className="mb-1 block">{row.record.requestOwnerName || "未指定"}</span>{renderStatus(row.currentStatus)}{row.undatedCount > 0 && <small className="mt-1 block text-muted-foreground">含無日期紀錄</small>}</td>
              {indexes.map(index => { const cell = row.cells[index]; const entry = cell.updates.at(-1); return <td key={weeks[index].key} className={cell.updated ? "material-weekly-updated" : ""}>{renderStatus(cell.status)}{cell.updated && <span className="mt-1 block text-xs text-primary">本週 {cell.updates.length} 次更新</span>}{entry && <details className="mt-1 text-xs"><summary className="cursor-pointer text-muted-foreground">查看本週紀錄</summary>{cell.updates.map(update => <div key={update.id} className="mt-2 whitespace-pre-wrap break-words border-l border-primary/40 pl-2"><time>{new Date(materialProgressTimestamp(update.createdAt)!).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false })}</time><p>{update.status} · {update.createdBy || "未提供更新人"}</p>{update.requestInfo && <p>{update.requestInfo}</p>}{update.note && <p>{update.note}</p>}</div>)}</details>}</td>; })}
            </tr>)}</tbody>
          </table> : <table className="material-weekly-table" data-testid={view === "simple" ? "material-weekly-simple-summary" : "material-weekly-summary"}><thead><tr><th scope="col" className="material-weekly-part">{view === "simple" ? "狀態" : "狀態／指標"}</th>{indexes.map(index => <th key={weeks[index].key} scope="col">{weeks[index].label}</th>)}</tr></thead><tbody>
            {!ready || !filtered.length || !weeks.length ? <tr><td colSpan={1 + weeks.length} className="p-8 text-center text-muted-foreground">{!ready ? "正在載入完整 BOM" : !weeks.length ? "請選擇截至週別" : "目前篩選條件沒有符合的料件"}</td></tr> : <>
              {view === "summary" && <><tr><th scope="row" className="material-weekly-part">首次更新料件</th>{indexes.map(index => <td key={index}>{summary[index].startedCount}</td>)}</tr>
              <tr><th scope="row" className="material-weekly-part">本週有更新料件</th>{indexes.map(index => <td key={index}>{summary[index].updatedCount}</td>)}</tr></>}
              {Object.keys(summary[0].counts).map(value => <tr key={value}><th scope="row" className="material-weekly-part">{renderStatus(value)}</th>{indexes.map(index => <td key={index}>{summary[index].counts[value]}</td>)}</tr>)}
              {view === "summary" && <tr><th scope="row" className="material-weekly-part">全部申請追蹤料</th>{indexes.map(index => <td key={index}>{filtered.length}</td>)}</tr>}
            </>}
          </tbody></table>}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span role="status">{ready ? `符合 ${filtered.length.toLocaleString()}／${rows.length.toLocaleString()} 筆；匯出包含全部符合料件及週內更新明細` : "載入中"}</span>
        {view === "parts" && <div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>上一頁</Button><span>第 {currentPage}／{pageCount} 頁</span><Button size="sm" variant="outline" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>下一頁</Button></div>}
      </div>
    </DialogContent>
  </Dialog>;
}
