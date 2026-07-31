import { useCallback, useEffect, useRef, useState } from "react";

import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import type { FacilityPlan, SitePlan } from "./dataCenterTypes";

export interface DataCenterProjectDocument {
  schemaVersion: 1;
  sites: SitePlan[];
  facilityPlans: Record<string, FacilityPlan>;
  modelOverrides: Json;
}

export interface DataCenterProjectSummary {
  id: string;
  projectKey: string;
  name: string;
  category: string;
  description: string;
  document: Json;
  updatedAt: string;
  updatedBy: string | null;
}

export type DataCenterProjectSyncState =
  | "loading"
  | "synced"
  | "saving"
  | "local"
  | "error";

interface UseSharedDataCenterProjectsOptions {
  userId: string | null;
  canEdit: boolean;
  currentDocument: DataCenterProjectDocument;
  onApplyDocument: (document: DataCenterProjectDocument) => void;
}

const SELECTED_PROJECT_KEY = "data-center-selected-shared-project";

function mapProject(row: {
  id: string;
  project_key: string;
  name: string;
  category: string;
  description: string;
  document: Json;
  updated_at: string;
  updated_by: string | null;
}): DataCenterProjectSummary {
  return {
    id: row.id,
    projectKey: row.project_key,
    name: row.name,
    category: row.category,
    description: row.description,
    document: row.document,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function parseDocument(value: Json): DataCenterProjectDocument | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const candidate = value as Record<string, Json | undefined>;
  if (!Array.isArray(candidate.sites) || candidate.sites.length === 0 || !candidate.facilityPlans) return null;
  if (typeof candidate.facilityPlans !== "object" || Array.isArray(candidate.facilityPlans)) return null;
  return {
    schemaVersion: 1,
    sites: candidate.sites as unknown as SitePlan[],
    facilityPlans: candidate.facilityPlans as unknown as Record<string, FacilityPlan>,
    modelOverrides: candidate.modelOverrides ?? {},
  };
}

function createProjectKey(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "data-center";
  return `${base}-${Date.now().toString(36)}`;
}

export function useSharedDataCenterProjects({
  userId,
  canEdit,
  currentDocument,
  onApplyDocument,
}: UseSharedDataCenterProjectsOptions) {
  const [projects, setProjects] = useState<DataCenterProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [syncState, setSyncState] = useState<DataCenterProjectSyncState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const readyRef = useRef(false);
  const applyingRef = useRef(false);
  const lastSavedRef = useRef("");
  const selectedProjectIdRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentDocumentRef = useRef(currentDocument);

  useEffect(() => {
    currentDocumentRef.current = currentDocument;
  }, [currentDocument]);

  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId]);

  const applyProject = useCallback(
    (project: DataCenterProjectSummary) => {
      const document = parseDocument(project.document);
      if (!document) return false;
      applyingRef.current = true;
      readyRef.current = false;
      lastSavedRef.current = JSON.stringify(document);
      onApplyDocument(document);
      window.setTimeout(() => {
        applyingRef.current = false;
        readyRef.current = true;
        setSyncState("synced");
      }, 0);
      return true;
    },
    [onApplyDocument],
  );

  const loadProjects = useCallback(async () => {
    if (!userId) {
      setSyncState("local");
      return;
    }
    setSyncState("loading");
    const { data, error } = await supabase
      .from("data_center_projects")
      .select("id,project_key,name,category,description,document,updated_at,updated_by")
      .is("archived_at", null)
      .order("category")
      .order("name");
    if (error || !data?.length) {
      setErrorMessage(error?.message ?? "找不到可用的共用專案");
      setSyncState("local");
      readyRef.current = false;
      return;
    }

    const nextProjects = data.map(mapProject);
    setProjects(nextProjects);
    const storedId = window.localStorage.getItem(SELECTED_PROJECT_KEY);
    const selected = nextProjects.find((project) => project.id === storedId) ?? nextProjects[0];
    setSelectedProjectId(selected.id);
    window.localStorage.setItem(SELECTED_PROJECT_KEY, selected.id);

    if (applyProject(selected)) return;

    const initialDocument = currentDocumentRef.current as unknown as Json;
    if (canEdit) {
      const { error: initializeError } = await supabase
        .from("data_center_projects")
        .update({ document: initialDocument, updated_by: userId })
        .eq("id", selected.id);
      if (!initializeError) {
        lastSavedRef.current = JSON.stringify(currentDocumentRef.current);
        readyRef.current = true;
        setSyncState("synced");
        setProjects((items) =>
          items.map((item) => item.id === selected.id ? { ...item, document: initialDocument } : item),
        );
        return;
      }
    }
    setErrorMessage("共用專案尚未初始化，目前保留本機資料。");
    setSyncState("local");
  }, [applyProject, canEdit, userId]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("data-center-shared-projects")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "data_center_projects" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            void loadProjects();
            return;
          }
          const next = mapProject(payload.new as Parameters<typeof mapProject>[0]);
          setProjects((items) => {
            const exists = items.some((item) => item.id === next.id);
            return exists ? items.map((item) => item.id === next.id ? next : item) : [...items, next];
          });
          if (next.id === selectedProjectIdRef.current && next.updatedBy !== userId) {
            if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
            applyProject(next);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [applyProject, loadProjects, userId]);

  useEffect(() => {
    if (!readyRef.current || applyingRef.current || !canEdit || !userId || !selectedProjectId) return;
    const serialized = JSON.stringify(currentDocument);
    if (serialized === lastSavedRef.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    setSyncState("saving");
    saveTimerRef.current = window.setTimeout(async () => {
      const { error } = await supabase
        .from("data_center_projects")
        .update({ document: currentDocument as unknown as Json, updated_by: userId })
        .eq("id", selectedProjectId);
      if (error) {
        setErrorMessage(error.message);
        setSyncState("error");
        return;
      }
      lastSavedRef.current = serialized;
      setSyncState("synced");
    }, 1_200);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [canEdit, currentDocument, selectedProjectId, userId]);

  const selectProject = useCallback((projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    setSelectedProjectId(projectId);
    window.localStorage.setItem(SELECTED_PROJECT_KEY, projectId);
    if (!applyProject(project)) {
      readyRef.current = true;
      lastSavedRef.current = "";
      setSyncState("synced");
    }
  }, [applyProject, projects]);

  const createProject = useCallback(async (name: string, category: string, description: string) => {
    if (!canEdit || !userId) throw new Error("沒有新增 Data Center 專案的權限");
    const { data, error } = await supabase
      .from("data_center_projects")
      .insert({
        project_key: createProjectKey(name),
        name: name.trim(),
        category: category.trim() || "未分類",
        description: description.trim(),
        document: currentDocument as unknown as Json,
        created_by: userId,
        updated_by: userId,
      })
      .select("id,project_key,name,category,description,document,updated_at,updated_by")
      .single();
    if (error) throw error;
    const project = mapProject(data);
    setProjects((items) => [...items, project]);
    setSelectedProjectId(project.id);
    window.localStorage.setItem(SELECTED_PROJECT_KEY, project.id);
    lastSavedRef.current = JSON.stringify(currentDocument);
    readyRef.current = true;
    setSyncState("synced");
    return project;
  }, [canEdit, currentDocument, userId]);

  const updateProject = useCallback(async (projectId: string, name: string, category: string, description: string) => {
    if (!canEdit || !userId) throw new Error("沒有修改 Data Center 專案的權限");
    const { error } = await supabase
      .from("data_center_projects")
      .update({ name: name.trim(), category: category.trim() || "未分類", description: description.trim(), updated_by: userId })
      .eq("id", projectId);
    if (error) throw error;
    setProjects((items) => items.map((item) => item.id === projectId ? { ...item, name: name.trim(), category: category.trim() || "未分類", description: description.trim() } : item));
  }, [canEdit, userId]);

  const archiveProject = useCallback(async (projectId: string) => {
    if (!canEdit || !userId) throw new Error("沒有刪除 Data Center 專案的權限");
    if (projects.length <= 1) throw new Error("至少需要保留一個 Data Center 專案");
    const { error } = await supabase
      .from("data_center_projects")
      .update({ archived_at: new Date().toISOString(), updated_by: userId })
      .eq("id", projectId);
    if (error) throw error;
    const remaining = projects.filter((item) => item.id !== projectId);
    setProjects(remaining);
    if (selectedProjectIdRef.current === projectId) selectProject(remaining[0].id);
  }, [canEdit, projects, selectProject, userId]);

  return {
    projects,
    selectedProjectId,
    selectedProject: projects.find((item) => item.id === selectedProjectId) ?? null,
    syncState,
    errorMessage,
    selectProject,
    createProject,
    updateProject,
    archiveProject,
    retry: loadProjects,
  };
}
