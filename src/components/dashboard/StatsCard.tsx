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
    success: "border-success bg-gradient-to-br from-success/10 to-success/5 text-foreground",
    warning: "border-warning bg-gradient-to-br from-warning/10 to-warning/5 text-foreground", 
    danger: "border-danger bg-gradient-to-br from-danger/10 to-danger/5 text-foreground",
    info: "border-info bg-gradient-to-br from-info/10 to-info/5 text-foreground"
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
      </CardContent>
    </Card>
  );
}