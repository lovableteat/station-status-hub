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
  if (status === "已完成") return "border-success/35 bg-success/15 text-success";
  if (status === "料號申請中") return "border-warning/40 bg-warning/20 text-warning";
  if (status === "SYMBOL申請中") return "border-primary/50 bg-primary/20 text-primary";
  if (status === "已發信" || status === "文件已收齊" || status === "處理中" || status === "新增追蹤") return "border-primary/30 bg-primary/10 text-primary";
  return "border-border bg-secondary text-secondary-foreground";
}
