const str = value => typeof value === "string" ? value : "";
export const MAX_MANAGER_ATTACHMENTS = 4;
export const MAX_MANAGER_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const MAX_MANAGER_ATTACHMENT_CHARACTERS = 6_000_000;
const SAFE_ATTACHMENT_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "csv",
  "txt",
  "zip",
  "jpg",
  "jpeg",
  "png",
  "webp",
]);
export const safeManagerAttachments = (value) =>
  (Array.isArray(value) ? value : [])
    .filter((attachment) => {
      const extension = str(attachment?.name).split(".").pop()?.toLowerCase();
      return (
        str(attachment?.id) &&
        SAFE_ATTACHMENT_EXTENSIONS.has(extension) &&
        Number.isFinite(Number(attachment?.size)) &&
        Number(attachment.size) >= 0 &&
        Number(attachment.size) <= MAX_MANAGER_ATTACHMENT_BYTES &&
        /^data:(?:application\/(?:pdf|msword|vnd\.[^;,]+|zip|x-zip-compressed|octet-stream)|text\/(?:plain|csv)|image\/(?:jpeg|png|webp));base64,/i.test(
          str(attachment?.dataUrl),
        )
      );
    })
    .slice(0, MAX_MANAGER_ATTACHMENTS)
    .map((attachment) => ({
      id: str(attachment.id),
      name: str(attachment.name),
      mimeType: str(attachment.mimeType),
      size: Number(attachment.size),
      dataUrl: str(attachment.dataUrl),
    }));
