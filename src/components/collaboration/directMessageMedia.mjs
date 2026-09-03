export const CHAT_MEDIA_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

export const CHAT_MEDIA_MAX_FILES = 4;
export const CHAT_IMAGE_MAX_BYTES = 12 * 1024 * 1024;
export const CHAT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const CHAT_DOCUMENT_MAX_BYTES = 50 * 1024 * 1024;

const OFFICE_MIME_TYPES = new Map([
  ["ppt", "application/vnd.ms-powerpoint"],
  [
    "pptx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  ["xls", "application/vnd.ms-excel"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
]);
// Windows and drag sources may supply no MIME or a generic container MIME.
const GENERIC_OFFICE_MIMES = new Set([
  "",
  "application/octet-stream",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.ms-office",
  "application/x-ole-storage",
]);

const MIME_CONFIG = new Map([
  [
    "image/jpeg",
    { extension: "jpg", mediaKind: "image", maxBytes: CHAT_IMAGE_MAX_BYTES },
  ],
  [
    "image/png",
    { extension: "png", mediaKind: "image", maxBytes: CHAT_IMAGE_MAX_BYTES },
  ],
  [
    "image/webp",
    { extension: "webp", mediaKind: "image", maxBytes: CHAT_IMAGE_MAX_BYTES },
  ],
  [
    "image/gif",
    { extension: "gif", mediaKind: "image", maxBytes: CHAT_IMAGE_MAX_BYTES },
  ],
  [
    "video/mp4",
    { extension: "mp4", mediaKind: "video", maxBytes: CHAT_VIDEO_MAX_BYTES },
  ],
  [
    "video/webm",
    { extension: "webm", mediaKind: "video", maxBytes: CHAT_VIDEO_MAX_BYTES },
  ],
  [
    "video/quicktime",
    { extension: "mov", mediaKind: "video", maxBytes: CHAT_VIDEO_MAX_BYTES },
  ],
  ...Array.from(OFFICE_MIME_TYPES, ([extension, mime]) => [
    mime,
    { extension, mediaKind: "document", maxBytes: CHAT_DOCUMENT_MAX_BYTES },
  ]),
]);

export function getDirectMessageMimeType(file) {
  const type = String(file?.type ?? "").toLowerCase();
  const extension = String(file?.name ?? "")
    .split(".")
    .at(-1)
    ?.toLowerCase();
  const officeMime = OFFICE_MIME_TYPES.get(extension);
  if (officeMime)
    return type === officeMime || GENERIC_OFFICE_MIMES.has(type)
      ? officeMime
      : null;
  const config = MIME_CONFIG.get(type);
  return config && config.mediaKind !== "document" ? type : null;
}

export function getDirectMessageMediaKind(file) {
  return MIME_CONFIG.get(getDirectMessageMimeType(file))?.mediaKind ?? null;
}

export function getDirectMessageClipboardImageFiles(items) {
  return Array.from(items ?? []).flatMap((item) => {
    if (
      item?.kind !== "file" ||
      !item.type?.startsWith("image/") ||
      !item.getAsFile
    )
      return [];
    const file = item.getAsFile();
    return file ? [file] : [];
  });
}

export function createDirectMessageClipboardFileName(
  file,
  index = 0,
  now = new Date(),
) {
  const config = MIME_CONFIG.get(file?.type);
  if (!config || config.mediaKind !== "image") return null;
  const timestamp = new Date(now)
    .toISOString()
    .slice(0, 19)
    .replaceAll("-", "")
    .replace("T", "-")
    .replaceAll(":", "");
  return `clipboard-${timestamp}-${index + 1}.${config.extension}`;
}

export function validateDirectMessageFiles(files) {
  const normalized = Array.from(files ?? []);
  if (normalized.length > CHAT_MEDIA_MAX_FILES) {
    return {
      error: `最多只能選擇 ${CHAT_MEDIA_MAX_FILES} 個附件。`,
      files: [],
    };
  }

  for (const file of normalized) {
    const config = MIME_CONFIG.get(getDirectMessageMimeType(file));
    if (!config) {
      return {
        error:
          "支援圖片、影片、PowerPoint（PPT、PPTX）與 Excel（XLS、XLSX），請確認檔案格式。",
        files: [],
      };
    }
    if (!Number.isFinite(file.size) || file.size <= 0) {
      return { error: "無法傳送空白檔案。", files: [] };
    }
    if (file.size > config.maxBytes) {
      const limit = config.mediaKind === "image" ? "12 MB" : "50 MB";
      const label =
        config.mediaKind === "image"
          ? "照片"
          : config.mediaKind === "video"
            ? "影片"
            : "文件";
      return { error: `${label}大小不可超過 ${limit}。`, files: [] };
    }
  }

  return { error: null, files: normalized };
}

export function createDirectMessageMediaPath(
  threadId,
  userId,
  clientId,
  file,
  index,
) {
  const extension = MIME_CONFIG.get(getDirectMessageMimeType(file))?.extension;
  if (!extension) throw new Error("Unsupported direct-message media type");
  return `${threadId}/${userId}/${clientId}/${index}.${extension}`;
}

export function getDirectMessagePreviewLabel(body, attachments) {
  const normalizedBody = String(body ?? "").trim();
  if (normalizedBody) return normalizedBody;
  if (attachments?.length === 1) {
    if (attachments[0]?.mediaKind === "document") return "傳送了文件";
    return attachments[0]?.mediaKind === "video" ? "傳送了影片" : "傳送了照片";
  }
  return `傳送了 ${attachments?.length ?? 0} 個附件`;
}

export function formatDirectMessageFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
