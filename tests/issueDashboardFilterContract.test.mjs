import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/components/issues/IssueTracker.tsx", import.meta.url), "utf8");
const table = await readFile(new URL("../src/components/issues/IssueTableView.tsx", import.meta.url), "utf8");

test("issue list keeps persistent filters in common order and reversible URL-backed chips", () => {
  const filterStart = source.indexOf('data-ui="issue-persistent-filters"');
  assert.ok(filterStart >= 0);
  const resultStart = source.indexOf("<IssueTableView", filterStart);
  const filterBar = source.slice(filterStart, resultStart);
  const labels = ["搜尋問題", "篩選站點", "篩選狀態", "篩選負責人", "篩選嚴重度", "篩選追蹤狀態"];
  for (const label of labels) assert.ok(filterBar.includes(label), `missing ${label}`);
  const positions = labels.map(label => filterBar.indexOf(label));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.match(filterBar, /作用中篩選/);
  assert.match(filterBar, /全部清除/);
  assert.match(source, /readIssueFilters/);
  assert.match(source, /writeIssueFilters/);
  assert.match(source, /popstate/);
});

test("issue empty results preserve table headers and match mobile empty copy", () => {
  assert.match(table, /<TableHeader/);
  assert.match(table, /colSpan=\{columnOrder.length\}/);
  assert.equal((table.match(/目前篩選條件沒有符合的問題/g) || []).length, 2);
});

test("project changes and overlapping issue loads cannot replace the current issue snapshot", () => {
  assert.match(source, /const request = \+\+loadRequest\.current/);
  assert.match(source, /if \(request !== loadRequest\.current\) return;/);
  assert.match(source, /setIssues\(\[\]\);\s*setSelectedIssue\(null\);\s*void loadIssues\(\)/);
  assert.match(source, /return \(\) => \{ loadRequest\.current \+= 1; \}/);
});
