import { useMemo, useState, type ChangeEvent } from "react";
import {
  Box,
  ChevronDown,
  ChevronRight,
  CloudDownload,
  Copy,
  CopyPlus,
  Eye,
  Filter,
  GitBranchPlus,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  UserRound,
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
import {
  boardOwnerName,
  boardOwnerOptions,
  buildBoardList,
  fullTimeLabel,
  isBoardFamilyOpen,
  relativeTimeLabel,
  statusChangeLabel,
  type BoardFamily,
  type BoardSort,
} from "./core/boardList.ts";
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
  onRecoverCloudModels: () => void;
  canRecoverCloudModels: boolean;
}

/** Tab order: the boards, then what goes on them, then what new boards start from. */
const tabLabels: Record<PcbLeftTab, string> = {
  projects: "板子",
  library: "元件庫",
  templates: "模板",
};

const tabTitles: Record<PcbLeftTab, string> = {
  projects: "所有板子：依大專案分組，同一塊板的版本收在一起",
  library: "可放到板上的元件：點一下放置，或拖曳到板上",
  templates: "用模板建立新板子；不會覆蓋目前的板子",
};

const projectStatusLabels: Record<PcbProject["status"], string> = {
  draft: "草稿",
  review: "審核中",
  approved: "已核准",
};

function RowAction({
  label,
  title,
  icon: Icon,
  disabled,
  danger,
  onClick,
}: {
  label: string;
  title: string;
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
      title={title}
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
  onRecoverCloudModels,
  canRecoverCloudModels,
}: PcbLeftRailProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | PcbProject["status"]>("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [sort, setSort] = useState<BoardSort>("updated");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [templateSourceFilter, setTemplateSourceFilter] = useState("all");
  /** Families whose version list the user opened or closed explicitly; the choice survives switching boards. */
  const [familyChoices, setFamilyChoices] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const normalized = query.trim().toLocaleLowerCase();
  const activeId = workspace.activeProject.id;
  const activeEditorName = workspace.lastSavedProjectId === activeId
    ? workspace.lastSavedEditor ?? workspace.activeProject.lastEditedBy ?? "尚無紀錄"
    : workspace.activeProject.lastEditedBy ?? "尚無紀錄";

  const boardGroups = useMemo(
    () => buildBoardList(workspace.data.projects, { query, status: statusFilter, owner: ownerFilter, sort }, activeId),
    [activeId, ownerFilter, query, sort, statusFilter, workspace.data.projects],
  );
  const ownerOptions = useMemo(() => boardOwnerOptions(workspace.data.projects), [workspace.data.projects]);
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
  if (activeTab === "projects" && statusFilter !== "all") activeFilters.push([`狀態：${projectStatusLabels[statusFilter]}`, () => setStatusFilter("all")]);
  if (activeTab === "projects" && ownerFilter !== "all") activeFilters.push([`負責人：${ownerFilter}`, () => setOwnerFilter("all")]);
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

  const openBoard = (project: PcbProject) => {
    if (project.id !== activeId) void workspace.openProject(project.id);
  };
  const toggleFamily = (family: BoardFamily) => setFamilyChoices((current) => {
    const next = new Map(current);
    next.set(family.id, !isBoardFamilyOpen(family, activeId, current));
    return next;
  });

  const boardMenu = (project: PcbProject) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="pcb-project-more"
          aria-label={`${project.name} 版本 ${project.revision || "1"} 更多操作`} title="預覽、建立新版、複製或刪除這塊板">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="pcb-project-menu">
        <DropdownMenuItem title="不開啟就先看這塊板的外形與元件" onSelect={() => onPreviewProject(project)}>
          <Eye className="h-3.5 w-3.5" />預覽
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!workspace.canMutate} title="同一塊板的下一版，版本號自動加 1，原版保留"
          onSelect={() => void workspace.duplicateProject(project.id, true)}>
          <GitBranchPlus className="h-3.5 w-3.5" />建立新版
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!workspace.canMutate} title="另開一塊獨立的板子，不算這塊板的版本"
          onSelect={() => void workspace.duplicateProject(project.id)}>
          <CopyPlus className="h-3.5 w-3.5" />複製成新板子
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-rose-300 focus:text-rose-200"
          disabled={!workspace.canMutate || project.id !== activeId}
          title={project.id === activeId ? "刪除這塊板的這個版本；其他使用者也將無法開啟" : "要刪除請先開啟這塊板"}
          onSelect={() => onDeleteProject(project)}
        >
          <Trash2 className="h-3.5 w-3.5" />刪除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const boardMeta = (project: PcbProject, withName: boolean) => {
    const current = project.id === activeId;
    const editor = current ? activeEditorName : project.lastEditedBy ?? "尚無紀錄";
    return (
      <span className="pcb-board-row-meta" title={[`更新：${fullTimeLabel(project.updatedAt)}`, `最後編輯者：${editor}`, statusChangeLabel(project) && `狀態：${statusChangeLabel(project)}`].filter(Boolean).join(" · ")}>
        {withName ? `版本 ${project.revision || "1"} · ` : ""}
        <UserRound className="pcb-board-owner-icon" aria-hidden="true" />{boardOwnerName(project)}
        <span aria-hidden="true"> · </span>{relativeTimeLabel(project.updatedAt)}
      </span>
    );
  };

  const familyRow = (family: BoardFamily) => {
    const lead = family.lead;
    const versionsOpen = isBoardFamilyOpen(family, activeId, familyChoices);
    const otherVersions = family.matching.filter((project) => project.id !== lead.id);
    const filtered = family.matching.length < family.versions.length;
    return (
      <div key={family.id} className="pcb-board-family">
        <div className={cn("pcb-board-row", lead.id === activeId && "is-current")} data-pcb-board-row="">
          <button type="button" className="pcb-board-row-main" aria-current={lead.id === activeId ? "true" : undefined}
            title={lead.id === activeId ? "目前開啟的板子" : `開啟「${lead.name}」版本 ${lead.revision || "1"}；目前的板子有修改時會先儲存`}
            onClick={() => openBoard(lead)}>
            <span className="pcb-board-row-title">
              <strong>{lead.name}</strong>
              <span className={cn("pcb-project-status", `is-${lead.status}`)}>{projectStatusLabels[lead.status]}</span>
            </span>
            {boardMeta(lead, true)}
          </button>
          {family.versions.length > 1 && (
            <button type="button" className="pcb-board-versions-toggle" aria-expanded={versionsOpen}
              aria-label={`${versionsOpen ? "收起" : "展開"}「${lead.name}」的 ${family.versions.length} 個版本${filtered ? `（符合 ${family.matching.length} 個）` : ""}`}
              title={versionsOpen ? "收起這塊板的其他版本" : "展開這塊板的其他版本"} onClick={() => toggleFamily(family)}>
              {filtered ? `${family.matching.length}/${family.versions.length}` : family.versions.length} 版
              {versionsOpen ? <ChevronDown className="h-3 w-3" aria-hidden="true" /> : <ChevronRight className="h-3 w-3" aria-hidden="true" />}
            </button>
          )}
          {boardMenu(lead)}
        </div>
        {versionsOpen && otherVersions.map((project) => (
          <div key={project.id} className={cn("pcb-board-row is-version", project.id === activeId && "is-current")} data-pcb-board-row="">
            <button type="button" className="pcb-board-row-main" aria-current={project.id === activeId ? "true" : undefined}
              title={project.id === activeId ? "目前開啟的板子" : `開啟「${project.name}」版本 ${project.revision || "1"}；目前的板子有修改時會先儲存`}
              onClick={() => openBoard(project)}>
              <span className="pcb-board-row-title">
                <strong>版本 {project.revision || "1"}</strong>
                <span className={cn("pcb-project-status", `is-${project.status}`)}>{projectStatusLabels[project.status]}</span>
              </span>
              {boardMeta(project, false)}
            </button>
            {boardMenu(project)}
          </div>
        ))}
      </div>
    );
  };

  const emptyText = activeTab === "projects" ? "目前篩選條件沒有符合的板子"
    : activeTab === "templates" ? "目前篩選條件沒有符合的模板" : "目前篩選條件沒有符合的元件";
  const isEmpty = (activeTab === "projects" && boardGroups.length === 0)
    || (activeTab === "templates" && templates.length === 0)
    || (activeTab === "library" && library.length === 0);

  return (
    <aside
      className="pcb-left-rail"
      data-testid="pcb-left-rail"
      aria-label="PCB 板子與資源"
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
            role="tab"
            aria-selected={activeTab === tab}
            title={tabTitles[tab]}
            onClick={() => {
              onActiveTabChange(tab);
              setQuery("");
            }}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      {activeTab !== "projects" && (
        <div className={cn("pcb-rail-actions", activeTab === "library" && "pcb-library-actions")}>
          {activeTab === "templates" && (
            <Button type="button" size="sm" className="pcb-primary-action" disabled={!workspace.canMutate} onClick={onSaveTemplate}
              title="把目前這塊板存成模板，之後可用它建立新板子">
              <Plus className="mr-1.5 h-3.5 w-3.5" />另存為模板
            </Button>
          )}
          {activeTab === "library" && (
            <>
              <Button type="button" size="sm" className="pcb-primary-action" disabled={!workspace.canMutate} onClick={() => onEditComponent()}
                title="手動輸入尺寸建立一個自訂元件">
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
              <Button type="button" variant="outline" size="sm" className="pcb-upload-action"
                disabled={!workspace.canMutate || !canRecoverCloudModels}
                title="列出元件庫與所有板子都未使用的雲端 STEP，勾選後才重新加入並同步"
                onClick={onRecoverCloudModels}>
                <CloudDownload className="mr-1 h-3.5 w-3.5" />找回雲端 STEP
              </Button>
            </>
          )}
        </div>
      )}

      {activeTab !== "projects" && (
        <div className={cn("pcb-rail-context", activeTab === "templates" && "is-template-context")}>
          <div className="pcb-rail-context-heading">
            <strong>{tabLabels[activeTab]}</strong>
            <span>{activeTab === "templates" ? `${templates.length} 個可用模板` : `${library.length} 個元件`}</span>
          </div>
          <p>
            {activeTab === "templates"
              ? "內建模板可直接建立板子；若要改名或刪除，請先複製後編輯。"
              : "點一下放置，或拖曳到板上。匯入 STEP／STP 會自動建立含 3D 外形與實體尺寸的元件。"}
          </p>
        </div>
      )}

      {activeTab === "projects" && (
        <div className="pcb-project-list-heading">
          <div>
            <strong>板子</strong>
            <span>{workspace.data.projects.length} 塊</span>
          </div>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as BoardSort)}
            aria-label="排序板子"
            title="排序：最近更新的板子在前，或依名稱排列"
            className="pcb-control pcb-board-sort"
          >
            <option value="updated">最近更新</option>
            <option value="name">名稱</option>
          </select>
          <Button type="button" variant="ghost" size="sm" disabled={!workspace.canMutate} onClick={onNewProject}
            title="建立一塊新的空白板子；目前的板子有修改時會先儲存">
            <Plus className="h-3.5 w-3.5" />新增板子
          </Button>
        </div>
      )}

      <div className={cn("pcb-rail-filter", activeTab === "projects" && "is-project-filter")}>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={activeTab === "projects" ? "搜尋板子、大專案、負責人" : `搜尋${tabLabels[activeTab]}`}
            aria-label={`搜尋${tabLabels[activeTab]}`}
            title={activeTab === "projects" ? "依名稱、大專案、版本、描述、負責人或最後編輯者找板子" : undefined}
            className="pcb-control pcb-search-input"
          />
        </label>
        {activeTab === "projects" && (
          <div className="pcb-board-filters">
            <label className="relative block min-w-0">
              <Filter className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                aria-label="篩選板子狀態"
                title="只看某個狀態的板子"
                className="pcb-control pcb-status-filter w-full"
              >
                <option value="all">全部狀態</option>
                <option value="draft">草稿</option>
                <option value="review">審核中</option>
                <option value="approved">已核准</option>
              </select>
            </label>
            <label className="relative block min-w-0">
              <UserRound className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <select
                value={ownerFilter}
                onChange={(event) => setOwnerFilter(event.target.value)}
                aria-label="篩選負責人"
                title="只看某位負責人的板子"
                className="pcb-control pcb-status-filter w-full"
              >
                <option value="all">全部負責人</option>
                {ownerOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          </div>
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

      {activeFilters.length > 0 && <div className="pcb-rail-chips" aria-label="作用中篩選">
        {activeFilters.map(([label, clear]) => <Button key={label} type="button" variant="outline" size="sm" className="h-auto min-h-8 max-w-full whitespace-normal px-2 text-[11px]" aria-label={`清除${label}`} title={`清除「${label}」這個條件`} onClick={clear}>{label} ×</Button>)}
        <Button type="button" variant="ghost" size="sm" title="清除這個分頁的全部篩選條件" onClick={() => activeFilters.forEach(([, clear]) => clear())}>全部清除</Button>
      </div>}

      {activeTab === "projects" && (
        // The list's column header stays on screen, also when the filters leave no board (filter-list contract §5).
        <div className="pcb-board-list-columns" aria-hidden="true">
          <span>板子／版本</span>
          <span>狀態 · 負責人 · 更新</span>
        </div>
      )}
      <div className="pcb-rail-list">
        {activeTab === "projects" && boardGroups.map((group) => (
          <section key={group.name} className="pcb-board-group" aria-label={`大專案 ${group.name}`}>
            <h3 className="pcb-board-group-heading">{group.name}<span>{group.families.length}</span></h3>
            {group.families.map(familyRow)}
          </section>
        ))}

        {activeTab === "templates" && templates.map((template) => (
          <div key={template.id} className="pcb-rail-item pcb-template-card">
            <div className="pcb-template-card-header">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-100">{template.name}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">{template.category} · {template.isBuiltIn ? "內建" : "自訂"}</p>
              </div>
              <Button type="button" variant="outline" size="sm" className="pcb-template-create-button" disabled={!workspace.canMutate}
                title="用這個模板建立一塊新板子；目前的板子有修改時會先儲存" onClick={() => onApplyTemplate(template.id)}>
                建立板子
              </Button>
            </div>
            <p className="pcb-template-description">{template.description}</p>
            <div className="pcb-template-meta">
              <span>{template.project.board.width}×{template.project.board.height} mm</span>
              <span>{template.project.components.length} 個元件</span>
            </div>
            <div className="mt-1 flex justify-end gap-1">
              {template.isBuiltIn ? (
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px] text-cyan-200" disabled={!workspace.canMutate}
                  title="內建模板不能直接修改；複製一份到「我的模板」再編輯" onClick={() => onDuplicateTemplate(template)}>
                  <Copy className="mr-1 h-3.5 w-3.5" />複製後編輯
                </Button>
              ) : (
                <>
                  <RowAction label={`重新命名 ${template.name}`} title="修改這個模板的名稱" icon={Pencil} disabled={!workspace.canMutate} onClick={() => onRenameTemplate(template)} />
                  <RowAction label={`複製 ${template.name}`} title="複製一份這個模板" icon={Copy} disabled={!workspace.canMutate} onClick={() => onDuplicateTemplate(template)} />
                  <RowAction label={`刪除 ${template.name}`} title="刪除這個自訂模板（會先確認）" icon={Trash2} danger disabled={!workspace.canMutate} onClick={() => onDeleteTemplate(template)} />
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
            draggable={workspace.canEditBoard}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "copy";
              event.dataTransfer.setData(PCB_LIBRARY_DRAG_TYPE, component.id);
              onStartPlacement(component.id);
            }}
          >
            <button
              type="button"
              className="pcb-library-card-main"
              disabled={!workspace.canEditBoard}
              aria-pressed={placementComponentId === component.id}
              title={workspace.boardApproved ? "這塊板已核准，不能放置元件；先建立新版或改回草稿" : `點一下後到板上放置「${component.name}」，按 Esc 取消`}
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
                <p className="truncate font-mono text-[10px] text-slate-400" title={`${component.manufacturer || "—"} · ${component.partNumber || "無料號"} · 長 ${component.width} × 寬 ${component.height} × 高 ${component.maxHeight} mm`}>
                  {component.manufacturer || "—"} · {component.partNumber || "無料號"} · {component.width}×{component.height}×{component.maxHeight} mm
                </p>
              </div>
            </button>
            <div className="pcb-library-card-actions">
              {component.source !== "built-in" && (
                <RowAction label={`編輯 ${component.name}`} title="修改這個元件的名稱、料號與尺寸" icon={Pencil} disabled={!workspace.canMutate} onClick={() => onEditComponent(component)} />
              )}
              <RowAction label={`複製 ${component.name}`} title="複製一份成自訂元件，可再修改" icon={Copy} disabled={!workspace.canMutate} onClick={() => workspace.duplicateLibraryComponent(component.id)} />
              {component.source !== "built-in" && (
                <RowAction label={`刪除 ${component.name}`} title="從元件庫刪除（會先確認；已放到板上的不受影響）" icon={Trash2} danger disabled={!workspace.canMutate} onClick={() => onDeleteComponent(component)} />
              )}
            </div>
          </div>
        ))}

        {isEmpty && <div className={cn("pcb-empty-state", activeTab === "projects" && "pcb-board-row is-empty")} role="status">{emptyText}</div>}
      </div>
    </aside>
  );
}
