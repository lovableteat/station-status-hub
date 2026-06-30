import React, { useState } from "react";
import {
  AlertTriangle,
  Database,
  FileSpreadsheet,
  FileText,
  Home,
  ListChecks,
  LogOut,
  Menu,
  Monitor,
  User,
  Users,
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
}

const navigationItems = [
  {
    id: "dashboard",
    label: "蝟餌絞?銵冽",
    icon: Home,
    description: "KPI ?蜇閬?,
  },
  {
    id: "test-tracker",
    label: "L10 皜祈岫餈質馱",
    icon: ListChecks,
    description: "L10 皜祈岫?脣漲",
  },
  {
    id: "flow-info",
    label: "L10 瘚?閮剖?",
    icon: FileText,
    description: "瘚???暺身摰?,
  },
  {
    id: "monitor",
    label: "?????,
    icon: Monitor,
    description: "??單????,
  },
  {
    id: "issues",
    label: "??餈質馱",
    icon: AlertTriangle,
    description: "?啣虜??恣??,
  },
  {
    id: "data",
    label: "鞈?銝剖?",
    icon: Database,
    description: "?勗??亥岷",
  },
  {
    id: "tools",
    label: "撌亙蝞∠?",
    icon: Wrench,
    description: "瑼??極?瑁??? ,
  },
  {
    id: "users",
    label: "雿輻?恣??,
    icon: Users,
    description: "撣唾?????,
  },
  {
    id: "material-requests",
    label: "???唾?",
    icon: FileSpreadsheet,
    description: "?蹂誨???唾?閬?",
  },
];

function getRoleLabel(role?: string) {
  switch (role) {
    case "super_admin":
      return "頞?蝞∠???.
    case "admin":
      return "蝞∠???.
    default:
      return "銝?砌蝙?刻?.
  }
}

export function Sidebar({
  activeModule,
  onModuleChange,
  isOpen = true,
  onToggle,
  isMobile = false,
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
        <div className="fixed left-0 right-0 top-0 z-50 flex h-14 items-center border-b border-border bg-card px-4 lg:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggle}
            className="h-8 w-8 p-0"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <div className="ml-3">
            <h1 className="text-sm font-bold text-foreground">蝡???葉敹?/h1>
          </div>
        </div>
      )}

      <div
        className={cn(
          "flex flex-col overflow-hidden border-r border-border bg-card transition-all duration-300",
          isMobile && [
            "fixed bottom-0 left-0 top-14 z-40 w-64 lg:relative",
            isVisible ? "translate-x-0" : "-translate-x-full",
          ],
          !isMobile && [
            "sticky top-0 h-screen self-start",
            isCompact ? "w-16" : "w-64",
          ]
        )}
      >
        {!isMobile && (
          <div className="border-b border-border p-4">
            <div className="flex items-center justify-between">
              {!isCompact && (
                <div>
                  <h1 className="text-lg font-bold text-foreground">蝡???葉敹?/h1>
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

        <nav className="flex-1 overflow-y-auto p-2">
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
                    "h-10 w-full justify-start transition-all",
                    isCompact && !isMobile ? "px-2" : "px-3",
                    isActive && "bg-primary text-primary-foreground shadow-station"
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

        <div className="border-t border-border p-2">
          {(!collapsed || isMobile) && (
            <div className="mb-2 rounded bg-accent/50 p-2">
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
              "w-full justify-start text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
              collapsed && !isMobile ? "px-2" : "px-3"
            )}
            onClick={logout}
          >
            <LogOut
              className={cn("h-4 w-4", collapsed && !isMobile ? "mr-0" : "mr-3")}
            />
            {(!collapsed || isMobile) && "?餃"}
          </Button>
        </div>
      </div>
    </>
  );
}
