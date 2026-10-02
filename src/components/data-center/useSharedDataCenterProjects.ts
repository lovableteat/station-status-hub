import { useCallback, useEffect, useRef, useState } from "react";

import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { withReadDeadline } from "@/lib/readDeadline";
import { semanticJson } from "@/lib/semanticJson";
import { acceptRowChange, type RealtimeRow, type RowChange } from "@/lib/realtimeRows";
import { isUninitializedDataCenterDocument, parseDataCenterDocument as parseDocument } from "./projectDocument";
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
  const saveTimerRef = useRef<number | null>(null);
  const currentDocumentRef = useRef(currentDocument);
  const extraDocumentFieldsRef = useRef<Record<string, unknown>>({});
  const accountRef = useRef(userId);
  const canEditRef = useRef(canEdit);
  const generationRef = useRef(0);
  const versionRef = useRef("");
  const draftBaseRef = useRef("");
  const eventRevisionRef = useRef(0);
  const eventRowsRef = useRef(new Map<string, { revision: number; project: DataCenterProjectSummary | null }>());
  const eventClocksRef = useRef(new Map<string, string>());
  const readSequenceRef = useRef(0);
  const readsInFlightRef = useRef(0);
  const writeRef = useRef<{ projectId: string; serialized: string } | null>(null);
  const applyRef = useRef(onApplyDocument);
  const [saveRevision, setSaveRevision] = useState(0);
  // Keep event handlers current before effects run after an account/selection change.
  if (accountRef.current !== userId) {
    accountRef.current = userId;
    generationRef.current += 1;
    readyRef.current = false;
    selectedProjectIdRef.current = "";
    lastSavedRef.current = "";
    versionRef.current = "";
    draftBaseRef.current = "";
    writeRef.current = null;
    eventRowsRef.current.clear();
    eventClocksRef.current.clear();
    extraDocumentFieldsRef.current = {};
  }
  currentDocumentRef.current = { ...extraDocumentFieldsRef.current, ...currentDocument };
  canEditRef.current = canEdit;
  applyRef.current = onApplyDocument;
  const draftKey = useCallback((id: string) => `data-center-draft:${userId}:${id}`, [userId]);
  const isDirty = useCallback(() => Boolean(selectedProjectIdRef.current && lastSavedRef.current
    && semanticJson(currentDocumentRef.current) !== lastSavedRef.current), []);
  const preserveDraft = useCallback(() => {
    if (!isDirty()) return;
    try {
      window.localStorage.setItem(draftKey(selectedProjectIdRef.current), JSON.stringify({
        document: currentDocumentRef.current, baseVersion: draftBaseRef.current,
      }));
    } catch { setErrorMessage("本機草稿無法保存，請留在此頁完成同步。"); }
  }, [draftKey, isDirty]);

  useEffect(() => {
    currentDocumentRef.current = { ...extraDocumentFieldsRef.current, ...currentDocument };
  }, [currentDocument]);

  const applyProject = useCallback(
    (project: DataCenterProjectSummary) => {
      const document = parseDocument(project.document);
      if (!document) {
        readyRef.current = false;
        setErrorMessage(isUninitializedDataCenterDocument(project.document)
          ? "共用專案尚未初始化。" : "共用專案格式不完整或版本不支援，已保留原文件，未覆寫。請切換專案或重試。");
        setSyncState("error");
        return false;
      }
      const generation = generationRef.current;
      extraDocumentFieldsRef.current = Object.fromEntries(Object.entries(document)
        .filter(([key]) => !["schemaVersion", "sites", "facilityPlans", "modelOverrides"].includes(key)));
      versionRef.current = project.updatedAt;
      applyingRef.current = true;
      readyRef.current = false;
      lastSavedRef.current = semanticJson(document);
      let recovered: { document: DataCenterProjectDocument; baseVersion: string } | null = null;
      try {
        const raw = window.localStorage.getItem(draftKey(project.id));
        const draft = raw ? JSON.parse(raw) : null;
        const parsed = parseDocument(draft?.document);
        if (parsed && semanticJson(parsed) !== lastSavedRef.current) recovered = { document: parsed, baseVersion: draft.baseVersion };
      } catch { /* Leave damaged recovery data intact for manual inspection. */ }
      currentDocumentRef.current = recovered?.document ?? document;
      draftBaseRef.current = recovered?.baseVersion ?? project.updatedAt;
      applyRef.current(currentDocumentRef.current);
      window.setTimeout(() => {
        if (generation !== generationRef.current || selectedProjectIdRef.current !== project.id) return;
        applyingRef.current = false;
        readyRef.current = !recovered || recovered.baseVersion === project.updatedAt;
        setErrorMessage(readyRef.current ? "" : "已恢復未儲存草稿，但共用版本已有變更。請先保留草稿，再重試取得共用版本。");
        setSyncState(!readyRef.current ? "error" : recovered ? "saving" : "synced");
        setSaveRevision((value) => value + 1);
      }, 0);
      return true;
    },
    [draftKey],
  );

  const loadProjects = useCallback(async () => {
    if (!userId) {
      setSyncState("local");
      return;
    }
    const generation = generationRef.current;
    const sequence = ++readSequenceRef.current;
    readsInFlightRef.current += 1;
    try {
      const eventRevision = eventRevisionRef.current;
      const selectionAtStart = selectedProjectIdRef.current;
      if (!selectionAtStart) setSyncState("loading");
      let result;
      try { result = await withReadDeadline((signal) => supabase
        .from("data_center_projects")
        .select("id,project_key,name,category,description,document,updated_at,updated_by")
        .is("archived_at", null)
        .order("category")
        .order("name").abortSignal(signal)); }
      catch (error) { result = { data: null, error: { message: error instanceof Error ? error.message : "讀取失敗" } }; }
      if (generation !== generationRef.current || sequence !== readSequenceRef.current) return;
      const { data, error } = result;
      if (error || !data?.length) {
        setErrorMessage(error?.message ?? "找不到可用的共用專案");
        setSyncState("error");
        readyRef.current = false;
        return;
      }

      const byId = new Map<string, DataCenterProjectSummary>(data.map((row) => { const project = mapProject(row); return [project.id, project] as const; }));
      for (const [id, event] of eventRowsRef.current) {
        if (event.revision <= eventRevision) continue;
        if (event.project) byId.set(id, event.project); else byId.delete(id);
      }
      const nextProjects = [...byId.values()];
      if (!nextProjects.length) { readyRef.current = false; setSyncState("error"); return; }
      setProjects(nextProjects);
      // A late directory response cannot undo a selection made while it was loading.
      if (selectionAtStart !== selectedProjectIdRef.current) return;
      const storedId = selectedProjectIdRef.current || window.localStorage.getItem(`${SELECTED_PROJECT_KEY}:${userId}`)
        || window.localStorage.getItem(SELECTED_PROJECT_KEY);
      const selected = nextProjects.find((project) => project.id === storedId) ?? nextProjects[0];
      setSelectedProjectId(selected.id);
      selectedProjectIdRef.current = selected.id;
      window.localStorage.setItem(`${SELECTED_PROJECT_KEY}:${userId}`, selected.id);
      if (isDirty()) {
        preserveDraft();
        if (selected.updatedAt !== versionRef.current) {
          readyRef.current = false;
          setSyncState("error");
          setErrorMessage("共用版本已有变更，已保留本機草稿，未覆寫。重試前請先保留草稿。");
        }
        return;
      }

      if (applyProject(selected)) return;

      const initialDocument = currentDocumentRef.current as unknown as Json;
      if (canEditRef.current && isUninitializedDataCenterDocument(selected.document) && parseDocument(initialDocument)) {
        const { data: initialized, error: initializeError } = await supabase
          .from("data_center_projects")
          .update({ document: initialDocument, updated_by: userId })
          .eq("id", selected.id).eq("updated_at", selected.updatedAt)
          .select("id,project_key,name,category,description,document,updated_at,updated_by").maybeSingle();
        if (generation !== generationRef.current || selectedProjectIdRef.current !== selected.id) return;
        if (!initializeError && initialized) {
          versionRef.current = initialized.updated_at;
          draftBaseRef.current = initialized.updated_at;
          lastSavedRef.current = semanticJson(initialDocument);
          readyRef.current = true;
          setErrorMessage("");
          setSyncState(isDirty() ? "saving" : "synced");
          setSaveRevision((value) => value + 1);
          setProjects((items) =>
            items.map((item) => item.id === selected.id ? { ...item, document: initialDocument } : item),
          );
          return;
        }
        setErrorMessage(initializeError?.message ?? "另一位使用者已初始化此專案，請重試讀取。");
        setSyncState("error");
        return;
      }
    } finally { readsInFlightRef.current -= 1; }
  }, [applyProject, isDirty, preserveDraft, userId]);

  useEffect(() => {
    void loadProjects();
    return () => { generationRef.current += 1; readSequenceRef.current += 1; };
  }, [loadProjects]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    let recoveryTimer: number | null = null;
    let recoveryInFlight = false;
    let recoveryPending = false;
    const recover = () => {
      if (!active) return;
      if (recoveryInFlight) { recoveryPending = true; return; }
      if (recoveryTimer) window.clearTimeout(recoveryTimer);
      recoveryTimer = window.setTimeout(async () => {
        recoveryTimer = null;
        if (readsInFlightRef.current) { recover(); return; }
        recoveryInFlight = true;
        try { await loadProjects(); } finally {
          recoveryInFlight = false;
          if (active && recoveryPending) { recoveryPending = false; recover(); }
        }
      }, 150);
    };
    const onFocus = () => { if (document.visibilityState !== "hidden") recover(); };
    window.addEventListener("online", recover);
    window.addEventListener("focus", onFocus);
    const channel = supabase
      .channel("data-center-shared-projects")
      .on(
        "postgres_changes",
        { event: "*", schema: "workspace", table: "data_center_projects" },
        (payload) => {
          if (!active || !acceptRowChange(eventClocksRef.current, payload as unknown as RowChange<RealtimeRow>)) return;
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string }).id;
            if (id) eventRowsRef.current.set(id, { revision: ++eventRevisionRef.current, project: null });
            recover();
            return;
          }
          const next = mapProject(payload.new as Parameters<typeof mapProject>[0]);
          eventRowsRef.current.set(next.id, { revision: ++eventRevisionRef.current, project: next });
          setProjects((items) => {
            if (items.some((item) => item.id === next.id && semanticJson(item) === semanticJson(next))) return items;
            const exists = items.some((item) => item.id === next.id);
            return exists ? items.map((item) => item.id === next.id ? next : item) : [...items, next];
          });
          if (next.id === selectedProjectIdRef.current && next.updatedAt !== versionRef.current) {
            if (semanticJson(parseDocument(next.document)) === lastSavedRef.current) {
              // A name/category-only update advances the row version but does not replace the draft.
              versionRef.current = next.updatedAt;
              if (readyRef.current) draftBaseRef.current = next.updatedAt;
              setSaveRevision((value) => value + 1);
              return;
            }
            if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
            if (writeRef.current?.projectId === next.id && writeRef.current.serialized === semanticJson(next.document)) return;
            if (isDirty()) {
              preserveDraft();
              readyRef.current = false;
              setSyncState("error");
              setErrorMessage("共用版本已有變更，已保留未儲存草稿。請先保留草稿，再重試取得共用版本。");
              return;
            }
            applyProject(next);
          }
        },
      )
      .subscribe((status) => { if (status === "SUBSCRIBED") recover(); });
    return () => {
      active = false;
      if (recoveryTimer) window.clearTimeout(recoveryTimer);
      window.removeEventListener("online", recover);
      window.removeEventListener("focus", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [applyProject, isDirty, loadProjects, preserveDraft, userId]);

  useEffect(() => {
    if (!readyRef.current || applyingRef.current || !canEdit || !userId || !selectedProjectId) return;
    const documentToSave = { ...extraDocumentFieldsRef.current, ...currentDocument };
    const serialized = semanticJson(documentToSave);
    if (serialized === lastSavedRef.current) return;
    preserveDraft();
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    setSyncState("saving");
    saveTimerRef.current = window.setTimeout(async () => {
      if (!readyRef.current || !canEditRef.current || writeRef.current) return;
      const generation = generationRef.current;
      const expectedVersion = versionRef.current;
      const write = { projectId: selectedProjectId, serialized };
      writeRef.current = write;
      let result;
      try { result = await supabase
        .from("data_center_projects")
        .update({ document: documentToSave as unknown as Json, updated_by: userId })
        .eq("id", selectedProjectId).eq("updated_at", expectedVersion)
        .select("id,project_key,name,category,description,document,updated_at,updated_by").maybeSingle(); }
      catch (error) { result = { data: null, error: { message: error instanceof Error ? error.message : "保存失敗" } }; }
      if (writeRef.current === write) writeRef.current = null;
      if (generation !== generationRef.current) return;
      if (selectedProjectIdRef.current !== selectedProjectId) {
        setSaveRevision((value) => value + 1);
        return;
      }
      if (!canEditRef.current) return;
      const { data, error } = result;
      if (error || !data) {
        readyRef.current = false;
        preserveDraft();
        setErrorMessage(error?.message ?? "保存版本衝突，已保留草稿。請先保留草稿，再重試取得共用版本。");
        setSyncState("error");
        return;
      }
      if (!readyRef.current) return; // A newer external event has already raised a conflict.
      lastSavedRef.current = serialized;
      versionRef.current = data.updated_at;
      draftBaseRef.current = data.updated_at;
      if (!isDirty()) window.localStorage.setItem(draftKey(selectedProjectId), "");
      else preserveDraft();
      setSyncState(isDirty() ? "saving" : "synced");
      setSaveRevision((value) => value + 1);
    }, 1_200);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [canEdit, currentDocument, draftKey, isDirty, preserveDraft, saveRevision, selectedProjectId, userId]);

  useEffect(() => {
    const guard = (event: Event) => {
      if (!isDirty()) return;
      preserveDraft();
      if (!window.confirm("Data Center 還有未同步的修改。離開後保留本機草稿，確定離開？")) event.preventDefault();
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (!isDirty()) return;
      preserveDraft(); event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("workspace-before-navigate", guard);
    window.addEventListener("beforeunload", unload);
    return () => { window.removeEventListener("workspace-before-navigate", guard); window.removeEventListener("beforeunload", unload); };
  }, [isDirty, preserveDraft]);

  const selectProject = useCallback((projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    if (projectId === selectedProjectIdRef.current) return;
    if (isDirty()) {
      preserveDraft();
      if (!window.confirm("目前專案還有未同步修改，切換後將保留本機草稿。確定切換？")) return;
    }
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    selectedProjectIdRef.current = projectId;
    setSelectedProjectId(projectId);
    window.localStorage.setItem(`${SELECTED_PROJECT_KEY}:${userId}`, projectId);
    lastSavedRef.current = "";
    applyProject(project);
  }, [applyProject, isDirty, preserveDraft, projects, userId]);

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
    preserveDraft();
    setProjects((items) => [...items, project]);
    setSelectedProjectId(project.id);
    selectedProjectIdRef.current = project.id;
    versionRef.current = project.updatedAt;
    draftBaseRef.current = project.updatedAt;
    window.localStorage.setItem(`${SELECTED_PROJECT_KEY}:${userId}`, project.id);
    lastSavedRef.current = semanticJson(currentDocument);
    readyRef.current = true;
    setSyncState("synced");
    return project;
  }, [canEdit, currentDocument, preserveDraft, userId]);

  const updateProject = useCallback(async (projectId: string, name: string, category: string, description: string) => {
    if (!canEdit || !userId) throw new Error("沒有修改 Data Center 專案的權限");
    const generation = generationRef.current;
    const { data, error } = await supabase
      .from("data_center_projects")
      .update({ name: name.trim(), category: category.trim() || "未分類", description: description.trim(), updated_by: userId })
      .eq("id", projectId)
      .select("id,project_key,name,category,description,document,updated_at,updated_by").single();
    if (error) throw error;
    if (generation !== generationRef.current) return;
    const project = mapProject(data);
    setProjects((items) => items.map((item) => item.id === projectId ? project : item));
    if (selectedProjectIdRef.current === projectId && semanticJson(parseDocument(project.document)) === lastSavedRef.current) {
      versionRef.current = project.updatedAt;
      if (readyRef.current) draftBaseRef.current = project.updatedAt;
      setSaveRevision((value) => value + 1);
    }
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
    retry: () => {
      if (isDirty()) {
        preserveDraft();
        if (!window.confirm("重試將以最新共用版本取代目前草稿。請先另存需要保留的修改，確定重新載入？")) return;
        const key = draftKey(selectedProjectIdRef.current);
        const draft = window.localStorage.getItem(key);
        if (draft) window.localStorage.setItem(`${key}:before-reload:${Date.now()}`, draft);
        window.localStorage.setItem(key, "");
        lastSavedRef.current = "";
      }
      void loadProjects();
    },
  };
}
