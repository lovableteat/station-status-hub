import { type ReactNode, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Download, LoaderCircle, PackageCheck, RotateCw, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { bomFileBaseName, type BomSeries, type BomSeriesVersion } from "./bomVersioning";
import { CHIP, CHIP_TONE } from "./bomVersionPresentation";
import { ExcelFilterPopover } from "./materialExcelFilter";
import { downloadBlob } from "./materialRequestExport";
import { PENDING_MATERIAL_CATEGORIES, type PendingMaterialCategory } from "./materialRequestPresentation";
import type { MaterialWorkbookRecord } from "./materialRequestUtils";
import type { MaterialColumnSort } from "./materialTableSort";
import {
  EMPTY_PROJECT_PARTS_FILTERS, PROJECT_PART_COLUMNS, PROJECT_PART_STATUSES, PROJECT_QTY_MISSING, buildPjeWorkbook, buildProjectParts, buildProjectPartsWorkbook,
  describeMissingQty, describeProjectPartBoards, filterProjectParts, formatProjectQty, projectPartColumnOptions, projectPartQtyLabel, projectPartsFileName,
  projectPartRowSignature, projectPartToken, sortProjectParts, type ProjectPart, type ProjectPartColumnKey, type ProjectPartsBoard, type ProjectPartsFilters,
} from "./projectParts";
import "./projectParts.css";

export const PROJECT_PARTS_EMPTY_TEXT = "目前篩選條件沒有符合的料件";
const PAGE = 300;
const COLUMN_LABEL = new Map<ProjectPartColumnKey, string>(PROJECT_PART_COLUMNS.map(column => [column.key, column.label]));
const CATEGORY_TONE: Record<PendingMaterialCategory, keyof typeof CHIP_TONE> = { connector: "warning", ic: "primary", rlc: "neutral", other: "neutral" };
const CATEGORY_LABEL = new Map(PENDING_MATERIAL_CATEGORIES.map(category => [category.key, category.label]));
// Some of the filtered parts ticked: a filled box without the tick, as the material table's column filter shows it.
const PARTIAL_CHECKBOX = "data-[state=indeterminate]:bg-primary/60 [&[data-state=indeterminate]_svg]:invisible";

/** A ready load remembers which BOM (version) its rows came from: a category is only written back to that same BOM. */
type Load = { key: string; state: "loading"; previous?: MaterialWorkbookRecord[] } | { key: string; state: "ready"; records: MaterialWorkbookRecord[]; workspaceId: string } | { key: string; state: "error"; error: string };
type Notice = { tone: "ok" | "error"; text: string; incomplete?: boolean; exportAnyway?: "pje" | "all" };

function shownRecords(load: Load | undefined) {
  return load?.state === "ready" ? load.records : load?.state === "loading" ? load.previous : undefined;
}

/**
 * Writes a hand-picked category (null: back to the 位號 rule) to the given rows of each board's current version. A row
 * is only written while it still has the fingerprint it was shown with (projectPartRowSignature).
 */
export type SetProjectPartCategory = (
  targets: ReadonlyArray<{ workspace: BomSeriesVersion["workspace"]; rows: ReadonlyArray<{ id: string; signature: string }> }>,
  category: PendingMaterialCategory | null,
  onProgress?: (done: number, total: number) => void,
) => Promise<{ saved: number; boards: number }>;

export interface ProjectPartsViewProps {
  projectName: string;
  /** The project's live series; each one's current version is one board. */
  series: readonly BomSeries[];
  loadVersion: (version: BomSeriesVersion) => Promise<MaterialWorkbookRecord[]>;
  exportedBy: string;
  compact: boolean;
  onBack: () => void;
  /** Without it (no edit permission, storage not connected) the category is shown, not editable. */
  onSetCategory?: SetProjectPartCategory;
}

function loadKey(series: BomSeries) {
  return `${series.current.workspace.id}:${series.current.workspace.updatedAt}`;
}

export function ProjectPartsView({ projectName, series: liveSeries, loadVersion, exportedBy, compact, onBack, onSetCategory }: ProjectPartsViewProps) {
  // Boards in a fixed order (by name): the series list moves a board up whenever it is saved, which would reorder the
  // boards of every row, the row's name and PJE's board column after each category change.
  const series = useMemo(() => [...liveSeries].sort((left, right) => left.name.localeCompare(right.name, "zh-Hant", { numeric: true }) || left.id.localeCompare(right.id)), [liveSeries]);
  const [loads, setLoads] = useState<Record<string, Load>>({});
  const [attempt, setAttempt] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState<ProjectPartsFilters>(EMPTY_PROJECT_PARTS_FILTERS);
  const query = useDeferredValue(filters.query);
  const [sort, setSort] = useState<MaterialColumnSort<ProjectPartColumnKey> | null>(null);
  const [mobileColumn, setMobileColumn] = useState<ProjectPartColumnKey>("manufacturer");
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
      const workspaceId = item.current.workspace.id;
      setLoads(current => current[item.id]?.key === key ? current : { ...current, [item.id]: { key, state: "loading", previous: shownRecords(current[item.id]) } });
      loadVersion(item.current)
        .then(records => {
          if (!alive) return;
          setLoads(current => {
            const now = current[item.id];
            // A cached load answers again on every re-run: a ready board keeps its rows (and a category just picked).
            if (now?.key !== key || now.state === "ready") return current;
            return { ...current, [item.id]: { key, state: "ready", records, workspaceId } };
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
  const visible = useMemo(() => sortProjectParts(filterProjectParts(parts, { ...filters, query }), sort), [parts, filters, query, sort]);
  useEffect(() => { setShown(PAGE); }, [filters, query, sort]);
  const counts = useMemo(() => {
    const base = filterProjectParts(parts, { ...filters, query, categories: [] });
    return new Map(PENDING_MATERIAL_CATEGORIES.map(category => [category.key, base.filter(part => part.category === category.key).length]));
  }, [parts, filters, query]);
  // The column filters work as in the material table: a column lists the values the other filters leave.
  const getColumnOptions = useCallback((key: ProjectPartColumnKey) => projectPartColumnOptions(filterProjectParts(parts, { ...filters, query }, key), key), [parts, filters, query]);
  const setColumn = (key: ProjectPartColumnKey, values: string[] | null) => setFilters(current => ({ ...current, columns: { ...current.columns, [key]: values } }));
  // Pressing the sort that is already on turns it off and brings back the default order (category, then most boards).
  const toggleSort = (next: MaterialColumnSort<ProjectPartColumnKey>) => setSort(current => (current?.key === next.key && current.direction === next.direction ? null : next));
  const selectedParts = useMemo(() => parts.filter(part => selected.has(part.key)), [parts, selected]);
  const visibleSelected = visible.filter(part => selected.has(part.key)).length;

  const set = <K extends keyof ProjectPartsFilters>(key: K, value: ProjectPartsFilters[K]) => setFilters(current => ({ ...current, [key]: value }));
  const toggleCategory = (key: PendingMaterialCategory) => setFilters(current => ({ ...current, categories: current.categories.includes(key) ? current.categories.filter(item => item !== key) : [...current.categories, key] }));
  const boardName = (id: string) => boardNames.get(id) ?? id;
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (filters.query.trim()) chips.push({ key: "query", label: `搜尋：${filters.query.trim()}`, clear: () => set("query", "") });
  if (filters.status !== "all") chips.push({ key: "status", label: `狀態：${PROJECT_PART_STATUSES.find(item => item.key === filters.status)?.label}`, clear: () => set("status", "all") });
  for (const key of filters.categories) chips.push({ key: `category:${key}`, label: `分類：${CATEGORY_LABEL.get(key)}`, clear: () => toggleCategory(key) });
  // A maker is filtered by its case-blind token; chips show it as the boards spell it.
  const makerSpelling = (key: ProjectPartColumnKey, value: string) => (key === "manufacturer" ? parts.find(part => projectPartToken(part.manufacturer) === value)?.manufacturer || value : value);
  for (const { key, label } of PROJECT_PART_COLUMNS) {
    const values = filters.columns[key];
    if (values == null) continue;
    chips.push({ key: `column:${key}`, label: `${label}：${values.length ? `${values.slice(0, 2).map(value => makerSpelling(key, value)).join("、")}${values.length > 2 ? ` 等 ${values.length} 項` : ""}` : "未選任何值"}`, clear: () => setColumn(key, null) });
  }
  const mobileValues = filters.columns[mobileColumn] ?? null;
  const mobileValueLabel = mobileValues === null ? "全部" : mobileValues.length === 1 ? makerSpelling(mobileColumn, mobileValues[0]) : mobileValues.length ? `已選 ${mobileValues.length} 項` : "全不選";
  const clearAll = () => setFilters(EMPTY_PROJECT_PARTS_FILTERS);

  // A hand-picked category: shown at once, written to every row of the part on every board it uses.
  const [savingCategory, setSavingCategory] = useState<ReadonlySet<string>>(() => new Set());
  const patchCategory = (part: ProjectPart, category: PendingMaterialCategory | null) => setLoads(current => {
    const next = { ...current };
    for (const use of part.uses) {
      const load = current[use.boardId];
      if (load?.state !== "ready") continue;
      const ids = new Set(use.recordIds);
      next[use.boardId] = { ...load, records: load.records.map(record => {
        if (!ids.has(record.id)) return record;
        const changed = { ...record };
        if (category) changed.pendingCategory = category;
        else delete changed.pendingCategory;
        return changed;
      }) };
    }
    return next;
  });
  const changeCategory = async (part: ProjectPart, category: PendingMaterialCategory | null) => {
    if (!onSetCategory || savingCategory.has(part.key)) return;
    const name = part.name || part.mpn || part.spec || "這顆料";
    // Every board must be in, from the version that is current now: rows of a board still loading belong to the
    // version it had before, and the same row id is another part in the new one.
    if (!complete) {
      setNotice({ tone: "error", text: `還有 ${waiting.length} 個系列沒有載入好（${waiting.map(item => boardName(item.id)).join("、")}），${failed.length ? "請先按「重試」，" : ""}全部載入後才能改分類，免得有板子沒改到。` });
      return;
    }
    const targets: Parameters<SetProjectPartCategory>[0][number][] = [];
    for (const use of part.uses) {
      const item = series.find(candidate => candidate.id === use.boardId);
      const load = loads[use.boardId];
      if (!item || load?.state !== "ready" || load.workspaceId !== item.current.workspace.id) {
        setNotice({ tone: "error", text: `${boardName(use.boardId)} 剛換了目前版本，正在重新載入；載入好再改一次分類。` });
        return;
      }
      const byId = new Map(load.records.map(record => [record.id, record]));
      targets.push({ workspace: item.current.workspace, rows: use.recordIds.flatMap(id => (byId.has(id) ? [{ id, signature: projectPartRowSignature(byId.get(id)!) }] : [])) });
    }
    const label = category ? CATEGORY_LABEL.get(category) ?? category : `依位號自動（${CATEGORY_LABEL.get(part.autoCategory)}）`;
    setSavingCategory(current => new Set(current).add(part.key));
    patchCategory(part, category);
    try {
      // Every row of every position is written one by one (each with its own revision check): say how far it is.
      const result = await onSetCategory(targets, category, (done, total) => {
        if (total > 20) setNotice({ tone: "ok", text: `正在把 ${name} 的分類寫回 BOM：${done.toLocaleString()}／${total.toLocaleString()} 列…` });
      });
      setNotice({ tone: "ok", text: result.saved === 0
        ? `${name} 的分類本來就是 ${label}，不用寫回。`
        : `${name} 的分類改成 ${label}，已寫回 ${result.boards} 塊板子的 BOM（${result.saved.toLocaleString()} 列，待處理料也會用這個分類）。` });
    } catch (error) {
      // What was written stays; reload the boards so the table shows what is really saved.
      setAttempt(current => Object.fromEntries([...Object.entries(current), ...part.uses.map(use => [use.boardId, (current[use.boardId] ?? 0) + 1])]));
      setNotice({ tone: "error", text: `${name}：${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setSavingCategory(current => { const next = new Set(current); next.delete(part.key); return next; });
    }
  };
  const categoryControl = (part: ProjectPart) => <CategoryPicker part={part} busy={savingCategory.has(part.key)} onChange={onSetCategory ? category => void changeCategory(part, category) : undefined} />;

  const toggle = (key: string) => setSelected(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const toggleVisible = (checked: boolean) => setSelected(current => { const next = new Set(current); for (const part of visible) { if (checked) next.add(part.key); else next.delete(part.key); } return next; });
  const headerChecked = visible.length > 0 && visibleSelected === visible.length ? true : visibleSelected > 0 ? "indeterminate" as const : false;

  // Ticked rows in the order on screen (the sort included), then ticked rows the filter hides.
  const pjeTargets = selectedParts.length > 0 ? [...visible.filter(part => selected.has(part.key)), ...selectedParts.filter(part => !visible.includes(part))] : visible;
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

      {/* Persistent filter bar right above the results: 搜尋 → 狀態 → 分類; the other columns filter in the table header. */}
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
          {/* On a phone the table's column filters become one picker: which column, then its values. */}
          {compact && <div className="project-parts-mobile-column" role="group" aria-label="欄位與篩選值">
            <Select value={mobileColumn} onValueChange={value => setMobileColumn(value as ProjectPartColumnKey)}>
              <SelectTrigger aria-label="篩選欄位" title="選要篩選的欄位，再到右邊勾選值" className="project-parts-select h-11 min-w-0 text-sm [&>span]:truncate"><SelectValue /></SelectTrigger>
              <SelectContent>{PROJECT_PART_COLUMNS.map(column => <SelectItem key={column.key} value={column.key}>{column.label}</SelectItem>)}</SelectContent>
            </Select>
            <ExcelFilterPopover filterKey={mobileColumn} getOptions={getColumnOptions} label={COLUMN_LABEL.get(mobileColumn) ?? mobileColumn} triggerLabel={mobileValueLabel} optionRowHeight={44} selectedValues={mobileValues} onSelectedValuesChange={values => setColumn(mobileColumn, values)} activeSort={sort} onSortChange={toggleSort} insideDialog />
          </div>}
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
              {rows.map(part => <PartCard key={part.key} part={part} checked={selected.has(part.key)} onToggle={() => toggle(part.key)} category={categoryControl(part)} />)}
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
              {/* Second header row as in the material table: each column's Excel-style filter and sort. */}
              <tr className="project-parts-filter-head">
                <th aria-hidden="true" />
                <th><span className="project-parts-head-note" title="分類用上方的 CONNECTOR／IC／RLC／其他 按鈕篩選">—</span></th>
                {PROJECT_PART_COLUMNS.map(column => <th key={column.key} data-column={column.key}>
                  <ExcelFilterPopover filterKey={column.key} getOptions={getColumnOptions} label={column.label} selectedValues={filters.columns[column.key] ?? null} onSelectedValuesChange={values => setColumn(column.key, values)} activeSort={sort} onSortChange={toggleSort} insideDialog />
                </th>)}
              </tr>
            </thead>
            <tbody>
              {tableState ? <tr><td colSpan={10} className="project-parts-table-state">{tableState}</td></tr> : rows.map(part => {
                const checked = selected.has(part.key);
                // Clicks inside the row only: the category list opens in a portal, its clicks must not tick the row.
                return <tr key={part.key} data-selected={checked || undefined} onClick={event => { if (event.currentTarget.contains(event.target as Node) && !(event.target as HTMLElement).closest("button, [role=checkbox]")) toggle(part.key); }}>
                  <td className="project-parts-check"><Checkbox checked={checked} onCheckedChange={() => toggle(part.key)} aria-label={`勾選 ${part.name || part.mpn}`} title="勾選的料才會轉進 PJE 備料表；點整列也可以勾選" /></td>
                  <td className="project-parts-category-cell">{categoryControl(part)}</td>
                  <td className="project-parts-mono"><span title={part.virtualPartNumber}>{part.virtualPartNumber || "—"}</span></td>
                  <td className="project-parts-mono"><span title={part.physicalPartNumber}>{part.physicalPartNumber || "—"}</span></td>
                  <td className="project-parts-name"><span title={[part.name, part.spec].filter(Boolean).join("\n")}>{part.name || part.spec || "—"}</span></td>
                  <td><span title={part.manufacturer}>{part.manufacturer || "—"}</span></td>
                  <td className="project-parts-mono"><span title={part.alternates.length ? `${part.mpn}\n替代料：\n${part.alternates.join("\n")}` : part.mpn}>{part.mpn || "—"}{part.alternates.length > 0 && <em className="project-parts-alt">+{part.alternates.length} 替代</em>}</span></td>
                  <td className="project-parts-boards-cell"><span title={qtyBreakdown(part)}>{part.uses.length > 1 && <b>{part.uses.length} 板</b>}{describeProjectPartBoards(part)}</span></td>
                  <td className="project-parts-num"><QtyValue part={part} /></td>
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

/** Each board's quantity and positions, then the positions the BOM left without a quantity (not in the total). */
function qtyBreakdown(part: ProjectPart) {
  const missing = describeMissingQty(part);
  return [
    ...part.uses.map(use => `${use.board}：${formatProjectQty(use.qty, PROJECT_QTY_MISSING)}（${use.refs}）`),
    missing && `BOM 沒寫用量、沒有算進總用量的位號：\n${missing}`,
  ].filter(Boolean).join("\n");
}

/** The total the boards wrote; positions without a quantity are counted next to it instead of breaking the number. */
function QtyValue({ part }: { part: ProjectPart }) {
  return <span className="project-parts-qty" title={qtyBreakdown(part)}>
    {part.totalQty === null ? <span className="project-parts-qty-missing">{PROJECT_QTY_MISSING}</span> : formatProjectQty(part.totalQty)}
    {part.totalQty !== null && part.missingCount > 0 && <span className="project-parts-qty-missing">+{part.missingCount} {PROJECT_QTY_MISSING}</span>}
  </span>;
}

/** The part's category, editable as in 待處理料: 依位號自動 or a hand-picked one, which wins over the 位號 rule. */
function CategoryPicker({ part, busy, onChange }: { part: ProjectPart; busy: boolean; onChange?: (category: PendingMaterialCategory | null) => void }) {
  const label = CATEGORY_LABEL.get(part.category) ?? part.category;
  const tone = CHIP_TONE[CATEGORY_TONE[part.category]];
  if (!onChange) return <span className={cn(CHIP, tone)} title={part.manualCategory ? `手動分類為 ${label}；沒有編輯權限，不能改` : `依位號自動分類為 ${label}；沒有編輯權限，不能改`}>{label}{part.manualCategory && " · 手動"}</span>;
  return <Select value={part.manualCategory ? part.category : "auto"} disabled={busy} onValueChange={value => onChange(value === "auto" ? null : value as PendingMaterialCategory)}>
    <SelectTrigger
      aria-label={`調整 ${part.name || part.mpn || "這顆料"} 的分類，目前 ${label}${part.manualCategory ? "（手動）" : "（依位號）"}`}
      title={part.manualCategory ? `手動分類為 ${label}；可改回依位號自動分類。改了會寫回用到它的每塊板子` : `依位號自動分類為 ${label}；分錯可以在這裡改，會寫回用到它的每塊板子`}
      aria-busy={busy || undefined}
      className={cn(CHIP, tone, "project-parts-category-picker w-auto text-xs", part.manualCategory && "project-parts-category-picker--manual")}
    >
      {busy ? <LoaderCircle className="project-parts-spinner" aria-hidden="true" /> : null}
      <SelectValue>{part.manualCategory ? `${label} · 手動` : label}</SelectValue>
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="auto">依位號自動（{CATEGORY_LABEL.get(part.autoCategory)}）</SelectItem>
      {PENDING_MATERIAL_CATEGORIES.map(item => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}
    </SelectContent>
  </Select>;
}

function PartCard({ part, checked, onToggle, category }: { part: ProjectPart; checked: boolean; onToggle: () => void; category: ReactNode }) {
  return <li className="project-parts-card" data-selected={checked || undefined}>
    <label className="project-parts-card-main">
      <Checkbox checked={checked} onCheckedChange={onToggle} aria-label={`勾選 ${part.name || part.mpn}`} title="勾選的料才會轉進 PJE 備料表" />
      <span className="project-parts-card-body">
        <b className="project-parts-card-line project-parts-card-name">{part.name || part.spec || "—"}</b>
        <span className="project-parts-card-line project-parts-mono">{part.physicalPartNumber || part.virtualPartNumber
          ? <>{part.physicalPartNumber && <><span className="project-parts-card-tag">實體</span>{part.physicalPartNumber}</>}{part.physicalPartNumber && part.virtualPartNumber && " · "}{part.virtualPartNumber && <><span className="project-parts-card-tag">虛擬</span>{part.virtualPartNumber}</>}</>
          : "未編料號"}</span>
        <span className="project-parts-card-line">{part.manufacturer || "—"}<span className="project-parts-mono"> · {part.mpn || "—"}</span>{part.alternates.length > 0 && <em className="project-parts-alt">+{part.alternates.length} 替代</em>}</span>
        <span className="project-parts-card-line text-muted-foreground">{describeProjectPartBoards(part)}</span>
      </span>
      <span className="project-parts-card-qty" title={qtyBreakdown(part)}>{projectPartQtyLabel(part)}<small>{part.totalQty !== null && part.missingCount > 0 ? `總用量 · ${part.missingCount} 未填` : "總用量"}</small></span>
    </label>
    {/* Outside the label: a tap on the card ticks it, and the label must not hand that tap to the category list. */}
    <div className="project-parts-card-foot">{category}{(part.usageStatus || part.risk) && <span className={cn(CHIP, part.risk ? CHIP_TONE.danger : CHIP_TONE.neutral)}>{part.usageStatus || "風險料"}</span>}</div>
  </li>;
}
