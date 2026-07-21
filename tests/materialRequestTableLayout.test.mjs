import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/components/material-requests/MaterialRequestPage.tsx", import.meta.url);
const source = await readFile(sourceUrl, "utf8");

test("material search controls are contained by the material table card", () => {
  const cardStart = source.indexOf('data-testid="material-table-card"');
  const toolbarStart = source.indexOf('data-testid="material-table-toolbar"');
  const tableStart = source.indexOf('data-testid="material-table-scroll"');

  assert.ok(cardStart >= 0, "material table card marker is missing");
  assert.ok(toolbarStart > cardStart, "search toolbar must be inside the material table card");
  assert.ok(tableStart > toolbarStart, "search toolbar must appear above the material table");
});

test("compact hover previews stay on one line", () => {
  assert.match(
    source,
    /data-testid="compact-hover-preview"[^>]*className=\{cn\("truncate whitespace-nowrap"/,
  );
});

test("REF DES previews show one value before the remaining item count", () => {
  const refDesBlock = source.match(/<CompactHoverValue\s+label="REF DES"[\s\S]*?\/>/)?.[0] ?? "";

  assert.match(refDesBlock, /maxItems=\{1\}/);
});
