import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

export interface MaintenanceMetric {
  accent?: "blue" | "cyan" | "emerald" | "amber" | "rose";
  icon?: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}

const accentClasses = {
  amber: "border-amber-300/55 bg-[#3a2c18] text-amber-100",
  blue: "border-blue-300/55 bg-[#123252] text-blue-100",
  cyan: "border-cyan-300/55 bg-[#123545] text-cyan-100",
  emerald: "border-emerald-300/55 bg-[#103a35] text-emerald-100",
  rose: "border-rose-300/55 bg-[#3a202d] text-rose-100",
};

export function MaintenanceMetricStrip({ metrics }: { metrics: MaintenanceMetric[] }) {
  return (
    <div data-mobile-metric-strip="true" className="grid grid-cols-2 gap-2 pb-1 lg:grid-cols-4 lg:overflow-visible">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <div
            key={metric.label}
            className={cn(
              "flex min-w-0 items-center justify-between gap-2 rounded-xl border border-l-4 px-3 py-2 lg:gap-3 lg:py-2.5",
              accentClasses[metric.accent || "blue"]
            )}
          >
            <div className="min-w-0">
              <div className="truncate text-xs opacity-75">{metric.label}</div>
              <div className="font-data mt-0.5 text-lg font-semibold text-[#f3f8fc] lg:text-xl">
                {metric.value}
              </div>
            </div>
            {Icon && <Icon className="h-4 w-4 shrink-0 opacity-80 lg:h-5 lg:w-5" />}
          </div>
        );
      })}
    </div>
  );
}
