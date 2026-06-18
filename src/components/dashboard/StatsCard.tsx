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
    default: "border-border",
    success: "border-primary/35 bg-gradient-to-br from-primary/10 to-primary/[0.03] text-foreground",
    warning: "border-amber-300/35 bg-gradient-to-br from-amber-400/10 to-amber-400/[0.03] text-foreground",
    danger: "border-rose-300/35 bg-gradient-to-br from-rose-400/10 to-rose-400/[0.03] text-foreground",
    info: "border-blue-300/35 bg-gradient-to-br from-blue-400/10 to-blue-400/[0.03] text-foreground"
  };

  return (
    <Card className={cn(
      "transition-all duration-200 hover:shadow-md",
      variantStyles[variant],
      className
    )}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium opacity-90 sm:text-sm">
          {title}
        </CardTitle>
        <div className="opacity-70">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold mb-1">{value}</div>
        {description && (
          <p className="text-xs opacity-70 mb-2">
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
