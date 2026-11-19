import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, Filter, FilterX, Minus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import {
  FILTER_OPTION_LIST_HEIGHT, FILTER_OPTION_OVERSCAN, FILTER_OPTION_ROW_HEIGHT, normalizeColumnFilterSelection, parseSearchTokens,
  type ColumnFilterSelection, type ExcelFilterOption,
} from "./materialExcelFilterValues";
import { matchesMaterialReference } from "./materialSearch";
import type { MaterialColumnSort } from "./materialTableSort";
import { materialTrackingStatusPresentation } from "./materialTrackingStatus";

// The Excel-style column filter of the material table (checkbox values, search, A→Z / Z→A, 確定／取消).
// Shared so every material list filters the same way (料號表, 專案總料表).

export function ExcelFilterPopover<K extends string>({
  filterKey,
  getOptions,
  label,
  triggerLabel,
  optionRowHeight = FILTER_OPTION_ROW_HEIGHT,
  selectedValues,
  onSelectedValuesChange,
  activeSort,
  onSortChange,
  insideDialog = false,
}: {
  filterKey: K;
  getOptions: (key: K) => ExcelFilterOption[];
  label: string;
  triggerLabel?: string;
  optionRowHeight?: number;
  selectedValues: ColumnFilterSelection;
  onSelectedValuesChange: (values: ColumnFilterSelection) => void;
  activeSort: MaterialColumnSort<K> | null;
  onSortChange: (sort: MaterialColumnSort<K>) => void;
  /**
   * Inside a dialog: the dialog's scroll lock swallows the wheel over this panel (it renders outside the dialog), so
   * the value list would not scroll. A modal popover takes the lock over while it is open.
   */
  insideDialog?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isPanelReady, setIsPanelReady] = useState(false);
  const [options, setOptions] = useState<ExcelFilterOption[]>([]);
  const isSorted = activeSort?.key === filterKey;
  const sortDirection = isSorted ? activeSort.direction : "asc";
  const [searchValue, setSearchValue] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [draftValues, setDraftValues] = useState<ColumnFilterSelection>(null);
  const deferredSearchValue = useDeferredValue(searchValue);
  const selected = useMemo(() => normalizeColumnFilterSelection(selectedValues), [selectedValues]);
  const allOptionValues = useMemo(() => options.map((option) => option.value), [options]);
  const optionValueSet = useMemo(() => new Set(allOptionValues), [allOptionValues]);
  const selectedList = useMemo(() => (draftValues === null ? allOptionValues : draftValues), [allOptionValues, draftValues]);
  const selectedSet = useMemo(() => new Set(selectedList), [selectedList]);
  const hiddenSelectedCount = draftValues === null ? 0 : draftValues.filter((value) => !optionValueSet.has(value)).length;
  const isSearching = searchValue !== deferredSearchValue;
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setDraftValues(selected);
    setOpen(nextOpen);
  };

  useEffect(() => {
    if (!open) {
      setIsPanelReady(false);
      setOptions([]);
      setSearchValue("");
      setScrollTop(0);
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      setOptions(getOptions(filterKey));
      setIsPanelReady(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [filterKey, getOptions, open]);

  const searchTokens = useMemo(() => parseSearchTokens(deferredSearchValue), [deferredSearchValue]);
  const searchHasValue = searchTokens.length > 0;
  const filteredOptions = useMemo(() => {
    const next = searchHasValue
      ? options.filter((option) => {
          const searchableText = `${option.label} ${option.keywords ?? option.value}`.toLowerCase();
          return searchTokens.every((token) => filterKey === "refDes" ? matchesMaterialReference(option.value, token) : searchableText.includes(token));
        })
      : options;
    return [...next].sort((left, right) => sortDirection === "asc"
      ? left.label.localeCompare(right.label, undefined, { numeric: true })
      : right.label.localeCompare(left.label, undefined, { numeric: true }));
  }, [filterKey, options, searchHasValue, searchTokens, sortDirection]);
  const visibleValues = useMemo(() => filteredOptions.map((option) => option.value), [filteredOptions]);
  const visibleCheckedCount = filteredOptions.filter((option) => selectedSet.has(option.value)).length;
  const allVisibleChecked = filteredOptions.length > 0 && visibleCheckedCount === filteredOptions.length;

  useEffect(() => {
    setScrollTop(0);
  }, [deferredSearchValue, sortDirection]);

  const virtualStartIndex = Math.max(0, Math.floor(scrollTop / optionRowHeight) - FILTER_OPTION_OVERSCAN);
  const virtualEndIndex = Math.min(filteredOptions.length, Math.ceil((scrollTop + FILTER_OPTION_LIST_HEIGHT) / optionRowHeight) + FILTER_OPTION_OVERSCAN);
  const visibleOptionSlice = filteredOptions.slice(virtualStartIndex, virtualEndIndex);

  const commitSelection = () => {
    const values = searchHasValue ? selectedList.filter(value => visibleValues.includes(value)) : draftValues;
    const normalized = normalizeColumnFilterSelection(values);
    const isEverything = normalized === null || (normalized.every(value => optionValueSet.has(value))
      && options.length > 0
      && normalized.length === options.length
      && options.every((option) => normalized.includes(option.value)));
    onSelectedValuesChange(isEverything ? null : normalized);
    setOpen(false);
  };
  const toggleValue = (value: string, checked: boolean) => {
    setDraftValues(checked ? Array.from(new Set([...selectedList, value])) : selectedList.filter((item) => item !== value));
  };
  const toggleVisible = (checked: boolean) => {
    if (!searchHasValue) {
      setDraftValues(checked ? null : []);
      return;
    }
    setDraftValues(checked ? Array.from(new Set([...selectedList, ...visibleValues])) : selectedList.filter(value => !visibleValues.includes(value)));
  };
  const triggerSummary = selected === null ? "全部" : `${selected.length}項`;

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={insideDialog}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 w-full items-center justify-between rounded-md border px-2 text-left text-xs font-semibold transition-colors hover:border-primary/50 hover:bg-primary/10",
            selected === null
              ? "border-border bg-secondary/60 text-foreground"
              : "border-primary/45 bg-primary/15 text-foreground",
          )}
          title={selected === null ? `篩選${label}` : `${label}：已選 ${selected.length} 項`}
          aria-label={`篩選${label}${isSorted ? `，${sortDirection === "asc" ? "A 到 Z" : "Z 到 A"}排序` : ""}`}
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Filter className={cn("h-3.5 w-3.5 flex-none", selected === null ? "text-muted-foreground" : "text-primary")} />
            <span className="truncate">{triggerLabel ?? label}</span>
            {isSorted && <span className="shrink-0 text-primary">{sortDirection === "asc" ? "↑" : "↓"}</span>}
          </span>
          {selected !== null && !triggerLabel && (
            <span className="ml-1 flex-none rounded bg-primary/20 px-1.5 text-[10px] leading-4 text-primary">
              {triggerSummary}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        sticky="always"
        data-testid="material-column-filter-panel"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.querySelector<HTMLInputElement>("input")?.focus();
        }}
        className="flex max-h-[var(--radix-popover-content-available-height)] w-[min(360px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg border border-border bg-popover p-2.5 text-popover-foreground shadow-lg"
      >
        <div className="min-h-0 space-y-2 overflow-y-auto">
          <div className="flex shrink-0 items-center gap-2 px-1">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{label}</p>
            <span className="shrink-0 text-xs text-muted-foreground">已選 {visibleCheckedCount}/{filteredOptions.length}</span>
          </div>
          <div className="shrink-0 space-y-1 border-b border-border pb-2" role="group" aria-label={`${label}篩選工具`}>
            {(["asc", "desc"] as const).map(direction => <button key={direction} type="button" onClick={() => { onSortChange({ key: filterKey, direction }); setOpen(false); }} aria-pressed={isSorted && sortDirection === direction} className={cn("flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm", isSorted && sortDirection === direction ? "bg-primary/15 text-primary" : "text-foreground hover:bg-accent")}>
              {direction === "asc" ? <ArrowDownAZ className="h-4 w-4 shrink-0" /> : <ArrowUpAZ className="h-4 w-4 shrink-0" />}{direction === "asc" ? "從 A 到 Z 排序" : "從 Z 到 A 排序"}
            </button>)}
            <button type="button" disabled={selected === null} onClick={() => { onSelectedValuesChange(null); setOpen(false); }} className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent disabled:cursor-default disabled:opacity-40"><FilterX className="h-4 w-4 shrink-0" /><span className="break-words">清除「{label}」中的篩選</span></button>
          </div>

          <div className="relative shrink-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && isPanelReady && !isSearching) {
                  event.preventDefault();
                  commitSelection();
                } else if (event.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder="搜尋篩選值"
              aria-label={`搜尋${label}篩選值`}
              className="h-9 rounded-lg pl-8 pr-3 text-[13px]"
            />
          </div>

          {isPanelReady ? (
            <div className="flex min-h-0 flex-col rounded-xl border border-border bg-background/40">
              <div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-border p-2">
                <label className="flex min-h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 px-0.5 text-[13px] font-semibold text-foreground">
                  <span className="relative inline-flex shrink-0 items-center justify-center">
                    <Checkbox aria-label={`全選${label}篩選值`} className="h-5 w-5 rounded-[3px] data-[state=indeterminate]:bg-primary [&[data-state=indeterminate]_svg]:invisible" checked={allVisibleChecked ? true : visibleCheckedCount > 0 ? "indeterminate" : false} onCheckedChange={checked => toggleVisible(checked === true)} />
                    {visibleCheckedCount > 0 && !allVisibleChecked && <Minus className="pointer-events-none absolute h-3.5 w-3.5 text-primary-foreground" aria-hidden="true" />}
                  </span>
                  <span>{searchHasValue ? "（全選搜尋結果）" : "（全選）"}</span>
                </label>
                <button type="button" onClick={() => setDraftValues([])} className="min-h-8 shrink-0 whitespace-nowrap rounded-md border border-muted-foreground/60 bg-secondary px-2 text-xs font-semibold text-foreground hover:bg-accent">全不選</button>
              </div>

              {filteredOptions.length > 0 ? (
                <div className="min-h-0 overflow-y-auto" style={{ height: Math.min(filteredOptions.length * optionRowHeight, FILTER_OPTION_LIST_HEIGHT) }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
                  <div className="relative" style={{ height: filteredOptions.length * optionRowHeight }}>
                    {visibleOptionSlice.map((option, index) => {
                      const checked = selectedSet.has(option.value);
                      const offsetY = (virtualStartIndex + index) * optionRowHeight;

                      return (
                        <label
                          key={option.value}
                          className={cn(
                            "absolute left-0 right-0 flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] hover:bg-accent",
                            checked ? "text-foreground" : "text-muted-foreground",
                          )}
                          style={{ top: offsetY, height: optionRowHeight }}
                        >
                          <Checkbox aria-label={option.label} className="h-5 w-5 rounded-[3px]" checked={checked} onCheckedChange={(value) => toggleValue(option.value, value === true)} />
                          {filterKey === "trackingStatus" && <span
                            className={cn(
                              "h-2 w-2 flex-none rounded-full",
                              materialTrackingStatusPresentation(option.value).text,
                            )}
                            style={filterKey === "trackingStatus" ? { backgroundColor: "currentColor" } : undefined}
                          />}
                          <span className="min-w-0 flex-1 truncate">{option.label}</span>
                          <span className="rounded-full bg-secondary px-2 text-[11px] leading-5 text-muted-foreground">{option.count}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="px-2 py-6 text-center text-[13px] text-muted-foreground">找不到符合的篩選值</div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-background/40 px-3 py-8 text-center text-[13px] text-muted-foreground">
              正在載入篩選清單...
            </div>
          )}

        </div>
        <div className="mt-2 shrink-0 space-y-2 border-t border-border px-1 pt-2">
          <p className="text-xs text-muted-foreground">
            {hiddenSelectedCount > 0 && !searchHasValue ? `另有 ${hiddenSelectedCount} 個已選值不在目前清單，仍會保留` : searchHasValue ? "確定後僅顯示勾選的搜尋結果" : "勾選完成後按「確定」套用"}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)} className="h-9 min-w-20 text-sm">取消</Button>
            <Button type="button" size="sm" disabled={!isPanelReady || isSearching} onClick={commitSelection} className="h-9 min-w-20 text-sm">確定</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
