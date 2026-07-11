import { useCallback, useEffect, useMemo, useState } from "react";

import { useUser } from "@/components/auth/UserContext";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type TestFlowVersion = Tables<"test_flow_versions">;

function isUuid(value?: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );
}

function updateFlowVersionQuery(versionId: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (versionId) url.searchParams.set("flowVersion", versionId);
  else url.searchParams.delete("flowVersion");
  window.history.replaceState({}, "", url);
}

export function useFlowVersions() {
  const { user } = useUser();
  const {
    activeProject,
    activeProjectId,
    refreshProjects,
  } = useTestProject();
  const { toast } = useToast();
  const [versions, setVersions] = useState<TestFlowVersion[]>([]);
  const [selectedVersionId, setSelectedVersionIdState] = useState<string | null>(
    null
  );
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [isMutatingVersion, setIsMutatingVersion] = useState(false);

  const refreshVersions = useCallback(async () => {
    if (!activeProjectId) {
      setVersions([]);
      setSelectedVersionIdState(null);
      return;
    }

    setIsLoadingVersions(true);
    const { data, error } = await supabase
      .from("test_flow_versions")
      .select("*")
      .eq("project_id", activeProjectId)
      .order("version_number", { ascending: false });

    if (error) {
      // Keep the workspace usable before an additive migration reaches production.
      console.info("Flow versions are unavailable until the migration is applied.");
      setVersions([]);
      setSelectedVersionIdState(activeProject?.active_flow_version_id ?? null);
      setIsLoadingVersions(false);
      return;
    }

    const nextVersions = data ?? [];
    setVersions(nextVersions);

    const urlVersionId =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("flowVersion")
        : null;
    const preferredVersionId =
      (urlVersionId && nextVersions.some((version) => version.id === urlVersionId)
        ? urlVersionId
        : null) ??
      activeProject?.active_flow_version_id ??
      nextVersions.find((version) => version.status === "draft")?.id ??
      nextVersions[0]?.id ??
      null;

    setSelectedVersionIdState(preferredVersionId);
    updateFlowVersionQuery(preferredVersionId);
    setIsLoadingVersions(false);
  }, [activeProject?.active_flow_version_id, activeProjectId]);

  useEffect(() => {
    refreshVersions();

    if (!activeProjectId) return;
    const channel = supabase
      .channel(`maintenance_flow_versions:${activeProjectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `project_id=eq.${activeProjectId}`,
          schema: "public",
          table: "test_flow_versions",
        },
        refreshVersions
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeProjectId, refreshVersions]);

  const activeVersion = useMemo(
    () =>
      versions.find((version) => version.id === activeProject?.active_flow_version_id) ??
      versions.find((version) => version.status === "published") ??
      null,
    [activeProject?.active_flow_version_id, versions]
  );
  const draftVersion = useMemo(
    () => versions.find((version) => version.status === "draft") ?? null,
    [versions]
  );
  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? activeVersion,
    [activeVersion, selectedVersionId, versions]
  );

  const setSelectedVersionId = useCallback((versionId: string) => {
    setSelectedVersionIdState(versionId);
    updateFlowVersionQuery(versionId);
  }, []);

  const createDraft = useCallback(async () => {
    if (!activeProjectId) return null;
    setIsMutatingVersion(true);

    const { data, error } = await supabase.rpc("create_test_flow_draft", {
      p_created_by: isUuid(user?.userId) ? user?.userId : null,
      p_project_id: activeProjectId,
    });
    setIsMutatingVersion(false);

    if (error) {
      toast({
        title: "無法建立草稿",
        description: "請確認流程版本 migration 已套用後再試。",
        variant: "destructive",
      });
      return null;
    }

    await refreshVersions();
    setSelectedVersionId(data.id);
    return data;
  }, [activeProjectId, refreshVersions, setSelectedVersionId, toast, user?.userId]);

  const publishDraft = useCallback(async () => {
    if (!activeProjectId || !draftVersion) return false;
    setIsMutatingVersion(true);
    const { data, error } = await supabase.rpc("publish_test_flow_version", {
      p_project_id: activeProjectId,
      p_version_id: draftVersion.id,
    });
    setIsMutatingVersion(false);

    if (error) {
      toast({
        title: "流程發布失敗",
        description: error.message || "請先修正流程驗證問題。",
        variant: "destructive",
      });
      return false;
    }

    await refreshProjects();
    await refreshVersions();
    setSelectedVersionId(data.id);
    toast({
      title: `${data.label || `v${data.version_number}`} 已發布`,
      description: "未開始機台已切換新版，進行中機台保留原流程。",
    });
    return true;
  }, [
    activeProjectId,
    draftVersion,
    refreshProjects,
    refreshVersions,
    setSelectedVersionId,
    toast,
  ]);

  const discardDraft = useCallback(async () => {
    if (!activeProjectId || !draftVersion) return false;
    setIsMutatingVersion(true);
    const { data, error } = await supabase.rpc("discard_test_flow_draft", {
      p_project_id: activeProjectId,
    });
    setIsMutatingVersion(false);

    if (error || !data) {
      toast({
        title: "無法放棄草稿",
        description: error?.message || "目前沒有可放棄的草稿。",
        variant: "destructive",
      });
      return false;
    }

    await refreshVersions();
    if (activeVersion) setSelectedVersionId(activeVersion.id);
    toast({ title: "草稿已放棄", description: "已發布版本未受影響。" });
    return true;
  }, [
    activeProjectId,
    activeVersion,
    draftVersion,
    refreshVersions,
    setSelectedVersionId,
    toast,
  ]);

  return {
    activeVersion,
    createDraft,
    discardDraft,
    draftVersion,
    isLoadingVersions,
    isMutatingVersion,
    publishDraft,
    refreshVersions,
    selectedVersion,
    selectedVersionId,
    setSelectedVersionId,
    versions,
  };
}
