import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sheet = await readFile(
  new URL("../src/components/test-tracker/SystemProgressSheet.tsx", import.meta.url),
  "utf8",
);
const table = await readFile(
  new URL("../src/components/test-tracker/TestProgressTable.tsx", import.meta.url),
  "utf8",
);
const tracker = await readFile(
  new URL("../src/components/test-tracker/TestTracker.tsx", import.meta.url),
  "utf8",
);
const presentation = await readFile(
  new URL("../src/components/test-tracker/testTrackerPresentation.ts", import.meta.url),
  "utf8",
);

test("system progress loads linked issues and exposes direct issue navigation", () => {
  assert.match(sheet, /linkedIssues/);
  assert.match(sheet, /test_item_id/);
  assert.match(sheet, /schema:\s*"workspace"/);
  assert.match(sheet, /openIssue:\s*issue\.id/);
  assert.match(sheet, /Blocked/);
});

test("all completion paths use the database guard and show the exact unresolved warning", () => {
  assert.match(sheet, /set_test_progress_status/);
  assert.match(sheet, /尚有問題未被解決/);
  assert.match(sheet, /data-testid="blocked-item-warning"/);
  assert.match(sheet, /finishTimer[\s\S]*saveItem\(item,\s*nextDraft/);
  assert.match(sheet, /completeStation[\s\S]*saveItem\(/);
});

test("station table distinguishes blocked progress from unfinished progress", () => {
  assert.match(presentation, /createStationBlockedLookup/);
  assert.match(tracker, /\.from\(["']issues["']\)/);
  assert.match(tracker, /<TestProgressTable[\s\S]*linkedIssues=\{linkedIssues\}/);
  assert.match(table, /linkedIssues:\s*TrackerLinkedIssue\[\]/);
  assert.match(table, /createStationBlockedLookup\(items,\s*progress,\s*linkedIssues\)/);
  assert.match(table, /Blocked/);
  assert.match(table, /tone=\{blocked \? "danger" : "auto"\}/);
});
