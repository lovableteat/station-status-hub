import { useDeferredValue, useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { BomPartChange, BomPartChangeKind, BomPartChangeResult } from "./bomDiff";
import { CHIP, CHIP_TONE } from "./bomVersionPresentation";

const KINDS: ReadonlyArray<{ key: BomPartChangeKind; label: string; tone: keyof typeof CHIP_TONE; hint: string }> = [
  { key: "removed", label: "移除", tone: "danger", hint: "舊版有、新版不見的料" },
  { key: "added", label: "新增", tone: "success", hint: "新版才有的料" },
  { key: "moved", label: "位置變更", tone: "warning", hint: "兩版都有，但放的位號不同（上料、下料、換位）" },
];
const KIND_LABEL = new Map(KINDS.map((kind) => [kind.key, kind]));

/** A Ref Des list short enough for one cell; the full list is in the title. */
function Refs({ refs, limit = 10 }: { refs: string[]; limit?: number }) {
  if (refs.length === 0) return <span className="text-muted-foreground">（沒有位號）</span>;
  const shown = refs.slice(0, limit).join(", ");
  return <span className="font-mono" title={refs.join(", ")}>{shown}{refs.length > limit ? ` 等 ${refs.length} 個` : ""}</span>;
}

/** What happened to the part, in one sentence: where it was added, where it was taken away, or how its positions moved. */
function Placement({ change, beforeLabel, afterLabel }: { change: BomPartChange; beforeLabel: string; afterLabel: string }) {
  const replaces = change.replaces.length > 0 && <span className="block text-muted-foreground">換料：取代 {change.replaces.slice(0, 3).join("、")}{change.replaces.length > 3 ? ` 等 ${change.replaces.length} 顆` : ""}</span>;
  const replacedBy = change.replacedBy.length > 0 && <span className="block text-muted-foreground">換料：改用 {change.replacedBy.slice(0, 3).join("、")}{change.replacedBy.length > 3 ? ` 等 ${change.replacedBy.length} 顆` : ""}</span>;
  if (change.kind === "added") return <span>{afterLabel} 新增在 <Refs refs={change.afterRefs} />{replaces}</span>;
  if (change.kind === "removed") return <span>{beforeLabel} 原本在 <Refs refs={change.beforeRefs} />，{afterLabel} 已沒有{replacedBy}</span>;
  return (
    <span className="grid gap-0.5">
      {change.refAdded.length > 0 && <span><b className="text-success">加上</b> <Refs refs={change.refAdded} /></span>}
      {change.refRemoved.length > 0 && <span><b className="text-destructive">拿掉</b> <Refs refs={change.refRemoved} /></span>}
      {replaces}{replacedBy}
    </span>
  );
}

export const BOM_PART_EMPTY_TEXT = "目前篩選條件沒有符合的料";

/**
 * 依料號: the comparison from the parts. Each line is one part (廠商 / MPN) with what changed: 新增, 移除, or 位置變更
 * with the positions it gained and lost. Persistent filter bar directly above the list (search → 變更類型), chips for
 * every active condition and 全部清除.
 */
export function BomPartChangeList({ parts, compact, beforeLabel, afterLabel }: { parts: BomPartChangeResult; compact: boolean; beforeLabel: string; afterLabel: string }) {
  const [query, setQuery] = useState("");
  const [kinds, setKinds] = useState<BomPartChangeKind[]>([]);
  const deferred = useDeferredValue(query);
  const visible = useMemo(() => {
    const tokens = deferred.toLowerCase().split(/\s+/).filter(Boolean);
    return parts.changes.filter((change) => (kinds.length === 0 || kinds.includes(change.kind)) && tokens.every((token) => change.searchText.includes(token)));
  }, [parts, kinds, deferred]);
  const toggle = (kind: BomPartChangeKind) => setKinds((current) => current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind]);
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (deferred.trim()) chips.push({ key: "query", label: `搜尋：${deferred.trim()}`, clear: () => setQuery("") });
  for (const kind of kinds) chips.push({ key: kind, label: `變更：${KIND_LABEL.get(kind)?.label}`, clear: () => toggle(kind) });
  // No change at all is not a filter result: say the two versions hold the same parts at the same positions.
  const emptyText = parts.changes.length === 0 ? `${beforeLabel} 與 ${afterLabel} 的料和位置都相同（${parts.unchanged.toLocaleString()} 顆料）` : BOM_PART_EMPTY_TEXT;
  const partLabel = (change: BomPartChange) => [change.manufacturer, change.mpn].filter(Boolean).join(" / ") || change.partNumber || "（未填廠商／MPN）";

  return (
    <div data-testid="bom-part-changes" className="flex min-h-0 flex-1 flex-col gap-3">
      <div data-testid="bom-part-filters" className="flex flex-col gap-2 rounded-xl border border-border bg-background/40 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋料名、廠商、MPN、料號、位號" aria-label="搜尋變更的料" className="h-9 pl-8 text-sm" />
          </div>
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="變更類型">
            {KINDS.map((kind) => (
              <button key={kind.key} type="button" aria-pressed={kinds.includes(kind.key)} onClick={() => toggle(kind.key)} title={`只看${kind.hint}（${parts.counts[kind.key]} 顆）`}
                className={cn(CHIP, "h-9 cursor-pointer px-2.5 text-xs lg:h-8", kinds.includes(kind.key) ? CHIP_TONE[kind.tone] : "border-border bg-transparent text-muted-foreground hover:bg-accent/40")}>
                {kind.label} <span className="font-mono">{parts.counts[kind.key].toLocaleString()}</span>
              </button>
            ))}
          </div>
          <span data-testid="bom-part-count" className="text-xs text-muted-foreground" title={`兩版都有、位置也相同的料 ${parts.unchanged.toLocaleString()} 顆，不列出`}>{visible.length.toLocaleString()} / {parts.changes.length.toLocaleString()} 顆料有變更</span>
        </div>
        {chips.length > 0 && (
          <div data-testid="bom-part-active-filters" className="flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <button key={chip.key} type="button" onClick={chip.clear} aria-label={`移除篩選：${chip.label}`} className="inline-flex min-h-9 max-w-full items-center gap-1 rounded-md border border-primary/40 bg-primary/15 px-2 text-xs text-foreground lg:min-h-7"><span className="truncate">{chip.label}</span><X className="h-3 w-3 shrink-0" /></button>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={() => { setQuery(""); setKinds([]); }} className="min-h-9 text-xs text-destructive lg:min-h-7">全部清除</Button>
          </div>
        )}
      </div>

      {compact ? (
        <div className="min-h-0 flex-1 overflow-auto">
          {visible.length === 0 ? <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{emptyText}</p> : (
            <ul data-testid="bom-part-cards" className="grid gap-2">
              {visible.map((change) => (
                <li key={change.key} data-part-change={change.kind} className="grid gap-1 rounded-xl border border-border bg-background/40 p-3 text-sm">
                  <span className="flex flex-wrap items-center gap-2"><span className={cn(CHIP, CHIP_TONE[KIND_LABEL.get(change.kind)!.tone])}>{KIND_LABEL.get(change.kind)!.label}</span><b className="min-w-0 break-all">{partLabel(change)}</b>{change.hadWebsiteData && <span className={cn(CHIP, CHIP_TONE.danger)} title="舊版這顆料有申請、Note、負責人或 SPEC 附件">有舊版資料</span>}</span>
                  <span className="text-xs text-muted-foreground">{change.name}{change.partNumber ? ` · ${change.partNumber}` : ""}</span>
                  <span className="text-xs"><Placement change={change} beforeLabel={beforeLabel} afterLabel={afterLabel} /></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border">
          <table data-testid="bom-part-table" className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-card text-left text-xs text-muted-foreground">
              <tr>
                <th className="whitespace-nowrap px-2 py-2 font-semibold">變更</th>
                <th className="whitespace-nowrap px-2 py-2 font-semibold">廠商 / MPN</th>
                <th className="whitespace-nowrap px-2 py-2 font-semibold">料名</th>
                <th className="whitespace-nowrap px-2 py-2 font-semibold">實體料號</th>
                <th className="whitespace-nowrap px-2 py-2 font-semibold">位置（{beforeLabel} → {afterLabel}）</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-10 text-center text-sm text-muted-foreground">{emptyText}</td></tr>
              ) : visible.map((change) => (
                <tr key={change.key} data-part-change={change.kind} className="border-t border-border/60 align-top hover:bg-accent/30">
                  <td className="whitespace-nowrap px-2 py-2"><span className={cn(CHIP, CHIP_TONE[KIND_LABEL.get(change.kind)!.tone])}>{KIND_LABEL.get(change.kind)!.label}</span></td>
                  <td className="max-w-[18rem] px-2 py-2 font-mono text-xs text-foreground"><span className="break-all">{partLabel(change)}</span>{change.hadWebsiteData && <span className={cn(CHIP, "ml-1", CHIP_TONE.danger)} title="舊版這顆料有申請、Note、負責人或 SPEC 附件；可到「依位號明細」查看">有舊版資料</span>}</td>
                  <td className="max-w-[20rem] px-2 py-2 text-xs text-foreground/90"><span className="line-clamp-2" title={change.name}>{change.name || "—"}</span></td>
                  <td className="whitespace-nowrap px-2 py-2 font-mono text-xs">{change.partNumber || "—"}</td>
                  <td className="px-2 py-2 text-xs text-foreground/90"><Placement change={change} beforeLabel={beforeLabel} afterLabel={afterLabel} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
