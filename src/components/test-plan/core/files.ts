import type {
  TestPlanFileCategory,
  TestPlanUploadCandidate,
} from "../types.ts";

export const TEST_PLAN_MAX_FILE_SIZE = 500 * 1024 ** 2;
export const TEST_PLAN_MAX_BATCH_SIZE = 20;

const CATEGORY_EXTENSIONS: Record<
  Exclude<TestPlanFileCategory, "other">,
  ReadonlySet<string>
> = {
  presentation: new Set(["ppt", "pptx"]),
  spreadsheet: new Set(["xls", "xlsx", "xlsm", "csv"]),
  document: new Set(["pdf", "doc", "docx", "txt", "md"]),
  image: new Set(["png", "jpg", "jpeg", "webp", "svg"]),
  "3d": new Set([
    "step",
    "stp",
    "stl",
    "obj",
    "glb",
    "gltf",
    "3mf",
    "iges",
    "igs",
  ]),
  pcb: new Set(["brd", "kicad_pcb", "gbr", "ger", "pho"]),
  archive: new Set(["zip", "7z", "rar", "tar", "gz"]),
};

const BLOCKED_EXTENSIONS = new Set([
  "apk",
  "appimage",
  "bat",
  "cmd",
  "com",
  "dll",
  "exe",
  "jar",
  "js",
  "msi",
  "ps1",
  "scr",
  "sh",
  "vbs",
]);

export type TestPlanUploadErrorCode =
  | "blocked-extension"
  | "file-size"
  | "invalid-file"
  | "batch-limit";

export interface TestPlanUploadError {
  fileName: string;
  code: TestPlanUploadErrorCode;
  message: string;
}

export interface TestPlanUploadValidation<T extends TestPlanUploadCandidate> {
  valid: T[];
  errors: TestPlanUploadError[];
}

export function validateTestPlanFileName(
  fileName: string,
): TestPlanUploadError | null {
  const normalized = fileName.trim();
  if (!normalized) {
    return {
      fileName,
      code: "invalid-file",
      message: "檔案名稱無效。",
    };
  }
  const extension = getTestPlanFileExtension(normalized);
  if (BLOCKED_EXTENSIONS.has(extension)) {
    return {
      fileName,
      code: "blocked-extension",
      message: `基於安全性，不允許上傳 .${extension || "unknown"} 檔案。`,
    };
  }
  return null;
}

export function getTestPlanFileExtension(fileName: string): string {
  const normalized = fileName.normalize("NFKC").trim().toLocaleLowerCase();
  const index = normalized.lastIndexOf(".");
  return index > -1 && index < normalized.length - 1
    ? normalized.slice(index + 1)
    : "";
}

export function classifyTestPlanFile(fileName: string): TestPlanFileCategory {
  const extension = getTestPlanFileExtension(fileName);
  const category = Object.entries(CATEGORY_EXTENSIONS).find(([, extensions]) =>
    extensions.has(extension));
  return (category?.[0] as TestPlanFileCategory | undefined) ?? "other";
}

export function validateTestPlanUpload<T extends TestPlanUploadCandidate>(
  incoming: readonly T[],
): TestPlanUploadValidation<T> {
  const valid: T[] = [];
  const errors: TestPlanUploadError[] = [];
  const candidates = incoming.slice(0, TEST_PLAN_MAX_BATCH_SIZE);

  candidates.forEach((file) => {
    const nameError = validateTestPlanFileName(file.name);
    if (nameError) {
      errors.push(nameError);
      return;
    }
    if (!Number.isFinite(file.size) || file.size < 0) {
      errors.push({
        fileName: file.name,
        code: "invalid-file",
        message: "檔案名稱或大小無效。",
      });
      return;
    }
    if (file.size > TEST_PLAN_MAX_FILE_SIZE) {
      errors.push({
        fileName: file.name,
        code: "file-size",
        message: "單一檔案不可超過 500 MB。",
      });
      return;
    }
    valid.push(file);
  });

  if (incoming.length > TEST_PLAN_MAX_BATCH_SIZE) {
    errors.push({
      fileName: "",
      code: "batch-limit",
      message: `一次最多上傳 ${TEST_PLAN_MAX_BATCH_SIZE} 個檔案。`,
    });
  }

  return { valid, errors };
}

export function sanitizeTestPlanFileName(fileName: string): string {
  const normalized = fileName
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|#%]+/g, "-")
    .replace(/\.{2,}/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+/, "")
    .slice(-180);
  const safe = normalized || "engineering-file";
  const extension = getTestPlanFileExtension(safe);
  if (!extension) return safe;
  return `${safe.slice(0, -(extension.length + 1))}.${extension}`;
}

export function buildStoragePath(
  ownerId: string,
  spaceId: string,
  fileName: string,
  objectId = crypto.randomUUID(),
): string {
  return [
    encodeURIComponent(ownerId),
    encodeURIComponent(spaceId),
    `${encodeURIComponent(objectId)}-${sanitizeTestPlanFileName(fileName)}`,
  ].join("/");
}

export function formatTestPlanFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;
  return `${index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

export const TEST_PLAN_FILE_ACCEPT = [
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".xlsm",
  ".csv",
  ".pdf",
  ".doc",
  ".docx",
  ".txt",
  ".md",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".step",
  ".stp",
  ".stl",
  ".obj",
  ".glb",
  ".gltf",
  ".3mf",
  ".iges",
  ".igs",
  ".brd",
  ".kicad_pcb",
  ".gbr",
  ".ger",
  ".pho",
  ".zip",
  ".7z",
  ".rar",
  ".tar",
  ".gz",
].join(",");
