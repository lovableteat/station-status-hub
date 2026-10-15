/** The editor keeps native DRAWIO XML intact, including compressed pages. */
export interface DrawioDocument {
  version: 1;
  id: string;
  title: string;
  xml: string;
  createdAt: string;
  updatedAt: string;
}

export const MAX_DRAWIO_BYTES = 20 * 1024 * 1024;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const FIELDS = ["version", "id", "title", "xml", "createdAt", "updatedAt"];

function fail(detail: string): never { throw new Error(`DRAWIO 圖稿資料無效：${detail}`); }

function timestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function title(value: unknown): value is string {
  return typeof value === "string" && value.length <= 240 && Boolean(value.trim())
    && !Array.from(value).some(character => {
      const code = character.charCodeAt(0);
      return code === 127 || code < 32 && ![9, 10, 13].includes(code);
    });
}

/** Validate the native container without decoding, normalizing or converting it. */
export function validateDrawioXml(xml: string, Parser: typeof DOMParser = globalThis.DOMParser): string {
  if (typeof xml !== "string" || !xml.length) fail("請選擇 .drawio 或 XML 圖稿");
  if (xml.length > MAX_DRAWIO_BYTES || new TextEncoder().encode(xml).byteLength > MAX_DRAWIO_BYTES) fail("單份圖稿上限為 20 MB");
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) fail("不支援 DOCTYPE 或 ENTITY 宣告");
  if (typeof Parser !== "function") fail("瀏覽器不支援 XML 讀取，請使用支援 DRAWIO 的瀏覽器");
  let parsed: Document;
  try { parsed = new Parser().parseFromString(xml, "application/xml"); }
  catch { fail("XML 格式錯誤，原有圖稿已保留"); }
  const root = parsed.documentElement;
  if (!root || parsed.doctype || parsed.getElementsByTagName("parsererror").length) fail("XML 格式錯誤，原有圖稿已保留");
  if (root.tagName !== "mxGraphModel" && (root.tagName !== "mxfile"
    || !Array.from(root.children).some(child => child.tagName === "diagram"))) fail("檔案必須是含有頁面的 mxfile 或 mxGraphModel 圖稿");
  return xml;
}

/** Produce detached plain data; never invoke accessors in imported objects. */
export function parseDrawioDocument(value: unknown): DrawioDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail("必須是一般 JSON 物件");
  const fields = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(fields)) {
    if (typeof key !== "string" || !FIELDS.includes(key) || !("value" in fields[key])) fail("含有未知欄位、原型或存取器");
  }
  if (FIELDS.some(key => !Object.prototype.hasOwnProperty.call(fields, key))) fail("缺少必要欄位");
  const document = value as Record<string, unknown>;
  if (document.version !== 1 || typeof document.id !== "string" || !ID.test(document.id)
    || !title(document.title) || !timestamp(document.createdAt) || !timestamp(document.updatedAt)) fail("版本、識別碼、名稱或時間");
  const xml = validateDrawioXml(document.xml as string);
  return { version: 1, id: document.id, title: document.title, xml, createdAt: document.createdAt, updatedAt: document.updatedAt };
}

export function createBlankDrawioDocument(name = "未命名 DRAWIO 圖表"): DrawioDocument {
  const now = new Date().toISOString();
  return parseDrawioDocument({
    version: 1, id: `drawio-${crypto.randomUUID()}`, title: name.trim() || "未命名 DRAWIO 圖表", createdAt: now, updatedAt: now,
    xml: '<mxfile host="AutoCheck"><diagram id="page-1" name="第 1 頁"><mxGraphModel dx="0" dy="0" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>',
  });
}
