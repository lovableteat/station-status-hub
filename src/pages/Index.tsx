import React, { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { TestTracker } from "@/components/test-tracker/TestTracker";
import { FlowInfo } from "@/components/test-tracker/FlowInfo";
import { ProductionMonitor } from "@/components/production/ProductionMonitor";
import { IssueTracker } from "@/components/issues/IssueTracker";
import { DataCenter } from "@/components/data-center/DataCenter";
import { MaterialRequestPage } from "@/components/material-requests/MaterialRequestPage";
import { ToolsManagement } from "@/components/tools/ToolsManagement";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { UserManagement } from "@/components/user-management/UserManagement";
import { ApiManagementPage } from "@/components/api-management/ApiManagementPage";
import { LoginPage } from "@/components/auth/LoginPage";
import { PermissionGuard } from "@/components/layout/PermissionGuard";
import { UpdateIndicator } from "@/components/common/UpdateIndicator";
import { FacebookStyleNotifications } from "@/components/common/FacebookStyleNotifications";
import { OnlineUsersIndicator } from "@/components/common/OnlineUsersIndicator";
import { RealtimeNotifications } from "@/components/common/RealtimeNotifications";
import { useUser } from "@/components/auth/UserContext";
import { useUserPresence } from "@/hooks/useUserPresence";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const Index = () => {
  const [activeModule, setActiveModule] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, login, isLoggedIn } = useUser();
  const { updateCurrentModule } = useUserPresence();
  const { isUpdating } = useUnifiedData();
  const isMobile = useIsMobile();

  useEffect(() => {
    // Listen for navigation events from other components
    const handleNavigationEvent = (event: CustomEvent) => {
      const { module } = event.detail;
      setActiveModule(module);
    };

    window.addEventListener('navigate', handleNavigationEvent as EventListener);
    
    return () => {
      window.removeEventListener('navigate', handleNavigationEvent as EventListener);
    };
  }, []);

  if (!isLoggedIn) {
    return <LoginPage onLogin={login} />;
  }

  const handleNavigation = (module: string, params?: any) => {
    setActiveModule(module);
    updateCurrentModule(module); // Update user presence
    // Close sidebar on mobile after navigation
    if (isMobile) {
      setSidebarOpen(false);
    }
    // Here you could handle routing params in the future
  };

  const renderModule = () => {
    switch (activeModule) {
      case "dashboard":
        return (
          <PermissionGuard module="dashboard">
            <Dashboard onNavigate={handleNavigation} />
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
      case "data":
        return (
          <PermissionGuard module="data">
            <DataCenter />
          </PermissionGuard>
        );
      case "material-requests":
        return (
          <PermissionGuard module="material-requests">
            <MaterialRequestPage />
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
        return (
          <PermissionGuard module="dashboard">
            <Dashboard onNavigate={handleNavigation} />
          </PermissionGuard>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Real-time update indicators */}
      <UpdateIndicator isUpdating={isUpdating} />
      <FacebookStyleNotifications />
      <OnlineUsersIndicator />
      <RealtimeNotifications />
      
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden" 
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      <div className="flex min-h-screen">
        <Sidebar 
          activeModule={activeModule} 
          onModuleChange={(module) => {
            setActiveModule(module);
            updateCurrentModule(module); // Update user presence
            if (isMobile) setSidebarOpen(false);
          }}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          isMobile={isMobile}
        />
        <main className={cn(
          "flex-1 overflow-auto",
          isMobile && "pt-14" // Add top padding on mobile for fixed header
        )}>
          {renderModule()}
        </main>
      </div>
    </div>
  );
};

export default Index;
