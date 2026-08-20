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
  | "api_management_edit"
  | "pcb_designer_view"
  | "pcb_designer_edit"
  | "test_plan_view"
  | "test_plan_edit"
  | "performance_view"
  | "performance_edit";

export type WorkspaceId =
  | "station-status"
  | "material-requests"
  | "data-center"
  | "pcb-designer"
  | "user-management"
  | "ai-chat"
  | "performance";

export type WorkspaceAccessLevel = "none" | "view" | "edit";

export interface WorkspaceAccessMap {
  "station-status": WorkspaceAccessLevel;
  "material-requests": WorkspaceAccessLevel;
  "data-center": WorkspaceAccessLevel;
  "pcb-designer": WorkspaceAccessLevel;
  "user-management": WorkspaceAccessLevel;
  "ai-chat": WorkspaceAccessLevel;
  performance: WorkspaceAccessLevel;
}

export interface UserPermissionSettings {
  workspaceAccess?: Partial<WorkspaceAccessMap>;
  [key: string]: unknown;
}

export const DEFAULT_WORKSPACE_ACCESS: WorkspaceAccessMap = {
  "station-status": "none",
  "material-requests": "none",
  "data-center": "none",
  "pcb-designer": "none",
  "user-management": "none",
  "ai-chat": "none",
  performance: "none",
};

export const WORKSPACE_LABELS: Record<WorkspaceId, string> = {
  "station-status": "機台維修紀錄中心",
  "material-requests": "料號申請",
  "data-center": "Data Center",
  "pcb-designer": "PCB Designer",
  "user-management": "後台管理",
  "ai-chat": "資料查詢空間",
  performance: "績效考核系統",
};

export const WORKSPACE_IDS = Object.keys(WORKSPACE_LABELS) as WorkspaceId[];

export const MODULE_WORKSPACE_MAP: Partial<Record<string, WorkspaceId>> = {
  dashboard: "station-status",
  "test-tracker": "station-status",
  "flow-info": "station-status",
  monitor: "station-status",
  issues: "station-status",
  tools: "station-status",
  "test-plan": "station-status",
  "material-requests": "material-requests",
  data: "data-center",
  "data-center": "data-center",
  "pcb-designer": "pcb-designer",
  users: "user-management",
  collaboration: "user-management",
  "api-management": "user-management",
  "ai-chat": "ai-chat",
  performance: "performance",
};

export const MODULE_PERMISSION_PREFIX: Record<string, string> = {
  dashboard: "dashboard",
  "test-tracker": "test_tracker",
  "flow-info": "flow_info",
  monitor: "production",
  issues: "issues",
  tools: "tools",
  users: "admin",
  collaboration: "admin",
  "api-management": "api_management",
  "ai-chat": "comparison",
  comparison: "comparison",
  "material-requests": "data_center",
  data: "data_center",
  "data-center": "data_center",
  "pcb-designer": "pcb_designer",
  "test-plan": "test_plan",
  performance: "performance",
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
  pcb_designer: {
    name: "PCB Designer",
    permissions: [
      { key: "pcb_designer_view", label: "檢視 PCB Designer" },
      { key: "pcb_designer_edit", label: "編輯 PCB Designer" },
    ],
  },
  test_plan: {
    name: "資料儲存",
    permissions: [
      { key: "test_plan_view", label: "檢視 資料儲存" },
      { key: "test_plan_edit", label: "管理 資料儲存" },
    ],
  },
  performance: {
    name: "績效考核系統",
    permissions: [
      { key: "performance_view", label: "檢視績效考核" },
      { key: "performance_edit", label: "管理績效考核" },
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
  // PCB Designer was added after Data-center. Existing accounts that predate
  // the new key keep their previous workspace level until an administrator
  // explicitly configures PCB Designer.
  const pcbAccess = value?.["pcb-designer"] ?? value?.["data-center"] ?? "none";
  return {
    "station-status": value?.["station-status"] ?? "none",
    "material-requests": value?.["material-requests"] ?? "none",
    "data-center": value?.["data-center"] ?? "none",
    "pcb-designer": pcbAccess,
    "user-management": value?.["user-management"] ?? "none",
    "ai-chat": value?.["ai-chat"] ?? "none",
    performance: value?.performance ?? "none",
  };
}

function getLegacyAccessLevel(
  permissions: Permission[],
  prefixes: string[],
): WorkspaceAccessLevel {
  if (prefixes.some((prefix) => permissions.includes(`${prefix}_edit` as Permission))) {
    return "edit";
  }
  if (prefixes.some((prefix) => permissions.includes(`${prefix}_view` as Permission))) {
    return "view";
  }
  return "none";
}

export function readWorkspaceAccess(
  value: unknown,
  permissions: Permission[] = [],
): WorkspaceAccessMap {
  const settings = value && typeof value === "object"
    ? value as UserPermissionSettings
    : {};
  const configured = settings.workspaceAccess;
  const normalized = normalizeWorkspaceAccess(configured);
  const hasOwn = (workspace: WorkspaceId) => Boolean(
    configured && Object.prototype.hasOwnProperty.call(configured, workspace),
  );

  const stationLevel = getLegacyAccessLevel(permissions, [
    "dashboard",
    "test_tracker",
    "flow_info",
    "issues",
    "production",
    "tools",
    "test_plan",
  ]);
  const dataCenterLevel = getLegacyAccessLevel(permissions, ["data_center"]);
  const apiLevel = getLegacyAccessLevel(permissions, ["api_management"]);

  return {
    "station-status": hasOwn("station-status")
      ? normalized["station-status"]
      : stationLevel,
    "material-requests": hasOwn("material-requests")
      ? normalized["material-requests"]
      : dataCenterLevel,
    "data-center": hasOwn("data-center")
      ? normalized["data-center"]
      : dataCenterLevel,
    "pcb-designer": hasOwn("pcb-designer") || hasOwn("data-center")
      ? normalized["pcb-designer"]
      : getLegacyAccessLevel(permissions, ["pcb_designer", "data_center"]),
    "user-management": hasOwn("user-management")
      ? normalized["user-management"]
      : getLegacyAccessLevel(permissions, ["admin", "api_management"]),
    "ai-chat": hasOwn("ai-chat")
      ? normalized["ai-chat"]
      : getLegacyAccessLevel(permissions, ["comparison", "api_management"]),
    performance: hasOwn("performance")
      ? normalized.performance
      : getLegacyAccessLevel(permissions, ["performance"]),
  };
}

const STATION_STATUS_PERMISSIONS = Object.entries(MODULE_WORKSPACE_MAP)
  .filter(([, workspace]) => workspace === "station-status")
  .flatMap(([module]) => {
    const prefix = MODULE_PERMISSION_PREFIX[module];
    return prefix
      ? ([`${prefix}_view`, `${prefix}_edit`] as Permission[])
      : [];
  });

const USER_MANAGEMENT_PERMISSIONS: Permission[] = [
  "admin_view",
  "admin_edit",
  "api_management_view",
  "api_management_edit",
];

function hasConfiguredWorkspace(
  settings: UserPermissionSettings | null | undefined,
  workspace: WorkspaceId
) {
  const workspaceAccess = settings?.workspaceAccess;
  const configured = Boolean(
    workspaceAccess &&
      Object.prototype.hasOwnProperty.call(workspaceAccess, workspace)
  );
  if (configured || workspace !== "pcb-designer") return configured;

  return Boolean(
    workspaceAccess &&
      Object.prototype.hasOwnProperty.call(workspaceAccess, "data-center")
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

function hasCompatiblePagePermission(
  module: string,
  action: "view" | "edit",
  permissions: Permission[],
) {
  if (hasPagePermission(module, action, permissions)) return true;

  // 資料查詢空間曾與 API 管理共用權限；未完成新版工作區設定前保留舊帳號入口。
  return module === "ai-chat"
    ? hasPagePermission("api-management", action, permissions)
    : false;
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
    return hasCompatiblePagePermission(module, action, permissions);
  }

  if (!hasConfiguredWorkspace(permissionSettings, workspace)) {
    return hasCompatiblePagePermission(module, action, permissions);
  }

  const level = normalizeWorkspaceAccess(permissionSettings?.workspaceAccess)[workspace];
  if (level === "none") return false;
  if (action === "edit" && level !== "edit") return false;

  // Test_Plan is an inherited child of the maintenance workspace rather than
  // an independently assigned page. Configured maintenance access is therefore
  // its complete permission contract.
  if (module === "test-plan") return true;

  // 單頁工作區直接以工作區層級為完整權限；維修中心與後台管理仍需符合內頁權限。
  if (workspace !== "station-status" && workspace !== "user-management") return true;
  return hasCompatiblePagePermission(module, action, permissions);
}

export function synchronizeWorkspacePermissions(
  current: Permission[],
  workspace: WorkspaceId,
  level: WorkspaceAccessLevel
) {
  const workspacePermissions = workspace === "station-status"
    ? STATION_STATUS_PERMISSIONS
    : workspace === "user-management"
      ? USER_MANAGEMENT_PERMISSIONS
      : null;
  if (!workspacePermissions) return current;

  const outsideWorkspace = current.filter(
    (permission) => !workspacePermissions.includes(permission)
  );
  if (level === "none") return outsideWorkspace;

  const scopedPermissions = workspacePermissions.filter(
    (permission) => level === "edit" || permission.endsWith("_view")
  );
  return Array.from(new Set([...outsideWorkspace, ...scopedPermissions]));
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
