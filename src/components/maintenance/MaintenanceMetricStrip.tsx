import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

export interface MaintenanceMetric {
  accent?: "blue" | "cyan" | "emerald" | "amber" | "rose";
  icon?: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}

const accentClasses = {
  amber: "border-amber-300/35 bg-amber-300/[0.08] text-amber-100",
  blue: "border-blue-300/35 bg-blue-300/[0.08] text-blue-100",
  cyan: "border-cyan-300/35 bg-cyan-300/[0.08] text-cyan-100",
  emerald: "border-emerald-300/35 bg-emerald-300/[0.08] text-emerald-100",
  rose: "border-rose-300/35 bg-rose-300/[0.08] text-rose-100",
};

export function MaintenanceMetricStrip({ metrics }: { metrics: MaintenanceMetric[] }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <div
            key={metric.label}
            className={cn(
              "flex min-w-[150px] flex-1 items-center justify-between gap-3 rounded-xl border px-3 py-2.5",
              accentClasses[metric.accent || "blue"]
            )}
          >
            <div className="min-w-0">
              <div className="truncate text-xs opacity-75">{metric.label}</div>
              <div className="font-data mt-0.5 text-xl font-semibold text-[#f3f8fc]">
                {metric.value}
              </div>
            </div>
            {Icon && <Icon className="h-5 w-5 shrink-0 opacity-80" />}
          </div>
        );
      })}
    </div>
  );
}
