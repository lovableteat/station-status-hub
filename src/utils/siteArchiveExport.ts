import { supabase } from "@/integrations/supabase/client";

interface SiteArchiveExportInput {
  systems: any[];
  stations: any[];
  testItems: any[];
  progress: any[];
  stationContents: any[];
  exportedBy?: string | null;
}

interface ArchiveAttachment {
  id: string;
  issue_id: string;
  file_name: string;
  file_path: string;
  public_url: string;
}

interface ArchiveIssue {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  assigned_to: string;
  created_at: string;
  updated_at: string;
  category?: string | null;
  relate?: string | null;
  process_notes?: string | null;
  solution?: string | null;
  system_name?: string | null;
  serial_number?: string | null;
  assigned_engineer?: string | null;
  station_name?: string | null;
  station_order?: number | null;
  test_item_name?: string | null;
  attachments: ArchiveAttachment[];
}

interface ArchiveSupplementalData {
  issues: ArchiveIssue[];
  troubleshootingRecords: any[];
  warnings: string[];
}

const dateTimeFormatter = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

const safeText = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";

  try {
    return dateTimeFormatter.format(new Date(value));
  } catch {
    return "—";
  }
};

const formatStatus = (status?: string | null) => {
  switch (status) {
    case "Done":
    case "resolved":
    case "closed":
      return "已完成";
    case "On-going":
    case "in_progress":
    case "investigating":
      return "進行中";
    case "Not Start":
    case "open":
      return "未開始";
    case "Issue":
      return "異常";
    default:
      return status || "—";
  }
};

const formatPriority = (priority?: string | null) => {
  switch (priority) {
    case "critical":
      return "緊急";
    case "high":
      return "高";
    case "medium":
      return "中";
    case "low":
      return "低";
    default:
      return priority || "—";
  }
};

const statusTone = (status?: string | null) => {
  const normalized = formatStatus(status);
  if (normalized === "已完成") return "tone-success";
  if (normalized === "進行中") return "tone-warning";
  if (normalized === "異常") return "tone-danger";
  return "tone-muted";
};

const shorten = (value: unknown, limit = 120) => {
  const text = String(value ?? "").trim();
  if (!text) return "—";
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
};

const buildFileName = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `station-status-hub-archive-${y}${m}${d}-${hh}${mm}.html`;
};

const calculateStationProgress = (
  systemId: string,
  stationId: string,
  testItems: any[],
  progress: any[]
) => {
  const stationItems = testItems.filter((item) => item.station_id === stationId);
  if (stationItems.length === 0) return 0;

  const completedCount = stationItems.filter((item) =>
    progress.some(
      (record) =>
        record.system_id === systemId &&
        record.station_id === stationId &&
        record.item_id === item.id &&
        record.status === "Done"
    )
  ).length;

  return Math.round((completedCount / stationItems.length) * 100);
};

const groupBy = <T,>(items: T[], keySelector: (item: T) => string) =>
  items.reduce<Map<string, T[]>>((map, item) => {
    const key = keySelector(item);
    const bucket = map.get(key) || [];
    bucket.push(item);
    map.set(key, bucket);
    return map;
  }, new Map<string, T[]>());

async function fetchSupplementalArchiveData(): Promise<ArchiveSupplementalData> {
  const warnings: string[] = [];

  const [issuesResult, attachmentsResult, troubleshootingResult] = await Promise.allSettled([
    supabase
      .from("issues")
      .select(`
        *,
        test_systems!issues_system_id_fkey (
          system_name,
          assigned_engineer,
          serial_number
        ),
        test_flow_stations!issues_station_id_fkey (
          station_name,
          station_order
        ),
        test_flow_items!issues_test_item_id_fkey (
          item_name,
          description
        )
      `)
      .order("created_at", { ascending: false }),
    supabase.from("issue_attachments").select("*"),
    supabase
      .from("troubleshooting_records")
      .select("*")
      .order("occurred_at", { ascending: false }),
  ]);

  let issues: ArchiveIssue[] = [];

  if (issuesResult.status === "fulfilled" && !issuesResult.value.error) {
    const attachmentRows =
      attachmentsResult.status === "fulfilled" && !attachmentsResult.value.error
        ? (attachmentsResult.value.data as any[]) || []
        : [];

    if (attachmentsResult.status === "rejected" || attachmentsResult.value.error) {
      warnings.push("問題附件無法完整載入，封存檔將略過附件清單。");
    }

    const attachmentMap = groupBy(
      attachmentRows.map((attachment) => ({
        id: attachment.id,
        issue_id: attachment.issue_id,
        file_name: attachment.file_name,
        file_path: attachment.file_path,
        public_url: attachment.file_path
          ? supabase.storage.from("issue-attachments").getPublicUrl(attachment.file_path).data
              .publicUrl
          : "",
      })),
      (attachment) => attachment.issue_id
    );

    issues = ((issuesResult.value.data as any[]) || []).map((issue) => ({
      id: issue.id,
      title: issue.title || "",
      description: issue.description || "",
      priority: issue.priority || "medium",
      status: issue.status || "open",
      assigned_to: issue.assigned_to || "",
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      category: issue.category,
      relate: issue.relate,
      process_notes: issue.process_notes,
      solution: issue.solution,
      system_name: issue.test_systems?.system_name,
      serial_number: issue.test_systems?.serial_number,
      assigned_engineer: issue.test_systems?.assigned_engineer,
      station_name: issue.test_flow_stations?.station_name,
      station_order: issue.test_flow_stations?.station_order,
      test_item_name: issue.test_flow_items?.item_name,
      attachments: attachmentMap.get(issue.id) || [],
    }));
  } else {
    warnings.push("問題追蹤資料無法完整載入，封存檔將略過問題追蹤區塊。");
  }

  let troubleshootingRecords: any[] = [];

  if (
    troubleshootingResult.status === "fulfilled" &&
    !troubleshootingResult.value.error
  ) {
    troubleshootingRecords = (troubleshootingResult.value.data as any[]) || [];
  } else {
    warnings.push("Troubleshooting 資料無法完整載入，封存檔將略過 Troubleshooting 區塊。");
  }

  return { issues, troubleshootingRecords, warnings };
}

export async function exportSiteArchiveHtml({
  systems,
  stations,
  testItems,
  progress,
  stationContents,
  exportedBy,
}: SiteArchiveExportInput) {
  const exportedAt = new Date();
  const { issues, troubleshootingRecords, warnings } =
    await fetchSupplementalArchiveData();

  const sortedStations = [...stations].sort(
    (left, right) => (left.station_order ?? 0) - (right.station_order ?? 0)
  );
  const filteredSystems = systems.filter((system) => !system.exclude_from_dashboard);
  const completedSystems = filteredSystems.filter(
    (system) => system.overall_progress === 100 || system.status === "Done"
  ).length;
  const ongoingSystems = filteredSystems.filter(
    (system) =>
      (system.overall_progress > 0 && system.overall_progress < 100) ||
      system.status === "On-going"
  ).length;
  const completionRate =
    filteredSystems.length > 0
      ? Math.round((completedSystems / filteredSystems.length) * 100)
      : 0;

  const issueOpenCount = issues.filter(
    (issue) => !["resolved", "closed"].includes(issue.status)
  ).length;
  const troubleshootingOpenCount = troubleshootingRecords.filter(
    (record) => !["resolved", "closed"].includes(record.status)
  ).length;

  const stationItemMap = groupBy(testItems, (item) => item.station_id);
  const stationContentMap = groupBy(stationContents, (content) => content.station_id);

  const stationSummaryCards = sortedStations
    .map((station) => {
      const relatedItems = stationItemMap.get(station.id) || [];
      const progressValues = filteredSystems
        .map((system) =>
          calculateStationProgress(system.id, station.id, testItems, progress)
        )
        .filter((value) => Number.isFinite(value));

      const avgProgress =
        progressValues.length > 0
          ? Math.round(
              progressValues.reduce((total, value) => total + value, 0) /
                progressValues.length
            )
          : 0;

      return `
        <article class="station-card">
          <div class="station-card-head">
            <div>
              <p class="eyebrow">Station ${safeText(station.station_order)}</p>
              <h3>${safeText(station.station_name)}</h3>
            </div>
            <span class="progress-pill">${avgProgress}%</span>
          </div>
          <p class="subtle">${safeText(station.description || "未填寫站點描述")}</p>
          <div class="meta-grid">
            <div><span>測項數</span><strong>${relatedItems.length}</strong></div>
            <div><span>流程內容</span><strong>${(stationContentMap.get(station.id) || []).length}</strong></div>
          </div>
        </article>
      `;
    })
    .join("");

  const systemTableHeaders = sortedStations
    .map(
      (station) =>
        `<th>${safeText(
          station.station_name
        )}<span class="th-sub">Station ${safeText(station.station_order)}</span></th>`
    )
    .join("");

  const systemTableRows = filteredSystems
    .map((system) => {
      const stationProgressCells = sortedStations
        .map((station) => {
          const progressValue = calculateStationProgress(
            system.id,
            station.id,
            testItems,
            progress
          );

          return `<td><span class="progress-chip">${progressValue}%</span></td>`;
        })
        .join("");

      return `
        <tr>
          <td class="sticky-cell">
            <div class="cell-title">${safeText(system.system_name)}</div>
            <div class="cell-sub">${safeText(system.model || "GB300")} / ${safeText(
              system.serial_number || "未填序號"
            )}</div>
          </td>
          <td><span class="status-badge ${statusTone(system.status)}">${safeText(
            formatStatus(system.status)
          )}</span></td>
          <td>${safeText(system.current_station || "—")}</td>
          <td>${safeText(String(system.overall_progress ?? 0))}%</td>
          <td>${formatDateTime(system.actual_started_at)}</td>
          <td>${formatDateTime(system.actual_completed_at)}</td>
          ${stationProgressCells}
        </tr>
      `;
    })
    .join("");

  const stationFlowBlocks = sortedStations
    .map((station) => {
      const relatedItems = [...(stationItemMap.get(station.id) || [])].sort(
        (left, right) => (left.item_order ?? 0) - (right.item_order ?? 0)
      );
      const relatedContents = [...(stationContentMap.get(station.id) || [])].sort(
        (left, right) => (left.order_num ?? 0) - (right.order_num ?? 0)
      );

      const itemList = relatedItems.length
        ? `<ol class="flow-list">${relatedItems
            .map(
              (item) => `
                <li>
                  <strong>${safeText(item.item_name)}</strong>
                  <p>${safeText(item.description || "未填寫測項描述")}</p>
                </li>
              `
            )
            .join("")}</ol>`
        : `<p class="empty">此站點尚未建立測項。</p>`;

      const contentList = relatedContents.length
        ? `<div class="content-stack">${relatedContents
            .map(
              (content) => `
                <article class="content-card">
                  <div class="content-order">段落 ${safeText(content.order_num)}</div>
                  <h4>${safeText(content.title)}</h4>
                  <p>${safeText(content.content || "未填寫內容")}</p>
                </article>
              `
            )
            .join("")}</div>`
        : `<p class="empty">此站點尚未建立流程內容。</p>`;

      return `
        <section class="archive-block">
          <div class="archive-block-header">
            <div>
              <p class="eyebrow">Flow Setup</p>
              <h3>${safeText(station.station_name)}</h3>
            </div>
            <span class="station-order">Station ${safeText(station.station_order)}</span>
          </div>
          <p class="subtle">${safeText(station.description || "未填寫站點描述")}</p>
          <div class="flow-grid">
            <div>
              <h4>測項清單</h4>
              ${itemList}
            </div>
            <div>
              <h4>流程內容</h4>
              ${contentList}
            </div>
          </div>
        </section>
      `;
    })
    .join("");

  const issueRows = issues.length
    ? issues
        .map((issue) => {
          const attachmentLinks = issue.attachments.length
            ? issue.attachments
                .map((attachment) =>
                  attachment.public_url
                    ? `<a href="${safeText(attachment.public_url)}" target="_blank" rel="noreferrer">${safeText(
                        attachment.file_name
                      )}</a>`
                    : `<span>${safeText(attachment.file_name)}</span>`
                )
                .join("<br />")
            : "—";

          return `
            <tr>
              <td class="sticky-cell">
                <div class="cell-title">${safeText(issue.title || "未命名問題")}</div>
                <div class="cell-sub">${safeText(issue.description || "未填寫描述")}</div>
              </td>
              <td>${safeText(issue.system_name || "—")}</td>
              <td>${safeText(issue.station_name || "—")}</td>
              <td><span class="status-badge ${statusTone(issue.status)}">${safeText(
                formatStatus(issue.status)
              )}</span></td>
              <td>${safeText(formatPriority(issue.priority))}</td>
              <td>${safeText(issue.assigned_to || "未指派")}</td>
              <td>${formatDateTime(issue.created_at)}</td>
              <td>${attachmentLinks}</td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="8" class="empty-cell">目前沒有可封存的問題追蹤資料。</td></tr>`;

  const troubleshootingRows = troubleshootingRecords.length
    ? troubleshootingRecords
        .map(
          (record) => `
            <tr>
              <td class="sticky-cell">
                <div class="cell-title">${safeText(record.title || "未命名事件")}</div>
                <div class="cell-sub">${safeText(shorten(record.description, 100))}</div>
              </td>
              <td>${safeText(record.issue_type || "—")}</td>
              <td>${safeText(record.issue_category || "—")}</td>
              <td>${safeText(record.severity || "—")}</td>
              <td><span class="status-badge ${statusTone(record.status)}">${safeText(
                formatStatus(record.status)
              )}</span></td>
              <td>${formatDateTime(record.occurred_at)}</td>
              <td>${formatDateTime(record.resolved_at)}</td>
              <td>${safeText(shorten(record.solution || record.root_cause, 90))}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="8" class="empty-cell">目前沒有可封存的 Troubleshooting 資料。</td></tr>`;

  const archivePayload = {
    meta: {
      archiveType: "station-status-hub-site-archive",
      exportedAt: exportedAt.toISOString(),
      exportedBy: exportedBy || "unknown",
      source: window.location.href,
      warnings,
    },
    summary: {
      systems: filteredSystems.length,
      completedSystems,
      ongoingSystems,
      completionRate,
      issues: issues.length,
      troubleshootingRecords: troubleshootingRecords.length,
    },
    systems,
    stations: sortedStations,
    testItems,
    progress,
    stationContents,
    issues,
    troubleshootingRecords,
  };

  const archiveJson = safeText(JSON.stringify(archivePayload, null, 2));

  const html = `
    <!DOCTYPE html>
    <html lang="zh-Hant">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Station Status Hub 專案封存</title>
        <style>
          :root {
            color-scheme: dark;
            --bg: #0a1020;
            --panel: rgba(17, 24, 39, 0.88);
            --panel-soft: rgba(30, 41, 59, 0.84);
            --border: rgba(108, 140, 255, 0.18);
            --border-strong: rgba(120, 162, 255, 0.32);
            --text: #edf3ff;
            --muted: rgba(222, 232, 255, 0.72);
            --primary: #7aa2ff;
            --cyan: #66d9ff;
            --success: #58d6a3;
            --warning: #f3c969;
            --danger: #f38da0;
          }

          * { box-sizing: border-box; }

          body {
            margin: 0;
            font-family: "Segoe UI", "Microsoft JhengHei", sans-serif;
            background:
              radial-gradient(circle at top left, rgba(92, 123, 255, 0.16), transparent 28rem),
              radial-gradient(circle at 88% 12%, rgba(74, 211, 255, 0.12), transparent 18rem),
              linear-gradient(180deg, #09111f 0%, #0e1728 100%);
            color: var(--text);
          }

          a { color: #9fdcff; }

          .shell {
            width: min(1440px, calc(100vw - 32px));
            margin: 0 auto;
            padding: 24px 0 40px;
          }

          .hero,
          .archive-block,
          .table-panel,
          .station-card,
          .summary-card {
            border: 1px solid var(--border);
            background: var(--panel);
            box-shadow:
              inset 0 1px 0 rgba(255, 255, 255, 0.04),
              0 0 0 1px rgba(102, 217, 255, 0.03),
              0 18px 44px -34px rgba(61, 98, 255, 0.45);
          }

          .hero {
            border-radius: 28px;
            padding: 28px;
            position: relative;
            overflow: hidden;
          }

          .hero::before {
            content: "";
            position: absolute;
            inset: 0;
            background:
              radial-gradient(circle at top left, rgba(122, 162, 255, 0.18), transparent 24rem),
              linear-gradient(130deg, transparent 0%, rgba(255, 255, 255, 0.03) 48%, transparent 52%);
            pointer-events: none;
          }

          .hero-content,
          .tabs,
          .tab-panel,
          .table-wrap,
          .flow-grid,
          .summary-grid,
          .station-grid {
            position: relative;
            z-index: 1;
          }

          .hero h1 {
            margin: 10px 0 0;
            font-size: clamp(2rem, 4vw, 3.4rem);
            line-height: 1.04;
          }

          .hero p {
            color: var(--muted);
            line-height: 1.75;
          }

          .eyebrow {
            margin: 0 0 10px;
            font-size: 11px;
            letter-spacing: 0.28em;
            text-transform: uppercase;
            color: rgba(152, 186, 255, 0.9);
          }

          .hero-actions {
            margin-top: 18px;
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
          }

          .hero-actions button {
            border: 1px solid var(--border-strong);
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.05);
            color: var(--text);
            padding: 10px 18px;
            cursor: pointer;
          }

          .summary-grid,
          .station-grid {
            display: grid;
            gap: 16px;
            margin-top: 24px;
          }

          .summary-grid {
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          }

          .station-grid {
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          }

          .summary-card,
          .station-card {
            border-radius: 22px;
            padding: 18px;
          }

          .summary-card strong {
            display: block;
            margin-top: 12px;
            font-size: 2rem;
          }

          .summary-card span,
          .subtle {
            color: var(--muted);
          }

          .tabs {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin: 28px 0 18px;
          }

          .tabs button {
            border: 1px solid var(--border);
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.03);
            color: var(--muted);
            padding: 10px 16px;
            font-weight: 600;
            cursor: pointer;
          }

          .tabs button.active {
            color: var(--text);
            border-color: rgba(122, 162, 255, 0.42);
            background: linear-gradient(135deg, rgba(109, 147, 255, 0.25), rgba(75, 211, 255, 0.16));
          }

          .tab-panel { display: none; }
          .tab-panel.active { display: block; }

          .archive-block,
          .table-panel {
            border-radius: 26px;
            padding: 22px;
            margin-top: 18px;
          }

          .archive-block-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 10px;
          }

          .archive-block h2,
          .archive-block h3,
          .table-panel h2 {
            margin: 0;
          }

          .station-order,
          .progress-pill,
          .status-badge,
          .progress-chip {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            padding: 6px 10px;
            font-size: 12px;
            font-weight: 700;
          }

          .station-order,
          .progress-chip {
            border: 1px solid rgba(122, 162, 255, 0.2);
            background: rgba(122, 162, 255, 0.1);
            color: #dfe8ff;
          }

          .progress-pill {
            border: 1px solid rgba(102, 217, 255, 0.2);
            background: rgba(102, 217, 255, 0.11);
            color: #dff9ff;
          }

          .tone-success { background: rgba(88, 214, 163, 0.14); color: #dff9ed; border: 1px solid rgba(88, 214, 163, 0.24); }
          .tone-warning { background: rgba(243, 201, 105, 0.14); color: #fff0c9; border: 1px solid rgba(243, 201, 105, 0.24); }
          .tone-danger { background: rgba(243, 141, 160, 0.14); color: #ffdce4; border: 1px solid rgba(243, 141, 160, 0.24); }
          .tone-muted { background: rgba(255, 255, 255, 0.06); color: #e1e8ff; border: 1px solid rgba(255, 255, 255, 0.1); }

          .meta-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
            margin-top: 16px;
          }

          .meta-grid div {
            border-radius: 18px;
            background: rgba(255, 255, 255, 0.03);
            padding: 12px;
          }

          .meta-grid span {
            display: block;
            color: var(--muted);
            font-size: 12px;
            margin-bottom: 6px;
          }

          .meta-grid strong {
            font-size: 1.1rem;
          }

          .table-wrap {
            overflow-x: auto;
            margin-top: 16px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            min-width: 860px;
          }

          th,
          td {
            padding: 14px 12px;
            border-bottom: 1px solid rgba(122, 162, 255, 0.1);
            vertical-align: top;
            text-align: left;
            font-size: 14px;
            line-height: 1.6;
          }

          th {
            position: sticky;
            top: 0;
            background: rgba(22, 31, 50, 0.98);
            color: rgba(223, 232, 255, 0.84);
            font-size: 12px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            z-index: 1;
          }

          .th-sub,
          .cell-sub {
            display: block;
            color: var(--muted);
            font-size: 12px;
            letter-spacing: 0;
            text-transform: none;
          }

          .cell-title {
            font-weight: 700;
            margin-bottom: 4px;
          }

          .sticky-cell {
            min-width: 220px;
          }

          .flow-grid {
            display: grid;
            gap: 18px;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            margin-top: 18px;
          }

          .flow-grid h4 {
            margin: 0 0 12px;
          }

          .flow-list,
          .content-stack {
            margin: 0;
            padding: 0;
            display: grid;
            gap: 12px;
          }

          .flow-list {
            padding-left: 20px;
          }

          .flow-list li,
          .content-card {
            border-radius: 18px;
            border: 1px solid rgba(122, 162, 255, 0.1);
            background: rgba(255, 255, 255, 0.025);
            padding: 14px;
          }

          .flow-list li p,
          .content-card p,
          .json-block {
            white-space: pre-wrap;
            word-break: break-word;
          }

          .content-order {
            font-size: 12px;
            color: var(--muted);
            margin-bottom: 8px;
          }

          .warning-box {
            margin-top: 18px;
            border-radius: 18px;
            border: 1px solid rgba(243, 201, 105, 0.22);
            background: rgba(243, 201, 105, 0.08);
            padding: 14px 16px;
            color: #fff0c9;
          }

          .warning-box ul {
            margin: 8px 0 0;
            padding-left: 18px;
          }

          .empty,
          .empty-cell {
            color: var(--muted);
          }

          .json-panel {
            margin-top: 18px;
          }

          .json-block {
            margin: 0;
            padding: 18px;
            border-radius: 20px;
            border: 1px solid rgba(122, 162, 255, 0.1);
            background: rgba(6, 10, 20, 0.7);
            color: #d9e5ff;
            overflow-x: auto;
            font-size: 12px;
          }

          @media (max-width: 960px) {
            .flow-grid {
              grid-template-columns: 1fr;
            }

            .shell {
              width: min(100vw - 20px, 100%);
            }
          }
        </style>
      </head>
      <body>
        <div class="shell">
          <section class="hero">
            <div class="hero-content">
              <p class="eyebrow">Station Status Hub Archive</p>
              <h1>專案網站封存快照</h1>
              <p>
                這是一份在專案結束時產生的 HTML 封存檔，內容包含系統儀表板摘要、系統進度、
                站點流程設定、問題追蹤與 Troubleshooting 記錄。此檔案可離線保存與交接，但不會再與資料庫同步。
              </p>
              <div class="hero-actions">
                <button onclick="window.print()">列印 / 存成 PDF</button>
                <button onclick="window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })">查看原始 JSON</button>
              </div>

              <div class="summary-grid">
                <article class="summary-card">
                  <span>封存時間</span>
                  <strong>${safeText(formatDateTime(exportedAt.toISOString()))}</strong>
                </article>
                <article class="summary-card">
                  <span>匯出人員</span>
                  <strong>${safeText(exportedBy || "未記錄")}</strong>
                </article>
                <article class="summary-card">
                  <span>系統總數</span>
                  <strong>${filteredSystems.length}</strong>
                </article>
                <article class="summary-card">
                  <span>完成率</span>
                  <strong>${completionRate}%</strong>
                </article>
                <article class="summary-card">
                  <span>未結案問題</span>
                  <strong>${issueOpenCount}</strong>
                </article>
                <article class="summary-card">
                  <span>Troubleshooting 未結案</span>
                  <strong>${troubleshootingOpenCount}</strong>
                </article>
              </div>

              <div class="station-grid">
                ${stationSummaryCards}
              </div>

              ${
                warnings.length
                  ? `
                    <div class="warning-box">
                      <strong>封存提醒</strong>
                      <ul>
                        ${warnings.map((warning) => `<li>${safeText(warning)}</li>`).join("")}
                      </ul>
                    </div>
                  `
                  : ""
              }
            </div>
          </section>

          <div class="tabs">
            <button class="active" data-tab-target="systems">系統進度</button>
            <button data-tab-target="flow">流程設定</button>
            <button data-tab-target="issues">問題追蹤</button>
            <button data-tab-target="troubleshooting">Troubleshooting</button>
            <button data-tab-target="json">原始 JSON</button>
          </div>

          <section class="tab-panel active" data-tab-panel="systems">
            <section class="table-panel">
              <p class="eyebrow">Dashboard Snapshot</p>
              <h2>系統進度總覽</h2>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>機台</th>
                      <th>狀態</th>
                      <th>目前站點</th>
                      <th>整體進度</th>
                      <th>開始時間</th>
                      <th>完成時間</th>
                      ${systemTableHeaders}
                    </tr>
                  </thead>
                  <tbody>
                    ${systemTableRows || `<tr><td colspan="${6 + sortedStations.length}" class="empty-cell">目前沒有可封存的系統資料。</td></tr>`}
                  </tbody>
                </table>
              </div>
            </section>
          </section>

          <section class="tab-panel" data-tab-panel="flow">
            ${stationFlowBlocks}
          </section>

          <section class="tab-panel" data-tab-panel="issues">
            <section class="table-panel">
              <p class="eyebrow">Issue Tracking</p>
              <h2>問題追蹤封存</h2>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>問題</th>
                      <th>系統</th>
                      <th>站點</th>
                      <th>狀態</th>
                      <th>優先級</th>
                      <th>指派人員</th>
                      <th>建立時間</th>
                      <th>附件</th>
                    </tr>
                  </thead>
                  <tbody>${issueRows}</tbody>
                </table>
              </div>
            </section>
          </section>

          <section class="tab-panel" data-tab-panel="troubleshooting">
            <section class="table-panel">
              <p class="eyebrow">Troubleshooting</p>
              <h2>問題統計與處理紀錄</h2>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>事件</th>
                      <th>問題類型</th>
                      <th>分類</th>
                      <th>嚴重度</th>
                      <th>狀態</th>
                      <th>發生時間</th>
                      <th>完成時間</th>
                      <th>處理摘要</th>
                    </tr>
                  </thead>
                  <tbody>${troubleshootingRows}</tbody>
                </table>
              </div>
            </section>
          </section>

          <section class="tab-panel json-panel" data-tab-panel="json">
            <section class="archive-block">
              <p class="eyebrow">Archive Payload</p>
              <h2>原始 JSON 資料</h2>
              <p class="subtle">如果之後需要重建資料、比對版本或寫轉換工具，這份 JSON 會最完整。</p>
              <pre class="json-block">${archiveJson}</pre>
            </section>
          </section>
        </div>

        <script>
          const tabButtons = document.querySelectorAll("[data-tab-target]");
          const tabPanels = document.querySelectorAll("[data-tab-panel]");

          tabButtons.forEach((button) => {
            button.addEventListener("click", () => {
              const target = button.getAttribute("data-tab-target");

              tabButtons.forEach((candidate) => candidate.classList.remove("active"));
              tabPanels.forEach((panel) => panel.classList.remove("active"));

              button.classList.add("active");
              const panel = document.querySelector('[data-tab-panel="' + target + '"]');
              if (panel) panel.classList.add("active");
            });
          });
        </script>
      </body>
    </html>
  `;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildFileName();
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);

  return {
    warnings,
  };
}
