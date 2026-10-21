import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildWorkflowSteps, summarizeSiteProgress, summarizeWorkReports, WORKFLOW_STEP_IDS } from "../src/components/data-center/workOverview.mjs";

const models = {
  gb300: { id: "gb300", kind: "rack", name: "GB300 L11 機櫃" },
  l10: { id: "l10", kind: "l10", rackUnits: 1 },
};
const rack = (overrides) => ({
  id: "r", cabinet: "TPE-B01", row: "B", status: "allocated", modelId: "gb300", l10ModelId: "l10", l10Count: 0, capacityU: 48,
  devices: [], deploymentSteps: [], maintenance: [], ...overrides,
});
const site = {
  id: "taipei", label: "Taipei", checklist: [{ id: "a", done: true }, { id: "b", done: false }],
  racks: [
    rack({ id: "r1", cabinet: "TPE-B01", l10Count: 4, devices: [{ health: "healthy", slotSpan: 2 }], deploymentSteps: [{ title: "機櫃定位", owner: "Facility", status: "done" }, { title: "電力驗證", owner: "Infra", status: "active" }] }),
    rack({ id: "r2", cabinet: "TPE-B02", modelId: "missing", devices: [{ health: "critical", slotSpan: 1 }], maintenance: [{ status: "in-progress" }], deploymentSteps: [{ title: "機櫃定位", owner: "Facility", status: "pending" }] }),
  ],
};

test("site progress counts frames, equipment, U usage, steps, checklist and attention", () => {
  const progress = summarizeSiteProgress(site, models);
  assert.equal(progress.rackCount, 2);
  assert.equal(progress.racksWithModel, 1);
  assert.equal(progress.racksWithDevices, 1);
  assert.equal(progress.deviceCount, 4);
  assert.equal(progress.serviceDeviceCount, 2);
  assert.equal(progress.capacityU, 96);
  assert.equal(progress.usedU, 4 + 2 + 1);
  assert.equal(progress.stepsDone, 1);
  assert.equal(progress.stepsTotal, 3);
  assert.equal(progress.checklistDone, 1);
  assert.equal(progress.checklistTotal, 2);
  assert.equal(progress.attentionCount, 1);
  assert.equal(progress.maintenanceOpen, 1);
  assert.deepEqual(progress.rows.map((row) => [row.cabinet, row.health, row.modelLabel, row.nextStep?.title ?? null, row.pendingSteps]), [
    ["TPE-B01", "healthy", "GB300 L11 機櫃", "電力驗證", 1],
    ["TPE-B02", "critical", "未套用外框", "機櫃定位", 1],
  ]);
});

test("report summary finds today's own report for the site and recent blockers", () => {
  const rows = [
    { id: "1", report_date: "2026-10-22", site_id: "taipei", author_id: "me", status: "completed", summary: "done" },
    { id: "2", report_date: "2026-10-22", site_id: "taipei", author_id: "other", status: "blocked", summary: "stuck" },
    { id: "3", report_date: "2026-10-20", site_id: "phoenix", author_id: "me", status: "blocked", summary: "old" },
    { id: "4", report_date: "2026-10-01", site_id: "taipei", author_id: "me", status: "blocked", summary: "ancient" },
  ];
  const summary = summarizeWorkReports(rows, { today: "2026-10-22", siteId: "taipei", userId: "me" });
  assert.equal(summary.todayMine?.id, "1");
  assert.equal(summary.todaySite, 2);
  assert.equal(summary.recentCount, 3);
  assert.equal(summary.blockedRecent, 2);
  assert.equal(summary.latest.length, 3);
  assert.equal(summarizeWorkReports(rows, { today: "2026-10-23", siteId: "taipei", userId: "me" }).todayMine, null);
  assert.equal(summarizeWorkReports(undefined, { today: "2026-10-22", siteId: "taipei", userId: "me" }).latest.length, 0);
});

test("workflow steps keep the tool order and point at the first unfinished step", () => {
  const facility = { width: 18, depth: 13, aisles: [{}, {}], powerFeeds: [{ enabled: true }, { enabled: false }] };
  const progress = summarizeSiteProgress(site, models);
  const flow = buildWorkflowSteps({ projectName: "VR200", siteLabel: "Taipei", facility, progress, reportState: "ready", todayReported: false });
  assert.deepEqual(flow.steps.map((step) => step.id), WORKFLOW_STEP_IDS);
  assert.deepEqual(flow.steps.map((step) => step.done), [true, true, true, false, false]);
  assert.equal(flow.nextStepId, "rack");
  assert.equal(flow.steps[1].value, "18 × 13 m · 2 條通道 · 1 個 PDU");
  assert.equal(flow.steps[3].value, "1/2 座已裝設備 · 共 4 台");
  assert.equal(flow.steps[4].value, "今天尚未回報");
  assert.equal(buildWorkflowSteps({ projectName: "", siteLabel: "Taipei", facility, progress, reportState: "signed-out", todayReported: false }).nextStepId, "projects");
  const local = buildWorkflowSteps({ projectName: "", siteLabel: "Taipei", facility, progress, reportState: "signed-out", todayReported: false, syncState: "local" });
  assert.equal(local.steps[0].value, "本機保護模式 · Taipei");
  assert.equal(local.nextStepId, "rack");
  const complete = buildWorkflowSteps({ projectName: "VR200", siteLabel: "Taipei", facility, progress: { ...progress, racksWithDevices: 2 }, reportState: "ready", todayReported: true });
  assert.equal(complete.nextStepId, null);
  assert.equal(complete.steps[4].value, "今天已回報");
});

test("the page mounts the strip in the task guide and the progress panel beside the 3D overview", () => {
  const source = readFileSync("src/components/data-center/DeploymentPlanningCenter.tsx", "utf8");
  const css = readFileSync("src/components/data-center/data-center.css", "utf8");
  const guide = source.slice(source.indexOf('data-testid="data-center-task-guide"'), source.indexOf("</section>}", source.indexOf('data-testid="data-center-task-guide"')));
  assert.match(guide, /<WorkflowStrip/);
  assert.match(guide, /onStep=\{runWorkflowStep\}/);
  assert.match(guide, /先選專案與站點/);
  assert.match(source, /const workPanelVisible = isDesktopLayout && showWorkPanel && !showDailyReports && workspaceMode === "3d" && !showRackDetails;/);
  assert.match(source, /workPanelVisible \? workPanelGridClass : compactDesktopGridClass/);
  assert.match(source, /"lg:grid-cols-\[224px_minmax\(0,1fr\)_336px\]"/);
  assert.match(source, /\{workPanelVisible \? <WorkProgressPanel/);
  assert.match(source, /queryKey: \["data-center-work-reports", reportUser\?\.userId, sharedProjects\.selectedProjectId\]/);
  assert.match(source, /\{showWorkPanel \? "隱藏進度" : "工作進度"\}/);
  assert.doesNotMatch(source, /位置與尺寸請到 2D 規劃直接拖曳調整<\/div>/);
  assert.match(css, /\.dc-flow-step\[aria-current="step"\] \{[^}]*hsl\(var\(--primary\)/);
  assert.match(css, /\.dc-progress-panel \{[^}]*hsl\(var\(--card\)\)/);
  const overview = readFileSync("src/components/data-center/DataCenterWorkOverview.tsx", "utf8");
  assert.match(overview, /data-testid="data-center-work-panel"/);
  assert.match(overview, /aria-current=\{isNext \? "step" : undefined\}/);
  assert.match(overview, /填寫今天的回報/);
});
