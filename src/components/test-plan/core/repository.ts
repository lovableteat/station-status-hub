import {
  buildStoragePath,
  classifyTestPlanFile,
  getTestPlanFileExtension,
  validateTestPlanFileName,
  validateTestPlanFolderPaths,
  validateTestPlanUpload,
} from "./files.ts";
import { isFolderDescendant } from "./tree.ts";
import type {
  TestPlanFileRecord,
  TestPlanFolder,
  TestPlanSpace,
} from "../types.ts";

export interface TestPlanDataAdapter {
  listSpaces(projectId?: string | null): Promise<TestPlanSpace[]>;
  listFolders(spaceId?: string): Promise<TestPlanFolder[]>;
  listFiles(spaceId?: string): Promise<TestPlanFileRecord[]>;
  createSpace(input: {
    ownerId: string;
    projectId: string | null;
    name: string;
    description: string | null;
    color: string;
  }): Promise<TestPlanSpace>;
  updateSpace(
    spaceId: string,
    ownerId: string,
    projectId: string | null,
    patch: Partial<Pick<TestPlanSpace, "name" | "description" | "color">>,
  ): Promise<TestPlanSpace>;
  deleteSpace(spaceId: string, ownerId: string, projectId: string | null): Promise<void>;
  createFolder(input: {
    spaceId: string;
    parentId: string | null;
    name: string;
    createdBy: string;
  }): Promise<TestPlanFolder>;
  updateFolder(
    folderId: string,
    patch: Partial<Pick<TestPlanFolder, "name" | "parentId">>,
  ): Promise<TestPlanFolder | undefined>;
  deleteFolder(folderId: string): Promise<void>;
  uploadObject(
    path: string,
    file: File,
    onProgress?: (uploadedBytes: number, totalBytes: number) => void,
  ): Promise<void>;
  completeObjectUpload(path: string): void;
  findFileByStoragePath(path: string): Promise<TestPlanFileRecord | undefined>;
  replaceObject(path: string, file: File): Promise<void>;
  createFile(input: {
    spaceId: string;
    folderId: string | null;
    originalName: string;
    storagePath: string;
    mimeType: string | null;
    extension: string;
    category: TestPlanFileRecord["category"];
    fileSize: number;
    uploadedBy: string;
  }): Promise<TestPlanFileRecord>;
  updateFile(
    fileId: string,
    patch: Partial<
      Pick<
        TestPlanFileRecord,
        | "originalName"
        | "folderId"
        | "description"
        | "extension"
        | "category"
        | "mimeType"
        | "fileSize"
      >
    >,
  ): Promise<TestPlanFileRecord>;
  deleteFile(fileId: string): Promise<void>;
  downloadObject(path: string): Promise<Blob>;
  /** Short-lived direct link (for drag-to-desktop); adapters without one fall back to a blob download. */
  createDownloadUrl?(path: string, fileName: string): Promise<string>;
  removeObjects(paths: string[]): Promise<void>;
  listCleanupPaths(ownerId: string): Promise<string[]>;
  queueCleanupPath(ownerId: string, path: string): Promise<void>;
  completeCleanupPaths(ownerId: string, paths: string[]): Promise<void>;
}

async function flushCleanupQueue(
  adapter: TestPlanDataAdapter,
  ownerId: string,
): Promise<void> {
  const paths = await adapter.listCleanupPaths(ownerId);
  for (let index = 0; index < paths.length; index += 100) {
    const chunk = paths.slice(index, index + 100);
    await adapter.removeObjects(chunk);
    await adapter.completeCleanupPaths(ownerId, chunk);
  }
}

export interface TestPlanDeleteResult {
  cleanupPending: boolean;
}

// shortcut: Retry paths require the original File; add a persisted manifest if reload recovery is needed.
const pendingUploads = new WeakMap<File, Map<string, { storagePath: string; objectUploaded: boolean }>>();

async function finishDeletedItemCleanup(
  adapter: TestPlanDataAdapter,
  ownerId: string,
): Promise<TestPlanDeleteResult> {
  try {
    await flushCleanupQueue(adapter, ownerId);
    return { cleanupPending: false };
  } catch {
    // Metadata deletion has committed. Keep the durable queue for a later
    // retry and let the caller refresh the list instead of reporting failure.
    return { cleanupPending: true };
  }
}

export function createTestPlanRepository(adapter: TestPlanDataAdapter) {
  return {
    listSpaces(projectId: string | null = null) {
      return adapter.listSpaces(projectId);
    },
    async loadWorkspace(
      ownerId: string,
      projectId: string | null,
      preferredSpaceId?: string | null,
    ) {
      try {
        await flushCleanupQueue(adapter, ownerId);
      } catch (cleanupError) {
        console.warn("Test_Plan 延後清理仍待重試。", cleanupError);
      }
      const spaces = await adapter.listSpaces(projectId);
      const activeSpaceId = spaces.some((space) => space.id === preferredSpaceId)
        ? preferredSpaceId!
        : projectId === null ? null : spaces[0]?.id ?? null;
      const [folders, files] = activeSpaceId
        ? await Promise.all([
          adapter.listFolders(activeSpaceId),
          adapter.listFiles(activeSpaceId),
        ])
        : projectId === null
          ? await Promise.all([adapter.listFolders(), adapter.listFiles()])
          : [[], []];
      return { spaces, activeSpaceId, folders, files };
    },
    async loadSpace(spaceId: string) {
      const [folders, files] = await Promise.all([
        adapter.listFolders(spaceId),
        adapter.listFiles(spaceId),
      ]);
      return { folders, files };
    },
    createSpace(
      ownerId: string,
      projectId: string | null,
      input: { name: string; description?: string; color?: string },
    ) {
      return adapter.createSpace({
        ownerId,
        projectId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        color: input.color ?? "#4c8dff",
      });
    },
    updateSpace: (
      ownerId: string,
      spaceId: string,
      projectId: string | null,
      patch: Partial<Pick<TestPlanSpace, "name" | "description" | "color">>,
    ) => adapter.updateSpace(spaceId, ownerId, projectId, {
      ...patch,
      ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
    }),
    createFolder(
      ownerId: string,
      spaceId: string,
      parentId: string | null,
      name: string,
    ) {
      return adapter.createFolder({
        spaceId,
        parentId,
        name: name.trim(),
        createdBy: ownerId,
      });
    },
    renameFolder(folderId: string, name: string) {
      return adapter.updateFolder(folderId, { name: name.trim() });
    },
    async moveFolder(
      folderId: string,
      parentId: string | null,
      folders: readonly TestPlanFolder[],
    ) {
      if (isFolderDescendant(folders, parentId, folderId)) {
        throw new Error("資料夾不可移入自己或自己的子資料夾。");
      }
      return adapter.updateFolder(folderId, { parentId });
    },
    async uploadFiles({
      ownerId,
      projectId,
      spaceId,
      folderId,
      files,
      onProgress,
      preservePaths = false,
    }: {
      ownerId: string;
      projectId: string | null;
      spaceId: string;
      folderId: string | null;
      files: readonly File[];
      preservePaths?: boolean;
      onProgress?: (progress: {
        completed: number;
        total: number;
        uploadedBytes: number;
        totalBytes: number;
        currentFileName: string;
      }) => void;
    }) {
      const relativePaths = preservePaths ? validateTestPlanFolderPaths(files) : new Map<File, string[]>();
      const validation = validateTestPlanUpload(files, preservePaths ? files.length : undefined);
      const uploaded: TestPlanFileRecord[] = [];
      const failedFiles = files.filter(file => !validation.valid.includes(file));
      const failures = validation.errors.map((error) => ({
        fileName: error.fileName,
        message: error.message,
      }));
      let completed = failedFiles.length;
      let uploadedBytes = 0;
      const totalBytes = validation.valid.reduce(
        (total, file) => total + file.size,
        0,
      );

      const [knownFolders, knownFiles] = preservePaths && validation.valid.length > 0
        ? await Promise.all([adapter.listFolders(spaceId), adapter.listFiles(spaceId)])
        : [[], []];
      if (preservePaths && validation.valid.length > 0 && folderId && !knownFolders.some(folder => folder.id === folderId && folder.spaceId === spaceId)) {
        throw new Error("目標資料夾不存在或不屬於此空間，請重新整理後再試。");
      }

      for (const file of validation.valid) {
        const currentFileName = preservePaths ? file.webkitRelativePath : file.name;
        const scope = JSON.stringify([ownerId, projectId, spaceId, folderId, preservePaths]);
        let fileUploads = pendingUploads.get(file);
        if (!fileUploads) { fileUploads = new Map(); pendingUploads.set(file, fileUploads); }
        let pending = fileUploads.get(scope);
        if (!pending) {
          pending = { storagePath: buildStoragePath(ownerId, projectId, spaceId, file.name), objectUploaded: false };
          fileUploads.set(scope, pending);
        }
        const { storagePath } = pending;
        let targetFolderId = folderId;
        let created: TestPlanFileRecord | undefined;
        const matchesUpload = (record: TestPlanFileRecord) => record.spaceId === spaceId
          && record.folderId === targetFolderId && record.uploadedBy === ownerId
          && record.originalName === file.name && record.fileSize === file.size;
        try {
          for (const name of relativePaths.get(file)?.slice(0, -1) ?? []) {
            const sameName = (value: string) => value.toLowerCase() === name.toLowerCase();
            if (knownFiles.some(existing => existing.folderId === targetFolderId && sameName(existing.originalName))) {
              throw new Error(`已有同名檔案，無法建立資料夾：${name}`);
            }
            let folder = knownFolders.find(existing => existing.parentId === targetFolderId && sameName(existing.name));
            if (!folder) {
              folder = await adapter.createFolder({ spaceId, parentId: targetFolderId, name, createdBy: ownerId });
              knownFolders.push(folder);
            }
            targetFolderId = folder.id;
          }
          created = await adapter.findFileByStoragePath(storagePath);
          if (created) {
            if (!matchesUpload(created)) {
              created = undefined;
              throw new Error("此上傳路徑已有不同的檔案記錄，請重新選取原檔案。");
            }
            continue;
          }
          if (preservePaths && (
            knownFiles.some(existing => existing.folderId === targetFolderId && existing.originalName.toLowerCase() === file.name.toLowerCase())
            || knownFolders.some(existing => existing.parentId === targetFolderId && existing.name.toLowerCase() === file.name.toLowerCase())
          )) {
            throw new Error("目標位置已有同名檔案或資料夾，已略過以避免覆寫。");
          }
          if (!pending.objectUploaded) {
            try {
              await adapter.uploadObject(
                storagePath,
                file,
                (currentUploadedBytes) => onProgress?.({
                  completed,
                  total: files.length,
                  uploadedBytes: uploadedBytes + currentUploadedBytes,
                  totalBytes,
                  currentFileName,
                }),
              );
            } catch (error) {
              // shortcut: Empty uploads lack resumable state; use a fresh path until Storage supports them.
              if (file.size === 0) fileUploads.delete(scope);
              throw error;
            }
            pending.objectUploaded = true;
          }
          created = await adapter.createFile({
            spaceId,
            folderId: targetFolderId,
            originalName: file.name,
            storagePath,
            mimeType: file.type || null,
            extension: getTestPlanFileExtension(file.name),
            category: classifyTestPlanFile(file.name),
            fileSize: file.size,
            uploadedBy: ownerId,
          });
        } catch (error) {
          if (pending.objectUploaded) {
            try {
              const committed = await adapter.findFileByStoragePath(storagePath);
              if (committed && matchesUpload(committed)) created = committed;
            } catch {
              // An unavailable response cannot prove that metadata did not commit.
            }
          }
          if (!created) {
            failures.push({ fileName: currentFileName, message: error instanceof Error ? error.message : "上傳失敗。" });
            failedFiles.push(file);
          }
        } finally {
          if (created) {
            uploaded.push(created);
            knownFiles.push(created);
            uploadedBytes += file.size;
            adapter.completeObjectUpload(storagePath);
            fileUploads.delete(scope);
          }
          completed += 1;
          onProgress?.({
            completed,
            total: files.length,
            uploadedBytes,
            totalBytes,
            currentFileName,
          });
        }
      }
      return { uploaded, failures, failedFiles };
    },
    renameFile(fileId: string, originalName: string) {
      const name = originalName.trim();
      const validationError = validateTestPlanFileName(name);
      if (validationError) {
        throw new Error(validationError.message);
      }
      return adapter.updateFile(fileId, {
        originalName: name,
        extension: getTestPlanFileExtension(name),
        category: classifyTestPlanFile(name),
      });
    },
    moveFile(fileId: string, folderId: string | null) {
      return adapter.updateFile(fileId, { folderId });
    },
    updateFileDescription(fileId: string, description: string) {
      return adapter.updateFile(fileId, {
        description: description.trim() || null,
      });
    },
    downloadFile(file: TestPlanFileRecord) {
      return adapter.downloadObject(file.storagePath);
    },
    async getFileDownloadUrl(file: TestPlanFileRecord) {
      if (!adapter.createDownloadUrl) return null;
      return adapter.createDownloadUrl(file.storagePath, file.originalName);
    },
    async replaceFileContents(file: TestPlanFileRecord, contents: Blob) {
      const mimeType = contents.type || file.mimeType || "application/octet-stream";
      const replacement = new File([contents], file.originalName, {
        type: mimeType,
        lastModified: Date.now(),
      });
      await adapter.replaceObject(file.storagePath, replacement);
      return adapter.updateFile(file.id, {
        mimeType,
        fileSize: replacement.size,
      });
    },
    async deleteFile(ownerId: string, file: TestPlanFileRecord) {
      await adapter.deleteFile(file.id);
      return finishDeletedItemCleanup(adapter, ownerId);
    },
    async deleteFolder(
      ownerId: string,
      folderId: string,
    ) {
      await adapter.deleteFolder(folderId);
      return finishDeletedItemCleanup(adapter, ownerId);
    },
    async deleteSpace(
      ownerId: string,
      spaceId: string,
      projectId: string | null,
    ) {
      await adapter.deleteSpace(spaceId, ownerId, projectId);
      await flushCleanupQueue(adapter, ownerId);
    },
  };
}

export type TestPlanRepository = ReturnType<typeof createTestPlanRepository>;
