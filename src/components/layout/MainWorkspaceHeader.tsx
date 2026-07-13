import { Bell, ChevronDown, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  onOpenNotifications?: () => void;
  onBrandClick?: () => void;
  onOpenWorkspaceHome?: () => void;
  userName?: string;
  userRoleLabel?: string;
  userMenuItems?: Array<{
    id: string;
    label: string;
    onSelect: () => void;
  }>;
}

export function MainWorkspaceHeader({
  items,
  activeItem,
  onSelect,
  onLogout,
  onOpenNotifications,
  onBrandClick,
  onOpenWorkspaceHome,
  userName,
  userRoleLabel,
  userMenuItems = [],
}: MainWorkspaceHeaderProps) {
  const brand = (
    <>
      <div className="interactive-lift flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary shadow-[0_16px_34px_-24px_hsl(var(--primary)/0.65)] sm:h-11 sm:w-11 sm:rounded-[1.15rem]">
        <span className="text-base font-black tracking-[0.08em] sm:text-lg">S</span>
      </div>
      <div className="min-w-0 text-left">
        <div className="truncate text-lg font-semibold tracking-[-0.03em] text-foreground sm:text-[1.35rem] 2xl:text-[1.5rem]">
          工作整合平台
        </div>
        <div className="hidden truncate text-xs text-muted-foreground sm:block 2xl:text-sm">
          整合式工作平台
        </div>
      </div>
    </>
  );

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-primary/15 bg-[linear-gradient(180deg,hsl(222_42%_11%/0.98),hsl(223_42%_9%/0.95))] shadow-[0_18px_48px_-42px_hsl(var(--primary)/0.55)] backdrop-blur-xl">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 px-3 py-3 sm:px-4 xl:grid-cols-[minmax(180px,1fr)_auto_minmax(180px,1fr)] xl:gap-x-4 xl:px-5 2xl:px-6">
        {onBrandClick ? (
          <button
            type="button"
            onClick={onBrandClick}
            className="flex min-w-0 items-center gap-2.5 text-left sm:gap-3"
          >
            {brand}
          </button>
        ) : (
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">{brand}</div>
        )}

        <nav className="glass-strip order-3 col-span-2 flex w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-2xl border border-primary/15 p-1 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.04)] [scrollbar-width:thin] xl:order-none xl:col-span-1 xl:w-auto xl:max-w-[min(58vw,760px)]">
          {items.map((item) => {
            const isActive = item.id === activeItem;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  "interactive-lift min-w-fit rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 2xl:px-4",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-[0_18px_34px_-24px_hsl(var(--primary)/0.85)]"
                    : "text-foreground/80 hover:bg-primary/10 hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex min-w-0 items-center justify-end gap-2 xl:gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenNotifications}
            className="h-10 w-10 rounded-xl border border-primary/15 bg-background/20 text-muted-foreground hover:bg-primary/10 hover:text-foreground"
          >
            <Bell className="h-4 w-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="interactive-lift flex min-w-0 items-center gap-2 rounded-xl border border-primary/15 bg-background/20 px-2 py-2 text-left transition-colors hover:bg-primary/10 hover:shadow-[0_16px_28px_-24px_hsl(var(--primary)/0.55)] sm:gap-3 sm:rounded-2xl sm:px-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/15 text-xs font-bold text-primary shadow-[inset_0_1px_0_hsl(0_0%_100%/0.04)] sm:h-10 sm:w-10 sm:text-sm">
                  {(userName ?? "OP").slice(0, 2).toUpperCase()}
                </div>
                <div className="hidden min-w-0 sm:block">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {userName ?? "Operator"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {userRoleLabel ?? "使用者"}
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56 rounded-2xl border-primary/15 bg-[hsl(223_34%_11%/0.98)] p-2 text-foreground"
            >
              <div className="px-2 py-1.5">
                <div className="truncate text-sm font-semibold text-foreground">
                  {userName ?? "Operator"}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {userRoleLabel ?? "使用者"}
                </div>
              </div>
              <DropdownMenuSeparator className="bg-primary/10" />
              {onOpenWorkspaceHome && (
                <DropdownMenuItem
                  onClick={onOpenWorkspaceHome}
                  className="rounded-xl px-3 py-2 text-sm text-foreground focus:bg-primary/10 focus:text-foreground"
                >
                  工作區首頁
                </DropdownMenuItem>
              )}
              {userMenuItems.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onClick={item.onSelect}
                  className="rounded-xl px-3 py-2 text-sm text-foreground focus:bg-primary/10 focus:text-foreground"
                >
                  {item.label}
                </DropdownMenuItem>
              ))}
              {(onOpenWorkspaceHome || userMenuItems.length > 0) && (
                <DropdownMenuSeparator className="bg-primary/10" />
              )}
              <DropdownMenuItem
                onClick={onLogout}
                className="rounded-xl px-3 py-2 text-sm text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                登出
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="sm"
            onClick={onLogout}
            className="hidden h-10 rounded-xl border-primary/20 bg-background/20 px-4 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive 2xl:inline-flex"
          >
            <LogOut className="mr-2 h-4 w-4" />
            登出
          </Button>
        </div>
      </div>
    </header>
  );
}
