import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/components/material-requests/materialRequestExport.ts", import.meta.url),
  "utf8",
);

test("exported HTML uses native details for long REF DES content", () => {
  assert.match(source, /function renderCollapsibleRefDes/);
  assert.match(source, /<details class="cell-details">/);
  assert.match(source, /<summary class="cell-details__summary">/);
  assert.match(source, /renderCollapsibleRefDes\(row\.refDes\)/);
});

test("exported HTML provides expand-all and collapse-all controls", () => {
  assert.match(source, /data-details-action="expand"/);
  assert.match(source, /data-details-action="collapse"/);
  assert.match(source, /querySelectorAll\("\.cell-details"\)/);
});
