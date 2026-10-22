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
/** Origin the drag-to-desktop proxy worker may stream from; empty when the client has no storage URL. */
export const TEST_PLAN_STORAGE_ORIGIN = (() => {
  try {
    return SUPABASE_URL ? new URL(SUPABASE_URL).origin : "";
  } catch {
    return "";
  }
})();
const RESUMABLE_UPLOAD_CHUNK_SIZE = 6 * 1024 * 1024;
const RESUMABLE_REQUEST_TIMEOUT = 120_000;

type SpaceRow = Tables<"test_plan_spaces">;
type FolderRow = Tables<"test_plan_folders">;
type FileRow = Tables<"test_plan_files">;

function mapSpace(row: SpaceRow): TestPlanSpace {
  return {
    id: row.id,
    projectId: row.project_id,
    ownerId: row.owner_id,
    isPersonal: row.is_personal,
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

function cleanupActorFilter(actorId: string): string {
  // PostgREST's OR syntax is a raw filter string; only canonical UUIDs enter it.
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(actorId)) {
    throw new Error("清理操作的帳號識別碼無效。");
  }
  return `owner_id.eq.${actorId},requested_by.eq.${actorId}`;
}

function assertDeleted(
  data: { id: string } | null,
  entityLabel: string,
): void {
  if (!data) {
    throw new Error(`${entityLabel}不存在，或你沒有刪除權限。`);
  }
}

async function uploadResumableObject(
  path: string,
  file: File,
  onProgress?: (uploadedBytes: number, totalBytes: number) => void,
) {
  const legacyOrigin = new URL(SUPABASE_URL).origin;
  const endpoint = new URL(`${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/upload/resumable`);
  if (/^[a-z0-9-]+\.supabase\.co$/i.test(endpoint.hostname)) {
    endpoint.hostname = endpoint.hostname.replace(/\.supabase\.co$/i, ".storage.supabase.co");
  }
  const retryDelays = [0, 1000, 3000, 5000, 10000, 20000];
  const resumeKey = `test-plan-tus:${path}`;
  let uploadUserId = "";
  const changedAccountError = () => Object.assign(new Error("上傳期間登入帳號已變更，請切回原帳號再續傳（401）。"), { status: 401 });
  const unconfirmedCompletionError = () => Object.assign(new Error("檔案資料已傳完，但儲存服務尚未確認完成。檔案已保留，請稍後重試；仍無法完成時請聯絡管理員。"), { status: 400 });
  const statusOf = (error: unknown) => Number((error as { status?: number } | null)?.status) || 0;
  const isTerminal = (error: unknown) => {
    const status = statusOf(error);
    return status >= 400 && status < 500 && ![408, 409, 423, 429].includes(status);
  };
  const validateUploadUrl = (value: string) => {
    const url = new URL(value, endpoint);
    if (
      ![endpoint.origin, legacyOrigin].includes(url.origin)
      || !["https:", "http:"].includes(url.protocol)
      || !url.pathname.startsWith(`${endpoint.pathname}/`)
      || url.pathname === `${endpoint.pathname}/`
      || url.username || url.password || url.search || url.hash
    ) {
      throw new Error("大型檔案上傳的續傳位置無效，請重新選取檔案。");
    }
    return url.toString();
  };
  const responseError = async (response: Response) => {
    let detail = "";
    try {
      const text = await response.text();
      try {
        const body = JSON.parse(text);
        detail = [body.code, body.error, body.message, body.details].filter(value => typeof value === "string").join("：");
      } catch {
        detail = text;
      }
    } catch {
      // The HTTP status still identifies failures with an unreadable body.
    }
    const label = response.status === 401
      ? "登入工作階段已失效"
      : response.status === 413 ? "檔案超過儲存服務允許的大小" : "大型檔案上傳失敗";
    return Object.assign(new Error(`${label}（${response.status}）${detail ? `：${detail.replace(/[\r\n\t]/g, " ").slice(0, 240)}` : "。"}`), { status: response.status });
  };
  const request = async (url: string, options: RequestInit) => {
    if (url !== endpoint.toString()) validateUploadUrl(url);
    for (let authAttempt = 0; authAttempt < 2; authAttempt += 1) {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      const userId = session.data.session?.user.id;
      if (session.error || !accessToken || !userId) {
        throw Object.assign(new Error("大型檔案上傳需要有效的安全登入工作階段（401）。"), { status: 401 });
      }
      if (uploadUserId && userId !== uploadUserId) throw changedAccountError();
      uploadUserId = userId;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), RESUMABLE_REQUEST_TIMEOUT);
      try {
        const response = await fetch(url, {
          ...options,
          redirect: "error",
          signal: controller.signal,
          headers: {
            ...options.headers,
            authorization: `Bearer ${accessToken}`,
            "Tus-Resumable": "1.0.0",
          },
        });
        if (response.status === 401 && authAttempt === 0) {
          const unauthorized = await responseError(response);
          let refreshed: Awaited<ReturnType<typeof supabase.auth.refreshSession>>;
          try {
            refreshed = await supabase.auth.refreshSession();
          } catch {
            throw unauthorized;
          }
          if (refreshed.error || !refreshed.data.session?.access_token) throw unauthorized;
          if (refreshed.data.session.user.id !== uploadUserId) throw changedAccountError();
          continue;
        }
        if (!response.ok) throw await responseError(response);
        return response;
      } catch (error) {
        if (controller.signal.aborted) {
          throw Object.assign(new Error("大型檔案上傳請求逾時，可重試以續傳。"), { status: 408 });
        }
        if (statusOf(error)) throw error;
        throw Object.assign(new Error("大型檔案上傳網路中斷，請確認連線後重試以續傳。"), { cause: error });
      } finally {
        window.clearTimeout(timeout);
      }
    }
    throw Object.assign(new Error("登入工作階段已失效（401）。"), { status: 401 });
  };
  const withRetries = async <T,>(action: () => Promise<T>): Promise<T> => {
    let lastError: unknown;
    for (const delay of retryDelays) {
      if (delay) await new Promise(resolve => window.setTimeout(resolve, delay));
      try {
        return await action();
      } catch (error) {
        if (isTerminal(error)) throw error;
        lastError = error;
      }
    }
    throw lastError;
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
    const value = response.headers.get("Upload-Offset");
    const offset = Number(value);
    if (value === null || !/^\d+$/.test(value) || !Number.isSafeInteger(offset) || offset > file.size) {
      throw new Error("儲存服務回傳的續傳位移無效，尚未確認檔案上傳完成。");
    }
    return offset;
  };
  const inspectUpload = async (uploadUrl: string) => {
    const response = await request(uploadUrl, { method: "HEAD" });
    const length = response.headers.get("Upload-Length");
    if (length === null || !/^\d+$/.test(length) || Number(length) !== file.size) {
      throw new Error("儲存服務續傳檔案大小不符，尚未確認上傳完成。");
    }
    // TUS HEAD skips upload authorization, so bind its metadata to this exact object.
    const metadata = (response.headers.get("Upload-Metadata") ?? "").split(",").map(entry => entry.trim());
    if (
      metadata.filter(entry => entry.startsWith("bucketName ")).join(",") !== `bucketName ${encodeMetadata(TEST_PLAN_STORAGE_BUCKET)}`
      || metadata.filter(entry => entry.startsWith("objectName ")).join(",") !== `objectName ${encodeMetadata(path)}`
    ) {
      throw Object.assign(new Error("儲存服務續傳位置的檔案不符，請重新選取檔案。"), { status: 400 });
    }
    const inspectedOffset = readOffset(response);
    if (
      inspectedOffset === file.size
      && response.headers.get("Tus-Complete") !== "1"
      && !response.headers.get("Supabase-Object-Id")?.trim()
    ) {
      throw unconfirmedCompletionError();
    }
    return inspectedOffset;
  };

  let uploadUrl = window.localStorage.getItem(resumeKey) ?? "";
  let offset = 0;
  if (uploadUrl) {
    uploadUrl = validateUploadUrl(uploadUrl);
    try {
      offset = await withRetries(() => inspectUpload(uploadUrl));
    } catch (error) {
      if (statusOf(error) !== 404 && statusOf(error) !== 410) throw error;
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
    const response = await withRetries(() => request(endpoint.toString(), {
      method: "POST",
      headers: {
        "Upload-Length": String(file.size),
        "Upload-Metadata": Object.entries(metadata)
          .map(([key, value]) => `${key} ${encodeMetadata(value)}`)
          .join(","),
        "x-upsert": "false",
      },
    }));
    const location = response.headers.get("Location");
    if (!location) throw new Error("大型檔案上傳未回傳續傳位置。");
    uploadUrl = validateUploadUrl(location);
    window.localStorage.setItem(resumeKey, uploadUrl);
  }

  onProgress?.(offset, file.size);
  while (offset < file.size) {
    let uploaded = false;
    let lastError: unknown = null;
    for (const delay of retryDelays) {
      if (delay > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, delay));
      }
      try {
        const chunkEnd = Math.min(offset + RESUMABLE_UPLOAD_CHUNK_SIZE, file.size);
        const response = await request(uploadUrl, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/offset+octet-stream",
            "Upload-Offset": String(offset),
          },
          body: file.slice(offset, chunkEnd),
        });
        const acknowledged = readOffset(response);
        if (acknowledged <= offset || acknowledged > chunkEnd) throw new Error("儲存服務尚未確認正確的上傳位移，可重試以續傳。");
        if (acknowledged === file.size && response.status !== 204) throw unconfirmedCompletionError();
        offset = acknowledged;
        uploaded = true;
        break;
      } catch (error) {
        if (isTerminal(error)) throw error;
        lastError = error;
        try {
          const remoteOffset = await inspectUpload(uploadUrl);
          if (remoteOffset > offset) {
            offset = remoteOffset;
            uploaded = true;
            break;
          }
        } catch (inspectError) {
          if (isTerminal(inspectError)) throw inspectError;
          // Keep the upload URL and retry the same chunk with backoff.
        }
      }
    }
    if (!uploaded) {
      throw lastError;
    }
    onProgress?.(offset, file.size);
  }
}

export function createSupabaseTestPlanAdapter(): TestPlanDataAdapter {
  return {
    async listSpaces(projectId) {
      // Fixed account spaces are provisioned by the database; the standalone
      // library has no maintenance-project context. RLS authorizes every row.
      const records: TestPlanSpace[] = [];
      for (let offset = 0; ; offset += 500) {
        let query = supabase.from("test_plan_spaces").select("*")
          .eq("is_personal", true)
          .order("name").order("id")
          .range(offset, offset + 499);
        if (projectId) query = query.eq("project_id", projectId);
        const { data, error } = await query;
        throwIfError(error);
        records.push(...(data ?? []).map(mapSpace));
        if (!data || data.length < 500) break;
      }
      // The account directory owns identity and active-account visibility.
      // Stored space names are historical labels; keep their IDs and contents.
      const members = new Map<string, { username: string; display_name: string; role: string }>();
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.rpc("list_active_collaboration_members")
          .order("user_id")
          .range(offset, offset + 499);
        throwIfError(error);
        for (const member of data ?? []) members.set(member.user_id, member);
        if (!data || data.length < 500) break;
      }
      return records.flatMap(space => {
        const member = members.get(space.ownerId);
        return member ? [{
          ...space,
          ownerRole: member.role,
          name: member.display_name?.trim() || member.username,
          description: `@${member.username}`,
        }] : [];
      });
    },
    async listFolders(spaceId) {
      const records: TestPlanFolder[] = [];
      for (let offset = 0; ; offset += 500) {
        let query = supabase.from("test_plan_folders").select("*").order("id").range(offset, offset + 499);
        if (spaceId) query = query.eq("space_id", spaceId);
        const { data, error } = await query;
        throwIfError(error);
        records.push(...(data ?? []).map(mapFolder));
        if (!data || data.length < 500) return records;
      }
    },
    async listFiles(spaceId) {
      const records: TestPlanFileRecord[] = [];
      for (let offset = 0; ; offset += 500) {
        let query = supabase.from("test_plan_files").select("*").order("id").range(offset, offset + 499);
        if (spaceId) query = query.eq("space_id", spaceId);
        const { data, error } = await query;
        throwIfError(error);
        records.push(...(data ?? []).map(mapFile));
        if (!data || data.length < 500) return records;
      }
    },
    async createSpace(input) {
      const payload: TablesInsert<"test_plan_spaces"> = {
        owner_id: input.ownerId,
        project_id: input.projectId,
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
    async updateSpace(spaceId, _ownerId, projectId, patch) {
      const payload: TablesUpdate<"test_plan_spaces"> = {
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.description === undefined
          ? {}
          : { description: patch.description }),
        ...(patch.color === undefined ? {} : { color: patch.color }),
      };
      let query = supabase
        .from("test_plan_spaces")
        .update(payload)
        .eq("id", spaceId);
      query = projectId === null ? query.is("project_id", null) : query.eq("project_id", projectId);
      const { data, error } = await query
        .select()
        .single();
      throwIfError(error);
      return mapSpace(data);
    },
    async deleteSpace(spaceId, _ownerId, projectId) {
      let query = supabase
        .from("test_plan_spaces")
        .delete()
        .eq("id", spaceId);
      query = projectId === null ? query.is("project_id", null) : query.eq("project_id", projectId);
      const { data, error } = await query
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
      if (file.size > 0) {
        await uploadResumableObject(path, file, onProgress);
        return;
      }
      onProgress?.(0, file.size);
      // shortcut: Empty TUS creation does not persist an S3 object; keep standard upload until empty completion is supported.
      const { error } = await supabase.storage
        .from(TEST_PLAN_STORAGE_BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false });
      throwIfError(error);
      onProgress?.(file.size, file.size);
    },
    completeObjectUpload(path) {
      try {
        window.localStorage.removeItem(`test-plan-tus:${path}`);
      } catch {
        // Metadata has committed; unavailable browser storage must not undo it.
      }
    },
    async findFileByStoragePath(path) {
      const { data, error } = await supabase.from("test_plan_files")
        .select("*").eq("storage_path", path).maybeSingle();
      throwIfError(error);
      return data ? mapFile(data) : undefined;
    },
    async replaceObject(path, file) {
      const { error } = await supabase.storage
        .from(TEST_PLAN_STORAGE_BUCKET)
        .update(path, file, {
          cacheControl: "3600",
          contentType: file.type || "application/octet-stream",
          upsert: true,
        });
      throwIfError(error);
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
        ...(patch.mimeType === undefined ? {} : { mime_type: patch.mimeType }),
        ...(patch.fileSize === undefined ? {} : { file_size: patch.fileSize }),
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
    async createDownloadUrl(path, fileName) {
      const { data, error } = await supabase.storage
        .from(TEST_PLAN_STORAGE_BUCKET)
        .createSignedUrl(path, 600, { download: fileName });
      throwIfError(error);
      if (!data?.signedUrl) throw new Error("無法建立下載連結。");
      return data.signedUrl;
    },
    async createDownloadUrls(items) {
      const { data, error } = await supabase.storage
        .from(TEST_PLAN_STORAGE_BUCKET)
        .createSignedUrls(items.map((item) => item.path), 600);
      throwIfError(error);
      const urls = new Map<string, string>();
      for (const row of data ?? []) {
        if (row.path && row.signedUrl && !row.error) urls.set(row.path, row.signedUrl);
      }
      return urls;
    },
    async removeObjects(paths) {
      if (paths.length === 0) return;
      const { error } = await supabase.storage
        .from(TEST_PLAN_STORAGE_BUCKET)
        .remove([...paths]);
      throwIfError(error);
    },
    async listCleanupPaths(ownerId) {
      const filter = cleanupActorFilter(ownerId);
      const paths: string[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase
          .from("test_plan_storage_cleanup_queue")
          .select("storage_path")
          .or(filter)
          .order("queued_at", { ascending: true })
          .order("storage_path")
          .range(offset, offset + 499);
        throwIfError(error);
        paths.push(...(data ?? []).map(row => row.storage_path));
        if (!data || data.length < 500) return [...new Set(paths)];
      }
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
        .or(cleanupActorFilter(ownerId))
        .in("storage_path", paths);
      throwIfError(error);
    },
  };
}
