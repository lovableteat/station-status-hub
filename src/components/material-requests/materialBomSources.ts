import { supabase } from "@/integrations/supabase/client";

import type { BomVersionSource } from "./bomVersioning";
import { MATERIAL_SPEC_BUCKET, MATERIAL_SPEC_MAX_BYTES, formatMaterialSpecSize } from "./materialSpecDocuments";

/**
 * The original Excel of a BOM version is kept in the private material-spec bucket
 * under a reserved folder, so no new bucket or policy is needed and downloads
 * reuse the existing signed-URL rules.
 */
const SOURCE_FOLDER = "_bom-source";
const SIGNED_URL_SECONDS = 60 * 60;

function toPathSegment(value: string) {
  const cleaned = value.normalize("NFKC").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "item";
}

export function buildBomSourcePath(workspaceId: string, fileName: string, now = Date.now()) {
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const extension = dot > 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  return `${toPathSegment(workspaceId)}/${SOURCE_FOLDER}/${now}-${toPathSegment(base).slice(0, 80)}${extension ? `.${extension}` : ""}`;
}

export async function uploadBomSourceFile({ workspaceId, file }: { workspaceId: string; file: File }): Promise<BomVersionSource> {
  if (file.size > MATERIAL_SPEC_MAX_BYTES) {
    throw new Error(`原始 Excel 超過上限 ${formatMaterialSpecSize(MATERIAL_SPEC_MAX_BYTES)}，版本已建立但未保存原檔。`);
  }
  const path = buildBomSourcePath(workspaceId, file.name);
  const mimeType = file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const { error } = await supabase.storage
    .from(MATERIAL_SPEC_BUCKET)
    .upload(path, file, { contentType: mimeType, upsert: false, cacheControl: "3600" });
  if (error) throw new Error(error.message || "原始 Excel 上傳失敗。");
  return { name: file.name, path, size: file.size, mimeType };
}

export async function createBomSourceUrl(source: BomVersionSource) {
  const { data, error } = await supabase.storage
    .from(MATERIAL_SPEC_BUCKET)
    .createSignedUrl(source.path, SIGNED_URL_SECONDS, { download: source.name });
  if (error || !data?.signedUrl) throw new Error(error?.message || "無法取得原始 Excel 的下載連結。");
  return data.signedUrl;
}

export async function removeBomSourceFile(path: string) {
  const { error } = await supabase.storage.from(MATERIAL_SPEC_BUCKET).remove([path]);
  if (error) throw new Error(error.message || "原始 Excel 刪除失敗。");
}
