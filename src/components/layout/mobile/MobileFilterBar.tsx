import type { ReactNode } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface MobileFilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

export interface MobileFilterBarProps {
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    label?: string;
    onSubmit?: () => void;
  };
  /** Selects and toggles, laid out two per row; keep the shared order 搜尋 → 站點 → 狀態 → 負責人 → 領域條件. */
  controls?: ReactNode;
  chips?: MobileFilterChip[];
  onClearAll?: () => void;
  /** "N / M 筆" or any short result summary shown at the end of the bar. */
  summary?: ReactNode;
  className?: string;
  testId?: string;
}

/**
 * Persistent phone filter bar (AGENTS.md 可篩選資料清單 rule 1, 3 and 7): sits
 * directly above the results, never inside a sheet, and shows every active
 * condition as a removable chip with a single 全部清除.
 */
export function MobileFilterBar({ search, controls, chips = [], onClearAll, summary, className, testId }: MobileFilterBarProps) {
  return (
    <div data-mobile-filter-bar="true" data-testid={testId} className={cn("mobile-filter-bar", className)}>
      {search && (
        <form className="mobile-filter-bar__search" role="search" onSubmit={(event) => { event.preventDefault(); search.onSubmit?.(); }}>
          <Search className="mobile-filter-bar__search-icon" aria-hidden="true" />
          <Input
            type="search"
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
            placeholder={search.placeholder}
            aria-label={search.label ?? search.placeholder ?? "搜尋"}
            enterKeyHint="search"
            autoComplete="off"
            className="mobile-filter-bar__input"
          />
          {search.value && (
            <button type="button" aria-label="清除搜尋" onClick={() => search.onChange("")} className="mobile-filter-bar__clear"><X className="h-4 w-4" /></button>
          )}
        </form>
      )}
      {controls && <div className="mobile-filter-bar__controls">{controls}</div>}
      {(chips.length > 0 || summary) && (
        <div className="mobile-filter-bar__status">
          {chips.length > 0 && (
            <div data-mobile-filter-chips="true" className="mobile-filter-bar__chips">
              {chips.map((chip) => (
                <button key={chip.key} type="button" onClick={chip.onRemove} aria-label={`移除篩選：${chip.label}`} className="mobile-filter-bar__chip">
                  <span className="truncate">{chip.label}</span>
                  <X className="h-3 w-3 shrink-0" aria-hidden="true" />
                </button>
              ))}
              {onClearAll && <Button type="button" variant="ghost" size="sm" onClick={onClearAll} className="mobile-filter-bar__clear-all">全部清除</Button>}
            </div>
          )}
          {summary && <p className="mobile-filter-bar__summary">{summary}</p>}
        </div>
      )}
    </div>
  );
}
