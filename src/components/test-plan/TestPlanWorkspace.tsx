import {
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDownUp,
  BookOpen,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  FolderUp,
  Globe,
  HardDriveUpload,
  LayoutGrid,
  Link2,
  List,
  LockKeyhole,
  MapPin,
  PanelLeftOpen,
  PanelRight,
  Pencil,
  RefreshCw,
  Scissors,
  Search,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { replaceWorkspaceHistory } from "@/lib/workspaceHistory";
import { readDroppedFiles } from "@/lib/droppedFiles";

import { formatTestPlanFileSize } from "./core/files";
import {
  buildFolderBreadcrumbs,
  collectFolderSubtree,
  filterAndSortEntries,
  isFolderDescendant,
  TEST_PLAN_SORT_DIRECTION,
} from "./core/tree";
import {
  clickSelection,
  contextSelection,
  EMPTY_SELECTION,
  moveSelection,
  pruneSelection,
  selectAll,
  singleSelection,
  typeAheadMatch,
  type ExplorerSelection,
} from "./core/selection";
import { TEST_PLAN_PERSONAL_SPACE } from "./core/repository";
import { useTestPlanWorkspace } from "./hooks/useTestPlanWorkspace";
import { useFileLibraryFilters, type FileSearchScope } from "./useFileLibraryFilters";
import { FileTypeIcon, TestPlanInspector } from "./TestPlanInspector";
import { describeEntryType, formatEntryDate } from "./core/entryDisplay";
import { isEditableSpreadsheet } from "./core/spreadsheet";
import { TestPlanSpreadsheetEditor } from "./TestPlanSpreadsheetEditor";
import { TransferPanel, type TransferItem } from "./TransferPanel";
import { FileLibraryManual, type FileLibraryManualSection } from "./FileLibraryManual";
import { downloadWithProgress, openDirectorySink, pickDownloadDirectory, type TransferSink } from "./core/transfers";
import { chooseDragDownloadUrl, createBlobUrlCache, describeDownloadUrl, DRAG_BLOB_CACHE_LIMIT, DRAG_BLOB_LIMIT, DRAG_BLOB_REVOKE_DELAY } from "./core/dragDownload";
import type {
  TestPlanEntry,
  TestPlanFileCategory,
  TestPlanFileRecord,
  TestPlanFolder,
  TestPlanSort,
} from "./types";
import "./test-plan.css";

type ViewMode = "grid" | "list";

interface UploadRetry {
  ownerId: string;
  folderId: string | null;
  spaceId: string | null;
  preservePaths: boolean;
  files: readonly File[];
  failures: { fileName: string; message: string }[];
}

// shortcut: File references survive workspace navigation in tab memory; reload requires selecting the originals again.
let retainedUploadRetry: UploadRetry | null = null;

function preventRetryUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = "";
}

function clearRetryForOwnerChange(event: Event) {
  if ((event as CustomEvent<string | null>).detail !== retainedUploadRetry?.ownerId) retainUploadRetry(null);
}

function retainUploadRetry(retry: UploadRetry | null) {
  retainedUploadRetry = retry;
  if (retry) {
    window.addEventListener("beforeunload", preventRetryUnload);
    window.addEventListener("station-user-changed", clearRetryForOwnerChange);
  } else {
    window.removeEventListener("beforeunload", preventRetryUnload);
    window.removeEventListener("station-user-changed", clearRetryForOwnerChange);
  }
}

const directoryInputProps = { webkitdirectory: "" } as InputHTMLAttributes<HTMLInputElement>;

type DescribeAction = { id: string; name: string; value: string };

type DeleteAction =
  | { kind: "folder"; id: string; name: string; spaceId: string; ownerId: string | null }
  | { kind: "file"; file: TestPlanFileRecord; ownerId: string | null }
  | { kind: "batch"; entries: TestPlanEntry[]; scope: string; skipped: number };

interface LibraryLocation {
  spaceId: string | null;
  folderId: string | null;
}

/** One item being moved: where it lives now, so a move can be undone. */
interface MoveItem {
  kind: TestPlanEntry["kind"];
  id: string;
  spaceId: string;
  folderId: string | null;
}

const entryKey = (entry: TestPlanEntry) => `${entry.kind}:${entry.id}`;
const entryName = (entry: TestPlanEntry) => entry.kind === "folder" ? entry.name : entry.originalName;
const entryParent = (entry: TestPlanEntry) => entry.kind === "folder" ? entry.parentId : entry.folderId;
const toMoveItem = (entry: TestPlanEntry): MoveItem => ({ kind: entry.kind, id: entry.id, spaceId: entry.spaceId, folderId: entryParent(entry) });
const isFileEntry = (entry: TestPlanEntry): entry is Extract<TestPlanEntry, { kind: "file" }> => entry.kind === "file";
const sameLocation = (first: LibraryLocation | undefined, second: LibraryLocation) => Boolean(first && first.spaceId === second.spaceId && first.folderId === second.folderId);

const CATEGORY_LABELS: Record<TestPlanFileCategory | "all", string> = {
  all: "全部格式",
  presentation: "簡報",
  spreadsheet: "試算表",
  document: "文件",
  image: "圖片",
  "3d": "3D 圖檔",
  pcb: "PCB／BRD",
  archive: "壓縮檔",
  other: "其他",
};

const SORT_LABELS: Record<TestPlanSort, string> = {
  name: "名稱",
  newest: "修改日期",
  oldest: "建立日期",
  largest: "大小",
  type: "類型",
};

const SCOPE_LABELS: Record<FileSearchScope | "everyone", string> = {
  folder: "目前資料夾",
  space: "整個空間",
  everyone: "所有人的檔案",
};


const ENTRY_DRAG_TYPE = "application/x-test-plan-entry";
const PREVIEW_PANE_STORAGE_KEY = "file-library:preview-pane";
const MANUAL_SEEN_STORAGE_KEY = "file-library:manual-seen";

function readManualSeen() {
  try {
    return window.localStorage.getItem(MANUAL_SEEN_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}
const PANE_WIDTHS_STORAGE_KEY = "file-library:pane-widths";
/** Draggable pane limits (px). The list column always keeps at least LIST_MIN_WIDTH. */
const NAV_WIDTH = { min: 180, max: 520, default: 284 };
const PREVIEW_WIDTH = { min: 280, max: 1100, default: 520 };
const LIST_MIN_WIDTH = 360;

interface PaneWidths {
  nav: number | null;
  preview: number | null;
}

function readPaneWidths(): PaneWidths {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PANE_WIDTHS_STORAGE_KEY) ?? "{}") as Partial<PaneWidths>;
    const valid = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
    return { nav: valid(parsed.nav), preview: valid(parsed.preview) };
  } catch {
    return { nav: null, preview: null };
  }
}

function savePaneWidths(widths: PaneWidths) {
  try {
    window.localStorage.setItem(PANE_WIDTHS_STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // Remembering the widths is only a convenience.
  }
}

function readEntryDragPayload(dataTransfer: DataTransfer | null): MoveItem[] | null {
  if (!dataTransfer) return null;
  try {
    const raw = dataTransfer.getData(ENTRY_DRAG_TYPE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { items?: Partial<MoveItem>[] };
    const items = (parsed.items ?? []).filter((item): item is MoveItem => Boolean(item?.id && item.spaceId && (item.kind === "file" || item.kind === "folder")))
      .map((item) => ({ kind: item.kind, id: item.id, spaceId: item.spaceId, folderId: item.folderId ?? null }));
    return items.length ? items : null;
  } catch {
    return null;
  }
}

function isEntryDrag(dataTransfer: DataTransfer | null) {
  return Boolean(dataTransfer && Array.from(dataTransfer.types).includes(ENTRY_DRAG_TYPE));
}

function isFileDrag(dataTransfer: DataTransfer | null) {
  return Boolean(dataTransfer && Array.from(dataTransfer.types).includes("Files"));
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='combobox']"));
}

// Avatar initials drawn by CSS (content: attr) so the element itself stays empty for assistive tech.
function spaceInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return (trimmed.charCodeAt(0) > 0x2e7f ? trimmed.slice(0, 1) : trimmed.slice(0, 2)).toUpperCase();
}

function spaceSwatch(color: string | undefined) {
  return { "--space-color": color ?? "#5b8def" } as CSSProperties;
}

function readPreviewPreference(compact: boolean) {
  if (compact) return false;
  try {
    return window.localStorage.getItem(PREVIEW_PANE_STORAGE_KEY) !== "closed";
  } catch {
    return true;
  }
}

function useCompactLayout() {
  const query = "(max-width: 1023px)";
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return compact;
}

function FolderBranch({
  folders,
  files,
  parentId,
  activeFolderId,
  expandedFolderIds,
  onOpen,
  onToggle,
  dropTargetId = null,
  onDragOverFolder,
  onDropOnFolder,
  onDragLeaveFolder,
  level = 0,
}: {
  folders: readonly TestPlanFolder[];
  files: readonly TestPlanFileRecord[];
  parentId: string | null;
  activeFolderId: string | null;
  expandedFolderIds: ReadonlySet<string>;
  onOpen: (folderId: string) => void;
  onToggle: (folderId: string) => void;
  dropTargetId?: string | null;
  onDragOverFolder?: (folderId: string, event: DragEvent<HTMLElement>) => void;
  onDropOnFolder?: (folderId: string, event: DragEvent<HTMLElement>) => void;
  onDragLeaveFolder?: () => void;
  level?: number;
}) {
  const children = folders
    .filter((folder) => folder.parentId === parentId)
    .sort((first, second) =>
      first.name.localeCompare(second.name, "zh-Hant", { numeric: true }));

  return (
    <>
      {children.map((folder) => {
        const childFolderCount = folders.filter(
          (candidate) => candidate.parentId === folder.id,
        ).length;
        const directFileCount = files.filter(
          (file) => file.folderId === folder.id,
        ).length;
        const hasChildren = childFolderCount > 0;
        const isExpanded = expandedFolderIds.has(folder.id);
        const isActive = activeFolderId === folder.id;

        return (
          <div className="test-plan-folder-tree-node" key={folder.id}>
            <div
              className={cn(
                "test-plan-folder-tree-row",
                isActive && "is-active",
                dropTargetId === folder.id && "is-drop-target",
              )}
              style={{ paddingLeft: `${18 + level * 14}px` }}
              onDragOver={(event) => onDragOverFolder?.(folder.id, event)}
              onDragLeave={() => onDragLeaveFolder?.()}
              onDrop={(event) => onDropOnFolder?.(folder.id, event)}
            >
              {hasChildren ? (
                <button
                  type="button"
                  className={cn(
                    "test-plan-folder-tree-toggle",
                    isExpanded && "is-expanded",
                  )}
                  aria-label={isExpanded ? `收合 ${folder.name}` : `展開 ${folder.name}`}
                  aria-expanded={isExpanded}
                  onClick={() => onToggle(folder.id)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              ) : (
                <span className="test-plan-folder-tree-toggle-spacer" />
              )}
              <button
                type="button"
                className="test-plan-folder-tree-item"
                aria-current={isActive ? "location" : undefined}
                title={[
                  folder.name,
                  childFolderCount > 0 ? `${childFolderCount} 個子資料夾` : "",
                  directFileCount > 0 ? `${directFileCount} 個檔案` : "",
                  childFolderCount === 0 && directFileCount === 0 ? "空資料夾" : "",
                ].filter(Boolean).join(" · ")}
                onClick={() => onOpen(folder.id)}
              >
                {isActive ? (
                  <FolderOpen className="h-4 w-4" />
                ) : (
                  <Folder className="h-4 w-4" />
                )}
                <span className="test-plan-folder-tree-label">{folder.name}</span>
              </button>
            </div>
            {hasChildren && isExpanded && (
              <FolderBranch
                folders={folders}
                files={files}
                parentId={folder.id}
                activeFolderId={activeFolderId}
                expandedFolderIds={expandedFolderIds}
                onOpen={onOpen}
                onToggle={onToggle}
                dropTargetId={dropTargetId}
                onDragOverFolder={onDragOverFolder}
                onDropOnFolder={onDropOnFolder}
                onDragLeaveFolder={onDragLeaveFolder}
                level={level + 1}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function DescribeDialog({
  action,
  busy,
  onClose,
  onSubmit,
}: {
  action: DescribeAction | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(action?.value ?? "");
  }, [action]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit(value);
  };

  return (
    <Dialog open={Boolean(action)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="file-library-dialog">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>檔案說明</DialogTitle>
            <DialogDescription>
              {action ? `「${action.name}」：` : ""}補充板版、用途、測試條件或交付備註。
            </DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            value={value}
            maxLength={800}
            rows={5}
            placeholder="輸入檔案說明（選填）"
            onChange={(event) => setValue(event.target.value)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "處理中…" : "儲存說明"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MoveDialog({
  entries,
  folders,
  busy,
  onClose,
  onSubmit,
}: {
  entries: readonly TestPlanEntry[] | null;
  folders: readonly TestPlanFolder[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (folderId: string | null) => Promise<void>;
}) {
  const [targetId, setTargetId] = useState("__root__");
  const spaceId = entries?.[0]?.spaceId;
  const options = useMemo(
    () =>
      folders
        .filter((folder) => folder.spaceId === spaceId)
        .filter((folder) => !(entries ?? []).some((entry) => entry.kind === "folder" && isFolderDescendant(folders, folder.id, entry.id)))
        .map((folder) => ({ id: folder.id, label: buildFolderBreadcrumbs(folders, folder.id).map((item) => item.name).join(" › ") }))
        .sort((first, second) => first.label.localeCompare(second.label, "zh-Hant", { numeric: true })),
    [entries, folders, spaceId],
  );

  useEffect(() => setTargetId("__root__"), [entries]);
  const title = !entries?.length ? "" : entries.length === 1 ? `移動「${entryName(entries[0])}」` : `移動 ${entries.length} 個項目`;

  return (
    <Dialog open={Boolean(entries?.length)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="file-library-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>選擇同一個空間裡的目標資料夾。也可以直接把項目拖到左側資料夾或路徑上。</DialogDescription>
        </DialogHeader>
        <Select value={targetId} onValueChange={setTargetId}>
          <SelectTrigger aria-label="目標資料夾">
            <SelectValue placeholder="選擇位置" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__root__">空間根目錄</SelectItem>
            {options.map((folder) => (
              <SelectItem key={folder.id} value={folder.id}>
                {folder.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => onSubmit(targetId === "__root__" ? null : targetId)}
          >
            {busy ? "移動中…" : "移到這裡"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TestPlanWorkspace() {
  // A shared link (複製連結) names a space, folder and item; otherwise the library opens on 我的空間.
  const [initialLink] = useState(() => {
    const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    return { space: params.get("fileSpace"), folder: params.get("fileFolder"), item: params.get("fileItem") };
  });
  const workspace = useTestPlanWorkspace({
    initialSpaceId: initialLink.space === "all" ? null : initialLink.space || TEST_PLAN_PERSONAL_SPACE,
  });
  const {
    spaces,
    activeSpaceId,
    activeSpace,
    folders,
    files,
    loading,
    busy: workspaceBusy,
    error,
    uploadProgress,
    canEdit,
    canEditSpace,
    ownerId,
    isAuthenticated,
    openSpace,
    refreshWorkspace,
    createFolder,
    renameFolder,
    moveFolder,
    deleteFolder,
    uploadFiles,
    renameFile,
    moveFile,
    updateFileDescription,
    downloadFile,
    getFileDownloadUrl,
    getFileDownloadUrls,
    deleteFile,
    deleteEntries,
    replaceFileContents,
  } = workspace;
  const compact = useCompactLayout();
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const { query, setQuery, categoryFilter, setCategoryFilter, sort, setSort, reverse, setReverse, toggleSort, scope, setScope, clearFilters } = useFileLibraryFilters();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [previewOpen, setPreviewOpenState] = useState(() => readPreviewPreference(compact));
  // Pane widths the user dragged; null keeps the responsive default for the screen size.
  const [paneWidths, setPaneWidths] = useState<PaneWidths>(readPaneWidths);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const downloadUrlCacheRef = useRef(new Map<string, { url: string; expiresAt: number }>());
  const [linkVersion, setLinkVersion] = useState(0);
  const [downloads, setDownloads] = useState<TransferItem[]>([]);
  const dragBlobCacheRef = useRef(createBlobUrlCache(DRAG_BLOB_CACHE_LIMIT, (url) => window.setTimeout(() => URL.revokeObjectURL(url), DRAG_BLOB_REVOKE_DELAY)));
  const dragPrefetchRef = useRef(new Set<string>());
  // Files waiting for a free prefetch slot (at most three download at once).
  const dragPrefetchQueueRef = useRef<TestPlanFileRecord[]>([]);
  // Why the current drag carries no file for the desktop (shown if it is dropped outside the page).
  const dragOutMissingRef = useRef<{ reason: "preparing" | "large" | "multiple" | "folder"; name: string } | null>(null);
  const dragDwellTimersRef = useRef(new Map<string, number>());
  useEffect(() => {
    const cache = dragBlobCacheRef.current;
    const timers = dragDwellTimersRef.current;
    return () => {
      cache.clear();
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);
  // An earlier build registered a download-proxy worker that a drag download can never reach; retire it.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.getRegistrations()
      .then((registrations) => {
        for (const registration of registrations) {
          const scriptUrl = registration.active?.scriptURL ?? registration.waiting?.scriptURL ?? registration.installing?.scriptURL ?? "";
          if (scriptUrl.includes("file-library-sw.js")) void registration.unregister();
        }
      })
      .catch(() => { /* nothing to retire */ });
  }, []);
  const dismissDownload = useCallback((id: string) => setDownloads((items) => items.filter((item) => item.id !== id)), []);
  const [retryState, setRetryState] = useState<UploadRetry | null>(() => retainedUploadRetry);
  const uploadRetry = retryState?.ownerId === ownerId ? retryState : null;
  const [isSpaceDrawerOpen, setIsSpaceDrawerOpen] = useState(false);
  const [describeAction, setDescribeAction] = useState<DescribeAction | null>(null);
  const [moveEntriesAction, setMoveEntriesAction] = useState<TestPlanEntry[] | null>(null);
  const [deleteAction, setDeleteAction] = useState<DeleteAction | null>(null);
  const [renaming, setRenaming] = useState<{ key: string; value: string; error: string | null } | null>(null);
  const renameCommitRef = useRef(false);
  const [clipboard, setClipboard] = useState<{ items: MoveItem[]; spaceId: string } | null>(null);
  const [contextTarget, setContextTarget] = useState<"item" | "empty">("empty");
  const [manual, setManual] = useState<{ open: boolean; section: FileLibraryManualSection }>({ open: false, section: "layout" });
  // The 操作手冊 button pulses until this browser has opened it once.
  const [manualSeen, setManualSeen] = useState(readManualSeen);
  const openManual = useCallback((section: FileLibraryManualSection = "layout") => {
    setManual({ open: true, section });
    setManualSeen(true);
    try {
      window.localStorage.setItem(MANUAL_SEEN_STORAGE_KEY, "1");
    } catch {
      // Only a reminder.
    }
  }, []);
  const [peopleFilter, setPeopleFilter] = useState("");
  const [history, setHistory] = useState<{ stack: LibraryLocation[]; index: number }>({ stack: [], index: -1 });
  const [batchDeleting, setBatchDeleting] = useState(false);
  const busy = workspaceBusy || batchDeleting;
  const batchDeleteInFlight = useRef(false);
  const [spreadsheetFile, setSpreadsheetFile] = useState<TestPlanFileRecord | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    new Set(),
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const keyboardFocusRef = useRef(false);
  const typeAheadRef = useRef({ text: "", at: 0 });
  const requestedFolderRef = useRef<{spaceId: string; folderId: string | null} | null>(
    initialLink.space && initialLink.space !== "all" && initialLink.folder ? { spaceId: initialLink.space, folderId: initialLink.folder } : null,
  );
  const pendingFocusRef = useRef<string | null>(initialLink.item);
  const pendingRenameRef = useRef<string | null>(null);
  // Bumped when a pending selection is queued after the list already updated (e.g. a new folder).
  const [pendingTick, setPendingTick] = useState(0);
  const uploadRequestRef = useRef(0);
  const setUploadRetry = (retry: UploadRetry | null) => {
    retainUploadRetry(retry);
    setRetryState(retry);
  };
  const setPreviewOpen = useCallback((open: boolean) => {
    setPreviewOpenState(open);
    if (compact) return;
    try {
      window.localStorage.setItem(PREVIEW_PANE_STORAGE_KEY, open ? "open" : "closed");
    } catch {
      // The preference is only a convenience.
    }
  }, [compact]);

  useEffect(() => {
    const requested = requestedFolderRef.current;
    // The first render happens before the linked space has loaded: keep the request for it.
    const waiting = Boolean(requested && requested.spaceId !== activeSpaceId && loading);
    setActiveFolderId(!waiting && requested?.spaceId === activeSpaceId ? requested.folderId : null);
    if (!waiting) requestedFolderRef.current = null;
    setSpreadsheetFile(null);
    setRenaming(null);
    setExpandedFolderIds(new Set());
  }, [activeSpaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeFolderId) return;
    const parentById = new Map(
      folders.map((folder) => [folder.id, folder.parentId] as const),
    );
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      let cursor: string | null = activeFolderId;
      let changed = false;
      while (cursor) {
        if (!next.has(cursor)) {
          next.add(cursor);
          changed = true;
        }
        cursor = parentById.get(cursor) ?? null;
      }
      return changed ? next : current;
    });
  }, [activeFolderId, folders]);

  const personalSpace = spaces.find(space => space.isPersonal && space.ownerId === ownerId);
  const userSpaces = useMemo(() => [...spaces].sort((first, second) => {
    const mine = Number(second.ownerId === ownerId) - Number(first.ownerId === ownerId);
    return mine || first.name.localeCompare(second.name, "zh-Hant", { numeric: true });
  }), [ownerId, spaces]);
  const pinnedSpaces = userSpaces.filter(space => space.ownerId === ownerId || space.ownerRole === "admin" || space.ownerRole === "super_admin");
  const otherSpaces = userSpaces.filter(space => !pinnedSpaces.includes(space));
  const ownSpaces = pinnedSpaces.filter(space => space.ownerId === ownerId);
  const teamSpaces = pinnedSpaces.filter(space => space.ownerId !== ownerId);
  const normalizedPeopleFilter = peopleFilter.normalize("NFKC").trim().toLocaleLowerCase();
  const listedOtherSpaces = otherSpaces.filter(space => !normalizedPeopleFilter
    || space.id === activeSpaceId
    || `${space.name} ${space.description ?? ""}`.normalize("NFKC").toLocaleLowerCase().includes(normalizedPeopleFilter));
  const isOwnSpace = Boolean(activeSpace && activeSpace.ownerId === ownerId);
  const showOwnerColumn = activeSpaceId === null;
  const spaceNameById = useMemo(() => new Map(spaces.map(space => [space.id, space.name] as const)), [spaces]);
  const spaceById = useMemo(() => new Map(spaces.map(space => [space.id, space] as const)), [spaces]);
  const folderPathById = useMemo(() => {
    const paths = new Map<string, string>();
    for (const folder of folders) paths.set(folder.id, buildFolderBreadcrumbs(folders, folder.id).map(item => item.name).join(" › "));
    return paths;
  }, [folders]);
  const locationLabel = useCallback((entry: TestPlanEntry) => {
    const parent = entryParent(entry);
    const path = parent ? folderPathById.get(parent) ?? "資料夾" : "根目錄";
    const owner = spaceNameById.get(entry.spaceId) ?? "未知空間";
    return `${owner} › ${path}`;
  }, [folderPathById, spaceNameById]);
  const folderLocation = useCallback((entry: TestPlanEntry) => {
    const parent = entryParent(entry);
    return parent ? folderPathById.get(parent) ?? "資料夾" : "根目錄";
  }, [folderPathById]);
  const folderCounts = useCallback((folderId: string) => ({
    folders: folders.filter(folder => folder.parentId === folderId).length,
    files: files.filter(file => file.folderId === folderId).length,
  }), [files, folders]);

  useEffect(() => {
    if (retainedUploadRetry?.ownerId !== ownerId) retainUploadRetry(null);
    setRetryState(retainedUploadRetry);
    setSpreadsheetFile(null);
    setDescribeAction(null);
    setMoveEntriesAction(null);
    setDeleteAction(null);
    setRenaming(null);
    setClipboard(null);
    setHistory({ stack: [], index: -1 });
    setPeopleFilter("");
    return () => { uploadRequestRef.current += 1; };
  }, [ownerId]);

  // Live values for callbacks that may run after a re-render (a stale confirm, a late response).
  const ownerIdRef = useRef(ownerId);
  ownerIdRef.current = ownerId;
  const deleteActionRef = useRef<DeleteAction | null>(null);
  deleteActionRef.current = deleteAction;

  useEffect(() => {
    if (!busy) return;
    const preventNavigation = (event: Event) => {
      event.preventDefault();
      toast.error(batchDeleting ? "目前正在刪除檔案，完成後才能切換工作區。" : "目前正在上傳檔案，完成後才能切換工作區。");
    };
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("workspace-before-navigate", preventNavigation);
    window.addEventListener("beforeunload", preventUnload);
    return () => {
      window.removeEventListener("workspace-before-navigate", preventNavigation);
      window.removeEventListener("beforeunload", preventUnload);
    };
  }, [batchDeleting, busy]);

  // The open space and folder live in the address bar, so refresh and Back keep the place.
  useEffect(() => {
    if (loading || spaces.length === 0) return;
    const url = new URL(window.location.href);
    url.searchParams.set("fileSpace", activeSpaceId ?? "all");
    if (activeFolderId) url.searchParams.set("fileFolder", activeFolderId);
    else url.searchParams.delete("fileFolder");
    if (!pendingFocusRef.current) url.searchParams.delete("fileItem");
    if (url.href !== window.location.href) replaceWorkspaceHistory(url);
  }, [activeFolderId, activeSpaceId, loading, spaces.length]);

  const breadcrumbs = useMemo(
    () => buildFolderBreadcrumbs(folders, activeFolderId),
    [activeFolderId, folders],
  );
  const searching = Boolean(query.trim());
  const visibleEntries = useMemo(() => {
    const subtree = searching && scope === "folder" && activeSpaceId ? collectFolderSubtree(folders, activeFolderId) : null;
    const visibleFolders = searching
      ? (subtree ? folders.filter((folder) => subtree.has(folder.parentId)) : folders)
      : folders.filter((folder) => folder.parentId === activeFolderId);
    const visibleFiles = searching
      ? (subtree ? files.filter((file) => subtree.has(file.folderId)) : files)
      : activeSpaceId === null && activeFolderId === null
        ? files
        : files.filter((file) => file.folderId === activeFolderId);
    return filterAndSortEntries(visibleFolders, visibleFiles, {
      query,
      category: categoryFilter,
      sort,
      reverse,
    });
  }, [activeFolderId, activeSpaceId, categoryFilter, files, folders, query, reverse, scope, searching, sort]);
  const showLocationColumn = activeSpaceId === null || searching;
  // Cross-user view: never mix owners in one run of rows. Own files first, then each owner's block.
  const listSections = useMemo(() => {
    if (!showOwnerColumn) return [{ key: "all", label: null as string | null, entries: visibleEntries }];
    const bySpace = new Map<string, TestPlanEntry[]>();
    for (const entry of visibleEntries) {
      const bucket = bySpace.get(entry.spaceId) ?? [];
      bucket.push(entry);
      bySpace.set(entry.spaceId, bucket);
    }
    return [...bySpace.entries()]
      .sort(([left], [right]) => {
        const mine = Number(spaces.find(space => space.id === right)?.ownerId === ownerId) - Number(spaces.find(space => space.id === left)?.ownerId === ownerId);
        return mine || (spaceNameById.get(left) ?? "").localeCompare(spaceNameById.get(right) ?? "", "zh-Hant", { numeric: true });
      })
      .map(([spaceId, entries]) => ({
        key: spaceId,
        label: spaces.find(space => space.id === spaceId)?.ownerId === ownerId ? `我的空間 · ${spaceNameById.get(spaceId) ?? ""}` : spaceNameById.get(spaceId) ?? "未知空間",
        entries,
      }));
  }, [ownerId, showOwnerColumn, spaceNameById, spaces, visibleEntries]);
  const orderedEntries = useMemo(() => listSections.flatMap(section => section.entries), [listSections]);
  const orderedKeys = useMemo(() => orderedEntries.map(entryKey), [orderedEntries]);
  const entryByKey = useMemo(() => new Map(orderedEntries.map(entry => [entryKey(entry), entry] as const)), [orderedEntries]);

  // Drag-to-desktop needs the signed link already at dragstart, so links for the
  // rows on screen are fetched in one batch instead of waiting for a hover.
  useEffect(() => {
    const cache = downloadUrlCacheRef.current;
    const pending = visibleEntries
      .filter((entry): entry is Extract<TestPlanEntry, { kind: "file" }> => entry.kind === "file" && !((cache.get(entry.id)?.expiresAt ?? 0) > Date.now()))
      .slice(0, 120);
    if (pending.length === 0 || typeof getFileDownloadUrls !== "function") return;
    let cancelled = false;
    for (const file of pending) cache.set(file.id, { url: "", expiresAt: Date.now() + 15_000 });
    void getFileDownloadUrls(pending)
      .then((urls) => {
        if (cancelled) return;
        for (const file of pending) {
          const url = urls.get(file.id);
          if (url) cache.set(file.id, { url, expiresAt: Date.now() + 8 * 60_000 });
          else cache.delete(file.id);
        }
        setLinkVersion((version) => version + 1);
      })
      .catch(() => {
        for (const file of pending) cache.delete(file.id);
      });
    return () => { cancelled = true; };
  }, [getFileDownloadUrls, visibleEntries]);

  // Selection. Search, format and location changes start a fresh selection; sorting and the view keep it.
  const selectionScope = JSON.stringify([ownerId, activeSpaceId, activeFolderId, query.trim(), categoryFilter, scope]);
  const selectionScopeRef = useRef(selectionScope);
  selectionScopeRef.current = selectionScope;
  const [selectionState, setSelectionState] = useState<{ scope: string; value: ExplorerSelection }>({ scope: "", value: EMPTY_SELECTION });
  const selection = selectionState.scope === selectionScope ? selectionState.value : EMPTY_SELECTION;
  const updateSelection = useCallback((next: ExplorerSelection | ((current: ExplorerSelection) => ExplorerSelection)) => {
    setSelectionState((state) => {
      const scopeNow = selectionScopeRef.current;
      const current = state.scope === scopeNow ? state.value : EMPTY_SELECTION;
      return { scope: scopeNow, value: typeof next === "function" ? next(current) : next };
    });
  }, []);
  const orderedKeySignature = orderedKeys.join("\n");
  useEffect(() => {
    setSelectionState((state) => {
      if (state.scope !== selectionScope) return state;
      const pruned = pruneSelection(state.value, orderedKeys);
      return pruned === state.value ? state : { scope: state.scope, value: pruned };
    });
  }, [orderedKeySignature, selectionScope]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectedEntries = useMemo(() => orderedEntries.filter(entry => selection.keys.has(entryKey(entry))), [orderedEntries, selection.keys]);
  const selectedEntry = selectedEntries.length === 1 ? selectedEntries[0] : null;
  const selectedSize = selectedEntries.reduce((total, entry) => total + (entry.kind === "file" ? entry.fileSize : 0), 0);
  const eligibleEntries = visibleEntries.filter(entry => canEditSpace(entry.spaceId));
  const eligibleKeySignature = JSON.stringify(eligibleEntries.map(entryKey).sort());
  const selectionContext = useRef({ scope: selectionScope, eligible: new Map<string, TestPlanEntry>(), disabled: false });
  selectionContext.current = { scope: selectionScope, eligible: new Map(eligibleEntries.map(entry => [entryKey(entry), entry])), disabled: busy || loading };
  const visibleDeleteAction = deleteAction?.kind === "batch" && deleteAction.scope !== selectionScope ? null : deleteAction;
  useEffect(() => {
    setDeleteAction(action => action?.kind === "batch" ? null : action);
  }, [selectionScope]);
  useEffect(() => {
    const eligibleKeys = new Set<string>(JSON.parse(eligibleKeySignature));
    if (!batchDeleteInFlight.current) {
      setDeleteAction(action => action?.kind === "batch" && action.entries.some(entry => !eligibleKeys.has(entryKey(entry))) ? null : action);
    }
  }, [eligibleKeySignature]);

  const allSelected = orderedKeys.length > 0 && selection.keys.size === orderedKeys.length;
  const selectedEditable = selectedEntries.filter(entry => canEditSpace(entry.spaceId));
  const selectionEditable = selectedEntries.length > 0 && selectedEditable.length === selectedEntries.length;
  const selectionSpaces = new Set(selectedEntries.map(entry => entry.spaceId));
  const selectionMovable = selectionEditable && selectionSpaces.size === 1;
  const selectedFiles = selectedEntries.filter(isFileEntry);
  const cutKeys = useMemo(() => new Set(clipboard?.items.map(item => `${item.kind}:${item.id}`) ?? []), [clipboard]);
  const canPaste = Boolean(clipboard && activeSpaceId && clipboard.spaceId === activeSpaceId && canEditSpace(activeSpaceId) && !busy && !loading);
  const readOnlyReason = "唯讀：可以瀏覽與下載，不能修改";

  // Keyboard navigation moves the real focus with the selection.
  useEffect(() => {
    if (!keyboardFocusRef.current || !selection.focus) return;
    keyboardFocusRef.current = false;
    // Never pull focus out of an open rename box.
    if (document.activeElement instanceof HTMLElement && document.activeElement.classList.contains("file-explorer-rename-input")) return;
    const row = rowRefs.current.get(selection.focus);
    row?.focus({ preventScroll: true });
    row?.scrollIntoView?.({ block: "nearest" });
  }, [selection.focus]);

  // After 開啟檔案位置, a shared link or a new folder: select the item once it is listed.
  useEffect(() => {
    const key = pendingFocusRef.current;
    if (!key || loading) return;
    if (!entryByKey.has(key)) return;
    pendingFocusRef.current = null;
    updateSelection(singleSelection(key));
    if (pendingRenameRef.current === key) {
      pendingRenameRef.current = null;
      const entry = entryByKey.get(key);
      if (entry) setRenaming({ key, value: entryName(entry), error: null });
    } else {
      keyboardFocusRef.current = true;
    }
    window.requestAnimationFrame(() => rowRefs.current.get(key)?.scrollIntoView?.({ block: "center" }));
  }, [entryByKey, loading, pendingTick, updateSelection]);

  useEffect(() => {
    if (!isDragging) return;
    const reset = (event: Event) => {
      if (event.type === "dragleave" && (event as globalThis.DragEvent).relatedTarget) return;
      setIsDragging(false);
      setDropTargetId(null);
    };
    window.addEventListener("dragleave", reset);
    window.addEventListener("drop", reset);
    window.addEventListener("dragend", reset);
    return () => {
      window.removeEventListener("dragleave", reset);
      window.removeEventListener("drop", reset);
      window.removeEventListener("dragend", reset);
    };
  }, [isDragging]);

  // After opening a folder the clicked row is gone; keep the keyboard on the list instead of the page body.
  useEffect(() => {
    if (document.activeElement === document.body) listRef.current?.focus({ preventScroll: true });
  }, [activeFolderId, activeSpaceId, viewMode]);

  // ----- navigation -------------------------------------------------------
  const currentLocation: LibraryLocation = { spaceId: activeSpaceId, folderId: activeFolderId };
  const navigate = (location: LibraryLocation, { record = true }: { record?: boolean } = {}) => {
    if (busy) {
      toast.error("目前正在處理檔案，完成後才能切換位置。");
      return false;
    }
    if (loading && location.spaceId === activeSpaceId) return false;
    setRenaming(null);
    setIsSpaceDrawerOpen(false);
    if (record) {
      setHistory((current) => {
        const base = current.index >= 0 ? current.stack.slice(0, current.index + 1) : [currentLocation];
        if (sameLocation(base[base.length - 1], location)) return { stack: base, index: base.length - 1 };
        const stack = [...base, location].slice(-50);
        return { stack, index: stack.length - 1 };
      });
    }
    if (location.spaceId !== activeSpaceId) {
      requestedFolderRef.current = location.spaceId ? { spaceId: location.spaceId, folderId: location.folderId } : null;
      void openSpace(location.spaceId);
    } else {
      setActiveFolderId(location.folderId);
    }
    return true;
  };
  const canGoBack = history.index > 0;
  const canGoForward = history.index >= 0 && history.index < history.stack.length - 1;
  const parentFolderId = activeFolderId ? folders.find(folder => folder.id === activeFolderId)?.parentId ?? null : null;
  const canGoUp = Boolean(activeSpaceId && activeFolderId);
  const goBack = () => {
    if (!canGoBack || busy || loading) return;
    const target = history.stack[history.index - 1];
    if (navigate(target, { record: false })) setHistory((current) => ({ ...current, index: current.index - 1 }));
  };
  const goForward = () => {
    if (!canGoForward || busy || loading) return;
    const target = history.stack[history.index + 1];
    if (navigate(target, { record: false })) setHistory((current) => ({ ...current, index: current.index + 1 }));
  };
  const goUp = () => {
    if (!canGoUp || busy || loading) return;
    if (navigate({ spaceId: activeSpaceId, folderId: parentFolderId }) && activeFolderId) pendingFocusRef.current = `folder:${activeFolderId}`;
  };
  const openLocation = (entry: TestPlanEntry) => {
    if (busy || loading) return;
    if (!navigate({ spaceId: entry.spaceId, folderId: entryParent(entry) })) return;
    pendingFocusRef.current = entryKey(entry);
    if (query) setQuery("");
  };

  // ----- uploads ----------------------------------------------------------
  const handleUpload = async (incoming: readonly File[], preservePaths = false, target?: Pick<UploadRetry, "folderId" | "spaceId">, { keepRetry = false }: { keepRetry?: boolean } = {}) => {
    if (!ownerId || !canEdit || busy || loading || incoming.length === 0) return;
    const requestId = ++uploadRequestRef.current;
    const uploadTarget = target ?? { folderId: activeFolderId, spaceId: activeSpaceId };
    // The second half of a mixed drop must not wipe the retry list of the first half.
    const earlierRetry = keepRetry ? retainedUploadRetry : null;
    if (!earlierRetry) setUploadRetry(null);
    try {
      const result = await uploadFiles(uploadTarget.folderId, incoming, { preservePaths, spaceId: uploadTarget.spaceId });
      if (requestId !== uploadRequestRef.current) return;
      if (result.uploaded.length > 0) {
        toast.success(`已上傳 ${result.uploaded.length} 個檔案`);
      }
      if (result.failures.length > 0 && earlierRetry) {
        toast.error(`${result.failedFiles.length} 個檔案未上傳：${result.failures[0].message}（請先處理上方的重試清單）`);
      } else if (result.failures.length > 0) {
        setUploadRetry({ ...uploadTarget, ownerId, spaceId: result.spaceId, preservePaths, files: result.failedFiles, failures: result.failures });
        toast.error(
          `${result.failedFiles.length} 個檔案未上傳：${result.failures[0].message}`,
        );
      }
    } catch (caught) {
      if (requestId !== uploadRequestRef.current) return;
      const message = caught instanceof Error ? caught.message : "上傳失敗";
      if (!earlierRetry) setUploadRetry({ ...uploadTarget, ownerId, preservePaths, files: incoming, failures: [{ fileName: "", message }] });
      toast.error(message);
    }
  };

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    void handleUpload(selected);
  };

  const handleFolderSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    void handleUpload(selected, true);
  };

  // A dropped folder keeps its structure and skips the browser's folder-upload confirmation;
  // loose files dropped alongside it go up as a plain batch afterwards.
  const uploadDropped = (dataTransfer: DataTransfer, target?: Pick<UploadRetry, "folderId" | "spaceId">) => {
    if (busy || uploadRetry || !canEdit) return;
    const dropped = readDroppedFiles(dataTransfer);
    void dropped.files
      .then(async (droppedFiles) => {
        if (!dropped.hasDirectory) {
          await handleUpload(droppedFiles, false, target);
          return;
        }
        const inFolders = droppedFiles.filter((file) => file.webkitRelativePath?.includes("/"));
        const loose = droppedFiles.filter((file) => !file.webkitRelativePath?.includes("/"));
        if (inFolders.length > 0) await handleUpload(inFolders, true, target);
        if (loose.length > 0) await handleUpload(loose, false, target, { keepRetry: inFolders.length > 0 });
      })
      .catch(() => toast.error("這個資料夾讀不到，請改用「上傳資料夾」"));
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    setDropTargetId(null);
    const payload = readEntryDragPayload(event.dataTransfer);
    if (payload) {
      // Items dropped on the open area (not on a folder) go to the folder being viewed.
      void moveItems(payload, activeFolderId);
      return;
    }
    uploadDropped(event.dataTransfer);
  };

  // ----- downloads and drag-out -------------------------------------------
  // Drag to desktop: Chrome/Edge read a "DownloadURL" entry on dragstart, which must be
  // synchronous, so the signed link is fetched ahead of time when the row is hovered or focused.
  const prefetchDownloadUrl = (file: TestPlanFileRecord) => {
    const cached = downloadUrlCacheRef.current.get(file.id);
    if (cached && cached.expiresAt > Date.now()) return;
    downloadUrlCacheRef.current.set(file.id, { url: "", expiresAt: Date.now() + 15_000 });
    void getFileDownloadUrl(file)
      .then((url) => {
        if (url) downloadUrlCacheRef.current.set(file.id, { url, expiresAt: Date.now() + 8 * 60_000 });
        else downloadUrlCacheRef.current.delete(file.id);
      })
      .catch(() => downloadUrlCacheRef.current.delete(file.id));
  };

  // Files are pulled into memory ahead of a drag so it can carry a same-origin blob: address.
  // Company Chrome policy blocks drag downloads of the raw storage link, so there is no fallback to it.
  const prefetchDragBlob = (file: TestPlanFileRecord, { urgent = true }: { urgent?: boolean } = {}) => {
    const cache = dragBlobCacheRef.current;
    if (file.fileSize > DRAG_BLOB_LIMIT || cache.get(file.id) || dragPrefetchRef.current.has(file.id)) return;
    if (dragPrefetchRef.current.size >= 3) {
      const queue = dragPrefetchQueueRef.current.filter((queued) => queued.id !== file.id);
      dragPrefetchQueueRef.current = urgent ? [file, ...queue] : [...queue, file];
      return;
    }
    dragPrefetchRef.current.add(file.id);
    void (async () => {
      try {
        const url = await getFileDownloadUrl(file).catch(() => null);
        const blob = url
          ? await fetch(url).then((response) => { if (!response.ok) throw new Error(String(response.status)); return response.blob(); })
          : await downloadFile(file);
        // Never trust the stored content type: a same-origin blob: page must not be able to run script.
        const typed = new Blob([blob], { type: "application/octet-stream" });
        cache.set(file.id, URL.createObjectURL(typed), typed.size);
      } catch {
        // This file cannot be dragged to the desktop; the 下載 button still works.
      } finally {
        dragPrefetchRef.current.delete(file.id);
        const next = dragPrefetchQueueRef.current.shift();
        if (next) prefetchDragBlob(next, { urgent: false });
      }
    })();
  };
  // Small files on screen are prepared right away, so even a quick drag finds them ready.
  useEffect(() => {
    const cache = dragBlobCacheRef.current;
    let budget = 48 * 1024 * 1024;
    const eager = visibleEntries
      .filter((entry): entry is Extract<TestPlanEntry, { kind: "file" }> => entry.kind === "file" && entry.fileSize <= 8 * 1024 * 1024)
      .filter((file) => !cache.get(file.id))
      .slice(0, 12)
      .filter((file) => (budget -= file.fileSize) >= 0);
    for (const file of eager) prefetchDragBlob(file, { urgent: false });
  }, [visibleEntries]); // eslint-disable-line react-hooks/exhaustive-deps
  const scheduleDragPrefetch = (file: TestPlanFileRecord) => {
    cancelDragPrefetch(file.id);
    if (file.fileSize > DRAG_BLOB_LIMIT || dragBlobCacheRef.current.get(file.id)) return;
    dragDwellTimersRef.current.set(file.id, window.setTimeout(() => {
      dragDwellTimersRef.current.delete(file.id);
      prefetchDragBlob(file);
    }, 400));
  };
  const cancelDragPrefetch = (fileId: string) => {
    const timer = dragDwellTimersRef.current.get(fileId);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    dragDwellTimersRef.current.delete(fileId);
  };

  // Downloads stream to disk with a visible percentage; a storage without
  // direct links still works through the whole-blob fallback.
  const handleDownload = async (file: TestPlanFileRecord, openSink?: (fileName: string) => Promise<TransferSink | "cancelled">) => {
    const id = `${file.id}:${Date.now()}`;
    const controller = new AbortController();
    const patch = (changes: Partial<TransferItem>) => setDownloads((items) => items.map((item) => (item.id === id ? { ...item, ...changes } : item)));
    setDownloads((items) => [...items, { id, name: file.originalName, loaded: 0, total: file.fileSize, status: "active", cancel: () => controller.abort() }]);
    try {
      const outcome = await downloadWithProgress({
        fileName: file.originalName,
        expectedSize: file.fileSize,
        resolveUrl: () => getFileDownloadUrl(file),
        fallback: () => downloadFile(file),
        signal: controller.signal,
        openSink,
        onProgress: (loaded, total) => patch({ loaded, total }),
      });
      patch({ status: outcome === "saved" ? "done" : "cancelled", cancel: undefined });
      return outcome;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "下載失敗";
      patch({ status: "error", message, cancel: undefined });
      toast.error(message);
      return "error" as const;
    }
  };

  // Several files: one folder dialog, then every file streams into it.
  const downloadEntries = async (entries: readonly TestPlanEntry[]) => {
    const targets = entries.filter(isFileEntry);
    if (targets.length === 0) {
      toast.info("資料夾不能直接下載，請開啟資料夾後選取檔案。");
      return;
    }
    if (targets.length === 1) {
      void handleDownload(targets[0]);
      return;
    }
    const directory = await pickDownloadDirectory();
    if (directory === "cancelled") return;
    let saved = 0;
    for (const file of targets) {
      const outcome = await handleDownload(file, directory ? (fileName) => openDirectorySink(directory, fileName) : undefined);
      if (outcome === "saved") saved += 1;
    }
    if (saved) toast.success(`已下載 ${saved} 個檔案${targets.length > saved ? `，${targets.length - saved} 個未完成` : ""}`);
  };

  const getPreviewUrl = useCallback(async (file: TestPlanFileRecord) => {
    if (typeof getFileDownloadUrls !== "function") return null;
    const urls = await getFileDownloadUrls([file]);
    return urls.get(file.id) ?? null;
  }, [getFileDownloadUrls]);

  // ----- moving -----------------------------------------------------------
  const canMoveTo = (item: MoveItem, targetFolderId: string | null, targetSpaceId: string | null) => {
    if (!canEditSpace(item.spaceId)) return false;
    if (item.folderId === targetFolderId) return false;
    const targetFolder = targetFolderId ? folders.find((folder) => folder.id === targetFolderId) : null;
    if (targetFolderId && (!targetFolder || targetFolder.spaceId !== item.spaceId)) return false;
    if (targetFolderId === null && targetSpaceId !== item.spaceId) return false;
    if (item.kind === "folder" && targetFolderId && (targetFolderId === item.id || isFolderDescendant(folders, targetFolderId, item.id))) return false;
    return true;
  };

  const folderName = (folderId: string | null) => folderId ? folders.find((folder) => folder.id === folderId)?.name ?? "資料夾" : "根目錄";

  const runMoves = async (items: readonly MoveItem[], targetFolderId: string | null) => {
    const moved: MoveItem[] = [];
    let failure: string | null = null;
    for (const item of items) {
      try {
        if (item.kind === "folder") await moveFolder(item.id, targetFolderId);
        else await moveFile(item.id, targetFolderId);
        moved.push(item);
      } catch (caught) {
        failure = caught instanceof Error ? caught.message : "移動失敗";
        break;
      }
    }
    return { moved, failure };
  };

  const moveItems = async (items: readonly MoveItem[], targetFolderId: string | null, targetSpaceId: string | null = activeSpaceId) => {
    setDropTargetId(null);
    if (busy || loading || items.length === 0) return 0;
    const allowed = items.filter((item) => canMoveTo(item, targetFolderId, targetSpaceId));
    if (allowed.length === 0) {
      if (items.some((item) => item.folderId !== targetFolderId)) toast.error("不能移到這裡：只能在同一個人的空間裡移動，且資料夾不能移進自己裡面。");
      else toast.info(`已經在「${folderName(targetFolderId)}」`);
      return 0;
    }
    const { moved, failure } = await runMoves(allowed, targetFolderId);
    if (moved.length) {
      toast.success(`已將 ${moved.length} 個項目移至「${folderName(targetFolderId)}」`, {
        action: { label: "復原", onClick: () => void undoMoves(moved) },
      });
    }
    if (failure) toast.error(failure);
    return moved.length;
  };

  const undoMoves = async (moved: readonly MoveItem[]) => {
    let restored = 0;
    for (const item of moved) {
      try {
        if (item.kind === "folder") await moveFolder(item.id, item.folderId);
        else await moveFile(item.id, item.folderId);
        restored += 1;
      } catch (caught) {
        toast.error(caught instanceof Error ? caught.message : "復原失敗");
        break;
      }
    }
    if (restored) toast.success(`已復原 ${restored} 個項目的位置`);
  };

  const handleFolderDragOver = (targetFolderId: string | null, event: DragEvent<HTMLElement>) => {
    if (isEntryDrag(event.dataTransfer)) {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setDropTargetId(targetFolderId ?? "__root__");
      return;
    }
    const targetSpaceId = targetFolderId ? folders.find((folder) => folder.id === targetFolderId)?.spaceId ?? null : activeSpaceId;
    if (isFileDrag(event.dataTransfer) && targetSpaceId && canEditSpace(targetSpaceId) && !busy && !uploadRetry) {
      // OS files over a folder row upload straight into that folder.
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";
      setIsDragging(true);
      setDropTargetId(targetFolderId ?? "__root__");
    }
  };

  const handleFolderDrop = (targetFolderId: string | null, event: DragEvent<HTMLElement>) => {
    const payload = readEntryDragPayload(event.dataTransfer);
    if (!payload && !isFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    setDropTargetId(null);
    if (payload) {
      void moveItems(payload, targetFolderId);
      return;
    }
    const target = targetFolderId ? folders.find((folder) => folder.id === targetFolderId) : null;
    const targetSpaceId = target ? target.spaceId : activeSpaceId;
    if (!targetSpaceId || !canEditSpace(targetSpaceId)) { toast.error(readOnlyReason); return; }
    uploadDropped(event.dataTransfer, target ? { folderId: target.id, spaceId: target.spaceId } : { folderId: null, spaceId: activeSpaceId });
  };

  const handleEntryDragStart = (entry: TestPlanEntry, event: DragEvent<HTMLElement>) => {
    if (busy || loading || renaming) { event.preventDefault(); return; }
    const dragged = selection.keys.has(entryKey(entry)) && selectedEntries.length > 1 ? selectedEntries : [entry];
    event.dataTransfer.setData(ENTRY_DRAG_TYPE, JSON.stringify({ items: dragged.map(toMoveItem) }));
    event.dataTransfer.setData("text/plain", dragged.map(entryName).join("\n"));
    event.dataTransfer.effectAllowed = dragged.every((item) => canEditSpace(item.spaceId)) ? "copyMove" : "copy";
    dragOutMissingRef.current = null;
    if (dragged.length > 1) {
      dragOutMissingRef.current = { reason: "multiple", name: entryName(entry) };
    } else if (entry.kind === "folder") {
      dragOutMissingRef.current = { reason: "folder", name: entry.name };
    } else {
      cancelDragPrefetch(entry.id);
      // Only the page-held copy: the storage link is a cross-site download that company policy blocks.
      const url = chooseDragDownloadUrl({ blobUrl: dragBlobCacheRef.current.get(entry.id) });
      if (url) {
        event.dataTransfer.setData("DownloadURL", describeDownloadUrl(entry.mimeType, entry.originalName, url));
      } else {
        dragOutMissingRef.current = { reason: entry.fileSize > DRAG_BLOB_LIMIT ? "large" : "preparing", name: entry.originalName };
        prefetchDragBlob(entry);
      }
    }
  };

  // A drag that ends outside the window without a desktop copy explains what to do instead.
  const handleEntryDragEnd = (event: DragEvent<HTMLElement>) => {
    setDropTargetId(null);
    const missing = dragOutMissingRef.current;
    dragOutMissingRef.current = null;
    if (!missing || event.dataTransfer.dropEffect === "move") return;
    const outside = event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight;
    if (!outside) return;
    if (missing.reason === "preparing") toast.info(`「${missing.name}」還在準備，約一秒後再拖一次就能存到桌面；或直接按「下載」。`);
    else if (missing.reason === "large") toast.info(`「${missing.name}」超過 64 MB，不能拖到桌面，請按「下載」。`);
    else if (missing.reason === "multiple") toast.info("一次只能拖一個檔案到桌面。多個檔案請按「下載」，會一起存進你選的資料夾。");
    else toast.info("資料夾不能拖到桌面，請開啟資料夾、選取檔案後按「下載」。");
  };

  const entryDragProps = (entry: TestPlanEntry) => ({
    draggable: !busy && !loading && renaming?.key !== entryKey(entry),
    onDragStart: (event: DragEvent<HTMLElement>) => handleEntryDragStart(entry, event),
    onDragEnd: handleEntryDragEnd,
    onPointerEnter: entry.kind === "file" ? () => { prefetchDownloadUrl(entry); scheduleDragPrefetch(entry); } : undefined,
    onPointerLeave: entry.kind === "file" ? () => cancelDragPrefetch(entry.id) : undefined,
    onPointerDown: entry.kind === "file" ? () => { prefetchDownloadUrl(entry); prefetchDragBlob(entry); } : undefined,
    onFocus: entry.kind === "file" ? () => prefetchDownloadUrl(entry) : undefined,
    ...(entry.kind === "folder"
      ? {
          onDragOver: (event: DragEvent<HTMLElement>) => handleFolderDragOver(entry.id, event),
          onDragLeave: () => setDropTargetId((current) => (current === entry.id ? null : current)),
          onDrop: (event: DragEvent<HTMLElement>) => handleFolderDrop(entry.id, event),
        }
      : {}),
  });

  // ----- cut, paste, rename, new folder, describe, link -------------------
  const cutEntries = (entries: readonly TestPlanEntry[]) => {
    if (busy || loading || entries.length === 0) return;
    if (!entries.every((entry) => canEditSpace(entry.spaceId))) { toast.error(readOnlyReason); return; }
    if (new Set(entries.map((entry) => entry.spaceId)).size > 1) { toast.error("一次只能剪下同一個人空間裡的項目。"); return; }
    setClipboard({ items: entries.map(toMoveItem), spaceId: entries[0].spaceId });
    toast(`已剪下 ${entries.length} 個項目`, { description: "開啟目標資料夾後按 Ctrl+V 或「貼上」即可移過去。" });
  };

  const pasteHere = async () => {
    if (!clipboard) return;
    if (!canPaste) {
      toast.error(activeSpaceId === null ? "請先開啟要貼上的資料夾。" : "只能貼到同一個人的空間，而且需要編輯權限。");
      return;
    }
    const moved = await moveItems(clipboard.items, activeFolderId);
    if (moved > 0) setClipboard(null);
  };

  const startRename = (entry: TestPlanEntry | null) => {
    if (!entry || busy || loading) return;
    if (!canEditSpace(entry.spaceId)) { toast.error(readOnlyReason); return; }
    updateSelection(singleSelection(entryKey(entry)));
    setRenaming({ key: entryKey(entry), value: entryName(entry), error: null });
  };

  // Focus a row (or the list) after the element that had focus went away.
  const focusRowSoon = (key: string | null) => {
    window.requestAnimationFrame(() => {
      const row = key ? rowRefs.current.get(key) : null;
      (row ?? listRef.current)?.focus({ preventScroll: true });
    });
  };

  // Closing a menu or a confirmation puts the keyboard back on the files (not on the menu button),
  // so arrows, Delete and F2 keep working straight away.
  const returnFocusToList = (event: Event) => {
    event.preventDefault();
    focusRowSoon(selection.focus);
  };

  const cancelRename = () => {
    const key = renaming?.key ?? null;
    setRenaming(null);
    focusRowSoon(key);
  };

  const commitRename = async ({ fromBlur = false }: { fromBlur?: boolean } = {}) => {
    if (!renaming || renameCommitRef.current) return;
    const entry = entryByKey.get(renaming.key);
    if (!entry) { setRenaming(null); return; }
    const value = renaming.value.trim();
    const before = entryName(entry);
    if (!value || value === before) { if (fromBlur) setRenaming(null); else cancelRename(); return; }
    const fail = (message: string) => {
      // Leaving the box with an error gives up the rename, so shortcuts keep working.
      if (fromBlur) { setRenaming(null); toast.error(`沒有重新命名：${message}`); }
      else setRenaming((current) => current && { ...current, error: message });
    };
    if (entry.kind === "folder" && folders.some((folder) => folder.id !== entry.id && folder.spaceId === entry.spaceId && folder.parentId === entry.parentId && folder.name.toLocaleLowerCase() === value.toLocaleLowerCase())) {
      fail("這裡已經有同名資料夾");
      return;
    }
    renameCommitRef.current = true;
    try {
      if (entry.kind === "folder") await renameFolder(entry.id, value);
      else await renameFile(entry.id, value);
      setRenaming(null);
      if (!fromBlur) focusRowSoon(entryKey(entry));
      toast.success(`已重新命名為「${value}」`, {
        action: {
          label: "復原",
          onClick: () => void (entry.kind === "folder" ? renameFolder(entry.id, before) : renameFile(entry.id, before))
            .then(() => toast.success(`已改回「${before}」`))
            .catch((caught) => toast.error(caught instanceof Error ? caught.message : "復原失敗")),
        },
      });
    } catch (caught) {
      fail(caught instanceof Error ? caught.message : "重新命名失敗");
    } finally {
      renameCommitRef.current = false;
    }
  };

  const createFolderHere = async () => {
    if (!canEdit || busy || loading) return;
    const parentId = activeSpaceId ? activeFolderId : null;
    const targetSpaceId = activeSpaceId ?? personalSpace?.id ?? null;
    const siblings = new Set(folders.filter((folder) => folder.spaceId === targetSpaceId && folder.parentId === parentId).map((folder) => folder.name.toLocaleLowerCase()));
    let name = "新增資料夾";
    for (let index = 2; siblings.has(name.toLocaleLowerCase()); index += 1) name = `新增資料夾 (${index})`;
    try {
      const created = await createFolder(parentId, name);
      toast.success(`已建立資料夾「${name}」，直接輸入新名稱`);
      if (created?.id) {
        pendingFocusRef.current = `folder:${created.id}`;
        pendingRenameRef.current = `folder:${created.id}`;
        setPendingTick((tick) => tick + 1);
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "建立資料夾失敗");
    }
  };

  const handleDescribeSubmit = async (value: string) => {
    if (!describeAction) return;
    try {
      await updateFileDescription(describeAction.id, value);
      toast.success("說明已儲存");
      setDescribeAction(null);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "操作失敗");
    }
  };

  const copyLink = async (entry: TestPlanEntry | null) => {
    if (!entry) return;
    const url = new URL(window.location.href);
    for (const key of ["fileSearch", "fileType", "fileScope", "fileSort", "fileOrder"]) url.searchParams.delete(key);
    url.searchParams.set("fileSpace", entry.spaceId);
    const parent = entryParent(entry);
    if (parent) url.searchParams.set("fileFolder", parent);
    else url.searchParams.delete("fileFolder");
    url.searchParams.set("fileItem", entryKey(entry));
    try {
      await navigator.clipboard.writeText(url.href);
      toast.success("已複製連結", { description: "同事打開就會直接到這個位置並選取它。" });
    } catch {
      toast.error("無法寫入剪貼簿，請從網址列複製。");
    }
  };

  const handleMoveSubmit = async (targetFolderId: string | null) => {
    if (!moveEntriesAction?.length) return;
    const items = moveEntriesAction.map(toMoveItem);
    const moved = await moveItems(items, targetFolderId, moveEntriesAction[0].spaceId);
    if (moved > 0 || items.every((item) => item.folderId === targetFolderId)) setMoveEntriesAction(null);
  };

  const requestMove = (entries: readonly TestPlanEntry[]) => {
    if (busy || loading || entries.length === 0) return;
    if (!entries.every((entry) => canEditSpace(entry.spaceId))) { toast.error(readOnlyReason); return; }
    if (new Set(entries.map((entry) => entry.spaceId)).size > 1) { toast.error("一次只能移動同一個人空間裡的項目。"); return; }
    setMoveEntriesAction([...entries]);
  };

  // ----- delete -----------------------------------------------------------
  const requestDelete = (entries: readonly TestPlanEntry[]) => {
    if (busy || loading || entries.length === 0) return;
    const targets = entries.filter((entry) => canEditSpace(entry.spaceId));
    if (targets.length === 0) { toast.error("選取的項目都是唯讀，不能刪除。"); return; }
    if (entries.length === 1) {
      const entry = targets[0];
      setDeleteAction(entry.kind === "folder" ? { kind: "folder", id: entry.id, name: entry.name, spaceId: entry.spaceId, ownerId } : { kind: "file", file: entry, ownerId });
      return;
    }
    setDeleteAction({ kind: "batch", entries: targets, scope: selectionScope, skipped: entries.length - targets.length });
  };

  const handleDelete = async () => {
    if (!deleteAction) return;
    if (deleteAction.kind === "batch") {
      const action = deleteAction;
      const context = selectionContext.current;
      if (batchDeleteInFlight.current || context.disabled || context.scope !== action.scope || action.entries.some(entry => !context.eligible.has(entryKey(entry)))) return;
      batchDeleteInFlight.current = true;
      setBatchDeleting(true);
      try {
        const result = await deleteEntries(action.entries);
        if (selectionContext.current.scope !== action.scope) return;
        const deleted = new Set(result.deletedKeys);
        let cursor = activeFolderId;
        const visited = new Set<string>();
        while (cursor && !visited.has(cursor)) {
          if (deleted.has(`folder:${cursor}`)) { setActiveFolderId(null); break; }
          visited.add(cursor);
          cursor = folders.find(folder => folder.id === cursor)?.parentId ?? null;
        }
        updateSelection(current => ({ ...current, keys: new Set([...current.keys].filter(key => !deleted.has(key))) }));
        setDeleteAction(null);
        if (result.deletedKeys.length) {
          if (result.cleanupPending) toast.warning(`已刪除 ${result.deletedKeys.length} 項，實體檔案清理待重試；重新整理時會再處理。`);
          else toast.success(`已刪除 ${result.deletedKeys.length} 項`);
        }
        if (result.failures.length) toast.error(`${result.failures.length} 項刪除失敗，已保留選取：${result.failures[0].message}`);
      } catch (caught) {
        if (selectionContext.current.scope === action.scope) toast.error(caught instanceof Error ? caught.message : "批次刪除失敗，請重試");
      } finally { batchDeleteInFlight.current = false; setBatchDeleting(false); }
      return;
    }
    const action = deleteAction;
    // A confirmation from before an account switch (or one that was closed meanwhile) must not delete.
    if (deleteActionRef.current !== action || action.ownerId !== ownerIdRef.current || busy || loading) return;
    if (!canEditSpace(action.kind === "folder" ? action.spaceId : action.file.spaceId)) {
      toast.error(readOnlyReason);
      setDeleteAction(null);
      return;
    }
    try {
      let cleanupPending = false;
      if (action.kind === "folder") {
        cleanupPending = (await deleteFolder(action.id)).cleanupPending;
        if (ownerIdRef.current !== action.ownerId) return;
        // Leaving a deleted folder (or one inside it) returns to the space root, as the batch path does.
        let cursor = activeFolderId;
        const visited = new Set<string>();
        while (cursor && !visited.has(cursor)) {
          if (cursor === action.id) { setActiveFolderId(null); break; }
          visited.add(cursor);
          cursor = folders.find(folder => folder.id === cursor)?.parentId ?? null;
        }
      } else {
        cleanupPending = (await deleteFile(action.file)).cleanupPending;
        if (ownerIdRef.current !== action.ownerId) return;
      }
      if (cleanupPending) toast.warning("項目已從清單刪除，實體檔案清理待重試；重新整理時會再處理。");
      else toast.success("項目已刪除");
      setDeleteAction(null);
      focusRowSoon(null);
    } catch (caught) {
      if (ownerIdRef.current === action.ownerId) toast.error(caught instanceof Error ? caught.message : "刪除失敗");
    }
  };

  // ----- open, select, keyboard -------------------------------------------
  const openEntry = (entry: TestPlanEntry) => {
    if (busy || loading) return;
    if (entry.kind === "folder") {
      navigate({ spaceId: entry.spaceId, folderId: entry.id });
      return;
    }
    updateSelection(singleSelection(entryKey(entry)));
    if (isEditableSpreadsheet(entry)) setSpreadsheetFile(entry);
    else setPreviewOpen(true);
  };

  const previewEntry = (entry: TestPlanEntry) => {
    updateSelection(singleSelection(entryKey(entry)));
    setPreviewOpen(true);
  };

  const handleRowClick = (entry: TestPlanEntry, event: ReactMouseEvent<HTMLElement>) => {
    if (busy || loading) return;
    const toggle = event.ctrlKey || event.metaKey;
    const extend = event.shiftKey;
    // Touch-sized layouts open on tap; a wide screen selects on click like File Explorer.
    if (compact && !toggle && !extend) {
      if (entry.kind === "folder") openEntry(entry);
      else previewEntry(entry);
      return;
    }
    updateSelection(current => clickSelection(current, orderedKeys, entryKey(entry), { toggle, extend }));
  };

  const toggleChecked = (entry: TestPlanEntry) => {
    if (busy || loading) return;
    updateSelection(current => clickSelection(current, orderedKeys, entryKey(entry), { toggle: true }));
  };

  const focusedEntry = selection.focus ? entryByKey.get(selection.focus) ?? null : null;

  // Explorer shortcuts work anywhere in the file area, except while typing, inside menus and dialogs,
  // and for Enter/Space on a focused button (which must press that button).
  const handleExplorerKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (renaming || isTypingTarget(event.target)) return;
    const target = event.target as HTMLElement;
    if (target.closest("[role='menu'], [role='dialog'], [role='alertdialog'], [role='listbox']")) return;
    // Only the list, the command bar and the page itself drive the file selection; the preview pane
    // scrolls, the navigation pane and address bar keep their own keys, and menu buttons open menus.
    if (target !== event.currentTarget && !target.closest(".test-plan-dropzone, .file-explorer-commandbar")) return;
    if (target.closest("[aria-haspopup]")) return;
    if ((event.key === "Enter" || event.key === " ") && target.closest("button, a")) return;
    if (busy) return;
    const ctrl = event.ctrlKey || event.metaKey;
    // A row reached with Tab has focus but no selection yet; act on it.
    const rowKey = target.closest<HTMLElement>("[data-entry-key]")?.dataset.entryKey;
    const rowEntry = rowKey ? entryByKey.get(rowKey) ?? null : null;
    const actionEntries = selectedEntries.length ? selectedEntries : rowEntry ? [rowEntry] : [];
    const move = (direction: Parameters<typeof moveSelection>[2]) => {
      keyboardFocusRef.current = true;
      updateSelection(current => moveSelection(current, orderedKeys, direction, { extend: event.shiftKey }));
    };
    let handled = true;
    if (event.altKey && event.key === "ArrowUp") goUp();
    else if (event.altKey && event.key === "ArrowLeft") goBack();
    else if (event.altKey && event.key === "ArrowRight") goForward();
    else if (event.key === "ArrowDown") move("next");
    else if (event.key === "ArrowUp") move("previous");
    else if (event.key === "Home") move("first");
    else if (event.key === "End") move("last");
    else if (event.key === "Enter" && (rowEntry ?? focusedEntry)) openEntry((rowEntry ?? focusedEntry)!);
    else if (event.key === "Backspace") { if (canGoBack) goBack(); else goUp(); }
    else if (event.key === "F2") startRename(selectedEntry ?? (actionEntries.length === 1 ? actionEntries[0] : focusedEntry));
    else if (event.key === "Delete") requestDelete(actionEntries);
    else if (event.key === "Escape") updateSelection(EMPTY_SELECTION);
    else if (ctrl && event.key.toLowerCase() === "a") updateSelection(current => selectAll(current, orderedKeys));
    else if (ctrl && event.key.toLowerCase() === "x") cutEntries(selectedEntries);
    else if (ctrl && event.key.toLowerCase() === "v") void pasteHere();
    else if (!ctrl && !event.altKey && event.key.length === 1 && event.key !== " " && event.key !== "/" && event.key !== "?") {
      const now = Date.now();
      const text = now - typeAheadRef.current.at < 700 ? typeAheadRef.current.text + event.key : event.key;
      typeAheadRef.current = { text, at: now };
      const match = typeAheadMatch(orderedEntries.map(entry => ({ key: entryKey(entry), name: entryName(entry) })), selection.focus, text);
      if (match) { keyboardFocusRef.current = true; updateSelection(singleSelection(match)); }
    } else handled = false;
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  // Shortcuts that work anywhere on the page (but never while typing or inside a dialog).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event.target) || document.querySelector("[role='dialog'], [role='alertdialog'], [role='menu']")) return;
      const ctrl = event.ctrlKey || event.metaKey;
      if ((ctrl && event.key.toLowerCase() === "e") || (!ctrl && !event.altKey && event.key === "/")) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (event.altKey && !ctrl && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setPreviewOpen(!previewOpen);
      } else if (!ctrl && !event.altKey && event.key === "?") {
        event.preventDefault();
        openManual("keys");
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openManual, previewOpen, setPreviewOpen]);

  // ----- context menu -----------------------------------------------------
  const handleContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
    if (renaming && isTypingTarget(event.target)) { event.preventDefault(); return; }
    const row = (event.target as HTMLElement).closest<HTMLElement>("[data-entry-key]");
    const key = row?.dataset.entryKey;
    if (key && entryByKey.has(key)) {
      setContextTarget("item");
      updateSelection(current => contextSelection(current, key));
    } else {
      setContextTarget("empty");
      updateSelection(EMPTY_SELECTION);
    }
  };

  const describeTarget = selectedEntry && selectedEntry.kind === "file" ? selectedEntry : null;
  const locationDiffers = (entry: TestPlanEntry | null) => Boolean(entry && (activeSpaceId === null || entry.spaceId !== activeSpaceId || entryParent(entry) !== activeFolderId));

  const renderItemMenu = () => {
    const single = selectedEntry;
    const editable = selectionEditable && !busy;
    return (
      <>
        {single && <ContextMenuItem onSelect={() => openEntry(single)}><FolderOpen className="mr-2 h-4 w-4" />開啟<ContextMenuShortcut>Enter</ContextMenuShortcut></ContextMenuItem>}
        {single?.kind === "file" && <ContextMenuItem onSelect={() => previewEntry(single)}><Eye className="mr-2 h-4 w-4" />預覽<ContextMenuShortcut>Alt+P</ContextMenuShortcut></ContextMenuItem>}
        {selectedFiles.length > 0 && <ContextMenuItem onSelect={() => void downloadEntries(selectedEntries)}><Download className="mr-2 h-4 w-4" />下載{selectedFiles.length > 1 ? ` ${selectedFiles.length} 個檔案` : ""}</ContextMenuItem>}
        {single?.kind === "file" && isEditableSpreadsheet(single) && <ContextMenuItem disabled={busy} onSelect={() => setSpreadsheetFile(single)}><FileSpreadsheet className="mr-2 h-4 w-4" />{canEditSpace(single.spaceId) ? "直接編輯 Excel" : "開啟 Excel"}</ContextMenuItem>}
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!editable || !selectionMovable} onSelect={() => cutEntries(selectedEntries)}><Scissors className="mr-2 h-4 w-4" />剪下<ContextMenuShortcut>Ctrl+X</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem disabled={!editable || !single} onSelect={() => startRename(single)}><Pencil className="mr-2 h-4 w-4" />重新命名<ContextMenuShortcut>F2</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem disabled={!editable || !selectionMovable} onSelect={() => requestMove(selectedEntries)}><FolderInput className="mr-2 h-4 w-4" />移至…</ContextMenuItem>
        {single && <ContextMenuItem onSelect={() => void copyLink(single)}><Link2 className="mr-2 h-4 w-4" />複製連結</ContextMenuItem>}
        {single && locationDiffers(single) && <ContextMenuItem onSelect={() => openLocation(single)}><MapPin className="mr-2 h-4 w-4" />開啟檔案位置</ContextMenuItem>}
        {describeTarget && <ContextMenuItem disabled={!canEditSpace(describeTarget.spaceId) || busy} onSelect={() => setDescribeAction({ id: describeTarget.id, name: describeTarget.originalName, value: describeTarget.description ?? "" })}><FileText className="mr-2 h-4 w-4" />編輯說明</ContextMenuItem>}
        <ContextMenuSeparator />
        <ContextMenuItem disabled={busy || selectedEditable.length === 0} className="text-destructive focus:text-destructive" onSelect={() => requestDelete(selectedEntries)}><Trash2 className="mr-2 h-4 w-4" />刪除<ContextMenuShortcut>Del</ContextMenuShortcut></ContextMenuItem>
      </>
    );
  };

  const renderEmptyMenu = () => (
    <>
      <ContextMenuItem disabled={!canPaste} onSelect={() => void pasteHere()}><ClipboardPaste className="mr-2 h-4 w-4" />貼上{clipboard ? ` ${clipboard.items.length} 個項目` : ""}<ContextMenuShortcut>Ctrl+V</ContextMenuShortcut></ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem disabled={!canEdit || busy || loading} onSelect={() => void createFolderHere()}><FolderPlus className="mr-2 h-4 w-4" />新增資料夾</ContextMenuItem>
      <ContextMenuItem disabled={!canEdit || busy || loading || Boolean(uploadRetry)} onSelect={() => fileInputRef.current?.click()}><Upload className="mr-2 h-4 w-4" />上傳檔案</ContextMenuItem>
      <ContextMenuItem disabled={!canEdit || busy || loading || Boolean(uploadRetry)} onSelect={() => folderInputRef.current?.click()}><FolderUp className="mr-2 h-4 w-4" />上傳資料夾</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem disabled={orderedKeys.length === 0} onSelect={() => updateSelection(current => selectAll(current, orderedKeys))}>全選<ContextMenuShortcut>Ctrl+A</ContextMenuShortcut></ContextMenuItem>
      <ContextMenuItem disabled={loading || busy} onSelect={() => void refreshWorkspace(activeSpaceId)}><RefreshCw className="mr-2 h-4 w-4" />重新整理</ContextMenuItem>
    </>
  );

  // ----- rendering helpers ------------------------------------------------
  const sortArrow = (column: TestPlanSort) => {
    if (sort !== column) return null;
    const ascending = (TEST_PLAN_SORT_DIRECTION[column] === "asc") !== reverse;
    return <span className="file-explorer-sort-arrow" aria-hidden="true">{ascending ? "↑" : "↓"}</span>;
  };
  const ariaSort = (column: TestPlanSort) => sort !== column ? undefined : ((TEST_PLAN_SORT_DIRECTION[column] === "asc") !== reverse ? "ascending" as const : "descending" as const);
  const listColumns = [
    "34px",
    "minmax(0, 1fr)",
    showOwnerColumn ? "minmax(120px, 0.45fr)" : null,
    showLocationColumn ? "minmax(140px, 0.6fr)" : null,
    "170px",
    "124px",
    "100px",
  ].filter(Boolean).join(" ");

  const renderEntryCheckbox = (entry: TestPlanEntry) => (
    <label className="file-library-entry-check" onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      <input type="checkbox" aria-label={`勾選 ${entryName(entry)}`} checked={selection.keys.has(entryKey(entry))} disabled={busy || loading} onChange={() => toggleChecked(entry)} />
    </label>
  );

  const renderName = (entry: TestPlanEntry) => {
    const key = entryKey(entry);
    if (renaming?.key === key) {
      return (
        <span className="file-explorer-rename">
          <input
            className="file-explorer-rename-input"
            aria-label={`重新命名 ${entryName(entry)}`}
            autoFocus
            value={renaming.value}
            maxLength={160}
            disabled={busy}
            onFocus={(event) => {
              const dot = entry.kind === "file" ? event.currentTarget.value.lastIndexOf(".") : -1;
              event.currentTarget.setSelectionRange(0, dot > 0 ? dot : event.currentTarget.value.length);
            }}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onChange={(event) => setRenaming({ ...renaming, value: event.target.value, error: null })}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") { event.preventDefault(); void commitRename(); }
              if (event.key === "Escape") { event.preventDefault(); cancelRename(); }
            }}
            onBlur={() => void commitRename({ fromBlur: true })}
          />
          {renaming.error && <span className="file-explorer-rename-error" role="alert">{renaming.error}</span>}
        </span>
      );
    }
    const name = entryName(entry);
    const dot = entry.kind === "file" ? name.lastIndexOf(".") : -1;
    return (
      <span className="file-library-name-cell" title={entry.kind === "file" && entry.description ? `${name}\n${entry.description}` : name}>
        {dot > 0 ? <>{name.slice(0, dot)}<span className="file-explorer-ext">{name.slice(dot)}</span></> : name}
      </span>
    );
  };

  const renderQuickActions = (entry: TestPlanEntry) => (
    <span className="file-explorer-quick" onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
      {entry.kind === "file" ? (
        <>
          <button type="button" tabIndex={-1} onClick={() => void handleDownload(entry)} title="下載"><Download className="h-3.5 w-3.5" />下載</button>
          {!previewOpen && <button type="button" tabIndex={-1} onClick={() => previewEntry(entry)} title="預覽（Alt+P）"><Eye className="h-3.5 w-3.5" />預覽</button>}
        </>
      ) : (
        <button type="button" tabIndex={-1} onClick={() => openEntry(entry)} title="開啟（Enter）"><FolderOpen className="h-3.5 w-3.5" />開啟</button>
      )}
    </span>
  );

  const rowProps = (entry: TestPlanEntry, index: number) => {
    const key = entryKey(entry);
    const selected = selection.keys.has(key);
    return {
      "data-entry-key": key,
      ref: (element: HTMLElement | null) => { if (element) rowRefs.current.set(key, element); else rowRefs.current.delete(key); },
      tabIndex: selection.focus ? (selection.focus === key ? 0 : -1) : index === 0 ? 0 : -1,
      "aria-selected": selected,
      onClick: (event: ReactMouseEvent<HTMLElement>) => handleRowClick(entry, event),
      onDoubleClick: () => openEntry(entry),
      ...entryDragProps(entry),
    };
  };

  const thumbnailUrl = (entry: TestPlanEntry) => {
    if (entry.kind !== "file" || entry.category !== "image" || entry.extension.toLowerCase() === "svg") return null;
    const cached = downloadUrlCacheRef.current.get(entry.id);
    return cached?.url && cached.expiresAt > Date.now() ? cached.url : null;
  };
  void linkVersion;

  const activeLocationName = activeSpaceId === null ? "所有檔案（所有人）" : isOwnSpace ? "我的空間" : `${activeSpace?.name ?? "載入中"} 的空間`;
  const searchLocationName = activeSpaceId === null ? "所有人的檔案" : scope === "folder" && breadcrumbs.length ? breadcrumbs[breadcrumbs.length - 1].name : activeLocationName;
  const uploadDisabled = !canEdit || loading || busy || Boolean(uploadRetry);
  const dropLabel = dropTargetId && dropTargetId !== "__root__" ? folderName(dropTargetId) : activeSpaceId ? (breadcrumbs.length ? breadcrumbs[breadcrumbs.length - 1].name : activeLocationName) : "我的空間";
  const showPreviewPane = previewOpen && (!compact || selectedEntries.length > 0);

  const renderSpaceRow = (space: (typeof spaces)[number]) => (
    <Fragment key={space.id}>
      <div
        className={cn(
          "test-plan-space-row",
          activeSpaceId === space.id && "is-active",
          activeSpaceId === space.id && dropTargetId === "__root__" && "is-drop-target",
        )}
      >
        <button
          type="button"
          disabled={busy || loading}
          aria-label={`開啟 ${space.name}${space.description ? `（${space.description}）` : ""} 的檔案空間`}
          aria-current={activeSpaceId === space.id ? "page" : undefined}
          title={`${space.name} ${space.description ?? ""}`}
          onClick={() => navigate({ spaceId: space.id, folderId: null })}
          onDragOver={(event) => activeSpaceId === space.id && handleFolderDragOver(null, event)}
          onDragLeave={() => setDropTargetId((current) => (current === "__root__" ? null : current))}
          onDrop={(event) => activeSpaceId === space.id && handleFolderDrop(null, event)}
        >
          <span className="file-library-user-icon" aria-hidden="true" data-initials={spaceInitials(space.name)} style={spaceSwatch(space.color)} />
          <span className="file-library-user-identity">
            <strong>{space.name}</strong>
            {space.description && <small>{space.description}</small>}
          </span>
          {space.ownerId === ownerId && <Badge variant="secondary" className="file-library-current-user">我</Badge>}
          {space.ownerId !== ownerId && !canEditSpace(space.id) && <LockKeyhole className="file-explorer-lock" aria-label="唯讀" />}
        </button>
      </div>
      {activeSpaceId === space.id && (
        <div className="test-plan-folder-tree" aria-label={`${space.name} 的資料夾`}>
          <FolderBranch
            folders={folders}
            files={files}
            parentId={null}
            activeFolderId={activeFolderId}
            expandedFolderIds={expandedFolderIds}
            onOpen={(folderId) => navigate({ spaceId: space.id, folderId })}
            onToggle={(folderId) =>
              setExpandedFolderIds((current) => {
                const next = new Set(current);
                if (next.has(folderId)) next.delete(folderId);
                else next.add(folderId);
                return next;
              })}
            dropTargetId={dropTargetId}
            onDragOverFolder={handleFolderDragOver}
            onDropOnFolder={handleFolderDrop}
            onDragLeaveFolder={() => setDropTargetId(null)}
          />
        </div>
      )}
    </Fragment>
  );

  // ----- pane splitters (drag the edge between panes, like File Explorer) --------
  const currentPaneWidth = (pane: keyof PaneWidths) => {
    const shell = shellRef.current;
    const element = shell?.querySelector<HTMLElement>(pane === "nav" ? ".test-plan-space-rail" : ".test-plan-inspector");
    return element?.getBoundingClientRect().width ?? (pane === "nav" ? NAV_WIDTH.default : PREVIEW_WIDTH.default);
  };
  const clampPaneWidth = (pane: keyof PaneWidths, width: number) => {
    const limits = pane === "nav" ? NAV_WIDTH : PREVIEW_WIDTH;
    const shellWidth = shellRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    const other = pane === "nav" ? (showPreviewPane ? currentPaneWidth("preview") : 0) : currentPaneWidth("nav");
    const room = Math.max(limits.min, shellWidth - other - LIST_MIN_WIDTH);
    return Math.round(Math.min(Math.max(width, limits.min), limits.max, room));
  };
  const setPaneWidth = (pane: keyof PaneWidths, width: number | null, persist: boolean) => {
    setPaneWidths((current) => {
      const next = { ...current, [pane]: width === null ? null : clampPaneWidth(pane, width) };
      if (persist) savePaneWidths(next);
      return next;
    });
  };
  const startPaneResize = (pane: keyof PaneWidths, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.focus({ preventScroll: true });
    const startX = event.clientX;
    const startWidth = currentPaneWidth(pane);
    let latest = startWidth;
    document.body.classList.add("file-explorer-resizing");
    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      latest = pane === "nav" ? startWidth + delta : startWidth - delta;
      setPaneWidth(pane, latest, false);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("file-explorer-resizing");
      setPaneWidth(pane, latest, true);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  const resizePaneByKey = (pane: keyof PaneWidths, event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 64 : 16;
    const grow = pane === "nav" ? event.key === "ArrowRight" : event.key === "ArrowLeft";
    const shrink = pane === "nav" ? event.key === "ArrowLeft" : event.key === "ArrowRight";
    if (!grow && !shrink && event.key !== "Home") return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Home") { setPaneWidth(pane, null, true); return; }
    setPaneWidth(pane, currentPaneWidth(pane) + (grow ? step : -step), true);
  };
  const renderSplitter = (pane: keyof PaneWidths) => {
    const label = pane === "nav" ? "調整左側使用者空間的寬度" : "調整預覽窗格的寬度";
    const width = paneWidths[pane];
    return (
      <div
        className={cn("file-explorer-splitter", pane === "nav" ? "is-nav" : "is-preview")}
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-valuenow={width ?? undefined}
        tabIndex={0}
        title={`${label}：拖曳邊界；按兩下恢復預設寬度`}
        onPointerDown={(event) => startPaneResize(pane, event)}
        onDoubleClick={() => setPaneWidth(pane, null, true)}
        onKeyDown={(event) => resizePaneByKey(pane, event)}
      />
    );
  };
  const shellStyle = {
    ...(paneWidths.nav !== null ? { "--fx-nav-width": `${paneWidths.nav}px` } : {}),
    ...(paneWidths.preview !== null ? { "--fx-preview-width": `${paneWidths.preview}px` } : {}),
  } as CSSProperties;

  const commandButton = (props: { label: string; icon: typeof Download; onClick: () => void; disabled?: boolean; title?: string; className?: string; testId?: string; compactable?: boolean }) => (
    <Button
      type="button"
      variant="ghost"
      className={cn("file-explorer-command", props.compactable && "is-compactable", props.className)}
      disabled={props.disabled}
      title={props.title ?? props.label}
      onClick={props.onClick}
      data-testid={props.testId}
    >
      <props.icon className="h-4 w-4" />
      <span>{props.label}</span>
    </Button>
  );

  return (
    <section className={cn("test-plan-workspace file-library-workspace file-explorer", compact && "is-compact")} onKeyDown={handleExplorerKeyDown}>
      <input ref={fileInputRef} className="sr-only" type="file" multiple disabled={uploadDisabled} onChange={handleFileSelection} />
      <input ref={folderInputRef} className="sr-only" type="file" multiple {...directoryInputProps} disabled={uploadDisabled} aria-label="選擇上傳資料夾" onChange={handleFolderSelection} />
      {uploadRetry && (
        <section className="file-library-upload-errors" role="alert" aria-label="上傳失敗清單">
          <div className="file-library-upload-error-heading">
            <strong>{uploadRetry.files.length} 個檔案未上傳</strong>
            <Button variant="outline" size="sm" aria-label="重試未上傳檔案" disabled={!canEdit || loading || busy} onClick={() => void handleUpload(uploadRetry.files, uploadRetry.preservePaths, uploadRetry)}>重試未上傳檔案</Button>
            <Button variant="ghost" size="icon" aria-label="關閉上傳失敗清單" disabled={busy} onClick={() => setUploadRetry(null)}><X className="h-4 w-4" /></Button>
          </div>
          <p>成功的檔案已保留，重試會使用原空間與資料夾</p>
          <p>原檔仍在你的電腦；同頁按「重試未上傳檔案」可重試，大檔案傳輸中斷時可續傳。切換工作區後回來仍可重試；重新整理或關閉頁面後，須重新選取原檔。</p>
          <ul>{uploadRetry.failures.map((failure, index) => <li key={`${failure.fileName}:${index}`}><strong>{failure.fileName || "整批上傳"}</strong><span>{failure.message}</span></li>)}</ul>
        </section>
      )}
      {isSpaceDrawerOpen && (
        <button
          type="button"
          className="test-plan-drawer-backdrop"
          aria-label="關閉空間選單"
          onClick={() => setIsSpaceDrawerOpen(false)}
        />
      )}

      <div className="file-explorer-commandbar" role="toolbar" aria-label="檔案操作">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="file-library-navigation-toggle"
          aria-label="空間與資料夾"
          aria-expanded={isSpaceDrawerOpen}
          aria-controls="test-plan-space-drawer"
          onClick={() => setIsSpaceDrawerOpen(true)}
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
        <Button type="button" className="file-explorer-command is-primary" disabled={uploadDisabled} title={activeSpaceId === null ? "上傳到我的空間" : "上傳到目前資料夾；也可以直接把檔案拖進清單"} onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-4 w-4" /><span>上傳檔案</span>
        </Button>
        <Button type="button" variant="ghost" className="file-explorer-command" aria-label="上傳資料夾" disabled={uploadDisabled} title="瀏覽器會再問一次是否上傳；直接把資料夾拖進清單就不會" onClick={() => folderInputRef.current?.click()}>
          <FolderUp className="h-4 w-4" /><span>上傳資料夾</span>
        </Button>
        {commandButton({ label: "新增資料夾", icon: FolderPlus, disabled: !canEdit || loading || busy, onClick: () => void createFolderHere(), title: canEdit ? "在目前位置建立資料夾，並直接輸入名稱" : readOnlyReason })}
        <span className="file-explorer-divider" aria-hidden="true" />
        {commandButton({ compactable: true, label: "剪下", icon: Scissors, disabled: !selectionMovable || busy, onClick: () => cutEntries(selectedEntries), title: selectedEntries.length === 0 ? "先選取項目（Ctrl+X）" : selectionEditable ? "剪下（Ctrl+X），到目標資料夾再貼上" : readOnlyReason })}
        {commandButton({ compactable: true, label: "貼上", icon: ClipboardPaste, disabled: !canPaste, onClick: () => void pasteHere(), title: clipboard ? `把剪下的 ${clipboard.items.length} 個項目移到這裡（Ctrl+V）` : "先剪下項目（Ctrl+X）" })}
        {commandButton({ label: "重新命名", icon: Pencil, disabled: !selectedEntry || !selectionEditable || busy, onClick: () => startRename(selectedEntry), title: selectedEntry ? (selectionEditable ? "重新命名（F2）" : readOnlyReason) : "選取一個項目（F2）" })}
        {commandButton({ label: "移至", icon: FolderInput, disabled: !selectionMovable || busy, onClick: () => requestMove(selectedEntries), title: selectedEntries.length === 0 ? "先選取項目" : selectionEditable ? "選擇目標資料夾；也可以直接拖曳" : readOnlyReason })}
        {commandButton({ label: "下載", icon: Download, disabled: selectedFiles.length === 0, onClick: () => void downloadEntries(selectedEntries), title: selectedFiles.length > 1 ? `下載 ${selectedFiles.length} 個檔案到同一個資料夾` : "下載；也可以把檔案直接拖到桌面" })}
        {commandButton({ compactable: true, label: "複製連結", icon: Link2, disabled: !selectedEntry, onClick: () => void copyLink(selectedEntry), title: "複製能直接打開這個位置的連結" })}
        {commandButton({ label: "刪除", icon: Trash2, disabled: busy || loading || selectedEditable.length === 0, onClick: () => requestDelete(selectedEntries), className: "is-danger", title: selectedEntries.length && !selectedEditable.length ? readOnlyReason : "刪除（Delete）" })}
        <span className="file-explorer-divider" aria-hidden="true" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" className="file-explorer-command is-compactable" aria-label="排序方式" title="排序方式；也可以直接點欄位標題">
              <ArrowDownUp className="h-4 w-4" /><span>排序</span><ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" onCloseAutoFocus={returnFocusToList}>
            <DropdownMenuLabel>排序方式</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={sort} onValueChange={(value) => setSort(value as TestPlanSort)}>
              {Object.entries(SORT_LABELS).map(([value, label]) => <DropdownMenuRadioItem key={value} value={value}>{label}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={reverse ? "reverse" : "natural"} onValueChange={(value) => setReverse(value === "reverse")}>
              <DropdownMenuRadioItem value="natural">{TEST_PLAN_SORT_DIRECTION[sort] === "asc" ? "遞增" : "遞減"}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="reverse">{TEST_PLAN_SORT_DIRECTION[sort] === "asc" ? "遞減" : "遞增"}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" className="file-explorer-command is-compactable" aria-label="檢視方式" title="檢視方式">
              {viewMode === "list" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}<span>檢視</span><ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" onCloseAutoFocus={returnFocusToList}>
            <DropdownMenuRadioGroup value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
              <DropdownMenuRadioItem value="list">詳細資料</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="grid">大圖示</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="file-explorer-spacer" />
        {selectedEntries.length > 0 && <span className="file-explorer-selection" role="status">已選取 {selectedEntries.length} 個項目</span>}
        <Button
          type="button"
          variant="ghost"
          className={cn("file-explorer-command file-explorer-toggle", previewOpen && "is-on")}
          aria-pressed={previewOpen}
          title="預覽窗格（Alt+P）"
          onClick={() => setPreviewOpen(!previewOpen)}
        >
          <PanelRight className="h-4 w-4" /><span>預覽窗格</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={cn("file-explorer-command file-explorer-manual", !manualSeen && "is-new")}
          title="操作手冊：上傳、找檔案、預覽、多選、移動、分享與快捷鍵（也可以按 ?）"
          onClick={() => openManual()}
        >
          <BookOpen className="h-4 w-4" /><span>操作手冊</span>
        </Button>
      </div>

      <div className="file-explorer-addressbar">
        <div className="file-explorer-nav-buttons">
          <Button type="button" variant="ghost" size="icon" aria-label="返回（Alt+←）" title="返回（Alt+←）" disabled={!canGoBack || busy} onClick={goBack}><ArrowLeft className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label="前進（Alt+→）" title="前進（Alt+→）" disabled={!canGoForward || busy} onClick={goForward}><ArrowRight className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label="上一層（Alt+↑）" title="上一層（Alt+↑）" disabled={!canGoUp || busy} onClick={goUp}><ArrowUp className="h-4 w-4" /></Button>
        </div>
        <nav className="test-plan-location" aria-label="目前位置">
          {activeSpaceId === null ? <Globe className="file-explorer-location-icon" aria-hidden="true" /> : isOwnSpace ? <UserRound className="file-explorer-location-icon" aria-hidden="true" /> : <Users className="file-explorer-location-icon" aria-hidden="true" />}
          <button
            type="button"
            className={cn(dropTargetId === "__root__" && "is-drop-target")}
            onClick={() => navigate({ spaceId: activeSpaceId, folderId: null })}
            onDragOver={(event) => activeSpaceId && handleFolderDragOver(null, event)}
            onDragLeave={() => setDropTargetId((current) => (current === "__root__" ? null : current))}
            onDrop={(event) => handleFolderDrop(null, event)}
          >
            {activeLocationName}
          </button>
          {[null, ...breadcrumbs.map((folder) => folder.id)].map((levelId, index) => {
            const children = activeSpaceId ? folders.filter((folder) => folder.parentId === levelId).sort((first, second) => first.name.localeCompare(second.name, "zh-Hant", { numeric: true })) : [];
            const folder = index > 0 ? breadcrumbs[index - 1] : null;
            return (
              <Fragment key={levelId ?? "root"}>
                {folder && (
                  <button
                    type="button"
                    className={cn(dropTargetId === folder.id && "is-drop-target")}
                    onClick={() => navigate({ spaceId: activeSpaceId, folderId: folder.id })}
                    onDragOver={(event) => handleFolderDragOver(folder.id, event)}
                    onDragLeave={() => setDropTargetId((current) => (current === folder.id ? null : current))}
                    onDrop={(event) => handleFolderDrop(folder.id, event)}
                  >
                    {folder.name}
                  </button>
                )}
                {children.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="file-explorer-crumb-chevron" aria-label={`${folder?.name ?? activeLocationName} 底下的資料夾`}><ChevronRight className="h-3.5 w-3.5" /></button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
                      {children.map((child) => (
                        <DropdownMenuItem key={child.id} onSelect={() => navigate({ spaceId: activeSpaceId, folderId: child.id })}>
                          <Folder className="mr-2 h-4 w-4" />{child.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : index < breadcrumbs.length ? <ChevronRight className="file-explorer-crumb-sep h-3.5 w-3.5" aria-hidden="true" /> : null}
              </Fragment>
            );
          })}
        </nav>
        <Button type="button" variant="ghost" size="icon" aria-label="重新整理" title="重新整理" disabled={loading || busy} onClick={() => void refreshWorkspace(activeSpaceId)}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
        <div className="file-explorer-search" role="search">
          <Search className="h-4 w-4" aria-hidden="true" />
          <input
            ref={searchInputRef}
            className="file-explorer-search-input"
            type="search"
            data-ai-surface="true"
            value={query}
            disabled={busy}
            aria-label="搜尋檔案與資料夾"
            placeholder={`搜尋「${searchLocationName}」 (Ctrl+E)`}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) { event.preventDefault(); setQuery(""); }
              if (event.key === "ArrowDown" || event.key === "Enter") {
                event.preventDefault();
                keyboardFocusRef.current = true;
                updateSelection(current => current.focus ? current : moveSelection(current, orderedKeys, "first"));
                const first = orderedKeys[0];
                if (first) rowRefs.current.get(selection.focus ?? first)?.focus();
              }
            }}
          />
          <Select
            value={activeSpaceId === null ? "everyone" : scope}
            disabled={busy}
            onValueChange={(value) => {
              if (value === "everyone") { if (activeSpaceId !== null) navigate({ spaceId: null, folderId: null }); return; }
              setScope(value as FileSearchScope);
            }}
          >
            <SelectTrigger className="file-explorer-scope" aria-label="搜尋範圍">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="folder" disabled={activeSpaceId === null}>{SCOPE_LABELS.folder}</SelectItem>
              <SelectItem value="space" disabled={activeSpaceId === null}>{SCOPE_LABELS.space}</SelectItem>
              <SelectItem value="everyone">{SCOPE_LABELS.everyone}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Select
          value={categoryFilter}
          disabled={busy}
          onValueChange={(value) =>
            setCategoryFilter(value as TestPlanFileCategory | "all")}
        >
          <SelectTrigger className="file-explorer-format" aria-label="檔案格式">
            <Filter className="h-3.5 w-3.5 opacity-70" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div ref={shellRef} style={shellStyle} className={cn("test-plan-shell", showPreviewPane && "has-inspector", !previewOpen && "is-preview-closed")}>
        {!compact && renderSplitter("nav")}
        {!compact && showPreviewPane && renderSplitter("preview")}
        <aside
          id="test-plan-space-drawer"
          className={cn(
            "test-plan-space-rail",
            isSpaceDrawerOpen && "is-mobile-open",
          )}
          aria-label="使用者空間與資料夾"
        >
          <div className="test-plan-rail-heading">
            <strong>使用者空間</strong>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="test-plan-drawer-close h-9 w-9"
              onClick={() => setIsSpaceDrawerOpen(false)}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">關閉空間選單</span>
            </Button>
          </div>

          <div className="test-plan-space-list">
            <p className="file-library-rail-label">我的空間</p>
            {ownSpaces.length === 0 && <p className="file-library-rail-empty">個人空間建立中，重新整理後再試。</p>}
            {ownSpaces.map(renderSpaceRow)}
            {teamSpaces.length > 0 && <p className="file-library-rail-label" title="管理員角色的帳號固定排在這裡；其他同事在下方「其他使用者」">管理員</p>}
            {teamSpaces.map(renderSpaceRow)}
            {otherSpaces.length > 0 && (
              <>
                <p className="file-library-rail-label"><span>其他使用者</span><span className="file-explorer-count">{otherSpaces.length} 人</span></p>
                <label className="file-explorer-people-filter">
                  <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                  <input value={peopleFilter} onChange={(event) => setPeopleFilter(event.target.value)} placeholder="篩選人員…" aria-label="篩選其他使用者" />
                  {peopleFilter && <button type="button" aria-label="清除人員篩選" onClick={() => setPeopleFilter("")}><X className="h-3.5 w-3.5" /></button>}
                </label>
                {listedOtherSpaces.map(renderSpaceRow)}
                {listedOtherSpaces.length === 0 && <p className="file-library-rail-empty">沒有符合「{peopleFilter}」的人員</p>}
              </>
            )}
            <p className="file-library-rail-label">跨使用者</p>
            <button
              type="button"
              className={cn("file-library-all", activeSpaceId === null && "is-active")}
              disabled={busy || loading}
              onClick={() => navigate({ spaceId: null, folderId: null })}
            >
              <Globe className="h-4 w-4" /><span>所有檔案（所有人）</span><span className="file-library-count">{activeSpaceId === null ? files.length : ""}</span>
            </button>
          </div>
        </aside>

        <main className={cn("test-plan-main", spaces.length === 0 && "is-empty")}>
          {!isAuthenticated && error ? (
            <div className="test-plan-empty" role="alert">
              <span className="test-plan-empty-icon">
                <LockKeyhole className="h-8 w-8" />
              </span>
              <h2>需要安全登入</h2>
              <p>{error}</p>
            </div>
          ) : error && spaces.length === 0 && !loading ? (
            <div className="test-plan-empty" role="alert">
              <h2>檔案載入失敗</h2>
              <p>{error}</p>
              <Button variant="outline" onClick={() => void refreshWorkspace(null)}>
                <RefreshCw className="mr-2 h-4 w-4" />重試
              </Button>
            </div>
          ) : spaces.length === 0 && !loading ? (
            <div className="test-plan-empty">
              <span className="test-plan-empty-icon">
                <FolderOpen className="h-8 w-8" />
              </span>
              <h2>尚未載入使用者空間</h2>
              <p>使用者空間會在帳號啟用時自動建立，請重新整理後再試。</p>
              <Button
                disabled={busy}
                onClick={() => void refreshWorkspace(null)}
              >
                <RefreshCw data-icon="inline-start" />重新整理
              </Button>
            </div>
          ) : (
            <>
              {(query.trim() || categoryFilter !== "all") && (
                <div className="file-library-filter-chips" aria-label="目前篩選條件">
                  {query.trim() && <Button variant="secondary" size="sm" disabled={busy} onClick={() => setQuery("")} aria-label="清除搜尋條件">搜尋：{query}<X /></Button>}
                  {query.trim() && scope === "folder" && activeSpaceId && <Button variant="secondary" size="sm" disabled={busy} onClick={() => setScope("space")} aria-label="清除範圍條件">範圍：目前資料夾<X /></Button>}
                  {categoryFilter !== "all" && <Button variant="secondary" size="sm" disabled={busy} onClick={() => setCategoryFilter("all")} aria-label="清除格式條件">格式：{CATEGORY_LABELS[categoryFilter]}<X /></Button>}
                  <Button variant="ghost" size="sm" disabled={busy} onClick={clearFilters}>全部清除</Button>
                </div>
              )}

              {error && (
                <div className="test-plan-error" role="alert">
                  <strong>資料讀取失敗</strong>
                  <span>{error}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void refreshWorkspace(activeSpaceId)}
                  >
                    重試
                  </Button>
                </div>
              )}

              <ContextMenu>
                <ContextMenuTrigger asChild disabled={loading}>
                  <div
                    ref={listRef}
                    className={cn(
                      "test-plan-dropzone",
                      isDragging && "is-dragging",
                      selection.keys.size > 0 && "has-selection",
                    )}
                    style={{ "--file-explorer-columns": listColumns } as CSSProperties}
                    tabIndex={-1}
                    aria-label="檔案清單"
                    onMouseDown={(event) => {
                      // Clicking empty space keeps keyboard shortcuts (Ctrl+V, Ctrl+A …) working on the list.
                      if (!(event.target as HTMLElement).closest("button, input, a, [data-entry-key]")) listRef.current?.focus({ preventScroll: true });
                    }}
                    onContextMenu={handleContextMenu}
                    onClick={(event) => {
                      if (event.target === event.currentTarget || (event.target as HTMLElement).classList.contains("test-plan-entry-grid") || (event.target as HTMLElement).classList.contains("test-plan-entry-list")) updateSelection(EMPTY_SELECTION);
                    }}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      if (isEntryDrag(event.dataTransfer)) return;
                      if (canEdit && !loading && !busy && !uploadRetry) setIsDragging(true);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (isEntryDrag(event.dataTransfer)) event.dataTransfer.dropEffect = "move";
                      else if (dropTargetId && dropTargetId !== "__root__" && (event.target as HTMLElement).closest?.("[data-entry-key^='folder:']") === null) setDropTargetId(null);
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                        setIsDragging(false);
                        setDropTargetId(null);
                      }
                    }}
                    onDrop={handleDrop}
                  >
                    {isDragging && (
                      <div className="test-plan-drop-overlay" aria-live="polite">
                        <HardDriveUpload className="h-9 w-9" />
                        <strong>放開以上傳到「{dropLabel}」</strong>
                        <span>可直接拖整個資料夾 · 一次最多 20 個檔案，單檔 1 GB，整批合計 1 GB</span>
                      </div>
                    )}
                    <div className="file-explorer-scroll">

                    {viewMode === "list" && (
                      <div className="test-plan-list-head" role="row">
                        <span className="file-explorer-check-cell">
                          <input
                            type="checkbox"
                            aria-label="全選目前清單"
                            checked={allSelected}
                            aria-checked={allSelected ? "true" : selection.keys.size ? "mixed" : "false"}
                            ref={input => { if (input) input.indeterminate = !allSelected && selection.keys.size > 0; }}
                            disabled={busy || loading || !orderedKeys.length}
                            onChange={(event) => updateSelection(current => event.target.checked ? selectAll(current, orderedKeys) : EMPTY_SELECTION)}
                          />
                        </span>
                        <button type="button" className="file-explorer-col-head" data-sort="name" aria-sort={ariaSort("name")} onClick={() => toggleSort("name")}>名稱{sortArrow("name")}</button>
                        {showOwnerColumn && <span className="file-explorer-col-head is-static" data-col="owner">擁有者</span>}
                        {showLocationColumn && <span className="file-explorer-col-head is-static" data-col="location">位置</span>}
                        <button type="button" className="file-explorer-col-head" data-col="date" data-sort="newest" aria-sort={ariaSort("newest")} onClick={() => toggleSort("newest")}>修改日期{sortArrow("newest")}</button>
                        <button type="button" className="file-explorer-col-head" data-col="type" data-sort="type" aria-sort={ariaSort("type")} onClick={() => toggleSort("type")}>類型{sortArrow("type")}</button>
                        <button type="button" className="file-explorer-col-head is-number" data-col="size" data-sort="largest" aria-sort={ariaSort("largest")} onClick={() => toggleSort("largest")}>大小{sortArrow("largest")}</button>
                      </div>
                    )}
                    {loading ? (
                      <div className="test-plan-loading">
                        <RefreshCw className="h-5 w-5 animate-spin" />
                        正在載入資料儲存…
                      </div>
                    ) : visibleEntries.length === 0 ? (
                      <div className="test-plan-empty is-compact">
                        <FolderOpen className="h-8 w-8" />
                        <h2>{query || categoryFilter !== "all" ? "目前篩選條件沒有符合的檔案" : activeFolderId ? "這個資料夾目前是空的" : activeSpaceId ? "這個使用者空間目前是空的" : "尚未上傳檔案"}</h2>
                        <p>
                          {query || categoryFilter !== "all"
                            ? "請調整搜尋字詞或檔案類型。"
                            : canEdit ? "把檔案或整個資料夾拖到這裡，或按上方的「上傳檔案」。" : "切換到我的空間，即可整理及上傳自己的檔案。"}
                        </p>
                        {query && activeSpaceId !== null && (
                          <Button type="button" variant="outline" size="sm" onClick={() => navigate({ spaceId: null, folderId: null })}>
                            <Globe className="mr-2 h-4 w-4" />改在所有人的檔案中搜尋「{query}」
                          </Button>
                        )}
                      </div>
                    ) : viewMode === "grid" ? (
                      <div className="test-plan-entry-grid">
                        {listSections.flatMap((section) => [
                          ...(section.label ? [<div key={`group:${section.key}`} className="file-library-owner-group" role="presentation"><span>{section.label}</span><small>{section.entries.length} 項</small></div>] : []),
                          ...section.entries.map((entry) => {
                            const key = entryKey(entry);
                            const thumb = thumbnailUrl(entry);
                            return (
                              <article
                                key={key}
                                className={cn(
                                  "test-plan-entry-card",
                                  selection.keys.has(key) && "is-selected",
                                  cutKeys.has(key) && "is-cut",
                                  entry.kind === "folder" && dropTargetId === entry.id && "is-drop-target",
                                )}
                                {...rowProps(entry, orderedKeys.indexOf(key))}
                              >
                                {renderEntryCheckbox(entry)}
                                <div className={cn("test-plan-entry-thumb file-type", entry.kind === "folder" ? "is-folder" : `is-${entry.category}`)}>
                                  {thumb ? <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <FileTypeIcon entry={entry} className="h-10 w-10" />}
                                </div>
                                {renderName(entry)}
                                <span className="file-explorer-card-meta">
                                  {entry.kind === "folder" ? `${folderCounts(entry.id).folders + folderCounts(entry.id).files} 個項目` : `${describeEntryType(entry)} · ${formatTestPlanFileSize(entry.fileSize)}`}
                                </span>
                              </article>
                            );
                          }),
                        ])}
                      </div>
                    ) : (
                      <div className="test-plan-entry-list" role="rowgroup">
                        {listSections.flatMap((section) => [
                          ...(section.label ? [<div key={`group:${section.key}`} className="file-library-owner-group" role="presentation"><span>{section.label}</span><small>{section.entries.length} 項</small></div>] : []),
                          ...section.entries.map((entry) => {
                            const key = entryKey(entry);
                            return (
                              <article
                                key={key}
                                role="row"
                                className={cn(
                                  "test-plan-list-row",
                                  selection.keys.has(key) && "is-selected",
                                  selection.focus === key && "is-focused",
                                  cutKeys.has(key) && "is-cut",
                                  entry.kind === "folder" && dropTargetId === entry.id && "is-drop-target",
                                )}
                                {...rowProps(entry, orderedKeys.indexOf(key))}
                              >
                                <span className="file-explorer-check-cell">{renderEntryCheckbox(entry)}</span>
                                <span className="test-plan-list-name">
                                  <span className={cn("file-library-type file-type", entry.kind === "folder" ? "is-folder" : `is-${entry.category}`)} aria-hidden="true">
                                    <FileTypeIcon entry={entry} />
                                  </span>
                                  {renderName(entry)}
                                  {renaming?.key !== key && renderQuickActions(entry)}
                                </span>
                                {showOwnerColumn && (
                                  <span className="file-library-owner-cell" data-col="owner">
                                    <span className={cn("file-library-owner-chip", spaceById.get(entry.spaceId)?.ownerId === ownerId && "is-mine")}>
                                      <i aria-hidden="true" data-initials={spaceInitials(spaceNameById.get(entry.spaceId) ?? "?")} style={spaceSwatch(spaceById.get(entry.spaceId)?.color)} />
                                      {spaceNameById.get(entry.spaceId) ?? "未知"}
                                    </span>
                                  </span>
                                )}
                                {showLocationColumn && (
                                  <span className="file-explorer-location-cell" data-col="location" title={locationLabel(entry)}>
                                    <button type="button" tabIndex={-1} onClick={(event) => { event.stopPropagation(); openLocation(entry); }} onDoubleClick={(event) => event.stopPropagation()}>{folderLocation(entry)}</button>
                                  </span>
                                )}
                                <span className="is-date" data-col="date">{formatEntryDate(entry.updatedAt)}</span>
                                <span className="is-muted" data-col="type">{describeEntryType(entry)}</span>
                                <span className="is-number" data-col="size">{entry.kind === "folder" ? `${folderCounts(entry.id).folders + folderCounts(entry.id).files} 項` : formatTestPlanFileSize(entry.fileSize)}</span>
                              </article>
                            );
                          }),
                        ])}
                      </div>
                    )}
                    </div>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="file-explorer-menu" onCloseAutoFocus={returnFocusToList}>
                  {contextTarget === "item" && selectedEntries.length > 0 ? renderItemMenu() : renderEmptyMenu()}
                </ContextMenuContent>
              </ContextMenu>

              <footer className="test-plan-statusbar">
                <span>{visibleEntries.length} 個項目</span>
                {selectedEntries.length > 0 && <span className="is-strong">已選取 {selectedEntries.length} 個項目{selectedSize ? ` · ${formatTestPlanFileSize(selectedSize)}` : ""}</span>}
                {clipboard && <span>已剪下 {clipboard.items.length} 個項目，到目標資料夾按 Ctrl+V</span>}
                <span className={cn("file-explorer-permission", !canEdit && "is-readonly")}>
                  {canEdit ? <UserRound className="h-3.5 w-3.5" aria-hidden="true" /> : <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />}
                  {activeSpaceId === null ? "所有人的檔案 · 依擁有者分組；在這裡上傳會放進我的空間" : !canEdit ? "唯讀：可以瀏覽與下載，不能修改" : isOwnSpace ? "我的空間 · 可編輯" : "你有管理權限，可以整理這個空間"}
                </span>
                <span className="file-library-drag-hint">右鍵看所有操作 · 拖到資料夾可移動 · 拖到桌面可直接存檔</span>
              </footer>
            </>
          )}
        </main>
        {showPreviewPane && (
          <TestPlanInspector
            entry={selectedEntry}
            selectedEntries={selectedEntries}
            canEdit={selectedEntry ? canEditSpace(selectedEntry.spaceId) : false}
            busy={busy}
            onClose={() => setPreviewOpen(false)}
            downloadFile={downloadFile}
            getPreviewUrl={getPreviewUrl}
            ownerName={(spaceId) => spaceNameById.get(spaceId) ?? "未知空間"}
            locationLabel={locationLabel}
            folderCounts={folderCounts}
            onEditSpreadsheet={(file) => setSpreadsheetFile(file)}
            onDownload={(file) => void handleDownload(file)}
            onOpenFolder={(entry) => openEntry(entry)}
            onDescribe={(file) => setDescribeAction({ id: file.id, name: file.originalName, value: file.description ?? "" })}
          />
        )}
      </div>

      <TransferPanel uploads={uploadProgress} downloads={downloads} onDismiss={dismissDownload} />

      <TestPlanSpreadsheetEditor
        open={Boolean(spreadsheetFile)}
        file={spreadsheetFile}
        canEdit={spreadsheetFile ? canEditSpace(spreadsheetFile.spaceId) : false}
        downloadFile={downloadFile}
        onOpenChange={(open) => {
          if (!open) setSpreadsheetFile(null);
        }}
        onSave={async (file, contents) => {
          await replaceFileContents(file, contents);
          toast.success("Excel 已儲存回原檔");
        }}
      />

      <DescribeDialog
        action={describeAction}
        busy={busy}
        onClose={() => setDescribeAction(null)}
        onSubmit={handleDescribeSubmit}
      />
      <MoveDialog
        entries={moveEntriesAction}
        folders={folders}
        busy={busy}
        onClose={() => setMoveEntriesAction(null)}
        onSubmit={handleMoveSubmit}
      />
      <FileLibraryManual
        open={manual.open}
        initialSection={manual.section}
        onOpenChange={(open) => setManual((current) => ({ ...current, open }))}
      />
      <AlertDialog
        open={Boolean(visibleDeleteAction)}
        onOpenChange={(open) => !open && !batchDeleteInFlight.current && setDeleteAction(null)}
      >
        <AlertDialogContent className="file-library-dialog" onCloseAutoFocus={returnFocusToList}>
          <AlertDialogHeader>
            <AlertDialogTitle>{visibleDeleteAction?.kind === "batch" ? `確定要刪除已選取的 ${visibleDeleteAction.entries.length} 項？` : "確定要刪除？"}</AlertDialogTitle>
            <AlertDialogDescription>
              {visibleDeleteAction?.kind === "batch"
                ? `以下項目將永久刪除${visibleDeleteAction.entries.some(entry => entry.kind === "folder") ? "，包含所選資料夾裡的所有子資料夾與檔案" : ""}，無法復原。${visibleDeleteAction.skipped ? `另有 ${visibleDeleteAction.skipped} 個唯讀項目不會刪除。` : ""}`
                : visibleDeleteAction?.kind === "file"
                  ? `「${visibleDeleteAction.file.originalName}」將從儲存空間永久刪除，無法復原。`
                  : `「${visibleDeleteAction?.name ?? ""}」及其中的所有檔案都會永久刪除，無法復原。`}
            </AlertDialogDescription>
            {visibleDeleteAction?.kind === "batch" && <ul className="file-library-delete-names" aria-label="待刪除項目">{visibleDeleteAction.entries.map(entry => <li key={entryKey(entry)}>{entryName(entry)}</li>)}</ul>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || (visibleDeleteAction?.kind === "batch" && visibleDeleteAction.entries.some(entry => !selectionContext.current.eligible.has(entryKey(entry))))}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
            >
              {busy ? "刪除中…" : visibleDeleteAction?.kind === "batch" ? `永久刪除 ${visibleDeleteAction.entries.length} 項` : "永久刪除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
