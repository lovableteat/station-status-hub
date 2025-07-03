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
    success: "border-success bg-gradient-success text-success-foreground",
    warning: "border-warning bg-gradient-warning text-warning-foreground", 
    danger: "border-danger bg-gradient-danger text-danger-foreground",
    info: "border-info bg-gradient-primary text-info-foreground"
  };

  return (
    <Card className={cn(
      "transition-all duration-200 hover:shadow-md",
      variantStyles[variant],
      className
    )}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium opacity-90">
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
        {trend && (
          <div className={cn(
            "flex items-center text-xs",
            trend.isPositive ? "text-success" : "text-danger",
            variant !== "default" && "opacity-80"
          )}>
            <span className="mr-1">
              {trend.isPositive ? "↗" : "↘"}
            </span>
            {Math.abs(trend.value)}% vs 昨日
          </div>
        )}
      </CardContent>
    </Card>
  );
}