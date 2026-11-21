import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, Flag, History, Lock, Search, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BomPagePdfAiDialog } from "./BomPagePdfAiDialog";
import { applyPdfPageTitles } from "./bomPagePdfAi";
import {
  BOM_PAGE_CHECK_FILTER_LABELS, BOM_PAGE_STATUSES, BOM_PAGE_STATUS_LABELS, MAX_BOM_TRACKER_PAGES, clampBomTrackerPageCount, countBomPageTrackerChanges,
  createBomPageCheckEvent, draftFromBomPageTracker, extendBomTrackerPages, filterBomTrackerPages, mergeBomPageTracker, sameBomPageCheck, sameBomPageCheckLog, syncBomTrackerPages,
  type BomPageCheckFilter, type BomPageStatusFilter, type BomPageTrackerDraft,
} from "./bomPageTracker";
import type { BomPageCheckEvent, BomPageTracker, BomPageTrackerPage, BomPageTrackerStatus, BomWorkspace } from "./materialBomStorage";
import "./bomPageTracker.css";

const EMPTY_DRAFT: BomPageTrackerDraft = { totalPages: 0, currentPage: 0, pages: [], checkLog: [] };
const NO_FILTERS = { query: "", status: "all" as BomPageStatusFilter, powerOnly: false, check: "all" as BomPageCheckFilter };
const NO_EVENTS: BomPageCheckEvent[] = [];
const savedTime = (value?: string) => value ? new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "";
const statusCode = (status: BomPageTrackerStatus) => status === "done" ? "d" : status === "done_missing" ? "m" : "p";
const statusOfCode = (code: string): BomPageTrackerStatus => code === "d" ? "done" : code === "m" ? "done_missing" : "pending";
const LOCKED_HINT = "已檢查完成，這頁不能再修改；要修改請先按「已檢查」取消檢查";
/** What a merge dropped from this draft, in words: while a colleague's save comes in, or after this save. */
function droppedWorkNotice(merged: { lockedPages: number[]; staleCheckPages: number[] }, saved: boolean) {
  const pagesText = (pageNumbers: number[]) => `第 ${pageNumbers.join("、")} 頁`;
  const lines = [
    merged.lockedPages.length ? `${pagesText(merged.lockedPages)}剛被其他人檢查完成或取消檢查，${saved ? "你在這裡的修改沒有存入" : "已改成對方儲存的內容"}。` : "",
    merged.staleCheckPages.length ? `${pagesText(merged.staleCheckPages)}的內容剛被其他人改過，你的檢查完成${saved ? "沒有存入" : "已撤回"}，請看過再檢查一次。` : "",
  ].filter(Boolean);
  return lines.length ? `${lines.join("")}${saved ? "其他修改都已儲存。" : ""}` : "";
}

/**
 * 頁數進度. Changes stay a draft until 儲存頁數進度 is pressed: closing with unsaved changes asks first, a colleague's
 * save or record edit never resets the draft, and saving rebases the draft onto what is stored at that moment.
 * 檢查完成 (2026-11-21): a checker signs a finished page off; a checked page is locked for everyone until the check is
 * cancelled, and cancelling a saved check asks for a reason that stays in the page check record.
 */
export function BomPageTrackerDialog({ workspace, open, onOpenChange, onSave, loadLatest, readOnly = false, versionLabel, actor = { name: "" } }: {
  workspace: BomWorkspace | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (workspaceId: string, pageTracker: BomPageTracker) => Promise<void>;
  /** The document as stored right now, read just before saving. */
  loadLatest: (workspaceId: string) => Promise<BomPageTracker | undefined>;
  readOnly?: boolean;
  /** 「V1、V2 共用」 when the board has several versions: they all show and save this one document. */
  versionLabel?: string;
  /** The signed-in account: the name written on a check or a cancelled check. */
  actor?: { name: string; id?: string };
}) {
  const [totalPagesInput, setTotalPagesInput] = useState("0");
  const [currentPageInput, setCurrentPageInput] = useState("0");
  const [rangeStartInput, setRangeStartInput] = useState("1");
  const [rangeEndInput, setRangeEndInput] = useState("1");
  const [pages, setPages] = useState<BomPageTrackerPage[]>([]);
  const [checkLog, setCheckLog] = useState<BomPageCheckEvent[]>(NO_EVENTS);
  const [filters, setFilters] = useState(NO_FILTERS);
  const [flashPage, setFlashPage] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [notice, setNotice] = useState("");
  const [pdfAiOpen, setPdfAiOpen] = useState(false);
  // Only a phone layout hides the page map and batch tool behind this toggle; wider layouts always show them (see the stylesheet).
  const [toolsOpen, setToolsOpen] = useState(false);
  const [baselineVersion, setBaselineVersion] = useState(0);
  // Cancelling a saved check: the page asked about, the reason typed, and whether the empty reason was already pointed out.
  // The page number stays while the window closes, so its title does not change during the exit.
  const [uncheckOpen, setUncheckOpen] = useState(false);
  const [uncheckPage, setUncheckPage] = useState(0);
  const [uncheckAt, setUncheckAt] = useState("");
  const [uncheckReason, setUncheckReason] = useState("");
  const [uncheckError, setUncheckError] = useState(false);
  // The check record window: one page's lines, or every page's (-1).
  const [logOpen, setLogOpen] = useState(false);
  const [logPage, setLogPage] = useState(-1);
  const baseline = useRef<BomPageTrackerDraft>(EMPTY_DRAFT);
  const saving = useRef(false);
  const table = useRef<HTMLDivElement>(null);
  const reasonInput = useRef<HTMLTextAreaElement>(null);

  const totalPages = clampBomTrackerPageCount(Number(totalPagesInput || 0));
  const currentPage = totalPages > 0 ? Math.min(totalPages, clampBomTrackerPageCount(Number(currentPageInput || 0))) : 0;
  const draft = useMemo<BomPageTrackerDraft>(() => ({ totalPages, currentPage, pages, checkLog }), [totalPages, currentPage, pages, checkLog]);
  const draftRef = useRef(draft); draftRef.current = draft;
  const actorRef = useRef(actor); actorRef.current = actor;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the baseline lives in a ref; its version marks when it moved
  const changes = useMemo(() => countBomPageTrackerChanges(baseline.current, draft), [draft, baselineVersion]);
  const dirty = !readOnly && (changes.pages > 0 || changes.settings);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  // Checks that are stored: only those need a reason to cancel. A check made in this draft is simply taken back.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the baseline lives in a ref; its version marks when it moved
  const savedChecks = useMemo(() => new Map(baseline.current.pages.flatMap(page => page.checked ? [[page.pageNumber, page.checked] as const] : [])), [baselineVersion]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- as above
  const savedEventIds = useMemo(() => new Set((baseline.current.checkLog ?? NO_EVENTS).map(event => event.id)), [baselineVersion]);
  const savedChecksRef = useRef(savedChecks); savedChecksRef.current = savedChecks;
  const savedEventIdsRef = useRef(savedEventIds); savedEventIdsRef.current = savedEventIds;

  const applyDraft = (next: BomPageTrackerDraft) => {
    setTotalPagesInput(String(next.totalPages)); setCurrentPageInput(String(next.currentPage)); setPages(next.pages); setCheckLog(next.checkLog ?? NO_EVENTS);
  };
  // Opening (or switching board) starts from what is saved. The workspace object itself changes whenever anyone edits a
  // material record, so it must not be what resets the form.
  useEffect(() => {
    setPdfAiOpen(false); setConfirmClose(false); setNotice(""); setIsSaving(false); saving.current = false; setToolsOpen(false);
    setUncheckOpen(false); setLogOpen(false);
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
  // A colleague saved page progress while this is open: their pages come in, the pages edited here stay as edited,
  // except pages they checked meanwhile, which are locked and go back to what was checked.
  useEffect(() => {
    // While our own save is on its way the page shows it optimistically; that is not a colleague's change, and taking it
    // as the new baseline would make a failed save look as if nothing had been edited.
    if (!open || !workspace || saving.current) return;
    const latest = draftFromBomPageTracker(workspace.pageTracker);
    const moved = countBomPageTrackerChanges(baseline.current, latest);
    // A check and its cancel can leave every page as it was and only add record lines; those come in quietly.
    const logMoved = !sameBomPageCheckLog(baseline.current.checkLog, latest.checkLog);
    if (!moved.pages && !moved.settings && !logMoved) return;
    const merged = mergeBomPageTracker(baseline.current, draftRef.current, latest);
    baseline.current = latest; setBaselineVersion(version => version + 1);
    applyDraft(merged);
    if (!moved.pages && !moved.settings) return;
    setNotice(droppedWorkNotice(merged, false)
      || (dirtyRef.current ? "其他人剛儲存了頁數進度：你改過的頁面維持你的內容，其餘已更新。" : "已帶入其他人剛儲存的頁數進度。"));
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

  const { counts, statusCodes, checkCodes, powerCount, checkedCount } = useMemo(() => {
    const counts: Record<BomPageTrackerStatus, number> = { done: 0, pending: 0, done_missing: 0 };
    let statusCodes = "", checkCodes = "";
    let powerCount = 0, checkedCount = 0;
    for (const page of pages) {
      if (page.pageNumber > totalPages) continue;
      counts[page.status] += 1;
      if (page.power) powerCount += 1;
      if (page.checked) checkedCount += 1;
      const code = statusCode(page.status);
      statusCodes += page.power ? code.toUpperCase() : code;
      checkCodes += page.checked ? "1" : "0";
    }
    return { counts, statusCodes, checkCodes, powerCount, checkedCount };
  }, [pages, totalPages]);
  // How many times each page's check was cancelled: the row offers that page's record when there is one.
  const cancelCounts = useMemo(() => {
    const result = new Map<number, number>();
    checkLog.forEach(event => { if (event.action === "uncheck") result.set(event.pageNumber, (result.get(event.pageNumber) ?? 0) + 1); });
    return result;
  }, [checkLog]);
  const completed = counts.done + counts.done_missing;
  const completionRate = totalPages > 0 ? Math.round((completed / totalPages) * 100) : 0;
  const rawStart = clampBomTrackerPageCount(Number(rangeStartInput || 0)), rawEnd = clampBomTrackerPageCount(Number(rangeEndInput || 0));
  const rangeReady = totalPages > 0 && rawStart > 0 && rawEnd > 0;
  const rangeStart = rangeReady ? Math.min(totalPages, Math.min(rawStart, rawEnd)) : 0;
  const rangeEnd = rangeReady ? Math.min(totalPages, Math.max(rawStart, rawEnd)) : 0;
  const rangeCount = rangeReady ? rangeEnd - rangeStart + 1 : 0;
  const rangeLocked = rangeCount ? pages.filter(page => page.checked && page.pageNumber >= rangeStart && page.pageNumber <= rangeEnd).length : 0;

  const changeTotal = (value: string) => {
    setTotalPagesInput(value);
    setPages(current => extendBomTrackerPages(current, clampBomTrackerPageCount(Number(value || 0))));
  };
  // The page that work has reached only moves forward, and only when something was actually recorded on a later page.
  const reach = useCallback((pageNumber: number) => {
    setCurrentPageInput(current => pageNumber > clampBomTrackerPageCount(Number(current || 0)) ? String(pageNumber) : current);
  }, []);
  const setStatus = useCallback((page: BomPageTrackerPage, status: BomPageTrackerStatus) => {
    if (page.status === status || page.checked) return;
    setPages(current => current.map(row => row.pageNumber === page.pageNumber && !row.checked ? { ...row, status } : row));
    if (status !== "pending") reach(page.pageNumber);
  }, [reach]);
  const setField = useCallback((pageNumber: number, field: "title" | "note", value: string) => {
    setPages(current => current.map(row => row.pageNumber === pageNumber && !row.checked ? { ...row, [field]: value } : row));
    if (field === "note" && value.trim()) reach(pageNumber);
  }, [reach]);
  const setCurrent = useCallback((pageNumber: number) => setCurrentPageInput(String(pageNumber)), []);
  const togglePower = useCallback((pageNumber: number) => {
    setPages(current => current.map(row => row.pageNumber === pageNumber && !row.checked ? { ...row, power: !row.power } : row));
  }, []);
  const checkPage = useCallback((pageNumber: number) => {
    const row = draftRef.current.pages.find(page => page.pageNumber === pageNumber);
    if (!row || row.checked || row.status === "pending") return;
    const event = createBomPageCheckEvent(pageNumber, "check", actorRef.current);
    const checked = { at: event.at, by: event.by, ...(event.byId ? { byId: event.byId } : {}) };
    setPages(current => current.map(page => page.pageNumber === pageNumber ? { ...page, checked } : page));
    setCheckLog(current => [...current, event]);
  }, []);
  const askUncheck = useCallback((pageNumber: number) => {
    const row = draftRef.current.pages.find(page => page.pageNumber === pageNumber);
    if (!row?.checked) return;
    const stored = savedChecksRef.current.get(pageNumber);
    if (stored && sameBomPageCheck(stored, row.checked)) { setUncheckReason(""); setUncheckError(false); setUncheckPage(pageNumber); setUncheckAt(row.checked.at); setUncheckOpen(true); return; }
    // Checked in this draft and never saved: nobody saw it, so it is taken back without a reason or a record line, back
    // to what is stored for the page (its own stored check, if it has one).
    const at = row.checked.at;
    setPages(current => current.map(page => { if (page.pageNumber !== pageNumber) return page; const { checked: _checked, ...rest } = page; return stored ? { ...rest, checked: stored } : rest; }));
    setCheckLog(current => current.filter(event => !(event.pageNumber === pageNumber && event.action === "check" && event.at === at && !savedEventIdsRef.current.has(event.id))));
  }, []);
  const closeUncheck = () => { setUncheckOpen(false); setUncheckError(false); };
  const confirmUncheck = () => {
    const reason = uncheckReason.replace(/\s+/g, " ").trim();
    if (!uncheckOpen) return;
    // A colleague's save changed this page's check while the window was open: the reason was written for another check.
    if (pages.find(page => page.pageNumber === uncheckPage)?.checked?.at !== uncheckAt) {
      closeUncheck(); setNotice(`第 ${uncheckPage} 頁的檢查剛被其他人改過，沒有取消；請看過現在的狀態再決定。`); return;
    }
    if (!reason) { setUncheckError(true); reasonInput.current?.focus(); return; }
    const pageNumber = uncheckPage;
    const event = createBomPageCheckEvent(pageNumber, "uncheck", actorRef.current, reason);
    setPages(current => current.map(page => { if (page.pageNumber !== pageNumber) return page; const { checked: _checked, ...rest } = page; return rest; }));
    setCheckLog(current => [...current, event]);
    closeUncheck();
    setNotice(`第 ${pageNumber} 頁已取消檢查，原因已記下；按「儲存頁數進度」後才會生效。`);
  };
  const showLog = useCallback((pageNumber: number) => { setLogPage(pageNumber); setLogOpen(true); }, []);
  const applyRangeStatus = (status: BomPageTrackerStatus) => {
    if (!rangeCount) return;
    setPages(current => current.map(row => row.pageNumber >= rangeStart && row.pageNumber <= rangeEnd && row.status !== status && !row.checked ? { ...row, status } : row));
    if (status !== "pending" && rangeLocked < rangeCount) reach(rangeEnd);
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
      const sent = draftRef.current;
      const merged = mergeBomPageTracker(baseline.current, sent, draftFromBomPageTracker(stored));
      const document: BomPageTracker = {
        totalPages: merged.totalPages, currentPage: merged.currentPage, pages: syncBomTrackerPages(merged.pages, merged.totalPages),
        ...(merged.checkLog.length ? { checkLog: merged.checkLog } : {}), updatedAt: new Date().toISOString(),
      };
      await onSave(workspace.id, document);
      const dropped = droppedWorkNotice(merged, true);
      if (dropped) {
        // A colleague's check or edit overrode work done here: the rest is saved, and the dialog stays open to say what
        // was not. Anything changed while the save was on its way is kept on top of what was saved.
        const savedDraft = draftFromBomPageTracker(document);
        baseline.current = savedDraft; setBaselineVersion(version => version + 1);
        applyDraft(draftRef.current === sent ? savedDraft : mergeBomPageTracker(sent, draftRef.current, savedDraft));
        setConfirmClose(false); setNotice(dropped);
        return;
      }
      leave();
    } catch {
      // The page already showed why saving failed; the draft stays so nothing has to be entered again.
      setConfirmClose(false);
    } finally { setIsSaving(false); saving.current = false; }
  };

  if (!workspace) return null;
  const dialogDescription = `${workspace.name}${versionLabel ? ` · ${versionLabel}` : ""} · ${workspace.payload.sheetName} · ${workspace.payload.recordCount.toLocaleString()} 筆料件`;
  const activeChips = [
    ...(filters.query ? [{ key: "query" as const, label: `搜尋：${filters.query}`, reset: "" }] : []),
    ...(filters.status !== "all" ? [{ key: "status" as const, label: `狀態：${BOM_PAGE_STATUS_LABELS[filters.status]}`, reset: "all" }] : []),
    ...(filters.powerOnly ? [{ key: "powerOnly" as const, label: "只看 POWER", reset: false }] : []),
    ...(filters.check !== "all" ? [{ key: "check" as const, label: `檢查：${BOM_PAGE_CHECK_FILTER_LABELS[filters.check]}`, reset: "all" }] : []),
  ];
  const changeLabel = [changes.pages ? `${changes.pages} 頁` : "", changes.settings ? "頁數設定" : ""].filter(Boolean).join("與");
  const statusText = readOnly ? "檢視權限：可以查看，不能修改" : dirty ? `有尚未儲存的修改（${changeLabel}）` : workspace.pageTracker ? `已儲存 · ${savedTime(workspace.pageTracker.updatedAt)}` : "尚未設定頁數";
  const uncheckRow = uncheckPage ? pages.find(page => page.pageNumber === uncheckPage) : undefined;
  const uncheckHistory = uncheckPage ? checkLog.filter(event => event.pageNumber === uncheckPage) : NO_EVENTS;

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
              <p>{totalPages > 0 ? <>已完成 <strong>{completed}</strong> / {totalPages} 頁（{completionRate}%）{counts.done_missing > 0 && <span className="bom-tracker-missing">其中 {counts.done_missing} 頁缺料</span>}{checkLog.length > 0 && <button type="button" className="bom-tracker-checked-count" aria-label={`檢查紀錄：已檢查 ${checkedCount} 頁，共 ${checkLog.length} 筆紀錄`} title="看誰在什麼時候檢查完成、誰取消過檢查與原因" onClick={() => showLog(-1)}><CheckCheck aria-hidden="true" />已檢查 {checkedCount} 頁<span>· 紀錄 {checkLog.length}</span></button>}</> : "還沒有設定頁數"}</p>
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
                {BOM_PAGE_STATUSES.map(status => <button key={status} type="button" data-status={status} disabled={rangeCount === 0 || rangeLocked === rangeCount} onClick={() => applyRangeStatus(status)}>{BOM_PAGE_STATUS_LABELS[status]}</button>)}
              </div>
              <span className="bom-tracker-batch-hint">{rangeCount === 0 ? "先填起訖頁" : rangeLocked === rangeCount ? `這 ${rangeCount} 頁都已檢查完成，不能變更` : rangeLocked > 0 ? `共 ${rangeCount} 頁，已檢查的 ${rangeLocked} 頁不會變更` : `共 ${rangeCount} 頁，標題與備註會保留`}</span>
            </div>}
          {totalPages > 0 && <section className="bom-tracker-map" aria-label="頁面總覽">
            <header>
              <h3>頁面總覽</h3>
              <p>{readOnly ? "點頁碼可跳到那一頁。" : <><span className="bom-tracker-wide-copy">點頁碼跳到那一頁；按住 Shift 再點另一頁，可選一段範圍一次設定。</span><span className="bom-tracker-compact-copy">點頁碼跳到那一頁；一次設定多頁請填上方起訖頁。</span></>}</p>
              <ul aria-hidden="true">{BOM_PAGE_STATUSES.map(status => <li key={status} data-status={status}>{BOM_PAGE_STATUS_LABELS[status]}</li>)}{powerCount > 0 && <li className="bom-tracker-power-legend"><Zap />POWER</li>}{checkedCount > 0 && <li className="bom-tracker-check-legend"><Check />已檢查</li>}</ul>
            </header>
            <PageMap codes={statusCodes} checks={checkCodes} currentPage={currentPage} rangeStart={readOnly ? 0 : rangeStart} rangeEnd={readOnly ? 0 : rangeEnd} onPick={onPick} />
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
                <label className="bom-tracker-check-filter" data-active={filters.check !== "all"} title="只看已檢查完成或還沒檢查的頁面">
                  <CheckCheck aria-hidden="true" />
                  <select aria-label="篩選檢查" value={filters.check} onChange={event => setFilters(current => ({ ...current, check: event.target.value as BomPageCheckFilter }))}>
                    <option value="all">檢查：全部</option>
                    <option value="checked">已檢查 {checkedCount}</option>
                    <option value="unchecked">未檢查 {totalPages - checkedCount}</option>
                  </select>
                  <ChevronDown aria-hidden="true" />
                </label>
              </div>
              <span className="bom-tracker-count">{shown} / {totalPages} 頁</span>
            </div>
            {activeChips.length > 0 && <div className="bom-tracker-chips" data-testid="bom-page-tracker-filters">
              {activeChips.map(chip => <button type="button" key={chip.key} data-status={chip.key === "status" ? filters.status : undefined} aria-label={`移除篩選：${chip.label}`} onClick={() => setFilters(current => ({ ...current, [chip.key]: chip.reset }))}>{chip.label}<X aria-hidden="true" /></button>)}
              <Button type="button" variant="ghost" onClick={() => setFilters(NO_FILTERS)}>全部清除</Button>
            </div>}
            <div className="bom-tracker-table-scroll" ref={table} data-testid="bom-page-tracker-scroll">
              <table className="bom-tracker-table" data-testid="bom-page-tracker-table" aria-label="逐頁進度表">
                <colgroup><col className="bom-tracker-page-col" /><col className="bom-tracker-check-col" /><col className="bom-tracker-status-col" /><col /><col /></colgroup>
                <thead><tr><th scope="col">頁碼</th><th scope="col" title="檢查者確認這頁沒問題後按下；檢查完成的頁面不能再修改">檢查完成</th><th scope="col">狀態</th><th scope="col">頁面標題</th><th scope="col">備註</th></tr></thead>
                <tbody onKeyDown={moveFocus}>
                  {filtered.map(page => <PageRow key={page.pageNumber} page={page} current={page.pageNumber === currentPage} flash={page.pageNumber === flashPage} readOnly={readOnly}
                    checkSaved={Boolean(page.checked && sameBomPageCheck(savedChecks.get(page.pageNumber), page.checked) && savedChecks.has(page.pageNumber))} cancelCount={cancelCounts.get(page.pageNumber) ?? 0}
                    onStatus={setStatus} onField={setField} onCurrent={setCurrent} onTogglePower={togglePower} onCheck={checkPage} onUncheck={askUncheck} onShowLog={showLog} />)}
                  {shown === 0 && <tr className="bom-tracker-no-match"><td colSpan={5}>目前篩選條件沒有符合的頁面</td></tr>}
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
          const locked = new Set(pages.filter(page => page.checked).map(page => page.pageNumber));
          const skipped = titles.filter(title => locked.has(title.pageNumber) && title.title.trim()).length;
          setTotalPagesInput(String(nextTotal));
          setCurrentPageInput(current => String(Math.min(nextTotal, clampBomTrackerPageCount(Number(current || 0)))));
          setRangeStartInput(current => String(Math.min(nextTotal, Math.max(1, clampBomTrackerPageCount(Number(current || 0))))));
          setRangeEndInput(current => String(Math.min(nextTotal, Math.max(1, clampBomTrackerPageCount(Number(current || 0))))));
          // A checked page keeps its title: it is locked until the check is cancelled.
          setPages(current => extendBomTrackerPages(applyPdfPageTitles(current, titles.filter(title => !current.some(page => page.pageNumber === title.pageNumber && page.checked))), nextTotal));
          if (skipped) setNotice(`已檢查完成的 ${skipped} 頁沒有改標題；要改請先取消那幾頁的檢查。`);
        }} />}
        <Dialog open={uncheckOpen} onOpenChange={next => { if (!next) closeUncheck(); }}>
          <DialogContent data-testid="bom-page-uncheck" className="bom-check-dialog" onOpenAutoFocus={event => { event.preventDefault(); reasonInput.current?.focus(); }}>
            <DialogHeader>
              <DialogTitle>取消第 {uncheckPage} 頁的檢查完成</DialogTitle>
              <DialogDescription>{uncheckRow?.checked ? `${uncheckRow.checked.by} 在 ${savedTime(uncheckRow.checked.at)} 檢查完成。` : ""}取消後這頁可以再修改；原因會留在檢查紀錄，所有人都看得到。</DialogDescription>
            </DialogHeader>
            <div className="bom-check-reason">
              <Label htmlFor="bom-uncheck-reason">取消原因（必填）</Label>
              <Textarea id="bom-uncheck-reason" ref={reasonInput} value={uncheckReason} maxLength={500} rows={3} placeholder="例如：客戶改線路，這頁要重畫"
                aria-invalid={uncheckError} aria-describedby={uncheckError ? "bom-uncheck-reason-error" : undefined}
                onChange={event => { setUncheckReason(event.target.value); if (uncheckError) setUncheckError(false); }}
                onBlur={event => { if (!event.target.value.trim() && event.relatedTarget?.getAttribute("data-action") === "keep-check") return; if (!event.target.value.trim() && uncheckReason !== "") setUncheckError(true); }} />
              {uncheckError && <p id="bom-uncheck-reason-error" role="alert">寫下為什麼要取消，其他人才知道這頁為什麼又可以改。</p>}
            </div>
            {uncheckHistory.length > 0 && <CheckLogList events={uncheckHistory} savedIds={savedEventIds} compact />}
            <footer className="bom-check-actions">
              <Button type="button" variant="outline" data-action="keep-check" onClick={closeUncheck}>保留檢查</Button>
              <Button type="button" variant="destructive" onClick={confirmUncheck}>取消檢查</Button>
            </footer>
          </DialogContent>
        </Dialog>
        <Dialog open={logOpen} onOpenChange={next => { if (!next) setLogOpen(false); }}>
          <DialogContent data-testid="bom-page-check-log" className="bom-check-dialog bom-check-log-dialog">
            <DialogHeader>
              <DialogTitle>{logPage > 0 ? `第 ${logPage} 頁檢查紀錄` : "檢查紀錄"}</DialogTitle>
              <DialogDescription>誰在什麼時候檢查完成、誰取消過檢查與原因。紀錄只會增加，不能修改。</DialogDescription>
            </DialogHeader>
            {logPage > 0 && <div className="bom-tracker-chips"><button type="button" aria-label={`移除篩選：第 ${logPage} 頁`} onClick={() => setLogPage(-1)}>只看第 {logPage} 頁<X aria-hidden="true" /></button></div>}
            <CheckLogList events={logPage > 0 ? checkLog.filter(event => event.pageNumber === logPage) : checkLog} savedIds={savedEventIds}
              onJump={pageNumber => { setLogOpen(false); jumpTo(pageNumber); }} />
            <footer className="bom-check-actions"><Button type="button" variant="outline" onClick={() => setLogOpen(false)}>關閉</Button></footer>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

/** The check record, newest line first. Lines not saved yet say so. */
function CheckLogList({ events, savedIds, onJump, compact = false }: { events: BomPageCheckEvent[]; savedIds: Set<string>; onJump?: (pageNumber: number) => void; compact?: boolean }) {
  const lines = [...events].reverse();
  if (!lines.length) return <p className="bom-check-log-empty">目前篩選條件沒有符合的檢查紀錄</p>;
  return <ol className="bom-check-log" data-compact={compact || undefined} aria-label={compact ? "這頁以前的檢查紀錄" : "檢查紀錄"}>
    {lines.map(event => <li key={event.id} data-action={event.action}>
      <span className="bom-check-log-time">{savedTime(event.at)}</span>
      {onJump ? <button type="button" className="bom-check-log-page" title={`跳到第 ${event.pageNumber} 頁`} onClick={() => onJump(event.pageNumber)}>第 {event.pageNumber} 頁</button> : !compact && <span className="bom-check-log-page">第 {event.pageNumber} 頁</span>}
      <span className="bom-check-log-action">{event.action === "check" ? "檢查完成" : "取消檢查"}</span>
      <span className="bom-check-log-by">{event.by}</span>
      {event.reason && <span className="bom-check-log-reason">原因：{event.reason}</span>}
      {!savedIds.has(event.id) && <span className="bom-check-log-unsaved">未儲存</span>}
    </li>)}
  </ol>;
}

/** A numbered cell per page. Uppercase status codes carry the independent POWER marker; `checks` holds 1 for a checked page. */
const PageMap = memo(function PageMap({ codes, checks, currentPage, rangeStart, rangeEnd, onPick }: {
  codes: string; checks: string; currentPage: number; rangeStart: number; rangeEnd: number; onPick: (pageNumber: number, extend: boolean) => void;
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
      const checked = checks[start + index] === "1";
      return <button key={pageNumber} type="button" data-map-page={pageNumber} data-status={status} data-power={power || undefined} data-checked={checked || undefined} data-current={pageNumber === currentPage} aria-pressed={selected} tabIndex={pageNumber === (anchor > start && anchor <= end ? anchor : start + 1) ? 0 : -1}
        aria-label={`第 ${pageNumber} 頁，${BOM_PAGE_STATUS_LABELS[status]}${checked ? "，已檢查" : ""}${pageNumber === currentPage ? "，目前頁" : ""}${power ? "，POWER" : ""}`} title={`第 ${pageNumber} 頁 · ${BOM_PAGE_STATUS_LABELS[status]}${checked ? " · 已檢查" : ""}${power ? " · POWER" : ""}`}
        onClick={(event: MouseEvent) => onPick(pageNumber, event.shiftKey)}>{pageNumber}{power && <Zap className="bom-tracker-map-power" aria-hidden="true" />}{checked && <Check className="bom-tracker-map-check" aria-hidden="true" />}</button>;
    })}
    </div>
  </div>;
});

const PageRow = memo(function PageRow({ page, current, flash, readOnly, checkSaved, cancelCount, onStatus, onField, onCurrent, onTogglePower, onCheck, onUncheck, onShowLog }: {
  page: BomPageTrackerPage; current: boolean; flash: boolean; readOnly: boolean; checkSaved: boolean; cancelCount: number;
  onStatus: (page: BomPageTrackerPage, status: BomPageTrackerStatus) => void;
  onField: (pageNumber: number, field: "title" | "note", value: string) => void;
  onCurrent: (pageNumber: number) => void;
  onTogglePower: (pageNumber: number) => void;
  onCheck: (pageNumber: number) => void;
  onUncheck: (pageNumber: number) => void;
  onShowLog: (pageNumber: number) => void;
}) {
  const locked = Boolean(page.checked);
  const checkedTitle = page.checked ? `${page.checked.by} 在 ${savedTime(page.checked.at)} 檢查完成${checkSaved ? "" : "（還沒儲存）"}` : "";
  return (
    <tr data-testid="bom-page-tracker-row" data-page={page.pageNumber} data-status={page.status} data-current={current} data-flash={flash} data-checked={locked || undefined}>
      <th scope="row">
        <div className="bom-tracker-page-cell">
          <span className="bom-tracker-page-number">第 {page.pageNumber} 頁</span>
          {current ? <span className="bom-tracker-current-tag">目前頁</span>
            : !readOnly && <button type="button" className="bom-tracker-set-current" aria-label="設為目前頁" title="設為目前頁：主畫面會顯示做到這一頁" onClick={() => onCurrent(page.pageNumber)}><Flag aria-hidden="true" /></button>}
          {(!readOnly || page.power) && <button type="button" className="bom-tracker-power-mark" aria-label={`第 ${page.pageNumber} 頁 POWER 標記`} aria-pressed={Boolean(page.power)} disabled={readOnly || locked} title={locked ? LOCKED_HINT : "標記需算 POWER 的頁面"} onClick={() => onTogglePower(page.pageNumber)}>POWER</button>}
        </div>
      </th>
      <td>
        <div className="bom-tracker-check">
          {page.checked ? (readOnly
            ? <span className="bom-tracker-check-state" data-checked="true" title={checkedTitle}><Lock aria-hidden="true" /><span>已檢查</span><small>{page.checked.by}</small></span>
            : <button type="button" className="bom-tracker-check-button" data-checked="true" data-saved={checkSaved} aria-pressed="true" aria-label={`第 ${page.pageNumber} 頁已檢查完成（${page.checked.by}），按一下取消檢查`}
              title={`${checkedTitle}。這頁已鎖定；${checkSaved ? "按一下取消檢查（需填原因）" : "按一下直接取消"}`} onClick={() => onUncheck(page.pageNumber)}>
              <Lock aria-hidden="true" /><span>已檢查</span><small>{checkSaved ? page.checked.by : "未儲存"}</small>
            </button>)
            : readOnly ? <span className="bom-tracker-check-state">未檢查</span>
            : <button type="button" className="bom-tracker-check-button" aria-pressed="false" aria-label={`第 ${page.pageNumber} 頁檢查完成`} disabled={page.status === "pending"}
              title={page.status === "pending" ? "這頁還是待處理；完成後才能檢查" : "檢查者確認這頁沒問題後按下；之後這頁不能再修改"} onClick={() => onCheck(page.pageNumber)}>
              <CheckCheck aria-hidden="true" /><span>檢查完成</span>
            </button>}
          {cancelCount > 0 && <button type="button" className="bom-tracker-check-history" aria-label={`第 ${page.pageNumber} 頁檢查紀錄，取消過 ${cancelCount} 次`} title={`取消過 ${cancelCount} 次檢查，按一下看原因`} onClick={() => onShowLog(page.pageNumber)}><History aria-hidden="true" />{cancelCount}</button>}
        </div>
      </td>
      <td>
        <div className="bom-tracker-status" role="group" aria-label={`第 ${page.pageNumber} 頁狀態`} title={locked ? LOCKED_HINT : undefined}>
          {BOM_PAGE_STATUSES.map(status => <button key={status} type="button" data-status={status} aria-pressed={page.status === status} disabled={readOnly || locked} onClick={() => onStatus(page, status)}>{BOM_PAGE_STATUS_LABELS[status]}</button>)}
        </div>
      </td>
      <td><Input data-field="title" value={page.title ?? ""} disabled={readOnly} readOnly={locked} title={locked ? LOCKED_HINT : undefined} onChange={event => onField(page.pageNumber, "title", event.target.value)} placeholder={readOnly || locked ? "" : "頁面標題"} aria-label={`第 ${page.pageNumber} 頁標題`} maxLength={300} className="bom-tracker-title-input" /></td>
      <td><Input data-field="note" value={page.note} disabled={readOnly} readOnly={locked} title={locked ? LOCKED_HINT : undefined} onChange={event => onField(page.pageNumber, "note", event.target.value)} placeholder={readOnly || locked ? "" : page.status === "done_missing" ? "缺哪些料？" : "備註"} aria-label={`第 ${page.pageNumber} 頁備註`} className="bom-tracker-note-input" /></td>
    </tr>
  );
});
