import { useMemo, useState, type ChangeEvent } from "react";
import {
  CheckCircle2,
  Copy,
  Eye,
  FileUp,
  Filter,
  FolderOpen,
  Pencil,
  PencilLine,
  Plus,
  Search,
  Trash2,
  UserRound,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PCB_LIBRARY_DRAG_TYPE } from "./PcbCanvas.tsx";
import {
  BOM_FILE_ACCEPT,
  LIBRARY_FILE_ACCEPT,
} from "./core/files.ts";
import type {
  PcbLibraryComponent,
  PcbProject,
  PcbTemplate,
  PcbWorkspaceApi,
} from "./hooks/usePcbWorkspace.ts";

export type PcbLeftTab = "projects" | "templates" | "library" | "bom";

interface PcbLeftRailProps {
  workspace: PcbWorkspaceApi;
  activeTab: PcbLeftTab;
  onActiveTabChange: (tab: PcbLeftTab) => void;
  placementComponentId: string | null;
  onStartPlacement: (componentId: string) => void;
  onNewProject: () => void;
  onEditProject: (project: PcbProject) => void;
  onPreviewProject: (project: PcbProject) => void;
  onSaveTemplate: () => void;
  onApplyTemplate: (templateId: string) => void;
  onRenameTemplate: (template: PcbTemplate) => void;
  onEditComponent: (component?: PcbLibraryComponent) => void;
  onDeleteProject: (project: PcbProject) => void;
  onDeleteTemplate: (template: PcbTemplate) => void;
  onDeleteComponent: (component: PcbLibraryComponent) => void;
  onLibraryFile: (file: File) => void;
  onBomFile: (file: File) => void;
}

const tabLabels: Record<PcbLeftTab, string> = {
  projects: "專案",
  templates: "模板中心",
  library: "元件庫",
  bom: "BOM",
};

const projectStatusLabels: Record<PcbProject["status"], string> = {
  draft: "草稿",
  review: "審核中",
  approved: "已核准",
};

function RowAction({
  label,
  icon: Icon,
  disabled,
  danger,
  onClick,
}: {
  label: string;
  icon: typeof Copy;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "pcb-row-action",
        danger && "is-danger",
      )}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  );
}

export function PcbLeftRail({
  workspace,
  activeTab,
  onActiveTabChange,
  placementComponentId,
  onStartPlacement,
  onNewProject,
  onEditProject,
  onPreviewProject,
  onSaveTemplate,
  onApplyTemplate,
  onRenameTemplate,
  onEditComponent,
  onDeleteProject,
  onDeleteTemplate,
  onDeleteComponent,
  onLibraryFile,
  onBomFile,
}: PcbLeftRailProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [templateSourceFilter, setTemplateSourceFilter] = useState("all");
  const normalized = query.trim().toLocaleLowerCase();
  const activeEditorName = workspace.lastSavedProjectId === workspace.activeProject.id
    ? workspace.lastSavedEditor ?? workspace.activeProject.lastEditedBy ?? "尚無紀錄"
    : workspace.activeProject.lastEditedBy ?? "尚無紀錄";
  const editorState = workspace.hasUnsavedChanges ? "尚未儲存" : "已同步";

  const projects = useMemo(
    () => [...workspace.data.projects]
      .filter((item) =>
        (statusFilter === "all" || item.status === statusFilter)
        && `${item.name} ${item.description}`.toLocaleLowerCase().includes(normalized))
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)),
    [normalized, statusFilter, workspace.data.projects],
  );
  const templates = useMemo(
    () => workspace.data.templates.filter((item) =>
      (templateSourceFilter === "all"
        || (templateSourceFilter === "built-in" && item.isBuiltIn)
        || (templateSourceFilter === "custom" && !item.isBuiltIn))
      &&
      `${item.name} ${item.category} ${item.description}`.toLocaleLowerCase().includes(normalized)),
    [normalized, templateSourceFilter, workspace.data.templates],
  );
  const componentTypes = useMemo(
    () => [...new Set(workspace.data.library.map((item) => item.type))].sort(),
    [workspace.data.library],
  );
  const library = useMemo(
    () => workspace.data.library.filter((item) =>
      (typeFilter === "all" || item.type === typeFilter)
      && (sourceFilter === "all" || item.source === sourceFilter)
      && `${item.name} ${item.manufacturer} ${item.partNumber}`.toLocaleLowerCase().includes(normalized)),
    [normalized, sourceFilter, typeFilter, workspace.data.library],
  );

  const chooseFile = (
    event: ChangeEvent<HTMLInputElement>,
    onFile: (file: File) => void,
  ) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) onFile(file);
  };

  return (
    <aside
      className="pcb-left-rail"
      data-testid="pcb-left-rail"
      aria-label="PCB 專案與資源"
    >
      <div className="pcb-rail-tabs" role="tablist" aria-label="PCB 資源分頁">
        {(Object.keys(tabLabels) as PcbLeftTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={cn(
              "pcb-rail-tab",
              activeTab === tab && "is-active",
            )}
            aria-pressed={activeTab === tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => {
              onActiveTabChange(tab);
              setQuery("");
            }}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      <div className="pcb-rail-filter">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`搜尋${tabLabels[activeTab]}`}
            aria-label={`搜尋${tabLabels[activeTab]}`}
            className="pcb-control pcb-search-input"
          />
        </label>
        {activeTab === "projects" && (
          <label className="relative mt-2 block">
            <Filter className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="篩選專案狀態"
              className="pcb-control pcb-status-filter w-full"
            >
              <option value="all">全部狀態</option>
              <option value="draft">草稿</option>
              <option value="review">審核中</option>
              <option value="approved">已核准</option>
            </select>
          </label>
        )}
        {activeTab === "templates" && (
          <label className="relative mt-2 block">
            <select
              value={templateSourceFilter}
              onChange={(event) => setTemplateSourceFilter(event.target.value)}
              aria-label="篩選模板來源"
              className="pcb-control w-full"
            >
              <option value="all">全部模板</option>
              <option value="built-in">內建模板</option>
              <option value="custom">我的模板</option>
            </select>
          </label>
        )}
        {activeTab === "library" && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              aria-label="篩選元件類型"
              className="pcb-control min-w-0"
            >
              <option value="all">全部類型</option>
              {componentTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
              aria-label="篩選元件來源"
              className="pcb-control min-w-0"
            >
              <option value="all">全部來源</option>
              <option value="built-in">內建</option>
              <option value="custom">自訂</option>
              <option value="bom">BOM</option>
            </select>
          </div>
        )}
      </div>

      <div className="pcb-rail-actions">
        {activeTab === "projects" && (
          <Button type="button" size="sm" className="pcb-primary-action" disabled={!workspace.canMutate} onClick={onNewProject}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />新增專案
          </Button>
        )}
        {activeTab === "templates" && (
          <Button type="button" size="sm" className="pcb-primary-action" disabled={!workspace.canMutate} onClick={onSaveTemplate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />另存為模板
          </Button>
        )}
        {activeTab === "library" && (
          <>
            <Button type="button" size="sm" className="pcb-primary-action" disabled={!workspace.canMutate} onClick={() => onEditComponent()}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />新增元件
            </Button>
            <label
              className={cn(
                "pcb-upload-action",
                !workspace.canMutate && "pointer-events-none opacity-50",
              )}
              title="上傳 JSON、CSV 或 XLSX 元件庫"
            >
              <Upload className="mr-1 h-3.5 w-3.5" />
              上傳
              <input
                type="file"
                accept={LIBRARY_FILE_ACCEPT}
                className="sr-only"
                disabled={!workspace.canMutate}
                onChange={(event) => chooseFile(event, onLibraryFile)}
              />
            </label>
          </>
        )}
        {activeTab === "bom" && (
          <>
            <label
              className={cn(
                "pcb-upload-action flex-1 justify-center",
                !workspace.canMutate && "pointer-events-none opacity-50",
              )}
              title="上傳 CSV 或 XLSX BOM"
            >
              <FileUp className="mr-1.5 h-3.5 w-3.5" />
              匯入 BOM
              <input
                type="file"
                accept={BOM_FILE_ACCEPT}
                className="sr-only"
                disabled={!workspace.canMutate}
                onChange={(event) => chooseFile(event, onBomFile)}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="pcb-secondary-action"
              disabled={!workspace.canMutate || workspace.pendingPlacements.length === 0}
              onClick={() => {
                const result = workspace.autoPlacePending();
                const details = [
                  result.failed ? `${result.failed} 個項目本次未找到合法位置。` : "",
                  result.deferred ? `${result.deferred} 個項目保留在佇列，可再次分批執行。` : "",
                  result.limited ? "已達安全搜尋上限，未放置項目不會遺失。" : "",
                ].filter(Boolean).join(" ");
                toast({
                  title: result.placed ? `已自動放置 ${result.placed} 個元件` : "沒有元件可自動放置",
                  description: details || "BOM 佇列已處理完成。",
                  variant: result.placed ? "default" : "destructive",
                });
              }}
            >
              自動放置
            </Button>
          </>
        )}
      </div>

      <div className={cn("pcb-rail-context", activeTab === "templates" && "is-template-context")}>
        <div className="pcb-rail-context-heading">
          <strong>{activeTab === "templates" ? "模板中心" : activeTab === "projects" ? "專案檔案" : tabLabels[activeTab]}</strong>
          <span>{activeTab === "templates" ? `${templates.length} 個可用模板` : activeTab === "projects" ? `${projects.length} 個專案` : "工作區資源"}</span>
        </div>
        <p>
          {activeTab === "templates"
            ? "模板只用來建立新專案，不會覆蓋目前草稿。"
            : activeTab === "projects"
              ? "專案是可編輯、可儲存的實際工作版本。"
              : "管理目前工作區可使用的資源。"}
        </p>
      </div>

      {activeTab === "projects" && (
        <div className="pcb-project-editor-strip" aria-label="最後編輯者">
          <span className="pcb-project-editor-avatar" aria-hidden="true">
            <UserRound className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="pcb-project-editor-label">最後編輯者</span>
            <div className="pcb-project-editor-line">
              <strong className="truncate">{activeEditorName}</strong>
              <span className={cn("pcb-project-editor-state", workspace.hasUnsavedChanges && "is-editing")}>
                {workspace.hasUnsavedChanges ? <PencilLine className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                {editorState}
              </span>
            </div>
            <span className="pcb-project-editor-project truncate">{workspace.activeProject.name}</span>
          </div>
        </div>
      )}

      <div className="pcb-rail-list">
        {activeTab === "projects" && projects.map((project) => (
          <div key={project.id} className={cn("pcb-rail-item", project.id === workspace.activeProject.id && "is-active")}>
            <button type="button" className="pcb-project-card-main w-full text-left" onClick={() => workspace.openProject(project.id)}>
              <span className="pcb-project-card-heading">
                <span className="truncate text-xs font-semibold text-slate-100">{project.name}</span>
                {project.id === workspace.activeProject.id && <span className="pcb-project-current-badge">目前</span>}
              </span>
              <span className="pcb-project-card-meta">
                <span className={cn("pcb-project-status", `is-${project.status}`)}>{projectStatusLabels[project.status]}</span>
                <span aria-hidden="true">·</span>
                <span>{project.board.width}×{project.board.height} mm</span>
              </span>
              <span className="pcb-project-last-editor">
                最後編輯：{workspace.lastSavedProjectId === project.id
                  ? workspace.lastSavedEditor ?? project.lastEditedBy ?? "尚無紀錄"
                  : project.lastEditedBy ?? "尚無紀錄"}
              </span>
            </button>
            <div className="pcb-project-actions">
              <RowAction label={`開啟 ${project.name}`} icon={FolderOpen} onClick={() => workspace.openProject(project.id)} />
              <RowAction label={`預覽 ${project.name}`} icon={Eye} onClick={() => onPreviewProject(project)} />
              <RowAction label={`編輯 ${project.name}`} icon={Pencil} disabled={!workspace.canMutate} onClick={() => onEditProject(project)} />
              <RowAction label={`複製 ${project.name}`} icon={Copy} disabled={!workspace.canMutate} onClick={() => workspace.duplicateProject(project.id)} />
              <RowAction label={`刪除 ${project.name}`} icon={Trash2} danger disabled={!workspace.canMutate} onClick={() => onDeleteProject(project)} />
            </div>
          </div>
        ))}

        {activeTab === "templates" && templates.map((template) => (
          <div key={template.id} className="pcb-rail-item pcb-template-card">
            <div className="pcb-template-card-header">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-100">{template.name}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">{template.category} · {template.isBuiltIn ? "內建" : "自訂"}</p>
              </div>
              <Button type="button" variant="outline" size="sm" className="pcb-template-create-button" disabled={!workspace.canMutate} onClick={() => onApplyTemplate(template.id)}>
                建立專案
              </Button>
            </div>
            <p className="pcb-template-description">{template.description}</p>
            <div className="pcb-template-meta">
              <span>{template.project.board.width}×{template.project.board.height} mm</span>
              <span>{template.project.components.length} 個元件</span>
            </div>
            <div className="mt-1 flex justify-end">
              <RowAction label={`重新命名 ${template.name}`} icon={Pencil} disabled={!workspace.canMutate || template.isBuiltIn} onClick={() => onRenameTemplate(template)} />
              <RowAction label={`複製 ${template.name}`} icon={Copy} disabled={!workspace.canMutate} onClick={() => workspace.duplicateTemplate(template.id)} />
              <RowAction label={`刪除 ${template.name}`} icon={Trash2} danger disabled={!workspace.canMutate || template.isBuiltIn} onClick={() => onDeleteTemplate(template)} />
            </div>
          </div>
        ))}

        {activeTab === "library" && library.map((component) => (
          <div
            key={component.id}
            className={cn(
              "pcb-library-card pcb-rail-item",
              placementComponentId === component.id && "is-placing",
            )}
            draggable={workspace.canMutate}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "copy";
              event.dataTransfer.setData(PCB_LIBRARY_DRAG_TYPE, component.id);
              onStartPlacement(component.id);
            }}
          >
            <button
              type="button"
              className="pcb-library-card-main"
              disabled={!workspace.canMutate}
              aria-pressed={placementComponentId === component.id}
              onClick={() => onStartPlacement(component.id)}
            >
              <span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: component.color }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-100">{component.name}</p>
                <p className="truncate font-mono text-[10px] text-slate-400">{component.manufacturer || "—"} · {component.partNumber || "無料號"}</p>
                <p className="font-mono text-[10px] text-slate-500">{component.width}×{component.height}×{component.maxHeight} mm</p>
              </div>
            </button>
            <div className="mt-1 flex justify-end">
              <RowAction label={`放置 ${component.name}`} icon={Plus} disabled={!workspace.canMutate} onClick={() => onStartPlacement(component.id)} />
              <RowAction label={`編輯 ${component.name}`} icon={Pencil} disabled={!workspace.canMutate || component.source === "built-in"} onClick={() => onEditComponent(component)} />
              <RowAction label={`複製 ${component.name}`} icon={Copy} disabled={!workspace.canMutate} onClick={() => workspace.duplicateLibraryComponent(component.id)} />
              <RowAction label={`刪除 ${component.name}`} icon={Trash2} danger disabled={!workspace.canMutate || component.source === "built-in"} onClick={() => onDeleteComponent(component)} />
            </div>
          </div>
        ))}

        {activeTab === "bom" && (
          workspace.pendingPlacements.length ? workspace.pendingPlacements.map((item, index) => (
            <div key={`${item.reference}-${item.partNumber}-${index}`} className="pcb-rail-item pcb-bom-row">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-100">{item.reference || "待編號"} · {item.name}</p>
                <p className="truncate font-mono text-[10px] text-slate-400">{item.partNumber || "無料號"}</p>
              </div>
              <RowAction
                label={`放置 ${item.name}`}
                icon={Plus}
                disabled={!workspace.canMutate}
                onClick={() => {
                  const result = workspace.placePendingPlacement(index);
                  toast({
                    title: result.ok ? "BOM 元件已放置" : "無法放置 BOM 元件",
                    description: result.ok === true
                      ? `${result.component.reference} · ${result.component.name}`
                      : result.reason,
                    variant: result.ok ? "default" : "destructive",
                  });
                }}
              />
              <RowAction label={`移除 ${item.name}`} icon={Trash2} danger disabled={!workspace.canMutate} onClick={() => workspace.removePendingPlacement(index)} />
            </div>
          )) : (
            <div className="pcb-empty-state">
              尚無待放置元件。匯入 BOM 後，項目會保留在這裡等待畫布放置。
            </div>
          )
        )}

        {((activeTab === "projects" && projects.length === 0)
          || (activeTab === "templates" && templates.length === 0)
          || (activeTab === "library" && library.length === 0)) && (
          <div className="pcb-empty-state">找不到符合條件的項目。</div>
        )}
      </div>
    </aside>
  );
}
