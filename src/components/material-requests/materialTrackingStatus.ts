export const MATERIAL_TRACKING_STATUS_OPTIONS = ["未處理", "需申請", "已發信", "未回應再次發信", "與廠商溝通中", "文件已收齊", "料號申請中", "已取得料號待CIS申請", "SYMBOL申請中", "申請料被退回", "已完成"] as const;

export function getMaterialTrackingStatusMeaning(status?: string) {
  if (status === "需申請") return "此料件仍需提出申請";
  if (status === "料號申請中") return "全新料號";
  if (status === "SYMBOL申請中") return "已有料號，需申請 SYMBOL";
  if (status === "已取得料號待CIS申請") return "已取得料號，等待 CIS 申請";
  return "";
}

/** Manual application progress is independent of CE's imported Schematic_Part text. */
export function isExplicitMaterialApplication(status?: string, applicationRequired?: boolean) {
  // Preserve the short-lived independent flag on already-saved records.
  return applicationRequired === true || status === "需申請" || status === "料號申請中" || status === "SYMBOL申請中" || status === "已取得料號待CIS申請"
    || status === "未回應再次發信" || status === "與廠商溝通中" || status === "申請料被退回";
}

type MaterialApplicationTracking = {
  trackingStatus?: string;
  applicationRequired?: boolean;
  trackingHistory?: readonly { id: string; status: string }[];
};

/** An application belongs to this board's process even after its number is issued or it is completed. */
export function isTrackedMaterialApplication(record: MaterialApplicationTracking) {
  if (isExplicitMaterialApplication(record.trackingStatus, record.applicationRequired)) return true;
  return record.trackingHistory?.some(entry => {
    if (isExplicitMaterialApplication(entry.status)) return true;
    // Imported BOM status/note rows alone do not prove that this vendor was applied for.
    // Both timestamp IDs and UUID IDs are used by actual updates made in this editor.
    return entry.id.startsWith("tracking-") && (
      MATERIAL_TRACKING_STATUS_OPTIONS.some(status => status === normalizeMaterialTrackingStatus(entry.status))
      || normalizeMaterialTrackingStatus(entry.status) === "處理中"
    );
  }) ?? false;
}

export function materialTrackingStatusTone(status?: string) {
  return materialTrackingStatusPresentation(status).badge;
}

// Fixed semantic colours keep application stages distinct even when the site accent changes.
export function materialTrackingStatusPresentation(status?: string) {
  switch (status?.trim()) {
    case "需申請": return statusClasses("required");
    case "已發信": return statusClasses("sent");
    case "未回應再次發信": return statusClasses("reminder");
    case "與廠商溝通中": return statusClasses("communicating");
    case "申請料被退回": return statusClasses("returned");
    case "文件已收齊": return statusClasses("documents");
    case "料號申請中": return statusClasses("part");
    case "SYMBOL申請中": return statusClasses("symbol");
    case "已取得料號待CIS申請": return statusClasses("cis");
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
