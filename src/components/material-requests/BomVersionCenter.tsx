import { recoverableLazy } from "@/components/common/recoverableLazy";
import { Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, CircleAlert, CircleCheck, ClipboardList, Download, FileArchive, FileText, GitCompareArrows, Layers3, LoaderCircle, MoreHorizontal, Pencil, Search, Trash2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { replaceWorkspaceHistory } from "@/lib/workspaceHistory";

import { BomDiffView, type BomDiffViewState } from "./BomDiffView";
import { buildBomPartChanges, diffBomRecords, type BomDiffEntry, type BomDiffResult, type BomPartChangeResult } from "./bomDiff";
import { exportBomDiffExcel } from "./bomDiffExport";
import {
  BOM_DIFF_QUERY_KEYS, BOM_SERIES_NAME_LIMIT, BOM_VERSION_LABEL_LIMIT, BOM_VERSION_NOTE_LIMIT, bomVersionComparePair, findBomSeriesByWorkspace, formatBomVersionTitle,
  type BomSeries, type BomSeriesVersion,
} from "./bomVersioning";
import { CHIP, CHIP_TONE, formatBomRelativeTime, formatBomTimestamp } from "./bomVersionPresentation";
import { groupBomWorkspacesByProject } from "./materialRequestPresentation";
import type { MaterialWorkbookRecord } from "./materialRequestUtils";
import type { NvBomChange } from "./nvBomCompare";
import type { NvBomTableCandidate, NvBomTableLink } from "./nvBomTableMatch";
import type { NvBomCompareSession } from "./NvBomComparePanel";
import { ProjectPartsView } from "./ProjectPartsView";
import "./bomVersionCenter.css";

const UNASSIGNED_VALUE = "__unassigned__";
const NvBomCompare = recoverableLazy(() => import("./NvBomComparePanel"));
export const BOM_SERIES_EMPTY_TEXT = "找不到符合條件的 BOM 系列";

const ACTION_LABELS = {
  rename: "正在儲存系列名稱…",
  project: "正在更新所屬專案…",
  version: "正在儲存版本說明…",
};
type VersionAction = keyof typeof ACTION_LABELS;
type DiffLoad = { key: string; result: BomDiffResult; parts: BomPartChangeResult; error?: never } | { key: string; result?: never; parts?: never; error: string };

function VersionActivity({ children }: { children: string }) {
  return <p role="status" className="bom-version-activity"><LoaderCircle className="bom-version-spinner" aria-hidden="true" />{children}</p>;
}

/** 11/17 14:28 this year, 2025/11/17 14:28 otherwise; the full date and time stay in the label and title. */
function UploadTimestamp({ value, by }: { value: string; by?: string }) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span className="font-semibold text-foreground">{value || "—"}</span>;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const pad = (part: number) => String(part).padStart(2, "0");
  const day = `${sameYear ? "" : `${date.getFullYear()}/`}${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
  return (
    <time dateTime={date.toISOString()} aria-label={formatBomTimestamp(value)} title={[formatBomTimestamp(value), by].filter(Boolean).join(" · ")} className="bom-version-uploaded-at inline-flex whitespace-nowrap tabular-nums">
      <span>{day}</span>
      <span>{pad(date.getHours())}:{pad(date.getMinutes())}</span>
    </time>
  );
}

/** The table scroll hint only shows when the table really is wider than its box. */
function useOverflowX<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") { setOverflowing(false); return; }
    const update = () => setOverflowing(node.scrollWidth > node.clientWidth + 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, overflowing] as const;
}

/** Rare and destructive version actions, each with its word: 頁數進度, 下載原檔, 編輯說明, 刪除版本. */
function VersionMoreMenu({ item, canEdit, ready, pending, onPages, onDownload, onEdit, onDelete }: {
  item: BomSeriesVersion;
  canEdit: boolean;
  ready: boolean;
  pending: boolean;
  onPages: () => void;
  onDownload: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const source = item.version.source;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" aria-label={`${item.displayNumber} 更多操作`} title={`${item.displayNumber}：頁數進度、下載原檔、編輯說明、刪除版本`} className="bom-version-more">
          <MoreHorizontal aria-hidden="true" />更多
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bom-version-menu">
        <DropdownMenuItem disabled={!canEdit} onSelect={onPages} title={`記錄 ${item.displayNumber} 每一頁的建料進度`}><FileText aria-hidden="true" />頁數進度</DropdownMenuItem>
        <DropdownMenuItem disabled={!source} onSelect={onDownload} title={source ? `下載上傳時的原始 Excel：${source.name}` : "這個版本上傳時沒有保存原始 Excel"}><Download aria-hidden="true" />{source ? "下載原檔" : "下載原檔（沒有保存）"}</DropdownMenuItem>
        {canEdit && <DropdownMenuItem disabled={!ready || pending} onSelect={onEdit} title={`修改 ${item.displayNumber} 的版本標籤與說明`}><Pencil aria-hidden="true" />編輯說明</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!canEdit || !ready || pending} onSelect={onDelete} title={`永久刪除 ${item.displayNumber}（會先確認）`} className="bom-version-menu-danger"><Trash2 aria-hidden="true" />刪除版本</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
  historyAccountId?: string;
  projects: Array<{ id: string; name: string }>;
  projectNames: ReadonlyMap<string, string>;
  seriesList: BomSeries[];
  exportedBy: string;
  loadRecords: (workspaceId: string) => Promise<MaterialWorkbookRecord[]>;
  currentBomName?: string;
  matchCurrentBom?: (change: NvBomChange) => NvBomTableLink;
  onLocateCurrentBom?: (candidate: NvBomTableCandidate) => boolean;
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
  /** Opens straight into a comparison (the 查看差異 action after an upload). A new token opens it again. */
  diffRequest?: BomDiffRequest | null;
  /** Shows a compared part in the material table so what did not carry over can be filled in; false when it cannot be found. */
  onLocateDiffEntry?: (target: BomDiffLocateTarget) => boolean;
  /** 帶入舊版資料: fills the older version's website data into the current version's matching rows. */
  onRecarry?: (target: { series: BomSeries; before: BomSeriesVersion; after: BomSeriesVersion }) => Promise<{ filled: number; remaining: number }>;
}

export interface BomDiffLocateTarget {
  workspaceId: string;
  record: MaterialWorkbookRecord;
  /** The comparison to reopen from the table's 返回比對. */
  returnTo: Omit<BomDiffRequest, "token">;
}

export interface BomDiffRequest {
  token: number;
  seriesId: string;
  before: string;
  after: string;
  /** Start with 只看未帶入 when the upload left website data behind. */
  lostOnly?: boolean;
  /** 返回比對 from the material table: the filters and open part the user left with. */
  view?: BomDiffViewState;
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

function VersionEditor({ version, busy, saving, onSave, onCancel }: { version: BomSeriesVersion; busy: boolean; saving: boolean; onSave: (patch: { label: string; note: string }) => void; onCancel: () => void }) {
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
        <Button type="button" size="sm" disabled={busy} aria-busy={saving || undefined} onClick={() => onSave({ label: label.trim(), note: note.trim() })} className="h-9 min-w-24">{saving && <LoaderCircle className="bom-version-spinner" aria-hidden="true" />}{saving ? "儲存中…" : "儲存"}</Button>
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
    open, onOpenChange, canEdit, ready, busy = false, activeBomId, activeProjectId, activeProjectName, historyAccountId, projects, projectNames, seriesList, exportedBy,
    loadRecords, currentBomName, matchCurrentBom, onLocateCurrentBom, onView, onSetCurrent, onUploadVersion, onUploadNew, onAssignProject, onRenameSeries, onUpdateVersion, onSetArchived, onDeleteVersion, onDeleteSeries, onOpenPageTracker, onDownloadSource,
    diffRequest, onLocateDiffEntry, onRecarry,
  } = props;
  const [tableScrollRef, tableOverflows] = useOverflowX<HTMLDivElement>();
  const compact = useCompact();
  const [query, setQuery] = useState("");
  const [collapsedProjects, setCollapsedProjects] = useState<string[]>([]);
  const projectGroupId = useId();
  const [showArchived, setShowArchived] = useState(false);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"list" | "detail">("list");
  const [mode, setMode] = useState<"series" | "diff" | "nv" | "parts">("series");
  /** 專案總料表: the project whose boards are merged. */
  const [partsProjectId, setPartsProjectId] = useState<string | null>(null);
  const [nvVisited, setNvVisited] = useState(false);
  const [nvBomTargetId, setNvBomTargetId] = useState<string | null>(null);
  const historyScope = historyAccountId ? JSON.stringify([historyAccountId, activeProjectId ?? null]) : undefined;
  const [nvSession, setNvSession] = useState<{ scope: string | undefined; session: NvBomCompareSession }>();
  const nvLocateClosing = useRef(false);
  const [diffPair, setDiffPair] = useState<{ before: string; after: string } | null>(null);
  const [diffLoad, setDiffLoad] = useState<DiffLoad | null>(null);
  const [exporting, setExporting] = useState(false);
  const [recarrying, setRecarrying] = useState(false);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [pendingAction, setPendingAction] = useState<VersionAction | null>(null);
  const pending = pendingAction !== null;
  const [feedback, setFeedback] = useState<{ view: "series" | "diff"; tone: "ok" | "error"; text: string } | null>(null);
  const recordsCache = useRef(new Map<string, Promise<MaterialWorkbookRecord[]>>());

  const activeSeries = useMemo(() => findBomSeriesByWorkspace(seriesList, activeBomId), [seriesList, activeBomId]);
  const liveSeries = useMemo(() => seriesList.filter((series) => !series.archive), [seriesList]);
  const archivedSeries = useMemo(() => seriesList.filter((series) => Boolean(series.archive)), [seriesList]);
  const selectedSeries = seriesList.find((series) => series.id === selectedSeriesId) ?? activeSeries?.series ?? liveSeries[0] ?? null;
  const totalVersions = seriesList.reduce((sum, series) => sum + series.versions.length, 0);
  const selectedProjectName = selectedSeries?.project
    ? projectNames.get(selectedSeries.project.projectId) || selectedSeries.project.projectName || "未指定專案"
    : "未指定專案";
  const description = mode === "parts" ? "合併專案所有 BOM 的目前版本，篩選、匯出，並轉成 PJE 備料表。" : mode === "nv" ? "比較兩份 NV 原始 BOM，查看實際變更並定位目前料號申請表。"
    : `工作區專案：${activeProjectName ?? "未選擇"} · 所選 BOM 專案：${selectedProjectName} · 全部 ${seriesList.length} 個系列 · ${totalVersions} 個版本${archivedSeries.length > 0 ? ` · 已封存 ${archivedSeries.length} 個` : ""} · 使用中：${activeSeries ? `${activeSeries.series.name} ${activeSeries.version.displayNumber}` : "未選擇"}`;
  const nvCompareButton = <Button type="button" variant="outline" size="sm" data-testid="bom-nv-compare-entry" onClick={() => { setNvBomTargetId(activeBomId); setNvVisited(true); setMode("nv"); }} title="另選兩份 NV 原始 Excel 比對，不受此系列版本數限制" className="bom-nv-compare-entry h-9 gap-2 border-primary/40 text-primary"><GitCompareArrows aria-hidden="true" className="h-4 w-4" />NV 原始 BOM 比對</Button>;
  const nvCanLocateCurrentBom = nvBomTargetId === activeBomId;
  const locateNvResult = (candidate: NvBomTableCandidate, session: NvBomCompareSession) => {
    if (!nvCanLocateCurrentBom || !onLocateCurrentBom?.(candidate)) return;
    setNvSession({ scope: historyScope, session });
    nvLocateClosing.current = true;
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) return;
    setMode(nvSession && nvSession.scope === historyScope && nvCanLocateCurrentBom ? "nv" : "series");
    if (!nvCanLocateCurrentBom || nvSession?.scope !== historyScope) setNvSession(undefined);
    setDiffPair(null);
    setDiffLoad(null);
    setEditingVersionId(null);
    setRenaming(false);
    setFeedback(null);
    setMobilePane("list");
    setCollapsedProjects([]);
    setSelectedSeriesId(activeSeries?.series.id ?? null);
    recordsCache.current.clear();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setCollapsedProjects([]); }, [query]);
  // Runs after the reset above in the same commit, so an upload's 查看差異 lands directly on its comparison.
  const consumedDiffRequest = useRef<number | null>(null);
  const [diffAttempt, setDiffAttempt] = useState(0);
  const [diffViewSeed, setDiffViewSeed] = useState<{ token: number; lostOnly: boolean; view?: BomDiffViewState }>({ token: 0, lostOnly: false });
  useEffect(() => {
    if (!open || !diffRequest || consumedDiffRequest.current === diffRequest.token) return;
    const series = seriesList.find((item) => item.id === diffRequest.seriesId);
    if (!series?.versions.some((item) => item.workspace.id === diffRequest.before) || !series.versions.some((item) => item.workspace.id === diffRequest.after)) return;
    consumedDiffRequest.current = diffRequest.token;
    setSelectedSeriesId(series.id);
    // ← 返回系列 on a phone lands on this series' versions, not the series list.
    setMobilePane("detail");
    // Keep a finished result for the same pair; a failed one is retried through diffAttempt.
    setDiffLoad((current) => (current?.error ? null : current));
    setDiffAttempt((current) => current + 1);
    setDiffPair({ before: diffRequest.before, after: diffRequest.after });
    setDiffViewSeed({ token: diffRequest.token, lostOnly: Boolean(diffRequest.lostOnly), view: diffRequest.view });
    setMode("diff");
  }, [open, diffRequest, seriesList]);

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
  const latestCachedRecords = useRef(cachedRecords);
  latestCachedRecords.current = cachedRecords;
  const loadPartsVersion = useCallback((version: BomSeriesVersion) => latestCachedRecords.current(version), []);
  // Every live series of a project, whatever the search box hides: the merged list is the whole project.
  const liveSeriesByProject = useMemo(() => {
    const byProject = new Map<string, BomSeries[]>();
    for (const series of liveSeries) if (series.project?.projectId) byProject.set(series.project.projectId, [...(byProject.get(series.project.projectId) ?? []), series]);
    return byProject;
  }, [liveSeries]);
  // The same boards keep the same list object: an edit elsewhere in the workspace does not rebuild the merge.
  const partsSeriesRef = useRef<{ key: string; series: BomSeries[] }>({ key: "", series: [] });
  const partsSeries = useMemo(() => {
    const next = partsProjectId ? liveSeriesByProject.get(partsProjectId) ?? [] : [];
    const key = next.map((series) => `${series.id}:${series.name}:${series.current.workspace.id}:${series.current.workspace.updatedAt}`).join("|");
    if (partsSeriesRef.current.key !== key) partsSeriesRef.current = { key, series: next };
    return partsSeriesRef.current.series;
  }, [liveSeriesByProject, partsProjectId]);
  const partsProjectName = partsProjectId ? projectNames.get(partsProjectId) || partsSeries[0]?.project?.projectName || "專案" : "";
  const openProjectParts = (projectId: string) => { setPartsProjectId(projectId); setFeedback(null); setMode("parts"); };

  const openDiff = (series: BomSeries, before: BomSeriesVersion, after: BomSeriesVersion, options: { lostOnly?: boolean } = {}) => {
    setSelectedSeriesId(series.id);
    if (diffLoad?.error) { setDiffLoad(null); setDiffAttempt((current) => current + 1); }
    // A link that is still waiting (e.g. to versions that no longer exist) gives way to what the user picked.
    if (diffRequest) consumedDiffRequest.current = diffRequest.token;
    setDiffPair({ before: before.workspace.id, after: after.workspace.id });
    // 未帶入 in the version table opens straight on 只看未帶入; a fresh token remounts the view with it.
    if (options.lostOnly) setDiffViewSeed((current) => ({ token: current.token + 1, lostOnly: true }));
    else setDiffViewSeed((current) => (current.lostOnly || current.view ? { token: current.token, lostOnly: false } : current));
    setMode("diff");
  };

  const diffSeries = selectedSeries;
  const diffBefore = diffSeries?.versions.find((item) => item.workspace.id === diffPair?.before) ?? null;
  const diffAfter = diffSeries?.versions.find((item) => item.workspace.id === diffPair?.after) ?? null;
  const diffKey = diffBefore && diffAfter && JSON.stringify([diffBefore.workspace.id, diffBefore.workspace.updatedAt, diffAfter.workspace.id, diffAfter.workspace.updatedAt]);
  const currentDiff = diffLoad?.key === diffKey ? diffLoad : null;
  const diffResult = currentDiff?.result ?? null;
  useEffect(() => {
    if (!open || mode !== "diff" || !diffKey || !diffBefore || !diffAfter) return;
    let current = true;
    Promise.all([cachedRecords(diffBefore), cachedRecords(diffAfter)])
      .then(([beforeRecords, afterRecords]) => {
        if (current) setDiffLoad({ key: diffKey, result: diffBomRecords(beforeRecords, afterRecords), parts: buildBomPartChanges(beforeRecords, afterRecords) });
      })
      .catch((error) => {
        if (current) setDiffLoad({ key: diffKey, error: error instanceof Error ? error.message : "載入版本料件失敗，請稍後再試。" });
      });
    return () => { current = false; };
  }, [open, mode, diffKey, diffAttempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mirror the open comparison and its 只看未帶入 condition into the URL; leaving the comparison or closing the window clears them.
  const [diffLostOnly, setDiffLostOnly] = useState(false);
  const urlTouched = useRef(false);
  const showingDiff = open && mode === "diff" && Boolean(diffSeries && diffBefore && diffAfter);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (open) urlTouched.current = true;
    else if (!urlTouched.current) return;
    // A request (an upload's 查看差異 or a shared link) is still waiting for its versions to load: keep its URL as is.
    // Closing the window clears it either way, so a link to versions that no longer exist cannot reopen it again.
    if (open && diffRequest && consumedDiffRequest.current !== diffRequest.token) return;
    if (!open) {
      urlTouched.current = false;
      // Closing drops a request that never found its versions, so reopening the window works normally.
      if (diffRequest) consumedDiffRequest.current = diffRequest.token;
    }
    const url = new URL(window.location.href);
    const values: Record<(typeof BOM_DIFF_QUERY_KEYS)[number], string> = {
      bomDiff: showingDiff ? diffSeries!.id : "",
      bomBefore: showingDiff ? diffBefore!.workspace.id : "",
      bomAfter: showingDiff ? diffAfter!.workspace.id : "",
      bomDiffLost: showingDiff && diffLostOnly ? "1" : "",
    };
    for (const key of BOM_DIFF_QUERY_KEYS) {
      if (values[key]) url.searchParams.set(key, values[key]);
      else url.searchParams.delete(key);
    }
    if (url.href !== window.location.href) replaceWorkspaceHistory(url);
  }, [open, showingDiff, diffSeries?.id, diffBefore?.workspace.id, diffAfter?.workspace.id, diffLostOnly, diffRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  // A compared part can be shown in the material table when the new side is the version people edit (or the one on screen).
  const canLocateDiff = Boolean(onLocateDiffEntry && diffAfter && (diffAfter.isCurrent || diffAfter.workspace.id === activeBomId));
  // 補填 only where something can be filled in: the current version, by someone who may edit.
  const canFillDiff = canLocateDiff && Boolean(diffAfter?.isCurrent) && canEdit;
  const locateDiffEntry = (entry: BomDiffEntry, view: BomDiffViewState) => {
    // A part that moved to another location is shown where it now sits.
    const record = entry.lines.find((line) => line.after)?.after ?? entry.lines.find((line) => line.movedRecord)?.movedRecord;
    if (!record || !onLocateDiffEntry || !diffSeries || !diffBefore || !diffAfter) return;
    const located = onLocateDiffEntry({ workspaceId: diffAfter.workspace.id, record, returnTo: { seriesId: diffSeries.id, before: diffBefore.workspace.id, after: diffAfter.workspace.id, lostOnly: view.filters.trackingLostOnly, view } });
    if (!located) return;
    nvLocateClosing.current = true;
    onOpenChange(false);
  };

  const runAction = async (kind: VersionAction, action: () => Promise<void>, success: string) => {
    setPendingAction(kind);
    setFeedback(null);
    try {
      await action();
      setFeedback({ view: "series", tone: "ok", text: success });
      return true;
    } catch (error) {
      setFeedback({ view: "series", tone: "error", text: error instanceof Error ? error.message : "操作失敗，請稍後再試。" });
      return false;
    } finally {
      setPendingAction(null);
    }
  };

  // 帶入舊版資料 only from the version the new one was uploaded over (what its 未帶入 count is measured against).
  const recarryPair = Boolean(diffBefore && diffAfter && diffAfter.version.previousWorkspaceId === diffBefore.workspace.id);
  const recarryBlocked = !recarryPair || !diffAfter ? undefined
    : !diffAfter.isCurrent ? `${diffAfter.displayNumber} 不是目前版本，只能帶入目前版本。`
      : !onRecarry || !canEdit ? "你沒有編輯權限，請有權限的同事帶入。"
        : !ready ? "共用資料尚未連線，連線後才能帶入。"
          : undefined;
  const recarry = async () => {
    if (!onRecarry || !diffSeries || !diffBefore || !diffAfter) return;
    setRecarrying(true);
    setFeedback(null);
    try {
      const { filled, remaining } = await onRecarry({ series: diffSeries, before: diffBefore, after: diffAfter });
      // Compare again from the saved rows, even when the version's timestamp did not move.
      recordsCache.current.clear();
      setDiffLoad(null);
      setDiffAttempt((current) => current + 1);
      setFeedback({ view: "diff", tone: "ok", text: filled > 0
        ? `已把 ${diffBefore.displayNumber} 的資料帶入 ${diffAfter.displayNumber} ${filled.toLocaleString()} 筆${remaining > 0 ? `；另有 ${remaining.toLocaleString()} 筆在新版找不到同一顆料，請到料號表補填` : ""}`
        : "沒有需要帶入的資料：新版的同一顆料都已經有自己的資料" });
    } catch (error) {
      setFeedback({ view: "diff", tone: "error", text: error instanceof Error ? error.message : "帶入失敗，資料沒有變更，請稍後再試。" });
      // Some rows may have been written before the failure: compare again from what is saved.
      recordsCache.current.clear();
      setDiffLoad(null);
      setDiffAttempt((current) => current + 1);
    } finally {
      setRecarrying(false);
    }
  };

  const exportDiff = async (visibleEntries: BomDiffEntry[]) => {
    if (!diffResult || !diffSeries || !diffBefore || !diffAfter) return;
    setExporting(true);
    setFeedback(null);
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
      setFeedback({ view: "diff", tone: "ok", text: `已匯出 ${fileName}` });
    } catch (error) {
      setFeedback({ view: "diff", tone: "error", text: error instanceof Error ? error.message : "差異 Excel 匯出失敗。" });
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
        data-active={isActive}
        className={cn(
          "bom-series-row flex w-full flex-col gap-1 rounded-xl border px-3 py-2 text-left transition-colors",
          isSelected ? "border-primary/50 bg-primary/10" : "border-border bg-background/40 hover:bg-accent/40",
          archived && "opacity-75",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={series.name}>{series.name}</p>
          <span className={cn(CHIP, "h-6 min-w-9 flex-none justify-center font-mono text-sm font-bold tabular-nums", CHIP_TONE.primary)}>{series.current.displayNumber}</span>
          {isActive && <span className={cn(CHIP, "flex-none", activeSeries?.version.isCurrent ? CHIP_TONE.success : CHIP_TONE.warning)} title={activeSeries?.version.isCurrent ? "料號表正在顯示這個系列的目前版本" : `料號表正在唯讀顯示 ${activeSeries?.version.displayNumber}（歷史版本）`}>{activeSeries?.version.isCurrent ? "畫面中" : `畫面中 ${activeSeries?.version.displayNumber}`}</span>}
          {archived && <span className={cn(CHIP, "flex-none", CHIP_TONE.neutral)}>已封存</span>}
        </div>
        <div className="bom-series-metadata"><span>{series.versions.length} 個版本</span><span>{series.recordCount.toLocaleString()} 筆</span><span>更新 {formatBomRelativeTime(series.updatedAt)}</span></div>
      </button>
    );
  };

  const detail = selectedSeries && (
    <section key={selectedSeries.id} data-testid="bom-series-detail" className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      {compact && <Button type="button" variant="ghost" size="sm" onClick={() => setMobilePane("list")} className="h-10 w-fit px-2 text-sm lg:hidden"><ArrowLeft className="mr-1 h-4 w-4" />返回清單</Button>}
      <div className="bom-series-summary flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input value={renameDraft} maxLength={BOM_SERIES_NAME_LIMIT} aria-label="系列名稱" disabled={pending} onChange={(event) => setRenameDraft(event.target.value)} className="h-9 max-w-[24rem] text-sm" />
              <Button type="button" size="sm" disabled={pending || !renameDraft.trim()} aria-busy={pendingAction === "rename" || undefined} onClick={() => void runAction("rename", () => onRenameSeries(selectedSeries, renameDraft.trim()), "系列名稱已更新").then(saved => { if (saved) setRenaming(false); })} className="h-9 min-w-24">{pendingAction === "rename" && <LoaderCircle className="bom-version-spinner" aria-hidden="true" />}{pendingAction === "rename" ? "儲存中…" : "儲存名稱"}</Button>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setRenaming(false)} className="h-9">取消</Button>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="min-w-0 truncate text-lg font-bold text-foreground" title={selectedSeries.name}>{selectedSeries.name}</h3>
              {canEdit && <Button type="button" variant="ghost" size="sm" aria-label="修改系列名稱" title="修改系列名稱" onClick={() => { setRenameDraft(selectedSeries.name); setRenaming(true); }} className="h-8 w-8 p-0"><Pencil className="h-3.5 w-3.5" /></Button>}
            </div>
          )}
          <div className="bom-series-summary-meta"><span className="bom-current-version">目前版本 {selectedSeries.current.displayNumber}</span><span>{selectedSeries.versions.length} 個版本</span><span>{selectedSeries.recordCount.toLocaleString()} 筆</span></div>
        </div>
        <div className="bom-series-project">
        <Label htmlFor={`${projectGroupId}-assignment`}>此 BOM 所屬專案</Label>
        <Select value={selectedSeries.project?.projectId ?? UNASSIGNED_VALUE} disabled={!canEdit || !ready || pending} onValueChange={(value) => void runAction("project", () => onAssignProject(selectedSeries, value === UNASSIGNED_VALUE ? null : value), "專案歸屬已更新")}>
          <SelectTrigger id={`${projectGroupId}-assignment`} aria-label={`${selectedSeries.name} 所屬專案`} aria-busy={pendingAction === "project" || undefined} className="h-9 w-[12rem] text-sm"><SelectValue placeholder="指定專案" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED_VALUE}>未指定專案</SelectItem>
            {(selectedSeries.project && !projects.some((project) => project.id === selectedSeries.project?.projectId) ? [...projects, { id: selectedSeries.project.projectId, name: selectedSeries.project.projectName }] : projects).map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
          </SelectContent>
        </Select>
        </div>
      </div>

      <div className="bom-series-actions flex flex-wrap items-center gap-1.5">
        <Button type="button" size="sm" disabled={!canEdit || !ready || busy} aria-busy={busy || undefined} onClick={() => onUploadVersion(selectedSeries)} title={`將新版 Excel 加入「${selectedSeries.name}」，保留既有版本與追蹤`} className="bom-version-action-upload h-9"><Upload aria-hidden="true" className="h-4 w-4" />上傳此系列新版</Button>
        <div className="bom-version-compare-actions" role="group" aria-label="BOM 比對工具">
        <Button type="button" variant="outline" size="sm" disabled={selectedSeries.versions.length < 2} title={selectedSeries.versions.length < 2 ? "需要兩個以上版本才能比對" : "比對目前版本與前一版，列出新增、移除與改料"} onClick={() => {
          const pair = bomVersionComparePair(selectedSeries);
          if (pair) openDiff(selectedSeries, pair.before, pair.after);
        }} className="bom-version-action-compare h-9"><GitCompareArrows aria-hidden="true" className="h-4 w-4" />比對版本</Button>
        {nvCompareButton}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" disabled={!canEdit || !ready || pending} onClick={() => onSetArchived(selectedSeries, !selectedSeries.archive)} title={selectedSeries.archive ? "回到清單" : "整個系列移到封存區，資料保留"} className="bom-version-action-archive h-9 text-sm">{selectedSeries.archive ? "解除封存" : "封存系列"}</Button>
          <Button type="button" variant="ghost" size="sm" disabled={!canEdit || !ready || pending} onClick={() => onDeleteSeries(selectedSeries)} className="h-9 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive">刪除系列</Button>
        </div>
      </div>

      {(() => {
        const versions = [...selectedSeries.versions].reverse();
        const describe = (item: BomSeriesVersion) => {
          const isActive = item.workspace.id === activeBomId;
          const carry = item.version.carry;
          // 未帶入 was counted against the version this one was uploaded over.
          const previousVersion = selectedSeries.versions.find((candidate) => candidate.workspace.id === item.version.previousWorkspaceId);
          const comparePair = bomVersionComparePair(selectedSeries, item);
          const compareOther = comparePair && (comparePair.before === item ? comparePair.after : comparePair.before);
          const carriedCount = carry?.tracked ?? carry?.matched ?? 0;
          const carryTitle = carry ? (carry.tracked === undefined
            ? `${carry.matched} 筆料件對上前一版（這個版本建立時尚未分開統計有帶入資料的筆數）`
            : `${carry.matched} 筆料件對上前一版，其中 ${carry.tracked} 筆的追蹤、Note、負責人或 SPEC 附件已帶入`) + (carry.orphaned > 0 ? `；${carry.orphaned} 筆舊版資料找不到對應料件，可在比對中查看` : "") : "";
          const editing = editingVersionId === item.workspace.id;
          const statusChips = <>
            {item.isCurrent ? <span className={cn(CHIP, CHIP_TONE.success)}>目前版本</span> : <span className={cn(CHIP, CHIP_TONE.neutral)}>歷史</span>}
            {isActive && <span className={cn(CHIP, CHIP_TONE.warning)} title="料號表正在顯示這個版本">畫面中</span>}
          </>;
          const carryChips = carry ? (
            <span className="bom-version-chip-row flex gap-1" title={carryTitle}>
              <span className={cn(CHIP, carry.tracked === undefined ? CHIP_TONE.neutral : CHIP_TONE.success)}>{carry.tracked === undefined ? "對上" : "帶入"} {carriedCount}</span>
              {carry.orphaned > 0 && (previousVersion
                ? <button type="button" data-testid="bom-version-orphaned" onClick={() => openDiff(selectedSeries, previousVersion, item, { lostOnly: true })} title={`打開 ${previousVersion.displayNumber} → ${item.displayNumber} 比對，只看沒有帶到新版的資料`} className={cn(CHIP, CHIP_TONE.danger, "cursor-pointer hover:bg-destructive/25")}>未帶入 {carry.orphaned}</button>
                : <span className={cn(CHIP, CHIP_TONE.danger)}>未帶入 {carry.orphaned}</span>)}
              {carry.manual > 0 && <span className={cn(CHIP, CHIP_TONE.neutral)} title="網站上手動新增、新版 Excel 沒有的料件，已保留到這一版">手動 {carry.manual}</span>}
            </span>
          ) : null;
          const labelNote = (
            <span className="bom-version-label-note" title={[item.version.label || "未設定標籤", item.version.note, !item.stored ? "版本化前上傳的 BOM" : ""].filter(Boolean).join(" · ")}>
              <strong className={cn("font-semibold", item.version.label ? "text-foreground" : "font-normal text-muted-foreground")}>{item.version.label || "未設定標籤"}</strong>
              {item.version.note && <span className="text-foreground/80">{item.version.note}</span>}
              {!item.stored && <span className="text-muted-foreground">版本化前上傳的 BOM</span>}
            </span>
          );
          const source = (
            <span className="bom-version-source" title={`${item.workspace.payload.sourceFile} · ${item.workspace.payload.sheetName} · ${item.workspace.payload.recordCount.toLocaleString()} 筆`}>
              <span className="bom-version-source-file">{item.workspace.payload.sourceFile}</span>
              <span className="bom-version-record-count">{item.workspace.payload.recordCount.toLocaleString()} 筆</span>
            </span>
          );
          const uploaded = <span className="bom-version-upload"><UploadTimestamp value={item.version.uploadedAt} by={item.version.uploadedBy} />{item.version.uploadedBy && <span className="bom-version-uploader text-muted-foreground" title={item.version.uploadedBy}>{item.version.uploadedBy}</span>}</span>;
          // Fixed slots: 檢視, 設為目前版本 and 比對 line up on every row even when a row has no 檢視 or 設為目前版本.
          const actions = <>
            <span className="bom-version-slot">{!isActive && <Button type="button" variant="secondary" size="sm" onClick={() => onView(item.workspace.id)} title={item.isCurrent ? "回到目前版本的料號表" : `在料號表唯讀查看 ${item.displayNumber}`}>檢視</Button>}</span>
            <span className="bom-version-slot">{!item.isCurrent && <Button type="button" variant="outline" size="sm" disabled={!canEdit || !ready || pending} onClick={() => onSetCurrent(item, selectedSeries)} title={`讓所有人改用 ${item.displayNumber} 維護料件與追蹤`}>設為目前版本</Button>}</span>
            <span className="bom-version-slot">{comparePair && compareOther && <Button type="button" variant="ghost" size="sm" onClick={() => openDiff(selectedSeries, comparePair.before, comparePair.after)} title={`比對 ${comparePair.before.displayNumber}（舊）與 ${comparePair.after.displayNumber}（新）`} className="bom-version-compare">比對 {compareOther.displayNumber}</Button>}</span>
            <VersionMoreMenu item={item} canEdit={canEdit} ready={ready} pending={pending}
              onPages={() => onOpenPageTracker(item.workspace.id)}
              onDownload={() => onDownloadSource(item)}
              onEdit={() => setEditingVersionId(item.workspace.id)}
              onDelete={() => onDeleteVersion(item, selectedSeries)} />
          </>;
          const editor = editing && <VersionEditor version={item} busy={pending} saving={pendingAction === "version"} onCancel={() => setEditingVersionId(null)} onSave={(patch) => void runAction("version", () => onUpdateVersion(item, selectedSeries, patch), "版本說明已更新").then(saved => { if (saved) setEditingVersionId(null); })} />;
          return { item, statusChips, carryChips, labelNote, source, uploaded, actions, editor };
        };
        if (compact) return (
          // Phone: one card per version, every action with its word, nothing hidden off to the side.
          <ol data-testid="bom-version-cards" className="bom-version-cards" aria-label={`${selectedSeries.name} 的版本`}>
            {versions.map((version) => {
              const { item, statusChips, carryChips, labelNote, source, uploaded, actions, editor } = describe(version);
              return (
                <li key={item.workspace.id} data-version-id={item.workspace.id} data-current={item.isCurrent} className="bom-version-card">
                  <div className="bom-version-card-head">
                    <span className="bom-version-number" data-current={item.isCurrent}>{item.displayNumber}</span>
                    <span className="bom-version-chip-row flex min-w-0 gap-1">{statusChips}</span>
                    {carryChips}
                  </div>
                  <div className="bom-version-card-body">{labelNote}{source}{uploaded}</div>
                  <div className="bom-version-row-actions bom-version-card-actions">{actions}</div>
                  {editor}
                </li>
              );
            })}
          </ol>
        );
        return (
          <div ref={tableScrollRef} className="bom-version-table-scroll min-h-0 flex-1 overflow-auto rounded-xl border border-border" role="region" tabIndex={0} aria-label={tableOverflows ? "版本表格，可橫向捲動查看完整欄位" : "版本表格"}>
            <table data-testid="bom-version-table" className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-card text-left text-xs text-muted-foreground">
                <tr>
                  <th className="bom-version-col-version whitespace-nowrap px-2 py-2 font-semibold">版本</th>
                  <th className="bom-version-col-label whitespace-nowrap px-2 py-2 font-semibold">標籤／說明</th>
                  <th className="bom-version-col-source whitespace-nowrap px-2 py-2 font-semibold">來源檔</th>
                  <th className="bom-version-col-fit whitespace-nowrap px-2 py-2 font-semibold">上傳</th>
                  <th className="bom-version-col-fit whitespace-nowrap px-2 py-2 font-semibold">追蹤帶入</th>
                  <th className="bom-version-col-fit whitespace-nowrap px-2 py-2 font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((version) => {
                  const { item, statusChips, carryChips, labelNote, source, uploaded, actions, editor } = describe(version);
                  return [
                    <tr key={item.workspace.id} data-version-id={item.workspace.id} data-current={item.isCurrent} className="border-t border-border/60 align-top">
                      <td className="px-2 py-2 whitespace-nowrap"><span className="bom-version-cell-version"><span className="bom-version-number" data-current={item.isCurrent}>{item.displayNumber}</span><span className="bom-version-chip-row flex gap-1">{statusChips}</span></span></td>
                      <td className="bom-version-col-label px-2 py-2 text-xs">{labelNote}</td>
                      <td className="bom-version-col-source px-2 py-2 text-xs text-foreground/85">{source}</td>
                      <td className="px-2 py-2 text-xs">{uploaded}</td>
                      <td className="px-2 py-2 text-xs">{carryChips ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-2 py-1.5"><div className="bom-version-row-actions">{actions}</div></td>
                    </tr>,
                    editor && <tr key={`${item.workspace.id}:edit`}><td colSpan={6} className="px-2 pb-2">{editor}</td></tr>,
                  ];
                })}
              </tbody>
            </table>
          </div>
        );
      })()}
      <p className="bom-version-footnote text-xs text-muted-foreground"><strong>歷史版本唯讀</strong><span>料件與追蹤在目前版本維護，只能在目前版本修改。</span>{tableOverflows && !compact && <span className="bom-version-scroll-hint">← 左右捲動查看完整欄位 →</span>}</p>
    </section>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="bom-version-center" data-view={mode} data-mobile-pane={mobilePane} className="bom-version-center flex flex-col overflow-hidden" onCloseAutoFocus={event => {
        if (!nvLocateClosing.current) return;
        nvLocateClosing.current = false;
        event.preventDefault();
      }}>
        <DialogHeader className="bom-version-header">
          <div className="flex flex-wrap items-center gap-3"><DialogTitle className="text-xl">{mode === "nv" ? "NV 原始 BOM 比對" : mode === "parts" ? "專案總料表" : "BOM 版本管理"}</DialogTitle>{mode !== "nv" && mode !== "parts" && !selectedSeries && nvCompareButton}</div>
          <DialogDescription className="sr-only">{description}</DialogDescription>
          {mode !== "nv" && mode !== "parts" && <div className="bom-version-overview">{selectedSeries && <span className="bom-version-project" title={`「${selectedSeries.name}」所屬專案：${selectedProjectName}`}><Layers3 aria-hidden="true" />所選 BOM 專案：{selectedProjectName}</span>}<span className="bom-version-workspace" title="目前工作區的導覽專案，不會改變所選 BOM 的專案歸屬">工作區專案：{activeProjectName ?? "未選擇"}</span><span>全部 {seriesList.length} 個系列</span><span>{totalVersions} 個版本</span>{archivedSeries.length > 0 && <span className="bom-version-archived">已封存 {archivedSeries.length} 個</span>}</div>}
        </DialogHeader>
        {feedback?.view === mode && <p role={feedback.tone === "ok" ? "status" : "alert"} data-testid="bom-version-feedback" data-tone={feedback.tone} className="bom-version-feedback">{feedback.tone === "ok" ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}<span>{feedback.text}</span></p>}
        {pendingAction && mode === "series" && <VersionActivity>{ACTION_LABELS[pendingAction]}</VersionActivity>}
        {busy && mode === "series" && <VersionActivity>正在讀取 BOM 檔案…</VersionActivity>}

        {nvVisited && <Suspense fallback={mode === "nv" ? <VersionActivity>正在開啟 NV 原始 BOM 比對…</VersionActivity> : null}>
          <NvBomCompare key={JSON.stringify([historyScope, nvBomTargetId])} active={open && mode === "nv"} onBack={() => setMode("series")} currentBomName={currentBomName}
            historyScope={historyScope}
            initialSession={nvCanLocateCurrentBom && nvSession?.scope === historyScope ? nvSession?.session : undefined}
            matchCurrentBom={nvCanLocateCurrentBom ? matchCurrentBom : undefined}
            onLocateCurrentBom={nvCanLocateCurrentBom && onLocateCurrentBom ? locateNvResult : undefined} />
        </Suspense>}
        {mode === "nv" ? null : mode === "parts" ? (
          partsSeries.length > 0
            ? <ProjectPartsView key={partsProjectId ?? ""} projectName={partsProjectName} series={partsSeries} loadVersion={loadPartsVersion} exportedBy={exportedBy} compact={compact} onBack={() => setMode("series")} />
            : <div className="project-parts-gone"><p>這個專案目前沒有可以合併的 BOM 系列（可能剛被封存或移到別的專案）。</p><Button type="button" variant="outline" size="sm" onClick={() => setMode("series")} title="回到 BOM 系列清單" className="h-11">← 返回系列</Button></div>
        ) : mode === "diff" && diffSeries && diffBefore && diffAfter ? (
          <BomDiffView
            key={`diff:${diffViewSeed.token}`}
            initialLostOnly={diffViewSeed.lostOnly}
            initialView={diffViewSeed.view}
            onLostOnlyChange={setDiffLostOnly}
            series={diffSeries}
            before={diffBefore}
            after={diffAfter}
            result={diffResult}
            parts={currentDiff?.parts ?? null}
            loading={!currentDiff}
            error={currentDiff?.error ?? null}
            exporting={exporting}
            onPickBefore={(workspaceId) => setDiffPair((current) => ({ before: workspaceId, after: current?.after === workspaceId ? (current?.before ?? workspaceId) : (current?.after ?? workspaceId) }))}
            onPickAfter={(workspaceId) => setDiffPair((current) => ({ after: workspaceId, before: current?.before === workspaceId ? (current?.after ?? workspaceId) : (current?.before ?? workspaceId) }))}
            onSwap={() => setDiffPair((current) => (current ? { before: current.after, after: current.before } : current))}
            onBack={() => setMode("series")}
            onExport={(visible) => void exportDiff(visible)}
            compact={compact}
            onLocate={canLocateDiff ? locateDiffEntry : undefined}
            locateFills={canFillDiff}
            recarry={recarryPair ? { run: recarryBlocked ? undefined : () => void recarry(), blocked: recarryBlocked, busy: recarrying } : undefined}
          />
        ) : (
          <div className="bom-version-columns grid min-h-0 min-w-0 flex-1">
            <aside data-testid="bom-series-list" className={cn("bom-series-sidebar flex min-h-0 min-w-0 flex-col", compact && mobilePane === "detail" && "hidden")}>
              <div className="bom-series-tools-wrap"><div className="bom-series-tools">
              {canEdit && <Button type="button" variant="outline" size="sm" disabled={!ready || busy} aria-busy={busy || undefined} onClick={onUploadNew} title="先選擇 Excel，再確認建立新系列或加入既有系列；不會立即儲存" className="bom-upload-entry h-9 justify-start"><Upload className="mr-1.5 h-4 w-4" />匯入 BOM 檔案</Button>}
              <div className="bom-series-search relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋專案、系列或版本" title="搜尋系列、專案、來源檔或版本說明" aria-label="搜尋 BOM 系列" className="h-10 rounded-xl pl-9 text-sm lg:h-9" />
              </div>
              </div>{canEdit && <p className="bom-series-upload-hint">選檔後可建立系列或加入既有系列。</p>}</div>
              {query && <div className="bom-series-filter-chips"><button type="button" aria-label="清除 BOM 系列搜尋" onClick={() => setQuery("")}><span>搜尋：{query}</span><X aria-hidden="true" /></button><Button type="button" variant="ghost" onClick={() => setQuery("")}>全部清除</Button></div>}
              <div className="bom-series-groups min-h-0 flex-1 overflow-y-auto">
                {groups.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{BOM_SERIES_EMPTY_TEXT}</p>
                ) : groups.map((group) => {
                  const expanded = !collapsedProjects.includes(group.key);
                  return <section key={group.key} className="bom-project-group">
                    <h4><button type="button" data-active-project={group.isActive} className="bom-project-heading flex items-center gap-2" aria-label={`${expanded ? "收合" : "展開"}專案：${group.label}`} aria-expanded={expanded} aria-controls={`${projectGroupId}-${group.key}`} onClick={() => setCollapsedProjects(current => expanded ? [...current, group.key] : current.filter(key => key !== group.key))}>
                      <Layers3 className="h-3.5 w-3.5 flex-none text-muted-foreground" aria-hidden="true" />
                      <span className="bom-project-name min-w-0 truncate text-sm font-bold text-foreground" title={group.label}>{group.label}</span>
                      {group.isActive && <span className={cn(CHIP, "flex-none", CHIP_TONE.success)}>工作區專案</span>}
                      <span className="bom-project-count flex-none text-muted-foreground">{group.workspaces.length} 個系列</span>
                      <ChevronDown aria-hidden="true" className="bom-project-chevron h-4 w-4 flex-none" />
                    </button></h4>
                    <div id={`${projectGroupId}-${group.key}`} hidden={!expanded}>
                      {group.projectId && (liveSeriesByProject.get(group.projectId)?.length ?? 0) > 0 && (
                        <button type="button" data-testid="bom-project-parts-entry" onClick={() => openProjectParts(group.projectId!)} title={`把「${group.label}」每個 BOM 系列的目前版本合併成一張總料表：同一顆料只列一次，可篩選、匯出，並轉成 PJE 備料表`} className="bom-project-parts-entry">
                          <ClipboardList aria-hidden="true" />專案總料表<small>合併 {liveSeriesByProject.get(group.projectId)!.length} 個系列</small>
                        </button>
                      )}
                      {group.workspaces.length === 0
                        ? <div className="bom-project-empty"><strong>尚無 BOM</strong><p>{canEdit ? "上傳 Excel，或將現有系列移入此專案。" : "請有編輯權限的同事上傳或指定專案。"}</p></div>
                        : group.workspaces.map((series) => renderSeriesRow(series))}
                    </div>
                  </section>;
                })}
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
