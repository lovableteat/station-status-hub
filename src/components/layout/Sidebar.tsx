import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Database,
  Monitor,
  Workflow,
  AlertTriangle,
  Wrench,
  Menu,
  Home,
  ListChecks,
  FileText,
  Users
} from "lucide-react";

interface SidebarProps {
  activeModule: string;
  onModuleChange: (module: string) => void;
  isOpen?: boolean;
  onToggle?: () => void;
  isMobile?: boolean;
}

const navigationItems = [
  { id: "dashboard", label: "系統儀表板", icon: Home, description: "總覽與KPI" },
  { id: "test-tracker", label: "GB300 測試追蹤", icon: ListChecks, description: "L10 系統進度" },
  { id: "flow-info", label: "測試流程說明", icon: FileText, description: "各站流程說明" },
  { id: "gantt", label: "機台排程甘特圖", icon: Workflow, description: "機台工單排程" },
  { id: "monitor", label: "生產監控牆", icon: Monitor, description: "實時狀態" },
  { id: "issues", label: "問題追蹤", icon: AlertTriangle, description: "故障管理" },
  { id: "data", label: "資料中心", icon: Database, description: "報告查詢" },
  { id: "tools", label: "工具管理", icon: Wrench, description: "設備資源" },
  { id: "users", label: "使用者管理", icon: Users, description: "帳號權限" },
];

export function Sidebar({ activeModule, onModuleChange, isOpen = true, onToggle, isMobile = false }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  // On mobile, use isOpen prop; on desktop, use collapsed state
  const isVisible = isMobile ? isOpen : true;
  const isCompact = isMobile ? false : collapsed;

  const handleToggle = () => {
    if (isMobile && onToggle) {
      onToggle();
    } else {
      setCollapsed(!collapsed);
    }
  };

  return (
    <>
      {/* Mobile Header with Menu Button */}
      {isMobile && (
        <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b border-border h-14 flex items-center px-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggle}
            className="h-8 w-8 p-0"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <div className="ml-3">
            <h1 className="text-sm font-bold text-foreground">測試管理系統</h1>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "h-screen bg-card border-r border-border transition-all duration-300 flex flex-col",
          // Mobile styles
          isMobile && [
            "fixed top-0 left-0 z-40 lg:relative",
            isVisible ? "translate-x-0" : "-translate-x-full",
            "w-64"
          ],
          // Desktop styles
          !isMobile && (isCompact ? "w-16" : "w-64"),
          // Add top margin on mobile to account for header
          isMobile && "mt-14 lg:mt-0"
        )}
      >
        {/* Header - Hidden on mobile as we have separate mobile header */}
        {!isMobile && (
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between">
              {!isCompact && (
                <div>
                  <h1 className="text-lg font-bold text-foreground">測試管理系統</h1>
                  <p className="text-xs text-muted-foreground">Station Status Hub</p>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggle}
                className="h-8 w-8 p-0"
              >
                <Menu className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-2">
          <div className="space-y-1">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeModule === item.id;
              
              return (
                <Button
                  key={item.id}
                  variant={isActive ? "default" : "ghost"}
                  className={cn(
                    "w-full justify-start h-10 transition-all",
                    (isCompact && !isMobile) ? "px-2" : "px-3",
                    isActive && "bg-primary text-primary-foreground shadow-station"
                  )}
                  onClick={() => {
                    if (item.id === 'gantt') {
                      // Navigate to the unified gantt chart page
                      window.history.pushState({}, '', '/gantt');
                      window.location.reload();
                    } else {
                      onModuleChange(item.id);
                    }
                  }}
                >
                  <Icon className={cn("h-4 w-4 flex-shrink-0", (isCompact && !isMobile) ? "mr-0" : "mr-3")} />
                  {(!isCompact || isMobile) && (
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium">{item.label}</div>
                      <div className="text-xs opacity-70">{item.description}</div>
                    </div>
                  )}
                </Button>
              );
            })}
          </div>
        </nav>
      </div>
    </>
  );
}