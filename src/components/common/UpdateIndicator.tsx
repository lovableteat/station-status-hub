import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface UpdateIndicatorProps {
  isUpdating: boolean;
  className?: string;
}

export function UpdateIndicator({ isUpdating, className }: UpdateIndicatorProps) {
  const [showIndicator, setShowIndicator] = useState(false);

  useEffect(() => {
    if (isUpdating) {
      setShowIndicator(true);
    } else {
      // 延遲隱藏以確保用戶看到更新完成
      const timer = setTimeout(() => setShowIndicator(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isUpdating]);

  if (!showIndicator) return null;

  return (
    <div className={cn(
      "fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg transition-all duration-300",
      "bg-primary/10 border border-primary/20 backdrop-blur-sm",
      "animate-fade-in",
      className
    )}>
      <RefreshCw 
        className={cn(
          "h-4 w-4 text-primary transition-transform duration-300",
          isUpdating && "animate-spin"
        )} 
      />
      <span className="text-sm font-medium text-primary">
        {isUpdating ? "更新中..." : "已更新"}
      </span>
    </div>
  );
}