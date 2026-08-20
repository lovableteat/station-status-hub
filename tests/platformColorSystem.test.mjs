import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("global theme exposes a restrained multi-color product palette", async () => {
  const styles = await read("../src/index.css");

  for (const token of [
    "--platform-blue",
    "--platform-teal",
    "--platform-green",
    "--platform-amber",
    "--platform-violet",
    "--platform-rose",
  ]) {
    assert.match(styles, new RegExp(`${token}:`));
  }

  assert.match(styles, /\.platform-color-field/);
  assert.match(styles, /\.surface-accent--teal/);
  assert.match(styles, /\.surface-accent--green/);
  assert.match(styles, /\.surface-accent--amber/);
  assert.match(styles, /\.surface-accent--violet/);
  assert.match(styles, /\.surface-accent--rose/);
});

test("main platform surfaces opt into the shared color accents", async () => {
  const [header, entrance, adminStyles] = await Promise.all([
    read("../src/components/layout/MainWorkspaceHeader.tsx"),
    read("../src/components/layout/WorkspaceEntrance.tsx"),
    read("../src/components/admin/admin-panel.css"),
  ]);

  assert.match(header, /platform-color-field/);
  assert.match(entrance, /surface-accent--/);
  assert.match(adminStyles, /--admin-accent-teal/);
  assert.match(adminStyles, /--admin-accent-amber/);
  assert.match(adminStyles, /--admin-accent-violet/);
  assert.match(adminStyles, /--admin-accent-rose/);
  assert.match(adminStyles, /\.admin-api-stat:nth-child\(2\)/);
  assert.match(adminStyles, /\.admin-api-key-panel/);
  assert.match(adminStyles, /--api-teal:\s*#5eead4/);
  assert.match(adminStyles, /--api-amber:\s*#fbbf24/);
  assert.match(adminStyles, /\.admin-api-badge-provider/);
  assert.match(adminStyles, /\.admin-api-action-delete/);
});
