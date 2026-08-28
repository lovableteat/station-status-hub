import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const entranceSource = await read("src/components/layout/WorkspaceEntrance.tsx");
const dockSource = await read("src/components/layout/MobileWorkspaceDock.tsx");
const globalCssSource = await read("src/index.css");

test("uses a dedicated phone workspace list without replacing the desktop grid", () => {
  assert.match(entranceSource, /data-testid="workspace-entrance-mobile-list"/);
  assert.match(entranceSource, /workspace-entrance-mobile-list[^\n]*md:hidden/);
  assert.match(entranceSource, /hidden flex-1 gap-3 md:grid/);
  assert.match(entranceSource, /我的工作區/);
  assert.match(entranceSource, /data-workspace-id=\{item\.id\}/);
  assert.match(entranceSource, /workspace-entrance-mobile-chevron/);
  assert.match(entranceSource, /"station-status": "機台維修"/);
  assert.match(entranceSource, /"data-center": "Data Center"/);
});

test("keeps the five-destination mobile dock and an accessible more sheet", () => {
  for (const label of ["首頁", "維修", "料號", "查詢", "更多"]) {
    assert.match(dockSource, new RegExp(label));
  }
  assert.match(dockSource, /data-mobile-dock-item="true"/);
  assert.match(dockSource, /data-mobile-dock-id=\{item\.id\}/);
  assert.match(dockSource, /aria-label="關閉更多工作區"/);
  assert.match(dockSource, /data-mobile-more-item="true"/);
});

test("scopes the new shell tokens and surfaces to phone widths", () => {
  assert.match(globalCssSource, /@media \(max-width: 767px\)[\s\S]*--mobile-header-height: 76px/);
  assert.match(globalCssSource, /@media \(max-width: 767px\)[\s\S]*--mobile-dock-height: 74px/);
  assert.match(globalCssSource, /--mobile-active: #6794df/);
  assert.match(globalCssSource, /\[data-mobile-workspace-dock="true"\][\s\S]*background: rgb\(7 21 34/);
  assert.match(globalCssSource, /\[data-mobile-more-sheet="true"\][\s\S]*border-top-left-radius: 2rem/);
  assert.match(globalCssSource, /\.workspace-entrance-mobile-row\[data-workspace-id="station-status"\]/);
  assert.match(globalCssSource, /@media \(max-width: 359px\)[\s\S]*min-height: 68px/);
});
