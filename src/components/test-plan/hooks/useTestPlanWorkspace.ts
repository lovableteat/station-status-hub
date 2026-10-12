import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useUser } from "@/components/auth/UserContext";
import { usePermissions } from "@/hooks/usePermissions";

import {
  createTestPlanRepository,
  type TestPlanRepository,
} from "../core/repository";
import { createSupabaseTestPlanAdapter } from "../core/supabaseAdapter";
import type {
  TestPlanFileRecord,
  TestPlanFolder,
  TestPlanSpace,
} from "../types";
import {
  getTestPlanErrorMessage,
  toTestPlanError,
} from "../core/errors";
import { validateTestPlanFolderPaths } from "../core/files";

interface UploadProgress {
  completed: number;
  total: number;
  uploadedBytes: number;
  totalBytes: number;
  currentFileName: string;
}

interface UseTestPlanWorkspaceOptions {
  repository?: TestPlanRepository;
}

const AUTHENTICATED_SESSION_REQUIRED =
  "資料儲存需要安全登入工作階段，請登出後重新登入。";

export function useTestPlanWorkspace(
  options: UseTestPlanWorkspaceOptions = {},
) {
  const { user, sessionMode } = useUser();
  const { canEditModule } = usePermissions();
  const repository = useMemo(
    () =>
      options.repository
      ?? createTestPlanRepository(createSupabaseTestPlanAdapter()),
    [options.repository],
  );
  const isAuthenticated = sessionMode === "authenticated";
  const ownerId = isAuthenticated ? user?.userId ?? null : null;
  const canEdit = isAuthenticated && canEditModule("test-plan");
  const [spaces, setSpaces] = useState<TestPlanSpace[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [folders, setFolders] = useState<TestPlanFolder[]>([]);
  const [files, setFiles] = useState<TestPlanFileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
    null,
  );
  const requestIdRef = useRef(0);
  const mutationInFlightRef = useRef(false);
  const activeSpaceIdRef = useRef<string | null>(activeSpaceId);
  const ownerIdRef = useRef<string | null>(ownerId);
  activeSpaceIdRef.current = activeSpaceId;
  ownerIdRef.current = ownerId;

  const requireEdit = useCallback(() => {
    if (!isAuthenticated) {
      throw new Error(AUTHENTICATED_SESSION_REQUIRED);
    }
    if (!canEdit) {
      throw new Error("目前為唯讀模式，無法修改資料儲存。");
    }
  }, [canEdit, isAuthenticated]);

  const applyWorkspace = useCallback(
    (workspace: Awaited<ReturnType<TestPlanRepository["loadWorkspace"]>>) => {
      setSpaces(workspace.spaces);
      setActiveSpaceId(workspace.activeSpaceId);
      setFolders(workspace.folders);
      setFiles(workspace.files);
    },
    [],
  );

  const refreshWorkspace = useCallback(
    async (preferredSpaceId?: string | null) => {
      const requestId = ++requestIdRef.current;
      if (!ownerId) {
        applyWorkspace({
          spaces: [],
          activeSpaceId: null,
          folders: [],
          files: [],
        });
        setError(
          !ownerId && user
            ? AUTHENTICATED_SESSION_REQUIRED
            : null,
        );
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const workspace = await repository.loadWorkspace(
          ownerId,
          null,
          preferredSpaceId === undefined ? activeSpaceId : preferredSpaceId,
        );
        if (requestId === requestIdRef.current) applyWorkspace(workspace);
      } catch (caught) {
        if (requestId === requestIdRef.current) {
          setError(getTestPlanErrorMessage(caught, "資料儲存載入失敗。"));
        }
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [activeSpaceId, applyWorkspace, ownerId, repository, user],
  );

  useEffect(() => {
    void refreshWorkspace(null);
  }, [ownerId, repository]); // eslint-disable-line react-hooks/exhaustive-deps

  const openSpace = useCallback(
    async (spaceId: string | null) => {
      if (mutationInFlightRef.current) {
        setError("目前正在處理檔案，完成後才能切換空間。");
        return;
      }
      if (spaceId === null) { await refreshWorkspace(null); return; }
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const space = await repository.loadSpace(spaceId);
        if (requestId !== requestIdRef.current) return;
        setActiveSpaceId(spaceId);
        setFolders(space.folders);
        setFiles(space.files);
      } catch (caught) {
        if (requestId === requestIdRef.current) {
          setError(getTestPlanErrorMessage(caught, "空間載入失敗。"));
        }
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [repository, refreshWorkspace],
  );

  const runMutation = useCallback(
    async <T,>(operation: () => Promise<T>): Promise<T> => {
      requireEdit();
      if (mutationInFlightRef.current) {
        throw new Error("已有資料儲存操作進行中，請稍候再試。");
      }
      mutationInFlightRef.current = true;
      setBusy(true);
      setError(null);
      try {
        return await operation();
      } catch (caught) {
        const normalizedError = toTestPlanError(
          caught,
          "操作失敗，請稍後重試。",
        );
        setError(normalizedError.message);
        throw normalizedError;
      } finally {
        mutationInFlightRef.current = false;
        setBusy(false);
      }
    },
    [requireEdit],
  );

  const refreshActiveSpace = useCallback(async (
    expectedSpaceId: string | null,
    expectedOwnerId: string | null,
  ) => {
    if (!expectedOwnerId) return;
    const requestId = ++requestIdRef.current;
    const library = expectedSpaceId === null ? await repository.loadWorkspace(expectedOwnerId, null, null) : null;
    const space = library ?? await repository.loadSpace(expectedSpaceId!);
    if (
      requestId !== requestIdRef.current
      || activeSpaceIdRef.current !== expectedSpaceId
      || ownerIdRef.current !== expectedOwnerId
    ) {
      return;
    }
    if (library) applyWorkspace(library);
    else { setFolders(space.folders); setFiles(space.files); }
  }, [applyWorkspace, repository]);

  const createSpace = useCallback(
    (input: { name: string; description?: string; color?: string }) =>
      runMutation(async () => {
        if (!ownerId) throw new Error("請先登入再建立空間。");
        const created = await repository.createSpace(ownerId, null, input);
        await refreshWorkspace(created.id);
        return created;
      }),
    [ownerId, refreshWorkspace, repository, runMutation],
  );

  const updateSpace = useCallback(
    (
      spaceId: string,
      patch: Partial<Pick<TestPlanSpace, "name" | "description" | "color">>,
    ) =>
      runMutation(async () => {
        if (!ownerId) throw new Error("請先登入再編輯空間。");
        const space = spaces.find(candidate => candidate.id === spaceId);
        if (!space) throw new Error("資料空間不存在，請重新整理後再試。");
        const updated = await repository.updateSpace(ownerId, spaceId, space.projectId, patch);
        await refreshWorkspace(spaceId);
        return updated;
      }),
    [ownerId, refreshWorkspace, repository, runMutation, spaces],
  );

  const deleteSpace = useCallback(
    (spaceId: string) =>
      runMutation(async () => {
        if (!ownerId) throw new Error("請先登入再刪除空間。");
        const space = spaces.find(candidate => candidate.id === spaceId);
        if (!space) throw new Error("資料空間不存在，請重新整理後再試。");
        await repository.deleteSpace(ownerId, spaceId, space.projectId);
        await refreshWorkspace(null);
      }),
    [ownerId, refreshWorkspace, repository, runMutation, spaces],
  );

  const ensureUploadSpace = useCallback(async (requestedSpaceId = activeSpaceId) => {
    if (!ownerId) throw new Error("請先登入再上傳檔案。");
    if (requestedSpaceId) {
      const selected = spaces.find(space => space.id === requestedSpaceId);
      if (!selected) throw new Error("資料空間不存在，請重新整理後再試。");
      return selected;
    }
    const common = spaces.find(space => space.projectId === null && space.name === "共用檔案");
    if (common) return common;
    const created = await repository.createSpace(ownerId, null, { name: "共用檔案" });
    setSpaces(current => [...current, created]);
    return created;
  }, [activeSpaceId, ownerId, repository, spaces]);

  const createFolder = useCallback(
    (parentId: string | null, name: string) =>
      runMutation(async () => {
        if (!ownerId) throw new Error("請先登入再建立資料夾。");
        const targetSpace = await ensureUploadSpace();
        const created = await repository.createFolder(ownerId, targetSpace.id, parentId, name);
        await refreshActiveSpace(activeSpaceId, ownerId);
        return created;
      }),
    [activeSpaceId, ensureUploadSpace, ownerId, refreshActiveSpace, repository, runMutation],
  );

  const renameFolder = useCallback(
    (folderId: string, name: string) =>
      runMutation(async () => {
        const updated = await repository.renameFolder(folderId, name);
        await refreshActiveSpace(activeSpaceId, ownerId);
        return updated;
      }),
    [activeSpaceId, ownerId, refreshActiveSpace, repository, runMutation],
  );

  const moveFolder = useCallback(
    (folderId: string, parentId: string | null) =>
      runMutation(async () => {
        const updated = await repository.moveFolder(
          folderId,
          parentId,
          folders,
        );
        await refreshActiveSpace(activeSpaceId, ownerId);
        return updated;
      }),
    [activeSpaceId, folders, ownerId, refreshActiveSpace, repository, runMutation],
  );

  const deleteFolder = useCallback(
    (folderId: string) =>
      runMutation(async () => {
        if (!ownerId) throw new Error("請先登入再刪除資料夾。");
        await repository.deleteFolder(ownerId, folderId);
        await refreshActiveSpace(activeSpaceId, ownerId);
      }),
    [activeSpaceId, ownerId, refreshActiveSpace, repository, runMutation],
  );

  const uploadFiles = useCallback(
    (folderId: string | null, incoming: readonly File[], options: { preservePaths?: boolean; spaceId?: string | null } = {}) =>
      runMutation(async () => {
        if (!ownerId) throw new Error("請先登入再上傳檔案。");
        if (options.preservePaths) validateTestPlanFolderPaths(incoming);
        const space = await ensureUploadSpace(options.spaceId === undefined ? activeSpaceId : options.spaceId);
        setUploadProgress({
          completed: 0,
          total: incoming.length,
          uploadedBytes: 0,
          totalBytes: incoming.reduce((total, file) => total + file.size, 0),
          currentFileName: incoming[0]?.webkitRelativePath || incoming[0]?.name || "",
        });
        try {
          const result = await repository.uploadFiles({
            ownerId,
            projectId: space.projectId,
            spaceId: space.id,
            folderId,
            files: incoming,
            preservePaths: options.preservePaths,
            onProgress: setUploadProgress,
          });
          try {
            await refreshActiveSpace(activeSpaceId, ownerId);
          } catch (caught) {
            setError(getTestPlanErrorMessage(caught, "上傳結果已儲存，但清單更新失敗，請重新整理。"));
          }
          return { ...result, spaceId: space.id };
        } finally {
          setUploadProgress(null);
        }
      }),
    [activeSpaceId, ensureUploadSpace, ownerId, refreshActiveSpace, repository, runMutation],
  );

  const renameFile = useCallback(
    (fileId: string, name: string) =>
      runMutation(async () => {
        const updated = await repository.renameFile(fileId, name);
        await refreshActiveSpace(activeSpaceId, ownerId);
        return updated;
      }),
    [activeSpaceId, ownerId, refreshActiveSpace, repository, runMutation],
  );

  const moveFile = useCallback(
    (fileId: string, folderId: string | null) =>
      runMutation(async () => {
        const updated = await repository.moveFile(fileId, folderId);
        await refreshActiveSpace(activeSpaceId, ownerId);
        return updated;
      }),
    [activeSpaceId, ownerId, refreshActiveSpace, repository, runMutation],
  );

  const updateFileDescription = useCallback(
    (fileId: string, description: string) =>
      runMutation(async () => {
        const updated = await repository.updateFileDescription(
          fileId,
          description,
        );
        await refreshActiveSpace(activeSpaceId, ownerId);
        return updated;
      }),
    [activeSpaceId, ownerId, refreshActiveSpace, repository, runMutation],
  );

  const deleteFile = useCallback(
    (file: TestPlanFileRecord) =>
      runMutation(async () => {
        if (!ownerId) throw new Error("請先登入再刪除檔案。");
        await repository.deleteFile(ownerId, file);
        await refreshActiveSpace(activeSpaceId, ownerId);
      }),
    [activeSpaceId, ownerId, refreshActiveSpace, repository, runMutation],
  );

  const downloadFile = useCallback(
    async (file: TestPlanFileRecord) => repository.downloadFile(file),
    [repository],
  );

  const replaceFileContents = useCallback(
    (file: TestPlanFileRecord, contents: Blob) =>
      runMutation(async () => {
        const updated = await repository.replaceFileContents(file, contents);
        await refreshActiveSpace(activeSpaceId, ownerId);
        return updated;
      }),
    [activeSpaceId, ownerId, refreshActiveSpace, repository, runMutation],
  );

  return {
    spaces,
    activeSpaceId,
    activeSpace:
      spaces.find((space) => space.id === activeSpaceId) ?? null,
    folders,
    files,
    loading,
    busy,
    error,
    uploadProgress,
    canEdit,
    isAuthenticated,
    openSpace,
    refreshWorkspace,
    createSpace,
    updateSpace,
    deleteSpace,
    createFolder,
    renameFolder,
    moveFolder,
    deleteFolder,
    uploadFiles,
    renameFile,
    moveFile,
    updateFileDescription,
    deleteFile,
    downloadFile,
    replaceFileContents,
  };
}
