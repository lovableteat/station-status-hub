import { useMemo, useState } from "react";
import {
  CheckCircle2,
  CopyPlus,
  FolderKanban,
  Layers3,
  Plus,
  RefreshCcw,
  Trash2,
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
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

import { type TestProject, useTestProject } from "./TestProjectProvider";

const EMPTY_TEMPLATE_VALUE = "__empty_project_template__";

function formatProjectDate(project: TestProject) {
  const date = new Date(project.created_at);

  if (Number.isNaN(date.getTime())) {
    return "建立時間未知";
  }

  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function ProjectScopeBar() {
  const { toast } = useToast();
  const {
    activeProject,
    activeProjectId,
    createProject,
    deleteProject,
    isLoadingProjects,
    projects,
    refreshProjects,
    setActiveProjectId,
  } = useTestProject();
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectPendingDeleteId, setProjectPendingDeleteId] = useState<string | null>(
    null
  );
  const [cloneSourceProjectId, setCloneSourceProjectId] = useState(
    activeProjectId ?? EMPTY_TEMPLATE_VALUE
  );

  const cloneSourceProject = useMemo(
    () =>
      cloneSourceProjectId === EMPTY_TEMPLATE_VALUE
        ? null
        : projects.find((project) => project.id === cloneSourceProjectId) ?? null,
    [cloneSourceProjectId, projects]
  );

  const projectPendingDelete = useMemo(
    () =>
      projectPendingDeleteId
        ? projects.find((project) => project.id === projectPendingDeleteId) ?? null
        : null,
    [projectPendingDeleteId, projects]
  );

  const resetCreateForm = (preferredSourceProjectId?: string | null) => {
    setProjectName("");
    setProjectDescription("");
    setCloneSourceProjectId(preferredSourceProjectId ?? EMPTY_TEMPLATE_VALUE);
  };

  const handleManagerOpenChange = (open: boolean) => {
    setIsManagerOpen(open);

    if (open) {
      resetCreateForm(activeProjectId);
    }
  };

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      toast({
        title: "需要專案名稱",
        description: "請先輸入專案名稱，再建立新專案。",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);

    const project = await createProject({
      cloneFromProjectId:
        cloneSourceProjectId === EMPTY_TEMPLATE_VALUE
          ? null
          : cloneSourceProjectId,
      description: projectDescription,
      name: projectName,
    });

    setIsCreating(false);

    if (!project) {
      return;
    }

    resetCreateForm(project.id);

    toast({
      title: "專案已建立",
      description: `${project.name} 已建立完成，現有資料沒有被覆蓋。`,
    });
  };

  const handleRefreshProjects = async () => {
    setIsRefreshing(true);
    await refreshProjects();
    setIsRefreshing(false);
  };

  const handleActivateProject = (projectId: string) => {
    setActiveProjectId(projectId);
    setIsManagerOpen(false);

    const selectedProject =
      projects.find((project) => project.id === projectId) ?? null;

    toast({
      title: "已切換專案",
      description: selectedProject
        ? `目前已切換到 ${selectedProject.name}。`
        : "專案切換完成。",
    });
  };

  const handleDeleteProject = async () => {
    if (!projectPendingDelete) {
      return;
    }

    setIsDeletingProject(true);
    const deleted = await deleteProject(projectPendingDelete.id);
    setIsDeletingProject(false);

    if (!deleted) {
      return;
    }

    setProjectPendingDeleteId(null);
  };

  return (
    <div className="rounded-[28px] border border-primary/18 bg-[linear-gradient(135deg,hsl(223_36%_15%/0.96),hsl(223_28%_12%/0.94))] px-4 py-4 shadow-[0_24px_60px_-48px_hsl(var(--primary)/0.55)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className="rounded-full border border-primary/18 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary"
            >
              Multi Project
            </Badge>
            <Badge
              variant="secondary"
              className="rounded-full border border-white/10 bg-background/25 px-3 py-1 text-xs text-foreground"
            >
              共 {projects.length} 個專案
            </Badge>
            {activeProject && (
              <Badge
                variant="secondary"
                className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100"
              >
                目前：{activeProject.name}
              </Badge>
            )}
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground">
              機台維修紀錄已改成多專案獨立管理
            </h2>
            <p className="text-sm text-muted-foreground">
              你可以建立很多個專案。切換專案時，機台、站點、測項、流程內容、問題與進度都會一起切換，而且彼此隔離。
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            disabled={isLoadingProjects || projects.length === 0}
            value={activeProjectId ?? ""}
            onValueChange={setActiveProjectId}
          >
            <SelectTrigger className="min-w-[260px] rounded-2xl border-primary/18 bg-background/35">
              <SelectValue
                placeholder={
                  isLoadingProjects ? "載入專案中..." : "選擇要查看的專案"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={isManagerOpen} onOpenChange={handleManagerOpenChange}>
            <DialogTrigger asChild>
              <Button className="rounded-2xl px-5">
                <Layers3 className="mr-2 h-4 w-4" />
                專案中心
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0">
              <div className="border-b border-border/60 px-6 py-5">
                <DialogHeader className="space-y-2">
                  <DialogTitle>專案中心</DialogTitle>
                  <DialogDescription>
                    這裡不是只支援兩個專案。你可以持續新增、切換、複製流程範本，讓每個專案的資料各自獨立。
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="grid gap-0 lg:grid-cols-[0.95fr_1.35fr]">
                <div className="border-b border-border/60 bg-secondary/18 p-6 lg:border-b-0 lg:border-r">
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">
                        建立新專案
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        可建立空白專案，也可從任何既有專案複製站點、測項與站點內容。
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="project-name">專案名稱</Label>
                      <Input
                        id="project-name"
                        value={projectName}
                        onChange={(event) => setProjectName(event.target.value)}
                        placeholder="例如：1J4WJ/6、A專案、B專案"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="project-description">專案說明</Label>
                      <Textarea
                        id="project-description"
                        rows={3}
                        value={projectDescription}
                        onChange={(event) =>
                          setProjectDescription(event.target.value)
                        }
                        placeholder="可選填，例如客戶、產線、版本、批次"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>流程範本來源</Label>
                      <Select
                        value={cloneSourceProjectId}
                        onValueChange={setCloneSourceProjectId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="選擇是否複製既有流程" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EMPTY_TEMPLATE_VALUE}>
                            空白專案，不複製任何流程
                          </SelectItem>
                          {projects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              從 {project.name} 複製流程
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-background/35 p-4 text-sm text-muted-foreground">
                      {cloneSourceProject ? (
                        <div className="space-y-3">
                          <div className="flex items-start gap-3">
                            <CopyPlus className="mt-0.5 h-4 w-4 text-primary" />
                            <div>
                              <div className="font-medium text-foreground">
                                會複製流程範本
                              </div>
                              <p className="mt-1">
                                新專案會從{" "}
                                <strong>{cloneSourceProject.name}</strong>{" "}
                                複製站點、測項與站點內容。
                              </p>
                            </div>
                          </div>
                          <p className="text-xs leading-6">
                            不會複製機台清單、維修問題、測試進度與維修紀錄，所以各專案資料仍然獨立。
                          </p>
                        </div>
                      ) : (
                        <div className="flex items-start gap-3">
                          <FolderKanban className="mt-0.5 h-4 w-4 text-primary" />
                          <div>
                            <div className="font-medium text-foreground">
                              會建立空白專案
                            </div>
                            <p className="mt-1">
                              只新增一個全新的專案容器，不會從其他專案帶入任何資料。
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between sm:space-x-0">
                      <Button
                        variant="outline"
                        onClick={handleRefreshProjects}
                        disabled={isRefreshing || isLoadingProjects}
                      >
                        <RefreshCcw
                          className={`mr-2 h-4 w-4 ${
                            isRefreshing ? "animate-spin" : ""
                          }`}
                        />
                        重新整理清單
                      </Button>
                      <Button onClick={handleCreateProject} disabled={isCreating}>
                        <Plus className="mr-2 h-4 w-4" />
                        {isCreating ? "建立中..." : "建立新專案"}
                      </Button>
                    </DialogFooter>
                  </div>
                </div>

                <div className="p-6">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">
                        全部專案
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        目前共有 {projects.length} 個專案，可隨時切換。
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className="rounded-full border border-white/10 bg-background/25 px-3 py-1 text-xs text-foreground"
                    >
                      已載入 {projects.length} 筆
                    </Badge>
                  </div>

                  <ScrollArea className="h-[420px] pr-4">
                    <div className="space-y-3">
                      {projects.map((project) => {
                        const isActive = project.id === activeProjectId;

                        return (
                          <div
                            key={project.id}
                            className="rounded-3xl border border-border/70 bg-background/30 p-4 shadow-[0_18px_42px_-36px_hsl(220_40%_2%/1)]"
                          >
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                              <div className="min-w-0 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-sm font-semibold text-foreground">
                                    {project.name}
                                  </div>
                                  {isActive && (
                                    <Badge
                                      variant="secondary"
                                      className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-100"
                                    >
                                      目前使用中
                                    </Badge>
                                  )}
                                </div>

                                <p className="text-sm text-muted-foreground">
                                  {project.description?.trim() ||
                                    "尚未填寫專案說明"}
                                </p>

                                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                  <span>建立日期：{formatProjectDate(project)}</span>
                                  <span>ID：{project.id.slice(0, 8)}</span>
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-2">
                                {isActive ? (
                                  <Button
                                    variant="secondary"
                                    className="rounded-2xl"
                                    disabled
                                  >
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    目前專案
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    className="rounded-2xl"
                                    onClick={() => handleActivateProject(project.id)}
                                  >
                                    切換到此專案
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  className="rounded-2xl border-red-500/25 text-red-200 hover:bg-red-500/10 hover:text-red-100"
                                  disabled={projects.length <= 1}
                                  onClick={() => setProjectPendingDeleteId(project.id)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  刪除
                                </Button>
                              </div>
                            </div>
                            {projects.length <= 1 && (
                              <p className="mt-3 text-xs text-amber-200/80">
                                至少要保留一個專案，所以目前不能刪除最後一個專案。
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <AlertDialog
        open={!!projectPendingDelete}
        onOpenChange={(open) => {
          if (!open && !isDeletingProject) {
            setProjectPendingDeleteId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除專案</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                你要刪除的是
                {" "}
                <strong>{projectPendingDelete?.name ?? "未指定專案"}</strong>。
              </p>
              <p>
                這裡的刪除是安全封存：專案會從切換清單中移除，但資料庫裡既有紀錄不會被物理清掉。
              </p>
              <p>
                若這是目前專案，系統會自動切到其他仍保留的專案。
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingProject}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProject}
              disabled={isDeletingProject}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeletingProject ? "刪除中..." : "確認刪除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
