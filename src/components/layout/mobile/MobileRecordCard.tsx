import type { ComponentType, ReactNode } from "react";
import { ChevronRight, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface MobileRecordMeta {
  key: string;
  label: string;
  value: ReactNode;
  /** Let a long value (file name, Ref Des) take the whole row. */
  wide?: boolean;
  mono?: boolean;
}

export interface MobileRecordAction {
  key: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick: () => void;
  tone?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  testId?: string;
}

export interface MobileRecordCardProps {
  /** Main key of the record (issue title, file name, account…). */
  title: ReactNode;
  titleAttr?: string;
  subtitle?: ReactNode;
  /** Status chips rendered after the title, already styled by the caller. */
  badges?: ReactNode;
  leading?: ReactNode;
  meta?: MobileRecordMeta[];
  /** Up to two 44px actions; the rest go to `onMore`. */
  actions?: MobileRecordAction[];
  onMore?: () => void;
  moreLabel?: string;
  /** Tapping the title area opens the record. */
  onOpen?: () => void;
  openLabel?: string;
  selected?: boolean;
  children?: ReactNode;
  className?: string;
  testId?: string;
}

/**
 * Card anatomy shared by every phone list: title row (key + status chips),
 * meta grid (two label-value pairs per row), then at most two 44px actions
 * plus 更多. Tables stay on desktop or behind an explicit 表格 switch.
 */
export function MobileRecordCard({
  title, titleAttr, subtitle, badges, leading, meta = [], actions = [], onMore, moreLabel = "更多", onOpen, openLabel = "開啟", selected, children, className, testId,
}: MobileRecordCardProps) {
  const visibleActions = actions.slice(0, 2);
  const TitleTag = onOpen ? "button" : "div";
  return (
    <article data-mobile-record-card="true" data-testid={testId} aria-selected={selected} className={cn("mobile-record-card", selected && "mobile-record-card--selected", className)}>
      <TitleTag
        type={onOpen ? "button" : undefined}
        onClick={onOpen}
        aria-label={onOpen && typeof title === "string" ? `${openLabel}：${title}` : undefined}
        className={cn("mobile-record-card__head", onOpen && "mobile-record-card__head--button")}
      >
        {leading && <span className="mobile-record-card__leading">{leading}</span>}
        <span className="min-w-0 flex-1">
          <span className="mobile-record-card__title" title={titleAttr}>{title}</span>
          {subtitle && <span className="mobile-record-card__subtitle">{subtitle}</span>}
          {badges && <span className="mobile-record-card__badges">{badges}</span>}
        </span>
        {onOpen && <ChevronRight className="mobile-record-card__chevron" aria-hidden="true" />}
      </TitleTag>
      {meta.length > 0 && (
        <dl className="mobile-record-card__meta">
          {meta.map((item) => (
            <div key={item.key} className={cn("mobile-record-card__meta-item", item.wide && "mobile-record-card__meta-item--wide")}>
              <dt>{item.label}</dt>
              <dd className={cn(item.mono && "font-mono")}>{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
      {(visibleActions.length > 0 || onMore) && (
        <div className="mobile-record-card__actions">
          {visibleActions.map((action) => {
            const Icon = action.icon;
            return (
              <Button key={action.key} type="button" size="sm" variant={action.tone === "primary" ? "default" : action.tone === "danger" ? "destructive" : "outline"} disabled={action.disabled} onClick={action.onClick} data-testid={action.testId} className="mobile-record-card__action">
                {Icon && <Icon className="h-4 w-4" />}
                <span className="truncate">{action.label}</span>
              </Button>
            );
          })}
          {onMore && (
            <Button type="button" size="sm" variant="ghost" onClick={onMore} aria-label={moreLabel} title={moreLabel} className="mobile-record-card__action mobile-record-card__action--more">
              <MoreHorizontal className="h-4 w-4" />
              <span className="truncate">{moreLabel}</span>
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
