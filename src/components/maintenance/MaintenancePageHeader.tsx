import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface MaintenancePageHeaderProps {
  actions?: ReactNode;
  className?: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  title: string;
}

export function MaintenancePageHeader({
  actions,
  className,
  description,
  icon: Icon,
  title,
}: MaintenancePageHeaderProps) {
  return (
    <header
      className={cn(
        "flex min-h-11 items-center justify-between gap-2 sm:min-h-12 sm:gap-3",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {Icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-cyan-100 sm:h-10 sm:w-10">
            <Icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-[-0.02em] text-[#f3f8fc] sm:text-2xl">
            {title}
          </h1>
          {description && (
            <p className="mt-0.5 hidden truncate text-sm text-[#a9c0d1] sm:block">{description}</p>
          )}
        </div>
      </div>
      {actions && <div data-maintenance-page-actions="true" className="flex max-w-[52%] shrink-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-auto sm:max-w-none sm:flex-wrap sm:gap-2">{actions}</div>}
    </header>
  );
}
