import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Factory,
  FileSliders,
  FolderKanban,
  Gauge,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";

interface SidebarProps {
  activeModule: string;
  desktopStickyClass?: string;
  isMobile?: boolean;
  isOpen?: boolean;
  onModuleChange: (module: string) => void;
  onToggle?: () => void;
}

const SIDEBAR_STORAGE_KEY = "maintenance-workspace:sidebar-collapsed:v1";

const navigationItems = [
  { id: "dashboard", label: "系統儀表板", icon: Gauge },
  { id: "test-tracker", label: "L10 測試追蹤", icon: ListChecks },
  { id: "flow-info", label: "L10 流程設定", icon: FileSliders },
  { id: "monitor", label: "生產監控牆", icon: Factory },
  { id: "issues", label: "問題追蹤", icon: AlertTriangle },
  { id: "tools", label: "工具與資產", icon: Wrench },
  { id: "test-plan", label: "資料儲存", icon: FolderKanban },
];

export function Sidebar({
  activeModule,
  desktopStickyClass = "top-0 h-screen",
  isMobile = false,
  isOpen = true,
  onModuleChange,
  onToggle,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  });
  const { canViewModule } = usePermissions();
  const isCompact = !isMobile && collapsed;

  useEffect(() => {
    if (!isMobile) {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    }
  }, [collapsed, isMobile]);

  const handleToggle = () => {
    if (isMobile) onToggle?.();
    else setCollapsed((value) => !value);
  };

  if (isMobile) {
    return (
      <nav
        aria-label="維修中心功能"
        data-mobile-maintenance-nav="true"
        className="sticky top-[var(--mobile-header-height)] z-30 flex w-full shrink-0 snap-x gap-1 overflow-x-auto rounded-xl border border-cyan-200/20 bg-[#071522]/96 p-1 shadow-[0_14px_34px_-28px_rgba(34,211,238,0.75)] backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:top-[72px]"
      >
        {navigationItems.map((item) => {
          if (!canViewModule(item.id)) return null;
          const Icon = item.icon;
          const isActive = activeModule === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => onModuleChange(item.id)}
              className={cn(
                "flex h-11 min-w-fit snap-start items-center gap-2 rounded-lg border px-3 text-xs font-black transition-colors",
                isActive
                  ? "border-cyan-100/60 bg-[linear-gradient(135deg,#67e8f9,#60a5fa)] text-[#061927] shadow-[0_10px_24px_-16px_rgba(34,211,238,0.9)]"
                  : "border-transparent bg-white/[0.025] text-slate-300 hover:border-cyan-200/20 hover:bg-cyan-300/10 hover:text-white",
              )}
            >
              <Icon className="h-4.5 w-4.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <>
      <aside
        aria-hidden={isMobile && !isOpen ? true : undefined}
        {...(isMobile && !isOpen ? ({ inert: "" } as Record<string, unknown>) : {})}
        className={cn(
          "maintenance-sidebar flex shrink-0 flex-col overflow-hidden border border-[#2a526f] bg-[#071522] transition-[width,transform] duration-200 ease-out",
          !isMobile && [
            "sticky self-start rounded-xl",
            desktopStickyClass,
            isCompact ? "w-16" : "w-[220px]",
          ]
        )}
      >
        <div className={cn(
          "flex h-12 shrink-0 items-center border-b border-[#2a526f]/70 px-2",
          isCompact && "justify-center px-0",
        )}>
          {!isCompact && (
            <div className="min-w-0 flex-1 px-2 text-sm font-semibold text-[#f3f8fc]">
              維修工作區
            </div>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleToggle}
                className={cn(
                  "shrink-0 rounded-lg border border-emerald-300/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/18 hover:text-emerald-50",
                  isCompact ? "mx-auto grid h-10 w-10 place-items-center p-0" : "h-9 w-9",
                )}
              >
                {isCompact ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                <span className="sr-only">{isCompact ? "展開側欄" : "收合側欄"}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{isCompact ? "展開側欄" : "收合側欄"}</TooltipContent>
          </Tooltip>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
            {navigationItems.map((item) => {
              if (!canViewModule(item.id)) return null;
              const Icon = item.icon;
              const isActive = activeModule === item.id;
              const button = (
                <Button
                  key={item.id}
                  variant="ghost"
                  className={cn(
                    "rounded-lg border text-sm font-medium transition-colors",
                    isCompact ? "mx-auto grid h-10 w-10 place-items-center p-0" : "h-11 w-full justify-start px-3",
                    isActive
                      ? "border-[#4c8dff]/65 bg-[#4c8dff] text-[#06111f] hover:bg-[#6ba2ff] hover:text-[#06111f]"
                      : "border-transparent text-[#b9cddd] hover:border-[#2a526f] hover:bg-[#10263a] hover:text-[#f3f8fc]"
                  )}
                  onClick={() => onModuleChange(item.id)}
                >
                  <span className={cn("grid place-items-center", !isCompact && "mr-3")}>
                    <Icon className="h-5 w-5 shrink-0" />
                  </span>
                  {!isCompact && <span className="truncate">{item.label}</span>}
                </Button>
              );

              return isCompact ? (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                button
              );
            })}
          </div>
        </nav>
      </aside>
    </>
  );
}
