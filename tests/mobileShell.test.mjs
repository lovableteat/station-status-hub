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
