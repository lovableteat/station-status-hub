import { useMemo, useState } from "react";
import {
  CircuitBoard,
  Gauge,
  House,
  MoreHorizontal,
  PackageSearch,
  Search,
  ServerCog,
  ShieldCheck,
  Target,
} from "lucide-react";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

interface MobileWorkspaceDockProps {
  activeItem: string;
  availableItems: Array<{ id: string; label: string }>;
  onSelect: (id: string) => void;
}

const PRIMARY_WORKSPACES = [
  { id: "workspace-home", label: "首頁", icon: House, tone: "cyan" },
  { id: "station-status", label: "維修", icon: Gauge, tone: "blue" },
  { id: "material-requests", label: "料號", icon: PackageSearch, tone: "amber" },
  { id: "ai-chat", label: "查詢", icon: Search, tone: "lime" },
] as const;

const SECONDARY_WORKSPACES = [
  { id: "data-center", label: "Data Center", icon: ServerCog, description: "機櫃、設備與 2D／3D 場景" },
  { id: "pcb-designer", label: "PCB Designer", icon: CircuitBoard, description: "PCB 佈局、BOM 與 DRC" },
  { id: "user-management", label: "後台管理", icon: ShieldCheck, description: "帳號、權限與 API" },
  { id: "performance", label: "績效考核", icon: Target, description: "考核週期、目標與主管回饋" },
] as const;

const activeToneClasses = {
  amber: "border-amber-200/45 bg-amber-300/90 text-amber-950",
  blue: "border-blue-200/45 bg-blue-400/90 text-white",
  cyan: "border-cyan-200/45 bg-cyan-300/90 text-cyan-950",
  lime: "border-lime-200/45 bg-lime-300/90 text-lime-950",
};

export function MobileWorkspaceDock({ activeItem, availableItems, onSelect }: MobileWorkspaceDockProps) {
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
              onClick={() => selectWorkspace(item.id)}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-transparent text-[10px] font-bold tracking-wide text-slate-400 transition-colors",
                active ? activeToneClasses[item.tone] : "hover:border-white/10 hover:bg-white/[0.05] hover:text-white",
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              <span>{item.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          aria-current={moreActive ? "page" : undefined}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
          className={cn(
            "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-transparent text-[10px] font-bold tracking-wide text-slate-400 transition-colors",
            moreActive ? "border-violet-200/45 bg-violet-300/90 text-violet-950" : "hover:border-white/10 hover:bg-white/[0.05] hover:text-white",
          )}
        >
          <MoreHorizontal className="h-[18px] w-[18px]" />
          <span>更多</span>
        </button>
      </nav>

      <Drawer open={moreOpen} onOpenChange={setMoreOpen} shouldScaleBackground={false}>
        <DrawerContent
          data-mobile-more-sheet="true"
          className="z-[92] max-h-[min(72dvh,560px)] border-cyan-200/25 bg-[#071522] pb-[env(safe-area-inset-bottom)] text-slate-100 lg:hidden"
        >
          <DrawerHeader className="px-4 pb-3 pt-2 text-left">
            <DrawerTitle className="text-base text-white">更多工作區</DrawerTitle>
            <DrawerDescription className="text-xs text-slate-400">選擇要開啟的工具，主要工作區仍保留在底部。</DrawerDescription>
          </DrawerHeader>
          <div className="grid gap-2 overflow-y-auto px-3 pb-4">
            {secondaryItems.map((item) => {
              const Icon = item.icon;
              const active = activeItem === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => selectWorkspace(item.id)}
                  className={cn(
                    "flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 text-left",
                    active
                      ? "border-cyan-200/50 bg-cyan-300/15 text-white"
                      : "border-slate-700 bg-[#0b1b2d] text-slate-200",
                  )}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-300/10 text-cyan-100">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{item.label}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-400">{item.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
