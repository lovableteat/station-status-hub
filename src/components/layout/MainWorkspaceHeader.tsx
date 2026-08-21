import type { ReactNode } from "react";
import { Camera, ChevronDown, LogOut } from "lucide-react";

import { UserAvatar } from "@/components/account/UserAvatar";
import { PlatformLogoMark } from "@/components/brand/PlatformLogoMark";
import { Button } from "@/components/ui/button";
import { OnlineUsersIndicator } from "@/components/common/OnlineUsersIndicator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { WebsiteQrButton } from "./WebsiteQrButton";

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
  onOpenWorkspaceHome?: () => void;
  userName?: string;
  userAvatarPath?: string | null;
  userRoleLabel?: string;
  showOnlineUsers?: boolean;
  userMenuItems?: Array<{
    id: string;
    label: string;
    icon?: ReactNode;
    emphasized?: boolean;
    onSelect: () => void;
  }>;
}

export function MainWorkspaceHeader({
  items,
  activeItem,
  onSelect,
  onLogout,
  onBrandClick,
  onOpenWorkspaceHome,
  userName,
  userAvatarPath,
  userRoleLabel,
  showOnlineUsers = true,
  userMenuItems = [],
}: MainWorkspaceHeaderProps) {
  const brand = (
    <>
      <PlatformLogoMark className="interactive-lift h-9 w-9 text-primary sm:h-11 sm:w-11" />
      <div className="min-w-0 text-left">
        <div className="truncate text-base font-semibold tracking-[-0.03em] text-foreground sm:text-[1.35rem] 2xl:text-[1.5rem]">
          工作整合平台
        </div>
        <div className="hidden truncate text-xs text-muted-foreground sm:block 2xl:text-sm">
          整合式工作平台
        </div>
      </div>
    </>
  );
  const brandPositionClassName =
    "absolute left-[max(0.625rem,env(safe-area-inset-left))] top-1/2 z-10 flex min-w-0 max-w-[calc(100%-4.5rem)] -translate-y-1/2 items-center gap-2.5 text-left sm:gap-3 sm:max-w-[min(75vw,360px)]";

  return (
    <header data-mobile-app-header="true" className="platform-color-field relative sticky top-0 z-50 shrink-0 border-b border-primary/15 shadow-[0_18px_48px_-42px_hsl(var(--primary)/0.55)] backdrop-blur-xl">
      <div className="mx-auto grid min-h-[var(--mobile-header-height)] w-full max-w-[1920px] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-3 px-2.5 py-1.5 sm:min-h-[72px] sm:gap-x-3 sm:px-4 sm:py-3 xl:grid-cols-[minmax(180px,0.9fr)_minmax(0,2.3fr)_auto] xl:gap-x-4 xl:px-5 2xl:px-6">
        {onBrandClick ? (
          <button
            type="button"
            data-platform-brand="top-left"
            onClick={onBrandClick}
            className={brandPositionClassName}
          >
            {brand}
          </button>
        ) : (
          <div data-platform-brand="top-left" className={brandPositionClassName}>{brand}</div>
        )}

        <nav aria-label="工作區導覽" className="glass-strip order-3 col-span-2 hidden w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-2xl border border-primary/15 p-1 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.04)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex lg:w-fit lg:max-w-full lg:justify-self-center xl:order-none xl:col-span-1 xl:col-start-2">
          {items.map((item) => {
            const isActive = item.id === activeItem;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  "interactive-lift min-w-fit shrink-0 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 xl:px-1.5 xl:text-xs 2xl:px-4 2xl:text-sm",
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

        <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2 xl:col-start-3 xl:gap-3">
          {showOnlineUsers && <div className="hidden md:block"><OnlineUsersIndicator /></div>}

          <div className="hidden md:block"><WebsiteQrButton /></div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={userMenuItems.length > 0 ? "開啟帳號選單，可編輯大頭貼" : "開啟帳號選單"}
                className="interactive-lift flex h-10 w-[140px] shrink-0 items-center gap-2 rounded-xl border border-primary/15 bg-background/20 px-3 text-left transition-colors hover:bg-primary/10 hover:shadow-[0_16px_28px_-24px_hsl(var(--primary)/0.55)] max-sm:w-10 max-sm:justify-center max-sm:px-0 sm:h-12 sm:rounded-2xl sm:gap-3"
              >
                <span className="relative shrink-0">
                  <UserAvatar
                    avatarPath={userAvatarPath}
                    displayName={userName ?? "Operator"}
                    className="h-8 w-8 border border-primary/20 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.04)]"
                    fallbackClassName="bg-primary/15 text-xs text-primary sm:text-sm"
                  />
                  {userMenuItems.length > 0 ? (
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-background bg-primary text-primary-foreground shadow-sm"
                    >
                      <Camera className="h-2.5 w-2.5" />
                    </span>
                  ) : null}
                </span>
                <div className="hidden min-w-0 sm:block">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {userName ?? "Operator"}
                  </div>
                  <div className={cn(
                    "truncate text-xs",
                    userMenuItems.length > 0 ? "font-semibold text-primary" : "text-muted-foreground",
                  )}>
                    {userMenuItems.length > 0 ? "編輯大頭貼" : userRoleLabel ?? "使用者"}
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground max-sm:hidden" />
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
                  className={cn(
                    "rounded-xl px-3 py-2 text-sm text-foreground focus:bg-primary/10 focus:text-foreground",
                    item.emphasized && "my-1 bg-primary/10 font-semibold text-primary focus:bg-primary/20 focus:text-primary",
                  )}
                >
                  {item.icon ? <span className="mr-2 shrink-0">{item.icon}</span> : null}
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
            className="hidden h-12 rounded-2xl border-primary/20 bg-background/20 px-4 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive 2xl:inline-flex"
          >
            <LogOut className="mr-2 h-4 w-4" />
            登出
          </Button>
        </div>
      </div>
    </header>
  );
}
