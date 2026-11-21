/**
 * 頁數進度: one shared document per BOM (total pages, the page work has reached, and a status, title, note and POWER marker per page).
 * Pure helpers shared by the material page, the page progress dialog and tests.
 */
import type { BomPageCheck, BomPageCheckEvent, BomPageTracker, BomPageTrackerPage, BomPageTrackerStatus } from "./materialBomStorage";

export const MAX_BOM_TRACKER_PAGES = 500;
export const BOM_PAGE_STATUSES: BomPageTrackerStatus[] = ["done", "pending", "done_missing"];
export const BOM_PAGE_STATUS_LABELS: Record<BomPageTrackerStatus, string> = { done: "已完成", pending: "待處理", done_missing: "已完成但缺料" };
export type BomPageStatusFilter = BomPageTrackerStatus | "all";
export type BomPageCheckFilter = "all" | "checked" | "unchecked";
export const BOM_PAGE_CHECK_FILTER_LABELS: Record<Exclude<BomPageCheckFilter, "all">, string> = { checked: "已檢查", unchecked: "未檢查" };
/** `checkLog` is the page check record (檢查完成 and cancelled checks with their reason); a draft without one has none yet. */
export interface BomPageTrackerDraft { totalPages: number; currentPage: number; pages: BomPageTrackerPage[]; checkLog?: BomPageCheckEvent[] }
/**
 * A rebased draft, plus the pages where this draft's work was dropped: `lockedPages` because someone checked or cancelled
 * the page meanwhile (a checked page is locked), `staleCheckPages` because the content this draft checked changed meanwhile.
 */
export interface BomPageTrackerMerge extends BomPageTrackerDraft { checkLog: BomPageCheckEvent[]; lockedPages: number[]; staleCheckPages: number[] }

export function clampBomTrackerPageCount(value: number) {
  return Number.isFinite(value) ? Math.min(MAX_BOM_TRACKER_PAGES, Math.max(0, Math.trunc(value))) : 0;
}

const blankPage = (pageNumber: number): BomPageTrackerPage => ({ pageNumber, status: "pending", note: "" });

/** One entry per page from 1 to `totalPages`, plus any later page that was filled in before the total was lowered. */
export function syncBomTrackerPages(pages: BomPageTrackerPage[], totalPages: number) {
  const normalizedTotalPages = clampBomTrackerPageCount(totalPages);
  const pageMap = new Map<number, BomPageTrackerPage>();

  pages.forEach((page) => {
    const pageNumber = clampBomTrackerPageCount(page.pageNumber);
    if (pageNumber < 1) return;

    pageMap.set(pageNumber, {
      pageNumber,
      status: page.status ?? (page.completed === true ? "done" : "pending"),
      note: page.note ?? "",
      ...(typeof page.title === "string" ? { title: page.title } : {}),
      ...(page.power === true ? { power: true } : {}),
      ...(page.checked ? { checked: page.checked } : {}),
    });
  });

  for (let pageNumber = 1; pageNumber <= normalizedTotalPages; pageNumber += 1) {
    if (!pageMap.has(pageNumber)) pageMap.set(pageNumber, blankPage(pageNumber));
  }

  return [...pageMap.values()].sort((left, right) => left.pageNumber - right.pageNumber);
}

/**
 * Same result as `syncBomTrackerPages` for a list that is already normalised, but existing entries keep their identity,
 * so a table of memoised rows only re-renders the pages that were added.
 */
export function extendBomTrackerPages(pages: BomPageTrackerPage[], totalPages: number) {
  const known = new Set(pages.map((page) => page.pageNumber));
  const missing: BomPageTrackerPage[] = [];
  for (let pageNumber = 1; pageNumber <= clampBomTrackerPageCount(totalPages); pageNumber += 1) {
    if (!known.has(pageNumber)) missing.push(blankPage(pageNumber));
  }
  return missing.length ? [...pages, ...missing].sort((left, right) => left.pageNumber - right.pageNumber) : pages;
}

export function getBomPageTrackerSummary(pageTracker?: Pick<BomPageTracker, "totalPages" | "currentPage" | "pages">) {
  const totalPages = clampBomTrackerPageCount(pageTracker?.totalPages ?? 0);
  const pages = syncBomTrackerPages(pageTracker?.pages ?? [], totalPages);
  const completedPages = pages.filter((page) => page.pageNumber <= totalPages && page.status !== "pending").length;
  const missingPages = pages.filter((page) => page.pageNumber <= totalPages && page.status === "done_missing").length;
  const checkedPages = pages.filter((page) => page.pageNumber <= totalPages && page.checked).length;
  const highestTouchedPage = pages.reduce((maxPage, page) => (
    page.status !== "pending" || page.note.trim()
      ? Math.max(maxPage, page.pageNumber)
      : maxPage
  ), 0);
  const requestedCurrentPage = clampBomTrackerPageCount(pageTracker?.currentPage ?? 0);
  const currentPage = totalPages > 0
    ? Math.min(totalPages, requestedCurrentPage > 0 ? requestedCurrentPage : highestTouchedPage)
    : 0;
  const currentPageEntry = currentPage > 0
    ? pages.find((page) => page.pageNumber === currentPage) ?? null
    : null;

  return {
    totalPages,
    completedPages,
    missingPages,
    checkedPages,
    pendingPages: Math.max(0, totalPages - completedPages),
    currentPage,
    currentPageEntry,
    highestTouchedPage,
    pages,
  };
}

/** The saved document as the dialog edits it: the current page falls back to the last page that was worked on. */
export function draftFromBomPageTracker(pageTracker?: BomPageTracker): BomPageTrackerDraft {
  const summary = getBomPageTrackerSummary(pageTracker);
  return { totalPages: summary.totalPages, currentPage: summary.currentPage, pages: syncBomTrackerPages(pageTracker?.pages ?? [], summary.totalPages), checkLog: pageTracker?.checkLog ?? [] };
}

const samePageProgress = (left?: BomPageTrackerPage, right?: BomPageTrackerPage) =>
  (left?.status ?? "pending") === (right?.status ?? "pending") && (left?.note ?? "") === (right?.note ?? "") && (left?.title ?? "") === (right?.title ?? "");
const isPowerPage = (page?: BomPageTrackerPage) => page?.power === true;
/** Two checks are the same sign-off when they were made at the same moment by the same person; two missing checks agree. */
export const sameBomPageCheck = (left?: BomPageCheck, right?: BomPageCheck) =>
  left === right || (Boolean(left) === Boolean(right) && left?.at === right?.at && left?.by === right?.by);
const samePage = (left?: BomPageTrackerPage, right?: BomPageTrackerPage) =>
  samePageProgress(left, right) && isPowerPage(left) === isPowerPage(right) && sameBomPageCheck(left?.checked, right?.checked);
const byNumber = (pages: BomPageTrackerPage[]) => new Map(pages.map((page) => [page.pageNumber, page]));
const eventTime = (event: BomPageCheckEvent) => { const value = Date.parse(event.at); return Number.isFinite(value) ? value : 0; };

/** Every copy's check record as one, oldest first. Lines are only ever added, so nothing a copy holds is dropped. */
export function mergeBomPageCheckLogs(...logs: ReadonlyArray<ReadonlyArray<BomPageCheckEvent> | undefined>): BomPageCheckEvent[] {
  const lines = new Map<string, BomPageCheckEvent>();
  logs.forEach((log) => log?.forEach((event) => { if (!lines.has(event.id)) lines.set(event.id, event); }));
  return [...lines.values()].sort((left, right) => eventTime(left) - eventTime(right));
}

/** A line for the check record. The id keeps two people's lines apart when their copies are merged. */
export function createBomPageCheckEvent(pageNumber: number, action: BomPageCheckEvent["action"], actor: { name: string; id?: string }, reason?: string, at = new Date().toISOString()): BomPageCheckEvent {
  return {
    id: `${pageNumber}-${action}-${Date.parse(at).toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    pageNumber, action, at, by: actor.name || "未知使用者",
    ...(actor.id ? { byId: actor.id } : {}),
    ...(reason ? { reason } : {}),
  };
}

/** What differs from the document the draft started from: the number of pages, and whether the total or current page moved. */
export function countBomPageTrackerChanges(baseline: BomPageTrackerDraft, draft: BomPageTrackerDraft) {
  const before = byNumber(baseline.pages), after = byNumber(draft.pages);
  let pages = 0;
  for (const pageNumber of new Set([...before.keys(), ...after.keys()])) if (!samePage(before.get(pageNumber), after.get(pageNumber))) pages += 1;
  return { pages, settings: baseline.totalPages !== draft.totalPages || baseline.currentPage !== draft.currentPage };
}

/**
 * The document is stored whole, so saving a copy that was opened earlier would undo what a colleague saved meanwhile.
 * The draft's edited page progress and settings take precedence. The POWER marker and the 檢查完成 sign-off merge
 * independently so either can be saved alongside someone else's status, title or note change on the same page.
 * The sign-off follows these rules, so the page and the check record never disagree:
 * - A page checked in the stored copy, whose check this draft did not change, is locked: what is stored stays and the
 *   draft's edits to it are dropped (`lockedPages`).
 * - Both sides changed the same page's sign-off (both checked it, or one cancelled what the other re-checked): what
 *   was saved first stays, and this draft's check or cancel on that page is dropped with its record lines (`lockedPages`).
 * - This draft checked a page whose stored content changed meanwhile, and did not edit that page itself: the check
 *   would sign off content nobody looked at, so it is dropped with its record line (`staleCheckPages`).
 * The record keeps every other line of both sides.
 */
export function mergeBomPageTracker(baseline: BomPageTrackerDraft, draft: BomPageTrackerDraft, latest: BomPageTrackerDraft): BomPageTrackerMerge {
  const before = byNumber(baseline.pages), mine = byNumber(draft.pages), theirs = byNumber(latest.pages);
  const totalPages = draft.totalPages !== baseline.totalPages ? draft.totalPages : latest.totalPages;
  const pages: BomPageTrackerPage[] = [];
  const lockedPages: number[] = [], staleCheckPages: number[] = [];
  const droppedCheckPages = new Set<number>();
  const savedLineIds = new Set((baseline.checkLog ?? []).map((event) => event.id));
  for (const pageNumber of new Set([...before.keys(), ...mine.keys(), ...theirs.keys()])) {
    const original = before.get(pageNumber), edited = mine.get(pageNumber);
    const stored = theirs.get(pageNumber) ?? (theirs.size ? undefined : edited);
    const myCheckMoved = !sameBomPageCheck(original?.checked, edited?.checked);
    const theirCheckMoved = !sameBomPageCheck(original?.checked, stored?.checked);
    let page = samePageProgress(original, edited) ? stored : edited;
    let checked: BomPageCheck | undefined;
    if (myCheckMoved && theirCheckMoved && !sameBomPageCheck(edited?.checked, stored?.checked)) {
      checked = stored?.checked; droppedCheckPages.add(pageNumber); lockedPages.push(pageNumber);
      if (stored?.checked) page = stored;
    } else if (myCheckMoved) {
      checked = edited?.checked;
      if (edited?.checked && stored !== edited && page === stored && !samePageProgress(original, stored)) {
        checked = stored?.checked; droppedCheckPages.add(pageNumber); staleCheckPages.push(pageNumber);
      }
    } else {
      checked = stored?.checked;
      if (stored?.checked && page === edited && !samePageProgress(edited, stored)) { page = stored; lockedPages.push(pageNumber); }
    }
    const lockedByStored = Boolean(stored?.checked) && sameBomPageCheck(checked, stored?.checked) && (!myCheckMoved || droppedCheckPages.has(pageNumber));
    let power = isPowerPage(original) === isPowerPage(edited) ? isPowerPage(stored) : isPowerPage(edited);
    if (lockedByStored && power !== isPowerPage(stored)) { power = isPowerPage(stored); if (!lockedPages.includes(pageNumber)) lockedPages.push(pageNumber); }
    if (!page && !power && !checked) continue;
    if (page && isPowerPage(page) === power && sameBomPageCheck(page.checked, checked)) {
      pages.push(page);
    } else {
      const merged = { ...(page ?? blankPage(pageNumber)) };
      if (power) merged.power = true;
      else delete merged.power;
      if (checked) merged.checked = checked;
      else delete merged.checked;
      pages.push(merged);
    }
  }
  const currentPage = draft.currentPage !== baseline.currentPage ? draft.currentPage : latest.currentPage;
  return {
    totalPages,
    currentPage: totalPages > 0 ? Math.min(totalPages, currentPage) : 0,
    pages: extendBomTrackerPages(pages.sort((left, right) => left.pageNumber - right.pageNumber), totalPages),
    // This draft's own new lines for a page whose check or cancel was dropped go with it; every other line stays.
    checkLog: mergeBomPageCheckLogs(latest.checkLog, (draft.checkLog ?? []).filter((event) => !droppedCheckPages.has(event.pageNumber) || savedLineIds.has(event.id))),
    lockedPages: lockedPages.sort((left, right) => left - right),
    staleCheckPages: staleCheckPages.sort((left, right) => left - right),
  };
}

/**
 * 頁數進度 belongs to the board, not to one BOM version: every version of a board shows and saves the same document
 * (2026-11-21, the user saw V1 at 90 % and V2 at 60 % with the same number of pages). Until then each version kept its
 * own copy and the copies drifted apart; they are read as one, newest copy first: a page counts as finished when any
 * copy finished it (the newest finished status wins), an empty title or note comes from the next copy that has one,
 * POWER from any copy, the total from the newest copy that has one, and the page work reached is the furthest one.
 * Copies that already agree come back as the newest object itself.
 */
export function combineBomPageTrackers(trackers: ReadonlyArray<BomPageTracker | undefined>): BomPageTracker | undefined {
  const time = (tracker: BomPageTracker) => { const value = Date.parse(tracker.updatedAt); return Number.isFinite(value) ? value : 0; };
  const copies = trackers.filter((tracker): tracker is BomPageTracker => Boolean(tracker)).sort((left, right) => time(right) - time(left));
  if (copies.length <= 1) return copies[0];
  const drafts = copies.map(draftFromBomPageTracker);
  if (drafts.every((draft) => { const moved = countBomPageTrackerChanges(drafts[0], draft); return !moved.pages && !moved.settings && sameBomPageCheckLog(drafts[0].checkLog, draft.checkLog); })) return copies[0];
  const totalPages = drafts.find((draft) => draft.totalPages > 0)?.totalPages ?? 0;
  const maps = drafts.map((draft) => byNumber(draft.pages));
  const checkLog = mergeBomPageCheckLogs(...drafts.map((draft) => draft.checkLog));
  const pageNumbers = [...new Set(drafts.flatMap((draft) => draft.pages.map((page) => page.pageNumber)))].sort((left, right) => left - right);
  const pages = pageNumbers.flatMap((pageNumber): BomPageTrackerPage[] => {
    const entries = maps.flatMap((map) => { const page = map.get(pageNumber); return page ? [page] : []; });
    const title = entries.find((entry) => entry.title?.trim())?.title;
    // The sign-off is the newest copy's (the last save that reached any version), not a vote across copies or the
    // record's order, which follows each person's own clock. A page checked there keeps that copy's content: it was locked.
    const newest = entries[0];
    const page: BomPageTrackerPage = newest?.checked ? newest : {
      pageNumber,
      status: entries.find((entry) => entry.status !== "pending")?.status ?? "pending",
      note: entries.find((entry) => entry.note.trim())?.note ?? "",
      ...(title ? { title } : {}),
      ...(entries.some(isPowerPage) ? { power: true } : {}),
    };
    // Past the total only pages that hold something are kept (an older copy with more pages lists blank ones).
    return pageNumber <= totalPages || !samePage(page, blankPage(pageNumber)) ? [page] : [];
  });
  const currentPage = Math.min(totalPages, Math.max(0, ...drafts.map((draft) => draft.currentPage)));
  return { totalPages, currentPage, pages: syncBomTrackerPages(pages, totalPages), ...(checkLog.length ? { checkLog } : {}), updatedAt: copies[0].updatedAt };
}

/** The same check record lines, whatever their order. */
export const sameBomPageCheckLog = (left: ReadonlyArray<BomPageCheckEvent> = [], right: ReadonlyArray<BomPageCheckEvent> = []) => {
  if (left.length !== right.length) return false;
  const ids = new Set(left.map((event) => event.id));
  return right.every((event) => ids.has(event.id));
};

/** Same pages, total, current page and check record (the saved time is not compared). */
export function sameBomPageTracker(left: BomPageTracker | undefined, right: BomPageTracker | undefined) {
  if (left === right) return true;
  if (!left || !right) return false;
  const moved = countBomPageTrackerChanges(draftFromBomPageTracker(left), draftFromBomPageTracker(right));
  return !moved.pages && !moved.settings && sameBomPageCheckLog(left.checkLog, right.checkLog);
}

/** Pages inside the total that match the status, POWER and check filters and the search text. */
export function filterBomTrackerPages(pages: BomPageTrackerPage[], totalPages: number, filters: { query: string; status: BomPageStatusFilter; powerOnly?: boolean; check?: BomPageCheckFilter }) {
  const needle = filters.query.trim().toLocaleLowerCase();
  return pages.filter((page) => page.pageNumber <= totalPages
    && (filters.status === "all" || page.status === filters.status)
    && (!filters.powerOnly || isPowerPage(page))
    && (!filters.check || filters.check === "all" || (filters.check === "checked") === Boolean(page.checked))
    && (!needle || `${page.pageNumber} 第${page.pageNumber}頁 第 ${page.pageNumber} 頁 ${page.title ?? ""} ${page.note}`.toLocaleLowerCase().includes(needle)));
}
