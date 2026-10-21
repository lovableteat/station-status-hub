// Pure summaries behind the Data Center work overview: the workflow strip and
// the progress panel read these so the page shows where the configuration and
// the daily reporting stand instead of a paragraph explaining what it is for.

const HEALTH_ORDER = { healthy: 0, warning: 1, offline: 2, critical: 3 };

export const WORKFLOW_STEP_IDS = ["projects", "facility", "plan", "rack", "reports"];

function worstHealth(rack) {
  return (rack.devices ?? []).reduce((worst, device) => (HEALTH_ORDER[device.health] > HEALTH_ORDER[worst] ? device.health : worst), "healthy");
}

function nextDeploymentStep(rack) {
  const steps = rack.deploymentSteps ?? [];
  return steps.find((step) => step.status === "active") ?? steps.find((step) => step.status === "pending") ?? null;
}

/** Configuration progress for one site: rack frames, equipment, U usage, checklist and deployment steps. */
export function summarizeSiteProgress(site, models, getRackHealth = worstHealth) {
  const racks = site?.racks ?? [];
  let capacityU = 0;
  let usedU = 0;
  let stepsDone = 0;
  let stepsTotal = 0;
  let maintenanceOpen = 0;
  const rows = racks.map((rack) => {
    const rackModel = models?.[rack.modelId];
    const hasModel = Boolean(rackModel && rackModel.kind === "rack");
    const l10Units = Math.max(1, models?.[rack.l10ModelId]?.rackUnits ?? 1);
    const serviceU = (rack.devices ?? []).reduce((sum, device) => sum + Math.max(1, device.slotSpan ?? 1), 0);
    capacityU += rack.capacityU ?? 0;
    usedU += rack.l10Count * l10Units + serviceU;
    const steps = rack.deploymentSteps ?? [];
    stepsTotal += steps.length;
    stepsDone += steps.filter((step) => step.status === "done").length;
    maintenanceOpen += (rack.maintenance ?? []).filter((item) => item.status !== "done").length;
    const next = nextDeploymentStep(rack);
    return {
      id: rack.id,
      cabinet: rack.cabinet,
      row: rack.row,
      status: rack.status,
      health: getRackHealth(rack),
      hasModel,
      modelLabel: hasModel ? rackModel.name : "未套用外框",
      deviceCount: rack.l10Count,
      serviceCount: (rack.devices ?? []).length,
      nextStep: next ? { title: next.title, owner: next.owner, status: next.status } : null,
      pendingSteps: steps.filter((step) => step.status !== "done").length,
    };
  });
  const checklist = site?.checklist ?? [];
  return {
    rackCount: racks.length,
    racksWithModel: rows.filter((row) => row.hasModel).length,
    racksWithDevices: rows.filter((row) => row.deviceCount > 0).length,
    deviceCount: rows.reduce((sum, row) => sum + row.deviceCount, 0),
    serviceDeviceCount: rows.reduce((sum, row) => sum + row.serviceCount, 0),
    attentionCount: rows.filter((row) => row.health !== "healthy").length,
    capacityU,
    usedU: Math.min(usedU, capacityU || usedU),
    checklistDone: checklist.filter((item) => item.done).length,
    checklistTotal: checklist.length,
    stepsDone,
    stepsTotal,
    maintenanceOpen,
    rows,
  };
}

function daysBetween(fromDate, toDate) {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000);
}

/** Today's and recent daily reports from the newest-first rows the reports page loads. */
export function summarizeWorkReports(reports, { today, siteId, userId, recentDays = 7, latestCount = 3 }) {
  const rows = Array.isArray(reports) ? reports : [];
  const todayMine = rows.find((row) => row.report_date === today && row.site_id === siteId && row.author_id === userId) ?? null;
  const recent = rows.filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.report_date) && daysBetween(row.report_date, today) < recentDays && daysBetween(row.report_date, today) >= 0);
  return {
    todayMine,
    todaySite: rows.filter((row) => row.report_date === today && row.site_id === siteId).length,
    latest: rows.slice(0, latestCount),
    recentCount: recent.length,
    blockedRecent: recent.filter((row) => row.status === "blocked").length,
    lastReportDate: rows[0]?.report_date ?? "",
  };
}

/**
 * The five tools in their suggested order with a live one-line status each.
 * `done` marks steps that already have what the next step needs; the first
 * unfinished step is the suggested next action.
 */
export function buildWorkflowSteps({ projectName, siteLabel, facility, progress, reportState, todayReported, syncState = "synced" }) {
  const aisles = facility?.aisles?.length ?? 0;
  const feeds = (facility?.powerFeeds ?? []).filter((feed) => feed.enabled).length;
  const reportValue = reportState === "signed-out" ? "登入後可填寫" : reportState === "no-project" ? "先選共用專案" : reportState === "loading" ? "讀取回報中…" : reportState === "error" ? "無法讀取回報" : todayReported ? "今天已回報" : "今天尚未回報";
  const steps = [
    {
      id: "projects",
      title: "專案與站點",
      value: `${projectName || (syncState === "loading" ? "正在取得共用專案" : syncState === "local" ? "本機保護模式" : "尚未選擇共用專案")} · ${siteLabel}`,
      done: Boolean(projectName) || syncState === "local",
    },
    { id: "facility", title: "場地與通道", value: facility ? `${facility.width} × ${facility.depth} m · ${aisles} 條通道 · ${feeds} 個 PDU` : "尚未設定地板", done: Boolean(facility) && aisles > 0 },
    { id: "plan", title: "2D 配置規劃", value: progress.rackCount ? `${progress.rackCount} 座機櫃已定位` : "尚未安排機櫃", done: progress.rackCount > 0 },
    { id: "rack", title: "機櫃與設備", value: progress.rackCount ? `${progress.racksWithDevices}/${progress.rackCount} 座已裝設備 · 共 ${progress.deviceCount} 台` : "先在 2D 新增機櫃", done: progress.rackCount > 0 && progress.racksWithDevices === progress.rackCount },
    { id: "reports", title: "每日工作回報", value: reportValue, done: reportState === "ready" && Boolean(todayReported) },
  ];
  const next = steps.find((step) => !step.done);
  return { steps, nextStepId: next ? next.id : null };
}
