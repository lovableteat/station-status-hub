import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(
  new URL("../src/components/dashboard/Dashboard.tsx", import.meta.url),
  "utf8",
);
const monitor = await readFile(
  new URL("../src/components/production/ProductionMonitor.tsx", import.meta.url),
  "utf8",
);
const index = await readFile(new URL("../src/pages/Index.tsx", import.meta.url), "utf8");

test("dashboard metrics navigate to pending issue filters", () => {
  assert.match(dashboard, /onNavigate\?\.\("issues", params\)/);
  assert.match(dashboard, /issueStatus: "pending", issuePriority: "critical"/);
  assert.match(dashboard, /issueStatus: "pending", issueOwner: "unassigned"/);
  assert.match(dashboard, /issueStatus: "pending", issueFollowUp: "stale"/);
});

test("issue actions open the selected issue or owner's pending list", () => {
  assert.match(dashboard, /openIssues\(\{ openIssue: issue\.id \}\)/);
  assert.match(dashboard, /issueOwner: row.owner \|\| "unassigned"/);
  assert.doesNotMatch(dashboard, /onNavigate\?\.\("test-tracker"/);
});

test("production monitor shows and applies a clearable attention filter without changing KPI counts", () => {
  assert.match(monitor, /attentionFilter/);
  assert.match(monitor, /需關注機台/);
  assert.match(monitor, /setAttentionFilter\(false\)/);
  assert.match(monitor, /attentionSystemIds\.has\(system\.id\)/);
  assert.match(monitor, /\[systemViews\]\s*\);/);
});

test("workspace navigation preserves all automatic filter query keys", () => {
  for (const key of ["attention", "excludeStatus", "sort", "status", "trackerSearch", "engineer", "issueSearch", "issueStation", "issueStatus", "issuePriority", "issueOwner", "issueFollowUp"]) {
    assert.match(index, new RegExp(`"${key}"`));
  }
});

test("legacy monitor links are normalized into the merged L10 production board", () => {
  assert.match(index, /module === "monitor" \? "test-tracker" : module/);
  assert.match(index, /trackerView: "board"/);
});

test("deep links are not cleared before database permissions finish loading", () => {
  assert.match(index, /loading:\s*permissionsLoading/);
  assert.match(
    index,
    /if \(permissionsLoading\) return;[\s\S]{0,240}workspaceItems\.some/,
  );
});
