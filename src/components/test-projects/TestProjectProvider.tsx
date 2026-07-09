import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

const ACTIVE_PROJECT_STORAGE_KEY = "station-status-hub:active-test-project:v1";

export type TestProject = Tables<"test_projects">;

interface CreateTestProjectInput {
  name: string;
  description?: string;
  cloneFromProjectId?: string | null;
}

interface UpdateTestProjectInput {
  projectId: string;
  name: string;
  description?: string;
}

interface TestProjectContextValue {
  activeProject: TestProject | null;
  activeProjectId: string | null;
  createProject: (input: CreateTestProjectInput) => Promise<TestProject | null>;
  deleteProject: (projectId: string) => Promise<boolean>;
  isLoadingProjects: boolean;
  projects: TestProject[];
  refreshProjects: () => Promise<void>;
  setActiveProjectId: (projectId: string) => void;
  updateProject: (input: UpdateTestProjectInput) => Promise<TestProject | null>;
}

const TestProjectContext = createContext<TestProjectContextValue | undefined>(
  undefined
);

export function TestProjectProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [projects, setProjects] = useState<TestProject[]>([]);
  const [activeProjectIdState, setActiveProjectIdState] = useState<string | null>(
    null
  );
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);

  const setActiveProjectId = useCallback((projectId: string) => {
    setActiveProjectIdState(projectId);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, projectId);
    }
  }, []);

  const resolveStoredProjectId = useCallback((availableProjects: TestProject[]) => {
    if (typeof window === "undefined") {
      return availableProjects[0]?.id ?? null;
    }

    const storedProjectId = window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
    if (
      storedProjectId &&
      availableProjects.some((project) => project.id === storedProjectId)
    ) {
      return storedProjectId;
    }

    return availableProjects[0]?.id ?? null;
  }, []);

  const refreshProjects = useCallback(async () => {
    setIsLoadingProjects(true);

    try {
      const { data, error } = await supabase
        .from("test_projects")
        .select("*")
        .eq("is_archived", false)
        .order("created_at", { ascending: true });

      if (error) {
        throw error;
      }

      const nextProjects = data ?? [];
      setProjects(nextProjects);

      const nextActiveProjectId = resolveStoredProjectId(nextProjects);
      setActiveProjectIdState(nextActiveProjectId);

      if (typeof window !== "undefined") {
        if (nextActiveProjectId) {
          window.localStorage.setItem(
            ACTIVE_PROJECT_STORAGE_KEY,
            nextActiveProjectId
          );
        } else {
          window.localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
        }
      }
    } catch (error) {
      console.error("Failed to load test projects:", error);
      toast({
        title: "Project load failed",
        description: "Unable to load machine maintenance projects.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingProjects(false);
    }
  }, [resolveStoredProjectId, toast]);

  const createProject = useCallback(
    async ({ name, description, cloneFromProjectId }: CreateTestProjectInput) => {
      try {
        const { data, error } = await supabase.rpc("create_test_project", {
          p_clone_from_project_id: cloneFromProjectId ?? null,
          p_description: description?.trim() || null,
          p_name: name.trim(),
        });

        if (error) {
          throw error;
        }

        const createdProject = (Array.isArray(data) ? data[0] : data) as
          | TestProject
          | null;

        await refreshProjects();

        if (createdProject?.id) {
          setActiveProjectId(createdProject.id);
        }

        return createdProject;
      } catch (error) {
        console.error("Failed to create test project:", error);
        toast({
          title: "Project creation failed",
          description: "Unable to create the new project.",
          variant: "destructive",
        });
        return null;
      }
    },
    [refreshProjects, setActiveProjectId, toast]
  );

  const updateProject = useCallback(
    async ({ projectId, name, description }: UpdateTestProjectInput) => {
      const projectToUpdate =
        projects.find((project) => project.id === projectId) ?? null;

      if (!projectToUpdate) {
        toast({
          title: "找不到專案",
          description: "你要修改的專案已不存在或剛被移除。",
          variant: "destructive",
        });
        return null;
      }

      try {
        const { data, error } = await supabase
          .from("test_projects")
          .update({
            description: description?.trim() || null,
            name: name.trim(),
          })
          .eq("id", projectId)
          .select("*")
          .single();

        if (error) {
          throw error;
        }

        await refreshProjects();

        toast({
          title: "專案已更新",
          description: `${data.name} 的名稱與說明已更新完成。`,
        });

        return data as TestProject;
      } catch (error) {
        console.error("Failed to update test project:", error);

        const message =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23505"
            ? "已有相同名稱的專案，請改用其他名稱。"
            : "無法更新你選取的專案，請稍後再試。";

        toast({
          title: "專案更新失敗",
          description: message,
          variant: "destructive",
        });
        return null;
      }
    },
    [projects, refreshProjects, toast]
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      const projectToArchive =
        projects.find((project) => project.id === projectId) ?? null;

      if (!projectToArchive) {
        toast({
          title: "Project not found",
          description: "The selected project no longer exists.",
          variant: "destructive",
        });
        return false;
      }

      if (projects.length <= 1) {
        toast({
          title: "At least one project is required",
          description: "Create another project before deleting the last one.",
          variant: "destructive",
        });
        return false;
      }

      try {
        const { error } = await supabase
          .from("test_projects")
          .update({ is_archived: true })
          .eq("id", projectId);

        if (error) {
          throw error;
        }

        await refreshProjects();

        toast({
          title: "Project deleted",
          description: `${projectToArchive.name} was removed from the active list. Existing records were preserved.`,
        });

        return true;
      } catch (error) {
        console.error("Failed to archive test project:", error);
        toast({
          title: "Project deletion failed",
          description: "Unable to delete the selected project.",
          variant: "destructive",
        });
        return false;
      }
    },
    [projects, refreshProjects, toast]
  );

  useEffect(() => {
    refreshProjects();

    const channel = supabase
      .channel("test_project_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "test_projects" },
        () => {
          refreshProjects();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshProjects]);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectIdState) ?? null,
    [activeProjectIdState, projects]
  );

  const value = useMemo<TestProjectContextValue>(
    () => ({
      activeProject,
      activeProjectId: activeProjectIdState,
      createProject,
      deleteProject,
      isLoadingProjects,
      projects,
      refreshProjects,
      setActiveProjectId,
      updateProject,
    }),
    [
      activeProject,
      activeProjectIdState,
      createProject,
      deleteProject,
      isLoadingProjects,
      projects,
      refreshProjects,
      setActiveProjectId,
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
