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

export function insertClipboardText(
  currentValue: string,
  pastedText: string,
  selectionStart: number,
  selectionEnd: number,
) {
  return `${currentValue.slice(0, selectionStart)}${pastedText}${currentValue.slice(selectionEnd)}`;
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
