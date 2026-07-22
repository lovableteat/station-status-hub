import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/components/material-requests/MaterialRequestPage.tsx", import.meta.url);
const source = await readFile(sourceUrl, "utf8");

test("material search controls are contained by the material table card", () => {
  const cardStart = source.indexOf('data-testid="material-table-card"');
  const headingStart = source.indexOf("<h2", cardStart);
  const headingEnd = source.indexOf("料號總表", headingStart);
  const toolbarStart = source.indexOf('data-testid="material-table-toolbar"');
  const tableStart = source.indexOf('data-testid="material-table-scroll"');

  assert.ok(cardStart >= 0, "material table card marker is missing");
  assert.ok(headingStart > cardStart && headingEnd > headingStart, "material table heading is missing");
  assert.ok(toolbarStart > headingEnd, "search toolbar must appear directly below the material table heading");
  assert.ok(toolbarStart > cardStart, "search toolbar must be inside the material table card");
  assert.ok(tableStart > toolbarStart, "search toolbar must appear above the material table");
});

test("compact hover previews stay on one line", () => {
  const compactHoverBlock = source.match(/function CompactHoverValue\([\s\S]*?\r?\n}\r?\n\r?\nfunction/)?.[0] ?? "";

  assert.match(compactHoverBlock, /data-testid="compact-hover-trigger"/);
  assert.match(compactHoverBlock, /className="[^"]*inline-flex[^"]*items-center[^"]*"/);
  assert.match(
    source,
    /data-testid="compact-hover-preview"[^>]*className=\{cn\("block min-w-0 flex-1 truncate whitespace-nowrap"/,
  );
});

test("REF DES previews show one value before the remaining item count", () => {
  const refDesBlocks = [...source.matchAll(/<CompactHoverValue\s+label="REF DES"[\s\S]*?\/>/g)]
    .map((match) => match[0]);

  assert.ok(refDesBlocks.length >= 2, "expected REF DES previews for primary and alternative rows");
  refDesBlocks.forEach((block) => assert.match(block, /maxItems=\{1\}/));
});

test("material vendor cells keep relation metadata inside the hover card", () => {
  const identityBlock = source.match(
    /function MaterialIdentityHover\([\s\S]*?\r?\n}\r?\n\r?\nfunction MaterialFieldLabel/,
  )?.[0] ?? "";
  const primaryCellBlock = source.match(
    /<td className="relative overflow-hidden[\s\S]*?<\/td>\r?\n\s*<td className="border-r border-blue-400\/10 px-4 py-3 align-middle"/,
  )?.[0] ?? "";

  assert.match(identityBlock, /data-testid="material-identity-trigger"/);
  assert.match(identityBlock, /data-testid="material-primary-name"/);
  assert.match(identityBlock, /data-testid="material-primary-vendor"/);
  assert.match(identityBlock, />REF DES</);
  assert.match(identityBlock, />MPN</);
  assert.match(primaryCellBlock, /<MaterialIdentityHover/);
  assert.doesNotMatch(primaryCellBlock, /group\.displayRef/);
  assert.doesNotMatch(primaryCellBlock, /個 MPN/);
});

test("tracking table summaries remain compact instead of stretching material rows", () => {
  const cellBlock = source.match(
    /function TrackingHistoryCell\([\s\S]*?\r?\n}\r?\n\r?\nfunction TrackingHistoryDialog/,
  )?.[0] ?? "";

  assert.match(cellBlock, /data-testid="tracking-history-cell"/);
  assert.match(cellBlock, /min-h-\[54px\]/);
  assert.doesNotMatch(cellBlock, /h-14 w-1\.5/);
  assert.doesNotMatch(cellBlock, /line-clamp-2/);
});

test("tracking dialog separates current status, update form, history, and footer actions", () => {
  assert.match(source, /data-testid="tracking-current-summary"/);
  assert.match(source, /data-testid="tracking-compose-panel"/);
  assert.match(source, /data-testid="tracking-history-panel"/);
  assert.match(source, /data-testid="tracking-dialog-footer"/);
  assert.match(source, /onPaste=\{handleImagePaste\}/);
});
