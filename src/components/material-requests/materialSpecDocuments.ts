import { supabase } from "@/integrations/supabase/client";

import type { MaterialSpecDocument } from "./materialRequestUtils";

export const MATERIAL_SPEC_BUCKET = "material-spec-documents";
export const MATERIAL_SPEC_MAX_BYTES = 50 * 1024 * 1024;
// Keep this list aligned with the material_spec_multi_file_formats Storage migration.
export const MATERIAL_SPEC_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,.svg,.txt,.csv,.tsv,.json,.xml,.md,.log,.glb,.gltf,.stp,.step,.stl,.obj,.mtl,.igs,.iges,.3mf,.fbx,.ply,.wrl,.vrml,.dwg,.dxf,.brd,.pcb,.sch,.dsn,.olb,.dra,.psm,.pad,.kicad_pcb,.kicad_sch,.kicad_mod,.kicad_sym,.lib,.gbr,.gerber,.drl,.ipt,.iam,.sldprt,.sldasm,.prt,.asm,.zip,.7z,.rar";
const SIGNED_URL_SECONDS = 60 * 60;

export function validateMaterialSpecFile(file: Pick<File, "name" | "size">) {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!file.name.includes(".") || !MATERIAL_SPEC_ACCEPT.split(",").includes(extension)) {
    throw new Error("尚未支援此副檔名。支援 PDF、Office、圖片及 GLB／STP／STEP／STL／DWG／DXF 等工程檔案。");
  }
  if (file.size === 0) throw new Error("檔案內容是空的，請確認文件後再上傳。");
  if (file.size > MATERIAL_SPEC_MAX_BYTES) {
    throw new Error(`檔案超過上限 ${formatMaterialSpecSize(MATERIAL_SPEC_MAX_BYTES)}。`);
  }
}

function toPathSegment(value: string) {
  const cleaned = value.normalize("NFKC").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "item";
}

export function buildMaterialSpecPath(workspaceId: string, recordId: string, fileName: string, now = Date.now()) {
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const extension = dot > 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const safeBase = toPathSegment(base).slice(0, 80);
  return `${toPathSegment(workspaceId)}/${toPathSegment(recordId)}/${now}-${crypto.randomUUID()}-${safeBase}${extension ? `.${extension}` : ""}`;
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
  validateMaterialSpecFile(file);
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

export async function createMaterialSpecUrl(path: string, downloadName?: string) {
  const { data, error } = await supabase.storage.from(MATERIAL_SPEC_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS, { download: downloadName ?? false });
  if (error || !data?.signedUrl) throw new Error(describeStorageError(error ?? { message: "無法取得 SPEC 連結。" }));
  return data.signedUrl;
}

/** Bounded parallel uploads, ordered like the user's selection. Never require an archive. */
export async function uploadMaterialSpecDocuments({ files, onProgress, ...context }: {
  workspaceId: string;
  recordId: string;
  uploadedBy?: string;
  files: File[];
  onProgress?: (completed: number, total: number) => void;
}) {
  const results: Array<{ document: MaterialSpecDocument } | { file: File; error: string }> = new Array(files.length);
  let cursor = 0;
  let completed = 0;
  await Promise.all(Array.from({ length: Math.min(3, files.length) }, async () => {
    while (cursor < files.length) {
      const index = cursor++;
      try {
        results[index] = { document: await uploadMaterialSpecDocument({ ...context, file: files[index] }) };
      } catch (error) {
        results[index] = { file: files[index], error: error instanceof Error ? error.message : "上傳失敗，請重試。" };
      }
      onProgress?.(++completed, files.length);
    }
  }));
  return {
    documents: results.flatMap(result => "document" in result ? [result.document] : []),
    failures: results.flatMap(result => "file" in result ? [result] : []),
  };
}

export async function removeMaterialSpecDocument(path: string) {
  const { error } = await supabase.storage.from(MATERIAL_SPEC_BUCKET).remove([path]);
  if (error) throw new Error(describeStorageError(error));
}
