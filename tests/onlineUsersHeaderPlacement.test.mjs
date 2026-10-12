import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const headerSourceUrl = new URL(
  "../src/components/layout/MainWorkspaceHeader.tsx",
  import.meta.url,
);
const indicatorSourceUrl = new URL(
  "../src/components/common/CollaborationIndicator.tsx",
  import.meta.url,
);
const indexSourceUrl = new URL("../src/pages/Index.tsx", import.meta.url);

test("online users indicator is rendered inside the workspace header", async () => {
  const [headerSource, indexSource] = await Promise.all([
    readFile(headerSourceUrl, "utf8"),
    readFile(indexSourceUrl, "utf8"),
  ]);

  assert.match(headerSource, /<CollaborationIndicator showNotifications=\{showNotifications\} showOnlineUsers=\{showOnlineUsers\}/);
  assert.doesNotMatch(indexSource, /<OnlineUsersIndicator\s*\/>/);
});

test("online users control stays aligned with the fixed header control height", async () => {
  const [headerSource, indicatorSource, styles] = await Promise.all([
    readFile(headerSourceUrl, "utf8"),
    readFile(indicatorSourceUrl, "utf8"),
    readFile(new URL("../src/index.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(indicatorSource, /fixed bottom-4 right-4/);
  assert.match(indicatorSource, /data-collaboration-entry="combined"/);
  assert.match(styles, /--platform-control-height: 2\.75rem/);
  assert.match(styles, /\[data-platform-controls='top-right'\] button/);
  assert.match(
    headerSource,
    /showNotifications \|\| showOnlineUsers/,
  );
});

test("desktop navigation stays on one row and moves overflow into More", async () => {
  const source = await readFile(headerSourceUrl, "utf8");
  assert.match(source, /lg:grid-cols-\[auto_minmax\(0,1fr\)_auto\]/);
  assert.match(source, /overflowItems\.map/);
  assert.match(source, /compactItems\.push\(activeCompactItem\)/);
  assert.doesNotMatch(source, /order-3 col-span-2/);
});
