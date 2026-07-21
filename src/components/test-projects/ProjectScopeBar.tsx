import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  CalendarDays,
  Check,
  CirclePause,
  CirclePlay,
  FolderKanban,
  Layers3,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  UserRound,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { SystemManager } from "@/components/test-tracker/SystemManager";

import {
  type ProjectStatus,
  type TestProject,
  useTestProject,
} from "./TestProjectProvider";

const EMPTY_TEMPLATE_VALUE = "__empty_project_template__";
const NO_OWNER_VALUE = "__no_project_owner__";

const STATUS_META: Record<
  ProjectStatus,
  { label: string; className: string; icon: typeof CirclePlay }
> = {
  planning: {
    label: "規劃中",
    className: "border-sky-300/35 bg-sky-400/12 text-sky-100",
    icon: CalendarDays,
  },
  active: {
    label: "進行中",
    className: "border-emerald-300/35 bg-emerald-400/12 text-emerald-100",
    icon: CirclePlay,
  },
  paused: {
    label: "暫停",
    className: "border-amber-300/35 bg-amber-400/12 text-amber-100",
    icon: CirclePause,
  },
  completed: {
    label: "已完成",
    className: "border-blue-300/35 bg-blue-400/12 text-blue-100",
    icon: Check,
  },
  archived: {
    label: "已封存",
    className: "border-slate-300/25 bg-slate-400/10 text-slate-200",
    icon: Archive,
  },
};

interface ProjectOwner {
  display_name: string | null;
  id: string;
  username: string;
}

interface ProjectFormState {
  cloneFromProjectId: string;
  description: string;
  name: string;
  ownerUserId: string;
  plannedEndDate: string;
  plannedStartDate: string;
  status: ProjectStatus;
}

const EMPTY_FORM: ProjectFormState = {
  cloneFromProjectId: EMPTY_TEMPLATE_VALUE,
  description: "",
  name: "",
  ownerUserId: NO_OWNER_VALUE,
  plannedEndDate: "",
  plannedStartDate: "",
  status: "planning",
};

function getProjectStatus(project: TestProject): ProjectStatus {
  return (project.status || (project.is_archived ? "archived" : "active")) as ProjectStatus;
}

function formatDate(value?: string | null) {
  if (!value) return "未設定";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

export function ProjectScopeBar() {
  const {
    activeProject,
    activeProjectId,
    allProjects,
    archiveProject,
    createProject,
    isLoadingProjects,
    projectSummaries,
    projects,
    refreshProjects,
    restoreProject,
    setActiveProjectId,
    updateProject,
  } = useTestProject();
  const { canEditModule } = usePermissions();
  const canCreateSystems = canEditModule("test-tracker");
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [owners, setOwners] = useState<ProjectOwner[]>([]);
  const [form, setForm] = useState<ProjectFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    supabase
      .from("system_users")
      .select("id, username, display_name")
      .eq("status", "active")
      .order("display_name")
      .then(({ data }) => setOwners((data ?? []) as ProjectOwner[]));
  }, []);

  const activeStatus = activeProject ? getProjectStatus(activeProject) : "planning";
  const activeStatusMeta = STATUS_META[activeStatus];
  const activeSummary = activeProjectId ? projectSummaries[activeProjectId] : undefined;
  const activeOwner = owners.find((owner) => owner.id === activeProject?.owner_user_id);

  const filteredProjects = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return allProjects.filter((project) => {
      const status = getProjectStatus(project);
      if (!showArchived && status === "archived") return false;
      if (showArchived && status !== "archived") return false;
      if (statusFilter !== "all" && status !== statusFilter) return false;
      return (
        !keyword ||
        project.name.toLowerCase().includes(keyword) ||
        project.description?.toLowerCase().includes(keyword)
      );
    });
  }, [allProjects, searchTerm, showArchived, statusFilter]);

  const resetForm = () => {
    setFormError("");
    setEditingProjectId(null);
    setForm({
      ...EMPTY_FORM,
      cloneFromProjectId: activeProjectId ?? EMPTY_TEMPLATE_VALUE,
    });
  };

  const openCreateForm = () => {
    resetForm();
    setIsOpen(true);
    setShowForm(true);
  };

  const openEditForm = (project: TestProject) => {
    setFormError("");
    setEditingProjectId(project.id);
    setForm({
      cloneFromProjectId: EMPTY_TEMPLATE_VALUE,
      description: project.description ?? "",
      name: project.name,
      ownerUserId: project.owner_user_id ?? NO_OWNER_VALUE,
      plannedEndDate: project.planned_end_date ?? "",
      plannedStartDate: project.planned_start_date ?? "",
      status: getProjectStatus(project),
    });
    setIsOpen(true);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (
      form.plannedStartDate &&
      form.plannedEndDate &&
      form.plannedEndDate < form.plannedStartDate
    ) {
      setFormError("預計完成日期不能早於預計開始日期。");
      return;
    }

    setFormError("");
    setIsSaving(true);
    let savedProject: TestProject | null = null;

    if (editingProjectId) {
      savedProject = await updateProject({
        description: form.description,
        name: form.name,
        ownerUserId: form.ownerUserId === NO_OWNER_VALUE ? null : form.ownerUserId,
        plannedEndDate: form.plannedEndDate || null,
        plannedStartDate: form.plannedStartDate || null,
        projectId: editingProjectId,
        status: form.status,
      });
    } else {
      savedProject = await createProject({
        cloneFromProjectId:
          form.cloneFromProjectId === EMPTY_TEMPLATE_VALUE
            ? null
            : form.cloneFromProjectId,
        description: form.description,
        name: form.name,
        ownerUserId: form.ownerUserId === NO_OWNER_VALUE ? null : form.ownerUserId,
        plannedEndDate: form.plannedEndDate || null,
        plannedStartDate: form.plannedStartDate || null,
        status: form.status,
      });
    }

    setIsSaving(false);
    if (!savedProject) return;
    setShowForm(false);
    resetForm();
  };

  return (
    <div
      data-ui="project-command-bar"
      className="maintenance-project-bar sticky top-[72px] z-30 flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2"
    >
      <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-300/25 bg-cyan-300/10 text-cyan-100 sm:flex">
        <FolderKanban className="h-4 w-4" />
      </div>

      <Select
        disabled={isLoadingProjects || projects.length === 0}
        value={activeProjectId ?? ""}
        onValueChange={setActiveProjectId}
      >
        <SelectTrigger className="h-10 min-w-0 flex-1 border-0 bg-transparent px-1 shadow-none sm:max-w-[310px]">
          <div className="min-w-0 text-left">
            <div className="truncate text-sm font-semibold text-[#f3f8fc]">
              {activeProject?.name || "選擇專案"}
            </div>
            <div className="truncate text-xs text-[#a9c0d1]">
              {activeOwner?.display_name || activeOwner?.username || "未設定負責人"}
            </div>
          </div>
        </SelectTrigger>
        <SelectContent>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              <span className="font-medium">{project.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {STATUS_META[getProjectStatus(project)].label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {activeProject && (
        <div
          data-ui="project-metadata"
          className="hidden min-w-0 items-center gap-3 lg:flex"
        >
          <Badge
            variant="outline"
            className={cn("h-8 shrink-0 rounded-lg px-2.5", activeStatusMeta.className)}
          >
            {activeStatusMeta.label}
          </Badge>
          <div className="hidden items-center gap-1 rounded-lg border border-[#294861]/80 bg-[#071827]/70 p-1 xl:flex">
            <span className="rounded-md px-2.5 py-1 text-xs text-[#9fb8ca]">
              機台 <strong className="font-mono text-[#f3f8fc]">{activeSummary?.machine_count ?? 0}</strong>
            </span>
            <span className="rounded-md border-l border-[#294861]/70 px-2.5 py-1 text-xs text-[#9fb8ca]">
              待處理問題 <strong className="font-mono text-amber-100">{activeSummary?.open_issue_count ?? 0}</strong>
            </span>
            <span className="flex items-center gap-1.5 rounded-md border-l border-[#294861]/70 px-2.5 py-1 text-xs text-[#9fb8ca]">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatDate(activeProject.planned_end_date)}
            </span>
          </div>
        </div>
      )}

      <div
        data-ui="project-actions"
        className="ml-auto flex shrink-0 items-center gap-2 rounded-xl border border-[#294861]/80 bg-[#071827]/65 p-1"
      >
        {activeProject && canCreateSystems && (
          <SystemManager
            onSystemUpdate={refreshProjects}
            showDeleteAll={false}
            trigger={
              <Button
                type="button"
                aria-label="新增機台"
                className="h-9 shrink-0 rounded-lg border border-cyan-300/45 bg-cyan-400/18 px-3 text-cyan-50 shadow-none hover:border-cyan-200/65 hover:bg-cyan-400/28 hover:text-white"
              >
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">新增機台</span>
              </Button>
            }
          />
        )}

        {activeProject && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-9 shrink-0 rounded-lg border border-[#315873] bg-[#10263a] px-3 text-[#d8e6f0] hover:border-cyan-300/50 hover:bg-[#15344d] hover:text-white"
                onClick={() => openEditForm(activeProject)}
              >
                <Pencil className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">編輯專案</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>直接編輯目前專案</TooltipContent>
          </Tooltip>
        )}

        <Sheet
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) {
            setShowForm(false);
            resetForm();
          }
        }}
      >
        <SheetTrigger asChild>
          <Button
            className="h-9 shrink-0 rounded-lg border-[#315873] bg-[#10263a] px-3 text-[#d8e6f0] hover:border-cyan-300/50 hover:bg-[#15344d] hover:text-white"
            variant="outline"
          >
            <Layers3 className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">專案中心</span>
          </Button>
        </SheetTrigger>
        <SheetContent className="maintenance-project-sheet w-full overflow-hidden border-[#2a526f] bg-[#071522] p-0 sm:max-w-[720px]">
          <SheetHeader className="border-b border-[#2a526f]/70 px-5 py-4 text-left">
            <div className="flex items-center justify-between gap-4 pr-8">
              <div>
                <SheetTitle className="text-xl text-[#f3f8fc]">專案中心</SheetTitle>
                <SheetDescription className="mt-1 text-[#a9c0d1]">
                  建立、複製與管理各專案生命週期。
                </SheetDescription>
              </div>
              <Button className="h-9 rounded-lg" onClick={openCreateForm}>
                <Plus className="mr-2 h-4 w-4" />
                新增專案
              </Button>
            </div>
          </SheetHeader>

          {showForm ? (
            <div className="h-[calc(100vh-82px)] overflow-y-auto px-5 py-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-[#f3f8fc]">
                    {editingProjectId ? "編輯專案" : "建立新專案"}
                  </h3>
                  <p className="mt-1 text-sm text-[#a9c0d1]">
                    {editingProjectId
                      ? "更新名稱、負責人、日期與目前狀態。"
                      : "可建立空白專案或複製既有專案的發布流程與資產。"}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                  返回清單
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="maintenance-project-name">專案名稱</Label>
                  <Input
                    id="maintenance-project-name"
                    autoFocus
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="例如：GB300 Phase 2"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="maintenance-project-description">專案說明</Label>
                  <Textarea
                    id="maintenance-project-description"
                    rows={3}
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="客戶、版本、批次或交付範圍"
                  />
                </div>
                {!editingProjectId && (
                  <div className="space-y-2 sm:col-span-2">
                    <Label>建立方式</Label>
                    <Select
                      value={form.cloneFromProjectId}
                      onValueChange={(value) => setForm((current) => ({ ...current, cloneFromProjectId: value }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_TEMPLATE_VALUE}>空白專案</SelectItem>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            複製 {project.name} 的發布流程與資產
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>專案狀態</Label>
                  <Select
                    value={form.status}
                    onValueChange={(value) => setForm((current) => ({ ...current, status: value as ProjectStatus }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_META)
                        .filter(([status]) => status !== "archived")
                        .map(([status, meta]) => (
                          <SelectItem key={status} value={status}>{meta.label}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>負責人</Label>
                  <Select
                    value={form.ownerUserId}
                    onValueChange={(value) => setForm((current) => ({ ...current, ownerUserId: value }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_OWNER_VALUE}>未指定</SelectItem>
                      {owners.map((owner) => (
                        <SelectItem key={owner.id} value={owner.id}>
                          {owner.display_name || owner.username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maintenance-project-start">預計開始</Label>
                  <Input
                    id="maintenance-project-start"
                    type="date"
                    value={form.plannedStartDate}
                    max={form.plannedEndDate || undefined}
                    className="cursor-pointer font-data [color-scheme:dark]"
                    onClick={(event) => event.currentTarget.showPicker?.()}
                    onChange={(event) => setForm((current) => ({ ...current, plannedStartDate: event.target.value }))}
                  />
                  <p className="text-xs text-[#8fb0c5]">點擊欄位選擇日期，也可直接輸入。</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maintenance-project-end">預計完成</Label>
                  <Input
                    id="maintenance-project-end"
                    type="date"
                    value={form.plannedEndDate}
                    min={form.plannedStartDate || undefined}
                    className="cursor-pointer font-data [color-scheme:dark]"
                    onClick={(event) => event.currentTarget.showPicker?.()}
                    onChange={(event) => setForm((current) => ({ ...current, plannedEndDate: event.target.value }))}
                  />
                  <p className="text-xs text-[#8fb0c5]">完成日期不得早於開始日期。</p>
                </div>
              </div>

              {formError && (
                <div role="alert" className="mt-4 rounded-xl border border-rose-300/40 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
                  {formError}
                </div>
              )}

              <div className="mt-6 flex justify-end gap-2 border-t border-[#2a526f]/60 pt-4">
                <Button variant="outline" onClick={() => setShowForm(false)}>取消</Button>
                <Button disabled={!form.name.trim() || isSaving} onClick={handleSave}>
                  {isSaving ? "儲存中..." : editingProjectId ? "儲存變更" : "建立專案"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex h-[calc(100vh-82px)] flex-col">
              <div className="space-y-3 border-b border-[#2a526f]/60 px-5 py-4">
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a9c0d1]" />
                    <Input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      className="pl-9"
                      placeholder="搜尋專案"
                    />
                  </div>
                  <Select
                    value={statusFilter}
                    onValueChange={(value) => setStatusFilter(value as ProjectStatus | "all")}
                  >
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部狀態</SelectItem>
                      {Object.entries(STATUS_META)
                        .filter(([status]) => status !== "archived")
                        .map(([status, meta]) => (
                          <SelectItem key={status} value={status}>{meta.label}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={!showArchived ? "secondary" : "ghost"}
                    onClick={() => setShowArchived(false)}
                  >
                    使用中 {projects.length}
                  </Button>
                  <Button
                    size="sm"
                    variant={showArchived ? "secondary" : "ghost"}
                    onClick={() => setShowArchived(true)}
                  >
                    已封存 {allProjects.length - projects.length}
                  </Button>
                </div>
              </div>

              <ScrollArea className="flex-1 px-5 py-4">
                <div className="space-y-2 pr-3">
                  {filteredProjects.map((project) => {
                    const status = getProjectStatus(project);
                    const statusMeta = STATUS_META[status];
                    const summary = projectSummaries[project.id];
                    const owner = owners.find((entry) => entry.id === project.owner_user_id);
                    const isActive = project.id === activeProjectId;

                    return (
                      <div
                        key={project.id}
                        className={cn(
                          "rounded-xl border border-[#2a526f]/70 bg-[#0b1b2d] p-3 transition-colors hover:border-cyan-300/45",
                          isActive && "border-cyan-300/55 bg-[#10263a]"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => {
                              if (status !== "archived") {
                                setActiveProjectId(project.id);
                                setIsOpen(false);
                              }
                            }}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate font-semibold text-[#f3f8fc]">{project.name}</span>
                              <Badge variant="outline" className={cn("h-6 rounded-md px-2 text-[11px]", statusMeta.className)}>
                                {statusMeta.label}
                              </Badge>
                              {isActive && <Badge className="h-6 rounded-md px-2 text-[11px]">目前專案</Badge>}
                            </div>
                            <p className="mt-1 line-clamp-1 text-sm text-[#a9c0d1]">
                              {project.description || "尚未填寫專案說明"}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#a9c0d1]">
                              <span className="flex items-center gap-1"><UserRound className="h-3 w-3" />{owner?.display_name || owner?.username || "未指定"}</span>
                              <span>機台 {summary?.machine_count ?? 0}</span>
                              <span>問題 {summary?.open_issue_count ?? 0}</span>
                            </div>
                          </button>
                          <div className="flex shrink-0 gap-1">
                            {status !== "archived" && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditForm(project)}>
                                <Pencil className="h-3.5 w-3.5" />
                                <span className="sr-only">編輯 {project.name}</span>
                              </Button>
                            )}
                            {status === "archived" ? (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => restoreProject(project.id)}>
                                <RotateCcw className="h-3.5 w-3.5" />
                                <span className="sr-only">還原 {project.name}</span>
                              </Button>
                            ) : (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-[#a9c0d1] hover:text-amber-100">
                                    <Archive className="h-3.5 w-3.5" />
                                    <span className="sr-only">封存 {project.name}</span>
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>封存 {project.name}？</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      機台、流程、進度、問題與工時都會保留，只會從使用中專案清單隱藏。
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>取消</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => archiveProject(project.id)}>確認封存</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {filteredProjects.length === 0 && (
                    <div className="py-16 text-center text-sm text-[#a9c0d1]">
                      沒有符合條件的專案。
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
