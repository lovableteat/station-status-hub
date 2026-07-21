import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("tools workspace exposes a dedicated source code repository", async () => {
  const workspace = await read("../src/components/tools/ToolsManagement.tsx");
  const repository = await read("../src/components/tools/CodeStorageManager.tsx");

  assert.match(workspace, /value="code-library"/);
  assert.match(workspace, /程式碼儲存庫/);
  assert.match(repository, /downloadCodeFile/);
  assert.match(repository, /下載程式檔/);
  assert.match(repository, /wrap="off"/);
  assert.match(repository, /whitespace-pre/);
});

test("collapsed maintenance sidebar uses one centered icon frame", async () => {
  const sidebar = await read("../src/components/layout/Sidebar.tsx");

  assert.match(sidebar, /isCompact \? "mx-auto grid h-10 w-10 place-items-center p-0"/);
  assert.match(sidebar, /className="h-5 w-5 shrink-0"/);
  assert.match(sidebar, /isCompact && "justify-center px-0"/);
});

test("shared prompt library supports scalable management controls", async () => {
  const consoleSource = await read("../src/components/api-management/ApiChatConsole.tsx");

  assert.match(consoleSource, /promptLibraryCategory/);
  assert.match(consoleSource, /promptLibrarySort/);
  assert.match(consoleSource, /promptLibraryPage/);
  assert.match(consoleSource, /編輯提示詞/);
  assert.match(consoleSource, /每頁/);
});

test("AI messages render ordered clipboard attachments inside their original text position", async () => {
  const consoleSource = await read("../src/components/api-management/ApiChatConsole.tsx");

  assert.match(consoleSource, /splitContentByAttachmentMarkers/);
  assert.match(consoleSource, /composeClipboardContent/);
  assert.match(consoleSource, /attachmentIndex/);
  assert.match(consoleSource, /貼上圖片/);
});
