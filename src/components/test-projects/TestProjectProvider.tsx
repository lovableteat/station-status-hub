import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useUser } from "@/components/auth/UserContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  SUPABASE_EGRESS_RESTRICTION_MESSAGE,
  isSupabaseServiceRestrictedError,
} from "@/integrations/supabase/serviceErrors";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";

const ACTIVE_PROJECT_STORAGE_KEY = "station-status-hub:active-test-project:v2";

export type ProjectStatus =
  | "planning"
  | "active"
  | "paused"
  | "completed"
  | "archived";

export type TestProject = Tables<"test_projects">;

export interface TestProjectSummary {
  active_machine_count: number;
  flow_version_label: string | null;
  machine_count: number;
  open_issue_count: number;
  project_id: string;
}

interface CreateTestProjectInput {
  cloneFromProjectId?: string | null;
  description?: string;
  name: string;
  ownerUserId?: string | null;
  plannedEndDate?: string | null;
  plannedStartDate?: string | null;
  status?: ProjectStatus;
}

interface UpdateTestProjectInput {
  description?: string | null;
  name?: string;
  ownerUserId?: string | null;
  plannedEndDate?: string | null;
  plannedStartDate?: string | null;
  projectId: string;
  status?: ProjectStatus;
}

interface TestProjectContextValue {
  activeProject: TestProject | null;
  activeProjectId: string | null;
  allProjects: TestProject[];
  archiveProject: (projectId: string) => Promise<boolean>;
  createProject: (input: CreateTestProjectInput) => Promise<TestProject | null>;
  deleteProject: (projectId: string) => Promise<boolean>;
  isLoadingProjects: boolean;
  isSwitchingProject: boolean;
  projectSummaries: Record<string, TestProjectSummary>;
  projects: TestProject[];
  refreshProjects: () => Promise<void>;
  restoreProject: (projectId: string) => Promise<boolean>;
  setActiveProjectId: (projectId: string) => void;
  updateProject: (input: UpdateTestProjectInput) => Promise<TestProject | null>;
}

const TestProjectContext = createContext<TestProjectContextValue | undefined>(
  undefined
);

function normalizeProject(project: Partial<TestProject>): TestProject {
  const status = (project.status || (project.is_archived ? "archived" : "active")) as ProjectStatus;

  return {
    active_flow_version_id: project.active_flow_version_id ?? null,
    completed_at: project.completed_at ?? null,
    created_at: project.created_at ?? new Date().toISOString(),
    description: project.description ?? null,
    id: project.id ?? "",
    is_archived: project.is_archived ?? status === "archived",
    name: project.name ?? "未命名專案",
    owner_user_id: project.owner_user_id ?? null,
    planned_end_date: project.planned_end_date ?? null,
    planned_start_date: project.planned_start_date ?? null,
    started_at: project.started_at ?? null,
    status,
    updated_at: project.updated_at ?? project.created_at ?? new Date().toISOString(),
  };
}

function updateProjectQuery(projectId: string) {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  url.searchParams.set("project", projectId);
  window.history.replaceState({}, "", url);
}

export function TestProjectProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { user } = useUser();
  const [allProjects, setAllProjects] = useState<TestProject[]>([]);
  const [projectSummaries, setProjectSummaries] = useState<
    Record<string, TestProjectSummary>
  >({});
  const [activeProjectIdState, setActiveProjectIdState] = useState<string | null>(
    null
  );
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isSwitchingProject, setIsSwitchingProject] = useState(false);
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const projects = useMemo(
    () => allProjects.filter((project) => project.status !== "archived" && !project.is_archived),
    [allProjects]
  );

  const resolvePreferredProjectId = useCallback(
    (availableProjects: TestProject[], currentProjectId?: string | null) => {
      if (currentProjectId && availableProjects.some((project) => project.id === currentProjectId)) {
        return currentProjectId;
      }

      if (typeof window !== "undefined") {
        const urlProjectId = new URLSearchParams(window.location.search).get("project");
        if (urlProjectId && availableProjects.some((project) => project.id === urlProjectId)) {
          return urlProjectId;
        }

        const storedProjectId = window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
        if (
          storedProjectId &&
          availableProjects.some((project) => project.id === storedProjectId)
        ) {
          return storedProjectId;
        }
      }

      return (
        availableProjects.find((project) => project.status === "active")?.id ??
        availableProjects[0]?.id ??
        null
      );
    },
    []
  );

  const setActiveProjectId = useCallback((projectId: string) => {
    setIsSwitchingProject(true);
    setActiveProjectIdState(projectId);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, projectId);
      updateProjectQuery(projectId);
      window.dispatchEvent(
        new CustomEvent("maintenance-project-change", { detail: { projectId } })
      );
    }

    if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
    switchTimerRef.current = setTimeout(() => setIsSwitchingProject(false), 420);
  }, []);

  const refreshProjectSummaries = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_test_project_summaries");

    if (error) {
      if (isSupabaseServiceRestrictedError(error)) {
        throw error;
      }

      // The additive migration may not have reached an older environment yet.
      console.info("Project summaries are unavailable until the migration is applied.");
      const [systemsResult, issuesResult] = await Promise.all([
        supabase.from("test_systems").select("project_id, status"),
        supabase.from("issues").select("project_id, status"),
      ]);
      if (systemsResult.error || issuesResult.error) return;

      const fallbackSummaries: Record<string, TestProjectSummary> = {};
      const ensureSummary = (projectId: string) => {
        fallbackSummaries[projectId] ??= {
          active_machine_count: 0,
          flow_version_label: null,
          machine_count: 0,
          open_issue_count: 0,
          project_id: projectId,
        };
        return fallbackSummaries[projectId];
      };

      (systemsResult.data ?? []).forEach((system) => {
        const summary = ensureSummary(system.project_id);
        summary.machine_count += 1;
        if (!["Done", "已完成"].includes(system.status || "Not Start")) {
          summary.active_machine_count += 1;
        }
      });
      (issuesResult.data ?? []).forEach((issue) => {
        if (!["resolved", "closed"].includes(issue.status || "open")) {
          ensureSummary(issue.project_id).open_issue_count += 1;
        }
      });
      setProjectSummaries(fallbackSummaries);
      return;
    }

    const summaryMap = Object.fromEntries(
      (data ?? []).map((summary) => [
        summary.project_id,
        {
          ...summary,
          active_machine_count: Number(summary.active_machine_count ?? 0),
          machine_count: Number(summary.machine_count ?? 0),
          open_issue_count: Number(summary.open_issue_count ?? 0),
        },
      ])
    );
    setProjectSummaries(summaryMap);
  }, []);

  const refreshProjects = useCallback(async () => {
    if (!user) {
      setAllProjects([]);
      setProjectSummaries({});
      setActiveProjectIdState(null);
      setIsLoadingProjects(false);
      return;
    }

    setIsLoadingProjects(true);

    try {
      const { data, error } = await supabase
        .from("test_projects")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const normalizedProjects = (data ?? []).map(normalizeProject);
      const activeProjects = normalizedProjects.filter(
        (project) => project.status !== "archived" && !project.is_archived
      );
      setAllProjects(normalizedProjects);

      const nextActiveProjectId = resolvePreferredProjectId(
        activeProjects,
        activeProjectIdState
      );
      setActiveProjectIdState(nextActiveProjectId);

      if (typeof window !== "undefined") {
        if (nextActiveProjectId) {
          window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, nextActiveProjectId);
          updateProjectQuery(nextActiveProjectId);
        } else {
          window.localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
        }
      }

      await refreshProjectSummaries();
    } catch (error) {
      console.error("Failed to load maintenance projects:", error);
      const serviceRestricted = isSupabaseServiceRestrictedError(error);
      toast({
        title: serviceRestricted ? "資料服務暫時中斷" : "專案載入失敗",
        description: serviceRestricted
          ? SUPABASE_EGRESS_RESTRICTION_MESSAGE
          : "無法載入機台維修專案，請稍後再試。",
        variant: "destructive",
      });
    } finally {
      setIsLoadingProjects(false);
    }
  }, [
    activeProjectIdState,
    refreshProjectSummaries,
    resolvePreferredProjectId,
    toast,
    user,
  ]);

  const createProject = useCallback(
    async ({
      cloneFromProjectId,
      description,
      name,
      ownerUserId,
      plannedEndDate,
      plannedStartDate,
      status = "planning",
    }: CreateTestProjectInput) => {
      try {
        const { data, error } = await supabase.rpc("create_test_project", {
          p_clone_from_project_id: cloneFromProjectId ?? null,
          p_description: description?.trim() || null,
          p_name: name.trim(),
        });

        if (error) throw error;

        let createdProject = normalizeProject(
          (Array.isArray(data) ? data[0] : data) as Partial<TestProject>
        );

        const lifecyclePayload = {
          owner_user_id: ownerUserId ?? null,
          planned_end_date: plannedEndDate || null,
          planned_start_date: plannedStartDate || null,
          status,
        };
        const { data: updatedProject, error: lifecycleError } = await supabase
          .from("test_projects")
          .update(lifecyclePayload)
          .eq("id", createdProject.id)
          .select("*")
          .single();

        if (!lifecycleError && updatedProject) {
          createdProject = normalizeProject(updatedProject);
        }

        await refreshProjects();
        setActiveProjectId(createdProject.id);

        toast({
          title: "專案已建立",
          description: `${createdProject.name} 已可開始設定流程與機台。`,
        });

        return createdProject;
      } catch (error) {
        console.error("Failed to create maintenance project:", error);
        toast({
          title: "專案建立失敗",
          description: "請確認專案名稱未重複，且資料庫 migration 已套用。",
          variant: "destructive",
        });
        return null;
      }
    },
    [refreshProjects, setActiveProjectId, toast]
  );

  const updateProject = useCallback(
    async ({
      description,
      name,
      ownerUserId,
      plannedEndDate,
      plannedStartDate,
      projectId,
      status,
    }: UpdateTestProjectInput) => {
      const payload: TablesUpdate<"test_projects"> = {};
      if (name !== undefined) payload.name = name.trim();
      if (description !== undefined) payload.description = description?.trim() || null;
      if (ownerUserId !== undefined) payload.owner_user_id = ownerUserId;
      if (plannedStartDate !== undefined) payload.planned_start_date = plannedStartDate;
      if (plannedEndDate !== undefined) payload.planned_end_date = plannedEndDate;
      if (status !== undefined) payload.status = status;

      try {
        const { data, error } = await supabase
          .from("test_projects")
          .update(payload)
          .eq("id", projectId)
          .select("*")
          .single();

        if (error) throw error;
        await refreshProjects();

        toast({
          title: "專案已更新",
          description: `${data.name} 的管理資訊已儲存。`,
        });
        return normalizeProject(data);
      } catch (error) {
        console.error("Failed to update maintenance project:", error);
        toast({
          title: "專案更新失敗",
          description: "無法儲存專案資料，請稍後再試。",
          variant: "destructive",
        });
        return null;
      }
    },
    [refreshProjects, toast]
  );

  const setArchivedState = useCallback(
    async (projectId: string, archived: boolean) => {
      if (archived && projects.length <= 1) {
        toast({
          title: "至少保留一個使用中專案",
          description: "請先建立另一個專案，再封存目前唯一的專案。",
          variant: "destructive",
        });
        return false;
      }

      const { error } = await supabase
        .from("test_projects")
        .update({ is_archived: archived, status: archived ? "archived" : "active" })
        .eq("id", projectId);

      if (error) {
        toast({
          title: archived ? "封存失敗" : "還原失敗",
          description: "無法更新專案狀態。",
          variant: "destructive",
        });
        return false;
      }

      await refreshProjects();
      return true;
    },
    [projects.length, refreshProjects, toast]
  );

  useEffect(() => {
    void refreshProjects();

    if (!user) return;

    const channel = supabase
      .channel("maintenance_project_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "test_projects" },
        refreshProjects
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshProjects, user]);

  useEffect(
    () => () => {
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
    },
    []
  );

  const activeProject = useMemo(
    () => allProjects.find((project) => project.id === activeProjectIdState) ?? null,
    [activeProjectIdState, allProjects]
  );

  const value = useMemo<TestProjectContextValue>(
    () => ({
      activeProject,
      activeProjectId: activeProjectIdState,
      allProjects,
      archiveProject: (projectId) => setArchivedState(projectId, true),
      createProject,
      deleteProject: (projectId) => setArchivedState(projectId, true),
      isLoadingProjects,
      isSwitchingProject,
      projectSummaries,
      projects,
      refreshProjects,
      restoreProject: (projectId) => setArchivedState(projectId, false),
      setActiveProjectId,
      updateProject,
    }),
    [
      activeProject,
      activeProjectIdState,
      allProjects,
      createProject,
      isLoadingProjects,
      isSwitchingProject,
      projectSummaries,
      projects,
      refreshProjects,
      setActiveProjectId,
      setArchivedState,
      updateProject,
    ]
  );

  return (
    <TestProjectContext.Provider value={value}>
      {children}
    </TestProjectContext.Provider>
  );
}

export function useTestProject() {
  const context = useContext(TestProjectContext);

  if (!context) {
    throw new Error("useTestProject must be used within a TestProjectProvider");
  }

  return context;
}
