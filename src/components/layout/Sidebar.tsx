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
  Moon,
  Sun,
  ListChecks,
  FileText
} from "lucide-react";
import { useTheme } from "next-themes";

interface SidebarProps {
  activeModule: string;
  onModuleChange: (module: string) => void;
}

const navigationItems = [
  { id: "dashboard", label: "系統儀表板", icon: Home, description: "總覽與KPI" },
  { id: "test-tracker", label: "GB300 測試追蹤", icon: ListChecks, description: "L10 系統進度" },
  { id: "flow-info", label: "測試流程說明", icon: FileText, description: "各站流程說明" },
  { id: "monitor", label: "生產監控牆", icon: Monitor, description: "實時狀態" },
  { id: "issues", label: "問題追蹤", icon: AlertTriangle, description: "故障管理" },
  { id: "data", label: "資料中心", icon: Database, description: "報告查詢" },
  { id: "tools", label: "工具管理", icon: Wrench, description: "設備資源" },
];

export function Sidebar({ activeModule, onModuleChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={cn(
        "h-screen bg-card border-r border-border transition-all duration-300 flex flex-col",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          {!collapsed && (
            <div>
              <h1 className="text-lg font-bold text-foreground">測試管理系統</h1>
              <p className="text-xs text-muted-foreground">Station Status Hub</p>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className="h-8 w-8 p-0"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      </div>

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
                  collapsed ? "px-2" : "px-3",
                  isActive && "bg-primary text-primary-foreground shadow-station"
                )}
                onClick={() => onModuleChange(item.id)}
              >
                <Icon className={cn("h-4 w-4 flex-shrink-0", collapsed ? "mr-0" : "mr-3")} />
                {!collapsed && (
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

      {/* Theme Toggle */}
      <div className="p-4 border-t border-border">
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="h-8 w-8 p-0"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}