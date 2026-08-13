import { Gauge, House, PackageSearch, Search } from "lucide-react";

import { cn } from "@/lib/utils";

interface MobileWorkspaceDockProps {
  activeItem: string;
  onSelect: (id: string) => void;
}

const MOBILE_WORKSPACES = [
  { id: "workspace-home", label: "首頁", icon: House, tone: "cyan" },
  { id: "station-status", label: "維修", icon: Gauge, tone: "blue" },
  { id: "material-requests", label: "料號", icon: PackageSearch, tone: "amber" },
  { id: "ai-chat", label: "查詢", icon: Search, tone: "lime" },
] as const;

const activeToneClasses = {
  amber: "border-amber-200/55 bg-amber-300 text-amber-950 shadow-[0_10px_28px_-15px_rgba(251,191,36,0.95)]",
  blue: "border-blue-200/55 bg-blue-400 text-white shadow-[0_10px_28px_-15px_rgba(96,165,250,0.95)]",
  cyan: "border-cyan-200/55 bg-cyan-300 text-cyan-950 shadow-[0_10px_28px_-15px_rgba(34,211,238,0.95)]",
  lime: "border-lime-200/55 bg-lime-300 text-lime-950 shadow-[0_10px_28px_-15px_rgba(190,242,100,0.95)]",
};

export function MobileWorkspaceDock({ activeItem, onSelect }: MobileWorkspaceDockProps) {
  return (
    <nav
      aria-label="手機主要工作區"
      data-mobile-workspace-dock="true"
      className="fixed inset-x-2 bottom-[max(8px,env(safe-area-inset-bottom))] z-[72] grid h-16 grid-cols-4 gap-1 rounded-[22px] border border-cyan-100/20 bg-[#071421]/95 p-1.5 shadow-[0_24px_70px_-24px_rgba(0,0,0,0.95),0_10px_32px_-24px_rgba(34,211,238,0.8)] backdrop-blur-xl lg:hidden"
    >
      {MOBILE_WORKSPACES.map((item) => {
        const Icon = item.icon;
        const active = activeItem === item.id;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onSelect(item.id)}
            className={cn(
              "flex min-w-0 flex-col items-center justify-center gap-1 rounded-[16px] border border-transparent text-[11px] font-black tracking-wide text-slate-400 transition-colors",
              active ? activeToneClasses[item.tone] : "hover:border-white/10 hover:bg-white/[0.05] hover:text-white",
            )}
          >
            <Icon className="h-5 w-5" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
