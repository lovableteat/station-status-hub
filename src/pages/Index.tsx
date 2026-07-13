import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  Factory,
  FileText,
  LayoutDashboard,
  MessageSquareText,
  ServerCog,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { LoginPage } from "@/components/auth/LoginPage";
import { useUser } from "@/components/auth/UserContext";
import { FacebookStyleNotifications } from "@/components/common/FacebookStyleNotifications";
import { OnlineUsersIndicator } from "@/components/common/OnlineUsersIndicator";
import { RealtimeNotifications } from "@/components/common/RealtimeNotifications";
import { UpdateIndicator } from "@/components/common/UpdateIndicator";
import { MainWorkspaceHeader } from "@/components/layout/MainWorkspaceHeader";
import { PermissionGuard } from "@/components/layout/PermissionGuard";
import { Sidebar } from "@/components/layout/Sidebar";
import { WorkspaceEntrance } from "@/components/layout/WorkspaceEntrance";
import { MaintenanceLoading } from "@/components/maintenance/MaintenanceLoading";
import { ProjectScopeBar } from "@/components/test-projects/ProjectScopeBar";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { useUserPresence } from "@/hooks/useUserPresence";
import { cn } from "@/lib/utils";

const AdminPanel = React.lazy(() =>
  import("@/components/admin/AdminPanel").then((module) => ({ default: module.AdminPanel }))
);
const ApiChatWorkspacePage = React.lazy(() =>
  import("@/components/api-management/ApiChatWorkspacePage").then((module) => ({
    default: module.ApiChatWorkspacePage,
  }))
);
const DeploymentPlanningCenter = React.lazy(() =>
  import("@/components/data-center/DeploymentPlanningCenter").then((module) => ({
    default: module.DeploymentPlanningCenter,
  }))
);
const Dashboard = React.lazy(() =>
  import("@/components/dashboard/Dashboard").then((module) => ({ default: module.Dashboard }))
);
const IssueTracker = React.lazy(() =>
  import("@/components/issues/IssueTracker").then((module) => ({
    default: module.IssueTracker,
  }))
);
const MaterialRequestPage = React.lazy(() =>
  import("@/components/material-requests/MaterialRequestPage").then((module) => ({
    default: module.MaterialRequestPage,
  }))
);
const ProductionMonitor = React.lazy(() =>
  import("@/components/production/ProductionMonitor").then((module) => ({
    default: module.ProductionMonitor,
  }))
);
const FlowInfo = React.lazy(() =>
  import("@/components/test-tracker/FlowInfo").then((module) => ({ default: module.FlowInfo }))
);
const TestTracker = React.lazy(() =>
  import("@/components/test-tracker/TestTracker").then((module) => ({
    default: module.TestTracker,
  }))
);
const ToolsManagement = React.lazy(() =>
  import("@/components/tools/ToolsManagement").then((module) => ({
    default: module.ToolsManagement,
  }))
);

type WorkspaceId =
  | "station-status"
  | "material-requests"
  | "data-center"
  | "user-management"
  | "ai-chat";

type StationModuleId =
  | "dashboard"
  | "test-tracker"
  | "flow-info"
  | "monitor"
  | "issues"
  | "tools";

type AdminModuleId = "users" | "api-management";

const stationModuleItems: Array<{
  id: StationModuleId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "dashboard", label: "系統儀表板", icon: LayoutDashboard },
  { id: "test-tracker", label: "L10 測試追蹤", icon: ClipboardList },
  { id: "flow-info", label: "L10 流程設定", icon: FileText },
  { id: "monitor", label: "生產監控牆", icon: Factory },
  { id: "issues", label: "問題追蹤", icon: AlertTriangle },
  { id: "tools", label: "工具管理", icon: Wrench },
];

const moduleWorkspaceMap: Record<string, WorkspaceId> = {
  dashboard: "station-status",
  "test-tracker": "station-status",
  "flow-info": "station-status",
  monitor: "station-status",
  issues: "station-status",
  tools: "station-status",
  users: "user-management",
  "api-management": "user-management",
  "material-requests": "material-requests",
  data: "data-center",
  "data-center": "data-center",
  "ai-chat": "ai-chat",
};

const MODULE_QUERY_KEYS = [
  "assetView",
  "flowVersion",
  "flowView",
  "openIssue",
  "station",
  "system",
  "trackerView",
];

function pushWorkspaceLocation(
  workspace: WorkspaceId | null,
  module?: string,
  params?: Record<string, string>
) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  MODULE_QUERY_KEYS.forEach((key) => url.searchParams.delete(key));

  if (workspace) url.searchParams.set("workspace", workspace);
  else url.searchParams.delete("workspace");

  if (module) url.searchParams.set("module", module);
  else url.searchParams.delete("module");

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  window.history.pushState({}, "", url);
}

function getRoleLabel(role?: string) {
  switch (role) {
    case "super_admin":
      return "超級管理員";
    case "admin":
      return "管理員";
    default:
      return "一般使用者";
  }
}

function getInitialWorkspace(): WorkspaceId | null {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const workspace = params.get("workspace");
  const module = params.get("module");

  if (module === "users" || module === "api-management") {
    return "user-management";
  }

  if (module === "ai-chat") {
    return "ai-chat";
  }

  if (
    workspace === "station-status" ||
    workspace === "material-requests" ||
    workspace === "data-center" ||
    workspace === "user-management" ||
    workspace === "ai-chat"
  ) {
    return workspace;
  }

  return null;
}

function getInitialStationModule(): StationModuleId {
  if (typeof window === "undefined") {
    return "dashboard";
  }

  const value = new URLSearchParams(window.location.search).get("module");
  if (
    value === "dashboard" ||
    value === "test-tracker" ||
    value === "flow-info" ||
    value === "monitor" ||
    value === "issues" ||
    value === "tools"
  ) {
    return value;
  }

  return "dashboard";
}

function getInitialAdminModule(): AdminModuleId {
  if (typeof window === "undefined") {
    return "users";
  }

  const value = new URLSearchParams(window.location.search).get("module");
  if (value === "users" || value === "api-management") {
    return value;
  }

  return "users";
}

const Index = () => {
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId | null>(
    getInitialWorkspace
  );
  const [activeStationModule, setActiveStationModule] = useState<StationModuleId>(
    getInitialStationModule
  );
  const [activeAdminModule, setActiveAdminModule] = useState<AdminModuleId>(
    getInitialAdminModule
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const stationMainRef = useRef<HTMLElement | null>(null);

  const { login, isLoggedIn, logout, user } = useUser();
  const { updateCurrentModule } = useUserPresence();
  const { activeProjectId, isSwitchingProject } = useTestProject();
  const { isUpdating } = useUnifiedData();
  const { canViewModule } = usePermissions();
  const isMobile = useIsMobile();
  const isDemoMode =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("demo") === "admin";

  const workspaceCatalog = useMemo(
    () => [
      {
        id: "station-status" as const,
        label: "機台維修紀錄中心",
        description: "查看站點狀態、測試流程、生產監控與現場營運資訊。",
        icon: LayoutDashboard,
        visible: stationModuleItems.some((item) => canViewModule(item.id)),
      },
      {
        id: "material-requests" as const,
        label: "料號申請",
        description: "集中處理料號申請、替代料比對、BOM 匯入與協作作業。",
        icon: Boxes,
        visible: canViewModule("material-requests"),
      },
      {
        id: "data-center" as const,
        label: "Data-center",
        description: "規劃海外基櫃部署的位置、電力、散熱與網路資源。",
        icon: ServerCog,
        visible: canViewModule("data"),
      },
      {
        id: "user-management" as const,
        label: "後台管理",
        description: "集中管理帳號、工程師、權限與後台系統控制。",
        icon: ShieldCheck,
        visible: canViewModule("users") || canViewModule("api-management"),
      },
      {
        id: "ai-chat" as const,
        label: "資料查詢空間",
        description: "直接進入資料查詢工作區，用 API 查資料、整理結果與擷取圖片文字。",
        icon: MessageSquareText,
        visible: canViewModule("api-management"),
      },
    ],
    [canViewModule]
  );

  const workspaceItems = useMemo(
    () => [
      { id: "workspace-home", label: "首頁" },
      ...workspaceCatalog
        .filter((item) => item.visible)
        .map(({ id, label }) => ({ id, label })),
    ],
    [workspaceCatalog]
  );

  const entranceItems = useMemo(
    () =>
      workspaceCatalog
        .filter((item) => item.visible)
        .map(({ id, label, description, icon }) => ({
          id,
          title: label,
          description,
          icon,
        })),
    [workspaceCatalog]
  );

  const availableStationModules = useMemo(
    () => stationModuleItems.filter((item) => canViewModule(item.id)),
    [canViewModule]
  );

  useEffect(() => {
    if (activeWorkspace && !workspaceItems.some((item) => item.id === activeWorkspace)) {
      setActiveWorkspace(null);
    }
  }, [activeWorkspace, workspaceItems]);

  useEffect(() => {
    if (!availableStationModules.some((item) => item.id === activeStationModule)) {
      setActiveStationModule(availableStationModules[0]?.id ?? "dashboard");
    }
  }, [activeStationModule, availableStationModules]);

  useEffect(() => {
    const presenceModule =
      activeWorkspace === null
        ? "workspace-home"
        : activeWorkspace === "station-status"
          ? activeStationModule
          : activeWorkspace === "user-management"
            ? activeAdminModule
            : activeWorkspace;

    updateCurrentModule(presenceModule);
  }, [activeAdminModule, activeStationModule, activeWorkspace, updateCurrentModule]);

  useEffect(() => {
    const handleNavigationEvent = (
      event: CustomEvent<{ module: string; params?: Record<string, string> }>
    ) => {
      const module = event.detail?.module;
      if (!module) return;

      const targetWorkspace = moduleWorkspaceMap[module];
      if (!targetWorkspace) return;

      pushWorkspaceLocation(targetWorkspace, module, event.detail?.params);

      setActiveWorkspace(targetWorkspace);

      if (
        targetWorkspace === "station-status" &&
        stationModuleItems.some((item) => item.id === module)
      ) {
        setActiveStationModule(module as StationModuleId);
      }

      if (targetWorkspace === "user-management") {
        setActiveAdminModule(module === "api-management" ? "api-management" : "users");
      }
    };

    window.addEventListener("navigate", handleNavigationEvent as EventListener);
    return () => {
      window.removeEventListener("navigate", handleNavigationEvent as EventListener);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);

    if (activeWorkspace) url.searchParams.set("workspace", activeWorkspace);
    else url.searchParams.delete("workspace");

    if (activeWorkspace === "station-status") {
      url.searchParams.set("module", activeStationModule);
    } else if (activeWorkspace === "user-management") {
      url.searchParams.set("module", activeAdminModule);
    } else if (activeWorkspace === "ai-chat") {
      url.searchParams.set("module", "ai-chat");
    } else {
      url.searchParams.delete("module");
    }

    window.history.replaceState({}, "", url);
  }, [activeAdminModule, activeStationModule, activeWorkspace]);

  useEffect(() => {
    const handlePopState = () => {
      setActiveWorkspace(getInitialWorkspace());
      setActiveStationModule(getInitialStationModule());
      setActiveAdminModule(getInitialAdminModule());
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    stationMainRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [activeProjectId, activeStationModule]);

  if (!isLoggedIn) {
    return <LoginPage onLogin={login} />;
  }

  const handleWorkspaceChange = (workspace: string) => {
    if (workspace === "workspace-home") {
      pushWorkspaceLocation(null);
      setActiveWorkspace(null);
      return;
    }

    const nextWorkspace = workspace as WorkspaceId;
    const nextModule =
      nextWorkspace === "station-status"
        ? activeStationModule
        : nextWorkspace === "user-management"
          ? activeAdminModule
          : nextWorkspace === "ai-chat"
            ? "ai-chat"
            : undefined;
    pushWorkspaceLocation(nextWorkspace, nextModule);
    setActiveWorkspace(nextWorkspace);
  };

  const handleOpenNotifications = () => {
    window.dispatchEvent(new CustomEvent("open-global-notifications"));
  };

  const handleStationNavigation = (module: string, params?: Record<string, string>) => {
    pushWorkspaceLocation("station-status", module, params);
    setActiveWorkspace("station-status");
    setActiveStationModule(module as StationModuleId);
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const handleAdminNavigation = (module: AdminModuleId) => {
    pushWorkspaceLocation("user-management", module);
    setActiveWorkspace("user-management");
    setActiveAdminModule(module);
  };

  const renderStationContent = () => {
    switch (activeStationModule) {
      case "dashboard":
        return (
          <PermissionGuard module="dashboard">
            <Dashboard onNavigate={handleStationNavigation} />
          </PermissionGuard>
        );
      case "test-tracker":
        return (
          <PermissionGuard module="test-tracker">
            <TestTracker />
          </PermissionGuard>
        );
      case "flow-info":
        return (
          <PermissionGuard module="flow-info">
            <FlowInfo />
          </PermissionGuard>
        );
      case "monitor":
        return (
          <PermissionGuard module="monitor">
            <ProductionMonitor />
          </PermissionGuard>
        );
      case "issues":
        return (
          <PermissionGuard module="issues">
            <IssueTracker />
          </PermissionGuard>
        );
      case "tools":
        return (
          <PermissionGuard module="tools">
            <ToolsManagement />
          </PermissionGuard>
        );
      default:
        return null;
    }
  };

  const renderWorkspaceContent = () => {
    if (activeWorkspace === null) {
      return <WorkspaceEntrance items={entranceItems} onSelect={handleWorkspaceChange} />;
    }

    switch (activeWorkspace) {
      case "material-requests":
        return (
          <PermissionGuard module="material-requests">
            <MaterialRequestPage />
          </PermissionGuard>
        );
      case "data-center":
        return (
          <PermissionGuard module="data">
            <DeploymentPlanningCenter />
          </PermissionGuard>
        );
      case "user-management":
        return (
          <PermissionGuard
            module={activeAdminModule === "api-management" ? "api-management" : "users"}
          >
            <AdminPanel initialTab={activeAdminModule} />
          </PermissionGuard>
        );
      case "ai-chat":
        return (
          <PermissionGuard module="api-management">
            <ApiChatWorkspacePage />
          </PermissionGuard>
        );
      case "station-status":
      default:
        return (
          <div className="maintenance-workspace relative lg:h-full lg:overflow-hidden">
            {isMobile && sidebarOpen && (
              <div
                className="fixed inset-0 z-30 bg-black/50 lg:hidden"
                onClick={() => setSidebarOpen(false)}
              />
            )}

            <div className="flex h-full flex-col gap-3 px-3 pb-3 pt-3">
              <div className="shrink-0"><ProjectScopeBar /></div>

              <div className="relative flex min-h-[560px] flex-1 gap-3 lg:min-h-0">
                <Sidebar
                  activeModule={activeStationModule}
                  onModuleChange={handleStationNavigation}
                  isOpen={sidebarOpen}
                  onToggle={() => setSidebarOpen((value) => !value)}
                  isMobile={isMobile}
                  desktopStickyClass="top-[140px] h-full"
                />

                <main
                  ref={stationMainRef}
                  className={cn(
                    "min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-xl bg-[#06111f]",
                    isMobile && "pt-12"
                  )}
                >
                  {isSwitchingProject ? (
                    <MaintenanceLoading />
                  ) : (
                    <React.Suspense fallback={<MaintenanceLoading label="正在載入維修模組" />}>
                      <div key={`${activeProjectId ?? "no-project"}:${activeStationModule}`}>
                        {renderStationContent()}
                      </div>
                    </React.Suspense>
                  )}
                </main>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <UpdateIndicator isUpdating={isUpdating} />
      {!isDemoMode && <FacebookStyleNotifications />}
      {!isDemoMode && <OnlineUsersIndicator />}
      {!isDemoMode && <RealtimeNotifications />}

      <MainWorkspaceHeader
        items={workspaceItems}
        activeItem={activeWorkspace ?? "workspace-home"}
        onSelect={handleWorkspaceChange}
        onLogout={logout}
        onOpenNotifications={handleOpenNotifications}
        onBrandClick={() => handleWorkspaceChange("workspace-home")}
        onOpenWorkspaceHome={() => handleWorkspaceChange("workspace-home")}
        userName={user?.displayName || user?.username}
        userRoleLabel={getRoleLabel(user?.role)}
        userMenuItems={[
          ...(canViewModule("users")
            ? [
                {
                  id: "users",
                  label: "後台管理",
                  onSelect: () => handleAdminNavigation("users"),
                },
              ]
            : []),
          ...(canViewModule("api-management")
            ? [
                {
                  id: "api-management",
                  label: "API 管理",
                  onSelect: () => handleAdminNavigation("api-management"),
                },
              ]
            : []),
        ]}
      />

      <main
        className={cn(
          activeWorkspace === "station-status"
            ? "lg:h-[calc(100dvh-95px)] lg:min-h-0"
            : "min-h-[calc(100dvh-92px)] w-full"
        )}
      >
        <React.Suspense
          fallback={
            <div className="p-3">
              <MaintenanceLoading label="正在載入工作區" />
            </div>
          }
        >
          {renderWorkspaceContent()}
        </React.Suspense>
      </main>
    </div>
  );
};

export default Index;
