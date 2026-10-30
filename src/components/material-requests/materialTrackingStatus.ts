export const MATERIAL_TRACKING_STATUS_OPTIONS = ["未處理", "已發信", "文件已收齊", "料號申請中", "SYMBOL申請中", "已完成"] as const;

export function getMaterialTrackingStatusMeaning(status?: string) {
  if (status === "料號申請中") return "全新料號";
  if (status === "SYMBOL申請中") return "已有料號，需申請 SYMBOL";
  return "";
}

/** Manual application progress is independent of CE's imported Schematic_Part text. */
export function isExplicitMaterialApplication(status?: string) {
  return status === "料號申請中" || status === "SYMBOL申請中";
}

export function materialTrackingStatusTone(status?: string) {
  return materialTrackingStatusPresentation(status).badge;
}

// Fixed semantic colours keep the six application stages distinct even when the site accent changes.
export function materialTrackingStatusPresentation(status?: string) {
  switch (status?.trim()) {
    case "已發信": return statusClasses("sent");
    case "文件已收齊": return statusClasses("documents");
    case "料號申請中": return statusClasses("part");
    case "SYMBOL申請中": return statusClasses("symbol");
    case "已完成": return statusClasses("completed");
    case "處理中": return statusClasses("legacy-progress");
    default: return statusClasses("unprocessed");
  }
}

function statusClasses(tone: string) {
  const colour = `material-status--${tone}`;
  return { badge: `material-status-badge ${colour}`, surface: `material-status-surface ${colour}`, text: `material-status-text ${colour}` };
}

/** Display legacy wording without collapsing the six manual stages or guessing from substrings. */
export function normalizeMaterialTrackingStatus(status?: string) {
  const value = status?.trim() ?? "";
  if (!value || value === "無狀態") return "未處理";
  if (/^(ok|approved|完成申請|結案|完成)$/i.test(value)) return "已完成";
  if (/^(progress|working|wip)$/i.test(value)) return "處理中";
  return value;
}
