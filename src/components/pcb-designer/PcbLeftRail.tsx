import { useMemo, useState, type ChangeEvent } from "react";
import {
  Copy,
  FileUp,
  FolderOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
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

type LeftTab = "projects" | "templates" | "library" | "bom";

interface PcbLeftRailProps {
  workspace: PcbWorkspaceApi;
  onNewProject: () => void;
  onEditProject: (project: PcbProject) => void;
  onSaveTemplate: () => void;
  onRenameTemplate: (template: PcbTemplate) => void;
  onEditComponent: (component?: PcbLibraryComponent) => void;
  onDeleteProject: (project: PcbProject) => void;
  onDeleteTemplate: (template: PcbTemplate) => void;
  onDeleteComponent: (component: PcbLibraryComponent) => void;
  onLibraryFile: (file: File) => void;
  onBomFile: (file: File) => void;
}

const tabLabels: Record<LeftTab, string> = {
  projects: "專案",
  templates: "模板",
  library: "元件庫",
  bom: "BOM",
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
        "h-7 w-7 rounded-md text-slate-400 hover:bg-[#17344b] hover:text-white",
        danger && "hover:bg-rose-400/10 hover:text-rose-200",
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
  onNewProject,
  onEditProject,
  onSaveTemplate,
  onRenameTemplate,
  onEditComponent,
  onDeleteProject,
  onDeleteTemplate,
  onDeleteComponent,
  onLibraryFile,
  onBomFile,
}: PcbLeftRailProps) {
  const [activeTab, setActiveTab] = useState<LeftTab>("projects");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const normalized = query.trim().toLocaleLowerCase();

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
      `${item.name} ${item.category} ${item.description}`.toLocaleLowerCase().includes(normalized)),
    [normalized, workspace.data.templates],
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

  const placeLibraryComponent = (component: PcbLibraryComponent) => {
    const result = workspace.placeLibraryComponent(component.id);
    if (result.ok === true) {
      workspace.selectObject({ kind: "component", id: result.component.instanceId });
      toast({ title: "元件已放置", description: `${result.component.reference} · ${result.component.name}` });
    } else {
      toast({ title: "無法放置元件", description: result.reason, variant: "destructive" });
    }
  };

  return (
    <aside
      className="pcb-left-rail flex min-h-0 flex-col border-r border-[#2a526f] bg-[#0b1b2d]"
      data-testid="pcb-left-rail"
      aria-label="PCB 專案與資源"
    >
      <div className="grid grid-cols-4 border-b border-[#2a526f]" role="tablist" aria-label="PCB 資源分頁">
        {(Object.keys(tabLabels) as LeftTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={cn(
              "h-9 border-b-2 border-transparent px-1 text-[11px] text-slate-400 hover:bg-[#10263a] hover:text-slate-100",
              activeTab === tab && "border-[#39c6e8] bg-[#10263a] text-[#a8edf6]",
            )}
            aria-pressed={activeTab === tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => {
              setActiveTab(tab);
              setQuery("");
            }}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      <div className="border-b border-[#2a526f] p-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`搜尋${tabLabels[activeTab]}`}
            aria-label={`搜尋${tabLabels[activeTab]}`}
            className="h-8 border-[#356985] bg-[#10263a] pl-8 text-xs placeholder:text-slate-400"
          />
        </label>
        {activeTab === "projects" && (
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="篩選專案狀態"
            className="mt-2 h-8 w-full rounded-md border border-[#356985] bg-[#10263a] px-2 text-xs text-slate-200"
          >
            <option value="all">全部狀態</option>
            <option value="draft">草稿</option>
            <option value="review">審核中</option>
            <option value="approved">已核准</option>
          </select>
        )}
        {activeTab === "library" && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              aria-label="篩選元件類型"
              className="h-8 min-w-0 rounded-md border border-[#356985] bg-[#10263a] px-2 text-xs text-slate-200"
            >
              <option value="all">全部類型</option>
              {componentTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
              aria-label="篩選元件來源"
              className="h-8 min-w-0 rounded-md border border-[#356985] bg-[#10263a] px-2 text-xs text-slate-200"
            >
              <option value="all">全部來源</option>
              <option value="built-in">內建</option>
              <option value="custom">自訂</option>
              <option value="bom">BOM</option>
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 border-b border-[#2a526f] p-2">
        {activeTab === "projects" && (
          <Button type="button" size="sm" className="h-8 flex-1 rounded-lg text-xs" disabled={!workspace.canMutate} onClick={onNewProject}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />新增專案
          </Button>
        )}
        {activeTab === "templates" && (
          <Button type="button" size="sm" className="h-8 flex-1 rounded-lg text-xs" disabled={!workspace.canMutate} onClick={onSaveTemplate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />儲存目前專案
          </Button>
        )}
        {activeTab === "library" && (
          <>
            <Button type="button" size="sm" className="h-8 flex-1 rounded-lg text-xs" disabled={!workspace.canMutate} onClick={() => onEditComponent()}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />新增元件
            </Button>
            <label
              className={cn(
                "inline-flex h-8 cursor-pointer items-center rounded-lg border border-[#356985] bg-[#10263a] px-2 text-xs text-slate-200",
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
                "inline-flex h-8 flex-1 cursor-pointer items-center justify-center rounded-lg border border-[#356985] bg-[#10263a] px-2 text-xs text-slate-200",
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
              className="h-8 rounded-lg border-[#356985] px-2 text-xs"
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === "projects" && projects.map((project) => (
          <div key={project.id} className={cn("border-b border-[#23445d] px-2 py-2", project.id === workspace.activeProject.id && "bg-[#102d43]")}>
            <button type="button" className="w-full text-left" onClick={() => workspace.openProject(project.id)}>
              <span className="block truncate text-xs font-semibold text-slate-100">{project.name}</span>
              <span className="mt-0.5 block font-mono text-[10px] text-slate-400">{project.status} · {project.board.width}×{project.board.height} mm</span>
            </button>
            <div className="mt-1 flex justify-end">
              <RowAction label={`開啟 ${project.name}`} icon={FolderOpen} onClick={() => workspace.openProject(project.id)} />
              <RowAction label={`編輯 ${project.name}`} icon={Pencil} disabled={!workspace.canMutate} onClick={() => onEditProject(project)} />
              <RowAction label={`複製 ${project.name}`} icon={Copy} disabled={!workspace.canMutate} onClick={() => workspace.duplicateProject(project.id)} />
              <RowAction label={`刪除 ${project.name}`} icon={Trash2} danger disabled={!workspace.canMutate} onClick={() => onDeleteProject(project)} />
            </div>
          </div>
        ))}

        {activeTab === "templates" && templates.map((template) => (
          <div key={template.id} className="border-b border-[#23445d] px-2 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-100">{template.name}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">{template.category} · {template.isBuiltIn ? "內建" : "自訂"}</p>
              </div>
              <Button type="button" variant="outline" size="sm" className="h-7 rounded-md border-[#356985] px-2 text-[10px]" disabled={!workspace.canMutate} onClick={() => workspace.applyTemplate(template.id)}>
                套用
              </Button>
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
            className="pcb-library-card border-b border-[#23445d] px-2 py-2"
            draggable={workspace.canMutate}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "copy";
              event.dataTransfer.setData(PCB_LIBRARY_DRAG_TYPE, component.id);
            }}
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: component.color }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-100">{component.name}</p>
                <p className="truncate font-mono text-[10px] text-slate-400">{component.manufacturer || "—"} · {component.partNumber || "無料號"}</p>
                <p className="font-mono text-[10px] text-slate-500">{component.width}×{component.height}×{component.maxHeight} mm</p>
              </div>
            </div>
            <div className="mt-1 flex justify-end">
              <RowAction label={`放置 ${component.name}`} icon={Plus} disabled={!workspace.canMutate} onClick={() => placeLibraryComponent(component)} />
              <RowAction label={`編輯 ${component.name}`} icon={Pencil} disabled={!workspace.canMutate || component.source === "built-in"} onClick={() => onEditComponent(component)} />
              <RowAction label={`複製 ${component.name}`} icon={Copy} disabled={!workspace.canMutate} onClick={() => workspace.duplicateLibraryComponent(component.id)} />
              <RowAction label={`刪除 ${component.name}`} icon={Trash2} danger disabled={!workspace.canMutate || component.source === "built-in"} onClick={() => onDeleteComponent(component)} />
            </div>
          </div>
        ))}

        {activeTab === "bom" && (
          workspace.pendingPlacements.length ? workspace.pendingPlacements.map((item, index) => (
            <div key={`${item.reference}-${item.partNumber}-${index}`} className="flex items-center gap-2 border-b border-[#23445d] px-2 py-2">
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
            <div className="px-4 py-8 text-center text-xs leading-5 text-slate-400">
              尚無待放置元件。匯入 BOM 後，項目會保留在這裡等待畫布放置。
            </div>
          )
        )}

        {((activeTab === "projects" && projects.length === 0)
          || (activeTab === "templates" && templates.length === 0)
          || (activeTab === "library" && library.length === 0)) && (
          <div className="px-4 py-8 text-center text-xs text-slate-400">找不到符合條件的項目。</div>
        )}
      </div>
    </aside>
  );
}
