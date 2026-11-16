import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, ChevronDown, ChevronRight, CircleAlert, Download, LoaderCircle, LocateFixed, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  BOM_CHANGE_IMPACTS, BOM_CHANGE_KINDS, bomChangeImpactLabel, bomChangeKindLabel, bomDiffEntryPreview, bomDiffFieldValue, bomRecordHasTracking, describeBomWebsiteData,
  type BomChangeImpact, type BomChangeKind, type BomDiffEntry, type BomDiffResult, type BomVendorLineChange,
} from "./bomDiff";
import type { BomSeries, BomSeriesVersion } from "./bomVersioning";
import { formatBomVersionTitle } from "./bomVersioning";
import { CHIP, CHIP_TONE, formatBomTimestamp } from "./bomVersionPresentation";
import { BOM_DIFF_EMPTY_TEXT, EMPTY_BOM_DIFF_FILTERS, filterBomDiffEntries, type BomDiffFilters } from "./bomDiffFilters";
import "./bomDiffView.css";

/** Filters and the open part, kept when 返回比對 brings the user back from the material table. */
export interface BomDiffViewState {
  filters: BomDiffFilters;
  expandedId: string | null;
}

const KIND_TONE: Record<BomChangeKind, keyof typeof CHIP_TONE> = {
  added: "success", removed: "danger", refDes: "warning", qty: "warning", primary: "danger", vendors: "warning", status: "primary", spec: "neutral",
};
const IMPACT_TONE: Record<BomChangeImpact, keyof typeof CHIP_TONE> = { production: "danger", status: "primary", text: "neutral", none: "neutral" };

function lineTone(line: BomVendorLineChange) {
  return line.kind === "added" ? "success" : line.kind === "removed" ? "danger" : line.kind === "changed" ? "warning" : "neutral";
}
function lineLabel(line: BomVendorLineChange) {
  return line.kind === "added" ? "新增廠商" : line.kind === "removed" ? "移除廠商" : line.kind === "changed" ? "廠商欄位變更" : "相同";
}
const lineUsage = (record: NonNullable<BomVendorLineChange["after"]>) => [bomDiffFieldValue(record, "phaseOutStatus"), bomDiffFieldValue(record, "partUsageStatus")].filter(Boolean).join(" · ");

function LineRow({ line }: { line: BomVendorLineChange }) {
  const record = line.after ?? line.before;
  if (!record) return null;
  return (
    <tr className="text-xs text-foreground/85">
      <td className="px-2 py-1"><span className={cn(CHIP, CHIP_TONE[lineTone(line)])}>{lineLabel(line)}</span></td>
      <td className="px-2 py-1">{bomDiffFieldValue(record, "manufacturer") || "—"}</td>
      <td className="px-2 py-1 font-mono">{bomDiffFieldValue(record, "manufacturerPartNumber") || "—"}</td>
      <td className="px-2 py-1 font-mono">{bomDiffFieldValue(record, "partNumber") || "—"}</td>
      <td className="px-2 py-1">{bomDiffFieldValue(record, "sourcingStatus") || "—"}</td>
      <td className="px-2 py-1">{lineUsage(record) || "—"}</td>
    </tr>
  );
}

/** Phone: one vendor line per list item instead of a six-column table that scrolls sideways. */
function LineItem({ line }: { line: BomVendorLineChange }) {
  const record = line.after ?? line.before;
  if (!record) return null;
  const details = [bomDiffFieldValue(record, "partNumber"), bomDiffFieldValue(record, "sourcingStatus"), lineUsage(record)].filter(Boolean).join(" · ");
  return (
    <li className="bom-diff-line-item">
      <span className={cn(CHIP, "flex-none", CHIP_TONE[lineTone(line)])}>{lineLabel(line)}</span>
      <span className="min-w-0"><strong>{[bomDiffFieldValue(record, "manufacturer"), bomDiffFieldValue(record, "manufacturerPartNumber")].filter(Boolean).join(" / ") || "（未填廠商）"}</strong>{details && <span>{details}</span>}</span>
    </li>
  );
}

function EntryDetail({ entry, compact, onLocate, locateFills }: { entry: BomDiffEntry; compact: boolean; onLocate?: (entry: BomDiffEntry) => void; locateFills: boolean }) {
  const lost = entry.lines.filter((line) => line.kind === "removed" && line.before && bomRecordHasTracking(line.before));
  const vendorOnly = entry.changes.length === 0 && entry.lines.some((line) => line.kind === "added" || line.kind === "removed");
  // Only parts that still exist in the new version can be shown in its material table.
  const locate = onLocate && entry.lines.some((line) => line.after)
    ? (fill: boolean) => (
      // The label stays short: a group can hold dozens of reference designators; they are in the title and the row above.
      <Button type="button" size="sm" variant={fill ? "default" : "outline"} onClick={() => onLocate(entry)} title={`關閉版本管理，在料號表顯示新版的 ${entry.displayRef}${fill ? "，補填沒有帶過來的資料" : ""}`} className="bom-diff-locate">
        <LocateFixed aria-hidden="true" />{fill ? "到料號表補填" : "在料號表查看"}
      </Button>
    )
    : null;
  return (
    <div className="bom-diff-detail grid gap-3 border-t border-border/60 bg-background/30 px-3 py-3 text-sm lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="bom-diff-detail-heading"><p>欄位變更</p>{lost.length === 0 && locate?.(false)}</div>
        {entry.changes.length === 0 ? (
          <p className="text-xs text-muted-foreground">{entry.kinds.includes("added") ? "新版才有的料件，廠商列在廠商明細。" : entry.kinds.includes("removed") ? "舊版才有的料件，新版已沒有這個位置。" : vendorOnly ? "欄位沒有變更；換掉的廠商列在廠商明細。" : "沒有欄位變更。"}</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead><tr className="text-left text-muted-foreground"><th className="px-2 py-1 font-semibold">欄位</th><th className="px-2 py-1 font-semibold">舊值</th><th className="px-2 py-1 font-semibold">新值</th><th className="px-2 py-1 font-semibold">廠商／MPN</th></tr></thead>
            <tbody>
              {entry.changes.map((change, index) => (
                <tr key={`${change.field}:${index}`} className="border-t border-border/40 align-top">
                  <td className="px-2 py-1 font-semibold text-foreground">{change.label}</td>
                  <td className="px-2 py-1 whitespace-pre-wrap break-words text-destructive/90">{change.before || "（空白）"}</td>
                  <td className="px-2 py-1 whitespace-pre-wrap break-words text-success">{change.after || "（空白）"}</td>
                  <td className="px-2 py-1 text-muted-foreground">{change.vendor || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(entry.refAdded.length > 0 || entry.refRemoved.length > 0) && (
          <p className="mt-2 text-xs text-foreground/80">
            {entry.refAdded.length > 0 && <span className="mr-3 text-success">＋ {entry.refAdded.join(", ")}</span>}
            {entry.refRemoved.length > 0 && <span className="text-destructive">－ {entry.refRemoved.join(", ")}</span>}
          </p>
        )}
      </div>
      <div className="min-w-0 overflow-x-auto">
        <div className="bom-diff-detail-heading"><p>廠商明細（{entry.lines.length}）</p></div>
        {compact ? (
          <ul className="bom-diff-line-list">{entry.lines.map((line, index) => <LineItem key={index} line={line} />)}</ul>
        ) : (
          <table className="w-full min-w-[520px] border-collapse">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="px-2 py-1 font-semibold">狀態</th><th className="px-2 py-1 font-semibold">廠商</th><th className="px-2 py-1 font-semibold">MPN</th><th className="px-2 py-1 font-semibold">實體料號</th><th className="px-2 py-1 font-semibold">Sourcing</th><th className="px-2 py-1 font-semibold">phase out／零件狀態</th></tr></thead>
            <tbody>{entry.lines.map((line, index) => <LineRow key={index} line={line} />)}</tbody>
          </table>
        )}
        {lost.length > 0 && (
          <div data-testid="bom-diff-lost-data" className="bom-diff-lost">
            <p className="bom-diff-lost-title">舊版資料沒有帶到新版（請在新版對應料件重新填寫）</p>
            <ul>
              {lost.map((line, index) => (
                <li key={index}>
                  <strong>{[bomDiffFieldValue(line.before, "manufacturer"), bomDiffFieldValue(line.before, "manufacturerPartNumber")].filter(Boolean).join(" / ") || bomDiffFieldValue(line.before, "partNumber") || "（未填廠商）"}</strong>
                  <span>{describeBomWebsiteData(line.before!).join(" · ")}</span>
                </li>
              ))}
            </ul>
            {locate?.(locateFills)}
          </div>
        )}
      </div>
    </div>
  );
}

function KindChips({ entry }: { entry: BomDiffEntry }) {
  return entry.kinds.length === 0
    ? <span className="text-xs text-muted-foreground">未變更</span>
    : <>{entry.kinds.map((kind) => <span key={kind} className={cn(CHIP, CHIP_TONE[KIND_TONE[kind]])}>{bomChangeKindLabel(kind)}</span>)}</>;
}

export function BomDiffView({
  series, before, after, result, loading, error, onPickBefore, onPickAfter, onSwap, onBack, onExport, exporting, initialLostOnly = false, initialView, onLostOnlyChange, compact = false, onLocate, locateFills = false,
}: {
  /** Opened from an upload that left website data behind: start on 只看未帶入. */
  initialLostOnly?: boolean;
  /** 返回比對: start with the filters and open part the user left with. */
  initialView?: BomDiffViewState;
  /** 只看未帶入 is mirrored into the URL by the window, so clearing its chip also clears the link. */
  onLostOnlyChange?: (lostOnly: boolean) => void;
  series: BomSeries;
  before: BomSeriesVersion;
  after: BomSeriesVersion;
  result: BomDiffResult | null;
  loading: boolean;
  error: string | null;
  onPickBefore: (workspaceId: string) => void;
  onPickAfter: (workspaceId: string) => void;
  onSwap: () => void;
  onBack: () => void;
  onExport: (visibleEntries: BomDiffEntry[]) => void;
  exporting: boolean;
  /** Phone and narrow windows: changes as cards instead of a seven-column table. */
  compact?: boolean;
  /** Shows the new version's part in the material table, with the view to come back to; absent when that is not possible. */
  onLocate?: (entry: BomDiffEntry, view: BomDiffViewState) => void;
  /** The new side is the current version and the user may edit: 到料號表補填; otherwise only 在料號表查看. */
  locateFills?: boolean;
}) {
  const [filters, setFilters] = useState<BomDiffFilters>(() => initialView?.filters ?? ({ ...EMPTY_BOM_DIFF_FILTERS, trackingLostOnly: initialLostOnly }));
  useEffect(() => { onLostOnlyChange?.(filters.trackingLostOnly); }, [filters.trackingLostOnly, onLostOnlyChange]);
  const [expanded, setExpanded] = useState<string | null>(() => initialView?.expandedId ?? null);
  const deferredQuery = useDeferredValue(filters.query);
  const entries = useMemo(() => result?.entries ?? [], [result]);
  const visible = useMemo(() => filterBomDiffEntries(entries, { ...filters, query: deferredQuery }), [entries, filters, deferredQuery]);
  const unchangedCount = result?.summary.unchanged ?? 0;
  const toggleKind = (kind: BomChangeKind) => setFilters((current) => ({ ...current, kinds: current.kinds.includes(kind) ? current.kinds.filter((item) => item !== kind) : [...current.kinds, kind] }));

  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (deferredQuery.trim()) chips.push({ key: "query", label: `搜尋：${deferredQuery.trim()}`, clear: () => setFilters((current) => ({ ...current, query: "" })) });
  for (const kind of filters.kinds) chips.push({ key: `kind:${kind}`, label: `變更類型：${bomChangeKindLabel(kind)}`, clear: () => toggleKind(kind) });
  if (filters.impact !== "all") chips.push({ key: "impact", label: `影響：${bomChangeImpactLabel(filters.impact)}`, clear: () => setFilters((current) => ({ ...current, impact: "all" })) });
  if (filters.trackingLostOnly) chips.push({ key: "tracking", label: "只看未帶入", clear: () => setFilters((current) => ({ ...current, trackingLostOnly: false })) });
  if (!filters.includeUnchanged) chips.push({ key: "unchanged", label: `隱藏未變更 ${unchangedCount.toLocaleString()} 個位號`, clear: () => setFilters((current) => ({ ...current, includeUnchanged: true })) });
  const clearAll = () => setFilters({ ...EMPTY_BOM_DIFF_FILTERS, includeUnchanged: true });

  const summary = loading || error ? null : result?.summary;
  const lostCount = summary?.trackingLost ?? 0;
  const exportButton = (
    <Button type="button" variant="outline" size="sm" disabled={!summary || exporting || visible.length === 0} aria-busy={exporting || undefined} onClick={() => onExport(visible)} title="匯出目前篩選結果的差異 Excel（含摘要、明細、新增與移除料件）" className="bom-diff-export h-9 shrink-0 gap-1.5 text-sm lg:h-8">
      {exporting ? <LoaderCircle className="bom-diff-spinner h-4 w-4" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
      {exporting ? "匯出中…" : "匯出差異 Excel"}
    </Button>
  );
  const toggle = (entry: BomDiffEntry) => setExpanded((current) => (current === entry.id ? null : entry.id));
  // 返回比對: once the result is in, scroll the part the user left from into view.
  const viewRef = useRef<HTMLElement | null>(null);
  const scrolledBack = useRef(!initialView?.expandedId);
  useEffect(() => {
    if (scrolledBack.current || !result || !initialView?.expandedId) return;
    scrolledBack.current = true;
    const id = initialView.expandedId;
    const frame = requestAnimationFrame(() => {
      const target = [...(viewRef.current?.querySelectorAll<HTMLElement>("[data-diff-entry]") ?? [])].find((node) => node.dataset.diffEntry === id);
      target?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [result, initialView]);
  const locate = onLocate ? (entry: BomDiffEntry) => onLocate(entry, { filters, expandedId: entry.id }) : undefined;

  return (
    <section ref={viewRef} data-testid="bom-diff-view" className="bom-diff-view flex min-h-0 min-w-0 flex-1 flex-col gap-3" data-compact={compact || undefined}>
      <div className="bom-diff-toolbar">
        <div className="flex min-w-0 items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onBack} className="bom-diff-back h-9 shrink-0 px-2.5 text-sm">← 返回系列</Button>
          <h3 className="min-w-0 truncate text-base font-bold text-foreground" title={series.name}>{series.name}</h3>
        </div>
        <div className="bom-diff-pickers">
          <Select value={before.workspace.id} onValueChange={onPickBefore}>
            <SelectTrigger aria-label="舊版本" data-version-side="before" title={`舊版：${formatBomVersionTitle(before)}`} className="bom-diff-picker h-9 min-w-0 px-2.5 text-sm"><span className="truncate"><b>舊版</b> <SelectValue /></span></SelectTrigger>
            <SelectContent>{series.versions.map((item) => <SelectItem key={item.workspace.id} value={item.workspace.id}>{formatBomVersionTitle(item)}{item.isCurrent ? "（目前）" : ""}</SelectItem>)}</SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={onSwap} aria-label="交換新舊版本" title="交換新舊版本" className="bom-diff-swap h-9 w-9 p-0"><ArrowLeftRight className="h-4 w-4" aria-hidden="true" /></Button>
          <Select value={after.workspace.id} onValueChange={onPickAfter}>
            <SelectTrigger aria-label="新版本" data-version-side="after" title={`新版：${formatBomVersionTitle(after)}`} className="bom-diff-picker h-9 min-w-0 px-2.5 text-sm"><span className="truncate"><b>新版</b> <SelectValue /></span></SelectTrigger>
            <SelectContent>{series.versions.map((item) => <SelectItem key={item.workspace.id} value={item.workspace.id}>{formatBomVersionTitle(item)}{item.isCurrent ? "（目前）" : ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="bom-diff-sources">
        {([{ side: "before", label: "舊版來源", version: before }, { side: "after", label: "新版來源", version: after }] as const).map(({ side, label, version }) => (
          <div key={side} className="bom-diff-source" data-version-side={side}>
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="bom-diff-source-label">{label}</span>
              <span className="truncate font-semibold text-foreground" title={version.workspace.payload.sourceFile}>{version.workspace.payload.sourceFile}</span>
            </div>
            <span className="bom-diff-source-meta truncate text-muted-foreground" title={formatBomTimestamp(version.version.uploadedAt)}>
              {version.workspace.payload.recordCount.toLocaleString()} 筆<span className="bom-diff-source-time"> · {formatBomTimestamp(version.version.uploadedAt)}</span>
            </span>
          </div>
        ))}
        {exportButton}
      </div>

      {/* Screen readers hear the outcome once; on screen the counts live in the filter chips. */}
      <p role="status" data-testid={summary ? "bom-diff-summary" : undefined} className="sr-only">
        {loading ? "正在載入兩個版本的料件並比對…" : summary ? `比對完成：新增 ${summary.added}、移除 ${summary.removed}、變更 ${summary.changed}、未變更 ${summary.unchanged}、未帶入 ${summary.trackingLost}` : ""}
      </p>

      {/* Persistent filter bar: directly above the results, order 搜尋 → 變更類型 → 影響 → 追蹤. */}
      <div data-testid="bom-diff-filters" className="bom-diff-filters flex flex-col gap-2 rounded-xl border border-border bg-background/40 p-2">
        <div className="bom-diff-filter-row flex flex-wrap items-center gap-2">
          <div className="bom-diff-search relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="搜尋位號、料名、廠商、MPN、料號" aria-label="搜尋差異" className="h-9 pl-8 text-sm" />
          </div>
          <div className="bom-diff-kinds flex flex-wrap items-center gap-1" role="group" aria-label="變更類型">
            {BOM_CHANGE_KINDS.map((kind) => {
              const count = summary?.kinds[kind.key] ?? 0;
              return (
                <button key={kind.key} type="button" aria-pressed={filters.kinds.includes(kind.key)} data-empty={summary && count === 0 ? "true" : undefined} onClick={() => toggleKind(kind.key)} title={`只看有「${kind.label}」變更的位號（${count} 個）`} className={cn(CHIP, "bom-diff-kind h-8 cursor-pointer px-2 text-xs transition-colors lg:h-7", filters.kinds.includes(kind.key) ? CHIP_TONE[KIND_TONE[kind.key]] : "border-border bg-transparent text-muted-foreground hover:bg-accent/40")}>
                  {kind.label}{summary && <span className="bom-diff-kind-count">{count.toLocaleString()}</span>}
                </button>
              );
            })}
          </div>
          <div className="bom-diff-filter-tail flex items-center gap-2">
            <Select value={filters.impact} onValueChange={(value) => setFilters((current) => ({ ...current, impact: value as BomChangeImpact | "all" }))}>
              <SelectTrigger aria-label="影響" className="h-9 w-[9rem] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">全部影響</SelectItem>{BOM_CHANGE_IMPACTS.filter((impact) => impact.key !== "none").map((impact) => <SelectItem key={impact.key} value={impact.key}>{impact.label}</SelectItem>)}</SelectContent>
            </Select>
            <button type="button" aria-pressed={filters.trackingLostOnly} onClick={() => setFilters((current) => ({ ...current, trackingLostOnly: !current.trackingLostOnly }))} title="只看舊版有追蹤、Note、負責人或 SPEC 附件，但新版找不到對應料件的位號" className={cn(CHIP, "bom-diff-kind h-9 cursor-pointer px-2 text-xs lg:h-8", filters.trackingLostOnly ? CHIP_TONE.danger : lostCount > 0 ? "border-destructive/50 bg-transparent text-destructive hover:bg-destructive/10" : "border-border bg-transparent text-muted-foreground hover:bg-accent/40")}>未帶入{summary && <span className="bom-diff-kind-count">{lostCount.toLocaleString()}</span>}</button>
            {summary && <span data-testid="bom-diff-count" className="bom-diff-count" title={`符合目前篩選的位號 / 兩版合計位號（舊版 ${summary.beforeGroups.toLocaleString()} 個、新版 ${summary.afterGroups.toLocaleString()} 個）。全部：新增 ${summary.added}、移除 ${summary.removed}、變更 ${summary.changed}、未變更 ${summary.unchanged}`}>{visible.length.toLocaleString()} / {entries.length.toLocaleString()} 個位號</span>}
          </div>
        </div>
        {chips.length > 0 && (
          <div data-testid="bom-diff-active-filters" className="flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <button key={chip.key} type="button" onClick={chip.clear} aria-label={`移除篩選：${chip.label}`} className="inline-flex min-h-9 max-w-full items-center gap-1 rounded-md border border-primary/40 bg-primary/15 px-2 text-xs text-foreground lg:min-h-7"><span className="truncate">{chip.label}</span><X className="h-3 w-3 shrink-0" /></button>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={clearAll} className="min-h-9 text-xs text-destructive lg:min-h-7">全部清除</Button>
          </div>
        )}
      </div>

      {compact ? (
        <div className="bom-diff-results bom-diff-results--cards" aria-busy={loading}>
          {loading ? (
            <p className="px-1 py-3"><span data-testid="bom-diff-loading" className="bom-diff-table-state"><LoaderCircle className="bom-diff-spinner h-4 w-4 shrink-0" aria-hidden="true" />正在載入兩個版本的料件並比對…</span></p>
          ) : error ? (
            <p className="px-1 py-3"><span className="bom-diff-table-state bom-diff-error" role="alert"><CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />{error}</span></p>
          ) : visible.length === 0 ? (
            <p className="bom-diff-cards-empty">{BOM_DIFF_EMPTY_TEXT}</p>
          ) : (
            <ul data-testid="bom-diff-cards" className="bom-diff-cards">
              {visible.map((entry) => {
                const isOpen = expanded === entry.id;
                const allPreview = bomDiffEntryPreview(entry);
                const preview = allPreview.slice(0, 2);
                const extra = allPreview.length - preview.length;
                return (
                  <li key={entry.id} data-diff-entry={entry.id} data-open={isOpen || undefined} className="bom-diff-card">
                    <button type="button" aria-expanded={isOpen} onClick={() => toggle(entry)} className="bom-diff-card-head">
                      <span className="bom-diff-card-title"><span className="font-mono">{entry.displayRef}</span><span className="truncate">{entry.name || "—"}</span><ChevronDown aria-hidden="true" className="bom-diff-card-chevron" /></span>
                      <span className="bom-diff-card-chips">
                        <KindChips entry={entry} />
                        {entry.kinds.length > 0 && <span className={cn(CHIP, CHIP_TONE[IMPACT_TONE[entry.impact]])}>{bomChangeImpactLabel(entry.impact)}</span>}
                        {entry.trackingLost > 0 ? <span className={cn(CHIP, CHIP_TONE.danger)}>未帶入 {entry.trackingLost}</span> : entry.trackingAfter ? <span className={cn(CHIP, CHIP_TONE.warning)}>有追蹤</span> : null}
                      </span>
                      {preview.length > 0 && <span className="bom-diff-card-preview">{preview.map((text, index) => <span key={index}>{text}</span>)}{extra > 0 && <span className="text-muted-foreground">還有 {extra} 項</span>}</span>}
                    </button>
                    {isOpen && <EntryDetail entry={entry} compact onLocate={locate} locateFills={locateFills} />}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="bom-diff-results min-h-0 flex-1 overflow-auto rounded-xl border border-border" aria-busy={loading}>
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-card text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-8 px-2 py-2" aria-label="展開" />
                <th className="whitespace-nowrap px-2 py-2 font-semibold">位號</th>
                <th className="whitespace-nowrap px-2 py-2 font-semibold">料名</th>
                <th className="whitespace-nowrap px-2 py-2 font-semibold">變更類型</th>
                <th className="whitespace-nowrap px-2 py-2 font-semibold">影響</th>
                <th className="whitespace-nowrap px-2 py-2 font-semibold">變更內容</th>
                <th className="whitespace-nowrap px-2 py-2 font-semibold">追蹤</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-3 py-4"><span data-testid="bom-diff-loading" className="bom-diff-table-state"><LoaderCircle className="bom-diff-spinner h-4 w-4 shrink-0" aria-hidden="true" />正在載入兩個版本的料件並比對…</span></td></tr>
              ) : error ? (
                <tr><td colSpan={7} className="px-3 py-4"><span className="bom-diff-table-state bom-diff-error" role="alert"><CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />{error}</span></td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">{BOM_DIFF_EMPTY_TEXT}</td></tr>
              ) : visible.map((entry) => {
                const isOpen = expanded === entry.id;
                const allPreview = bomDiffEntryPreview(entry);
                const preview = allPreview.slice(0, 2);
                const extra = allPreview.length - preview.length;
                return [
                  <tr key={entry.id} data-diff-entry={entry.id} className={cn("border-t border-border/60 align-top transition-colors hover:bg-accent/30", isOpen && "bg-accent/20")}>
                    <td className="px-1 py-1.5"><button type="button" aria-expanded={isOpen} aria-label={isOpen ? "收合" : "展開"} onClick={() => toggle(entry)} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button></td>
                    <td className="max-w-[16rem] px-2 py-2 font-mono text-xs text-foreground"><span className="line-clamp-2 break-all" title={entry.displayRef}>{entry.displayRef}</span></td>
                    <td className="max-w-[18rem] px-2 py-2 text-xs text-foreground/90"><span className="line-clamp-2" title={entry.name}>{entry.name || "—"}</span></td>
                    <td className="px-2 py-2"><div className="flex flex-wrap gap-1"><KindChips entry={entry} /></div></td>
                    <td className="px-2 py-2">{entry.kinds.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : <span className={cn(CHIP, CHIP_TONE[IMPACT_TONE[entry.impact]])}>{bomChangeImpactLabel(entry.impact)}</span>}</td>
                    <td className="max-w-[26rem] px-2 py-2 text-xs text-foreground/85">
                      {preview.length === 0 ? "—" : preview.map((text, index) => <span key={index} className="block truncate" title={text}>{text}</span>)}
                      {extra > 0 && <button type="button" onClick={() => setExpanded(entry.id)} className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" title="展開看全部變更">還有 {extra} 項</button>}
                    </td>
                    <td className="px-2 py-2 text-xs">{entry.trackingLost > 0 ? <button type="button" onClick={() => setExpanded(entry.id)} title="展開看沒有帶到新版的追蹤、Note、負責人或 SPEC 附件" className={cn(CHIP, CHIP_TONE.danger, "cursor-pointer")}>未帶入 {entry.trackingLost}</button> : entry.trackingAfter ? <span className={cn(CHIP, CHIP_TONE.warning)} title="新版這個位號有追蹤、Note、負責人或 SPEC 附件">有追蹤</span> : <span className="text-muted-foreground">—</span>}</td>
                  </tr>,
                  isOpen && <tr key={`${entry.id}:detail`}><td colSpan={7} className="p-0"><EntryDetail entry={entry} compact={false} onLocate={locate} locateFills={locateFills} /></td></tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
