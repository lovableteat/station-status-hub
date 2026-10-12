import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

let metrics = {};
try {
  const source = await readFile(new URL("./issueDashboardMetrics.ts", import.meta.url), "utf8");
  const transpiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  metrics = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);
} catch { /* The first run proves the missing implementation. */ }

const now = new Date("2026-10-13T12:00:00Z");
const issue = (id, updates = {}) => ({ id, title: id, status: "open", priority: "medium", assigned_to: "", created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-13T12:00:00Z", ...updates });

test("issue dashboard counts pending issues and excludes resolved and closed from follow-up", () => {
  assert.equal(typeof metrics.calculateIssueDashboardMetrics, "function");
  const result = metrics.calculateIssueDashboardMetrics([
    issue("critical", { priority: "critical", assigned_to: "王工程師" }),
    issue("stale", { status: "in_progress", updated_at: "2026-10-06T12:00:00Z" }),
    issue("resolved", { status: "resolved", priority: "critical", updated_at: "2026-10-01T12:00:00Z" }),
    issue("closed", { status: "closed", priority: "critical" }),
  ], now);
  assert.deepEqual(result.counts, { pending: 2, open: 1, inProgress: 1, resolved: 2, critical: 1, unassigned: 1, stale: 1 });
  assert.deepEqual(result.priorityCounts, { critical: 1, high: 0, medium: 1, low: 0 });
});

test("issue aging uses last update with valid creation fallback and does not invent ages", () => {
  assert.equal(typeof metrics.getIssueIdleDays, "function");
  assert.equal(metrics.getIssueIdleDays(issue("fallback", { updated_at: null }), now), 12);
  assert.equal(metrics.getIssueIdleDays(issue("invalid-update", { updated_at: "invalid" }), now), 12);
  assert.equal(metrics.getIssueIdleDays(issue("invalid", { created_at: "invalid", updated_at: "invalid" }), now), null);
  assert.equal(metrics.getIssueIdleDays(issue("future", { updated_at: "2026-10-14T12:00:00Z" }), now), 0);
});

test("follow-up order prioritizes severity then time without updates and treats blank owners as unassigned", () => {
  assert.equal(typeof metrics.calculateIssueDashboardMetrics, "function");
  const result = metrics.calculateIssueDashboardMetrics([
    issue("medium-stale", { updated_at: "2026-10-01T12:00:00Z", assigned_to: "  " }),
    issue("critical-new", { priority: "critical", assigned_to: " 王工程師 " }),
    issue("critical-old", { priority: "critical", updated_at: "2026-10-02T12:00:00Z", assigned_to: "王工程師" }),
    issue("legacy", { status: null, priority: null }),
  ], now);
  assert.deepEqual(result.pendingIssues.map(entry => entry.id), ["critical-old", "critical-new", "medium-stale", "legacy"]);
  assert.equal(result.counts.pending, 4);
  assert.equal(result.counts.unassigned, 2);
  assert.deepEqual(result.ownerRows.find(entry => entry.owner === "王工程師"), { owner: "王工程師", count: 2, critical: 2 });
});
