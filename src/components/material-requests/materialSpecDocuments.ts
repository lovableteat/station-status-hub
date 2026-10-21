import { supabase } from "@/integrations/supabase/client";

import type { MaterialSpecDocument } from "./materialRequestUtils";

export const MATERIAL_SPEC_BUCKET = "material-spec-documents";
export const MATERIAL_SPEC_MAX_BYTES = 25 * 1024 * 1024;
export const MATERIAL_SPEC_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.zip";
const SIGNED_URL_SECONDS = 60 * 60;

function toPathSegment(value: string) {
  const cleaned = value.normalize("NFKC").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "item";
}

export function buildMaterialSpecPath(workspaceId: string, recordId: string, fileName: string, now = Date.now()) {
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const extension = dot > 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const safeBase = toPathSegment(base).slice(0, 80);
  return `${toPathSegment(workspaceId)}/${toPathSegment(recordId)}/${now}-${safeBase}${extension ? `.${extension}` : ""}`;
}

export function formatMaterialSpecSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function describeStorageError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? "";
  if (/bucket not found/i.test(message)) {
    return `尚未建立 ${MATERIAL_SPEC_BUCKET} 儲存空間，請先套用資料庫 migration 後再上傳。`;
  }
  if (/exceeded|too large|payload/i.test(message)) {
    return `檔案超過上限 ${formatMaterialSpecSize(MATERIAL_SPEC_MAX_BYTES)}。`;
  }
  return message || "SPEC 上傳失敗，請稍後再試。";
}

export async function uploadMaterialSpecDocument({
  workspaceId,
  recordId,
  file,
  uploadedBy,
}: {
  workspaceId: string;
  recordId: string;
  file: File;
  uploadedBy?: string;
}): Promise<MaterialSpecDocument> {
  if (file.size > MATERIAL_SPEC_MAX_BYTES) {
    throw new Error(`檔案超過上限 ${formatMaterialSpecSize(MATERIAL_SPEC_MAX_BYTES)}。`);
  }
  const path = buildMaterialSpecPath(workspaceId, recordId, file.name);
  const { error } = await supabase.storage
    .from(MATERIAL_SPEC_BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false, cacheControl: "3600" });
  if (error) throw new Error(describeStorageError(error));

  return {
    name: file.name,
    path,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    uploadedAt: new Date().toISOString(),
    uploadedBy: uploadedBy?.trim() || undefined,
  };
}

export async function createMaterialSpecUrl(path: string) {
  const { data, error } = await supabase.storage.from(MATERIAL_SPEC_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) throw new Error(describeStorageError(error ?? { message: "無法取得 SPEC 連結。" }));
  return data.signedUrl;
}

export async function removeMaterialSpecDocument(path: string) {
  const { error } = await supabase.storage.from(MATERIAL_SPEC_BUCKET).remove([path]);
  if (error) throw new Error(describeStorageError(error));
}
