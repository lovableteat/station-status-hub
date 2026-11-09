import { supabase } from "@/integrations/supabase/client";
import type { CircuitImage, CircuitImageSide, CircuitImageSource } from "./types";

export const CIRCUIT_IMAGE_BUCKET = "circuit-change-images";
export const CIRCUIT_IMAGE_MAX_BYTES = 50 * 1024 * 1024;
export const CIRCUIT_IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.bmp";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The file itself can never be accepted (wrong type, empty, too large), unlike a transfer that may work on retry. */
export class CircuitImageRejectedError extends Error {}
/** A picture framed on a PDF carries where it came from; the same File object is used again when a failed upload is retried. */
export const circuitImageOrigins = new WeakMap<File, { source: CircuitImageSource; caption: string }>();

export async function validateCircuitImage(file: File) {
  if (!file.size) throw new CircuitImageRejectedError("圖片內容是空的。");
  if (file.size > CIRCUIT_IMAGE_MAX_BYTES) throw new CircuitImageRejectedError("圖片超過每張 50 MB 上限。");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const text = String.fromCharCode(...bytes);
  if (bytes[0] === 137 && text.slice(1, 4) === "PNG") return { mime: "image/png", extension: "png" };
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { mime: "image/jpeg", extension: "jpg" };
  if (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP") return { mime: "image/webp", extension: "webp" };
  if (text.startsWith("GIF87a") || text.startsWith("GIF89a")) return { mime: "image/gif", extension: "gif" };
  if (text.startsWith("BM")) return { mime: "image/bmp", extension: "bmp" };
  throw new CircuitImageRejectedError("不是可用的圖片，請使用 PNG、JPEG、WEBP、GIF 或 BMP（PDF 請上傳到「PDF 圖面」再框選）。");
}

async function preview(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url;
    try { await image.decode(); } catch { throw new CircuitImageRejectedError("圖片無法開啟，檔案可能已損壞。"); }
    const width = image.naturalWidth, height = image.naturalHeight;
    if (!width || !height || width * height > 100_000_000) throw new CircuitImageRejectedError("圖片尺寸無效或超過 1 億像素，請改用局部截圖。");
    const scale = Math.min(1, 1280 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return { width, height, thumbnail: null };
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const thumbnail = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", .82));
    return { width, height, thumbnail };
  } finally { URL.revokeObjectURL(url); }
}

export async function uploadCircuitImages({ setId, itemId, files, side, actorId, onProgress, assertScope = () => {} }: {
  setId: string; itemId: string; files: File[]; side: CircuitImageSide; actorId: string;
  onProgress?: (completed: number, total: number) => void; assertScope?: () => void;
}): Promise<{ images: CircuitImage[]; failures: { file: File; error: string; permanent?: boolean }[]; warnings: string[] }> {
  if (!UUID.test(setId) || !UUID.test(itemId)) throw new Error("找不到圖片所屬的修改項目。");
  if (files.length > 200) throw new Error("每次最多加入 200 張圖片，請分批追加。");
  const results: ({ image: CircuitImage; warning?: string } | { file: File; error: string; permanent?: boolean })[] = new Array(files.length);
  let cursor = 0, completed = 0;
  await Promise.all(Array.from({ length: Math.min(3, files.length) }, async () => {
    while (cursor < files.length) {
      const index = cursor++, file = files[index];
      try {
        assertScope();
        const type = await validateCircuitImage(file), decoded = await preview(file);
        assertScope();
        const id = crypto.randomUUID(), path = `${setId}/${itemId}/${id}.${type.extension}`;
        const { error } = await supabase.storage.from(CIRCUIT_IMAGE_BUCKET).upload(path, file, { contentType: type.mime, upsert: false });
        if (error) throw error;
        assertScope();
        let thumbnailPath: string | undefined, warning: string | undefined;
        if (decoded.thumbnail) {
          const candidate = `${setId}/${itemId}/${id}-thumb.webp`;
          try {
            const result = await supabase.storage.from(CIRCUIT_IMAGE_BUCKET).upload(candidate, decoded.thumbnail, { contentType: "image/webp", upsert: false });
            if (result.error) warning = `${file.name}：縮圖建立失敗，已保留原圖。`;
            else thumbnailPath = candidate;
          } catch { warning = `${file.name}：縮圖上傳中斷，已保留原圖。`; }
          assertScope();
        } else warning = `${file.name}：無法建立縮圖，已保留原圖。`;
        const origin = circuitImageOrigins.get(file);
        results[index] = { image: { id, name: file.name || `image.${type.extension}`, path, thumbnailPath, mime: type.mime, size: file.size,
          width: decoded.width, height: decoded.height, side, caption: origin?.caption ?? "", marks: [], uploadedAt: new Date().toISOString(), uploadedBy: actorId,
          ...(origin ? { source: origin.source } : {}) }, warning };
      } catch (error) {
        results[index] = { file, error: error instanceof Error ? error.message : String((error as { message?: string })?.message || "圖片上傳失敗，請重試。"),
          ...(error instanceof CircuitImageRejectedError ? { permanent: true } : {}) };
      }
      onProgress?.(++completed, files.length);
    }
  }));
  return { images: results.flatMap(result => "image" in result ? [result.image] : []), failures: results.flatMap(result => "file" in result ? [result] : []),
    warnings: results.flatMap(result => "image" in result && result.warning ? [result.warning] : []) };
}

const SIGNED_URL_SECONDS = 3600;
/** A signed link is handed out again only while it stays valid at least this long, so an open dialog never shows an expired one. */
export const CIRCUIT_IMAGE_URL_REUSE_MS = 25 * 60 * 1000;
const signedUrls = new Map<string, { url: string; expires: number }>();

// Originals are immutable, so a link signed earlier is as good as a new one. Signing every image again on each change made all
// thumbnails reload whenever one picture was added.
export async function createCircuitImageUrls(images: CircuitImage[]): Promise<Record<string, { original: string; thumbnail: string }>> {
  const paths = [...new Set(images.flatMap(image => [image.path, ...(image.thumbnailPath ? [image.thumbnailPath] : [])]))];
  const now = Date.now();
  for (const [path, entry] of signedUrls) if (entry.expires <= now) signedUrls.delete(path);
  const urls = new Map<string, string>();
  const missing: string[] = [];
  for (const path of paths) {
    const known = signedUrls.get(path);
    if (known && known.expires - now >= CIRCUIT_IMAGE_URL_REUSE_MS) urls.set(path, known.url); else missing.push(path);
  }
  for (let offset = 0; offset < missing.length; offset += 100) {
    const { data, error } = await supabase.storage.from(CIRCUIT_IMAGE_BUCKET).createSignedUrls(missing.slice(offset, offset + 100), SIGNED_URL_SECONDS);
    if (error) throw new Error(error.message || "無法取得修改圖片。");
    for (const row of data ?? []) {
      if (!row.path || !row.signedUrl || row.error) throw new Error(`無法取得圖片：${row.path || "未知檔案"}`);
      urls.set(row.path, row.signedUrl);
      signedUrls.set(row.path, { url: row.signedUrl, expires: now + SIGNED_URL_SECONDS * 1000 });
    }
  }
  return Object.fromEntries(images.map(image => {
    const original = urls.get(image.path);
    if (!original) throw new Error(`找不到圖片：${image.name}`);
    return [image.id, { original, thumbnail: image.thumbnailPath ? urls.get(image.thumbnailPath) || original : original }];
  }));
}

export async function downloadCircuitImage(image: CircuitImage): Promise<void> {
  const urls = await createCircuitImageUrls([image]);
  const response = await fetch(urls[image.id].original);
  if (!response.ok) throw new Error(`圖片下載失敗：${image.name}`);
  const blob = await response.blob();
  if (blob.size !== image.size) throw new Error(`圖片下載不完整：${image.name}`);
  const url = URL.createObjectURL(blob), anchor = document.createElement("a");
  anchor.href = url; anchor.download = image.name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
