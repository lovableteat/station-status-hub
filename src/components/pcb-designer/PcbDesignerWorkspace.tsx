import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { CircuitBoard, FileJson, PanelLeft, PanelRight, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { PcbDialogs, type PcbDialogState } from "./PcbDialogs.tsx";
import { PcbLeftRail } from "./PcbLeftRail.tsx";
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
  default: module.Pcb3DCanvas,
})));

export interface PcbPngExportOptions {
  project: PcbProject;
  filename: string;
  includeGrid: boolean;
}

export interface PcbDesignerWorkspaceProps {
  onExportPng?: (options: PcbPngExportOptions) => void | Promise<void>;
}

function statusLabel(status: PcbProject["status"]): string {
  return {
    draft: "草稿",
    review: "審核中",
    approved: "已核准",
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
  const remoteClient = useMemo(
    () => isDatabaseUserId(user?.userId)
      ? createPcbAccountRemoteClient(
        supabase as unknown as PcbAccountDatabase,
        user.userId,
      )
      : null,
    [user?.userId],
  );
  const workspace = usePcbWorkspace({
    canEdit: canEditModule("pcb-designer"),
    remoteClient,
  });
  const { saveNow, setTool } = workspace;
  const [dialog, setDialog] = useState<PcbDialogState | null>(null);
  const [exportIncludesGrid, setExportIncludesGrid] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    workspace.data.templates[0]?.id ?? "",
  );
  const [openDrawer, setOpenDrawer] = useState<"left" | "right" | null>(null);
  const [viewMode, setViewMode] = useState<PcbViewMode>("2d");
  const [placementComponentId, setPlacementComponentId] = useState<string | null>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const presence = usePcbProjectPresence({
    dirty: workspace.hasUnsavedChanges,
    projectId: workspace.activeProject.id,
    projectName: workspace.activeProject.name,
    user,
    viewMode,
  });

  const handleSave = useCallback(async () => {
    const remoteSaved = await saveNow();
    if (remoteClient && !remoteSaved) {
      toast({
        title: "已儲存在本機，但雲端同步失敗",
        description: "內容仍保留在此瀏覽器，請確認網路後再按一次儲存。",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: remoteClient ? "儲存與同步完成" : "本機草稿已儲存",
      description: remoteClient
        ? "同一帳號在其他電腦重新開啟後可讀取這次版本。"
        : "目前為本機帳號，內容已保存在此瀏覽器。",
    });
  }, [remoteClient, saveNow]);

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

  const previewImport = (
    title: string,
    validCount: number,
    errors: TabularImportError[],
    onCommit: () => void,
  ) => setDialog({
    kind: "import-preview",
    title,
    validCount,
    errors,
    onCommit,
  });

  const handleProjectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!file.name.toLocaleLowerCase().endsWith(".json")) {
      previewImport("匯入專案預覽", 0, [{ row: 1, message: "專案檔案必須是 JSON。" }], () => undefined);
      return;
    }
    try {
      const parsed = parseProjectJson(await file.text());
      if (parsed.ok === false) {
        previewImport("匯入專案預覽", 0, [{ row: 1, message: parsed.error }], () => undefined);
        return;
      }
      previewImport("匯入專案預覽", 1, [], () => {
        workspace.importProject(parsed.value);
        toast({ title: "專案已匯入", description: `${parsed.value.name} 已建立為新專案。` });
      });
    } catch (error) {
      previewImport("匯入專案預覽", 0, [{
        row: 1,
        message: error instanceof Error ? error.message : "無法讀取專案檔案。",
      }], () => undefined);
    }
  };

  const handleLibraryFile = async (file: File) => {
    try {
      const result = parseComponentRows(await readTabularFile(file));
      previewImport("元件庫匯入預覽", result.valid.length, result.errors, () => {
        workspace.uploadLibraryComponents(result.valid);
        toast({ title: "元件庫已更新", description: `寫入 ${result.valid.length} 筆有效元件。` });
      });
    } catch (error) {
      previewImport("元件庫匯入預覽", 0, [{
        row: 1,
        message: error instanceof Error ? error.message : "無法解析元件庫檔案。",
      }], () => undefined);
    }
  };

  const handleBomFile = async (file: File) => {
    try {
      const result = parseBomRows(await readTabularFile(file));
      previewImport("BOM 匯入預覽", result.valid.length, result.errors, () => {
        workspace.importBom(result.valid);
        toast({ title: "BOM 已匯入", description: `建立 ${result.placementCount} 筆待放置項目。` });
      });
    } catch (error) {
      previewImport("BOM 匯入預覽", 0, [{
        row: 1,
        message: error instanceof Error ? error.message : "無法解析 BOM 檔案。",
      }], () => undefined);
    }
  };

  const requestDeleteProject = (project: PcbProject) => setDialog({
    kind: "confirm",
    title: "刪除專案",
    description: `確定要刪除「${project.name}」嗎？此操作只會在確認後執行。`,
    onConfirm: () => workspace.deleteProject(project.id),
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
          <span className="pcb-save-state" data-status={workspace.persistenceStatus}>
            {persistenceLabel(workspace.persistenceStatus)}
          </span>
          {!workspace.canEdit && <span className="pcb-read-only">唯讀</span>}
        </div>

        <div className="pcb-project-actions">
          <PcbCollaborators
            connected={presence.connected}
            currentUser={user}
            dirty={workspace.hasUnsavedChanges}
            peers={presence.peers}
            viewMode={viewMode}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="pcb-panel-toggle h-8 w-8 rounded-lg"
            onClick={() => setOpenDrawer((current) => current === "right" ? null : "right")}
            aria-label="開啟屬性與 DRC 面板"
            title="屬性與 DRC"
          >
            <PanelRight className="h-4 w-4" />
          </Button>
          <select
            value={selectedTemplateId}
            onChange={(event) => setSelectedTemplateId(event.target.value)}
            className="pcb-template-select"
            aria-label="選擇 PCB 模板"
            disabled={!workspace.canMutate}
          >
            {workspace.data.templates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="pcb-template-apply"
            disabled={!workspace.canMutate || !selectedTemplateId}
            onClick={() => workspace.applyTemplate(selectedTemplateId)}
          >
            套用模板
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="pcb-header-icon-button"
            disabled={!workspace.canMutate}
            onClick={() => setDialog({ kind: "project-settings", project: workspace.activeProject })}
            aria-label="專案設定"
            title="專案設定"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="pcb-header-icon-button"
            disabled={!workspace.canMutate}
            onClick={() => projectInputRef.current?.click()}
            aria-label="匯入專案 JSON"
            title="匯入專案 JSON"
          >
            <FileJson className="h-4 w-4" />
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
        zoom={workspace.zoom}
        canUndo={workspace.canUndo}
        canRedo={workspace.canRedo}
        isSaving={workspace.persistenceStatus === "saving"}
        viewMode={viewMode}
        exportPngAvailable={viewMode === "2d"}
        exportIncludesGrid={exportIncludesGrid}
        onNew={() => setDialog({ kind: "new-project" })}
        onSave={handleSave}
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
        onToggleLock={workspace.toggleDocumentLock}
        onZoomChange={workspace.setZoom}
        onResetView={workspace.resetView}
        onRunDrc={() => {
          workspace.runDrc();
          setOpenDrawer("right");
        }}
      />
      <p className="pcb-mobile-advisory">
        建議使用桌面進行精細佈局；手機仍可檢視、匯入匯出與查看 DRC。
      </p>

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
            onRenameTemplate={(template) => setDialog({ kind: "rename-template", template })}
            onEditComponent={(component) => setDialog({ kind: "component", component })}
            onDeleteProject={requestDeleteProject}
            onDeleteTemplate={requestDeleteTemplate}
            onDeleteComponent={requestDeleteComponent}
            onLibraryFile={(file) => void handleLibraryFile(file)}
            onBomFile={(file) => void handleBomFile(file)}
          />
        </div>

        {viewMode === "2d" ? (
          <PcbCanvas
            workspace={workspace}
            placementComponentId={placementComponentId}
            onPlacementComplete={completePlacement}
            onPlacementCancel={cancelPlacement}
          />
        ) : (
          <Suspense fallback={<div className="pcb-3d-loading">正在建立 3D 板件與元件...</div>}>
            <Pcb3DCanvas workspace={workspace} />
          </Suspense>
        )}
        <div className={cn("pcb-right-drawer", openDrawer === "right" && "is-open")}>
          <PcbInspector workspace={workspace} />
        </div>
      </div>

      <footer className="pcb-status-bar">
        <span>元件 {workspace.activeProject.components.length}</span>
        <span className="font-mono">{workspace.activeProject.board.width}×{workspace.activeProject.board.height} mm</span>
        <span>檢視 {viewMode.toUpperCase()}</span>
        <span>放置層 {workspace.activeLayer === "top" ? "Top" : "Bottom"}</span>
        {viewMode === "2d" && <span className="font-mono">{workspace.zoom}%</span>}
        <span>網格 {workspace.activeProject.board.gridSize} mm</span>
        <span>DRC {workspace.drcIssues.length}</span>
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
