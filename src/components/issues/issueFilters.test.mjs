import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

let filters = {};
try {
  const metricsSource = await readFile(new URL("../dashboard/issueDashboardMetrics.ts", import.meta.url), "utf8");
  const metricsCode = ts.transpileModule(metricsSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const metricsUrl = `data:text/javascript;base64,${Buffer.from(metricsCode).toString("base64")}`;
  const source = (await readFile(new URL("./issueFilters.ts", import.meta.url), "utf8")).replace('"../dashboard/issueDashboardMetrics"', JSON.stringify(metricsUrl));
  const transpiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  filters = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);
} catch { /* The first run proves the missing implementation. */ }

test("issue filters parse dashboard query conditions and legacy machine search", () => {
  assert.equal(typeof filters.readIssueFilters, "function");
  assert.deepEqual(filters.readIssueFilters("?system=機台一&issueStatus=pending&issuePriority=critical&issueOwner=unassigned&issueFollowUp=stale"), { query: "機台一", station: "all", status: "pending", priority: "critical", owner: "unassigned", followUp: "stale" });
  assert.deepEqual(filters.readIssueFilters("?issueStatus=bad&issuePriority=bad&issueFollowUp=bad"), { query: "", station: "all", status: "all", priority: "all", owner: "all", followUp: "all" });
});

test("issue conditions match pending, blank owners, station, severity and seven-day follow-up together", () => {
  assert.equal(typeof filters.matchesIssueConditions, "function");
  const now = new Date("2026-10-13T12:00:00Z");
  const selected = filters.readIssueFilters("?issueStation=s1&issueStatus=pending&issuePriority=critical&issueOwner=unassigned&issueFollowUp=stale");
  const issue = { id: "i1", title: "fan", station_id: "s1", status: "in_progress", priority: "critical", assigned_to: "  ", created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-06T12:00:00Z" };
  assert.equal(filters.matchesIssueConditions(issue, selected, now), true);
  for (const change of [{ status: "resolved" }, { assigned_to: "王工程師" }, { station_id: "s2" }, { priority: "high" }, { updated_at: "2026-10-07T12:00:00Z" }]) {
    assert.equal(filters.matchesIssueConditions({ ...issue, ...change }, selected, now), false);
  }
  assert.equal(filters.matchesIssueConditions({ ...issue, assigned_to: " 王工程師 " }, { ...selected, owner: "王工程師" }, now), true);
});

test("clearing issue filters keeps project and workspace navigation and removes legacy hidden search", () => {
  assert.equal(typeof filters.writeIssueFilters, "function");
  const url = new URL("https://example.test/?workspace=station-status&module=issues&project=p1&system=old&issuePriority=critical&openIssue=i1");
  filters.writeIssueFilters(url, filters.readIssueFilters(""));
  assert.equal(url.searchParams.get("workspace"), "station-status");
  assert.equal(url.searchParams.get("module"), "issues");
  assert.equal(url.searchParams.get("project"), "p1");
  assert.equal(url.searchParams.get("openIssue"), "i1");
  assert.equal(url.searchParams.has("system"), false);
  assert.equal(url.searchParams.has("issuePriority"), false);
  const selected = filters.readIssueFilters("?issueSearch=fan&issueStation=s1&issueStatus=pending&issueOwner=王工程師");
  filters.writeIssueFilters(url, selected);
  assert.deepEqual(filters.readIssueFilters(url.search), selected);
});
