import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { TestTracker } from "@/components/test-tracker/TestTracker";
import { FlowInfo } from "@/components/test-tracker/FlowInfo";
import { ProductionMonitor } from "@/components/production/ProductionMonitor";
import { IssueTracker } from "@/components/issues/IssueTracker";
import { DataCenter } from "@/components/data-center/DataCenter";
import { ToolsManagement } from "@/components/tools/ToolsManagement";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { LoginPage } from "@/components/auth/LoginPage";
import { useUser } from "@/components/auth/UserContext";

const Index = () => {
  const [activeModule, setActiveModule] = useState("dashboard");
  const { user, login, isLoggedIn } = useUser();

  if (!isLoggedIn) {
    return <LoginPage onLogin={login} />;
  }

  const handleNavigation = (module: string, params?: any) => {
    setActiveModule(module);
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
        return user?.role === "super_admin" ? <AdminPanel /> : <Dashboard onNavigate={handleNavigation} />;
      default:
        return <Dashboard onNavigate={handleNavigation} />;
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar 
        activeModule={activeModule} 
        onModuleChange={setActiveModule} 
      />
      <main className="flex-1 overflow-auto">
        {renderModule()}
      </main>
    </div>
  );
};

export default Index;
