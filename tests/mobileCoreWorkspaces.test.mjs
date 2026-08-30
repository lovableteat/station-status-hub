import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("mobile header exposes a bundled website QR and a thumb-friendly workspace dock", async () => {
  const [header, qr, dock, index, toast, sonner] = await Promise.all([
    read("src/components/layout/MainWorkspaceHeader.tsx"),
    read("src/components/layout/WebsiteQrButton.tsx"),
    read("src/components/layout/MobileWorkspaceDock.tsx"),
    read("src/pages/Index.tsx"),
    read("src/components/ui/toast.tsx"),
    read("src/components/ui/sonner.tsx"),
  ]);

  assert.match(header, /<WebsiteQrButton \/>/);
  assert.match(header, /hidden w-full[\s\S]*lg:flex/);
  assert.match(qr, /platform-mobile-qr\.svg/);
  assert.match(qr, /https:\/\/lovableteat\.github\.io\/station-status-hub\//);
  assert.match(qr, /複製連結/);
  assert.match(qr, /navigator\.share/);
  assert.match(qr, /document\.execCommand\("copy"\)/);
  assert.match(qr, /AbortError/);
  assert.match(dock, /data-mobile-workspace-dock="true"/);
  assert.match(dock, /workspace-home/);
  assert.match(dock, /station-status/);
  assert.match(dock, /material-requests/);
  assert.match(dock, /ai-chat/);
  assert.match(dock, /safe-area-inset-bottom/);
  assert.match(dock, /z-40/);
  assert.match(index, /<MobileWorkspaceDock/);
  assert.match(toast, /w-\[min\(250px,calc\(100%-7\.5rem\)\)\]/);
  assert.match(toast, /sm:left-auto sm:right-0/);
  assert.match(sonner, /max-sm:!w-\[min\(250px,calc\(100vw-7\.5rem\)\)\]/);
});

test("maintenance center keeps compact module navigation visible in a wrapped grid", async () => {
  const [sidebar, scopeBar, hook] = await Promise.all([
    read("src/components/layout/Sidebar.tsx"),
    read("src/components/test-projects/ProjectScopeBar.tsx"),
    read("src/hooks/use-mobile.tsx"),
  ]);

  assert.match(sidebar, /data-mobile-maintenance-nav="true"/);
  assert.match(sidebar, /grid-cols-2/);
  assert.doesNotMatch(sidebar, /overflow-x-auto/);
  assert.match(sidebar, /aria-current=\{isActive \? "page"/);
  assert.match(scopeBar, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(scopeBar, /data-mobile-project-primary-actions="true"/);
  assert.match(hook, /COMPACT_LAYOUT_BREAKPOINT = 1024/);
  assert.match(hook, /useIsCompactLayout/);
});

test("AI query workspace uses the available mobile height and keeps every composer action reachable", async () => {
  const [page, consoleSource, index] = await Promise.all([
    read("src/components/api-management/ApiChatWorkspacePage.tsx"),
    read("src/components/api-management/ApiChatConsole.tsx"),
    read("src/pages/Index.tsx"),
  ]);

  assert.match(page, /className="h-full min-h-0/);
  assert.doesNotMatch(page, /100dvh-9\.75rem/);
  assert.match(page, /data-ai-chat-workspace="viewport-fit"/);
  assert.match(index, /activeWorkspace === "ai-chat" && "h-\[100dvh\] overflow-hidden"/);
  assert.match(consoleSource, /data-ai-chat-shell="viewport-fit"/);
  assert.match(consoleSource, /"grid h-full min-h-0 w-full items-stretch gap-2 lg:gap-4"/);
  assert.doesNotMatch(consoleSource, /lg:h-\[calc\(100dvh-164px\)\]/);
  assert.match(consoleSource, /mobileSidebarOpen/);
  assert.match(consoleSource, /關閉資料查詢選單/);
  assert.match(consoleSource, /最近對話/);
  assert.match(consoleSource, /fixed inset-x-3[\s\S]*lg:static/);
  assert.match(consoleSource, /grid-cols-\[44px_minmax\(0,1fr\)_44px\]/);
  assert.match(consoleSource, /data-mobile-ai-command-bar="true"/);
  assert.match(consoleSource, /data-mobile-ai-composer="true"/);
  assert.match(consoleSource, /min-h-10 max-h-24/);
  assert.match(consoleSource, /placeholder="輸入問題"/);
  assert.match(consoleSource, /開啟共享提示詞庫/);
  assert.match(consoleSource, /aria-label="上傳 PDF、PPT、Excel、Word 或圖片"/);
});

test("material requests render actionable cards on compact screens and preserve the desktop table", async () => {
  const source = await read("src/components/material-requests/MaterialRequestPage.tsx");

  assert.match(source, /data-testid="material-mobile-cards"/);
  assert.match(source, /lg:hidden/);
  assert.match(source, /hidden border-t border-\[#2a526f\] lg:block/);
  assert.match(source, /手機以料件卡片呈現/);
  assert.match(source, /openRecord\(mainRecord, "view"\)/);
  assert.match(source, /openTrackingDialog\(trackingRecord\)/);
  assert.match(source, /openCreate\(group\)/);
  assert.match(source, /toggleMarkedGroup\(group\.key\)/);
  assert.match(source, /aria-label=\{isSearchPending \? "搜尋中" : "搜尋"\}/);
});

test("direct chat becomes full-screen on phones and respects the keyboard safe area", async () => {
  const [center, panel] = await Promise.all([
    read("src/components/collaboration/CollaborationCenter.tsx"),
    read("src/components/collaboration/DirectMessagesPanel.tsx"),
  ]);

  assert.match(center, /fixed inset-0 flex h-\[100dvh\] w-screen/);
  assert.match(center, /bottom-\[calc\(var\(--mobile-shell-bottom\)\+0\.5rem\)\]/);
  assert.match(panel, /env\(safe-area-inset-bottom\)/);
  assert.match(panel, /aria-label="加入圖片或影片"/);
  assert.match(panel, /accept=\{CHAT_MEDIA_ACCEPT\}/);
  assert.match(panel, /multiple/);
  assert.match(panel, /h-11 w-11 rounded-2xl[^"]*sm:h-10 sm:w-10/);
  assert.match(panel, /h-11 w-11 rounded-xl[^"]*sm:h-9 sm:w-9/);
  assert.match(panel, /flex h-10 items-center gap-1\.5[^"]*sm:h-7/);
  assert.match(panel, /flex h-10 w-10 items-center[^"]*sm:h-7 sm:w-7/);
  assert.match(panel, /aria-label=\{isSendingMedia \? "訊息傳送中" : "送出訊息"\}/);
});

test("issue tracking replaces the wide table with actionable cards on compact screens", async () => {
  const source = await read("src/components/issues/IssueTableView.tsx");

  assert.match(source, /data-testid="issue-mobile-cards"/);
  assert.match(source, /className="grid gap-2\.5[^"]*lg:hidden"/);
  assert.match(source, /hidden max-h-\[calc\(100vh-350px\)\] overflow-auto lg:block/);
  assert.match(source, /onClick=\{\(\) => handleView\(issue\)\}/);
  assert.match(source, /onClick=\{\(\) => handleEdit\(issue\)\}/);
  assert.match(source, /setAttachmentPreview\(issue.attachments \|\| \[\]\)/);
});
