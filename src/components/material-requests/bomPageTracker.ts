/**
 * 頁數進度: one shared document per BOM (total pages, the page work has reached, and a status, title, note and POWER marker per page).
 * Pure helpers shared by the material page, the page progress dialog and tests.
 */
import type { BomPageTracker, BomPageTrackerPage, BomPageTrackerStatus } from "./materialBomStorage";

export const MAX_BOM_TRACKER_PAGES = 500;
export const BOM_PAGE_STATUSES: BomPageTrackerStatus[] = ["done", "pending", "done_missing"];
export const BOM_PAGE_STATUS_LABELS: Record<BomPageTrackerStatus, string> = { done: "已完成", pending: "待處理", done_missing: "已完成但缺料" };
export type BomPageStatusFilter = BomPageTrackerStatus | "all";
export interface BomPageTrackerDraft { totalPages: number; currentPage: number; pages: BomPageTrackerPage[] }

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
  return { totalPages: summary.totalPages, currentPage: summary.currentPage, pages: syncBomTrackerPages(pageTracker?.pages ?? [], summary.totalPages) };
}

const samePageProgress = (left?: BomPageTrackerPage, right?: BomPageTrackerPage) =>
  (left?.status ?? "pending") === (right?.status ?? "pending") && (left?.note ?? "") === (right?.note ?? "") && (left?.title ?? "") === (right?.title ?? "");
const isPowerPage = (page?: BomPageTrackerPage) => page?.power === true;
const samePage = (left?: BomPageTrackerPage, right?: BomPageTrackerPage) =>
  samePageProgress(left, right) && isPowerPage(left) === isPowerPage(right);
const byNumber = (pages: BomPageTrackerPage[]) => new Map(pages.map((page) => [page.pageNumber, page]));

/** What differs from the document the draft started from: the number of pages, and whether the total or current page moved. */
export function countBomPageTrackerChanges(baseline: BomPageTrackerDraft, draft: BomPageTrackerDraft) {
  const before = byNumber(baseline.pages), after = byNumber(draft.pages);
  let pages = 0;
  for (const pageNumber of new Set([...before.keys(), ...after.keys()])) if (!samePage(before.get(pageNumber), after.get(pageNumber))) pages += 1;
  return { pages, settings: baseline.totalPages !== draft.totalPages || baseline.currentPage !== draft.currentPage };
}

/**
 * The document is stored whole, so saving a copy that was opened earlier would undo what a colleague saved meanwhile.
 * The draft's edited page progress and settings take precedence. The POWER marker merges independently so a
 * marker change can be saved alongside someone else's status, title or note change on the same page.
 */
export function mergeBomPageTracker(baseline: BomPageTrackerDraft, draft: BomPageTrackerDraft, latest: BomPageTrackerDraft): BomPageTrackerDraft {
  const before = byNumber(baseline.pages), mine = byNumber(draft.pages), theirs = byNumber(latest.pages);
  const totalPages = draft.totalPages !== baseline.totalPages ? draft.totalPages : latest.totalPages;
  const pages: BomPageTrackerPage[] = [];
  for (const pageNumber of new Set([...before.keys(), ...mine.keys(), ...theirs.keys()])) {
    const original = before.get(pageNumber), edited = mine.get(pageNumber);
    const stored = theirs.get(pageNumber) ?? (theirs.size ? undefined : edited);
    const page = samePageProgress(original, edited) ? stored : edited;
    const power = isPowerPage(original) === isPowerPage(edited) ? isPowerPage(stored) : isPowerPage(edited);
    if (!page && !power) continue;
    if (page && isPowerPage(page) === power) {
      pages.push(page);
    } else {
      const merged = { ...(page ?? blankPage(pageNumber)) };
      if (power) merged.power = true;
      else delete merged.power;
      pages.push(merged);
    }
  }
  const currentPage = draft.currentPage !== baseline.currentPage ? draft.currentPage : latest.currentPage;
  return { totalPages, currentPage: totalPages > 0 ? Math.min(totalPages, currentPage) : 0, pages: extendBomTrackerPages(pages.sort((left, right) => left.pageNumber - right.pageNumber), totalPages) };
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
  if (drafts.every((draft) => { const moved = countBomPageTrackerChanges(drafts[0], draft); return !moved.pages && !moved.settings; })) return copies[0];
  const totalPages = drafts.find((draft) => draft.totalPages > 0)?.totalPages ?? 0;
  const maps = drafts.map((draft) => byNumber(draft.pages));
  const pageNumbers = [...new Set(drafts.flatMap((draft) => draft.pages.map((page) => page.pageNumber)))].sort((left, right) => left - right);
  const pages = pageNumbers.flatMap((pageNumber): BomPageTrackerPage[] => {
    const entries = maps.flatMap((map) => { const page = map.get(pageNumber); return page ? [page] : []; });
    const title = entries.find((entry) => entry.title?.trim())?.title;
    const page: BomPageTrackerPage = {
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
  return { totalPages, currentPage, pages: syncBomTrackerPages(pages, totalPages), updatedAt: copies[0].updatedAt };
}

/** Same pages, total and current page (the saved time is not compared). */
export function sameBomPageTracker(left: BomPageTracker | undefined, right: BomPageTracker | undefined) {
  if (left === right) return true;
  if (!left || !right) return false;
  const moved = countBomPageTrackerChanges(draftFromBomPageTracker(left), draftFromBomPageTracker(right));
  return !moved.pages && !moved.settings;
}

/** Pages inside the total that match the status, POWER filter and search text. */
export function filterBomTrackerPages(pages: BomPageTrackerPage[], totalPages: number, filters: { query: string; status: BomPageStatusFilter; powerOnly?: boolean }) {
  const needle = filters.query.trim().toLocaleLowerCase();
  return pages.filter((page) => page.pageNumber <= totalPages
    && (filters.status === "all" || page.status === filters.status)
    && (!filters.powerOnly || isPowerPage(page))
    && (!needle || `${page.pageNumber} 第${page.pageNumber}頁 第 ${page.pageNumber} 頁 ${page.title ?? ""} ${page.note}`.toLocaleLowerCase().includes(needle)));
}
