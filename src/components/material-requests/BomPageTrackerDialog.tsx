import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Flag, Search, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BomPagePdfAiDialog } from "./BomPagePdfAiDialog";
import { applyPdfPageTitles } from "./bomPagePdfAi";
import {
  BOM_PAGE_STATUSES, BOM_PAGE_STATUS_LABELS, MAX_BOM_TRACKER_PAGES, clampBomTrackerPageCount, countBomPageTrackerChanges, draftFromBomPageTracker,
  extendBomTrackerPages, filterBomTrackerPages, mergeBomPageTracker, syncBomTrackerPages, type BomPageStatusFilter, type BomPageTrackerDraft,
} from "./bomPageTracker";
import type { BomPageTracker, BomPageTrackerPage, BomPageTrackerStatus, BomWorkspace } from "./materialBomStorage";
import "./bomPageTracker.css";

const EMPTY_DRAFT: BomPageTrackerDraft = { totalPages: 0, currentPage: 0, pages: [] };
const NO_FILTERS = { query: "", status: "all" as BomPageStatusFilter, powerOnly: false };
const savedTime = (value?: string) => value ? new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "";
const statusCode = (status: BomPageTrackerStatus) => status === "done" ? "d" : status === "done_missing" ? "m" : "p";
const statusOfCode = (code: string): BomPageTrackerStatus => code === "d" ? "done" : code === "m" ? "done_missing" : "pending";

/**
 * 頁數進度. Changes stay a draft until 儲存頁數進度 is pressed: closing with unsaved changes asks first, a colleague's
 * save or record edit never resets the draft, and saving rebases the draft onto what is stored at that moment.
 */
export function BomPageTrackerDialog({ workspace, open, onOpenChange, onSave, loadLatest, readOnly = false }: {
  workspace: BomWorkspace | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (workspaceId: string, pageTracker: BomPageTracker) => Promise<void>;
  /** The document as stored right now, read just before saving. */
  loadLatest: (workspaceId: string) => Promise<BomPageTracker | undefined>;
  readOnly?: boolean;
}) {
  const [totalPagesInput, setTotalPagesInput] = useState("0");
  const [currentPageInput, setCurrentPageInput] = useState("0");
  const [rangeStartInput, setRangeStartInput] = useState("1");
  const [rangeEndInput, setRangeEndInput] = useState("1");
  const [pages, setPages] = useState<BomPageTrackerPage[]>([]);
  const [filters, setFilters] = useState(NO_FILTERS);
  const [flashPage, setFlashPage] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [notice, setNotice] = useState("");
  const [pdfAiOpen, setPdfAiOpen] = useState(false);
  // Only a phone layout hides the page map and batch tool behind this toggle; wider layouts always show them (see the stylesheet).
  const [toolsOpen, setToolsOpen] = useState(false);
  const [baselineVersion, setBaselineVersion] = useState(0);
  const baseline = useRef<BomPageTrackerDraft>(EMPTY_DRAFT);
  const saving = useRef(false);
  const table = useRef<HTMLDivElement>(null);

  const totalPages = clampBomTrackerPageCount(Number(totalPagesInput || 0));
  const currentPage = totalPages > 0 ? Math.min(totalPages, clampBomTrackerPageCount(Number(currentPageInput || 0))) : 0;
  const draft = useMemo<BomPageTrackerDraft>(() => ({ totalPages, currentPage, pages }), [totalPages, currentPage, pages]);
  const draftRef = useRef(draft); draftRef.current = draft;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the baseline lives in a ref; its version marks when it moved
  const changes = useMemo(() => countBomPageTrackerChanges(baseline.current, draft), [draft, baselineVersion]);
  const dirty = !readOnly && (changes.pages > 0 || changes.settings);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;

  const applyDraft = (next: BomPageTrackerDraft) => {
    setTotalPagesInput(String(next.totalPages)); setCurrentPageInput(String(next.currentPage)); setPages(next.pages);
  };
  // Opening (or switching board) starts from what is saved. The workspace object itself changes whenever anyone edits a
  // material record, so it must not be what resets the form.
  useEffect(() => {
    setPdfAiOpen(false); setConfirmClose(false); setNotice(""); setIsSaving(false); saving.current = false; setToolsOpen(false);
    if (!open || !workspace) return;
    const next = draftFromBomPageTracker(workspace.pageTracker);
    baseline.current = next; setBaselineVersion(version => version + 1);
    applyDraft(next); setFilters(NO_FILTERS);
    const first = next.currentPage > 0 ? next.currentPage : next.totalPages > 0 ? 1 : 0;
    setRangeStartInput(String(first)); setRangeEndInput(String(first));
    // Continue where the work stopped: the page that was reached is brought into view.
    setFlashPage(next.currentPage > 1 ? next.currentPage : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the board, not on the workspace object
  }, [open, workspace?.id]);
  // A colleague saved page progress while this is open: their pages come in, the pages edited here stay as edited.
  useEffect(() => {
    // While our own save is on its way the page shows it optimistically; that is not a colleague's change, and taking it
    // as the new baseline would make a failed save look as if nothing had been edited.
    if (!open || !workspace || saving.current) return;
    const latest = draftFromBomPageTracker(workspace.pageTracker);
    const moved = countBomPageTrackerChanges(baseline.current, latest);
    if (!moved.pages && !moved.settings) return;
    const merged = mergeBomPageTracker(baseline.current, draftRef.current, latest);
    baseline.current = latest; setBaselineVersion(version => version + 1);
    applyDraft(merged);
    setNotice(dirtyRef.current ? "其他人剛儲存了頁數進度：你改過的頁面維持你的內容，其餘已更新。" : "已帶入其他人剛儲存的頁數進度。");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a change of the stored document matters here
  }, [workspace?.pageTracker]);

  const filtered = useMemo(() => filterBomTrackerPages(pages, totalPages, filters), [pages, totalPages, filters]);
  const shown = filtered.length;
  useEffect(() => {
    if (!flashPage) return;
    table.current?.querySelector(`[data-page="${flashPage}"]`)?.scrollIntoView({ block: "center" });
    const timer = setTimeout(() => setFlashPage(0), 1600);
    return () => clearTimeout(timer);
  }, [flashPage]);

  const { counts, statusCodes, powerCount } = useMemo(() => {
    const counts: Record<BomPageTrackerStatus, number> = { done: 0, pending: 0, done_missing: 0 };
    let statusCodes = "";
    let powerCount = 0;
    for (const page of pages) {
      if (page.pageNumber > totalPages) continue;
      counts[page.status] += 1;
      if (page.power) powerCount += 1;
      const code = statusCode(page.status);
      statusCodes += page.power ? code.toUpperCase() : code;
    }
    return { counts, statusCodes, powerCount };
  }, [pages, totalPages]);
  const completed = counts.done + counts.done_missing;
  const completionRate = totalPages > 0 ? Math.round((completed / totalPages) * 100) : 0;
  const rawStart = clampBomTrackerPageCount(Number(rangeStartInput || 0)), rawEnd = clampBomTrackerPageCount(Number(rangeEndInput || 0));
  const rangeReady = totalPages > 0 && rawStart > 0 && rawEnd > 0;
  const rangeStart = rangeReady ? Math.min(totalPages, Math.min(rawStart, rawEnd)) : 0;
  const rangeEnd = rangeReady ? Math.min(totalPages, Math.max(rawStart, rawEnd)) : 0;
  const rangeCount = rangeReady ? rangeEnd - rangeStart + 1 : 0;

  const changeTotal = (value: string) => {
    setTotalPagesInput(value);
    setPages(current => extendBomTrackerPages(current, clampBomTrackerPageCount(Number(value || 0))));
  };
  // The page that work has reached only moves forward, and only when something was actually recorded on a later page.
  const reach = useCallback((pageNumber: number) => {
    setCurrentPageInput(current => pageNumber > clampBomTrackerPageCount(Number(current || 0)) ? String(pageNumber) : current);
  }, []);
  const setStatus = useCallback((page: BomPageTrackerPage, status: BomPageTrackerStatus) => {
    if (page.status === status) return;
    setPages(current => current.map(row => row.pageNumber === page.pageNumber ? { ...row, status } : row));
    if (status !== "pending") reach(page.pageNumber);
  }, [reach]);
  const setField = useCallback((pageNumber: number, field: "title" | "note", value: string) => {
    setPages(current => current.map(row => row.pageNumber === pageNumber ? { ...row, [field]: value } : row));
    if (field === "note" && value.trim()) reach(pageNumber);
  }, [reach]);
  const setCurrent = useCallback((pageNumber: number) => setCurrentPageInput(String(pageNumber)), []);
  const togglePower = useCallback((pageNumber: number) => {
    setPages(current => current.map(row => row.pageNumber === pageNumber ? { ...row, power: !row.power } : row));
  }, []);
  const applyRangeStatus = (status: BomPageTrackerStatus) => {
    if (!rangeCount) return;
    setPages(current => current.map(row => row.pageNumber >= rangeStart && row.pageNumber <= rangeEnd && row.status !== status ? { ...row, status } : row));
    if (status !== "pending") reach(rangeEnd);
  };
  const jumpTo = (pageNumber: number) => {
    if (pageNumber < 1) return;
    if (!filtered.some(page => page.pageNumber === pageNumber)) setFilters(NO_FILTERS);
    setFlashPage(pageNumber);
  };
  // A click picks one page and shows its row; Shift+click extends the range from the page picked before.
  const pickPage = (pageNumber: number, extend: boolean) => {
    if (extend && rangeReady) { setRangeEndInput(String(pageNumber)); return; }
    setRangeStartInput(String(pageNumber)); setRangeEndInput(String(pageNumber)); jumpTo(pageNumber);
  };
  // The map is memoised on the page statuses; a callback that changed with every keystroke would defeat that.
  const pick = useRef(pickPage); pick.current = pickPage;
  const onPick = useCallback((pageNumber: number, extend: boolean) => pick.current(pageNumber, extend), []);
  // Enter and the vertical arrows move down or up the same column, the way a sheet does.
  const moveFocus = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    const field = (event.target as HTMLElement).getAttribute?.("data-field");
    if (!field || !["Enter", "ArrowDown", "ArrowUp"].includes(event.key) || event.nativeEvent.isComposing) return;
    const row = (event.target as HTMLElement).closest("tr");
    const next = event.key === "ArrowUp" ? row?.previousElementSibling : row?.nextElementSibling;
    const target = next?.querySelector<HTMLInputElement>(`[data-field="${field}"]`);
    if (target) { event.preventDefault(); target.focus(); target.select(); }
  };

  const leave = () => { setConfirmClose(false); onOpenChange(false); };
  const requestClose = () => { if (dirty && !isSaving) setConfirmClose(true); else if (!isSaving) leave(); };
  const handleSave = async () => {
    if (!workspace || readOnly || isSaving) return;
    setIsSaving(true); saving.current = true; setNotice("");
    try {
      let stored: BomPageTracker | undefined;
      try { stored = await loadLatest(workspace.id); }
      catch { setNotice("讀不到最新的頁數進度，所以還沒有儲存；你的修改都還在，請再按一次儲存。"); setConfirmClose(false); return; }
      // Rebase onto what is stored right now, so pages a colleague saved while this was open are not undone.
      const merged = mergeBomPageTracker(baseline.current, draftRef.current, draftFromBomPageTracker(stored));
      await onSave(workspace.id, { totalPages: merged.totalPages, currentPage: merged.currentPage, pages: syncBomTrackerPages(merged.pages, merged.totalPages), updatedAt: new Date().toISOString() });
      leave();
    } catch {
      // The page already showed why saving failed; the draft stays so nothing has to be entered again.
      setConfirmClose(false);
    } finally { setIsSaving(false); saving.current = false; }
  };

  if (!workspace) return null;
  const dialogDescription = `${workspace.name} · ${workspace.payload.sheetName} · ${workspace.payload.recordCount.toLocaleString()} 筆料件`;
  const activeChips = [
    ...(filters.query ? [{ key: "query" as const, label: `搜尋：${filters.query}`, reset: "" }] : []),
    ...(filters.status !== "all" ? [{ key: "status" as const, label: `狀態：${BOM_PAGE_STATUS_LABELS[filters.status]}`, reset: "all" }] : []),
    ...(filters.powerOnly ? [{ key: "powerOnly" as const, label: "只看 POWER", reset: false }] : []),
  ];
  const changeLabel = [changes.pages ? `${changes.pages} 頁` : "", changes.settings ? "頁數設定" : ""].filter(Boolean).join("與");
  const statusText = readOnly ? "檢視權限：可以查看，不能修改" : dirty ? `有尚未儲存的修改（${changeLabel}）` : workspace.pageTracker ? `已儲存 · ${savedTime(workspace.pageTracker.updatedAt)}` : "尚未設定頁數";

  return (
    <Dialog open={open} onOpenChange={next => { if (next) onOpenChange(true); else requestClose(); }}>
      <DialogContent data-testid="bom-page-tracker" className="bom-page-tracker flex flex-col overflow-hidden">
        <DialogHeader className="bom-tracker-header">
          <DialogTitle className="text-xl">頁數進度</DialogTitle>
          <DialogDescription className="truncate" title={dialogDescription}>{dialogDescription}</DialogDescription>
        </DialogHeader>

        <div className="bom-tracker-controls" data-tools-open={toolsOpen}>
          <section className="bom-tracker-overview workspace-dialog-section">
            <div className="bom-tracker-number">
              <Label htmlFor="bom-total-pages">總頁數</Label>
              <Input id="bom-total-pages" type="number" min={0} max={MAX_BOM_TRACKER_PAGES} step={1} value={totalPagesInput} disabled={readOnly} autoFocus={totalPages === 0}
                onChange={event => changeTotal(event.target.value)} placeholder="例如 56" title={`可填 0 到 ${MAX_BOM_TRACKER_PAGES} 頁；頁數調小時，後面頁面的內容會先保留`} />
            </div>
            <div className="bom-tracker-number">
              <Label htmlFor="bom-current-page">目前做到第幾頁</Label>
              <Input id="bom-current-page" type="number" min={0} max={Math.max(totalPages, 1)} step={1} value={currentPageInput} disabled={readOnly || totalPages === 0}
                onChange={event => setCurrentPageInput(event.target.value)} placeholder={totalPages > 0 ? `1 ~ ${totalPages}` : "先填總頁數"} title="料號申請主畫面的頁數進度會顯示這一頁" />
            </div>
            <Button type="button" variant="outline" className="bom-tracker-jump" disabled={currentPage === 0} onClick={() => jumpTo(currentPage)}>跳到目前頁</Button>
            <div className="bom-tracker-progress" data-testid="bom-page-tracker-progress">
              <div className="bom-tracker-progress-bar" role="img" aria-label={`已完成 ${counts.done} 頁、已完成但缺料 ${counts.done_missing} 頁、待處理 ${counts.pending} 頁`}>
                <span data-status="done" style={{ width: `${totalPages ? (counts.done / totalPages) * 100 : 0}%` }} />
                <span data-status="done_missing" style={{ width: `${totalPages ? (counts.done_missing / totalPages) * 100 : 0}%` }} />
              </div>
              <p>{totalPages > 0 ? <>已完成 <strong>{completed}</strong> / {totalPages} 頁（{completionRate}%）{counts.done_missing > 0 && <span className="bom-tracker-missing">其中 {counts.done_missing} 頁缺料</span>}</> : "還沒有設定頁數"}</p>
            </div>
            {!readOnly && <Button type="button" variant="outline" className="bom-tracker-pdf" disabled={isSaving} title="從線路圖 PDF 讀出頁數與每頁標題" onClick={() => setPdfAiOpen(true)}>PDF AI</Button>}
          </section>
          {totalPages > 0 && <button type="button" className="bom-tracker-tools-toggle" aria-expanded={toolsOpen} onClick={() => setToolsOpen(value => !value)}>{readOnly ? "頁面總覽" : "頁面總覽與批次設定"}<ChevronDown aria-hidden="true" /></button>}
          {totalPages > 0 && !readOnly && <div data-testid="bom-page-tracker-batch" className="bom-tracker-batch">
              <span className="bom-tracker-batch-label">批次設定</span>
              <Label htmlFor="bom-range-start">第</Label>
              <Input id="bom-range-start" type="number" min={1} max={Math.max(totalPages, 1)} step={1} value={rangeStartInput} onChange={event => setRangeStartInput(event.target.value)} aria-label="起始頁" />
              <Label htmlFor="bom-range-end">~</Label>
              <Input id="bom-range-end" type="number" min={1} max={Math.max(totalPages, 1)} step={1} value={rangeEndInput} onChange={event => setRangeEndInput(event.target.value)} aria-label="結束頁" />
              <span>頁設為</span>
              <div className="bom-tracker-status" role="group" aria-label="批次設定狀態">
                {BOM_PAGE_STATUSES.map(status => <button key={status} type="button" data-status={status} disabled={rangeCount === 0} onClick={() => applyRangeStatus(status)}>{BOM_PAGE_STATUS_LABELS[status]}</button>)}
              </div>
              <span className="bom-tracker-batch-hint">{rangeCount > 0 ? `共 ${rangeCount} 頁，標題與備註會保留` : "先填起訖頁"}</span>
            </div>}
          {totalPages > 0 && <section className="bom-tracker-map" aria-label="頁面總覽">
            <header>
              <h3>頁面總覽</h3>
              <p>{readOnly ? "點頁碼可跳到那一頁。" : <><span className="bom-tracker-wide-copy">點頁碼跳到那一頁；按住 Shift 再點另一頁，可選一段範圍一次設定。</span><span className="bom-tracker-compact-copy">點頁碼跳到那一頁；一次設定多頁請填上方起訖頁。</span></>}</p>
              <ul aria-hidden="true">{BOM_PAGE_STATUSES.map(status => <li key={status} data-status={status}>{BOM_PAGE_STATUS_LABELS[status]}</li>)}{powerCount > 0 && <li className="bom-tracker-power-legend"><Zap />POWER</li>}</ul>
            </header>
            <PageMap codes={statusCodes} currentPage={currentPage} rangeStart={readOnly ? 0 : rangeStart} rangeEnd={readOnly ? 0 : rangeEnd} onPick={onPick} />
          </section>}
        </div>

        {notice && <p className="bom-tracker-notice" role="status">{notice}<button type="button" aria-label="關閉提示" onClick={() => setNotice("")}><X aria-hidden="true" /></button></p>}

        {totalPages === 0 ? (
          <p className="bom-tracker-empty">{readOnly ? "這份 BOM 還沒有設定頁數進度。" : "先在上面填「總頁數」，下面就會列出每一頁；也可以按「PDF AI」，從線路圖 PDF 讀出頁數與每頁標題。"}</p>
        ) : (
          <>
            <div className="bom-tracker-filter" role="group" aria-label="頁面篩選">
              <label className="bom-tracker-search"><Search aria-hidden="true" /><Input aria-label="搜尋頁面" placeholder="搜尋頁碼、標題或備註" value={filters.query} onChange={event => setFilters(current => ({ ...current, query: event.target.value }))} /></label>
              <div className="bom-tracker-filter-options">
                <div className="bom-tracker-status-filter" role="group" aria-label="篩選狀態">
                  <button type="button" data-status="all" aria-pressed={filters.status === "all"} onClick={() => setFilters(current => ({ ...current, status: "all" }))}>全部 <span>{totalPages}</span></button>
                  {(["pending", "done", "done_missing"] as const).map(status => <button key={status} type="button" data-status={status} aria-pressed={filters.status === status} onClick={() => setFilters(current => ({ ...current, status }))}>{BOM_PAGE_STATUS_LABELS[status]} <span>{counts[status]}</span></button>)}
                </div>
                <button type="button" className="bom-tracker-power-filter" aria-label="只看 POWER" aria-pressed={filters.powerOnly} onClick={() => setFilters(current => ({ ...current, powerOnly: !current.powerOnly }))}><Zap aria-hidden="true" />POWER <span>{powerCount}</span></button>
              </div>
              <span className="bom-tracker-count">{shown} / {totalPages} 頁</span>
            </div>
            {activeChips.length > 0 && <div className="bom-tracker-chips" data-testid="bom-page-tracker-filters">
              {activeChips.map(chip => <button type="button" key={chip.key} data-status={chip.key === "status" ? filters.status : undefined} aria-label={`移除篩選：${chip.label}`} onClick={() => setFilters(current => ({ ...current, [chip.key]: chip.reset }))}>{chip.label}<X aria-hidden="true" /></button>)}
              <Button type="button" variant="ghost" onClick={() => setFilters(NO_FILTERS)}>全部清除</Button>
            </div>}
            <div className="bom-tracker-table-scroll" ref={table} data-testid="bom-page-tracker-scroll">
              <table className="bom-tracker-table" data-testid="bom-page-tracker-table" aria-label="逐頁進度表">
                <colgroup><col className="bom-tracker-page-col" /><col className="bom-tracker-status-col" /><col /><col /></colgroup>
                <thead><tr><th scope="col">頁碼</th><th scope="col">狀態</th><th scope="col">頁面標題</th><th scope="col">備註</th></tr></thead>
                <tbody onKeyDown={moveFocus}>
                  {filtered.map(page => <PageRow key={page.pageNumber} page={page} current={page.pageNumber === currentPage} flash={page.pageNumber === flashPage} readOnly={readOnly} onStatus={setStatus} onField={setField} onCurrent={setCurrent} onTogglePower={togglePower} />)}
                  {shown === 0 && <tr className="bom-tracker-no-match"><td colSpan={4}>目前篩選條件沒有符合的頁面</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        <footer className="bom-tracker-footer">
          <span className="bom-tracker-save-state" role="status" data-dirty={dirty}>{statusText}</span>
          {confirmClose ? <div className="bom-tracker-confirm" role="alertdialog" aria-label="還有未儲存的修改">
            <span>要儲存這些修改嗎？</span>
            <Button type="button" variant="ghost" disabled={isSaving} onClick={leave}>不儲存，直接關閉</Button>
            <Button type="button" variant="outline" disabled={isSaving} onClick={() => setConfirmClose(false)}>繼續編輯</Button>
            <Button type="button" disabled={isSaving} onClick={() => void handleSave()}>{isSaving ? "儲存中..." : "儲存並關閉"}</Button>
          </div> : <div>
            <Button type="button" variant="outline" onClick={requestClose} disabled={isSaving}>關閉</Button>
            {!readOnly && <Button type="button" onClick={() => void handleSave()} disabled={isSaving || !dirty} title={dirty ? undefined : "沒有需要儲存的修改"}>{isSaving ? "儲存中..." : "儲存頁數進度"}</Button>}
          </div>}
        </footer>
        {!readOnly && <BomPagePdfAiDialog key={workspace.id} open={open && pdfAiOpen} onOpenChange={setPdfAiOpen} maxPages={MAX_BOM_TRACKER_PAGES} onApply={titles => {
          const nextTotal = Math.max(totalPages, titles.length);
          setTotalPagesInput(String(nextTotal));
          setCurrentPageInput(current => String(Math.min(nextTotal, clampBomTrackerPageCount(Number(current || 0)))));
          setRangeStartInput(current => String(Math.min(nextTotal, Math.max(1, clampBomTrackerPageCount(Number(current || 0))))));
          setRangeEndInput(current => String(Math.min(nextTotal, Math.max(1, clampBomTrackerPageCount(Number(current || 0))))));
          setPages(current => extendBomTrackerPages(applyPdfPageTitles(current, titles), nextTotal));
        }} />}
      </DialogContent>
    </Dialog>
  );
}

/** A numbered cell per page. Uppercase status codes carry the independent POWER marker. */
const PageMap = memo(function PageMap({ codes, currentPage, rangeStart, rangeEnd, onPick }: {
  codes: string; currentPage: number; rangeStart: number; rangeEnd: number; onPick: (pageNumber: number, extend: boolean) => void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const [block, setBlock] = useState(0);
  const focusPage = useRef(0);
  const lastBlock = Math.max(0, Math.ceil(codes.length / 50) - 1);
  const activeBlock = Math.min(block, lastBlock);
  const start = activeBlock * 50, end = Math.min(start + 50, codes.length);
  useEffect(() => { setBlock(Math.floor(Math.max(0, currentPage - 1) / 50)); }, [currentPage]);
  useEffect(() => {
    if (grid.current) grid.current.scrollTop = 0;
    if (!focusPage.current) return;
    grid.current?.querySelector<HTMLButtonElement>(`[data-map-page="${focusPage.current}"]`)?.focus();
    focusPage.current = 0;
  }, [activeBlock]);
  const anchor = rangeStart || currentPage || 1;
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = Number((event.target as HTMLElement).getAttribute?.("data-map-page"));
    const to = event.key === "ArrowRight" ? from + 1 : event.key === "ArrowLeft" ? from - 1 : event.key === "Home" ? 1 : event.key === "End" ? codes.length : 0;
    if (!from || to < 1 || to > codes.length) return;
    event.preventDefault();
    if (to <= start || to > end) { focusPage.current = to; setBlock(Math.floor((to - 1) / 50)); return; }
    grid.current?.querySelector<HTMLButtonElement>(`[data-map-page="${to}"]`)?.focus();
  };
  return <div className="bom-tracker-map-window">
    {lastBlock > 0 && <div className="bom-tracker-map-navigation">
      <span>每段 50 頁 · 共 {codes.length} 頁</span>
      <div>
        <button type="button" aria-label="上一段頁碼" disabled={activeBlock === 0} onClick={() => setBlock(activeBlock - 1)}><ChevronLeft aria-hidden="true" /></button>
        <select aria-label="選擇頁碼範圍" value={activeBlock} onChange={event => setBlock(Number(event.target.value))}>
          {Array.from({ length: lastBlock + 1 }, (_, index) => <option key={index} value={index}>第 {index * 50 + 1}–{Math.min((index + 1) * 50, codes.length)} 頁</option>)}
        </select>
        <button type="button" aria-label="下一段頁碼" disabled={activeBlock === lastBlock} onClick={() => setBlock(activeBlock + 1)}><ChevronRight aria-hidden="true" /></button>
      </div>
    </div>}
    <div ref={grid} className="bom-tracker-map-grid" role="group" aria-label="各頁狀態" onKeyDown={keys}>
    {Array.from(codes.slice(start, end), (code, index) => {
      const pageNumber = start + index + 1, status = statusOfCode(code.toLowerCase());
      const selected = pageNumber >= rangeStart && pageNumber <= rangeEnd;
      const power = code !== code.toLowerCase();
      return <button key={pageNumber} type="button" data-map-page={pageNumber} data-status={status} data-current={pageNumber === currentPage} aria-pressed={selected} tabIndex={pageNumber === (anchor > start && anchor <= end ? anchor : start + 1) ? 0 : -1}
        aria-label={`第 ${pageNumber} 頁，${BOM_PAGE_STATUS_LABELS[status]}${pageNumber === currentPage ? "，目前頁" : ""}${power ? "，POWER" : ""}`} title={`第 ${pageNumber} 頁 · ${BOM_PAGE_STATUS_LABELS[status]}${power ? " · POWER" : ""}`}
        onClick={(event: MouseEvent) => onPick(pageNumber, event.shiftKey)}>{pageNumber}{power && <Zap className="bom-tracker-map-power" aria-hidden="true" />}</button>;
    })}
    </div>
  </div>;
});

const PageRow = memo(function PageRow({ page, current, flash, readOnly, onStatus, onField, onCurrent, onTogglePower }: {
  page: BomPageTrackerPage; current: boolean; flash: boolean; readOnly: boolean;
  onStatus: (page: BomPageTrackerPage, status: BomPageTrackerStatus) => void;
  onField: (pageNumber: number, field: "title" | "note", value: string) => void;
  onCurrent: (pageNumber: number) => void;
  onTogglePower: (pageNumber: number) => void;
}) {
  return (
    <tr data-testid="bom-page-tracker-row" data-page={page.pageNumber} data-status={page.status} data-current={current} data-flash={flash}>
      <th scope="row">
        <div className="bom-tracker-page-cell">
          <span className="bom-tracker-page-number">第 {page.pageNumber} 頁</span>
          {current ? <span className="bom-tracker-current-tag">目前頁</span>
            : !readOnly && <button type="button" className="bom-tracker-set-current" aria-label="設為目前頁" title="設為目前頁：主畫面會顯示做到這一頁" onClick={() => onCurrent(page.pageNumber)}><Flag aria-hidden="true" /></button>}
          {(!readOnly || page.power) && <button type="button" className="bom-tracker-power-mark" aria-label={`第 ${page.pageNumber} 頁 POWER 標記`} aria-pressed={Boolean(page.power)} disabled={readOnly} title="標記需算 POWER 的頁面" onClick={() => onTogglePower(page.pageNumber)}>POWER</button>}
        </div>
      </th>
      <td>
        <div className="bom-tracker-status" role="group" aria-label={`第 ${page.pageNumber} 頁狀態`}>
          {BOM_PAGE_STATUSES.map(status => <button key={status} type="button" data-status={status} aria-pressed={page.status === status} disabled={readOnly} onClick={() => onStatus(page, status)}>{BOM_PAGE_STATUS_LABELS[status]}</button>)}
        </div>
      </td>
      <td><Input data-field="title" value={page.title ?? ""} disabled={readOnly} onChange={event => onField(page.pageNumber, "title", event.target.value)} placeholder={readOnly ? "" : "頁面標題"} aria-label={`第 ${page.pageNumber} 頁標題`} maxLength={300} className="bom-tracker-title-input" /></td>
      <td><Input data-field="note" value={page.note} disabled={readOnly} onChange={event => onField(page.pageNumber, "note", event.target.value)} placeholder={readOnly ? "" : page.status === "done_missing" ? "缺哪些料？" : "備註"} aria-label={`第 ${page.pageNumber} 頁備註`} className="bom-tracker-note-input" /></td>
    </tr>
  );
});
