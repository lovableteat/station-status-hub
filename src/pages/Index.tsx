import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  Factory,
  FileText,
  LayoutDashboard,
  Network,
  ServerCog,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { AdminPanel } from "@/components/admin/AdminPanel";
import { ApiManagementPage } from "@/components/api-management/ApiManagementPage";
import { LoginPage } from "@/components/auth/LoginPage";
import { useUser } from "@/components/auth/UserContext";
import { FacebookStyleNotifications } from "@/components/common/FacebookStyleNotifications";
import { OnlineUsersIndicator } from "@/components/common/OnlineUsersIndicator";
import { RealtimeNotifications } from "@/components/common/RealtimeNotifications";
import { UpdateIndicator } from "@/components/common/UpdateIndicator";
import { DeploymentPlanningCenter } from "@/components/data-center/DeploymentPlanningCenter";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { IssueTracker } from "@/components/issues/IssueTracker";
import { MainWorkspaceHeader } from "@/components/layout/MainWorkspaceHeader";
import { PermissionGuard } from "@/components/layout/PermissionGuard";
import { Sidebar } from "@/components/layout/Sidebar";
import { WorkspaceEntrance } from "@/components/layout/WorkspaceEntrance";
import { MaterialRequestPage } from "@/components/material-requests/MaterialRequestPage";
import { ProductionMonitor } from "@/components/production/ProductionMonitor";
import { FlowInfo } from "@/components/test-tracker/FlowInfo";
import { TestTracker } from "@/components/test-tracker/TestTracker";
import { ToolsManagement } from "@/components/tools/ToolsManagement";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { useUserPresence } from "@/hooks/useUserPresence";
import { cn } from "@/lib/utils";

type WorkspaceId = "station-status" | "material-requests" | "data-center";
type StationModuleId =
  | "dashboard"
  | "test-tracker"
  | "flow-info"
  | "monitor"
  | "issues"
  | "tools"
  | "users"
  | "api-management";

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
  { id: "users", label: "使用者管理", icon: ShieldCheck },
  { id: "api-management", label: "API 管理", icon: Network },
];

const moduleWorkspaceMap: Record<string, WorkspaceId> = {
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

  const value = new URLSearchParams(window.location.search).get("workspace");
  if (
    value === "station-status" ||
    value === "material-requests" ||
    value === "data-center"
  ) {
    return value;
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
    value === "tools" ||
    value === "users" ||
    value === "api-management"
  ) {
    return value;
  }

  return "dashboard";
}

const Index = () => {
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId | null>(
    getInitialWorkspace
  );
  const [activeStationModule, setActiveStationModule] = useState<StationModuleId>(
    getInitialStationModule
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { login, isLoggedIn, logout, user } = useUser();
  const { updateCurrentModule } = useUserPresence();
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
        label: "站點狀態中心",
        description: "查看站點狀態、測試流程、生產監控與管理設定。",
        icon: LayoutDashboard,
        visible: stationModuleItems.some((item) => canViewModule(item.id)),
      },
      {
        id: "material-requests" as const,
        label: "料號申請",
        description: "集中處理料號申請、追蹤與相關作業。",
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
    ],
    [canViewModule]
  );

  const workspaceItems = useMemo(
    () =>
      workspaceCatalog
        .filter((item) => item.visible)
        .map(({ id, label }) => ({ id, label })),
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
          : activeWorkspace;

    updateCurrentModule(presenceModule);
  }, [activeStationModule, activeWorkspace, updateCurrentModule]);

  useEffect(() => {
    const handleNavigationEvent = (event: CustomEvent<{ module: string }>) => {
      const module = event.detail?.module;
      if (!module) return;

      const targetWorkspace = moduleWorkspaceMap[module];
      if (!targetWorkspace) return;

      setActiveWorkspace(targetWorkspace);

      if (
        targetWorkspace === "station-status" &&
        stationModuleItems.some((item) => item.id === module)
      ) {
        setActiveStationModule(module as StationModuleId);
      }
    };

    window.addEventListener("navigate", handleNavigationEvent as EventListener);
    return () => {
      window.removeEventListener("navigate", handleNavigationEvent as EventListener);
    };
  }, []);

  if (!isLoggedIn) {
    return <LoginPage onLogin={login} />;
  }

  const handleWorkspaceChange = (workspace: string) => {
    setActiveWorkspace(workspace as WorkspaceId);
  };

  const handleStationNavigation = (module: string) => {
    setActiveWorkspace("station-status");
    setActiveStationModule(module as StationModuleId);
    if (isMobile) {
      setSidebarOpen(false);
    }
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
      case "users":
        return (
          <PermissionGuard module="users">
            <AdminPanel />
          </PermissionGuard>
        );
      case "api-management":
        return (
          <PermissionGuard module="api-management">
            <ApiManagementPage />
          </PermissionGuard>
        );
      default:
        return null;
    }
  };

  const renderWorkspaceContent = () => {
    if (activeWorkspace === null) {
      return (
        <WorkspaceEntrance items={entranceItems} onSelect={handleWorkspaceChange} />
      );
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
      case "station-status":
      default:
        return (
          <div className="relative">
            {isMobile && sidebarOpen && (
              <div
                className="fixed inset-0 z-30 bg-black/50 lg:hidden"
                onClick={() => setSidebarOpen(false)}
              />
            )}

            <div className="flex min-h-[calc(100vh-92px)]">
              <Sidebar
                activeModule={activeStationModule}
                onModuleChange={handleStationNavigation}
                isOpen={sidebarOpen}
                onToggle={() => setSidebarOpen((value) => !value)}
                isMobile={isMobile}
                desktopStickyClass="top-[92px] h-[calc(100vh-92px)]"
                mobileHeaderOffsetClass="top-[92px]"
                mobilePanelOffsetClass="top-[148px]"
              />

              <main
                className={cn(
                  "flex-1 overflow-auto",
                  isMobile && "pt-14"
                )}
              >
                {renderStationContent()}
              </main>
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
        activeItem={activeWorkspace ?? undefined}
        onSelect={handleWorkspaceChange}
        onLogout={logout}
        onBrandClick={() => setActiveWorkspace(null)}
        userName={user?.displayName || user?.username}
        userRoleLabel={getRoleLabel(user?.role)}
      />

      <main className="min-h-[calc(100vh-92px)]">{renderWorkspaceContent()}</main>
    </div>
  );
};

export default Index;
