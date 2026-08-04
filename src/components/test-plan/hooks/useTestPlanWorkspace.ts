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
  "Test_Plan 需要安全登入工作階段，請登出後重新登入。";

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
      throw new Error("目前為唯讀模式，無法修改 Test_Plan。");
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
        setError(user ? AUTHENTICATED_SESSION_REQUIRED : null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const workspace = await repository.loadWorkspace(
          ownerId,
          preferredSpaceId ?? activeSpaceId,
        );
        if (requestId === requestIdRef.current) applyWorkspace(workspace);
      } catch (caught) {
        if (requestId === requestIdRef.current) {
          setError(getTestPlanErrorMessage(caught, "Test_Plan 載入失敗。"));
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
    async (spaceId: string) => {
      if (mutationInFlightRef.current) {
        setError("目前正在處理檔案，完成後才能切換空間。");
        return;
      }
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
    [repository],
  );

  const runMutation = useCallback(
    async <T,>(operation: () => Promise<T>): Promise<T> => {
      requireEdit();
      if (mutationInFlightRef.current) {
        throw new Error("已有 Test_Plan 操作進行中，請稍候再試。");
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
    if (!expectedSpaceId || !expectedOwnerId) return;
    const requestId = ++requestIdRef.current;
    const space = await repository.loadSpace(expectedSpaceId);
    if (
      requestId !== requestIdRef.current
      || activeSpaceIdRef.current !== expectedSpaceId
      || ownerIdRef.current !== expectedOwnerId
    ) {
      return;
    }
    setFolders(space.folders);
    setFiles(space.files);
  }, [repository]);

  const createSpace = useCallback(
    (input: { name: string; description?: string; color?: string }) =>
      runMutation(async () => {
        if (!ownerId) throw new Error("請先登入再建立空間。");
        const created = await repository.createSpace(ownerId, input);
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
        const updated = await repository.updateSpace(ownerId, spaceId, patch);
        await refreshWorkspace(spaceId);
        return updated;
      }),
    [ownerId, refreshWorkspace, repository, runMutation],
  );

  const deleteSpace = useCallback(
    (spaceId: string) =>
      runMutation(async () => {
        if (!ownerId) throw new Error("請先登入再刪除空間。");
        await repository.deleteSpace(ownerId, spaceId);
        await refreshWorkspace(null);
      }),
    [ownerId, refreshWorkspace, repository, runMutation],
  );

  const createFolder = useCallback(
    (parentId: string | null, name: string) =>
      runMutation(async () => {
        if (!ownerId || !activeSpaceId) {
          throw new Error("請先選擇一個空間。");
        }
        const created = await repository.createFolder(
          ownerId,
          activeSpaceId,
          parentId,
          name,
        );
        await refreshActiveSpace(activeSpaceId, ownerId);
        return created;
      }),
    [activeSpaceId, ownerId, refreshActiveSpace, repository, runMutation],
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
    (folderId: string | null, incoming: readonly File[]) =>
      runMutation(async () => {
        if (!ownerId || !activeSpaceId) {
          throw new Error("請先選擇一個空間。");
        }
        setUploadProgress({
          completed: 0,
          total: incoming.length,
          uploadedBytes: 0,
          totalBytes: incoming.reduce((total, file) => total + file.size, 0),
          currentFileName: incoming[0]?.name ?? "",
        });
        try {
          const result = await repository.uploadFiles({
            ownerId,
            spaceId: activeSpaceId,
            folderId,
            files: incoming,
            onProgress: setUploadProgress,
          });
          await refreshActiveSpace(activeSpaceId, ownerId);
          return result;
        } finally {
          setUploadProgress(null);
        }
      }),
    [activeSpaceId, ownerId, refreshActiveSpace, repository, runMutation],
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
