import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, FileArchive, GitCompareArrows, Layers3, Pencil, Search, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { BomDiffView } from "./BomDiffView";
import { diffBomRecords, type BomDiffEntry, type BomDiffResult } from "./bomDiff";
import { exportBomDiffExcel } from "./bomDiffExport";
import {
  BOM_SERIES_NAME_LIMIT, BOM_VERSION_LABEL_LIMIT, BOM_VERSION_NOTE_LIMIT, findBomSeriesByWorkspace, formatBomVersionTitle,
  type BomSeries, type BomSeriesVersion,
} from "./bomVersioning";
import { CHIP, CHIP_TONE, formatBomRelativeTime, formatBomTimestamp } from "./bomVersionPresentation";
import { groupBomWorkspacesByProject, UNASSIGNED_BOM_PROJECT_LABEL } from "./materialRequestPresentation";
import type { MaterialWorkbookRecord } from "./materialRequestUtils";

const UNASSIGNED_VALUE = "__unassigned__";
export const BOM_SERIES_EMPTY_TEXT = "找不到符合條件的 BOM 系列";

export interface BomVersionCenterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Module edit permission; record-level read-only rules do not apply here. */
  canEdit: boolean;
  ready: boolean;
  busy?: boolean;
  activeBomId: string;
  activeProjectId?: string | null;
  activeProjectName?: string | null;
  projects: Array<{ id: string; name: string }>;
  projectNames: ReadonlyMap<string, string>;
  seriesList: BomSeries[];
  exportedBy: string;
  loadRecords: (workspaceId: string) => Promise<MaterialWorkbookRecord[]>;
  onView: (workspaceId: string) => void;
  onSetCurrent: (version: BomSeriesVersion, series: BomSeries) => void;
  onUploadVersion: (series: BomSeries) => void;
  onUploadNew: () => void;
  onAssignProject: (series: BomSeries, projectId: string | null) => Promise<void>;
  onRenameSeries: (series: BomSeries, name: string) => Promise<void>;
  onUpdateVersion: (version: BomSeriesVersion, series: BomSeries, patch: { label: string; note: string }) => Promise<void>;
  onSetArchived: (series: BomSeries, archived: boolean) => void;
  onDeleteVersion: (version: BomSeriesVersion, series: BomSeries) => void;
  onDeleteSeries: (series: BomSeries) => void;
  onOpenPageTracker: (workspaceId: string) => void;
  onDownloadSource: (version: BomSeriesVersion) => void;
}

function useCompact() {
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}

function VersionEditor({ version, busy, onSave, onCancel }: { version: BomSeriesVersion; busy: boolean; onSave: (patch: { label: string; note: string }) => void; onCancel: () => void }) {
  const [label, setLabel] = useState(version.version.label);
  const [note, setNote] = useState(version.version.note);
  return (
    <div className="grid gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
      <div>
        <Label htmlFor={`bom-version-label-${version.workspace.id}`} className="text-xs text-muted-foreground">版本標籤</Label>
        <Input id={`bom-version-label-${version.workspace.id}`} value={label} maxLength={BOM_VERSION_LABEL_LIMIT} disabled={busy} onChange={(event) => setLabel(event.target.value)} className="mt-1 h-9 text-sm" />
      </div>
      <div>
        <Label htmlFor={`bom-version-note-${version.workspace.id}`} className="text-xs text-muted-foreground">版本說明</Label>
        <Textarea id={`bom-version-note-${version.workspace.id}`} value={note} maxLength={BOM_VERSION_NOTE_LIMIT} disabled={busy} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-1 min-h-9 text-sm" />
      </div>
      <div className="flex items-end gap-1">
        <Button type="button" size="sm" disabled={busy} onClick={() => onSave({ label: label.trim(), note: note.trim() })} className="h-9">儲存</Button>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel} className="h-9">取消</Button>
      </div>
    </div>
  );
}

/**
 * BOM 版本管理: series list on the left, the selected series' version timeline on
 * the right, and a full-width diff mode. Replaces the flat BOM 管理 list.
 */
export function BomVersionCenter(props: BomVersionCenterProps) {
  const {
    open, onOpenChange, canEdit, ready, busy = false, activeBomId, activeProjectId, activeProjectName, projects, projectNames, seriesList, exportedBy,
    loadRecords, onView, onSetCurrent, onUploadVersion, onUploadNew, onAssignProject, onRenameSeries, onUpdateVersion, onSetArchived, onDeleteVersion, onDeleteSeries, onOpenPageTracker, onDownloadSource,
  } = props;
  const compact = useCompact();
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"list" | "detail">("list");
  const [mode, setMode] = useState<"series" | "diff">("series");
  const [diffPair, setDiffPair] = useState<{ before: string; after: string } | null>(null);
  const [diffResult, setDiffResult] = useState<BomDiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const recordsCache = useRef(new Map<string, Promise<MaterialWorkbookRecord[]>>());
  const diffRequest = useRef(0);

  const activeSeries = useMemo(() => findBomSeriesByWorkspace(seriesList, activeBomId), [seriesList, activeBomId]);
  const liveSeries = useMemo(() => seriesList.filter((series) => !series.archive), [seriesList]);
  const archivedSeries = useMemo(() => seriesList.filter((series) => Boolean(series.archive)), [seriesList]);
  const selectedSeries = seriesList.find((series) => series.id === selectedSeriesId) ?? activeSeries?.series ?? liveSeries[0] ?? null;
  const totalVersions = seriesList.reduce((sum, series) => sum + series.versions.length, 0);
  const description = `目前專案：${activeProjectName ?? "未選擇"} · ${seriesList.length} 個系列 · ${totalVersions} 個版本${archivedSeries.length > 0 ? ` · 已封存 ${archivedSeries.length} 個` : ""} · 使用中：${activeSeries ? `${activeSeries.series.name} ${activeSeries.version.displayNumber}` : "未選擇"}`;

  useEffect(() => {
    if (!open) return;
    setMode("series");
    setDiffPair(null);
    setDiffResult(null);
    setEditingVersionId(null);
    setRenaming(false);
    setFeedback(null);
    setMobilePane("list");
    setSelectedSeriesId(activeSeries?.series.id ?? null);
    recordsCache.current.clear();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const matches = (series: BomSeries) => !keyword || [series.name, ...series.versions.flatMap((item) => [item.workspace.payload.sourceFile, item.workspace.payload.sheetName, item.version.label, item.version.note])].join(" ").toLowerCase().includes(keyword);
    return groupBomWorkspacesByProject(liveSeries, { activeProjectId, activeProjectName, projectNames })
      .map((group) => ({ ...group, workspaces: group.label.toLowerCase().includes(keyword) && keyword ? group.workspaces : group.workspaces.filter(matches) }))
      .filter((group) => group.workspaces.length > 0 || (!keyword && group.isActive));
  }, [liveSeries, query, activeProjectId, activeProjectName, projectNames]);

  const cachedRecords = (version: BomSeriesVersion) => {
    const key = `${version.workspace.id}:${version.workspace.updatedAt}`;
    let promise = recordsCache.current.get(key);
    if (!promise) {
      promise = loadRecords(version.workspace.id).catch((error) => { recordsCache.current.delete(key); throw error; });
      recordsCache.current.set(key, promise);
    }
    return promise;
  };

  const openDiff = (series: BomSeries, before: BomSeriesVersion, after: BomSeriesVersion) => {
    setSelectedSeriesId(series.id);
    setDiffPair({ before: before.workspace.id, after: after.workspace.id });
    setMode("diff");
  };

  const diffSeries = selectedSeries;
  const diffBefore = diffSeries?.versions.find((item) => item.workspace.id === diffPair?.before) ?? null;
  const diffAfter = diffSeries?.versions.find((item) => item.workspace.id === diffPair?.after) ?? null;
  useEffect(() => {
    if (mode !== "diff" || !diffBefore || !diffAfter) return;
    const request = ++diffRequest.current;
    setDiffLoading(true);
    setDiffError(null);
    setDiffResult(null);
    Promise.all([cachedRecords(diffBefore), cachedRecords(diffAfter)])
      .then(([beforeRecords, afterRecords]) => {
        if (request !== diffRequest.current) return;
        setDiffResult(diffBomRecords(beforeRecords, afterRecords));
      })
      .catch((error) => {
        if (request !== diffRequest.current) return;
        setDiffError(error instanceof Error ? error.message : "載入版本料件失敗，請稍後再試。");
      })
      .finally(() => { if (request === diffRequest.current) setDiffLoading(false); });
  }, [mode, diffBefore?.workspace.id, diffBefore?.workspace.updatedAt, diffAfter?.workspace.id, diffAfter?.workspace.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const runAction = async (action: () => Promise<void>, success: string) => {
    setPending(true);
    setFeedback(null);
    try {
      await action();
      setFeedback({ tone: "ok", text: success });
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "操作失敗，請稍後再試。" });
    } finally {
      setPending(false);
    }
  };

  const exportDiff = async (visibleEntries: BomDiffEntry[]) => {
    if (!diffResult || !diffSeries || !diffBefore || !diffAfter) return;
    setExporting(true);
    try {
      const describe = (version: BomSeriesVersion) => ({ title: formatBomVersionTitle(version), sourceFile: version.workspace.payload.sourceFile, uploadedAt: formatBomTimestamp(version.version.uploadedAt), recordCount: version.workspace.payload.recordCount });
      const fileName = await exportBomDiffExcel(diffResult, {
        seriesName: diffSeries.name,
        before: describe(diffBefore),
        after: describe(diffAfter),
        exportedBy,
        exportedAt: new Date().toISOString(),
        visibleEntries: visibleEntries.length === diffResult.entries.length ? undefined : visibleEntries,
      });
      setFeedback({ tone: "ok", text: `已下載 ${fileName}` });
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "差異 Excel 匯出失敗。" });
    } finally {
      setExporting(false);
    }
  };

  const selectSeries = (series: BomSeries) => {
    setSelectedSeriesId(series.id);
    setEditingVersionId(null);
    setRenaming(false);
    setFeedback(null);
    if (compact) setMobilePane("detail");
  };

  const renderSeriesRow = (series: BomSeries, archived = false) => {
    const isSelected = selectedSeries?.id === series.id;
    const isActive = activeSeries?.series.id === series.id;
    return (
      <button
        key={series.id}
        type="button"
        onClick={() => selectSeries(series)}
        aria-current={isSelected ? "true" : undefined}
        className={cn(
          "flex w-full flex-col gap-1 rounded-xl border px-3 py-2 text-left transition-colors",
          isSelected ? "border-primary/50 bg-primary/10" : "border-border bg-background/40 hover:bg-accent/40",
          archived && "opacity-75",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={series.name}>{series.name}</p>
          <span className={cn(CHIP, "flex-none", CHIP_TONE.primary)}>{series.current.displayNumber}</span>
          {isActive && <span className={cn(CHIP, "flex-none", activeSeries?.version.isCurrent ? CHIP_TONE.success : CHIP_TONE.warning)}>{activeSeries?.version.isCurrent ? "使用中" : `檢視 ${activeSeries?.version.displayNumber}`}</span>}
          {archived && <span className={cn(CHIP, "flex-none", CHIP_TONE.neutral)}>已封存</span>}
        </div>
        <p className="truncate text-xs text-muted-foreground">{series.versions.length} 個版本 · {series.recordCount.toLocaleString()} 筆 · 更新 {formatBomRelativeTime(series.updatedAt)}</p>
      </button>
    );
  };

  const detail = selectedSeries && (
    <section data-testid="bom-series-detail" className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      {compact && <Button type="button" variant="ghost" size="sm" onClick={() => setMobilePane("list")} className="h-10 w-fit px-2 text-sm lg:hidden"><ArrowLeft className="mr-1 h-4 w-4" />返回清單</Button>}
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input value={renameDraft} maxLength={BOM_SERIES_NAME_LIMIT} aria-label="系列名稱" disabled={pending} onChange={(event) => setRenameDraft(event.target.value)} className="h-9 max-w-[24rem] text-sm" />
              <Button type="button" size="sm" disabled={pending || !renameDraft.trim()} onClick={() => void runAction(() => onRenameSeries(selectedSeries, renameDraft.trim()), "系列名稱已更新").then(() => setRenaming(false))} className="h-9">儲存名稱</Button>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setRenaming(false)} className="h-9">取消</Button>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="min-w-0 truncate text-lg font-bold text-foreground" title={selectedSeries.name}>{selectedSeries.name}</h3>
              {canEdit && <Button type="button" variant="ghost" size="sm" aria-label="修改系列名稱" title="修改系列名稱" onClick={() => { setRenameDraft(selectedSeries.name); setRenaming(true); }} className="h-8 w-8 p-0"><Pencil className="h-3.5 w-3.5" /></Button>}
            </div>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">目前版本 {selectedSeries.current.displayNumber} · {selectedSeries.versions.length} 個版本 · {selectedSeries.recordCount.toLocaleString()} 筆 · 專案：{selectedSeries.project ? projectNames.get(selectedSeries.project.projectId) ?? selectedSeries.project.projectName : UNASSIGNED_BOM_PROJECT_LABEL}</p>
        </div>
        <Select value={selectedSeries.project?.projectId ?? UNASSIGNED_VALUE} disabled={!canEdit || !ready || pending} onValueChange={(value) => void runAction(() => onAssignProject(selectedSeries, value === UNASSIGNED_VALUE ? null : value), "專案歸屬已更新")}>
          <SelectTrigger aria-label={`${selectedSeries.name} 所屬專案`} className="h-9 w-[12rem] text-sm"><SelectValue placeholder="指定專案" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED_VALUE}>未指定專案</SelectItem>
            {(selectedSeries.project && !projects.some((project) => project.id === selectedSeries.project?.projectId) ? [...projects, { id: selectedSeries.project.projectId, name: selectedSeries.project.projectName }] : projects).map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" size="sm" disabled={!canEdit || !ready || busy} onClick={() => onUploadVersion(selectedSeries)} className="h-9"><Upload className="mr-1.5 h-4 w-4" />上傳新版本</Button>
        <Button type="button" variant="outline" size="sm" disabled={selectedSeries.versions.length < 2} title={selectedSeries.versions.length < 2 ? "需要兩個以上版本才能比對" : "比對目前版本與前一版"} onClick={() => {
          const current = selectedSeries.current;
          const previous = [...selectedSeries.versions].reverse().find((item) => item !== current && item.version.versionNumber <= current.version.versionNumber) ?? selectedSeries.versions.find((item) => item !== current)!;
          openDiff(selectedSeries, previous, current);
        }} className="h-9"><GitCompareArrows className="mr-1.5 h-4 w-4" />比對版本</Button>
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" disabled={!canEdit || !ready || pending} onClick={() => onSetArchived(selectedSeries, !selectedSeries.archive)} title={selectedSeries.archive ? "回到清單" : "整個系列移到封存區，資料保留"} className="h-9 text-sm">{selectedSeries.archive ? "解除封存" : "封存系列"}</Button>
          <Button type="button" variant="ghost" size="sm" disabled={!canEdit || !ready || pending} onClick={() => onDeleteSeries(selectedSeries)} className="h-9 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive">刪除系列</Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border">
        <table data-testid="bom-version-table" className="w-full min-w-[960px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-card text-left text-xs text-muted-foreground">
            <tr>
              <th className="whitespace-nowrap px-2 py-2 font-semibold">版本</th>
              <th className="whitespace-nowrap px-2 py-2 font-semibold">標籤／說明</th>
              <th className="whitespace-nowrap px-2 py-2 font-semibold">來源檔</th>
              <th className="whitespace-nowrap px-2 py-2 font-semibold">筆數</th>
              <th className="whitespace-nowrap px-2 py-2 font-semibold">上傳</th>
              <th className="whitespace-nowrap px-2 py-2 font-semibold">追蹤帶入</th>
              <th className="whitespace-nowrap px-2 py-2 font-semibold">狀態</th>
              <th className="whitespace-nowrap px-2 py-2 font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            {[...selectedSeries.versions].reverse().map((item) => {
              const isActive = item.workspace.id === activeBomId;
              const carry = item.version.carry;
              const otherVersions = selectedSeries.versions.filter((candidate) => candidate !== item);
              const compareTarget = item.isCurrent
                ? [...otherVersions].reverse()[0]
                : selectedSeries.current;
              return [
                <tr key={item.workspace.id} data-version-id={item.workspace.id} className={cn("border-t border-border/60 align-top", item.isCurrent && "bg-primary/5")}>
                  <td className="px-2 py-2 whitespace-nowrap"><span className={cn(CHIP, item.isCurrent ? CHIP_TONE.primary : CHIP_TONE.neutral)}>{item.displayNumber}</span></td>
                  <td className="max-w-[22rem] px-2 py-2 text-xs">
                    <p className="font-semibold text-foreground">{item.version.label || <span className="font-normal text-muted-foreground">未設定標籤</span>}</p>
                    {item.version.note && <p className="mt-0.5 whitespace-pre-wrap break-words text-foreground/80">{item.version.note}</p>}
                    {!item.stored && <p className="mt-0.5 text-muted-foreground">版本化前上傳的 BOM</p>}
                  </td>
                  <td className="max-w-[16rem] px-2 py-2 text-xs text-foreground/85"><span className="line-clamp-2 break-all" title={`${item.workspace.payload.sourceFile} · ${item.workspace.payload.sheetName}`}>{item.workspace.payload.sourceFile}</span></td>
                  <td className="px-2 py-2 text-xs tabular-nums text-foreground/85">{item.workspace.payload.recordCount.toLocaleString()}</td>
                  <td className="px-2 py-2 text-xs text-foreground/85"><span className="block">{formatBomTimestamp(item.version.uploadedAt)}</span>{item.version.uploadedBy && <span className="text-muted-foreground">{item.version.uploadedBy}</span>}</td>
                  <td className="px-2 py-2 text-xs">
                    {carry ? (
                      <span className="flex flex-wrap gap-1">
                        <span className={cn(CHIP, CHIP_TONE.success)}>帶入 {carry.matched}</span>
                        {carry.orphaned > 0 && <span className={cn(CHIP, CHIP_TONE.danger)}>未帶入 {carry.orphaned}</span>}
                        {carry.manual > 0 && <span className={cn(CHIP, CHIP_TONE.neutral)}>手動 {carry.manual}</span>}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-2 py-2 text-xs">
                    <span className="flex flex-wrap gap-1">
                      {item.isCurrent ? <span className={cn(CHIP, CHIP_TONE.success)}>目前版本</span> : <span className={cn(CHIP, CHIP_TONE.neutral)}>歷史</span>}
                      {isActive && <span className={cn(CHIP, CHIP_TONE.warning)}>畫面中</span>}
                      {item.version.source ? null : <span className={cn(CHIP, CHIP_TONE.neutral)} title="這個版本沒有保存原始 Excel">無原檔</span>}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap items-center gap-1">
                      {!isActive && <Button type="button" variant="secondary" size="sm" onClick={() => onView(item.workspace.id)} className="h-8 px-2 text-xs lg:h-7">檢視</Button>}
                      {!item.isCurrent && <Button type="button" variant="outline" size="sm" disabled={!canEdit || !ready || pending} onClick={() => onSetCurrent(item, selectedSeries)} className="h-8 px-2 text-xs lg:h-7">設為目前版本</Button>}
                      {compareTarget && <Button type="button" variant="ghost" size="sm" onClick={() => (item.isCurrent ? openDiff(selectedSeries, compareTarget, item) : openDiff(selectedSeries, item, compareTarget))} className="h-8 px-2 text-xs lg:h-7">比對</Button>}
                      <Button type="button" variant="ghost" size="sm" disabled={!canEdit} onClick={() => onOpenPageTracker(item.workspace.id)} className="h-8 px-2 text-xs lg:h-7">頁數</Button>
                      {item.version.source && <Button type="button" variant="ghost" size="sm" onClick={() => onDownloadSource(item)} title={`下載 ${item.version.source.name}`} className="h-8 px-2 text-xs lg:h-7"><Download className="mr-1 h-3.5 w-3.5" />原檔</Button>}
                      {canEdit && <Button type="button" variant="ghost" size="sm" disabled={!ready || pending} onClick={() => setEditingVersionId(editingVersionId === item.workspace.id ? null : item.workspace.id)} className="h-8 px-2 text-xs lg:h-7">編輯說明</Button>}
                      <Button type="button" variant="ghost" size="sm" disabled={!canEdit || !ready || pending} onClick={() => onDeleteVersion(item, selectedSeries)} className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive lg:h-7">刪除</Button>
                    </div>
                  </td>
                </tr>,
                editingVersionId === item.workspace.id && (
                  <tr key={`${item.workspace.id}:edit`}><td colSpan={8} className="px-2 pb-2">
                    <VersionEditor version={item} busy={pending} onCancel={() => setEditingVersionId(null)} onSave={(patch) => void runAction(() => onUpdateVersion(item, selectedSeries, patch), "版本說明已更新").then(() => setEditingVersionId(null))} />
                  </td></tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">歷史版本只能檢視與比對；料件與追蹤只在目前版本維護。上傳新版本時會把目前版本的追蹤依位號與料號帶過去，帶不過去的在差異檢視以「追蹤未帶入」列出。</p>
    </section>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="bom-version-center" className="flex h-[min(92vh,900px)] w-[min(96vw,1500px)] max-w-[min(96vw,1500px)] flex-col gap-3 overflow-hidden p-4 sm:p-5">
        <DialogHeader>
          <DialogTitle className="text-xl">BOM 版本管理</DialogTitle>
          <DialogDescription className="truncate" title={description}>{description}</DialogDescription>
        </DialogHeader>
        {/* Action feedback lives above both modes so an export started from the diff view is acknowledged there too. */}
        {feedback && <p role="status" data-testid="bom-version-feedback" className={cn("rounded-lg border px-3 py-1.5 text-xs", feedback.tone === "ok" ? "border-success/35 bg-success/10 text-success" : "border-destructive/35 bg-destructive/10 text-destructive")}>{feedback.text}</p>}

        {mode === "diff" && diffSeries && diffBefore && diffAfter ? (
          <BomDiffView
            series={diffSeries}
            before={diffBefore}
            after={diffAfter}
            result={diffResult}
            loading={diffLoading}
            error={diffError}
            exporting={exporting}
            onPickBefore={(workspaceId) => setDiffPair((current) => ({ before: workspaceId, after: current?.after === workspaceId ? (current?.before ?? workspaceId) : (current?.after ?? workspaceId) }))}
            onPickAfter={(workspaceId) => setDiffPair((current) => ({ after: workspaceId, before: current?.before === workspaceId ? (current?.after ?? workspaceId) : (current?.before ?? workspaceId) }))}
            onSwap={() => setDiffPair((current) => (current ? { before: current.after, after: current.before } : current))}
            onBack={() => setMode("series")}
            onExport={(visible) => void exportDiff(visible)}
          />
        ) : (
          <div className="grid min-h-0 min-w-0 flex-1 gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
            <aside data-testid="bom-series-list" className={cn("flex min-h-0 min-w-0 flex-col gap-2", compact && mobilePane === "detail" && "hidden")}>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋系列、專案、來源檔或版本說明" aria-label="搜尋 BOM 系列" className="h-10 rounded-xl pl-9 text-sm lg:h-9" />
              </div>
              {canEdit && <Button type="button" variant="outline" size="sm" disabled={!ready || busy} onClick={onUploadNew} className="h-9 justify-start"><Upload className="mr-1.5 h-4 w-4" />上傳 BOM（新系列或新版本）</Button>}
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
                {groups.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{BOM_SERIES_EMPTY_TEXT}</p>
                ) : groups.flatMap((group) => [
                  <div key={`project:${group.key}`} className="flex items-center gap-2 px-1 pt-2 first:pt-0">
                    <Layers3 className="h-3.5 w-3.5 flex-none text-muted-foreground" aria-hidden="true" />
                    <h4 className="min-w-0 truncate text-sm font-bold text-foreground">{group.label}</h4>
                    {group.isActive && <span className={cn(CHIP, "flex-none", CHIP_TONE.success)}>目前專案</span>}
                    <span className="flex-none text-[11px] text-muted-foreground">{group.workspaces.length} 個系列</span>
                  </div>,
                  ...(group.workspaces.length === 0
                    ? [<p key={`empty:${group.key}`} className="rounded-xl border border-dashed border-border px-3 py-3 text-xs text-foreground/75">{canEdit ? "此專案還沒有 BOM。上傳 Excel 會自動歸入目前專案，或在系列詳情把現有系列移進來。" : "此專案還沒有 BOM。請有編輯權限的同事上傳 Excel 或指定專案。"}</p>]
                    : group.workspaces.map((series) => renderSeriesRow(series))),
                ])}
                {archivedSeries.length > 0 && (
                  <section data-testid="bom-archive-section" className="pt-3">
                    <button type="button" onClick={() => setShowArchived((current) => !current)} aria-expanded={showArchived} className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-left text-sm font-semibold text-foreground/80 hover:bg-accent/40">
                      <FileArchive className="h-4 w-4 flex-none text-muted-foreground" aria-hidden="true" />
                      已封存 {archivedSeries.length} 個系列
                      <span className="ml-auto text-xs font-normal text-muted-foreground">{showArchived ? "收合" : "展開"}</span>
                    </button>
                    {showArchived && <div className="mt-1.5 space-y-1.5">{archivedSeries.map((series) => renderSeriesRow(series, true))}</div>}
                  </section>
                )}
              </div>
            </aside>
            <div className={cn("flex min-h-0 min-w-0 flex-col", compact && mobilePane === "list" && "hidden")}>
              {detail ?? <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">左側選一個 BOM 系列，這裡會列出它的版本與操作。</p>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
