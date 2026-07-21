export interface SharedPromptLike {
  id: string;
  title: string;
  content: string;
}

interface ClipboardItemLike {
  kind?: string;
  type?: string;
  getAsFile?: () => File | null;
}

export function getSlashPromptQuery(value: string) {
  const normalized = value.trimStart();
  if (!normalized.startsWith("/") || normalized.includes("\n")) return null;
  return normalized.slice(1).trimStart();
}

export function filterSharedPrompts<T extends SharedPromptLike>(prompts: T[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return prompts;

  return prompts.filter((prompt) =>
    `${prompt.title}\n${prompt.content}`.toLocaleLowerCase().includes(normalizedQuery),
  );
}

const DATABASE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getSharedPromptCreatorId(userId?: null | string) {
  const normalizedUserId = userId?.trim();
  return normalizedUserId && DATABASE_UUID_PATTERN.test(normalizedUserId) ? normalizedUserId : null;
}

export function insertClipboardText(
  currentValue: string,
  pastedText: string,
  selectionStart: number,
  selectionEnd: number,
) {
  return `${currentValue.slice(0, selectionStart)}${pastedText}${currentValue.slice(selectionEnd)}`;
}

export type OrderedClipboardSegment =
  | { kind: "text"; text: string }
  | { attachmentIndex: number; kind: "attachment" };

const ATTACHMENT_MARKER_PATTERN = /\[\[attachment:(\d+)\]\]/g;

function decodeClipboardEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

export function composeClipboardContent(
  html: string,
  plainText: string,
  imageCount: number,
  attachmentStartIndex = 0,
) {
  if (imageCount <= 0) return plainText;

  let imageIndex = 0;
  const htmlWithMarkers = html.replace(/<img\b[^>]*>/gi, () => {
    if (imageIndex >= imageCount) return "";
    const marker = `[[attachment:${attachmentStartIndex + imageIndex}]]`;
    imageIndex += 1;
    return `\n${marker}\n`;
  });

  let content = decodeClipboardEntities(
    htmlWithMarkers
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "• ")
      .replace(/<\/(?:p|div|li|h[1-6]|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n+\s*(\[\[attachment:\d+\]\])\s*\n+/g, "\n$1\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!html || imageIndex === 0) content = plainText.trim();

  const missingMarkers = Array.from({ length: imageCount - imageIndex }, (_, index) =>
    `[[attachment:${attachmentStartIndex + imageIndex + index}]]`,
  );

  return [content, ...missingMarkers].filter(Boolean).join("\n");
}

export function splitContentByAttachmentMarkers(content: string): OrderedClipboardSegment[] {
  const segments: OrderedClipboardSegment[] = [];
  let cursor = 0;
  let match = ATTACHMENT_MARKER_PATTERN.exec(content);

  while (match) {
    if (match.index > cursor) {
      segments.push({ kind: "text", text: content.slice(cursor, match.index) });
    }
    segments.push({ attachmentIndex: Number(match[1]), kind: "attachment" });
    cursor = match.index + match[0].length;
    match = ATTACHMENT_MARKER_PATTERN.exec(content);
  }

  if (cursor < content.length) {
    segments.push({ kind: "text", text: content.slice(cursor) });
  }

  ATTACHMENT_MARKER_PATTERN.lastIndex = 0;
  return segments.length > 0 ? segments : [{ kind: "text", text: content }];
}

export function getClipboardImageFiles(items: ArrayLike<ClipboardItemLike>) {
  return Array.from(items).flatMap((item) => {
    if (item.kind !== "file" || !item.type?.startsWith("image/") || !item.getAsFile) return [];
    const file = item.getAsFile();
    return file ? [file] : [];
  });
}

export function extractEmbeddedImageDataUrls(html: string) {
  return extractEmbeddedImageSources(html).filter((source) => source.startsWith("data:image/"));
}

export function extractEmbeddedImageSources(html: string) {
  const sources: string[] = [];
  const imagePattern = /<img\b[^>]*\bsrc\s*=\s*(["'])(data:image\/[a-zA-Z0-9.+-]+(?:;[^"']*)?|https?:\/\/[^"']+|blob:[^"']+)\1/gi;
  let match = imagePattern.exec(html);

  while (match) {
    if (!sources.includes(match[2])) sources.push(match[2]);
    match = imagePattern.exec(html);
  }

  return sources;
}

export function createFileFromDataImageUrl(dataUrl: string, index: number) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+)(?:;charset=[^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;

  const [, mimeType, base64Flag, payload] = match;
  const decoded = base64Flag ? atob(payload) : decodeURIComponent(payload);
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg").replace(/[^a-zA-Z0-9]/g, "") || "png";

  return new File([bytes], `clipboard-image-${Date.now()}-${index + 1}.${extension}`, {
    type: mimeType,
  });
}
