import { useEffect, useState } from "react";
import {
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  RadioTower,
  Shield,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type AdminNavigationTab = "users" | "collaboration" | "api-management";

interface AdminSidebarProps {
  activeTab: AdminNavigationTab;
  canViewApiManagement: boolean;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  onTabChange: (tab: AdminNavigationTab) => void;
}

const STORAGE_KEY = "admin-workspace:sidebar-collapsed:v1";

export function AdminSidebar({
  activeTab,
  canViewApiManagement,
  mobileOpen,
  onMobileOpenChange,
  onTabChange,
}: AdminSidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (mobileOpen) setCollapsed(false);
  }, [mobileOpen]);

  const items = [
    { id: "users" as const, label: "用戶管理", description: "帳號、角色與權限", icon: Users },
    { id: "collaboration" as const, label: "通知與在線", description: "協作狀態與公告", icon: RadioTower },
    ...(canViewApiManagement
      ? [{ id: "api-management" as const, label: "API 管理", description: "金鑰、測試與文件", icon: Network }]
      : []),
  ];

  const handleSelect = (tab: AdminNavigationTab) => {
    onTabChange(tab);
    onMobileOpenChange(false);
  };

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="admin-sidebar-backdrop"
          aria-label="關閉後台側欄"
          onClick={() => onMobileOpenChange(false)}
        />
      )}
      <aside
        data-admin-zone="navigation"
        className={cn(
          "admin-sidebar",
          collapsed && "is-collapsed",
          mobileOpen && "is-mobile-open",
        )}
      >
        <div className="admin-sidebar-heading">
          {!collapsed && (
            <div>
              <strong>管理工作區</strong>
              <span>系統設定與安全控制</span>
            </div>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="admin-sidebar-mobile-close"
            onClick={() => onMobileOpenChange(false)}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">關閉側欄</span>
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="admin-sidebar-collapse"
                onClick={() => setCollapsed((value) => !value)}
              >
                {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                <span className="sr-only">{collapsed ? "展開側欄" : "收合側欄"}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? "展開側欄" : "收合側欄"}</TooltipContent>
          </Tooltip>
        </div>

        <nav aria-label="後台管理導覽">
          {items.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            const button = (
              <button
                key={item.id}
                type="button"
                className={cn("admin-sidebar-item", active && "is-active")}
                aria-current={active ? "page" : undefined}
                onClick={() => handleSelect(item.id)}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && (
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                )}
              </button>
            );

            return collapsed ? (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : button;
          })}
        </nav>

        {!collapsed && (
          <div className="admin-sidebar-footer">
            <Shield className="h-4 w-4" />
            <span>所有變更均受權限與身分驗證保護</span>
          </div>
        )}
      </aside>
    </>
  );
}
