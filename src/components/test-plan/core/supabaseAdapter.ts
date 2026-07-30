import { SUPABASE_URL, supabase } from "@/integrations/supabase/client";
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/integrations/supabase/types";

import type {
  TestPlanFileRecord,
  TestPlanFolder,
  TestPlanSpace,
} from "../types";
import { toTestPlanError } from "./errors";
import type { TestPlanDataAdapter } from "./repository";

export const TEST_PLAN_STORAGE_BUCKET = "test-plan-files";
const RESUMABLE_UPLOAD_THRESHOLD = 6 * 1024 * 1024;
const RESUMABLE_UPLOAD_CHUNK_SIZE = 6 * 1024 * 1024;

type SpaceRow = Tables<"test_plan_spaces">;
type FolderRow = Tables<"test_plan_folders">;
type FileRow = Tables<"test_plan_files">;

function mapSpace(row: SpaceRow): TestPlanSpace {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFolder(row: FolderRow): TestPlanFolder {
  return {
    id: row.id,
    spaceId: row.space_id,
    parentId: row.parent_id,
    name: row.name,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFile(row: FileRow): TestPlanFileRecord {
  return {
    id: row.id,
    spaceId: row.space_id,
    folderId: row.folder_id,
    originalName: row.original_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    extension: row.extension,
    category: row.category as TestPlanFileRecord["category"],
    fileSize: row.file_size,
    description: row.description,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function throwIfError(error: unknown): void {
  if (error) throw toTestPlanError(error);
}

function assertDeleted(
  data: { id: string } | null,
  entityLabel: string,
): void {
  if (!data) {
    throw new Error(`${entityLabel}不存在，或你沒有刪除權限。`);
  }
}

async function uploadLargeObject(
  path: string,
  file: File,
  onProgress?: (uploadedBytes: number, totalBytes: number) => void,
) {
  const sessionResult = await supabase.auth.getSession();
  const accessToken = sessionResult.data.session?.access_token;
  if (sessionResult.error || !accessToken) {
    throw new Error("大型檔案上傳需要有效的安全登入工作階段。");
  }

  const endpoint = `${SUPABASE_URL}/storage/v1/upload/resumable`;
  const retryDelays = [0, 1000, 3000, 5000, 10000, 20000];
  const resumeKey = `test-plan-tus:${path}`;
  const commonHeaders = {
    authorization: `Bearer ${accessToken}`,
    "Tus-Resumable": "1.0.0",
  };
  const encodeMetadata = (value: string) => {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  };
  const readOffset = (response: Response) => {
    const offset = Number(response.headers.get("Upload-Offset"));
    return Number.isFinite(offset) && offset >= 0 ? offset : 0;
  };
  const inspectUpload = async (uploadUrl: string) => {
    const response = await fetch(uploadUrl, {
      method: "HEAD",
      headers: commonHeaders,
    });
    if (!response.ok) throw new Error(`上傳續傳狀態讀取失敗（${response.status}）。`);
    return readOffset(response);
  };

  let uploadUrl = window.localStorage.getItem(resumeKey) ?? "";
  let offset = 0;
  if (uploadUrl) {
    try {
      offset = await inspectUpload(uploadUrl);
    } catch {
      window.localStorage.removeItem(resumeKey);
      uploadUrl = "";
    }
  }

  if (!uploadUrl) {
    const metadata = {
      bucketName: TEST_PLAN_STORAGE_BUCKET,
      objectName: path,
      contentType: file.type || "application/octet-stream",
      cacheControl: "3600",
    };
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...commonHeaders,
        "Upload-Length": String(file.size),
        "Upload-Metadata": Object.entries(metadata)
          .map(([key, value]) => `${key} ${encodeMetadata(value)}`)
          .join(","),
        "x-upsert": "false",
      },
    });
    if (!response.ok) {
      throw new Error(`大型檔案上傳初始化失敗（${response.status}）。`);
    }
    const location = response.headers.get("Location");
    if (!location) throw new Error("大型檔案上傳未回傳續傳位置。");
    uploadUrl = new URL(location, endpoint).toString();
    window.localStorage.setItem(resumeKey, uploadUrl);
  }

  onProgress?.(offset, file.size);
  while (offset < file.size) {
    const chunkEnd = Math.min(offset + RESUMABLE_UPLOAD_CHUNK_SIZE, file.size);
    let uploaded = false;
    let lastError: unknown = null;
    for (const delay of retryDelays) {
      if (delay > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, delay));
      }
      try {
        const response = await fetch(uploadUrl, {
          method: "PATCH",
          headers: {
            ...commonHeaders,
            "Content-Type": "application/offset+octet-stream",
            "Upload-Offset": String(offset),
          },
          body: file.slice(offset, chunkEnd),
        });
        if (response.ok) {
          offset = Math.max(readOffset(response), chunkEnd);
          uploaded = true;
          break;
        }
        if (response.status !== 409 && response.status < 500) {
          throw new Error(`大型檔案上傳失敗（${response.status}）。`);
        }
        offset = await inspectUpload(uploadUrl);
        if (offset >= chunkEnd) {
          uploaded = true;
          break;
        }
      } catch (error) {
        lastError = error;
        try {
          const remoteOffset = await inspectUpload(uploadUrl);
          if (remoteOffset > offset) offset = remoteOffset;
          if (offset >= chunkEnd) {
            uploaded = true;
            break;
          }
        } catch {
          // Keep the upload URL and retry the same chunk with backoff.
        }
      }
    }
    if (!uploaded) {
      throw lastError instanceof Error
        ? lastError
        : new Error("大型檔案上傳中斷，可再次上傳以續傳。");
    }
    onProgress?.(offset, file.size);
  }

  window.localStorage.removeItem(resumeKey);
}

export function createSupabaseTestPlanAdapter(): TestPlanDataAdapter {
  return {
    async listSpaces(ownerId) {
      const { data, error } = await supabase
        .from("test_plan_spaces")
        .select("*")
        .eq("owner_id", ownerId)
        .order("updated_at", { ascending: false });
      throwIfError(error);
      return (data ?? []).map(mapSpace);
    },
    async listFolders(spaceId) {
      const { data, error } = await supabase
        .from("test_plan_folders")
        .select("*")
        .eq("space_id", spaceId)
        .order("name", { ascending: true });
      throwIfError(error);
      return (data ?? []).map(mapFolder);
    },
    async listFiles(spaceId) {
      const { data, error } = await supabase
        .from("test_plan_files")
        .select("*")
        .eq("space_id", spaceId)
        .order("updated_at", { ascending: false });
      throwIfError(error);
      return (data ?? []).map(mapFile);
    },
    async createSpace(input) {
      const payload: TablesInsert<"test_plan_spaces"> = {
        owner_id: input.ownerId,
        name: input.name,
        description: input.description,
        color: input.color,
      };
      const { data, error } = await supabase
        .from("test_plan_spaces")
        .insert(payload)
        .select()
        .single();
      throwIfError(error);
      return mapSpace(data);
    },
    async updateSpace(spaceId, ownerId, patch) {
      const payload: TablesUpdate<"test_plan_spaces"> = {
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.description === undefined
          ? {}
          : { description: patch.description }),
        ...(patch.color === undefined ? {} : { color: patch.color }),
      };
      const { data, error } = await supabase
        .from("test_plan_spaces")
        .update(payload)
        .eq("id", spaceId)
        .eq("owner_id", ownerId)
        .select()
        .single();
      throwIfError(error);
      return mapSpace(data);
    },
    async deleteSpace(spaceId, ownerId) {
      const { data, error } = await supabase
        .from("test_plan_spaces")
        .delete()
        .eq("id", spaceId)
        .eq("owner_id", ownerId)
        .select("id")
        .maybeSingle();
      throwIfError(error);
      assertDeleted(data, "資料空間");
    },
    async createFolder(input) {
      const payload: TablesInsert<"test_plan_folders"> = {
        space_id: input.spaceId,
        parent_id: input.parentId,
        name: input.name,
        created_by: input.createdBy,
      };
      const { data, error } = await supabase
        .from("test_plan_folders")
        .insert(payload)
        .select()
        .single();
      throwIfError(error);
      return mapFolder(data);
    },
    async updateFolder(folderId, patch) {
      const payload: TablesUpdate<"test_plan_folders"> = {
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.parentId === undefined ? {} : { parent_id: patch.parentId }),
      };
      const { data, error } = await supabase
        .from("test_plan_folders")
        .update(payload)
        .eq("id", folderId)
        .select()
        .maybeSingle();
      throwIfError(error);
      return data ? mapFolder(data) : undefined;
    },
    async deleteFolder(folderId) {
      const { data, error } = await supabase
        .from("test_plan_folders")
        .delete()
        .eq("id", folderId)
        .select("id")
        .maybeSingle();
      throwIfError(error);
      assertDeleted(data, "資料夾");
    },
    async uploadObject(path, file, onProgress) {
      if (file.size > RESUMABLE_UPLOAD_THRESHOLD) {
        await uploadLargeObject(path, file, onProgress);
        return;
      }
      onProgress?.(0, file.size);
      const { error } = await supabase.storage
        .from(TEST_PLAN_STORAGE_BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false });
      throwIfError(error);
      onProgress?.(file.size, file.size);
    },
    async createFile(input) {
      const payload: TablesInsert<"test_plan_files"> = {
        space_id: input.spaceId,
        folder_id: input.folderId,
        original_name: input.originalName,
        storage_path: input.storagePath,
        mime_type: input.mimeType,
        extension: input.extension,
        category: input.category,
        file_size: input.fileSize,
        uploaded_by: input.uploadedBy,
      };
      const { data, error } = await supabase
        .from("test_plan_files")
        .insert(payload)
        .select()
        .single();
      throwIfError(error);
      return mapFile(data);
    },
    async updateFile(fileId, patch) {
      const payload: TablesUpdate<"test_plan_files"> = {
        ...(patch.originalName === undefined
          ? {}
          : { original_name: patch.originalName }),
        ...(patch.folderId === undefined ? {} : { folder_id: patch.folderId }),
        ...(patch.description === undefined
          ? {}
          : { description: patch.description }),
        ...(patch.extension === undefined
          ? {}
          : { extension: patch.extension }),
        ...(patch.category === undefined ? {} : { category: patch.category }),
      };
      const { data, error } = await supabase
        .from("test_plan_files")
        .update(payload)
        .eq("id", fileId)
        .select()
        .single();
      throwIfError(error);
      return mapFile(data);
    },
    async deleteFile(fileId) {
      const { data, error } = await supabase
        .from("test_plan_files")
        .delete()
        .eq("id", fileId)
        .select("id")
        .maybeSingle();
      throwIfError(error);
      assertDeleted(data, "檔案");
    },
    async downloadObject(path) {
      const { data, error } = await supabase.storage
        .from(TEST_PLAN_STORAGE_BUCKET)
        .download(path);
      throwIfError(error);
      return data;
    },
    async removeObjects(paths) {
      if (paths.length === 0) return;
      const { error } = await supabase.storage
        .from(TEST_PLAN_STORAGE_BUCKET)
        .remove([...paths]);
      throwIfError(error);
    },
    async listCleanupPaths(ownerId) {
      const { data, error } = await supabase
        .from("test_plan_storage_cleanup_queue")
        .select("storage_path")
        .eq("owner_id", ownerId)
        .order("queued_at", { ascending: true });
      throwIfError(error);
      return (data ?? []).map((row) => row.storage_path);
    },
    async queueCleanupPath(ownerId, path) {
      const payload: TablesInsert<"test_plan_storage_cleanup_queue"> = {
        owner_id: ownerId,
        storage_path: path,
        last_error: "metadata-create-cleanup",
      };
      const { error } = await supabase
        .from("test_plan_storage_cleanup_queue")
        .upsert(payload, { onConflict: "storage_path" });
      throwIfError(error);
    },
    async completeCleanupPaths(ownerId, paths) {
      if (paths.length === 0) return;
      const { error } = await supabase
        .from("test_plan_storage_cleanup_queue")
        .delete()
        .eq("owner_id", ownerId)
        .in("storage_path", paths);
      throwIfError(error);
    },
  };
}
