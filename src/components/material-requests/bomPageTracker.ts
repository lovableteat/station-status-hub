/**
 * 頁數進度: one shared document per BOM (total pages, the page work has reached, and a status, title and note per page).
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

const samePage = (left?: BomPageTrackerPage, right?: BomPageTrackerPage) =>
  (left?.status ?? "pending") === (right?.status ?? "pending") && (left?.note ?? "") === (right?.note ?? "") && (left?.title ?? "") === (right?.title ?? "");
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
 * This rebases the draft instead: every page and setting the user changed since `baseline` keeps the user's value,
 * everything else follows `latest`.
 */
export function mergeBomPageTracker(baseline: BomPageTrackerDraft, draft: BomPageTrackerDraft, latest: BomPageTrackerDraft): BomPageTrackerDraft {
  const before = byNumber(baseline.pages), mine = byNumber(draft.pages), theirs = byNumber(latest.pages);
  const totalPages = draft.totalPages !== baseline.totalPages ? draft.totalPages : latest.totalPages;
  const pages: BomPageTrackerPage[] = [];
  for (const pageNumber of new Set([...before.keys(), ...mine.keys(), ...theirs.keys()])) {
    const edited = !samePage(before.get(pageNumber), mine.get(pageNumber));
    const page = edited ? mine.get(pageNumber) : theirs.get(pageNumber) ?? (theirs.size ? undefined : mine.get(pageNumber));
    if (page) pages.push(page);
  }
  const currentPage = draft.currentPage !== baseline.currentPage ? draft.currentPage : latest.currentPage;
  return { totalPages, currentPage: totalPages > 0 ? Math.min(totalPages, currentPage) : 0, pages: extendBomTrackerPages(pages.sort((left, right) => left.pageNumber - right.pageNumber), totalPages) };
}

/** Pages inside the total that match the status and the search text (page number, title or note). */
export function filterBomTrackerPages(pages: BomPageTrackerPage[], totalPages: number, filters: { query: string; status: BomPageStatusFilter }) {
  const needle = filters.query.trim().toLocaleLowerCase();
  return pages.filter((page) => page.pageNumber <= totalPages
    && (filters.status === "all" || page.status === filters.status)
    && (!needle || `${page.pageNumber} 第${page.pageNumber}頁 第 ${page.pageNumber} 頁 ${page.title ?? ""} ${page.note}`.toLocaleLowerCase().includes(needle)));
}
