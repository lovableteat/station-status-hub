export type Permission =
  | "dashboard_view"
  | "dashboard_edit"
  | "test_tracker_view"
  | "test_tracker_edit"
  | "flow_info_view"
  | "flow_info_edit"
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

export const MODULE_WORKSPACE_MAP: Partial<Record<string, WorkspaceId>> = {
  dashboard: "station-status",
  "test-tracker": "station-status",
  "flow-info": "station-status",
  monitor: "station-status",
  issues: "station-status",
  tools: "station-status",
  "material-requests": "material-requests",
  data: "data-center",
  "data-center": "data-center",
};

export const MODULE_PERMISSION_PREFIX: Record<string, string> = {
  dashboard: "dashboard",
  "test-tracker": "test_tracker",
  "flow-info": "flow_info",
  monitor: "production",
  issues: "issues",
  tools: "tools",
  users: "admin",
  "api-management": "api_management",
  comparison: "comparison",
  "material-requests": "data_center",
  data: "data_center",
  "data-center": "data_center",
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
  flow_info: {
    name: "L10 測試流程設定",
    permissions: [
      { key: "flow_info_view", label: "檢視測試流程設定" },
      { key: "flow_info_edit", label: "編輯測試流程設定" },
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

const STATION_STATUS_PERMISSIONS = Object.entries(MODULE_WORKSPACE_MAP)
  .filter(([, workspace]) => workspace === "station-status")
  .flatMap(([module]) => {
    const prefix = MODULE_PERMISSION_PREFIX[module];
    return prefix
      ? ([`${prefix}_view`, `${prefix}_edit`] as Permission[])
      : [];
  });

function hasConfiguredWorkspace(
  settings: UserPermissionSettings | null | undefined,
  workspace: WorkspaceId
) {
  const workspaceAccess = settings?.workspaceAccess;
  return Boolean(
    workspaceAccess &&
      Object.prototype.hasOwnProperty.call(workspaceAccess, workspace)
  );
}

function hasPagePermission(
  module: string,
  action: "view" | "edit",
  permissions: Permission[]
) {
  const prefix = MODULE_PERMISSION_PREFIX[module];
  if (!prefix) return false;

  const editPermission = `${prefix}_edit` as Permission;
  if (action === "edit") return permissions.includes(editPermission);

  return (
    permissions.includes(`${prefix}_view` as Permission) ||
    permissions.includes(editPermission)
  );
}

export function canAccessModule({
  module,
  action,
  role,
  permissions,
  permissionSettings,
}: {
  module: string;
  action: "view" | "edit";
  role?: string | null;
  permissions: Permission[];
  permissionSettings?: UserPermissionSettings | null;
}) {
  if (role === "admin" || role === "super_admin") return true;

  const workspace = MODULE_WORKSPACE_MAP[module];
  if (!workspace) {
    return hasPagePermission(module, action, permissions);
  }

  if (!hasConfiguredWorkspace(permissionSettings, workspace)) {
    return hasPagePermission(module, action, permissions);
  }

  const level = normalizeWorkspaceAccess(permissionSettings?.workspaceAccess)[workspace];
  if (level === "none") return false;
  if (action === "edit" && level !== "edit") return false;

  // Material requests and Data-center each contain one page, so the workspace
  // level is their complete permission. Station status still requires the
  // matching page permission to prevent one broad setting from unlocking all modules.
  if (workspace !== "station-status") return true;
  return hasPagePermission(module, action, permissions);
}

export function synchronizeWorkspacePermissions(
  current: Permission[],
  workspace: WorkspaceId,
  level: WorkspaceAccessLevel
) {
  if (workspace !== "station-status") return current;

  const outsideWorkspace = current.filter(
    (permission) => !STATION_STATUS_PERMISSIONS.includes(permission)
  );
  if (level === "none") return outsideWorkspace;

  const stationPermissions = STATION_STATUS_PERMISSIONS.filter(
    (permission) => level === "edit" || permission.endsWith("_view")
  );
  return Array.from(new Set([...outsideWorkspace, ...stationPermissions]));
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
