import type { ComponentType, ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface MobileCommandAction {
  key: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick: () => void;
  /** `primary` is the filled brand button; `secondary` is outline. At most two actions are shown. */
  tone?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  /** Short badge (count) rendered after the label. */
  badge?: string | number;
  /** Icon-only on the narrowest phones; the label stays available as the accessible name. */
  iconOnly?: boolean;
  testId?: string;
}

export interface MobileCommandBarProps {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  /** One line of context under the title: project, space, version… truncated with the full text in `title`. */
  context?: ReactNode;
  contextTitle?: string;
  /** Up to two primary actions; anything else belongs in the tools sheet. */
  actions?: MobileCommandAction[];
  /** Opens the workspace's MobileToolsSheet. Omit when the workspace has no secondary tools. */
  onOpenTools?: () => void;
  toolsLabel?: string;
  toolsBadge?: string | number;
  /** Slot rendered under the bar (segment control, module tabs, status strip). */
  children?: ReactNode;
  /** 44px control rendered before the heading, e.g. the files page's space drawer toggle. */
  leading?: ReactNode;
  className?: string;
  testId?: string;
}

/**
 * The first row of every workspace on a phone: title + context on the left,
 * at most two primary actions and one tools button on the right. Secondary
 * actions, sorting, exports and help live in MobileToolsSheet, so the bar
 * stays one line high and every control is a 44px target.
 */
export function MobileCommandBar({
  icon: Icon, title, context, contextTitle, actions = [], onOpenTools, toolsLabel = "工具", toolsBadge, children, className, testId, leading,
}: MobileCommandBarProps) {
  const visibleActions = actions.slice(0, 2);
  return (
    <section data-mobile-command-bar="true" data-testid={testId} className={cn("mobile-command-bar lg:hidden", className)}>
      <div className="mobile-command-bar__row">
        {leading && <div className="mobile-command-bar__leading">{leading}</div>}
        <div className="mobile-command-bar__heading">
          {Icon && <span className="mobile-command-bar__icon" aria-hidden="true"><Icon className="h-4 w-4" /></span>}
          <div className="min-w-0">
            <h1 className="mobile-command-bar__title">{title}</h1>
            {context && <p className="mobile-command-bar__context" title={contextTitle}>{context}</p>}
          </div>
        </div>
        <div className="mobile-command-bar__actions">
          {visibleActions.map((action) => {
            const ActionIcon = action.icon;
            return (
              <Button
                key={action.key}
                type="button"
                size="sm"
                variant={action.tone === "secondary" ? "outline" : action.tone === "danger" ? "destructive" : "default"}
                disabled={action.disabled}
                onClick={action.onClick}
                aria-label={action.iconOnly ? action.label : undefined}
                title={action.iconOnly ? action.label : undefined}
                data-testid={action.testId}
                data-mobile-command-action={action.key}
                className={cn("mobile-command-bar__action", action.iconOnly && "mobile-command-bar__action--icon")}
              >
                {ActionIcon && <ActionIcon className="h-4 w-4" />}
                {!action.iconOnly && <span className="truncate">{action.label}</span>}
                {action.badge !== undefined && action.badge !== "" && <span className="mobile-command-bar__badge">{action.badge}</span>}
              </Button>
            );
          })}
          {onOpenTools && (
            <Button type="button" size="sm" variant="outline" onClick={onOpenTools} aria-label={toolsLabel} title={toolsLabel} data-mobile-command-tools="true" className="mobile-command-bar__action mobile-command-bar__action--icon">
              <SlidersHorizontal className="h-4 w-4" />
              {toolsBadge !== undefined && toolsBadge !== "" && <span className="mobile-command-bar__badge">{toolsBadge}</span>}
            </Button>
          )}
        </div>
      </div>
      {children && <div className="mobile-command-bar__slot">{children}</div>}
    </section>
  );
}
