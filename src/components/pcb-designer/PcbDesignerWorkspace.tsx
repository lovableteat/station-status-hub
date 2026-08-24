import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { CircuitBoard, LayoutTemplate, MoreHorizontal, PanelLeft, PanelRight, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useUser } from "@/components/auth/UserContext";
import { supabase } from "@/integrations/supabase/client";
import {
  PROJECT_FILE_ACCEPT,
  downloadBomCsv,
  downloadBomXlsx,
  downloadProject,
  projectExportFilename,
  readTabularFile,
} from "./core/files.ts";
import {
  parseBomRows,
  parseComponentRows,
  type TabularImportError,
} from "./core/tabular.ts";
import { parseProjectJson } from "./core/validation.ts";
import { importStepModel } from "../data-center/stepImport.ts";
import {
  PCB_MODEL_FILE_ACCEPT,
  MAX_PCB_MODEL_FILE_BYTES,
  getDefaultPcbModelAssetStore,
  isStepModelFile,
  toPcbModelAsset,
} from "./core/modelAssets.ts";
import { PcbDialogs, type PcbDialogState } from "./PcbDialogs.tsx";
import { PcbLeftRail, type PcbLeftTab } from "./PcbLeftRail.tsx";
import { PcbToolbar } from "./PcbToolbar.tsx";
import { PcbCanvas } from "./PcbCanvas.tsx";
import { PcbCollaborators } from "./PcbCollaborators.tsx";
import { PcbInspector } from "./PcbInspector.tsx";
import { exportPcbSvgAsPng } from "./core/pngExport.ts";
import {
  createPcbAccountRemoteClient,
  isDatabaseUserId,
  type PcbAccountDatabase,
} from "./core/accountRemoteSync.ts";
import {
  usePcbWorkspace,
  type ImportedComponent,
  type PcbLibraryComponent,
  type PcbProject,
  type PcbTemplate,
} from "./hooks/usePcbWorkspace.ts";
import { usePcbProjectPresence, type PcbViewMode } from "./hooks/usePcbProjectPresence.ts";
import "./pcb-designer.css";

const Pcb3DCanvas = lazy(() => import("./Pcb3DCanvas.tsx").then((module) => ({
  default: module.Pcb3DCanvasSafe,
})));

export interface PcbPngExportOptions {
  project: PcbProject;
  filename: string;
  includeGrid: boolean;
}

export interface PcbDesignerWorkspaceProps {
  onExportPng?: (options: PcbPngExportOptions) => void | Promise<void>;
}

type ImportPreviewInput = {
  title: string;
  importKind: "library" | "bom";
  validCount: number;
  totalCount: number;
  errors: TabularImportError[];
  placementCount?: number;
  onCommit: () => void;
};

type ProjectImportPreviewInput = {
  title: string;
  validCount: number;
  errors: TabularImportError[];
  onCommit: () => void;
};

function statusLabel(status: PcbProject["status"]): string {
  return {
    draft: "專案草稿",
    review: "專案審核中",
    approved: "專案已核准",
  }[status];
}

function persistenceLabel(status: string): string {
  if (status === "saving") return "儲存中";
  if (status === "synced") return "已同步";
  if (status === "unsaved") return "尚未儲存";
  return "本機草稿";
}

export function PcbDesignerWorkspace({
  onExportPng,
}: PcbDesignerWorkspaceProps) {
  const { canEditModule } = usePermissions();
  const { user } = useUser();
  const clientIdRef = useRef(`pcb-client-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  const remoteClient = useMemo(
    () => isDatabaseUserId(user?.userId)
      ? createPcbAccountRemoteClient(
        supabase.schema("workspace") as unknown as PcbAccountDatabase,
        user.userId,
        clientIdRef.current,
      )
      : null,
    [user?.userId],
  );
  const workspace = usePcbWorkspace({
    canEdit: canEditModule("pcb-designer"),
    clientId: clientIdRef.current,
    remoteClient,
    editor: user
      ? {
        userId: user.userId,
        username: user.username,
        displayName: user.displayName,
      }
      : null,
  });
  const { saveNow, setTool } = workspace;
  const [dialog, setDialog] = useState<PcbDialogState | null>(null);
  const [exportIncludesGrid, setExportIncludesGrid] = useState(true);
  const [openDrawer, setOpenDrawer] = useState<"left" | "right" | null>(null);
  const [leftRailTab, setLeftRailTab] = useState<PcbLeftTab>("projects");
  const [viewMode, setViewMode] = useState<PcbViewMode>("2d");
  const [placementComponentId, setPlacementComponentId] = useState<string | null>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const modelAssetStoreRef = useRef(getDefaultPcbModelAssetStore());
  const presence = usePcbProjectPresence({
    accessMode: workspace.canEdit ? "editor" : "viewer",
    clientId: clientIdRef.current,
    dirty: workspace.hasUnsavedChanges,
    onProjectSaved: workspace.refreshRemoteNow,
    projectId: workspace.activeProject.id,
    projectName: workspace.activeProject.name,
    user,
    viewMode,
  });

  const handleSave = useCallback(async () => {
    if (!workspace.canEdit) {
      toast({
        title: "目前為即時檢視",
        description: workspace.projectLock.editorName
          ? `${workspace.projectLock.editorName} 正在編輯這個板子；儲存後你會立即看到最新版本。`
          : "目前沒有這個板子的編輯權。",
      });
      return;
    }
    const remoteSaved = await saveNow();
    if (remoteClient && !remoteSaved) {
      toast({
        title: "已儲存在本機，但雲端同步失敗",
        description: "內容仍保留在此瀏覽器，請確認網路後再按一次儲存。",
        variant: "destructive",
      });
      return;
    }
    if (remoteClient) {
      await presence.broadcastProjectSaved(workspace.data.updatedAt);
    }
    toast({
      title: remoteClient ? "儲存與同步完成" : "本機草稿已儲存",
      description: remoteClient
        ? "雲端版本已更新，同案檢視者會立即看到最新內容。"
        : "目前為本機帳號，內容已保存在此瀏覽器。",
    });
  }, [presence.broadcastProjectSaved, remoteClient, saveNow, workspace.canEdit, workspace.data.updatedAt, workspace.projectLock.editorName]);

  const changeViewMode = useCallback((mode: PcbViewMode) => {
    setViewMode(mode);
    if (mode === "3d") {
      setPlacementComponentId(null);
    }
  }, []);

  const startPlacement = useCallback((componentId: string) => {
    setPlacementComponentId(componentId);
    setTool("select");
  }, [setTool]);
  const cancelPlacement = useCallback(() => setPlacementComponentId(null), []);
  const completePlacement = useCallback(() => setPlacementComponentId(null), []);

  const openTemplateCenter = useCallback(() => {
    setLeftRailTab("templates");
    setOpenDrawer("left");
  }, []);

  const createProjectFromTemplate = useCallback((templateId: string) => {
    const template = workspace.data.templates.find((item) => item.id === templateId);
    if (!template) return;
    workspace.applyTemplate(templateId);
    setLeftRailTab("projects");
    toast({
      title: `已從「${template.name}」建立新專案`,
      description: "目前專案草稿未被覆蓋，新的專案已切換到專案清單。",
    });
  }, [workspace.applyTemplate, workspace.data.templates]);

  useEffect(() => {
    if (
      placementComponentId
      && !workspace.data.library.some((component) => component.id === placementComponentId)
    ) {
      setPlacementComponentId(null);
    }
  }, [placementComponentId, workspace.data.library]);

  useEffect(() => {
    if (placementComponentId && (workspace.tool === "measure" || workspace.tool === "keepout")) {
      setPlacementComponentId(null);
    }
  }, [placementComponentId, workspace.tool]);

  useEffect(() => {
    const saveWithKeyboard = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== "s") return;
      event.preventDefault();
      void handleSave();
    };
    window.addEventListener("keydown", saveWithKeyboard);
    return () => window.removeEventListener("keydown", saveWithKeyboard);
  }, [handleSave]);

  const previewImport = (input: ImportPreviewInput) => setDialog({
    kind: "import-preview",
    ...input,
  });

  const previewProjectImport = (input: ProjectImportPreviewInput) => setDialog({
    kind: "project-import-preview",
    ...input,
  });

  const handleProjectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!file.name.toLocaleLowerCase().endsWith(".json")) {
      previewProjectImport({
        title: "匯入專案預覽",
        validCount: 0,
        errors: [{ row: 1, message: "專案檔案必須是 JSON。" }],
        onCommit: () => undefined,
      });
      return;
    }
    try {
      const parsed = parseProjectJson(await file.text());
      if (parsed.ok === false) {
        previewProjectImport({
          title: "匯入專案預覽",
          validCount: 0,
          errors: [{ row: 1, message: parsed.error }],
          onCommit: () => undefined,
        });
        return;
      }
      previewProjectImport({
        title: "匯入專案預覽",
        validCount: 1,
        errors: [],
        onCommit: () => {
          workspace.importProject(parsed.value);
          toast({ title: "專案已匯入", description: `${parsed.value.name} 已建立為新專案。` });
        },
      });
    } catch (error) {
      previewProjectImport({
        title: "匯入專案預覽",
        validCount: 0,
        errors: [{
          row: 1,
          message: error instanceof Error ? error.message : "無法讀取專案檔案。",
        }],
        onCommit: () => undefined,
      });
    }
  };

  const handleLibraryPreviewFile = async (file: File) => {
    try {
      const result = parseComponentRows(await readTabularFile(file));
      previewImport({
        title: "元件庫匯入預覽",
        importKind: "library",
        validCount: result.valid.length,
        totalCount: result.valid.length + result.errors.length,
        errors: result.errors,
        onCommit: () => {
          workspace.uploadLibraryComponents(result.valid);
          toast({ title: "元件庫已更新", description: `寫入 ${result.valid.length} 筆有效元件。` });
        },
      });
    } catch (error) {
      previewImport({
        title: "元件庫匯入預覽",
        importKind: "library",
        validCount: 0,
        totalCount: 1,
        errors: [{
          row: 1,
          message: error instanceof Error ? error.message : "無法解析元件庫檔案。",
        }],
        onCommit: () => undefined,
      });
    }
  };

  const handleBomPreviewFile = async (file: File) => {
    try {
      const result = parseBomRows(await readTabularFile(file));
      previewImport({
        title: "BOM 匯入預覽",
        importKind: "bom",
        validCount: result.valid.length,
        totalCount: result.valid.length + result.errors.length,
        errors: result.errors,
        placementCount: result.placementCount,
        onCommit: () => {
          workspace.importBom(result.valid);
          toast({ title: "BOM 已匯入", description: `建立 ${result.placementCount} 筆待放置項目。` });
        },
      });
    } catch (error) {
      previewImport({
        title: "BOM 匯入預覽",
        importKind: "bom",
        validCount: 0,
        totalCount: 1,
        errors: [{
          row: 1,
          message: error instanceof Error ? error.message : "無法解析 BOM 檔案。",
        }],
        placementCount: 0,
        onCommit: () => undefined,
      });
    }
  };

  const handleModelFile = useCallback(async (file: File, componentId: string) => {
    if (!isStepModelFile(file)) throw new Error(`只接受 STP 或 STEP 模型檔案（${PCB_MODEL_FILE_ACCEPT}）。`);
    if (file.size > MAX_PCB_MODEL_FILE_BYTES) {
      throw new Error(`STEP 模型檔案不可超過 ${Math.round(MAX_PCB_MODEL_FILE_BYTES / 1024 / 1024)} MB。`);
    }
    const component = workspace.activeProject.components.find((item) => item.instanceId === componentId);
    if (!component || component.locked || !workspace.canMutate) {
      throw new Error("請先選取可編輯的元件。");
    }
    const model = await importStepModel(file);
    const asset = toPcbModelAsset(model);
    await modelAssetStoreRef.current.put(asset);
    const assigned = workspace.assignModelAsset(componentId, asset.metadata);
    if (!assigned) {
      await modelAssetStoreRef.current.delete(asset.metadata.id);
      throw new Error("元件在匯入期間已被鎖定或不可編輯，模型未套用。 ");
    }
    return asset.metadata;
  }, [workspace]);

  const requestDeleteProject = (project: PcbProject) => setDialog({
    kind: "confirm",
    title: "刪除專案",
    description: `確定要刪除「${project.name}」嗎？此操作只會在確認後執行。`,
    onConfirm: () => void workspace.deleteProject(project.id),
  });
  const requestDeleteTemplate = (template: PcbTemplate) => setDialog({
    kind: "confirm",
    title: "刪除自訂模板",
    description: `確定要刪除「${template.name}」嗎？內建模板不會被刪除。`,
    onConfirm: () => workspace.deleteTemplate(template.id),
  });
  const requestDeleteComponent = (component: PcbLibraryComponent) => setDialog({
    kind: "confirm",
    title: "刪除自訂元件",
    description: `確定要刪除「${component.name}」嗎？內建元件不會被刪除。`,
    onConfirm: () => workspace.deleteLibraryComponent(component.id),
  });

  const saveComponent = (
    component: ImportedComponent,
    componentId?: string,
  ) => {
    if (componentId) workspace.editLibraryComponent(componentId, component);
    else workspace.createLibraryComponent(component);
  };

  const notifyError = (title: string, error: unknown) => {
    toast({
      title,
      description: error instanceof Error ? error.message : "請稍後再試。",
      variant: "destructive",
    });
  };

  return (
    <section
      className="pcb-designer-workspace maintenance-workspace"
      data-testid="pcb-designer-workspace"
      aria-labelledby="pcb-designer-title"
    >
      <header
        className="pcb-project-bar"
        data-testid="pcb-project-bar"
        data-mobile-pcb-command-bar="true"
      >
        <div className="pcb-project-identity">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="pcb-panel-toggle h-8 w-8 rounded-lg"
            onClick={() => setOpenDrawer((current) => current === "left" ? null : "left")}
            aria-label="開啟專案與資源面板"
            title="專案與資源"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
          <span className="pcb-project-symbol" aria-hidden="true">
            <CircuitBoard className="h-4 w-4" />
          </span>
          <div className="pcb-project-heading">
            <h1 id="pcb-designer-title">PCB Designer</h1>
            <span>Layout workspace</span>
          </div>
          <select
            className="pcb-project-select"
            value={workspace.activeProject.id}
            onChange={(event) => workspace.openProject(event.target.value)}
            aria-label="目前 PCB 專案"
          >
            {workspace.data.projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <span className="pcb-status-chip">{statusLabel(workspace.activeProject.status)}</span>
          <span className="pcb-save-state" data-status={workspace.persistenceStatus} title={persistenceLabel(workspace.persistenceStatus)}>
            {persistenceLabel(workspace.persistenceStatus)}
          </span>
          {remoteClient ? (
            workspace.projectLock.status === "acquiring" ? (
              <span className="pcb-read-only">確認編輯權...</span>
            ) : workspace.canEdit ? (
              <span className="pcb-editing-lock">你正在編輯</span>
            ) : (
              <span
                className="pcb-read-only"
                title={workspace.projectLock.editorName
                  ? `${workspace.projectLock.editorName} 正在編輯這個板子`
                  : "目前為即時檢視"}
              >
                {workspace.projectLock.editorName
                  ? `${workspace.projectLock.editorName} 編輯中 · 即時檢視`
                  : "即時檢視"}
              </span>
            )
          ) : !workspace.canEdit && <span className="pcb-read-only">唯讀</span>}

          <div className="pcb-mobile-project-actions">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="pcb-panel-toggle h-10 w-10 rounded-lg"
              onClick={() => setOpenDrawer((current) => current === "right" ? null : "right")}
              aria-label="開啟屬性面板"
              title="屬性面板"
            >
              <PanelRight className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="pcb-panel-toggle h-10 w-10 rounded-lg"
                  aria-label="開啟 PCB 專案操作"
                  title="專案操作"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="pcb-dropdown-menu w-64">
                <DropdownMenuLabel>專案操作</DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={openTemplateCenter}
                >
                  <LayoutTemplate className="mr-2 h-4 w-4" />開啟模板中心
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!workspace.canMutate}
                  onSelect={() => setDialog({ kind: "project-settings", project: workspace.activeProject })}
                >
                  <Settings2 className="mr-2 h-4 w-4" />專案設定
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="pcb-project-actions">
          <PcbCollaborators
            accessMode={workspace.canEdit ? "editor" : "viewer"}
            connected={presence.connected}
            currentUser={user}
            dirty={workspace.hasUnsavedChanges}
            lockEditorName={workspace.projectLock.editorName}
            peers={presence.peers}
            viewMode={viewMode}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="pcb-panel-toggle h-8 w-8 rounded-lg"
            onClick={() => setOpenDrawer((current) => current === "right" ? null : "right")}
            aria-label="開啟屬性面板"
            title="屬性面板"
          >
            <PanelRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="pcb-template-center-action"
            onClick={openTemplateCenter}
            aria-label="開啟模板中心"
            title="模板只用來建立新專案，不會覆蓋目前草稿"
          >
            <LayoutTemplate className="h-4 w-4" />
            <span>模板中心</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="pcb-header-icon-button pcb-settings-action"
            disabled={!workspace.canMutate}
            onClick={() => setDialog({ kind: "project-settings", project: workspace.activeProject })}
            aria-label="專案設定"
            title="專案設定"
          >
            <Settings2 className="h-4 w-4" />
            <span>專案設定</span>
          </Button>
          <input
            ref={projectInputRef}
            type="file"
            accept={PROJECT_FILE_ACCEPT}
            className="sr-only"
            disabled={!workspace.canMutate}
            onChange={(event) => void handleProjectFile(event)}
          />
        </div>
      </header>

      <PcbToolbar
        canMutate={workspace.canMutate}
        canSave={workspace.canEdit}
        documentLocked={workspace.documentLocked}
        tool={workspace.tool}
        activeLayer={workspace.activeLayer}
        visibleLayer={workspace.visibleLayer}
        zoom={workspace.zoom}
        canUndo={workspace.canUndo}
        canRedo={workspace.canRedo}
        isSaving={workspace.persistenceStatus === "saving"}
        viewMode={viewMode}
        exportPngAvailable={viewMode === "2d"}
        exportIncludesGrid={exportIncludesGrid}
        onSave={handleSave}
        onImportProject={() => projectInputRef.current?.click()}
        onViewModeChange={changeViewMode}
        onExportProject={() => downloadProject(workspace.activeProject)}
        onExportBomCsv={() => downloadBomCsv(workspace.activeProject)}
        onExportBomXlsx={() => {
          void downloadBomXlsx(workspace.activeProject).catch((error) =>
            notifyError("無法匯出 BOM XLSX", error));
        }}
        onExportPng={() => {
          const options = {
            project: workspace.activeProject,
            filename: projectExportFilename(workspace.activeProject.name).replace(".pcb-project.json", ".png"),
            includeGrid: exportIncludesGrid,
          };
          const operation = onExportPng
            ? Promise.resolve(onExportPng(options))
            : (() => {
              const svg = document.querySelector<SVGSVGElement>("[data-pcb-canvas]");
              if (!svg) return Promise.reject(new Error("找不到 PCB SVG 畫布。"));
              return exportPcbSvgAsPng(
                svg,
                options.filename,
                options.includeGrid,
                workspace.activeProject.board,
              );
            })();
          void operation.catch((error) => notifyError("無法匯出 PNG", error));
        }}
        onExportIncludesGridChange={setExportIncludesGrid}
        onUndo={workspace.undo}
        onRedo={workspace.redo}
        onToolChange={workspace.setTool}
        onActiveLayerChange={workspace.setActiveLayer}
        onVisibleLayerChange={workspace.setVisibleLayer}
        onToggleLock={workspace.toggleDocumentLock}
        onZoomChange={workspace.setZoom}
        onResetView={workspace.resetView}
      />
      <div className="pcb-editor-grid">
        {openDrawer && (
          <button
            type="button"
            className="pcb-drawer-scrim"
            aria-label="關閉側邊面板"
            onClick={() => setOpenDrawer(null)}
          />
        )}
        <div className={cn("pcb-left-drawer", openDrawer === "left" && "is-open")}>
          <PcbLeftRail
            workspace={workspace}
            activeTab={leftRailTab}
            onActiveTabChange={setLeftRailTab}
            placementComponentId={placementComponentId}
            onStartPlacement={startPlacement}
            onNewProject={() => setDialog({ kind: "new-project" })}
            onEditProject={(project) => {
              workspace.openProject(project.id);
              setDialog({ kind: "project-settings", project });
            }}
            onPreviewProject={(project) => setDialog({
              kind: "project-preview",
              project,
              onOpen: () => workspace.openProject(project.id),
            })}
            onSaveTemplate={() => setDialog({ kind: "save-template" })}
            onApplyTemplate={createProjectFromTemplate}
            onRenameTemplate={(template) => setDialog({ kind: "rename-template", template })}
            onEditComponent={(component) => setDialog({ kind: "component", component })}
            onDeleteProject={requestDeleteProject}
            onDeleteTemplate={requestDeleteTemplate}
            onDeleteComponent={requestDeleteComponent}
            onLibraryFile={(file) => void handleLibraryPreviewFile(file)}
            onBomFile={(file) => void handleBomPreviewFile(file)}
          />
        </div>

        {viewMode === "2d" ? (
          <PcbCanvas
            workspace={workspace}
            visibleLayer={workspace.visibleLayer}
            selectedObjects={workspace.selectedObjects}
            placementComponentId={placementComponentId}
            onPlacementComplete={completePlacement}
            onPlacementCancel={cancelPlacement}
          />
        ) : (
          <Suspense fallback={<div className="pcb-3d-loading">正在建立 3D 板件與元件...</div>}>
            <Pcb3DCanvas
              workspace={workspace}
              visibleLayer={workspace.visibleLayer}
              selectedObjects={workspace.selectedObjects}
            />
          </Suspense>
        )}
        <div className={cn("pcb-right-drawer", openDrawer === "right" && "is-open")}>
          <PcbInspector workspace={workspace} onImportModel={handleModelFile} />
        </div>
      </div>

      <footer className="pcb-status-bar">
        <span>元件 {workspace.activeProject.components.length}</span>
        <span className="font-mono">{workspace.activeProject.board.width}×{workspace.activeProject.board.height} mm</span>
        <span>檢視 {viewMode.toUpperCase()}</span>
        <span>放置層 {workspace.activeLayer === "top" ? "Top" : "Bottom"}</span>
        {viewMode === "2d" && <span className="font-mono">{workspace.zoom}%</span>}
        <span>網格 {workspace.activeProject.board.gridSize} mm</span>
        <span className="ml-auto">
          {persistenceLabel(workspace.persistenceStatus)} · 手動儲存模式（Ctrl+S）
        </span>
      </footer>

      <PcbDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        onCreateProject={workspace.createProject}
        onUpdateProject={workspace.updateProjectSettings}
        onSaveTemplate={workspace.saveTemplate}
        onRenameTemplate={workspace.renameTemplate}
        onSaveComponent={saveComponent}
      />
    </section>
  );
}
