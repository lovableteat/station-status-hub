import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { loader } = require("../../../tests/support/renderHarness.cjs");
const tracker = loader()("src/components/material-requests/bomPageTracker.ts");
const page = (pageNumber, status = "pending", note = "", title) => ({ pageNumber, status, note, ...(title === undefined ? {} : { title }) });
const draft = (totalPages, currentPage, pages) => ({ totalPages, currentPage, pages });
const view = pages => pages.map(row => `${row.pageNumber}:${row.status}:${row.note}:${row.title ?? ""}`).join(" | ");

test("the summary counts pages inside the total and falls back to the last page that was worked on", () => {
  const summary = tracker.getBomPageTrackerSummary({ totalPages: 5, currentPage: 0, pages: [page(1, "done"), page(2, "done_missing", "缺 U23"), page(4, "pending", "先記一筆"), page(9, "done")] });
  assert.equal(summary.completedPages, 2); assert.equal(summary.missingPages, 1); assert.equal(summary.pendingPages, 3);
  assert.equal(summary.currentPage, 5, "page 9 was worked on, and the current page never exceeds the total");
  assert.equal(tracker.getBomPageTrackerSummary({ totalPages: 5, currentPage: 2, pages: [page(4, "done")] }).currentPage, 2, "an explicit current page wins");
  assert.equal(tracker.getBomPageTrackerSummary(undefined).totalPages, 0);
  assert.equal(tracker.clampBomTrackerPageCount(9999), tracker.MAX_BOM_TRACKER_PAGES);
});

test("adding pages keeps the entries that already exist, so only new rows have to render", () => {
  const first = page(1, "done", "保留"), late = page(7, "done_missing", "頁數調小後仍保留");
  const pages = [first, late];
  const extended = tracker.extendBomTrackerPages(pages, 4);
  assert.equal(view(extended), "1:done:保留: | 2:pending:: | 3:pending:: | 4:pending:: | 7:done_missing:頁數調小後仍保留:");
  assert.equal(extended[0], first); assert.equal(extended[4], late);
  assert.equal(tracker.extendBomTrackerPages(extended, 3), extended, "nothing to add returns the same list");
});

test("only what differs from the loaded document counts as an unsaved change", () => {
  const base = draft(3, 1, [page(1, "done"), page(2), page(3, "pending", "", "CLOCK")]);
  assert.deepEqual({ ...tracker.countBomPageTrackerChanges(base, draft(3, 1, [page(1, "done"), page(2, "pending", ""), page(3, "pending", "", "CLOCK")])) }, { pages: 0, settings: false });
  assert.deepEqual({ ...tracker.countBomPageTrackerChanges(base, draft(3, 1, [page(1, "done"), page(2), page(3, "pending", "", "CLOCK"), page(4)])) }, { pages: 0, settings: false }, "a blank page that was only listed is not a change");
  assert.deepEqual({ ...tracker.countBomPageTrackerChanges(base, draft(4, 2, [page(1, "pending"), page(2, "pending", "備註"), page(3, "pending", "", "CLOCK TREE")])) }, { pages: 3, settings: true });
});

test("saving rebases the draft: my pages stay mine, a colleague's pages are not undone", () => {
  const base = draft(4, 1, [page(1, "done"), page(2), page(3), page(4)]);
  const mine = draft(4, 3, [page(1, "done"), page(2), page(3, "done_missing", "缺 U23"), page(4)]);
  const latest = draft(4, 2, [page(1, "done"), page(2, "done", "同事完成"), page(3), page(4, "pending", "", "同事補的標題")]);
  const merged = tracker.mergeBomPageTracker(base, mine, latest);
  assert.equal(view(merged.pages), "1:done:: | 2:done:同事完成: | 3:done_missing:缺 U23: | 4:pending::同事補的標題");
  assert.equal(merged.currentPage, 3, "I moved the current page, so mine is kept");
  assert.equal(tracker.mergeBomPageTracker(base, { ...mine, currentPage: 1 }, latest).currentPage, 2, "I did not move it, so the colleague's is kept");
  // The same page edited on both sides: the one being saved now wins, and only for that page.
  const clash = tracker.mergeBomPageTracker(base, draft(4, 1, [page(1, "done"), page(2, "done_missing", "我的"), page(3), page(4)]), latest);
  assert.equal(view(clash.pages), "1:done:: | 2:done_missing:我的: | 3:pending:: | 4:pending::同事補的標題");
});

test("the total follows whoever changed it, and an empty stored document does not erase the draft", () => {
  const base = draft(4, 0, [page(1), page(2), page(3), page(4)]);
  const grown = tracker.mergeBomPageTracker(base, draft(4, 0, base.pages), draft(6, 0, [...base.pages, page(5, "done"), page(6)]));
  assert.equal(grown.totalPages, 6); assert.equal(grown.pages.length, 6); assert.equal(grown.pages[4].status, "done");
  const mine = tracker.mergeBomPageTracker(base, draft(56, 0, tracker.extendBomTrackerPages(base.pages, 56)), draft(4, 0, base.pages));
  assert.equal(mine.totalPages, 56); assert.equal(mine.pages.length, 56);
  const first = tracker.mergeBomPageTracker(draft(0, 0, []), draft(3, 2, [page(1, "done"), page(2, "done"), page(3)]), draft(0, 0, []));
  assert.equal(view(first.pages), "1:done:: | 2:done:: | 3:pending::"); assert.equal(first.currentPage, 2);
  const lost = tracker.mergeBomPageTracker(draft(2, 1, [page(1, "done", "原備註"), page(2)]), draft(2, 1, [page(1, "done", "原備註"), page(2, "done")]), draft(0, 0, []));
  assert.equal(view(lost.pages.filter(row => row.pageNumber <= 2)), "1:done:原備註: | 2:done::", "pages I did not touch survive when nothing is stored any more");
  assert.equal(tracker.mergeBomPageTracker(base, draft(2, 9, base.pages), draft(4, 0, base.pages)).currentPage, 2, "the current page stays inside the total");
});

test("the filter matches status and page number, title or note, and never shows pages beyond the total", () => {
  const pages = [page(1, "done", "", "POWER"), page(2, "done_missing", "缺 U23", "CLOCK"), page(3, "pending", "", "power sequence"), page(12, "done", "超出總頁數")];
  const numbers = (filters) => tracker.filterBomTrackerPages(pages, 3, filters).map(row => row.pageNumber).join();
  assert.equal(numbers({ query: "", status: "all" }), "1,2,3");
  assert.equal(numbers({ query: "", status: "done_missing" }), "2");
  assert.equal(numbers({ query: "power", status: "all" }), "1,3");
  assert.equal(numbers({ query: "u23", status: "all" }), "2");
  assert.equal(numbers({ query: "第 2 頁", status: "all" }), "2");
  assert.equal(numbers({ query: "POWER", status: "pending" }), "3");
  assert.equal(numbers({ query: "不存在", status: "all" }), "");
});

test("a POWER marker is saved independently of completion, current page and text filters", () => {
  const marked = { ...page(3, "pending", "", "CPU"), power: true };
  const pages = [page(1, "done"), page(2, "pending", "", "POWER"), marked, { ...page(9), power: true }];
  const summary = tracker.getBomPageTrackerSummary({ totalPages: 3, pages });
  assert.equal(summary.completedPages, 1);
  assert.equal(summary.currentPage, 1);
  assert.equal(summary.pages[2].power, true);
  assert.equal(summary.pages[3].power, true, "reducing the total does not discard the later page's marker");
  assert.equal(tracker.filterBomTrackerPages(pages, 3, { query: "cpu", status: "pending", powerOnly: true })[0], marked);
  assert.equal(tracker.filterBomTrackerPages(pages, 3, { query: "", status: "all", powerOnly: true }).length, 1);
});

test("POWER additions and removals rebase independently from the same page's progress", () => {
  const starting = draft(1, 0, [page(1)]);
  const tagged = draft(1, 0, [{ ...page(1), power: true }]);
  const completed = draft(1, 1, [page(1, "done", "同事完成", "CPU")]);
  const latestTagged = tracker.mergeBomPageTracker(starting, tagged, completed);
  assert.equal(latestTagged.pages[0].power, true);
  assert.equal(view(latestTagged.pages), view(completed.pages));
  assert.equal(latestTagged.currentPage, 1);
  const mergedProgress = tracker.mergeBomPageTracker(starting, completed, tagged);
  assert.equal(mergedProgress.pages[0].power, true);
  assert.equal(view(mergedProgress.pages), view(completed.pages));
  const removed = tracker.mergeBomPageTracker(tagged, starting, latestTagged);
  assert.equal("power" in removed.pages[0], false);
  assert.equal(view(removed.pages), view(completed.pages));
  assert.equal(tracker.countBomPageTrackerChanges(starting, tagged).pages, 1);
  assert.equal(tracker.countBomPageTrackerChanges(tagged, starting).pages, 1);
  assert.equal(tracker.countBomPageTrackerChanges(starting, draft(1, 0, [{ ...page(1), power: false }])).pages, 0);
});

// 2026-11-21: the same board showed 90 % on V1 and 60 % on V2 with the same number of pages, because every version kept
// its own copy. The board now has one page progress; copies that drifted apart are read as one.
test("the board's versions read as one page progress: any finished page counts, the newest copy leads", () => {
  const done = (count, total = 60) => Array.from({ length: total }, (_, index) => page(index + 1, index < count ? "done" : "pending"));
  const v1 = { totalPages: 60, currentPage: 54, updatedAt: "2026-11-20T09:00:00.000Z", pages: done(54) };
  const v2 = { totalPages: 60, currentPage: 36, updatedAt: "2026-11-17T07:31:00.000Z", pages: done(36) };
  const board = tracker.combineBomPageTrackers([v2, v1]);
  assert.equal(tracker.getBomPageTrackerSummary(board).completedPages, 54, "V1's 54 pages, not V2's 36");
  assert.equal(board.totalPages, 60); assert.equal(board.currentPage, 54); assert.equal(board.updatedAt, v1.updatedAt);
  assert.equal(tracker.combineBomPageTrackers([v1]), v1, "one copy is used as it is");
  assert.equal(tracker.combineBomPageTrackers([undefined, v1, undefined]), v1);
  assert.equal(tracker.combineBomPageTrackers([]), undefined);
  assert.equal(tracker.combineBomPageTrackers([{ ...v1, updatedAt: "2026-11-01T00:00:00.000Z" }, v1]), v1, "copies that agree give back the newest object");
});

test("combining keeps every copy's work: the newest finished status, the first title and note, POWER from any copy", () => {
  const newest = { totalPages: 4, currentPage: 2, updatedAt: "2026-11-20T00:00:00.000Z", pages: [page(1, "done_missing", "缺 U23"), page(2, "pending", "", "CLOCK"), page(3), page(4)] };
  const older = { totalPages: 3, currentPage: 3, updatedAt: "2026-11-18T00:00:00.000Z", pages: [page(1, "done", "舊備註"), page(2, "done", "舊的第二頁", "舊標題"), { ...page(3, "done", "", "POWER IN"), power: true }] };
  const board = tracker.combineBomPageTrackers([older, newest]);
  assert.equal(view(board.pages), "1:done_missing:缺 U23: | 2:done:舊的第二頁:CLOCK | 3:done::POWER IN | 4:pending::");
  assert.equal(board.pages[2].power, true);
  assert.equal(board.totalPages, 4, "the newest copy's total");
  assert.equal(board.currentPage, 3, "the furthest page work reached");
  const noTotal = tracker.combineBomPageTrackers([{ totalPages: 0, currentPage: 0, updatedAt: "2026-11-21T00:00:00.000Z", pages: [] }, older]);
  assert.equal(noTotal.totalPages, 3, "a newer copy without pages does not erase an older one");
  const shrunk = tracker.combineBomPageTrackers([{ totalPages: 2, currentPage: 0, updatedAt: "2026-11-21T00:00:00.000Z", pages: [page(1, "done")] }, { totalPages: 5, currentPage: 0, updatedAt: "2026-11-01T00:00:00.000Z", pages: [page(1), page(2), page(3), page(4, "pending", "第 4 頁備註"), page(5)] }]);
  assert.equal(view(shrunk.pages), "1:done:: | 2:pending:: | 4:pending:第 4 頁備註:", "past the total only pages that hold something are kept");
});

test("two copies are the same when pages, total and current page match, whatever their saved time", () => {
  const one = { totalPages: 2, currentPage: 1, updatedAt: "2026-11-20T00:00:00.000Z", pages: [page(1, "done"), page(2)] };
  assert.equal(tracker.sameBomPageTracker(one, { ...one, updatedAt: "2026-01-01T00:00:00.000Z", pages: [page(1, "done")] }), true);
  assert.equal(tracker.sameBomPageTracker(one, { ...one, pages: [page(1, "done"), page(2, "done")] }), false);
  assert.equal(tracker.sameBomPageTracker(one, undefined), false);
  assert.equal(tracker.sameBomPageTracker(undefined, undefined), true);
});
