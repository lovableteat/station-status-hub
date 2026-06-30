import { Bell, ChevronDown, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface WorkspaceNavItem {
  id: string;
  label: string;
}

interface MainWorkspaceHeaderProps {
  items: WorkspaceNavItem[];
  activeItem?: string;
  onSelect: (id: string) => void;
  onLogout: () => void;
  onBrandClick?: () => void;
  userName?: string;
  userRoleLabel?: string;
}

export function MainWorkspaceHeader({
  items,
  activeItem,
  onSelect,
  onLogout,
  onBrandClick,
  userName,
  userRoleLabel,
}: MainWorkspaceHeaderProps) {
  const brand = (
    <>
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-[0_16px_34px_-24px_hsl(var(--primary)/0.65)]">
        <span className="text-lg font-black tracking-[0.08em]">S</span>
      </div>
      <div className="text-left">
        <div className="text-[1.55rem] font-semibold tracking-[-0.03em] text-foreground">
          Station Status Hub
        </div>
        <div className="text-sm text-muted-foreground">
          Unified operations workspace
        </div>
      </div>
    </>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-primary/15 bg-[linear-gradient(180deg,hsl(222_42%_11%/0.98),hsl(223_42%_9%/0.95))] backdrop-blur-xl">
      <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        {onBrandClick ? (
          <button
            type="button"
            onClick={onBrandClick}
            className="flex items-center gap-3 text-left"
          >
            {brand}
          </button>
        ) : (
          <div className="flex items-center gap-3">{brand}</div>
        )}

        <nav className="flex overflow-x-auto rounded-2xl border border-primary/15 bg-background/30 p-1.5">
          {items.map((item) => {
            const isActive = item.id === activeItem;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  "min-w-fit rounded-xl px-5 py-3 text-base font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-[0_16px_34px_-24px_hsl(var(--primary)/0.85)]"
                    : "text-foreground/80 hover:bg-primary/10 hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center justify-between gap-3 lg:justify-end">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-xl border border-primary/15 bg-background/20 text-muted-foreground hover:bg-primary/10 hover:text-foreground"
          >
            <Bell className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-3 rounded-2xl border border-primary/15 bg-background/20 px-3 py-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
              {(userName ?? "OP").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">
                {userName ?? "Operator"}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {userRoleLabel ?? "一般使用者"}
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onLogout}
            className="hidden h-10 rounded-xl border-primary/20 bg-background/20 px-4 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive lg:inline-flex"
          >
            <LogOut className="mr-2 h-4 w-4" />
            登出
          </Button>
        </div>
      </div>
    </header>
  );
}
