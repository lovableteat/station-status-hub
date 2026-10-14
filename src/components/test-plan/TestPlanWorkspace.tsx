import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type InputHTMLAttributes,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Archive,
  Box,
  ChevronRight,
  Download,
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderInput,
  FolderKanban,
  FolderOpen,
  Grid2X2,
  HardDriveUpload,
  List,
  LockKeyhole,
  MoreHorizontal,
  PanelLeftOpen,
  Pencil,
  Presentation,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { MaintenancePageHeader } from "@/components/maintenance/MaintenancePageHeader";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  formatTestPlanFileSize,
} from "./core/files";
import { getTestPlanErrorMessage } from "./core/errors";
import {
  buildFolderBreadcrumbs,
  filterAndSortEntries,
  isFolderDescendant,
} from "./core/tree";
import { useTestPlanWorkspace } from "./hooks/useTestPlanWorkspace";
import { useFileLibraryFilters } from "./useFileLibraryFilters";
import { TestPlanInspector } from "./TestPlanInspector";
import { isEditableSpreadsheet } from "./core/spreadsheet";
import { TestPlanSpreadsheetEditor } from "./TestPlanSpreadsheetEditor";
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
  folderId: string | null;
  spaceId: string | null;
  preservePaths: boolean;
  files: readonly File[];
  failures: { fileName: string; message: string }[];
}

const directoryInputProps = { webkitdirectory: "" } as InputHTMLAttributes<HTMLInputElement>;

type TextAction =
  | { kind: "create-folder"; parentId: string | null }
  | { kind: "rename-folder"; id: string; value: string }
  | { kind: "rename-file"; id: string; value: string }
  | { kind: "describe-file"; id: string; value: string };

type MoveAction =
  | { kind: "folder"; id: string; name: string }
  | { kind: "file"; id: string; name: string };

type DeleteAction =
  | { kind: "folder"; id: string; name: string }
  | { kind: "file"; file: TestPlanFileRecord };

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
  newest: "最近更新",
  oldest: "最早建立",
  largest: "檔案大小",
  type: "檔案類型",
};

function FileCategoryIcon({
  category,
  className,
}: {
  category: TestPlanFileCategory;
  className?: string;
}) {
  const props = { className: cn("h-5 w-5", className) };
  if (category === "presentation") return <Presentation {...props} />;
  if (category === "spreadsheet") return <FileSpreadsheet {...props} />;
  if (category === "document") return <FileText {...props} />;
  if (category === "image") return <FileImage {...props} />;
  if (category === "3d") return <Box {...props} />;
  if (category === "pcb") return <File {...props} />;
  if (category === "archive") return <FileArchive {...props} />;
  return <File {...props} />;
}

function FolderBranch({
  folders,
  files,
  parentId,
  activeFolderId,
  expandedFolderIds,
  onOpen,
  onToggle,
  level = 0,
}: {
  folders: readonly TestPlanFolder[];
  files: readonly TestPlanFileRecord[];
  parentId: string | null;
  activeFolderId: string | null;
  expandedFolderIds: ReadonlySet<string>;
  onOpen: (folderId: string) => void;
  onToggle: (folderId: string) => void;
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
              )}
              style={{ paddingLeft: `${level * 14}px` }}
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
                onClick={() => onOpen(folder.id)}
              >
                {isActive ? (
                  <FolderOpen className="h-4 w-4" />
                ) : (
                  <Folder className="h-4 w-4" />
                )}
                <span className="test-plan-folder-tree-label">
                  <strong>{folder.name}</strong>
                  <small>
                    {childFolderCount > 0 && `${childFolderCount} 個子資料夾`}
                    {childFolderCount > 0 && directFileCount > 0 && " · "}
                    {directFileCount > 0 && `${directFileCount} 個檔案`}
                    {childFolderCount === 0 && directFileCount === 0 && "空資料夾"}
                  </small>
                </span>
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
                level={level + 1}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function TextActionDialog({
  action,
  busy,
  onClose,
  onSubmit,
}: {
  action: TextAction | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(action && "value" in action ? action.value : "");
  }, [action]);

  const title = !action
    ? ""
    : action.kind === "create-folder"
      ? "建立資料夾"
      : action.kind === "rename-folder"
        ? "重新命名資料夾"
        : action.kind === "rename-file"
          ? "重新命名檔案"
          : "檔案說明";
  const isDescription = action?.kind === "describe-file";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isDescription && !value.trim()) return;
    await onSubmit(value);
  };

  return (
    <Dialog open={Boolean(action)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="file-library-dialog">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {isDescription
                ? "補充板版、用途、測試條件或交付備註。"
                : "名稱可使用中文、英文、數字與常用符號。"}
            </DialogDescription>
          </DialogHeader>
          {isDescription ? (
            <Textarea
              autoFocus
              value={value}
              maxLength={800}
              rows={5}
              placeholder="輸入檔案說明（選填）"
              onChange={(event) => setValue(event.target.value)}
            />
          ) : (
            <Input
              autoFocus
              value={value}
              maxLength={160}
              placeholder="輸入名稱"
              onChange={(event) => setValue(event.target.value)}
            />
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={busy || (!isDescription && !value.trim())}>
              {busy ? "處理中…" : "確認"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MoveDialog({
  action,
  folders,
  busy,
  onClose,
  onSubmit,
}: {
  action: MoveAction | null;
  folders: readonly TestPlanFolder[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (folderId: string | null) => Promise<void>;
}) {
  const [targetId, setTargetId] = useState("__root__");
  const options = useMemo(
    () =>
      folders.filter(
        (folder) =>
          action?.kind !== "folder"
          || !isFolderDescendant(folders, folder.id, action.id),
      ),
    [action, folders],
  );

  useEffect(() => setTargetId("__root__"), [action]);

  return (
    <Dialog open={Boolean(action)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="file-library-dialog">
        <DialogHeader>
          <DialogTitle>搬移「{action?.name}」</DialogTitle>
          <DialogDescription>選擇此項目的新資料夾位置。</DialogDescription>
        </DialogHeader>
        <Select value={targetId} onValueChange={setTargetId}>
          <SelectTrigger>
            <SelectValue placeholder="選擇位置" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__root__">空間根目錄</SelectItem>
            {options.map((folder) => (
              <SelectItem key={folder.id} value={folder.id}>
                {folder.name}
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
            {busy ? "搬移中…" : "搬移"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EntryActions({
  entry,
  canEdit,
  onEditSpreadsheet,
  onRename,
  onMove,
  onDescribe,
  onDownload,
  onDelete,
}: {
  entry: TestPlanEntry;
  canEdit: boolean;
  onEditSpreadsheet: () => void;
  onRename: () => void;
  onMove: () => void;
  onDescribe: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-[#9bb6c9]"
          aria-label="開啟項目操作"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {entry.kind === "file" && isEditableSpreadsheet(entry) && (
          <DropdownMenuItem disabled={!canEdit} onSelect={onEditSpreadsheet}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            直接編輯 Excel
          </DropdownMenuItem>
        )}
        {entry.kind === "file" && (
          <DropdownMenuItem onSelect={onDownload}>
            <Download className="mr-2 h-4 w-4" />
            下載
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={!canEdit} onSelect={onRename}>
          <Pencil className="mr-2 h-4 w-4" />
          重新命名
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canEdit} onSelect={onMove}>
          <FolderInput className="mr-2 h-4 w-4" />
          搬移
        </DropdownMenuItem>
        {entry.kind === "file" && (
          <DropdownMenuItem disabled={!canEdit} onSelect={onDescribe}>
            <FileText className="mr-2 h-4 w-4" />
            編輯說明
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!canEdit}
          className="text-red-300 focus:text-red-200"
          onSelect={onDelete}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          刪除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TestPlanWorkspace() {
  const workspace = useTestPlanWorkspace();
  const {
    spaces,
    activeSpaceId,
    activeSpace,
    folders,
    files,
    loading,
    busy,
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
    deleteFile,
    replaceFileContents,
  } = workspace;
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const { query, setQuery, categoryFilter, setCategoryFilter, sort, setSort, clearFilters } = useFileLibraryFilters();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [isDragging, setIsDragging] = useState(false);
  const [uploadRetry, setUploadRetry] = useState<UploadRetry | null>(null);
  const [isSpaceDrawerOpen, setIsSpaceDrawerOpen] = useState(false);
  const [textAction, setTextAction] = useState<TextAction | null>(null);
  const [moveAction, setMoveAction] = useState<MoveAction | null>(null);
  const [deleteAction, setDeleteAction] = useState<DeleteAction | null>(null);
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null);
  const [spreadsheetFile, setSpreadsheetFile] = useState<TestPlanFileRecord | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    new Set(),
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const requestedFolderRef = useRef<{spaceId: string; folderId: string} | null>(null);

  useEffect(() => {
    const requested = requestedFolderRef.current;
    setActiveFolderId(requested?.spaceId === activeSpaceId ? requested.folderId : null);
    requestedFolderRef.current = null;
    setSelectedEntryKey(null);
    setSpreadsheetFile(null);
    setExpandedFolderIds(new Set());
  }, [activeSpaceId]);

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

  useEffect(() => {
    setUploadRetry(null);
    setSelectedEntryKey(null);
    setSpreadsheetFile(null);
    setTextAction(null);
    setMoveAction(null);
    setDeleteAction(null);
  }, [ownerId]);

  const breadcrumbs = useMemo(
    () => buildFolderBreadcrumbs(folders, activeFolderId),
    [activeFolderId, folders],
  );
  const visibleEntries = useMemo(() => {
    const isSearching = Boolean(query.trim());
    const visibleFolders = isSearching
      ? folders
      : folders.filter((folder) => folder.parentId === activeFolderId);
    const visibleFiles = isSearching || (activeSpaceId === null && activeFolderId === null)
      ? files
      : files.filter((file) => file.folderId === activeFolderId);
    return filterAndSortEntries(visibleFolders, visibleFiles, {
      query,
      category: categoryFilter,
      sort,
    });
  }, [activeFolderId, activeSpaceId, categoryFilter, files, folders, query, sort]);
  const selectedEntry = useMemo<TestPlanEntry | null>(() => {
    if (!selectedEntryKey) return null;
    const [kind, id] = selectedEntryKey.split(":");
    if (kind === "folder") {
      const folder = folders.find((candidate) => candidate.id === id);
      return folder ? { ...folder, kind: "folder" } : null;
    }
    const file = files.find((candidate) => candidate.id === id);
    return file ? { ...file, kind: "file" } : null;
  }, [files, folders, selectedEntryKey]);

  useEffect(() => {
    if (selectedEntryKey && !selectedEntry) setSelectedEntryKey(null);
  }, [selectedEntry, selectedEntryKey]);

  const handleUpload = async (incoming: readonly File[], preservePaths = false, target?: Pick<UploadRetry, "folderId" | "spaceId">) => {
    if (!canEdit || busy || loading || incoming.length === 0) return;
    const uploadTarget = target ?? { folderId: activeFolderId, spaceId: activeSpaceId };
    setUploadRetry(null);
    try {
      const result = await uploadFiles(uploadTarget.folderId, incoming, { preservePaths, spaceId: uploadTarget.spaceId });
      if (result.uploaded.length > 0) {
        toast.success(`已上傳 ${result.uploaded.length} 個檔案`);
      }
      if (result.failures.length > 0) {
        setUploadRetry({ ...uploadTarget, spaceId: result.spaceId, preservePaths, files: result.failedFiles, failures: result.failures });
        toast.error(
          `${result.failedFiles.length} 個檔案未上傳：${result.failures[0].message}`,
        );
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "上傳失敗";
      setUploadRetry({ ...uploadTarget, preservePaths, files: incoming, failures: [{ fileName: "", message }] });
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

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (busy || uploadRetry) return;
    void handleUpload(Array.from(event.dataTransfer.files));
  };

  const handleTextSubmit = async (value: string) => {
    if (!textAction) return;
    try {
      if (textAction.kind === "create-folder") {
        await createFolder(textAction.parentId, value);
      } else if (textAction.kind === "rename-folder") {
        await renameFolder(textAction.id, value);
      } else if (textAction.kind === "rename-file") {
        await renameFile(textAction.id, value);
      } else {
        await updateFileDescription(textAction.id, value);
      }
      toast.success("變更已儲存");
      setTextAction(null);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "操作失敗");
    }
  };

  const handleMoveSubmit = async (targetFolderId: string | null) => {
    if (!moveAction) return;
    try {
      if (moveAction.kind === "folder") {
        await moveFolder(moveAction.id, targetFolderId);
      } else {
        await moveFile(moveAction.id, targetFolderId);
      }
      toast.success("項目已搬移");
      setMoveAction(null);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "搬移失敗");
    }
  };

  const handleDelete = async () => {
    if (!deleteAction) return;
    try {
      if (deleteAction.kind === "folder") {
        await deleteFolder(deleteAction.id);
        if (activeFolderId === deleteAction.id) setActiveFolderId(null);
      } else {
        await deleteFile(deleteAction.file);
      }
      if (
        deleteAction.kind === "file"
          ? selectedEntryKey === `file:${deleteAction.file.id}`
          : deleteAction.kind === "folder"
            ? selectedEntryKey === `folder:${deleteAction.id}`
            : false
      ) {
        setSelectedEntryKey(null);
      }
      toast.success("項目已刪除");
      setDeleteAction(null);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "刪除失敗");
    }
  };

  const handleDownload = async (file: TestPlanFileRecord) => {
    try {
      const blob = await downloadFile(file);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.originalName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "下載失敗");
    }
  };

  const openEntry = (entry: TestPlanEntry) => {
    if (entry.kind === "folder") {
      if (entry.spaceId !== activeSpaceId) {
        requestedFolderRef.current = {spaceId: entry.spaceId, folderId: entry.id};
        void openSpace(entry.spaceId);
      } else setActiveFolderId(entry.id);
      setSelectedEntryKey(null);
    } else {
      setSelectedEntryKey(`file:${entry.id}`);
      if (isEditableSpreadsheet(entry)) setSpreadsheetFile(entry);
    }
  };

  const selectEntry = (entry: TestPlanEntry) => {
    if (entry.kind === "folder") { openEntry(entry); return; }
    setSelectedEntryKey(`${entry.kind}:${entry.id}`);
  };

  const renderEntryActions = (entry: TestPlanEntry) => (
    <EntryActions
      entry={entry}
      canEdit={canEditSpace(entry.spaceId)}
      onEditSpreadsheet={() => {
        if (entry.kind === "file" && isEditableSpreadsheet(entry)) {
          setSpreadsheetFile(entry);
        }
      }}
      onRename={() =>
        setTextAction(
          entry.kind === "folder"
            ? { kind: "rename-folder", id: entry.id, value: entry.name }
            : {
              kind: "rename-file",
              id: entry.id,
              value: entry.originalName,
            },
        )}
      onMove={() =>
        setMoveAction(
          entry.kind === "folder"
            ? { kind: "folder", id: entry.id, name: entry.name }
            : { kind: "file", id: entry.id, name: entry.originalName },
        )}
      onDescribe={() => {
        if (entry.kind === "file") {
          setTextAction({
            kind: "describe-file",
            id: entry.id,
            value: entry.description ?? "",
          });
        }
      }}
      onDownload={() => entry.kind === "file" && void handleDownload(entry)}
      onDelete={() =>
        setDeleteAction(
          entry.kind === "folder"
            ? { kind: "folder", id: entry.id, name: entry.name }
            : { kind: "file", file: entry },
        )}
    />
  );

  return (
    <section className="test-plan-workspace file-library-workspace">
      <header className="test-plan-header">
        <MaintenancePageHeader
          title="檔案上傳"
          icon={FolderKanban}
          wrapActionsOnMobile
          actions={(
            <>
              {!canEdit && (
                <Badge variant="outline" className="border-amber-300/30 text-amber-100">
                  唯讀模式
                </Badge>
              )}
              <Button type="button" variant="outline" disabled={!personalSpace || busy || loading} onClick={() => personalSpace && void openSpace(personalSpace.id)}>
                <FolderOpen data-icon="inline-start" /><span>我的空間</span>
              </Button>
              <Button type="button" variant="outline" className="file-library-upload" aria-label="上傳資料夾" disabled={!canEdit || loading || busy || Boolean(uploadRetry)} onClick={() => folderInputRef.current?.click()}>
                <FolderInput data-icon="inline-start" /><span>上傳資料夾</span>
              </Button>
              <Button type="button" className="file-library-upload" disabled={!canEdit || loading || busy || Boolean(uploadRetry)} onClick={() => fileInputRef.current?.click()}>
                <Upload data-icon="inline-start" /><span>上傳檔案</span>
              </Button>
            </>
          )}
        />
      </header>

      <input ref={fileInputRef} className="sr-only" type="file" multiple disabled={!canEdit || loading || busy || Boolean(uploadRetry)} onChange={handleFileSelection} />
      <input ref={folderInputRef} className="sr-only" type="file" multiple {...directoryInputProps} disabled={!canEdit || loading || busy || Boolean(uploadRetry)} aria-label="選擇上傳資料夾" onChange={handleFolderSelection} />
      <p className="file-library-upload-hint">
        {activeSpaceId === null ? "在所有檔案上傳時，檔案會放入你的個人空間。" : `目前空間：${activeSpace?.name ?? "載入中"}。`}
        {"資料夾保留原有層級，同名檔案會略過；空資料夾無法由瀏覽器選取"}
      </p>
      {uploadRetry && (
        <section className="file-library-upload-errors" role="alert" aria-label="上傳失敗清單">
          <div className="file-library-upload-error-heading">
            <strong>{uploadRetry.files.length} 個檔案未上傳</strong>
            <Button variant="outline" size="sm" aria-label="重試未上傳檔案" disabled={!canEdit || loading || busy} onClick={() => void handleUpload(uploadRetry.files, uploadRetry.preservePaths, uploadRetry)}>重試未上傳檔案</Button>
            <Button variant="ghost" size="icon" aria-label="關閉上傳失敗清單" disabled={busy} onClick={() => setUploadRetry(null)}><X className="h-4 w-4" /></Button>
          </div>
          <p>成功的檔案已保留，重試會使用原空間與資料夾</p>
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

      <div className={cn("test-plan-shell", selectedEntry && "has-inspector")}>
        <aside
          id="test-plan-space-drawer"
          className={cn(
            "test-plan-space-rail",
            isSpaceDrawerOpen && "is-mobile-open",
          )}
          aria-label="使用者空間與資料夾"
        >
          <div className="test-plan-rail-heading">
            <div>
              <strong>使用者空間</strong>
            </div>
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
            <button type="button" className={cn("file-library-all", activeSpaceId === null && "is-active")} disabled={busy} onClick={() => { setIsSpaceDrawerOpen(false); void openSpace(null); }}><FolderOpen /><span>所有檔案</span><span className="file-library-count">{activeSpaceId === null ? files.length : ""}</span></button>
            {userSpaces.map((space) => (
              <div
                key={space.id}
                className={cn(
                  "test-plan-space-row",
                  activeSpaceId === space.id && "is-active",
                )}
              >
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`開啟 ${space.name}${space.description ? `（${space.description}）` : ""} 的檔案空間`}
                  aria-current={activeSpaceId === space.id ? "page" : undefined}
                  title={`${space.name} ${space.description ?? ""}`}
                  onClick={() => {
                    setIsSpaceDrawerOpen(false);
                    void openSpace(space.id);
                  }}
                >
                  <UserRound className="file-library-user-icon" aria-hidden="true" />
                  <span className="file-library-user-identity">
                    <strong>{space.name}</strong>
                    {space.description && <small>{space.description}</small>}
                  </span>
                  {space.ownerId === ownerId && <Badge variant="secondary" className="file-library-current-user">我</Badge>}
                </button>
              </div>
            ))}
          </div>

          {activeSpace && (
            <div className="test-plan-folder-tree">
              <button
                type="button"
                className={cn(
                  "test-plan-folder-tree-item",
                  "test-plan-folder-tree-root",
                  activeFolderId === null && "is-active",
                )}
                onClick={() => {
                  setActiveFolderId(null);
                  setSelectedEntryKey(null);
                  setIsSpaceDrawerOpen(false);
                }}
              >
                <FolderOpen className="h-4 w-4" />
                <span>全部檔案</span>
              </button>
              <FolderBranch
                folders={folders}
                files={files}
                parentId={null}
                activeFolderId={activeFolderId}
                expandedFolderIds={expandedFolderIds}
                onOpen={(folderId) => {
                  setActiveFolderId(folderId);
                  setSelectedEntryKey(null);
                  setIsSpaceDrawerOpen(false);
                }}
                onToggle={(folderId) =>
                  setExpandedFolderIds((current) => {
                    const next = new Set(current);
                    if (next.has(folderId)) next.delete(folderId);
                    else next.add(folderId);
                    return next;
                  })}
              />
            </div>
          )}
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
                <FolderKanban className="h-8 w-8" />
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
              <div className="test-plan-toolbar">
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
                <div className="test-plan-location">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFolderId(null);
                      setSelectedEntryKey(null);
                    }}
                  >
                    {activeSpace?.name ?? "所有檔案"}
                  </button>
                  {breadcrumbs.map((folder) => (
                    <span key={folder.id}>
                      <ChevronRight className="h-3.5 w-3.5" />
                      <button
                        type="button"
                        onClick={() => {
                          setActiveFolderId(folder.id);
                          setSelectedEntryKey(null);
                        }}
                      >
                        {folder.name}
                      </button>
                    </span>
                  ))}
                </div>
                <div className="test-plan-primary-actions">
                  <Button
                    variant="outline"
                    disabled={!canEdit || loading || busy}
                    onClick={() =>
                      setTextAction({
                        kind: "create-folder",
                        parentId: activeFolderId,
                      })}
                  >
                    <Folder className="mr-2 h-4 w-4" />
                    新增資料夾
                  </Button>
                </div>
              </div>

              <div className="test-plan-filterbar">
                <label className="test-plan-search">
                  <Search className="h-4 w-4" />
                  <Input
                    value={query}
                    placeholder="搜尋檔案與資料夾"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <Select
                  value={categoryFilter}
                  onValueChange={(value) =>
                    setCategoryFilter(value as TestPlanFileCategory | "all")}
                >
                  <SelectTrigger className="w-[150px]" aria-label="檔案格式">
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
                <Select
                  value={sort}
                  onValueChange={(value) => setSort(value as TestPlanSort)}
                >
                  <SelectTrigger className="w-[145px]" aria-label="排序方式">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SORT_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="test-plan-view-toggle">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(viewMode === "grid" && "is-active")}
                    onClick={() => setViewMode("grid")}
                  >
                    <Grid2X2 className="h-4 w-4" />
                    <span className="sr-only">卡片檢視</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(viewMode === "list" && "is-active")}
                    onClick={() => setViewMode("list")}
                  >
                    <List className="h-4 w-4" />
                    <span className="sr-only">清單檢視</span>
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={loading}
                  onClick={() => void refreshWorkspace(activeSpaceId)}
                >
                  <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                  <span className="sr-only">重新整理</span>
                </Button>
              </div>

              {(query.trim() || categoryFilter !== "all") && (
                <div className="file-library-filter-chips" aria-label="目前篩選條件">
                  {query.trim() && <Button variant="secondary" size="sm" onClick={() => setQuery("")} aria-label="清除搜尋條件">搜尋：{query}<X /></Button>}
                  {categoryFilter !== "all" && <Button variant="secondary" size="sm" onClick={() => setCategoryFilter("all")} aria-label="清除格式條件">格式：{CATEGORY_LABELS[categoryFilter]}<X /></Button>}
                  <Button variant="ghost" size="sm" onClick={clearFilters}>全部清除</Button>
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

              <div
                className={cn(
                  "test-plan-dropzone",
                  isDragging && "is-dragging",
                )}
                onDragEnter={(event) => {
                  event.preventDefault();
                  if (canEdit && !loading && !busy && !uploadRetry) setIsDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                    setIsDragging(false);
                  }
                }}
                onDrop={handleDrop}
              >
                {isDragging && (
                  <div className="test-plan-drop-overlay">
                    <HardDriveUpload className="h-9 w-9" />
                    <strong>放開以上傳到此資料夾</strong>
                    <span>一次最多 20 個檔案，單檔 500 MB</span>
                  </div>
                )}

                {viewMode === "list" && <div className="test-plan-list-head"><span>名稱</span><span>格式</span><span>大小</span><span>更新時間</span><span className="sr-only">操作</span></div>}
                {loading ? (
                  <div className="test-plan-loading">
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    正在載入資料儲存…
                  </div>
                ) : visibleEntries.length === 0 ? (
                  <div className="test-plan-empty is-compact">
                    <Archive className="h-8 w-8" />
                    <h2>{query || categoryFilter !== "all" ? "目前篩選條件沒有符合的檔案" : activeFolderId ? "這個資料夾目前是空的" : activeSpaceId ? "這個使用者空間目前是空的" : "尚未上傳檔案"}</h2>
                    <p>
                      {query
                        ? "請調整搜尋字詞或檔案類型。"
                        : canEdit ? "將檔案拖到這裡，或使用右上方的上傳按鈕。" : "切換到我的空間，即可整理及上傳自己的檔案。"}
                    </p>
                  </div>
                ) : viewMode === "grid" ? (
                  <div className="test-plan-entry-grid">
                    {visibleEntries.map((entry) => (
                      <article
                        key={`${entry.kind}:${entry.id}`}
                        className={cn(
                          "test-plan-entry-card",
                          selectedEntryKey === `${entry.kind}:${entry.id}` && "is-selected",
                        )}
                        tabIndex={0}
                        aria-selected={selectedEntryKey === `${entry.kind}:${entry.id}`}
                        onClick={() => selectEntry(entry)}
                        onDoubleClick={() => openEntry(entry)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === "Enter") openEntry(entry);
                        }}
                      >
                        <div
                          className={cn(
                            "test-plan-entry-icon",
                            entry.kind === "folder"
                              ? "is-folder"
                              : `is-${entry.category}`,
                          )}
                        >
                          {entry.kind === "folder" ? (
                            <Folder className="h-6 w-6" />
                          ) : (
                            <FileCategoryIcon
                              category={entry.category}
                              className="h-6 w-6"
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <strong>
                            {entry.kind === "folder"
                              ? entry.name
                              : entry.originalName}
                          </strong>
                          <span>
                            {entry.kind === "folder"
                              ? "資料夾"
                              : `${CATEGORY_LABELS[entry.category]} · ${formatTestPlanFileSize(entry.fileSize)}`}
                          </span>
                          {entry.kind === "file" && entry.description && (
                            <small>{entry.description}</small>
                          )}
                        </div>
                        {renderEntryActions(entry)}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="test-plan-entry-list">
                    {visibleEntries.map((entry) => (
                      <article
                        key={`${entry.kind}:${entry.id}`}
                        className={cn(
                          "test-plan-list-row",
                          selectedEntryKey === `${entry.kind}:${entry.id}` && "is-selected",
                        )}
                        tabIndex={0}
                        aria-selected={selectedEntryKey === `${entry.kind}:${entry.id}`}
                        onClick={() => selectEntry(entry)}
                        onDoubleClick={() => openEntry(entry)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === "Enter") openEntry(entry);
                        }}
                      >
                        <span className="test-plan-list-name">
                          {entry.kind === "folder" ? (
                            <Folder className="h-4 w-4 text-cyan-300" />
                          ) : (
                            <FileCategoryIcon
                              category={entry.category}
                              className="h-4 w-4"
                            />
                          )}
                          <strong>
                            {entry.kind === "folder" ? entry.name : entry.originalName}
                            {activeSpaceId === null && <small>{spaces.find(space => space.id === entry.spaceId)?.name}</small>}
                          </strong>
                        </span>
                        <span>
                          {entry.kind === "folder"
                            ? "資料夾"
                            : entry.extension.toUpperCase() || "FILE"}
                        </span>
                        <span>
                          {entry.kind === "folder"
                            ? "—"
                            : formatTestPlanFileSize(entry.fileSize)}
                        </span>
                        <span>
                          {new Date(entry.updatedAt).toLocaleDateString("zh-TW")}
                        </span>
                        {renderEntryActions(entry)}
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <footer className="test-plan-statusbar">
                <span>{visibleEntries.length} 個項目</span>
                <span>{folders.length} 個資料夾</span>
                <span>{files.length} 個檔案</span>
                <span className="ml-auto">
                  {canEdit ? "可編輯" : "唯讀模式"}
                </span>
              </footer>
            </>
          )}
        </main>
        {selectedEntry && (
          <TestPlanInspector
            entry={selectedEntry}
            canEdit={canEditSpace(selectedEntry.spaceId)}
            busy={busy}
            onClose={() => setSelectedEntryKey(null)}
            downloadFile={downloadFile}
            onEditSpreadsheet={(file) => setSpreadsheetFile(file)}
            onDownload={(file) => void handleDownload(file)}
            onRename={(entry) =>
              setTextAction(
                entry.kind === "folder"
                  ? { kind: "rename-folder", id: entry.id, value: entry.name }
                  : { kind: "rename-file", id: entry.id, value: entry.originalName },
              )}
            onMove={(entry) =>
              setMoveAction(
                entry.kind === "folder"
                  ? { kind: "folder", id: entry.id, name: entry.name }
                  : { kind: "file", id: entry.id, name: entry.originalName },
              )}
            onDescribe={(file) =>
              setTextAction({
                kind: "describe-file",
                id: file.id,
                value: file.description ?? "",
              })}
            onDelete={(entry) =>
              setDeleteAction(
                entry.kind === "folder"
                  ? { kind: "folder", id: entry.id, name: entry.name }
                  : { kind: "file", file: entry },
              )}
          />
        )}
      </div>

      {uploadProgress && (
        <div className="test-plan-upload-progress" role="status">
          <Upload className="h-4 w-4 animate-pulse" />
          <span>
            已處理 {uploadProgress.completed}／{uploadProgress.total} 個檔案
            {uploadProgress.currentFileName
              ? ` · ${uploadProgress.currentFileName}`
              : ""}
          </span>
          <small>
            {formatTestPlanFileSize(uploadProgress.uploadedBytes)}
            {" / "}
            {formatTestPlanFileSize(uploadProgress.totalBytes)}
          </small>
          <div>
            <span
              style={{
                width: `${
                  uploadProgress.totalBytes
                    ? (uploadProgress.uploadedBytes / uploadProgress.totalBytes)
                      * 100
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}

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

      <TextActionDialog
        action={textAction}
        busy={busy}
        onClose={() => setTextAction(null)}
        onSubmit={handleTextSubmit}
      />
      <MoveDialog
        action={moveAction}
        folders={moveAction ? folders.filter(folder => folder.spaceId === (moveAction.kind === "file" ? files.find(file => file.id === moveAction.id)?.spaceId : folders.find(folder => folder.id === moveAction.id)?.spaceId)) : folders}
        busy={busy}
        onClose={() => setMoveAction(null)}
        onSubmit={handleMoveSubmit}
      />
      <AlertDialog
        open={Boolean(deleteAction)}
        onOpenChange={(open) => !open && setDeleteAction(null)}
      >
        <AlertDialogContent className="file-library-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>確定要刪除？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteAction?.kind === "file"
                ? `「${deleteAction.file.originalName}」將從儲存空間永久刪除。`
                : `「${deleteAction?.name ?? ""}」及其中的所有檔案都會永久刪除。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-red-600 text-white hover:bg-red-500"
              onClick={() => void handleDelete()}
            >
              {busy ? "刪除中…" : "永久刪除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
