import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Download, LoaderCircle, PackageCheck, RotateCw, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { bomFileBaseName, type BomSeries, type BomSeriesVersion } from "./bomVersioning";
import { CHIP, CHIP_TONE } from "./bomVersionPresentation";
import { downloadBlob } from "./materialRequestExport";
import { PENDING_MATERIAL_CATEGORIES, type PendingMaterialCategory } from "./materialRequestPresentation";
import type { MaterialWorkbookRecord } from "./materialRequestUtils";
import {
  EMPTY_PROJECT_PARTS_FILTERS, projectPartToken, PROJECT_PART_STATUSES, buildPjeWorkbook, buildProjectParts, buildProjectPartsWorkbook, describeProjectPartBoards,
  filterProjectParts, formatProjectQty, projectPartsFileName, type ProjectPart, type ProjectPartsBoard, type ProjectPartsFilters,
} from "./projectParts";
import "./projectParts.css";

export const PROJECT_PARTS_EMPTY_TEXT = "目前篩選條件沒有符合的料件";
const PAGE = 300;
const ALL = "__all__";
const CATEGORY_TONE: Record<PendingMaterialCategory, keyof typeof CHIP_TONE> = { connector: "warning", ic: "primary", rlc: "neutral", other: "neutral" };
const CATEGORY_LABEL = new Map(PENDING_MATERIAL_CATEGORIES.map(category => [category.key, category.label]));
// Some of the filtered parts ticked: a filled box without the tick, as the material table's column filter shows it.
const PARTIAL_CHECKBOX = "data-[state=indeterminate]:bg-primary/60 [&[data-state=indeterminate]_svg]:invisible";

type Load = { key: string; state: "loading"; previous?: MaterialWorkbookRecord[] } | { key: string; state: "ready"; records: MaterialWorkbookRecord[] } | { key: string; state: "error"; error: string };
type Notice = { tone: "ok" | "error"; text: string; incomplete?: boolean; exportAnyway?: "pje" | "all" };

function shownRecords(load: Load | undefined) {
  return load?.state === "ready" ? load.records : load?.state === "loading" ? load.previous : undefined;
}

export interface ProjectPartsViewProps {
  projectName: string;
  /** The project's live series; each one's current version is one board. */
  series: readonly BomSeries[];
  loadVersion: (version: BomSeriesVersion) => Promise<MaterialWorkbookRecord[]>;
  exportedBy: string;
  compact: boolean;
  onBack: () => void;
}

function loadKey(series: BomSeries) {
  return `${series.current.workspace.id}:${series.current.workspace.updatedAt}`;
}

export function ProjectPartsView({ projectName, series, loadVersion, exportedBy, compact, onBack }: ProjectPartsViewProps) {
  const [loads, setLoads] = useState<Record<string, Load>>({});
  const [attempt, setAttempt] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState<ProjectPartsFilters>(EMPTY_PROJECT_PARTS_FILTERS);
  const query = useDeferredValue(filters.query);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [shown, setShown] = useState(PAGE);
  const [exporting, setExporting] = useState<"pje" | "all" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // One load per board's current version; a newer upload or a retry loads it again.
  useEffect(() => {
    let alive = true;
    for (const item of series) {
      const key = `${loadKey(item)}#${attempt[item.id] ?? 0}`;
      setLoads(current => current[item.id]?.key === key ? current : { ...current, [item.id]: { key, state: "loading", previous: shownRecords(current[item.id]) } });
      loadVersion(item.current)
        .then(records => {
          if (!alive) return;
          setLoads(current => {
            const now = current[item.id];
            // A cached load answers again on every re-run: keep the same object so the merge is not rebuilt.
            if (now?.key !== key || (now.state === "ready" && now.records === records)) return current;
            return { ...current, [item.id]: { key, state: "ready", records } };
          });
        })
        .catch(error => { if (alive) setLoads(current => current[item.id]?.key === key ? { ...current, [item.id]: { key, state: "error", error: error instanceof Error ? error.message : String(error) } } : current); });
    }
    return () => { alive = false; };
  }, [series, loadVersion, attempt]);

  // Board names as PJE reads them; two series with the same name are told apart by a number.
  const boardNames = useMemo(() => {
    const seen = new Map<string, number>();
    return new Map(series.map(item => {
      const base = bomFileBaseName(item.name), count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      return [item.id, count > 1 ? `${base}（${count}）` : base];
    }));
  }, [series]);
  const boards = useMemo<ProjectPartsBoard[]>(() => series.flatMap(item => {
    const records = shownRecords(loads[item.id]);
    return records ? [{ id: item.id, name: boardNames.get(item.id) ?? item.name, version: item.current.displayNumber, records }] : [];
  }), [series, loads, boardNames]);
  const parts = useMemo(() => buildProjectParts(boards), [boards]);
  const waiting = series.filter(item => loads[item.id]?.state !== "ready");
  const failed = series.filter(item => loads[item.id]?.state === "error");
  const loading = series.some(item => (loads[item.id]?.state ?? "loading") === "loading");
  const complete = waiting.length === 0;

  // A "still loading" warning goes once nothing loads any more; a "not loaded" one once every board is in.
  useEffect(() => { setNotice(current => (current?.incomplete && (complete || (!loading && !current.exportAnyway)) ? null : current)); }, [complete, loading]);
  const visible = useMemo(() => filterProjectParts(parts, { ...filters, query }), [parts, filters, query]);
  useEffect(() => { setShown(PAGE); }, [filters, query]);
  const counts = useMemo(() => {
    const base = filterProjectParts(parts, { ...filters, query, categories: [] });
    return new Map(PENDING_MATERIAL_CATEGORIES.map(category => [category.key, base.filter(part => part.category === category.key).length]));
  }, [parts, filters, query]);
  // One option per maker however it is capitalised; the merge does not tell "Acme" from "ACME" apart either.
  const manufacturers = useMemo(() => [...new Map(parts.filter(part => part.manufacturer).map(part => [projectPartToken(part.manufacturer), part.manufacturer])).values()].sort((left, right) => left.localeCompare(right, "zh-Hant")), [parts]);
  const selectedParts = useMemo(() => parts.filter(part => selected.has(part.key)), [parts, selected]);
  const visibleSelected = visible.filter(part => selected.has(part.key)).length;

  const set = <K extends keyof ProjectPartsFilters>(key: K, value: ProjectPartsFilters[K]) => setFilters(current => ({ ...current, [key]: value }));
  const toggleCategory = (key: PendingMaterialCategory) => setFilters(current => ({ ...current, categories: current.categories.includes(key) ? current.categories.filter(item => item !== key) : [...current.categories, key] }));
  const boardName = (id: string) => boardNames.get(id) ?? id;
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (filters.query.trim()) chips.push({ key: "query", label: `搜尋：${filters.query.trim()}`, clear: () => set("query", "") });
  if (filters.status !== "all") chips.push({ key: "status", label: `狀態：${PROJECT_PART_STATUSES.find(item => item.key === filters.status)?.label}`, clear: () => set("status", "all") });
  for (const key of filters.categories) chips.push({ key: `category:${key}`, label: `分類：${CATEGORY_LABEL.get(key)}`, clear: () => toggleCategory(key) });
  if (filters.board) chips.push({ key: "board", label: `板子：${boardName(filters.board)}`, clear: () => set("board", "") });
  if (filters.manufacturer) chips.push({ key: "manufacturer", label: `廠商：${filters.manufacturer}`, clear: () => set("manufacturer", "") });
  const clearAll = () => setFilters(EMPTY_PROJECT_PARTS_FILTERS);

  const toggle = (key: string) => setSelected(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const toggleVisible = (checked: boolean) => setSelected(current => { const next = new Set(current); for (const part of visible) { if (checked) next.add(part.key); else next.delete(part.key); } return next; });
  const headerChecked = visible.length > 0 && visibleSelected === visible.length ? true : visibleSelected > 0 ? "indeterminate" as const : false;

  const pjeTargets = selectedParts.length > 0 ? selectedParts : visible;
  const hiddenSelected = selectedParts.length - visibleSelected;
  const pjeLabel = selectedParts.length > 0 ? `已選 ${selectedParts.length.toLocaleString()} 項${hiddenSelected > 0 ? `（${hiddenSelected} 項不在目前篩選）` : ""}` : `目前 ${visible.length.toLocaleString()} 項`;

  const runExport = async (kind: "pje" | "all", withoutMissing = false) => {
    if (exporting) return;
    if (loading) {
      const names = series.filter(item => loads[item.id]?.state !== "ready" && loads[item.id]?.state !== "error").map(item => boardName(item.id)).join("、");
      setNotice({ tone: "error", incomplete: true, text: `還有系列在載入（${names}），現在轉出會少了這些板子的料。載入好就可以匯出。` });
      return;
    }
    if (failed.length > 0 && !withoutMissing) {
      // A board that keeps failing must not block the work forever: say what is missing and let the user decide.
      setNotice({ tone: "error", incomplete: true, exportAnyway: kind, text: `${failed.length} 個系列沒有載入（${failed.map(item => boardName(item.id)).join("、")}），匯出的表格不會有這些板子的料。可以按系列旁的「重試」，或確定不需要時仍要匯出。` });
      return;
    }
    const rows = kind === "pje" ? pjeTargets : visible;
    if (rows.length === 0) { setNotice({ tone: "error", text: kind === "pje" ? "沒有可以轉出的料件：請勾選料件，或放寬篩選條件。" : "目前篩選沒有料件可以匯出。" }); return; }
    setExporting(kind);
    setNotice(null);
    try {
      const exportedAt = new Date();
      const meta = { projectName, exportedBy, exportedAt };
      const blob = kind === "pje" ? await buildPjeWorkbook(rows, meta) : await buildProjectPartsWorkbook(rows, meta);
      const fileName = projectPartsFileName(projectName, kind === "pje" ? "PJE備料表" : "總料表", exportedAt);
      downloadBlob(blob, fileName);
      setNotice({ tone: "ok", text: `已下載${kind === "pje" ? " PJE 備料表" : "專案總料表"}（${rows.length.toLocaleString()} 項${failed.length ? `，不含 ${failed.map(item => boardName(item.id)).join("、")}` : ""}）：${fileName}` });
    } catch (error) {
      setNotice({ tone: "error", text: `匯出失敗：${error instanceof Error ? error.message : String(error)}。資料沒有變動，可以再按一次。` });
    } finally {
      setExporting(null);
    }
  };

  const actions = (
    <div className="project-parts-actions">
      {selectedParts.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())} title="取消所有勾選；之後轉 PJE 備料表會改用目前篩選的料件" className="project-parts-clear-selection">清除勾選</Button>}
      <Button type="button" variant="outline" size="sm" disabled={exporting === "pje"} aria-busy={exporting === "all" || undefined} onClick={() => void runExport("all")} title={`把目前篩選的 ${visible.length.toLocaleString()} 項料件匯出成 Excel，含每塊板子的用量與位號`} className="project-parts-export">
        {exporting === "all" ? <LoaderCircle className="project-parts-spinner" aria-hidden="true" /> : <Download aria-hidden="true" />}{exporting === "all" ? "匯出中…" : "匯出 Excel"}
      </Button>
      <Button type="button" size="sm" disabled={exporting === "all"} aria-busy={exporting === "pje" || undefined} onClick={() => void runExport("pje")} title={selectedParts.length > 0 ? `把勾選的 ${selectedParts.length} 項料件轉成 PJE 備料表（Items、Vendor、PN、使用在哪個板子、Usage）` : `沒有勾選時，把目前篩選的 ${visible.length.toLocaleString()} 項料件轉成 PJE 備料表；只想給部分料件請先勾選`} className="project-parts-pje">
        {exporting === "pje" ? <LoaderCircle className="project-parts-spinner" aria-hidden="true" /> : <PackageCheck aria-hidden="true" />}{exporting === "pje" ? "產生中…" : <>轉給 PJE 備料表<span className="project-parts-pje-count">{pjeLabel}</span></>}
      </Button>
    </div>
  );

  const scrollTop = () => resultsRef.current?.scrollTo({ top: 0 });
  const rows = visible.slice(0, shown);
  const more = visible.length - rows.length;
  const tableState = parts.length === 0 && loading
    ? <span className="project-parts-state"><LoaderCircle className="project-parts-spinner" aria-hidden="true" />正在載入 {series.length - waiting.length}／{series.length} 個系列的料件…</span>
    : parts.length === 0 && failed.length > 0
      ? <span className="project-parts-state project-parts-state--error" role="alert"><CircleAlert aria-hidden="true" />{failed.length === series.length ? "所有系列都沒有載入成功" : `${failed.length} 個系列沒有載入成功，其餘系列沒有料件`}，請按上方系列旁的「重試」。</span>
      : parts.length === 0 && complete ? <span className="project-parts-empty">這個專案的 BOM 裡沒有料件。</span>
        : visible.length === 0 ? <span className="project-parts-empty">{PROJECT_PARTS_EMPTY_TEXT}{chips.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={clearAll} title="清掉所有篩選條件，回到全部料件" className="project-parts-empty-clear">全部清除</Button>}</span>
          : null;

  return (
    <section data-testid="project-parts-view" className="project-parts-view" data-compact={compact || undefined}>
      <div className="project-parts-toolbar">
        <Button type="button" variant="outline" size="sm" onClick={onBack} title="回到 BOM 系列清單；勾選與篩選會清掉" className="project-parts-back">← 返回系列</Button>
        <div className="project-parts-title">
          <h3 title={`${projectName} 的專案總料表`}>{projectName}</h3>
          <p>合併 {series.length} 個系列的目前版本，同一顆料只列一次；已封存的系列不算在內。</p>
        </div>
        {!compact && actions}
      </div>

      <ul className="project-parts-boards" aria-label="合併的系列">
        {series.map(item => {
          const load = loads[item.id];
          const state = load?.state ?? "loading";
          return <li key={item.id} data-state={state} className="project-parts-board" title={state === "error" ? `${item.name}：${load?.state === "error" ? load.error : ""}` : `${item.name} 的目前版本 ${item.current.displayNumber}`}>
            {state === "ready" ? <CircleCheck aria-hidden="true" /> : state === "error" ? <CircleAlert aria-hidden="true" /> : <LoaderCircle className="project-parts-spinner" aria-hidden="true" />}
            <span className="project-parts-board-name">{boardName(item.id)}</span>
            <span className="project-parts-board-meta">{item.current.displayNumber}{state === "ready" && load?.state === "ready" ? ` · ${load.records.length.toLocaleString()} 筆` : state === "error" ? " · 載入失敗" : " · 載入中"}</span>
            {state === "error" && <button type="button" onClick={() => setAttempt(current => ({ ...current, [item.id]: (current[item.id] ?? 0) + 1 }))} title={`重新載入 ${item.name} 的料件`} className="project-parts-retry"><RotateCw aria-hidden="true" />重試</button>}
          </li>;
        })}
      </ul>

      {(notice || (!complete && parts.length > 0)) && (
        <div className="project-parts-notices">
          {!complete && parts.length > 0 && <p className="project-parts-partial" role="status">{loading ? `還在載入 ${waiting.length - failed.length} 個系列，載入好會自動補進表格。` : `${failed.length} 個系列沒有載入（${failed.map(item => boardName(item.id)).join("、")}），表格裡沒有它們的料。`}</p>}
          {notice && <p data-testid="project-parts-notice" className="project-parts-notice" data-tone={notice.tone} role={notice.tone === "error" ? "alert" : "status"}>{notice.tone === "ok" ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}<span>{notice.text}</span>{notice.exportAnyway && <Button type="button" variant="outline" size="sm" onClick={() => void runExport(notice.exportAnyway!, true)} title="不等沒載入的板子，直接匯出已載入的料" className="project-parts-notice-action">仍要匯出</Button>}<button type="button" onClick={() => setNotice(null)} aria-label="關閉訊息" title="關閉這則訊息"><X aria-hidden="true" /></button></p>}
        </div>
      )}

      {/* Persistent filter bar right above the results: 搜尋 → 狀態 → 分類 → 板子 → 廠商. */}
      <div data-testid="project-parts-filters" className="project-parts-filters">
        <div className="project-parts-filter-row">
          <div className="project-parts-search">
            <Search aria-hidden="true" />
            <Input value={filters.query} onChange={event => set("query", event.target.value)} placeholder="搜尋料號、品名、廠商、MPN、位號、板子" aria-label="搜尋專案總料表" title="空白分開的每個字都要符合" className="h-9 pl-8 text-sm" />
          </div>
          <Select value={filters.status} onValueChange={value => set("status", value as ProjectPartsFilters["status"])}>
            <SelectTrigger aria-label="狀態" title="依主料的料號狀態篩選" className="project-parts-select h-9 w-[8.5rem] text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">全部狀態</SelectItem>{PROJECT_PART_STATUSES.map(item => <SelectItem key={item.key} value={item.key} title={item.hint}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
          <div className="project-parts-categories" role="group" aria-label="分類">
            {PENDING_MATERIAL_CATEGORIES.map(category => {
              const on = filters.categories.includes(category.key);
              const count = counts.get(category.key) ?? 0;
              return <button key={category.key} type="button" aria-pressed={on} onClick={() => toggleCategory(category.key)} title={`${on ? "取消" : "加入"}「${category.label}」（${category.hint}），可以同時選好幾類；目前 ${count.toLocaleString()} 項`} className={cn(CHIP, "project-parts-category", on ? CHIP_TONE[CATEGORY_TONE[category.key] === "neutral" ? "success" : CATEGORY_TONE[category.key]] : "border-border bg-transparent text-muted-foreground hover:bg-accent/40")}>
                {category.label}<span className="project-parts-category-count">{count.toLocaleString()}</span>
              </button>;
            })}
          </div>
          <Select value={filters.board || ALL} onValueChange={value => set("board", value === ALL ? "" : value)}>
            <SelectTrigger aria-label="板子" title="只看用在這塊板子的料" className="project-parts-select project-parts-select--wide h-9 w-44 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>全部板子</SelectItem>{series.map(item => <SelectItem key={item.id} value={item.id}>{boardName(item.id)}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filters.manufacturer || ALL} onValueChange={value => set("manufacturer", value === ALL ? "" : value)}>
            <SelectTrigger aria-label="廠商" title="依主料的廠商篩選" className="project-parts-select project-parts-select--wide h-9 w-44 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>全部廠商</SelectItem>{manufacturers.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent>
          </Select>
          <span data-testid="project-parts-count" className="project-parts-count" title="符合目前篩選的料件 / 專案合計料件">{visible.length.toLocaleString()} / {parts.length.toLocaleString()} 項</span>
        </div>
        {chips.length > 0 && (
          <div data-testid="project-parts-active-filters" className="project-parts-chips">
            {chips.map(chip => <button key={chip.key} type="button" onClick={chip.clear} aria-label={`移除篩選：${chip.label}`} title="移除這個篩選條件" className="project-parts-chip"><span>{chip.label}</span><X aria-hidden="true" /></button>)}
            <Button type="button" variant="ghost" size="sm" onClick={clearAll} title="清掉所有篩選條件（勾選會保留）" className="project-parts-clear-all">全部清除</Button>
          </div>
        )}
      </div>


      {compact ? (
        <div ref={resultsRef} className="project-parts-results project-parts-results--cards" aria-busy={loading}>
          {visible.length > 0 && <label className="project-parts-select-all" title="勾選或取消目前篩選的全部料件"><Checkbox checked={headerChecked} onCheckedChange={checked => toggleVisible(checked === true)} aria-label="勾選目前篩選的全部料件" className={PARTIAL_CHECKBOX} />勾選目前篩選的 {visible.length.toLocaleString()} 項{visibleSelected > 0 && `（已選 ${visibleSelected.toLocaleString()}）`}</label>}
          {tableState ? <p className="project-parts-cards-state">{tableState}</p> : (
            <ul data-testid="project-parts-cards" className="project-parts-cards">
              {rows.map(part => <PartCard key={part.key} part={part} checked={selected.has(part.key)} onToggle={() => toggle(part.key)} />)}
            </ul>
          )}
          {more > 0 && <MoreRows more={more} onMore={() => setShown(current => current + PAGE)} onAll={() => setShown(visible.length)} />}
        </div>
      ) : (
        <div ref={resultsRef} className="project-parts-results" aria-busy={loading}>
          <table data-testid="project-parts-table" className="project-parts-table">
            <thead>
              <tr>
                <th className="project-parts-check"><Checkbox checked={headerChecked} onCheckedChange={checked => toggleVisible(checked === true)} aria-label="勾選目前篩選的全部料件" title="勾選或取消目前篩選的全部料件" className={PARTIAL_CHECKBOX} /></th>
                <th>分類</th><th>虛擬料號</th><th>實體料號</th><th>品名</th><th>廠商</th><th>MPN</th><th>使用在哪個板子</th><th className="project-parts-num">總用量</th><th>零件狀態</th>
              </tr>
            </thead>
            <tbody>
              {tableState ? <tr><td colSpan={10} className="project-parts-table-state">{tableState}</td></tr> : rows.map(part => {
                const checked = selected.has(part.key);
                return <tr key={part.key} data-selected={checked || undefined} onClick={event => { if (!(event.target as HTMLElement).closest("button, [role=checkbox]")) toggle(part.key); }}>
                  <td className="project-parts-check"><Checkbox checked={checked} onCheckedChange={() => toggle(part.key)} aria-label={`勾選 ${part.name || part.mpn}`} title="勾選的料才會轉進 PJE 備料表；點整列也可以勾選" /></td>
                  <td><span className={cn(CHIP, CHIP_TONE[CATEGORY_TONE[part.category]])}>{CATEGORY_LABEL.get(part.category)}</span></td>
                  <td className="project-parts-mono"><span title={part.virtualPartNumber}>{part.virtualPartNumber || "—"}</span></td>
                  <td className="project-parts-mono"><span title={part.physicalPartNumber}>{part.physicalPartNumber || "—"}</span></td>
                  <td className="project-parts-name"><span title={[part.name, part.spec].filter(Boolean).join("\n")}>{part.name || part.spec || "—"}</span></td>
                  <td><span title={part.manufacturer}>{part.manufacturer || "—"}</span></td>
                  <td className="project-parts-mono"><span title={part.alternates.length ? `${part.mpn}\n替代料：\n${part.alternates.join("\n")}` : part.mpn}>{part.mpn || "—"}{part.alternates.length > 0 && <em className="project-parts-alt">+{part.alternates.length} 替代</em>}</span></td>
                  <td className="project-parts-boards-cell"><span title={part.uses.map(use => `${use.board}：${use.qty === null ? use.qtyText : formatProjectQty(use.qty)}（${use.refs}）`).join("\n")}>{part.uses.length > 1 && <b>{part.uses.length} 板</b>}{describeProjectPartBoards(part)}</span></td>
                  <td className="project-parts-num">{formatProjectQty(part.totalQty, part.uses.map(use => use.qtyText || formatProjectQty(use.qty)).join("+"))}</td>
                  <td>{part.usageStatus || part.risk ? <span className={cn(CHIP, part.risk ? CHIP_TONE.danger : CHIP_TONE.neutral)} title={part.usageStatus || "料號表判定為風險料"}>{part.usageStatus || "風險料"}</span> : <span className="text-muted-foreground">—</span>}</td>
                </tr>;
              })}
            </tbody>
          </table>
          {more > 0 && <MoreRows more={more} onMore={() => setShown(current => current + PAGE)} onAll={() => setShown(visible.length)} />}
          {shown > PAGE && more === 0 && visible.length > PAGE && <button type="button" onClick={scrollTop} className="project-parts-top" title="捲回表格第一列">回到最上面</button>}
        </div>
      )}

      {compact && <div className="project-parts-mobile-actions">{actions}</div>}
    </section>
  );
}

function MoreRows({ more, onMore, onAll }: { more: number; onMore: () => void; onAll: () => void }) {
  return <div className="project-parts-more">
    <span>還有 {more.toLocaleString()} 項沒有顯示</span>
    <Button type="button" variant="outline" size="sm" onClick={onMore} title={`表格一次畫 ${PAGE} 項，捲得比較順；按這裡接著畫下一批`}>再顯示 {Math.min(more, PAGE).toLocaleString()} 項</Button>
    {more > PAGE && <Button type="button" variant="ghost" size="sm" onClick={onAll} title="一次顯示全部，料件很多時捲動會比較慢">全部顯示</Button>}
  </div>;
}

function PartCard({ part, checked, onToggle }: { part: ProjectPart; checked: boolean; onToggle: () => void }) {
  return <li className="project-parts-card" data-selected={checked || undefined}>
    <label className="project-parts-card-main">
      <Checkbox checked={checked} onCheckedChange={onToggle} aria-label={`勾選 ${part.name || part.mpn}`} title="勾選的料才會轉進 PJE 備料表" />
      <span className="project-parts-card-body">
        <span className="project-parts-card-line"><span className={cn(CHIP, CHIP_TONE[CATEGORY_TONE[part.category]])}>{CATEGORY_LABEL.get(part.category)}</span><b className="project-parts-card-name">{part.name || part.spec || "—"}</b></span>
        <span className="project-parts-card-line project-parts-mono">{part.physicalPartNumber || part.virtualPartNumber
          ? <>{part.physicalPartNumber && <><span className="project-parts-card-tag">實體</span>{part.physicalPartNumber}</>}{part.physicalPartNumber && part.virtualPartNumber && " · "}{part.virtualPartNumber && <><span className="project-parts-card-tag">虛擬</span>{part.virtualPartNumber}</>}</>
          : "未編料號"}</span>
        <span className="project-parts-card-line">{part.manufacturer || "—"}<span className="project-parts-mono"> · {part.mpn || "—"}</span>{part.alternates.length > 0 && <em className="project-parts-alt">+{part.alternates.length} 替代</em>}</span>
        <span className="project-parts-card-line text-muted-foreground">{describeProjectPartBoards(part)}</span>
        {(part.usageStatus || part.risk) && <span className={cn(CHIP, part.risk ? CHIP_TONE.danger : CHIP_TONE.neutral)}>{part.usageStatus || "風險料"}</span>}
      </span>
      <span className="project-parts-card-qty" title="總用量">{formatProjectQty(part.totalQty, part.uses.map(use => use.qtyText || formatProjectQty(use.qty)).join("+"))}<small>總用量</small></span>
    </label>
  </li>;
}
