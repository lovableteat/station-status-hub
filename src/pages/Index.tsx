import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { TestTracker } from "@/components/test-tracker/TestTracker";
import { FlowInfo } from "@/components/test-tracker/FlowInfo";
import { ProductionMonitor } from "@/components/production/ProductionMonitor";
import { IssueTracker } from "@/components/issues/IssueTracker";
import { DataCenter } from "@/components/data-center/DataCenter";
import { ToolsManagement } from "@/components/tools/ToolsManagement";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { UserManagement } from "@/components/user-management/UserManagement";
import { LoginPage } from "@/components/auth/LoginPage";
import { useUser } from "@/components/auth/UserContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const Index = () => {
  const [activeModule, setActiveModule] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, login, isLoggedIn } = useUser();
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
    // Close sidebar on mobile after navigation
    if (isMobile) {
      setSidebarOpen(false);
    }
    // Here you could handle routing params in the future
  };

  const renderModule = () => {
    switch (activeModule) {
      case "dashboard":
        return <Dashboard onNavigate={handleNavigation} />;
      case "test-tracker":
        return <TestTracker />;
      case "flow-info":
        return <FlowInfo />;
      case "monitor":
        return <ProductionMonitor />;
      case "issues":
        return <IssueTracker />;
      case "data":
        return <DataCenter />;
      case "tools":
        return <ToolsManagement />;
      case "users":
        return <AdminPanel />;
      default:
        return <Dashboard onNavigate={handleNavigation} />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
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
