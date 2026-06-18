import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  description?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
  variant?: "default" | "success" | "warning" | "danger" | "info";
}

export function StatsCard({
  title,
  value,
  icon,
  description,
  trend,
  className,
  variant = "default"
}: StatsCardProps) {
  const variantStyles = {
    default: "border-border bg-[linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)))] text-foreground",
    success: "border-primary/28 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.18),transparent_34%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)))] text-foreground",
    warning: "border-amber-300/28 bg-[radial-gradient(circle_at_top_right,hsl(43_96%_56%/0.18),transparent_34%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)))] text-foreground",
    danger: "border-rose-300/28 bg-[radial-gradient(circle_at_top_right,hsl(351_95%_71%/0.18),transparent_34%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)))] text-foreground",
    info: "border-blue-300/28 bg-[radial-gradient(circle_at_top_right,hsl(214_86%_66%/0.18),transparent_34%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)))] text-foreground"
  };
  const iconStyles = {
    default: "border-white/10 bg-background/30 text-foreground/75",
    success: "border-primary/20 bg-primary/12 text-primary",
    warning: "border-amber-300/20 bg-amber-400/10 text-amber-200",
    danger: "border-rose-300/20 bg-rose-400/10 text-rose-200",
    info: "border-blue-300/20 bg-blue-400/10 text-blue-200"
  };

  return (
    <Card className={cn(
      "group relative overflow-hidden rounded-[28px] shadow-[0_18px_44px_-38px_hsl(var(--background)/0.9)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_30px_60px_-42px_hsl(var(--primary)/0.45)]",
      variantStyles[variant],
      className
    )}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-muted-foreground/70">
            即時訊號
          </p>
          <CardTitle className="mt-3 text-base font-semibold opacity-95 sm:text-base">
            {title}
          </CardTitle>
        </div>
        <div className={cn(
          "flex h-12 w-12 items-center justify-center rounded-2xl border shadow-[inset_0_1px_0_hsl(0_0%_100%/0.08)]",
          iconStyles[variant]
        )}>
          {icon}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-4xl font-semibold tracking-tight text-foreground">{value}</div>
        <div className="mt-5 flex items-end justify-between gap-4">
          {description ? (
            <div className="rounded-2xl border border-white/8 bg-background/25 px-4 py-3">
              <p className="text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </div>
          ) : (
            <div />
          )}
          {trend && (
            <div className="pb-1 text-right">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Trend</p>
              <p className={cn("mt-2 text-sm font-semibold", trend.isPositive ? "text-primary" : "text-destructive")}>
                {trend.isPositive ? "+" : "-"}{Math.abs(trend.value)}%
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
