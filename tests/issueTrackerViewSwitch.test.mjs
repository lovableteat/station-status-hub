import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const issueTrackerUrl = new URL(
  "../src/components/issues/IssueTracker.tsx",
  import.meta.url
);

test("issue tracker view switch uses one visual container instead of nested borders", async () => {
  const source = await readFile(issueTrackerUrl, "utf8");
  const switchStart = source.indexOf('data-ui="issue-view-toolbar"');
  const contentStart = source.indexOf('<TabsContent value="list"', switchStart);

  assert.notEqual(switchStart, -1, "issue view toolbar needs a stable marker");
  assert.notEqual(contentStart, -1, "issue view toolbar block could not be isolated");

  const toolbar = source.slice(switchStart, contentStart);
  assert.doesNotMatch(toolbar, /maintenance-toolbar/);
  assert.match(toolbar, /data-ui="issue-view-switch"/);
  assert.match(toolbar, /border-0/);
  assert.match(toolbar, /data-\[state=active\]:border-0/);
});
