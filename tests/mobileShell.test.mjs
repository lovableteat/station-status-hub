import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8").then((text) => text.replace(/\r\n/g, "\n"));

test("phone shell sizes are defined once per tier and never hard-coded", async () => {
  const [css, chat, pcb] = await Promise.all([read("src/index.css"), read("src/components/api-management/ApiChatConsole.tsx"), read("src/components/pcb-designer/pcb-designer.css")]);
  const headers = css.match(/--mobile-header-height:\s*\d+px/g) ?? [];
  const docks = css.match(/--mobile-dock-height:\s*\d+px/g) ?? [];
  assert.deepEqual(headers, ["--mobile-header-height: 52px", "--mobile-header-height: 64px"], "tablet tier in :root, phone tier in the 767px block");
  assert.deepEqual(docks, ["--mobile-dock-height: 56px", "--mobile-dock-height: 64px"]);
  assert.doesNotMatch(chat, /top-\[76px\]/);
  assert.match(chat, /top-\[var\(--mobile-header-height\)\]/);
  assert.doesNotMatch(pcb, /calc\(76px \+/);
  assert.match(pcb, /calc\(var\(--mobile-header-height\) \+ env\(safe-area-inset-top\)\)/);
});

test("toasts sit above the dock on phones instead of over the header", async () => {
  const [css, toast] = await Promise.all([read("src/index.css"), read("src/components/ui/toast.tsx")]);
  assert.match(toast, /data-ui="toast-viewport"/);
  const block = css.slice(css.indexOf("Mobile shell: feedback placement"));
  assert.match(block, /@media \(max-width: 1023px\)/);
  assert.match(block, /\[data-ui='toast-viewport'\] \{ top: auto; bottom: calc\(var\(--mobile-shell-bottom\) \+ 12px\)/);
  assert.match(block, /\[data-sonner-toaster\] \{ top: auto !important; bottom: calc\(var\(--mobile-shell-bottom\) \+ 12px\) !important/);
  assert.match(block, /body:has\(\[data-ai-chat-shell\]\) \[data-ui='toast-viewport'\] \{ bottom: calc\(var\(--mobile-shell-bottom\) \+ 188px\)/);
});

test("shared phone components exist with the agreed anatomy and 44px targets", async () => {
  const [bar, sheet, filter, card, barrel, css] = await Promise.all([
    read("src/components/layout/mobile/MobileCommandBar.tsx"),
    read("src/components/layout/mobile/MobileToolsSheet.tsx"),
    read("src/components/layout/mobile/MobileFilterBar.tsx"),
    read("src/components/layout/mobile/MobileRecordCard.tsx"),
    read("src/components/layout/mobile/index.ts"),
    read("src/index.css"),
  ]);
  assert.match(bar, /data-mobile-command-bar="true"/);
  assert.match(bar, /actions\.slice\(0, 2\)/, "at most two primary actions");
  assert.match(bar, /data-mobile-command-tools="true"/);
  assert.match(bar, /lg:hidden/);
  assert.match(sheet, /data-mobile-tools-sheet="true"/);
  assert.match(sheet, /aria-label=\{`關閉\$\{title\}`\}/);
  assert.match(sheet, /if \(!item\.keepOpen\) onOpenChange\(false\)/);
  assert.match(filter, /data-mobile-filter-bar="true"/);
  assert.match(filter, /enterKeyHint="search"/);
  assert.match(filter, /aria-label=\{`移除篩選：\$\{chip\.label\}`\}/);
  assert.match(filter, />全部清除</);
  assert.match(card, /data-mobile-record-card="true"/);
  assert.match(card, /actions\.slice\(0, 2\)/);
  assert.match(card, /moreLabel = "更多"/);
  for (const name of ["MobileCommandBar", "MobileToolsSheet", "MobileFilterBar", "MobileRecordCard"]) assert.match(barrel, new RegExp(name));
  for (const rule of [".mobile-command-bar__action { min-height: 44px; height: 44px", ".mobile-tools-sheet__item { display: flex; min-height: 48px", ".mobile-filter-bar__input { height: 44px", ".mobile-record-card__action { min-height: 44px; height: 44px", ".mobile-tools-sheet__close { position: absolute; right: var(--mobile-page-gutter); top: 0; display: grid; place-items: center; width: 44px; height: 44px"]) {
    assert.ok(css.includes(rule), rule);
  }
});

test("MobileDialog offers a full-height phone form with a fixed footer and one scrolling body", async () => {
  const dialog = await read("src/components/ui/mobile-dialog.tsx");
  assert.match(dialog, /fullHeight\?: boolean/);
  assert.match(dialog, /data-mobile-form=\{isMobile && fullHeight \? "true" : undefined\}/);
  assert.match(dialog, /const MobileDialogBody = /);
  assert.match(dialog, /data-mobile-form-body="true"/);
  assert.match(dialog, /data-mobile-form-footer=\{isMobile \? "true" : undefined\}/);
  assert.match(dialog, /\[&>\*\]:min-h-11 \[&>\*\]:flex-1/);
  assert.match(dialog, /MobileDialogBody,\n  MobileDialogFooter,/);
});

test("the dock only lists destinations that can actually render", async () => {
  const [dock, index] = await Promise.all([read("src/components/layout/MobileWorkspaceDock.tsx"), read("src/pages/Index.tsx")]);
  assert.match(index, /workspaceItems\.filter\(\(item\) => item\.id !== "user-management"\)/);
  assert.doesNotMatch(dock, /id: "user-management"/, "後台管理 stays in the account menu, so the sheet must not advertise it");
  assert.doesNotMatch(dock, /ShieldCheck/);
});

test("AutoCheck on phones uses the tools sheet and result cards with the same empty text and filters", async () => {
  const [workspace, results, css] = await Promise.all([read("src/components/comparison/ComparisonWorkspace.tsx"), read("src/components/comparison/ComparisonResults.tsx"), read("src/components/comparison/comparison.css")]);
  assert.doesNotMatch(workspace, /<Popover>/, "header tools are a bottom sheet, not a popover");
  assert.match(workspace, /data-testid="comparison-mobile-tools-trigger"/);
  assert.match(workspace, /<MobileToolsSheet testId="comparison-mobile-tools"/);
  assert.match(workspace, /<ComparisonGuide \/><ComparisonFeedback/, "guide, feedback, backups and engine settings keep their handlers inside the sheet");
  assert.match(results, /const showCards = compact && mobileView === "cards";/);
  assert.match(results, /data-testid="comparison-result-cards"/);
  assert.match(results, /aria-label="結果呈現方式"/);
  assert.ok(results.indexOf('className="comparison-filterbar"') < results.indexOf('data-testid="comparison-result-cards"'), "the persistent filter bar stays above the cards");
  assert.equal((results.match(/目前篩選條件沒有符合的比對結果/g) ?? []).length, 1, "cards and table share one empty-state string");
  assert.match(css, /\.comparison-filterbar \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.comparison-result-cards \{ display: grid/);
});

test("admin and performance get the shared phone command bar and tools sheet; PCB drops its dead advisory styles", async () => {
  const [admin, perf, pcbCss, adminTest] = await Promise.all([read("src/components/admin/AdminPanel.tsx"), read("src/components/performance/PerformanceAppraisalPage.tsx"), read("src/components/pcb-designer/pcb-designer.css"), read("tests/adminControlRoomUi.test.mjs")]);
  assert.match(admin, /testId="admin-mobile-bar"/);
  assert.match(admin, /testId="admin-mobile-tools"/);
  assert.match(admin, /actions=\{activeTab === "users" \? \[\{ key: "create", label: "新增帳號"/);
  assert.match(admin, /data-admin-zone="command"/, "the desktop header stays for the existing contract");
  assert.match(adminTest, /data-admin-zone="command"/);
  assert.match(perf, /testId="performance-mobile-bar"/);
  assert.match(perf, /const navItems = NAV\.filter/);
  assert.match(perf, /\{navItems\.map\(/);
  assert.doesNotMatch(pcbCss, /pcb-mobile-advisory/);
});

test("the phone home shows real unresolved issues and two-column workspaces without adding desktop work", async () => {
  const [entrance, tasks, index, css] = await Promise.all([read("src/components/layout/WorkspaceEntrance.tsx"), read("src/components/layout/mobile/MobileHomeTasks.tsx"), read("src/pages/Index.tsx"), read("src/index.css")]);
  assert.match(entrance, /window\.matchMedia\("\(max-width: 767px\)"\)/);
  assert.match(entrance, /\{isPhone && showIssues && onOpenIssue && onOpenIssues && <MobileHomeTasks/, "only a phone with issue access mounts the read");
  assert.match(entrance, /hidden content-start gap-3 md:grid/, "the desktop grid is unchanged");
  assert.match(index, /showIssues=\{canViewModule\("issues"\)\}/);
  assert.match(index, /handleStationNavigation\("issues", \{ openIssue: issueId \}\)/);
  assert.match(tasks, /calculateIssueDashboardMetrics/, "the same ordering as the dashboard");
  assert.match(tasks, /目前沒有待處理問題/);
  assert.match(tasks, /問題清單暫時載入失敗/);
  const block = css.slice(css.indexOf("Phone home (2026-11-05)"));
  assert.match(block, /^[^\n]*\n@media \(max-width: 767px\)|@media \(max-width: 767px\) \{/);
  assert.match(block, /\.workspace-entrance-mobile-list \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(block, /\.mobile-home-issue \{ display: flex; align-items: center; gap: 10px; width: 100%; min-height: 60px/);
});
