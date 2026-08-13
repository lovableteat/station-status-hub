import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("mobile header exposes a bundled website QR and a thumb-friendly workspace dock", async () => {
  const [header, qr, dock, index] = await Promise.all([
    read("src/components/layout/MainWorkspaceHeader.tsx"),
    read("src/components/layout/WebsiteQrButton.tsx"),
    read("src/components/layout/MobileWorkspaceDock.tsx"),
    read("src/pages/Index.tsx"),
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
  assert.match(index, /<MobileWorkspaceDock/);
});

test("maintenance center switches compact layouts to a scrollable module toolbar", async () => {
  const [sidebar, scopeBar, hook] = await Promise.all([
    read("src/components/layout/Sidebar.tsx"),
    read("src/components/test-projects/ProjectScopeBar.tsx"),
    read("src/hooks/use-mobile.tsx"),
  ]);

  assert.match(sidebar, /data-mobile-maintenance-nav="true"/);
  assert.match(sidebar, /overflow-x-auto/);
  assert.match(sidebar, /aria-current=\{isActive \? "page"/);
  assert.match(scopeBar, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(scopeBar, /grid-cols-3/);
  assert.match(hook, /COMPACT_LAYOUT_BREAKPOINT = 1024/);
  assert.match(hook, /useIsCompactLayout/);
});

test("AI query workspace uses a mobile history drawer and a compact fixed-height composer", async () => {
  const [page, consoleSource] = await Promise.all([
    read("src/components/api-management/ApiChatWorkspacePage.tsx"),
    read("src/components/api-management/ApiChatConsole.tsx"),
  ]);

  assert.match(page, /h-\[calc\(100dvh-9\.75rem-env\(safe-area-inset-bottom\)\)\]/);
  assert.match(consoleSource, /mobileSidebarOpen/);
  assert.match(consoleSource, /關閉資料查詢選單/);
  assert.match(consoleSource, /最近對話/);
  assert.match(consoleSource, /fixed inset-x-3[\s\S]*lg:static/);
  assert.match(consoleSource, /min-h-\[52px\]/);
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
  assert.match(center, /bottom-\[calc\(5\.25rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(panel, /env\(safe-area-inset-bottom\)/);
  assert.match(panel, /aria-label="加入圖片或影片"/);
  assert.match(panel, /accept=\{CHAT_MEDIA_ACCEPT\}/);
  assert.match(panel, /multiple/);
  assert.match(panel, /aria-label=\{isSendingMedia \? "訊息傳送中" : "送出訊息"\}/);
});
