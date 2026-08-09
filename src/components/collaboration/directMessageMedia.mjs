export const CHAT_MEDIA_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
].join(",");

export const CHAT_MEDIA_MAX_FILES = 4;
export const CHAT_IMAGE_MAX_BYTES = 12 * 1024 * 1024;
export const CHAT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

const MIME_CONFIG = new Map([
  ["image/jpeg", { extension: "jpg", mediaKind: "image", maxBytes: CHAT_IMAGE_MAX_BYTES }],
  ["image/png", { extension: "png", mediaKind: "image", maxBytes: CHAT_IMAGE_MAX_BYTES }],
  ["image/webp", { extension: "webp", mediaKind: "image", maxBytes: CHAT_IMAGE_MAX_BYTES }],
  ["image/gif", { extension: "gif", mediaKind: "image", maxBytes: CHAT_IMAGE_MAX_BYTES }],
  ["video/mp4", { extension: "mp4", mediaKind: "video", maxBytes: CHAT_VIDEO_MAX_BYTES }],
  ["video/webm", { extension: "webm", mediaKind: "video", maxBytes: CHAT_VIDEO_MAX_BYTES }],
  ["video/quicktime", { extension: "mov", mediaKind: "video", maxBytes: CHAT_VIDEO_MAX_BYTES }],
]);

export function getDirectMessageMediaKind(file) {
  return MIME_CONFIG.get(file?.type)?.mediaKind ?? null;
}

export function validateDirectMessageFiles(files) {
  const normalized = Array.from(files ?? []);
  if (normalized.length > CHAT_MEDIA_MAX_FILES) {
    return { error: `最多只能選擇 ${CHAT_MEDIA_MAX_FILES} 個附件。`, files: [] };
  }

  for (const file of normalized) {
    const config = MIME_CONFIG.get(file?.type);
    if (!config) {
      return { error: "只支援照片與影片（JPG、PNG、WebP、GIF、MP4、WebM、MOV）。", files: [] };
    }
    if (file.size > config.maxBytes) {
      const limit = config.mediaKind === "image" ? "12 MB" : "50 MB";
      const label = config.mediaKind === "image" ? "照片" : "影片";
      return { error: `${label}大小不可超過 ${limit}。`, files: [] };
    }
  }

  return { error: null, files: normalized };
}

export function createDirectMessageMediaPath(threadId, userId, clientId, file, index) {
  const extension = MIME_CONFIG.get(file?.type)?.extension;
  if (!extension) throw new Error("Unsupported direct-message media type");
  return `${threadId}/${userId}/${clientId}/${index}.${extension}`;
}

export function getDirectMessagePreviewLabel(body, attachments) {
  const normalizedBody = String(body ?? "").trim();
  if (normalizedBody) return normalizedBody;
  if (attachments?.length === 1) {
    return attachments[0]?.mediaKind === "video" ? "傳送了影片" : "傳送了照片";
  }
  return `傳送了 ${attachments?.length ?? 0} 個附件`;
}

export function formatDirectMessageFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
