import {
  buildStoragePath,
  classifyTestPlanFile,
  getTestPlanFileExtension,
  validateTestPlanFileName,
  validateTestPlanUpload,
} from "./files.ts";
import { isFolderDescendant } from "./tree.ts";
import type {
  TestPlanFileRecord,
  TestPlanFolder,
  TestPlanSpace,
} from "../types.ts";

export interface TestPlanDataAdapter {
  listSpaces(ownerId: string): Promise<TestPlanSpace[]>;
  listFolders(spaceId: string): Promise<TestPlanFolder[]>;
  listFiles(spaceId: string): Promise<TestPlanFileRecord[]>;
  createSpace(input: {
    ownerId: string;
    name: string;
    description: string | null;
    color: string;
  }): Promise<TestPlanSpace>;
  updateSpace(
    spaceId: string,
    ownerId: string,
    patch: Partial<Pick<TestPlanSpace, "name" | "description" | "color">>,
  ): Promise<TestPlanSpace>;
  deleteSpace(spaceId: string, ownerId: string): Promise<void>;
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

export function createTestPlanRepository(adapter: TestPlanDataAdapter) {
  return {
    async loadWorkspace(ownerId: string, preferredSpaceId?: string | null) {
      try {
        await flushCleanupQueue(adapter, ownerId);
      } catch (cleanupError) {
        console.warn("Test_Plan 延後清理仍待重試。", cleanupError);
      }
      const spaces = await adapter.listSpaces(ownerId);
      const activeSpaceId = spaces.some((space) => space.id === preferredSpaceId)
        ? preferredSpaceId!
        : spaces[0]?.id ?? null;
      const [folders, files] = activeSpaceId
        ? await Promise.all([
          adapter.listFolders(activeSpaceId),
          adapter.listFiles(activeSpaceId),
        ])
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
      input: { name: string; description?: string; color?: string },
    ) {
      return adapter.createSpace({
        ownerId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        color: input.color ?? "#22d3ee",
      });
    },
    updateSpace: (
      ownerId: string,
      spaceId: string,
      patch: Partial<Pick<TestPlanSpace, "name" | "description" | "color">>,
    ) => adapter.updateSpace(spaceId, ownerId, {
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
      spaceId,
      folderId,
      files,
      onProgress,
    }: {
      ownerId: string;
      spaceId: string;
      folderId: string | null;
      files: readonly File[];
      onProgress?: (progress: {
        completed: number;
        total: number;
        uploadedBytes: number;
        totalBytes: number;
        currentFileName: string;
      }) => void;
    }) {
      const validation = validateTestPlanUpload(files);
      const uploaded: TestPlanFileRecord[] = [];
      const failures = validation.errors.map((error) => ({
        fileName: error.fileName,
        message: error.message,
      }));
      let completed = 0;
      let uploadedBytes = 0;
      const totalBytes = validation.valid.reduce(
        (total, file) => total + file.size,
        0,
      );

      for (const file of validation.valid) {
        const storagePath = buildStoragePath(ownerId, spaceId, file.name);
        let objectUploaded = false;
        try {
          await adapter.uploadObject(
            storagePath,
            file,
            (currentUploadedBytes) => onProgress?.({
              completed,
              total: validation.valid.length,
              uploadedBytes: uploadedBytes + currentUploadedBytes,
              totalBytes,
              currentFileName: file.name,
            }),
          );
          objectUploaded = true;
          uploaded.push(await adapter.createFile({
            spaceId,
            folderId,
            originalName: file.name,
            storagePath,
            mimeType: file.type || null,
            extension: getTestPlanFileExtension(file.name),
            category: classifyTestPlanFile(file.name),
            fileSize: file.size,
            uploadedBy: ownerId,
          }));
        } catch (error) {
          let cleanupQueueError: unknown = null;
          if (objectUploaded) {
            try {
              await adapter.removeObjects([storagePath]);
            } catch {
              try {
                await adapter.queueCleanupPath(ownerId, storagePath);
              } catch (queueError) {
                cleanupQueueError = queueError;
              }
            }
          }
          failures.push({
            fileName: file.name,
            message: [
              error instanceof Error ? error.message : "上傳失敗。",
              cleanupQueueError
                ? "暫存檔清理排程失敗，請聯絡管理員。"
                : "",
            ].filter(Boolean).join(" "),
          });
        } finally {
          uploadedBytes += file.size;
          completed += 1;
          onProgress?.({
            completed,
            total: validation.valid.length,
            uploadedBytes,
            totalBytes,
            currentFileName: file.name,
          });
        }
      }
      return { uploaded, failures };
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
      await flushCleanupQueue(adapter, ownerId);
    },
    async deleteFolder(
      ownerId: string,
      folderId: string,
    ) {
      await adapter.deleteFolder(folderId);
      await flushCleanupQueue(adapter, ownerId);
    },
    async deleteSpace(
      ownerId: string,
      spaceId: string,
    ) {
      await adapter.deleteSpace(spaceId, ownerId);
      await flushCleanupQueue(adapter, ownerId);
    },
  };
}

export type TestPlanRepository = ReturnType<typeof createTestPlanRepository>;
