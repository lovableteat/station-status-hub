import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
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
  Plus,
  Presentation,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { MaintenanceMetricStrip } from "@/components/maintenance/MaintenanceMetricStrip";
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
import { TestPlanInspector } from "./TestPlanInspector";
import {
  TestPlanSpaceDialog,
  type TestPlanSpaceInput,
} from "./TestPlanSpaceDialog";
import type {
  TestPlanEntry,
  TestPlanFileCategory,
  TestPlanFileRecord,
  TestPlanFolder,
  TestPlanSpace,
  TestPlanSort,
} from "./types";
import "./test-plan.css";

type ViewMode = "grid" | "list";

type TextAction =
  | { kind: "create-folder"; parentId: string | null }
  | { kind: "rename-folder"; id: string; value: string }
  | { kind: "rename-file"; id: string; value: string }
  | { kind: "describe-file"; id: string; value: string };

type SpaceDialogState =
  | { mode: "create"; space: null }
  | { mode: "edit"; space: TestPlanSpace };

type MoveAction =
  | { kind: "folder"; id: string; name: string }
  | { kind: "file"; id: string; name: string };

type DeleteAction =
  | { kind: "space"; id: string; name: string }
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
  parentId,
  activeFolderId,
  onOpen,
  level = 0,
}: {
  folders: readonly TestPlanFolder[];
  parentId: string | null;
  activeFolderId: string | null;
  onOpen: (folderId: string) => void;
  level?: number;
}) {
  const children = folders
    .filter((folder) => folder.parentId === parentId)
    .sort((first, second) =>
      first.name.localeCompare(second.name, "zh-Hant", { numeric: true }));

  return (
    <>
      {children.map((folder) => (
        <div key={folder.id}>
          <button
            type="button"
            className={cn(
              "test-plan-folder-tree-item",
              activeFolderId === folder.id && "is-active",
            )}
            style={{ paddingLeft: `${12 + level * 14}px` }}
            onClick={() => onOpen(folder.id)}
          >
            <Folder className="h-4 w-4" />
            <span>{folder.name}</span>
          </button>
          <FolderBranch
            folders={folders}
            parentId={folder.id}
            activeFolderId={activeFolderId}
            onOpen={onOpen}
            level={level + 1}
          />
        </div>
      ))}
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
      <DialogContent className="border-[#2a526f] bg-[#0b1e30] text-[#f3f8fc]">
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
      <DialogContent className="border-[#2a526f] bg-[#0b1e30] text-[#f3f8fc]">
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
  onRename,
  onMove,
  onDescribe,
  onDownload,
  onDelete,
}: {
  entry: TestPlanEntry;
  canEdit: boolean;
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
    isAuthenticated,
    openSpace,
    refreshWorkspace,
    createSpace,
    updateSpace,
    deleteSpace,
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
  } = workspace;
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<
    TestPlanFileCategory | "all"
  >("all");
  const [sort, setSort] = useState<TestPlanSort>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [isDragging, setIsDragging] = useState(false);
  const [isSpaceDrawerOpen, setIsSpaceDrawerOpen] = useState(false);
  const [spaceDialog, setSpaceDialog] = useState<SpaceDialogState | null>(null);
  const [spaceDialogError, setSpaceDialogError] = useState<string | null>(null);
  const [textAction, setTextAction] = useState<TextAction | null>(null);
  const [moveAction, setMoveAction] = useState<MoveAction | null>(null);
  const [deleteAction, setDeleteAction] = useState<DeleteAction | null>(null);
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setActiveFolderId(null);
    setSelectedEntryKey(null);
  }, [activeSpaceId]);

  useEffect(() => {
    if (spaceDialog) setSpaceDialogError(null);
  }, [spaceDialog]);

  const breadcrumbs = useMemo(
    () => buildFolderBreadcrumbs(folders, activeFolderId),
    [activeFolderId, folders],
  );
  const visibleEntries = useMemo(() => {
    const isSearching = Boolean(query.trim());
    const visibleFolders = isSearching
      ? folders
      : folders.filter((folder) => folder.parentId === activeFolderId);
    const visibleFiles = isSearching
      ? files
      : files.filter((file) => file.folderId === activeFolderId);
    return filterAndSortEntries(visibleFolders, visibleFiles, {
      query,
      category: categoryFilter,
      sort,
    });
  }, [activeFolderId, categoryFilter, files, folders, query, sort]);
  const activeStorageBytes = useMemo(
    () => files.reduce((total, file) => total + file.fileSize, 0),
    [files],
  );
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

  const handleUpload = async (incoming: readonly File[]) => {
    if (!canEdit || incoming.length === 0) return;
    try {
      const result = await uploadFiles(activeFolderId, incoming);
      if (result.uploaded.length > 0) {
        toast.success(`已上傳 ${result.uploaded.length} 個檔案`);
      }
      if (result.failures.length > 0) {
        toast.error(
          `${result.failures.length} 個檔案未上傳：${result.failures[0].message}`,
        );
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "上傳失敗");
    }
  };

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    void handleUpload(selected);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void handleUpload(Array.from(event.dataTransfer.files));
  };

  const handleSpaceSubmit = async (input: TestPlanSpaceInput) => {
    if (!spaceDialog) return;
    setSpaceDialogError(null);
    try {
      if (spaceDialog.mode === "create") {
        await createSpace(input);
        toast.success("資料空間已建立");
      } else {
        await updateSpace(spaceDialog.space.id, input);
        toast.success("資料空間已更新");
      }
      setSpaceDialog(null);
    } catch (caught) {
      const message = getTestPlanErrorMessage(caught, "空間儲存失敗，請稍後再試。");
      setSpaceDialogError(message);
      toast.error(
        spaceDialog.mode === "create"
          ? "資料空間建立失敗"
          : "資料空間更新失敗",
        { description: message },
      );
    }
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
      if (deleteAction.kind === "space") {
        await deleteSpace(deleteAction.id);
      } else if (deleteAction.kind === "folder") {
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
      setActiveFolderId(entry.id);
      setSelectedEntryKey(null);
    } else {
      setSelectedEntryKey(`file:${entry.id}`);
    }
  };

  const selectEntry = (entry: TestPlanEntry) => {
    setSelectedEntryKey(`${entry.kind}:${entry.id}`);
  };

  const renderEntryActions = (entry: TestPlanEntry) => (
    <EntryActions
      entry={entry}
      canEdit={canEdit}
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
    <section className="test-plan-workspace">
      <header className="test-plan-header">
        <MaintenancePageHeader
          title="Test_Plan"
          description="集中管理電路板與工程資料：測試計畫、機構圖、PCB、韌體、程式碼、量測紀錄與 Office 檔案"
          icon={FolderKanban}
          actions={(
            <>
              {!canEdit && (
                <Badge variant="outline" className="border-amber-300/30 text-amber-100">
                  唯讀模式
                </Badge>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={!canEdit || busy}
                onClick={() => setSpaceDialog({ mode: "create", space: null })}
              >
                <Plus className="mr-2 h-4 w-4" />
                新增空間
              </Button>
              {activeSpace && (
                <Button
                  type="button"
                  disabled={!canEdit || busy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  上傳工程檔案
                </Button>
              )}
            </>
          )}
        />
        <MaintenanceMetricStrip
          metrics={[
            { label: "資料空間", value: spaces.length, icon: FolderKanban, accent: "blue" },
            { label: "資料夾", value: folders.length, icon: FolderOpen, accent: "cyan" },
            { label: "工程檔案", value: files.length, icon: File, accent: "emerald" },
            {
              label: "本空間容量",
              value: formatTestPlanFileSize(activeStorageBytes),
              icon: Archive,
              accent: "amber",
            },
          ]}
        />
        <div className="test-plan-format-strip" aria-label="支援格式">
          <span>PPT／Excel／OpenDocument</span>
          <span>STEP／STL／DWG／DXF</span>
          <span>KiCad／BRD／Gerber</span>
          <span>程式碼／設定／Log</span>
          <span>韌體／FPGA／壓縮檔</span>
          <span>其他安全工程檔</span>
        </div>
      </header>

      <div className="test-plan-mobile-controls">
        <Button
          type="button"
          variant="outline"
          aria-expanded={isSpaceDrawerOpen}
          aria-controls="test-plan-space-drawer"
          onClick={() => setIsSpaceDrawerOpen(true)}
        >
          <PanelLeftOpen className="mr-2 h-4 w-4" />
          空間與資料夾
        </Button>
      </div>
      {isSpaceDrawerOpen && (
        <button
          type="button"
          className="test-plan-drawer-backdrop"
          aria-label="關閉空間選單"
          onClick={() => setIsSpaceDrawerOpen(false)}
        />
      )}

      <div className="test-plan-shell">
        <aside
          id="test-plan-space-drawer"
          className={cn(
            "test-plan-space-rail",
            isSpaceDrawerOpen && "is-mobile-open",
          )}
          aria-label="Test_Plan 空間與資料夾"
        >
          <div className="test-plan-rail-heading">
            <div>
              <span className="test-plan-eyebrow">MY SPACES</span>
              <strong>資料空間</strong>
            </div>
            <Button
              type="button"
              size="icon"
              className="h-9 w-9"
              disabled={!canEdit || busy}
              onClick={() => setSpaceDialog({ mode: "create", space: null })}
            >
              <Plus className="h-4 w-4" />
              <span className="sr-only">建立空間</span>
            </Button>
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
            {spaces.map((space) => (
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
                  onClick={() => {
                    setIsSpaceDrawerOpen(false);
                    void openSpace(space.id);
                  }}
                >
                  <span
                    className="test-plan-space-color"
                    style={{ backgroundColor: space.color }}
                  />
                  <span className="min-w-0">
                    <strong>{space.name}</strong>
                    <small>
                      {space.description || "工程資料與電路板檔案"}
                    </small>
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`${space.name} 空間操作`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={!canEdit}
                      onSelect={() => setSpaceDialog({ mode: "edit", space })}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      編輯空間
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!canEdit}
                      className="text-red-300"
                      onSelect={() =>
                        setDeleteAction({
                          kind: "space",
                          id: space.id,
                          name: space.name,
                        })}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      刪除空間
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>

          {activeSpace && (
            <div className="test-plan-folder-tree">
              <button
                type="button"
                className={cn(
                  "test-plan-folder-tree-item",
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
                parentId={null}
                activeFolderId={activeFolderId}
                onOpen={(folderId) => {
                  setActiveFolderId(folderId);
                  setSelectedEntryKey(null);
                  setIsSpaceDrawerOpen(false);
                }}
              />
            </div>
          )}
        </aside>

        <main className={cn("test-plan-main", !activeSpace && "is-empty")}>
          {!isAuthenticated && error ? (
            <div className="test-plan-empty" role="alert">
              <span className="test-plan-empty-icon">
                <LockKeyhole className="h-8 w-8" />
              </span>
              <h2>需要安全登入</h2>
              <p>{error}</p>
            </div>
          ) : !activeSpace && !loading ? (
            <div className="test-plan-empty">
              <span className="test-plan-empty-icon">
                <FolderKanban className="h-8 w-8" />
              </span>
              <h2>尚未建立空間</h2>
              <p>用三個步驟建立板版與測試資料的單一可信來源。</p>
              <div className="test-plan-quick-start">
                <div>
                  <span>1</span>
                  <strong>建立空間</strong>
                  <small>依專案、板版或測試階段建立獨立空間。</small>
                </div>
                <div>
                  <span>2</span>
                  <strong>建立資料夾</strong>
                  <small>整理規格、測試、韌體、Gerber 與交付版本。</small>
                </div>
                <div>
                  <span>3</span>
                  <strong>上傳工程檔案</strong>
                  <small>支援拖放 Office、CAD、PCB、Gerber、程式碼、韌體與量測紀錄。</small>
                </div>
              </div>
              <Button
                disabled={!canEdit || busy}
                onClick={() => setSpaceDialog({ mode: "create", space: null })}
              >
                <Plus className="mr-2 h-4 w-4" />
                建立第一個空間
              </Button>
            </div>
          ) : (
            <>
              <div className="test-plan-toolbar">
                <div className="test-plan-location">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFolderId(null);
                      setSelectedEntryKey(null);
                    }}
                  >
                    {activeSpace?.name}
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
                    disabled={!canEdit || busy}
                    onClick={() =>
                      setTextAction({
                        kind: "create-folder",
                        parentId: activeFolderId,
                      })}
                  >
                    <Folder className="mr-2 h-4 w-4" />
                    新增資料夾
                  </Button>
                  <Button
                    disabled={!canEdit || busy || !activeSpace}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    上傳檔案
                  </Button>
                  <input
                    ref={fileInputRef}
                    className="sr-only"
                    type="file"
                    multiple
                    onChange={handleFileSelection}
                  />
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
                  <SelectTrigger className="w-[150px]">
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
                  <SelectTrigger className="w-[145px]">
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
                  if (canEdit) setIsDragging(true);
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

                {loading ? (
                  <div className="test-plan-loading">
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    正在載入 Test_Plan…
                  </div>
                ) : visibleEntries.length === 0 ? (
                  <div className="test-plan-empty is-compact">
                    <Archive className="h-8 w-8" />
                    <h2>{query ? "找不到符合的項目" : "這個資料夾目前是空的"}</h2>
                    <p>
                      {query
                        ? "請調整搜尋字詞或檔案類型。"
                        : "將檔案拖到這裡，或使用右上方的上傳按鈕。"}
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
                    <div className="test-plan-list-head">
                      <span>名稱</span>
                      <span>格式</span>
                      <span>大小</span>
                      <span>更新時間</span>
                      <span />
                    </div>
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
                            {entry.kind === "folder"
                              ? entry.name
                              : entry.originalName}
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
        {activeSpace && (
          <TestPlanInspector
            entry={selectedEntry}
            canEdit={canEdit}
            busy={busy}
            downloadFile={downloadFile}
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
            正在上傳 {uploadProgress.completed}／{uploadProgress.total}
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

      <TestPlanSpaceDialog
        open={Boolean(spaceDialog)}
        mode={spaceDialog?.mode ?? "create"}
        space={spaceDialog?.space}
        busy={busy}
        error={spaceDialogError}
        onOpenChange={(open) => {
          if (!open) {
            setSpaceDialog(null);
            setSpaceDialogError(null);
          }
        }}
        onSubmit={handleSpaceSubmit}
      />
      <TextActionDialog
        action={textAction}
        busy={busy}
        onClose={() => setTextAction(null)}
        onSubmit={handleTextSubmit}
      />
      <MoveDialog
        action={moveAction}
        folders={folders}
        busy={busy}
        onClose={() => setMoveAction(null)}
        onSubmit={handleMoveSubmit}
      />
      <AlertDialog
        open={Boolean(deleteAction)}
        onOpenChange={(open) => !open && setDeleteAction(null)}
      >
        <AlertDialogContent className="border-[#653b4a] bg-[#0b1e30] text-[#f3f8fc]">
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
