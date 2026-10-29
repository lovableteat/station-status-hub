import { useDeferredValue, useMemo, useState } from "react";
import { ArrowLeftRight, ChevronDown, ChevronRight, Download, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  BOM_CHANGE_IMPACTS, BOM_CHANGE_KINDS, bomChangeImpactLabel, bomChangeKindLabel, bomDiffFieldValue,
  type BomChangeImpact, type BomChangeKind, type BomDiffEntry, type BomDiffResult, type BomVendorLineChange,
} from "./bomDiff";
import type { BomSeries, BomSeriesVersion } from "./bomVersioning";
import { formatBomVersionTitle } from "./bomVersioning";
import { CHIP, CHIP_TONE, formatBomTimestamp } from "./bomVersionPresentation";
import { BOM_DIFF_EMPTY_TEXT, EMPTY_BOM_DIFF_FILTERS, filterBomDiffEntries, type BomDiffFilters } from "./bomDiffFilters";

const KIND_TONE: Record<BomChangeKind, keyof typeof CHIP_TONE> = {
  added: "success", removed: "danger", refDes: "warning", qty: "warning", primary: "danger", vendors: "warning", status: "primary", spec: "neutral",
};
const IMPACT_TONE: Record<BomChangeImpact, keyof typeof CHIP_TONE> = { production: "danger", status: "primary", text: "neutral", none: "neutral" };

function LineRow({ line }: { line: BomVendorLineChange }) {
  const record = line.after ?? line.before;
  if (!record) return null;
  const tone = line.kind === "added" ? "success" : line.kind === "removed" ? "danger" : line.kind === "changed" ? "warning" : "neutral";
  const label = line.kind === "added" ? "新增廠商" : line.kind === "removed" ? "移除廠商" : line.kind === "changed" ? "廠商欄位變更" : "相同";
  return (
    <tr className="text-xs text-foreground/85">
      <td className="px-2 py-1"><span className={cn(CHIP, CHIP_TONE[tone])}>{label}</span></td>
      <td className="px-2 py-1">{bomDiffFieldValue(record, "manufacturer") || "—"}</td>
      <td className="px-2 py-1 font-mono">{bomDiffFieldValue(record, "manufacturerPartNumber") || "—"}</td>
      <td className="px-2 py-1 font-mono">{bomDiffFieldValue(record, "partNumber") || "—"}</td>
      <td className="px-2 py-1">{bomDiffFieldValue(record, "sourcingStatus") || "—"}</td>
      <td className="px-2 py-1">{[bomDiffFieldValue(record, "phaseOutStatus"), bomDiffFieldValue(record, "partUsageStatus")].filter(Boolean).join(" · ") || "—"}</td>
    </tr>
  );
}

function EntryDetail({ entry }: { entry: BomDiffEntry }) {
  return (
    <div className="grid gap-3 border-t border-border/60 bg-background/30 px-3 py-3 text-sm lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">欄位變更</p>
        {entry.changes.length === 0 ? (
          <p className="text-xs text-muted-foreground">{entry.kinds.includes("added") ? "新版才有的料件，請看右側廠商明細。" : entry.kinds.includes("removed") ? "舊版才有的料件，新版已沒有這個位置。" : "沒有欄位變更。"}</p>
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
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">廠商明細（{entry.lines.length}）</p>
        <table className="w-full min-w-[520px] border-collapse">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="px-2 py-1 font-semibold">狀態</th><th className="px-2 py-1 font-semibold">廠商</th><th className="px-2 py-1 font-semibold">MPN</th><th className="px-2 py-1 font-semibold">實體料號</th><th className="px-2 py-1 font-semibold">Sourcing</th><th className="px-2 py-1 font-semibold">phase out／零件狀態</th></tr></thead>
          <tbody>{entry.lines.map((line, index) => <LineRow key={index} line={line} />)}</tbody>
        </table>
      </div>
    </div>
  );
}

export function BomDiffView({
  series, before, after, result, loading, error, onPickBefore, onPickAfter, onSwap, onBack, onExport, exporting,
}: {
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
}) {
  const [filters, setFilters] = useState<BomDiffFilters>(EMPTY_BOM_DIFF_FILTERS);
  const [expanded, setExpanded] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(filters.query);
  const entries = useMemo(() => result?.entries ?? [], [result]);
  const visible = useMemo(() => filterBomDiffEntries(entries, { ...filters, query: deferredQuery }), [entries, filters, deferredQuery]);
  const unchangedCount = result?.summary.unchanged ?? 0;
  const toggleKind = (kind: BomChangeKind) => setFilters((current) => ({ ...current, kinds: current.kinds.includes(kind) ? current.kinds.filter((item) => item !== kind) : [...current.kinds, kind] }));

  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (deferredQuery.trim()) chips.push({ key: "query", label: `搜尋：${deferredQuery.trim()}`, clear: () => setFilters((current) => ({ ...current, query: "" })) });
  for (const kind of filters.kinds) chips.push({ key: `kind:${kind}`, label: `變更類型：${bomChangeKindLabel(kind)}`, clear: () => toggleKind(kind) });
  if (filters.impact !== "all") chips.push({ key: "impact", label: `影響：${bomChangeImpactLabel(filters.impact)}`, clear: () => setFilters((current) => ({ ...current, impact: "all" })) });
  if (filters.trackingLostOnly) chips.push({ key: "tracking", label: "只看追蹤未帶入", clear: () => setFilters((current) => ({ ...current, trackingLostOnly: false })) });
  if (!filters.includeUnchanged) chips.push({ key: "unchanged", label: `隱藏未變更 ${unchangedCount.toLocaleString()} 筆`, clear: () => setFilters((current) => ({ ...current, includeUnchanged: true })) });
  const clearAll = () => setFilters({ ...EMPTY_BOM_DIFF_FILTERS, includeUnchanged: true });

  const summary = result?.summary;
  const kpis = summary ? [
    { label: "新增", value: summary.added, tone: "success" as const },
    { label: "移除", value: summary.removed, tone: "danger" as const },
    { label: "變更", value: summary.changed, tone: "warning" as const },
    { label: "未變更", value: summary.unchanged, tone: "neutral" as const },
    { label: "追蹤未帶入", value: summary.trackingLost, tone: summary.trackingLost > 0 ? "danger" as const : "neutral" as const },
  ] : [];

  return (
    <section data-testid="bom-diff-view" className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="h-9 px-2 text-sm">← 返回系列</Button>
        <h3 className="min-w-0 truncate text-base font-bold text-foreground">{series.name}</h3>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Select value={before.workspace.id} onValueChange={onPickBefore}>
            <SelectTrigger aria-label="舊版本" className="h-9 w-[12rem] text-sm"><span className="truncate">舊：<SelectValue /></span></SelectTrigger>
            <SelectContent>{series.versions.map((item) => <SelectItem key={item.workspace.id} value={item.workspace.id}>{formatBomVersionTitle(item)}{item.isCurrent ? "（目前）" : ""}</SelectItem>)}</SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={onSwap} aria-label="交換新舊版本" title="交換新舊版本" className="h-9 w-9 p-0"><ArrowLeftRight className="h-4 w-4" /></Button>
          <Select value={after.workspace.id} onValueChange={onPickAfter}>
            <SelectTrigger aria-label="新版本" className="h-9 w-[12rem] text-sm"><span className="truncate">新：<SelectValue /></span></SelectTrigger>
            <SelectContent>{series.versions.map((item) => <SelectItem key={item.workspace.id} value={item.workspace.id}>{formatBomVersionTitle(item)}{item.isCurrent ? "（目前）" : ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
        <p className="truncate" title={before.workspace.payload.sourceFile}>舊 {formatBomVersionTitle(before)} · {before.workspace.payload.sourceFile} · {before.workspace.payload.recordCount.toLocaleString()} 筆 · {formatBomTimestamp(before.version.uploadedAt)}</p>
        <p className="truncate" title={after.workspace.payload.sourceFile}>新 {formatBomVersionTitle(after)} · {after.workspace.payload.sourceFile} · {after.workspace.payload.recordCount.toLocaleString()} 筆 · {formatBomTimestamp(after.version.uploadedAt)}</p>
      </div>

      {summary && (
        <div data-testid="bom-diff-summary" className="flex flex-wrap items-center gap-1.5">
          {kpis.map((kpi) => <span key={kpi.label} className={cn(CHIP, "h-7 px-2 text-xs", CHIP_TONE[kpi.tone])}>{kpi.label} {kpi.value.toLocaleString()}</span>)}
          <span className="text-xs text-muted-foreground">位號群組：舊 {summary.beforeGroups.toLocaleString()} · 新 {summary.afterGroups.toLocaleString()}</span>
          {BOM_CHANGE_KINDS.filter((kind) => summary.kinds[kind.key] > 0).map((kind) => (
            <span key={kind.key} className="text-xs text-muted-foreground">{kind.label} {summary.kinds[kind.key]}</span>
          ))}
        </div>
      )}

      {/* Persistent filter bar: directly above the results, order 搜尋 → 變更類型 → 影響 → 追蹤. */}
      <div data-testid="bom-diff-filters" className="flex flex-col gap-2 rounded-xl border border-border bg-background/40 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="搜尋位號、料名、廠商、MPN、料號" aria-label="搜尋差異" className="h-9 pl-8 text-sm" />
          </div>
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="變更類型">
            {BOM_CHANGE_KINDS.map((kind) => (
              <button key={kind.key} type="button" aria-pressed={filters.kinds.includes(kind.key)} onClick={() => toggleKind(kind.key)} className={cn(CHIP, "h-8 cursor-pointer px-2 text-xs transition-colors lg:h-7", filters.kinds.includes(kind.key) ? CHIP_TONE[KIND_TONE[kind.key]] : "border-border bg-transparent text-muted-foreground hover:bg-accent/40")}>{kind.label}</button>
            ))}
          </div>
          <Select value={filters.impact} onValueChange={(value) => setFilters((current) => ({ ...current, impact: value as BomChangeImpact | "all" }))}>
            <SelectTrigger aria-label="影響" className="h-9 w-[9rem] text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">全部影響</SelectItem>{BOM_CHANGE_IMPACTS.filter((impact) => impact.key !== "none").map((impact) => <SelectItem key={impact.key} value={impact.key}>{impact.label}</SelectItem>)}</SelectContent>
          </Select>
          <button type="button" aria-pressed={filters.trackingLostOnly} onClick={() => setFilters((current) => ({ ...current, trackingLostOnly: !current.trackingLostOnly }))} className={cn(CHIP, "h-9 cursor-pointer px-2 text-xs lg:h-8", filters.trackingLostOnly ? CHIP_TONE.danger : "border-border bg-transparent text-muted-foreground hover:bg-accent/40")}>追蹤未帶入</button>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{visible.length.toLocaleString()} / {entries.length.toLocaleString()} 群組</span>
            <Button type="button" variant="outline" size="sm" disabled={!result || exporting || visible.length === 0} onClick={() => onExport(visible)} className="h-9 text-sm lg:h-8"><Download className="mr-1.5 h-4 w-4" />{exporting ? "匯出中…" : "匯出差異 Excel"}</Button>
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

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border" aria-busy={loading}>
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
              <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground" role="status">正在載入兩個版本的料件並比對…</td></tr>
            ) : error ? (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-destructive" role="alert">{error}</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">{BOM_DIFF_EMPTY_TEXT}</td></tr>
            ) : visible.map((entry) => {
              const isOpen = expanded === entry.id;
              const preview = entry.changes.slice(0, 2).map((change) => `${change.label}：${change.before || "（空白）"} → ${change.after || "（空白）"}`);
              const extra = entry.changes.length - preview.length;
              return [
                <tr key={entry.id} className={cn("border-t border-border/60 align-top transition-colors hover:bg-accent/30", isOpen && "bg-accent/20")}>
                  <td className="px-1 py-1.5"><button type="button" aria-expanded={isOpen} aria-label={isOpen ? "收合" : "展開"} onClick={() => setExpanded(isOpen ? null : entry.id)} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button></td>
                  <td className="max-w-[16rem] px-2 py-2 font-mono text-xs text-foreground"><span className="line-clamp-2 break-all" title={entry.displayRef}>{entry.displayRef}</span></td>
                  <td className="max-w-[18rem] px-2 py-2 text-xs text-foreground/90"><span className="line-clamp-2" title={entry.name}>{entry.name || "—"}</span></td>
                  <td className="px-2 py-2"><div className="flex flex-wrap gap-1">{entry.kinds.length === 0 ? <span className={cn(CHIP, CHIP_TONE.neutral)}>未變更</span> : entry.kinds.map((kind) => <span key={kind} className={cn(CHIP, CHIP_TONE[KIND_TONE[kind]])}>{bomChangeKindLabel(kind)}</span>)}</div></td>
                  <td className="px-2 py-2"><span className={cn(CHIP, CHIP_TONE[IMPACT_TONE[entry.impact]])}>{bomChangeImpactLabel(entry.impact)}</span></td>
                  <td className="max-w-[26rem] px-2 py-2 text-xs text-foreground/85">
                    {entry.kinds.includes("added") ? `新版新增 ${entry.after?.rows.length ?? 0} 筆廠商明細` : entry.kinds.includes("removed") ? `舊版 ${entry.before?.rows.length ?? 0} 筆廠商明細在新版消失` : preview.length === 0 ? (entry.kinds.length === 0 ? "—" : `廠商明細 ${entry.lines.filter((line) => line.kind !== "same").length} 處增減`) : preview.map((text, index) => <span key={index} className="block truncate" title={text}>{text}</span>)}
                    {extra > 0 && <span className="text-muted-foreground">還有 {extra} 項</span>}
                  </td>
                  <td className="px-2 py-2 text-xs">{entry.trackingLost > 0 ? <span className={cn(CHIP, CHIP_TONE.danger)}>未帶入 {entry.trackingLost}</span> : entry.trackingAfter ? <span className={cn(CHIP, CHIP_TONE.warning)}>有追蹤</span> : <span className="text-muted-foreground">—</span>}</td>
                </tr>,
                isOpen && <tr key={`${entry.id}:detail`}><td colSpan={7} className="p-0"><EntryDetail entry={entry} /></td></tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
