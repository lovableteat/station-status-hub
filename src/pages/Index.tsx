import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Dashboard } from "@/components/dashboard/Dashboard";

const Index = () => {
  const [activeModule, setActiveModule] = useState("dashboard");

  const handleNavigation = (module: string, params?: any) => {
    setActiveModule(module);
    // Here you could handle routing params in the future
  };

  const renderModule = () => {
    switch (activeModule) {
      case "dashboard":
        return <Dashboard onNavigate={handleNavigation} />;
      case "monitor":
        return (
          <div className="p-6">
            <h1 className="text-3xl font-bold">生產監控牆</h1>
            <p className="text-muted-foreground">實時機台狀態監控 - 開發中</p>
          </div>
        );
      case "flow":
        return (
          <div className="p-6">
            <h1 className="text-3xl font-bold">測試流程設計</h1>
            <p className="text-muted-foreground">流程版本化管理 - 開發中</p>
          </div>
        );
      case "issues":
        return (
          <div className="p-6">
            <h1 className="text-3xl font-bold">問題追蹤</h1>
            <p className="text-muted-foreground">故障問題管理 - 開發中</p>
          </div>
        );
      case "data":
        return (
          <div className="p-6">
            <h1 className="text-3xl font-bold">資料中心</h1>
            <p className="text-muted-foreground">測試記錄與報告 - 開發中</p>
          </div>
        );
      case "tools":
        return (
          <div className="p-6">
            <h1 className="text-3xl font-bold">工具管理</h1>
            <p className="text-muted-foreground">設備資源管理 - 開發中</p>
          </div>
        );
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
