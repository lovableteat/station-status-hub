import { useMemo, useState } from "react";
import {
  ChevronRight,
  CircuitBoard,
  Gauge,
  FolderUp,
  GitCompareArrows,
  House,
  MoreHorizontal,
  PackageSearch,
  Search,
  ServerCog,
  Target,
  X,
} from "lucide-react";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import type { WorkspaceMenuItem } from "./MainWorkspaceHeader";

interface MobileWorkspaceDockProps {
  activeItem: string;
  availableItems: Array<{ id: string; label: string }>;
  onSelect: (id: string) => void;
  platformActions?: WorkspaceMenuItem[];
}

const PRIMARY_WORKSPACES = [
  { id: "workspace-home", label: "首頁", icon: House },
  { id: "station-status", label: "維修", icon: Gauge },
  { id: "material-requests", label: "料號", icon: PackageSearch },
  { id: "ai-chat", label: "AI 問答", icon: Search },
] as const;

const SECONDARY_WORKSPACES = [
  { id: "file-uploads", label: "檔案上傳", icon: FolderUp, description: "專案檔案、資料夾與文件預覽" },
  { id: "comparison", label: "比對系統", icon: GitCompareArrows, description: "A／B 差異、審查追蹤與電路檢查" },
  { id: "data-center", label: "Data Center", icon: ServerCog, description: "機櫃、設備與 2D／3D 場景" },
  { id: "pcb-designer", label: "PCB Designer", icon: CircuitBoard, description: "PCB 佈局、BOM 與 DRC" },
  { id: "performance", label: "績效考核", icon: Target, description: "考核週期、目標與主管回饋" },
] as const;

const activeDockClasses =
  "border-primary/45 bg-sidebar-accent text-sidebar-accent-foreground shadow-[0_10px_22px_-16px_rgba(0,0,0,0.55)]";

export function MobileWorkspaceDock({ activeItem, availableItems, onSelect, platformActions }: MobileWorkspaceDockProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const availableIds = useMemo(() => new Set(availableItems.map((item) => item.id)), [availableItems]);
  const primaryItems = PRIMARY_WORKSPACES.filter((item) => availableIds.has(item.id));
  const secondaryItems = SECONDARY_WORKSPACES.filter((item) => availableIds.has(item.id));
  const moreActive = secondaryItems.some((item) => item.id === activeItem);

  const selectWorkspace = (id: string) => {
    onSelect(id);
    setMoreOpen(false);
  };

  return (
    <>
      <nav
        aria-label="手機工作區導覽"
        data-mobile-workspace-dock="true"
        className="fixed inset-x-0 bottom-0 z-40 grid h-[var(--mobile-shell-bottom)] grid-cols-5 gap-0.5 border-t border-cyan-100/20 bg-[#071421]/98 px-1 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-14px_34px_-28px_rgba(34,211,238,0.8)] backdrop-blur-xl lg:hidden"
      >
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const active = activeItem === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? "page" : undefined}
              data-mobile-dock-item="true"
              data-mobile-dock-id={item.id}
              onClick={() => selectWorkspace(item.id)}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-transparent text-[10px] font-bold tracking-wide text-slate-400 transition-colors",
                active ? activeDockClasses : "border-slate-700/70 bg-[#0c2033] text-slate-300 hover:border-blue-300/40 hover:bg-[#132b43] hover:text-white",
              )}
            >
              <span data-mobile-dock-icon="true"><Icon className="h-[18px] w-[18px]" /></span>
              <span>{item.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          aria-current={moreActive ? "page" : undefined}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          data-mobile-dock-item="true"
          data-mobile-dock-id="more"
          onClick={() => setMoreOpen(true)}
          className={cn(
            "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-transparent text-[10px] font-bold tracking-wide text-slate-400 transition-colors",
            moreActive ? activeDockClasses : "border-slate-700/70 bg-[#0c2033] text-slate-300 hover:border-blue-300/40 hover:bg-[#132b43] hover:text-white",
          )}
        >
          <span data-mobile-dock-icon="true"><MoreHorizontal className="h-[18px] w-[18px]" /></span>
          <span>更多</span>
        </button>
      </nav>

      <Drawer open={moreOpen} onOpenChange={setMoreOpen} shouldScaleBackground={false}>
        <DrawerContent
          data-mobile-more-sheet="true"
          className="z-[92] lg:hidden"
        >
          <DrawerHeader data-mobile-more-header="true" className="shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 pb-4 pt-1 text-left">
            <div className="space-y-1">
              <DrawerTitle className="text-xl leading-6 text-foreground">更多工作區</DrawerTitle>
              <DrawerDescription className="leading-5">選擇要開啟的工具</DrawerDescription>
            </div>
            <DrawerClose asChild>
              <button
                type="button"
                aria-label="關閉更多工作區"
                data-ui="dialog-close"
                className="grid size-11 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </DrawerClose>
          </DrawerHeader>
          <div className="mobile-more-workspace-list min-h-0 space-y-4 overflow-y-auto overscroll-contain">
            {secondaryItems.length > 0 && (
              <section aria-label="工作區工具" className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {secondaryItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={activeItem === item.id ? "page" : undefined}
                      data-mobile-more-item="true"
                      data-mobile-more-id={item.id}
                      onClick={() => selectWorkspace(item.id)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-foreground"
                    >
                      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary/10 text-primary">
                        <Icon className="size-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-[15px] font-semibold leading-5">{item.label}</span>
                        <span className="mt-0.5 block break-words text-[13px] leading-[1.125rem] text-muted-foreground">{item.description}</span>
                      </span>
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  );
                })}
              </section>
            )}
            {platformActions?.length ? (
              <section aria-label="帳號與協作" className="space-y-2 md:hidden">
                <h3 className="px-1 text-[13px] font-semibold leading-5 text-muted-foreground">帳號與協作</h3>
                <div className="grid grid-cols-2 gap-2">
                  {platformActions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      data-mobile-more-action={action.id}
                      onClick={() => { setMoreOpen(false); action.onSelect(); }}
                      className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left text-sm font-medium text-foreground last:odd:col-span-2"
                    >
                      {action.icon && <span aria-hidden="true" className="shrink-0 text-muted-foreground">{action.icon}</span>}
                      <span className="min-w-0 break-words">{action.label}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
