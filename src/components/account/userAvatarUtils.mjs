export const USER_AVATAR_BUCKET = "user-avatars";
export const USER_AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const USER_AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";

const avatarExtensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function validateUserAvatarFile(file) {
  if (!file || typeof file !== "object") return "請選擇頭像圖片。";
  if (!avatarExtensions[file.type]) return "頭像只支援 JPG、PNG 或 WebP。";
  if (!Number.isFinite(file.size) || file.size <= 0) return "頭像檔案內容無效。";
  if (file.size > USER_AVATAR_MAX_BYTES) return "頭像大小不可超過 2 MB。";
  return null;
}

export function createUserAvatarPath(userId, file, options = {}) {
  const extension = avatarExtensions[file?.type];
  if (!userId || !extension) return null;
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const token = String(options.token || globalThis.crypto?.randomUUID?.() || Math.random().toString(16).slice(2))
    .toLowerCase()
    .replace(/[^0-9a-f-]/g, "")
    .slice(0, 20);
  if (token.length < 8) return null;
  return `${userId}/${now}-${token}.${extension}`;
}
