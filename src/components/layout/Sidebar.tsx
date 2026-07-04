import React, { useState } from "react";
import {
  AlertTriangle,
  FileText,
  Home,
  ListChecks,
  LogOut,
  Menu,
  Monitor,
  User,
  Wrench,
} from "lucide-react";

import { useUser } from "@/components/auth/UserContext";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";

interface SidebarProps {
  activeModule: string;
  onModuleChange: (module: string) => void;
  isOpen?: boolean;
  onToggle?: () => void;
  isMobile?: boolean;
  desktopStickyClass?: string;
  mobileHeaderOffsetClass?: string;
  mobilePanelOffsetClass?: string;
}

const navigationItems = [
  {
    id: "dashboard",
    label: "系統儀表板",
    icon: Home,
    description: "KPI 與總覽",
  },
  {
    id: "test-tracker",
    label: "L10 測試追蹤",
    icon: ListChecks,
    description: "L10 測試進度",
  },
  {
    id: "flow-info",
    label: "L10 流程設定",
    icon: FileText,
    description: "流程與站點設定",
  },
  {
    id: "monitor",
    label: "生產監控牆",
    icon: Monitor,
    description: "生產即時狀態",
  },
  {
    id: "issues",
    label: "問題追蹤",
    icon: AlertTriangle,
    description: "異常與改善管理",
  },
  {
    id: "tools",
    label: "工具管理",
    icon: Wrench,
    description: "檔案與工具資產",
  },
];

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

export function Sidebar({
  activeModule,
  onModuleChange,
  isOpen = true,
  onToggle,
  isMobile = false,
  desktopStickyClass = "top-0 h-screen",
  mobileHeaderOffsetClass = "top-0",
  mobilePanelOffsetClass = "top-14",
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { canViewModule } = usePermissions();
  const { user, logout } = useUser();

  const isVisible = isMobile ? isOpen : true;
  const isCompact = isMobile ? false : collapsed;

  const handleToggle = () => {
    if (isMobile && onToggle) {
      onToggle();
      return;
    }

    setCollapsed((value) => !value);
  };

  return (
    <>
      {isMobile && (
        <div
          className={cn(
            "glass-strip fixed left-0 right-0 z-50 flex h-14 items-center border-b border-border px-4 shadow-[0_16px_36px_-32px_hsl(var(--primary)/0.52)] lg:hidden",
            mobileHeaderOffsetClass
          )}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggle}
            className="h-9 w-9 rounded-xl p-0"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <div className="ml-3">
            <h1 className="text-sm font-bold text-foreground">站點狀態中心</h1>
          </div>
        </div>
      )}

      <div
        className={cn(
          "flex flex-col overflow-hidden border-r border-border bg-[linear-gradient(180deg,hsl(222_34%_12%),hsl(222_30%_9%))] shadow-[24px_0_54px_-44px_hsl(var(--primary)/0.42)] transition-all duration-300",
          isMobile && [
            "fixed bottom-0 left-0 z-40 w-64 lg:relative",
            mobilePanelOffsetClass,
            isVisible ? "translate-x-0" : "-translate-x-full",
          ],
          !isMobile && [
            "sticky self-start",
            desktopStickyClass,
            isCompact ? "w-16" : "w-64",
          ]
        )}
      >
        {!isMobile && (
          <div className="border-b border-border/90 bg-[linear-gradient(180deg,hsl(221_34%_14%/0.9),transparent)] p-4">
            <div className="flex items-center justify-between">
              {!isCompact && (
                <div>
                  <h1 className="text-lg font-bold text-foreground">站點狀態中心</h1>
                  <p className="text-xs text-muted-foreground">Station Status Hub</p>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggle}
                className="h-9 w-9 rounded-xl p-0"
              >
                <Menu className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto p-2.5">
          <div className="space-y-1">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeModule === item.id;

              if (!canViewModule(item.id)) {
                return null;
              }

              return (
                <Button
                  key={item.id}
                  variant={isActive ? "default" : "ghost"}
                  className={cn(
                    "interactive-lift h-auto min-h-[3.25rem] w-full justify-start rounded-2xl border border-transparent transition-all",
                    isCompact && !isMobile ? "px-2" : "px-3",
                    isActive
                      ? "border-primary/18 bg-primary text-primary-foreground shadow-[0_18px_32px_-24px_hsl(var(--primary)/0.8)]"
                      : "hover:border-primary/12 hover:bg-primary/8"
                  )}
                  onClick={() => onModuleChange(item.id)}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 flex-shrink-0",
                      isCompact && !isMobile ? "mr-0" : "mr-3"
                    )}
                  />
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

        <div className="border-t border-border/85 bg-[linear-gradient(180deg,transparent,hsl(221_31%_10%/0.94))] p-2.5">
          {(!collapsed || isMobile) && (
            <div className="panel-surface-soft mb-2 rounded-2xl bg-accent/35 p-3">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{user?.username}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {getRoleLabel(user?.role)}
                  </div>
                </div>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start rounded-2xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
              collapsed && !isMobile ? "px-2" : "px-3"
            )}
            onClick={logout}
          >
            <LogOut
              className={cn("h-4 w-4", collapsed && !isMobile ? "mr-0" : "mr-3")}
            />
            {(!collapsed || isMobile) && "登出"}
          </Button>
        </div>
      </div>
    </>
  );
}
