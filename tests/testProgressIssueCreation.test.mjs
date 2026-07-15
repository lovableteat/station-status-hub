import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("test progress items can create a prefilled issue in the shared issue workflow", async () => {
  const progressSheet = await read("../src/components/test-tracker/SystemProgressSheet.tsx");
  const issueDialog = await read("../src/components/issues/IssueCreateDialog.tsx");
  const issueTracker = await read("../src/components/issues/IssueTracker.tsx");
  const realtimeMigration = await read("../supabase/migrations/20260716034000_enable_issues_realtime.sql");

  assert.match(progressSheet, /import \{ IssueCreateDialog \}/);
  assert.match(progressSheet, /<IssueCreateDialog/);
  assert.match(progressSheet, /system_id:\s*system\.id/);
  assert.match(progressSheet, /station_id:\s*item\.station_id/);
  assert.match(progressSheet, /test_item_id:\s*item\.id/);
  assert.match(progressSheet, />\s*建立問題/);

  assert.match(issueDialog, /initialValues\?:\s*Partial<NewIssue>/);
  assert.match(issueDialog, /trigger\?:\s*ReactNode/);
  assert.match(issueDialog, /buildInitialIssue\(initialValues\)/);
  assert.match(issueDialog, /\.from\('issues'\)/);
  assert.match(issueDialog, /project_id:\s*activeProjectId/);

  assert.match(issueTracker, /postgres_changes/);
  assert.match(issueTracker, /filter:\s*`project_id=eq\.\$\{activeProjectId\}`/);
  assert.match(issueTracker, /loadIssues\(false\)/);
  assert.match(realtimeMigration, /ALTER PUBLICATION supabase_realtime ADD TABLE public\.issues/);
  assert.match(realtimeMigration, /tablename = 'issues'/);
});
