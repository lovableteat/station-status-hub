export type Permission =
  | "dashboard_view"
  | "dashboard_edit"
  | "test_tracker_view"
  | "test_tracker_edit"
  | "issues_view"
  | "issues_edit"
  | "production_view"
  | "production_edit"
  | "data_center_view"
  | "data_center_edit"
  | "tools_view"
  | "tools_edit"
  | "admin_view"
  | "admin_edit"
  | "comparison_view"
  | "comparison_edit"
  | "api_management_view"
  | "api_management_edit";

export type WorkspaceId =
  | "station-status"
  | "material-requests"
  | "data-center";

export type WorkspaceAccessLevel = "none" | "view" | "edit";

export interface WorkspaceAccessMap {
  "station-status": WorkspaceAccessLevel;
  "material-requests": WorkspaceAccessLevel;
  "data-center": WorkspaceAccessLevel;
}

export interface UserPermissionSettings {
  workspaceAccess?: Partial<WorkspaceAccessMap>;
  [key: string]: unknown;
}

export const DEFAULT_WORKSPACE_ACCESS: WorkspaceAccessMap = {
  "station-status": "none",
  "material-requests": "none",
  "data-center": "none",
};

export const WORKSPACE_LABELS: Record<WorkspaceId, string> = {
  "station-status": "機台維修紀錄中心",
  "material-requests": "料號申請",
  "data-center": "Data-center",
};

export const MODULE_WORKSPACE_MAP: Record<string, WorkspaceId> = {
  dashboard: "station-status",
  "test-tracker": "station-status",
  "flow-info": "station-status",
  monitor: "station-status",
  issues: "station-status",
  tools: "station-status",
  users: "station-status",
  "api-management": "station-status",
  "material-requests": "material-requests",
  data: "data-center",
  "data-center": "data-center",
};

export const LEGACY_PAGE_PERMISSION_GROUPS: Record<
  string,
  {
    name: string;
    permissions: Array<{ key: Permission; label: string }>;
  }
> = {
  dashboard: {
    name: "儀表板",
    permissions: [
      { key: "dashboard_view", label: "檢視儀表板" },
      { key: "dashboard_edit", label: "編輯儀表板" },
    ],
  },
  test_tracker: {
    name: "L10 測試追蹤",
    permissions: [
      { key: "test_tracker_view", label: "檢視測試追蹤" },
      { key: "test_tracker_edit", label: "編輯測試追蹤" },
    ],
  },
  issues: {
    name: "問題追蹤與報告",
    permissions: [
      { key: "issues_view", label: "檢視問題追蹤與統計" },
      { key: "issues_edit", label: "編輯問題追蹤與統計" },
    ],
  },
  production: {
    name: "產線監控",
    permissions: [
      { key: "production_view", label: "檢視產線監控" },
      { key: "production_edit", label: "編輯產線監控" },
    ],
  },
  data_center: {
    name: "舊版資料中心權限",
    permissions: [
      { key: "data_center_view", label: "檢視資料中心 / 料號申請（舊）" },
      { key: "data_center_edit", label: "編輯資料中心 / 料號申請（舊）" },
    ],
  },
  api_management: {
    name: "API 管理",
    permissions: [
      { key: "api_management_view", label: "檢視 API 管理" },
      { key: "api_management_edit", label: "編輯 API 管理" },
    ],
  },
  comparison_center: {
    name: "比對中心",
    permissions: [
      { key: "comparison_view", label: "檢視比對中心" },
      { key: "comparison_edit", label: "編輯比對中心" },
    ],
  },
  tools: {
    name: "工具管理",
    permissions: [
      { key: "tools_view", label: "檢視工具管理" },
      { key: "tools_edit", label: "編輯工具管理" },
    ],
  },
  admin: {
    name: "後台管理",
    permissions: [
      { key: "admin_view", label: "檢視後台管理" },
      { key: "admin_edit", label: "編輯後台管理" },
    ],
  },
};

export const ALL_PAGE_PERMISSIONS: Permission[] = Object.values(
  LEGACY_PAGE_PERMISSION_GROUPS
)
  .flatMap((group) => group.permissions)
  .map((permission) => permission.key);

export function normalizeWorkspaceAccess(
  value?: Partial<WorkspaceAccessMap> | null
): WorkspaceAccessMap {
  return {
    "station-status": value?.["station-status"] ?? "none",
    "material-requests": value?.["material-requests"] ?? "none",
    "data-center": value?.["data-center"] ?? "none",
  };
}

export function readWorkspaceAccess(value: unknown): WorkspaceAccessMap {
  if (!value || typeof value !== "object") {
    return DEFAULT_WORKSPACE_ACCESS;
  }

  const workspaceAccess = (value as UserPermissionSettings).workspaceAccess;
  return normalizeWorkspaceAccess(workspaceAccess);
}

export function getWorkspaceLevelLabel(level: WorkspaceAccessLevel) {
  switch (level) {
    case "edit":
      return "管理";
    case "view":
      return "檢視";
    default:
      return "未授權";
  }
}
