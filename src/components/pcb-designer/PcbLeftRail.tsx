import { useMemo, useState, type ChangeEvent } from "react";
import {
  CheckCircle2,
  Copy,
  Eye,
  Filter,
  MoreHorizontal,
  Box,
  LoaderCircle,
  Pencil,
  PencilLine,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PCB_LIBRARY_DRAG_TYPE } from "./PcbCanvas.tsx";
import { LIBRARY_FILE_ACCEPT } from "./core/files.ts";
import { PCB_MODEL_FILE_ACCEPT } from "./core/modelAssets.ts";
import type {
  PcbLibraryComponent,
  PcbProject,
  PcbTemplate,
  PcbWorkspaceApi,
} from "./hooks/usePcbWorkspace.ts";

export type PcbLeftTab = "projects" | "templates" | "library";

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
  onDuplicateTemplate: (template: PcbTemplate) => void;
  onRenameTemplate: (template: PcbTemplate) => void;
  onEditComponent: (component?: PcbLibraryComponent) => void;
  onDeleteProject: (project: PcbProject) => void;
  onDeleteTemplate: (template: PcbTemplate) => void;
  onDeleteComponent: (component: PcbLibraryComponent) => void;
  libraryImportState: "idle" | "loading";
  onLibraryFile: (file: File) => void;
}

const tabLabels: Record<PcbLeftTab, string> = {
  projects: "專案",
  templates: "模板中心",
  library: "元件庫",
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
  onDuplicateTemplate,
  onRenameTemplate,
  onEditComponent,
  onDeleteProject,
  onDeleteTemplate,
  onDeleteComponent,
  libraryImportState,
  onLibraryFile,
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
        && `${item.name} ${item.description} ${item.projectGroup ?? ""} ${item.revision ?? "1"}`.toLocaleLowerCase().includes(normalized))
      .sort((first, second) => (first.projectGroup || "未分類大專案").localeCompare(second.projectGroup || "未分類大專案", "zh-Hant") || second.updatedAt.localeCompare(first.updatedAt)),
    [normalized, statusFilter, workspace.data.projects],
  );
  const otherProjects = useMemo(
    () => projects.filter((project) => project.id !== workspace.activeProject.id),
    [projects, workspace.activeProject.id],
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

  const activeFilters: [string, () => void][] = [];
  if (normalized) activeFilters.push([`搜尋：${query.trim()}`, () => setQuery("")]);
  if (activeTab === "projects" && statusFilter !== "all") activeFilters.push([`狀態：${projectStatusLabels[statusFilter as PcbProject["status"]]}`, () => setStatusFilter("all")]);
  if (activeTab === "library" && typeFilter !== "all") activeFilters.push([`類型：${typeFilter}`, () => setTypeFilter("all")]);
  if (activeTab === "library" && sourceFilter !== "all") activeFilters.push([`來源：${sourceFilter === "built-in" ? "內建" : sourceFilter === "custom" ? "自訂" : "BOM"}`, () => setSourceFilter("all")]);
  if (activeTab === "templates" && templateSourceFilter !== "all") activeFilters.push([`模板：${templateSourceFilter === "built-in" ? "內建模板" : "我的模板"}`, () => setTemplateSourceFilter("all")]);

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

      <div className="pcb-rail-actions">
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
                (!workspace.canMutate || libraryImportState === "loading") && "pointer-events-none opacity-50",
              )}
              title="匯入 STP、STEP、JSON、CSV 或 XLSX 元件庫"
            >
              {libraryImportState === "loading"
                ? <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" />
                : <Upload className="mr-1 h-3.5 w-3.5" />}
              {libraryImportState === "loading" ? "解析 STEP" : "匯入檔案"}
              <input
                type="file"
                accept={`${PCB_MODEL_FILE_ACCEPT},${LIBRARY_FILE_ACCEPT}`}
                className="sr-only"
                disabled={!workspace.canMutate || libraryImportState === "loading"}
                onChange={(event) => chooseFile(event, onLibraryFile)}
              />
            </label>
          </>
        )}
      </div>

      {activeTab !== "projects" && (
        <div className={cn("pcb-rail-context", activeTab === "templates" && "is-template-context")}>
          <div className="pcb-rail-context-heading">
            <strong>{activeTab === "templates" ? "模板中心" : tabLabels[activeTab]}</strong>
            <span>{activeTab === "templates" ? `${templates.length} 個可用模板` : "工作區資源"}</span>
          </div>
          <p>
            {activeTab === "templates"
              ? "內建模板可直接建立專案；若要改名或刪除，請先複製後編輯。"
              : activeTab === "library"
                ? "匯入 STEP／STP 會自動建立含 3D 外形與實體尺寸的元件，可直接拖放到板子。"
                : "管理目前工作區可使用的資源。"}
          </p>
        </div>
      )}

      {activeTab === "projects" && (
        <>
          <section className="pcb-current-project-card" aria-label="目前板子">
            <div className="pcb-current-project-eyebrow">
              <span>目前板子</span>
              <span className={cn("pcb-project-editor-state", workspace.hasUnsavedChanges && "is-editing")}>
                {workspace.hasUnsavedChanges ? <PencilLine className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                {editorState}
              </span>
            </div>
            <h3 title={workspace.activeProject.name}>{workspace.activeProject.name}</h3>
            <p className="text-xs text-cyan-200">{workspace.activeProject.projectGroup || "未分類大專案"} · 版本 {workspace.activeProject.revision || "1"}</p>
            <p>
              {workspace.activeProject.board.width}×{workspace.activeProject.board.height} mm
              <span aria-hidden="true"> · </span>
              最後編輯者：{activeEditorName}
            </p>
            <div className="pcb-current-project-actions">
              <Button type="button" variant="outline" size="sm" onClick={() => onPreviewProject(workspace.activeProject)}>
                <Eye className="h-3.5 w-3.5" />預覽
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={!workspace.canMutate} onClick={() => onEditProject(workspace.activeProject)}>
                <Pencil className="h-3.5 w-3.5" />設定
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="目前板子更多操作" title="更多操作">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="pcb-project-menu">
                  <DropdownMenuItem disabled={!workspace.canMutate} onSelect={() => workspace.duplicateProject(workspace.activeProject.id, true)}>建立新版（保留原版）</DropdownMenuItem>
                  <DropdownMenuItem disabled={!workspace.canMutate} onSelect={() => workspace.duplicateProject(workspace.activeProject.id)}>
                    <Copy className="h-3.5 w-3.5" />複製板子
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-rose-300 focus:text-rose-200" disabled={!workspace.canMutate} onSelect={() => onDeleteProject(workspace.activeProject)}>
                    <Trash2 className="h-3.5 w-3.5" />刪除板子
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </section>
          <div className="pcb-project-list-heading">
            <div>
              <strong>其他板子</strong>
              <span>{otherProjects.length} 塊</span>
            </div>
            <Button type="button" variant="ghost" size="sm" disabled={!workspace.canMutate} onClick={onNewProject}>
              <Plus className="h-3.5 w-3.5" />新增
            </Button>
          </div>
        </>
      )}

      <div className={cn("pcb-rail-filter", activeTab === "projects" && "is-project-filter")}>
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
          <label className="relative block">
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

      {activeFilters.length > 0 && <div className="flex flex-wrap items-center gap-1 px-2 py-2" aria-label="作用中篩選">
        {activeFilters.map(([label, clear]) => <Button key={label} type="button" variant="outline" size="sm" className="h-auto min-h-8 max-w-full whitespace-normal px-2 text-[10px]" aria-label={`清除${label}`} onClick={clear}>{label} ×</Button>)}
        <Button type="button" variant="ghost" size="sm" onClick={() => activeFilters.forEach(([, clear]) => clear())}>全部清除</Button>
      </div>}

      <div className="pcb-rail-list">
        {activeTab === "projects" && otherProjects.map((project, index) => (
          <div key={project.id} className="contents">
          {(index === 0 || (otherProjects[index - 1].projectGroup || "") !== (project.projectGroup || "")) && <h3 className="mt-2 border-b border-cyan-800 pb-2 text-xs font-semibold text-cyan-200">{project.projectGroup || "未分類大專案"}</h3>}
          <div key={project.id} className="pcb-project-compact-item">
            <button type="button" className="pcb-project-compact-main" onClick={() => workspace.openProject(project.id)}>
              <span className="pcb-project-compact-heading">
                <strong title={project.name}>{project.name}</strong>
                <span className={cn("pcb-project-status", `is-${project.status}`)}>{projectStatusLabels[project.status]}</span>
              </span>
              <span className="pcb-project-compact-meta">
                版本 {project.revision || "1"} ·
                {project.board.width}×{project.board.height} mm · {project.lastEditedBy ?? "尚無編輯紀錄"}
              </span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="pcb-project-more" aria-label={`${project.name} 更多操作`} title="更多操作">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="pcb-project-menu">
                <DropdownMenuItem onSelect={() => onPreviewProject(project)}>
                  <Eye className="h-3.5 w-3.5" />預覽
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!workspace.canMutate} onSelect={() => workspace.duplicateProject(project.id, true)}>建立新版（保留原版）</DropdownMenuItem>
                <DropdownMenuItem disabled={!workspace.canMutate} onSelect={() => workspace.duplicateProject(project.id)}>
                  <Copy className="h-3.5 w-3.5" />複製板子
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
            <div className="mt-1 flex justify-end gap-1">
              {template.isBuiltIn ? (
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px] text-cyan-200" disabled={!workspace.canMutate} onClick={() => onDuplicateTemplate(template)}>
                  <Copy className="mr-1 h-3.5 w-3.5" />複製後編輯
                </Button>
              ) : (
                <>
                  <RowAction label={`重新命名 ${template.name}`} icon={Pencil} disabled={!workspace.canMutate} onClick={() => onRenameTemplate(template)} />
                  <RowAction label={`複製 ${template.name}`} icon={Copy} disabled={!workspace.canMutate} onClick={() => onDuplicateTemplate(template)} />
                  <RowAction label={`刪除 ${template.name}`} icon={Trash2} danger disabled={!workspace.canMutate} onClick={() => onDeleteTemplate(template)} />
                </>
              )}
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
                <p className="flex items-center gap-1 truncate text-xs font-semibold text-slate-100">
                  <span className="truncate">{component.name}</span>
                  {component.modelAssetId && (
                    <span className="pcb-library-model-badge" title="包含可重複放置的 STEP 3D 模型">
                      <Box className="h-2.5 w-2.5" />3D
                    </span>
                  )}
                </p>
                <p className="truncate font-mono text-[10px] text-slate-400">{component.manufacturer || "—"} · {component.partNumber || "無料號"}</p>
                <p className="font-mono text-[10px] text-slate-500">長 {component.width} × 寬 {component.height} × 高 {component.maxHeight} mm</p>
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


        {((activeTab === "projects" && otherProjects.length === 0)
          || (activeTab === "templates" && templates.length === 0)
          || (activeTab === "library" && library.length === 0)) && (
          <div className="pcb-empty-state">找不到符合條件的項目。</div>
        )}
      </div>
    </aside>
  );
}
