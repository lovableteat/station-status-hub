const PPTX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const MAX_PPTX_SLIDES = 300;
const MAX_PPTX_IMAGE_PARTS = 12;
const MAX_PPTX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_PPTX_TEXT_CHARACTERS = 1_500_000;

const PPTX_IMAGE_MIME_TYPES: Record<string, string> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export interface PptxInlineImage {
  data: string;
  mimeType: string;
  name: string;
}

export interface ExtractedPptxContent {
  images: PptxInlineImage[];
  slideCount: number;
  text: string;
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractTextRuns(xml: string) {
  return Array.from(xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi))
    .map((match) => decodeXmlEntities(match[1]))
    .join("");
}

export function extractPptxSlideText(xml: string) {
  const paragraphs = Array.from(
    xml.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/gi),
  )
    .map((match) => extractTextRuns(match[1]).trim())
    .filter(Boolean);

  if (paragraphs.length > 0) return paragraphs.join("\n");
  return extractTextRuns(xml).trim();
}

export function isPptxFile(file: Pick<File, "name" | "type">) {
  return file.type.toLowerCase() === PPTX_MIME_TYPE || /\.pptx$/i.test(file.name);
}

function getSlideNumber(path: string) {
  return Number(path.match(/slide(\d+)\.xml$/i)?.[1] ?? Number.MAX_SAFE_INTEGER);
}

function getFileExtension(path: string) {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

export async function extractPptxContent(file: File): Promise<ExtractedPptxContent> {
  const { default: JSZip } = await import("jszip");
  const archive = await JSZip.loadAsync(await file.arrayBuffer());
  const slideEntries = Object.values(archive.files)
    .filter((entry) => !entry.dir && /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name))
    .sort((left, right) => getSlideNumber(left.name) - getSlideNumber(right.name));

  if (slideEntries.length === 0) {
    throw new Error(`${file.name} 不是有效的 PPTX，找不到投影片內容`);
  }

  const limitedSlides = slideEntries.slice(0, MAX_PPTX_SLIDES);
  const slideBlocks = await Promise.all(
    limitedSlides.map(async (entry) => {
      const slideNumber = getSlideNumber(entry.name);
      const slideText = extractPptxSlideText(await entry.async("string"));
      return `[投影片 ${slideNumber}]\n${slideText || "（此頁沒有可擷取文字，請參考附帶圖片。）"}`;
    }),
  );

  const imageEntries = Object.values(archive.files)
    .filter((entry) => {
      if (entry.dir || !/^ppt\/media\//i.test(entry.name)) return false;
      return Boolean(PPTX_IMAGE_MIME_TYPES[getFileExtension(entry.name)]);
    })
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
  const images: PptxInlineImage[] = [];
  let imageBytes = 0;

  for (const entry of imageEntries) {
    if (images.length >= MAX_PPTX_IMAGE_PARTS) break;
    const bytes = await entry.async("uint8array");
    if (imageBytes + bytes.byteLength > MAX_PPTX_IMAGE_BYTES) continue;

    imageBytes += bytes.byteLength;
    images.push({
      data: bytesToBase64(bytes),
      mimeType: PPTX_IMAGE_MIME_TYPES[getFileExtension(entry.name)],
      name: entry.name.split("/").pop() || entry.name,
    });
  }

  const extractionNotes = [
    `PowerPoint 檔案：${file.name}`,
    `投影片總數：${slideEntries.length}`,
    `已附帶可分析圖片：${images.length} 張`,
  ];
  if (slideEntries.length > limitedSlides.length) {
    extractionNotes.push(`僅擷取前 ${MAX_PPTX_SLIDES} 頁文字`);
  }
  if (imageEntries.length > images.length) {
    extractionNotes.push(
      `圖片數量或大小超過限制，已選取前 ${images.length} 張支援圖片`,
    );
  }

  const text = `${extractionNotes.join("\n")}\n\n${slideBlocks.join("\n\n")}`.slice(
    0,
    MAX_PPTX_TEXT_CHARACTERS,
  );

  if (!slideBlocks.some((block) => !block.includes("此頁沒有可擷取文字")) && images.length === 0) {
    throw new Error(`${file.name} 沒有可擷取的文字或支援圖片，請另存為 PDF 後再上傳`);
  }

  return { images, slideCount: slideEntries.length, text };
}

