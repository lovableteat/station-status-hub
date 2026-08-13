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
        "flex min-h-12 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-[-0.02em] text-[#f3f8fc] sm:text-2xl">
            {title}
          </h1>
          {description && (
            <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-[#a9c0d1] sm:truncate sm:text-sm">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:w-auto sm:shrink-0 sm:flex-wrap">{actions}</div>}
    </header>
  );
}
