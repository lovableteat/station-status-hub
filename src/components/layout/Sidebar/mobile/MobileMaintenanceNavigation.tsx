import { cn } from "@/lib/utils";

import type { MaintenanceNavigationProps } from "../shared/navigation";

export function MobileMaintenanceNavigation({
  activeModule,
  onModuleChange,
  navigationItems,
}: MaintenanceNavigationProps) {
  return (
    <nav
      aria-label="維修中心功能"
      data-mobile-maintenance-nav="true"
      className="sticky top-[var(--mobile-header-height)] z-30 flex w-full shrink-0 snap-x gap-1 overflow-x-auto rounded-xl border border-cyan-200/20 bg-[#071522]/96 p-1 shadow-[0_14px_34px_-28px_rgba(34,211,238,0.75)] backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:top-[72px]"
    >
      {navigationItems.map((item) => {
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
