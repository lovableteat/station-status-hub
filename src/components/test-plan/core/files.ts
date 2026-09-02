import type {
  TestPlanFileCategory,
  TestPlanUploadCandidate,
} from "../types.ts";

export const TEST_PLAN_MAX_FILE_SIZE = 500 * 1024 ** 2;
export const TEST_PLAN_MAX_BATCH_SIZE = 20;
export const TEST_PLAN_MAX_BATCH_BYTES = 1024 ** 3;

const CATEGORY_EXTENSIONS: Record<
  Exclude<TestPlanFileCategory, "other">,
  ReadonlySet<string>
> = {
  presentation: new Set(["key", "odp", "pps", "ppsx", "ppt", "pptm", "pptx"]),
  spreadsheet: new Set([
    "csv",
    "ods",
    "tsv",
    "xls",
    "xlsb",
    "xlsm",
    "xlsx",
    "xlt",
    "xltx",
  ]),
  document: new Set([
    "asm",
    "bash",
    "bat",
    "c",
    "cc",
    "cfg",
    "cmake",
    "cmd",
    "conf",
    "cpp",
    "cs",
    "cxx",
    "diff",
    "doc",
    "docm",
    "docx",
    "dts",
    "dtso",
    "env",
    "go",
    "gradle",
    "h",
    "hpp",
    "ini",
    "java",
    "js",
    "json",
    "jsx",
    "kt",
    "kts",
    "lock",
    "log",
    "lua",
    "md",
    "odt",
    "patch",
    "pdf",
    "php",
    "pl",
    "properties",
    "ps1",
    "py",
    "rb",
    "rs",
    "s",
    "scala",
    "sh",
    "sql",
    "sv",
    "svh",
    "swift",
    "tcl",
    "tex",
    "toml",
    "ts",
    "tsx",
    "txt",
    "v",
    "vh",
    "vhd",
    "vhdl",
    "xml",
    "yaml",
    "yml",
    "zsh",
  ]),
  image: new Set([
    "bmp",
    "gif",
    "heic",
    "heif",
    "jpeg",
    "jpg",
    "png",
    "svg",
    "tif",
    "tiff",
    "webp",
  ]),
  "3d": new Set([
    "dae",
    "dwg",
    "dxf",
    "f3d",
    "fbx",
    "iam",
    "ipt",
    "step",
    "stp",
    "stl",
    "obj",
    "glb",
    "gltf",
    "3mf",
    "iges",
    "igs",
    "ply",
    "sldasm",
    "sldprt",
    "wrl",
    "x_b",
    "x_t",
  ]),
  pcb: new Set([
    "brd",
    "cam",
    "drl",
    "dsn",
    "gbl",
    "gbo",
    "gbr",
    "gbs",
    "ger",
    "gko",
    "gml",
    "gm1",
    "gto",
    "gtl",
    "gts",
    "ipc",
    "ipc2581",
    "kicad_mod",
    "kicad_pcb",
    "kicad_pro",
    "kicad_sch",
    "kicad_sym",
    "kicad_wks",
    "odb",
    "pho",
    "pcb",
    "sch",
    "ses",
    "xln",
  ]),
  archive: new Set([
    "7z",
    "bz2",
    "gz",
    "rar",
    "tar",
    "tgz",
    "xz",
    "zip",
    "zst",
  ]),
};

const ENGINEERING_OTHER_EXTENSIONS = new Set([
  "bin",
  "bit",
  "coe",
  "dtb",
  "elf",
  "hex",
  "img",
  "jed",
  "map",
  "mcs",
  "mem",
  "mot",
  "rom",
  "s19",
  "srec",
  "uf2",
]);

const BLOCKED_EXTENSIONS = new Set([
  "apk",
  "appimage",
  "com",
  "cpl",
  "dmg",
  "dll",
  "exe",
  "jar",
  "lnk",
  "msi",
  "pif",
  "scr",
  "sys",
  "vbs",
]);

export type TestPlanUploadErrorCode =
  | "blocked-extension"
  | "file-size"
  | "invalid-file"
  | "batch-limit"
  | "batch-size";

export interface TestPlanUploadError {
  fileName: string;
  code: TestPlanUploadErrorCode;
  message: string;
}

export interface TestPlanUploadValidation<T extends TestPlanUploadCandidate> {
  valid: T[];
  errors: TestPlanUploadError[];
}

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
}

export function validateTestPlanFileName(
  fileName: string,
): TestPlanUploadError | null {
  const normalized = fileName.trim();
  if (
    !normalized
    || normalized === "."
    || normalized === ".."
    || normalized.length > 255
    || /[\\/]/u.test(normalized)
    || containsControlCharacter(normalized)
  ) {
    return {
      fileName,
      code: "invalid-file",
      message: "檔案名稱無效。",
    };
  }
  const extension = getTestPlanFileExtension(normalized);
  if (extension.length > 32) {
    return {
      fileName,
      code: "invalid-file",
      message: "副檔名不可超過 32 個字元。",
    };
  }
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
  let acceptedBytes = 0;

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
    if (acceptedBytes + file.size > TEST_PLAN_MAX_BATCH_BYTES) {
      errors.push({
        fileName: file.name,
        code: "batch-size",
        message: "單次上傳總容量不可超過 1 GiB。",
      });
      return;
    }
    acceptedBytes += file.size;
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
  const extension = getSafeStorageExtension(fileName);
  const extensionIndex = fileName.lastIndexOf(".");
  const sourceStem =
    extension && extensionIndex > 0
      ? fileName.slice(0, extensionIndex)
      : fileName;
  const stem = sourceStem
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\x20-\x7e]/gu, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 140);
  return `${stem || "engineering-file"}${extension ? `.${extension}` : ""}`;
}

const STORAGE_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function assertStorageSegment(value: string, label: string): string {
  const normalized = value.trim();
  if (!STORAGE_SEGMENT_PATTERN.test(normalized)) {
    throw new Error(`${label}包含無法建立安全儲存路徑的字元。`);
  }
  return normalized;
}

function getSafeStorageExtension(fileName: string): string {
  const extension = getTestPlanFileExtension(fileName);
  return /^[a-z0-9][a-z0-9_]{0,31}$/.test(extension)
    ? extension
    : "";
}

export function buildStoragePath(
  ownerId: string,
  projectId: string,
  spaceId: string,
  fileName: string,
  objectId = crypto.randomUUID(),
): string {
  const extension = getSafeStorageExtension(fileName);
  const objectName = `${assertStorageSegment(objectId, "檔案識別碼")}${
    extension ? `.${extension}` : ""
  }`;
  return [
    assertStorageSegment(ownerId, "使用者識別碼"),
    assertStorageSegment(projectId, "專案識別碼"),
    assertStorageSegment(spaceId, "空間識別碼"),
    objectName,
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

const TEST_PLAN_PRIMARY_ACCEPT = [
  ".pptx",
  ".xlsx",
  ".step",
  ".brd",
] as const;

export const TEST_PLAN_FILE_ACCEPT = Array.from(
  new Set([
    ...TEST_PLAN_PRIMARY_ACCEPT,
    ...Object.values(CATEGORY_EXTENSIONS).flatMap((extensions) => [
      ...Array.from(extensions, (extension) => `.${extension}`),
    ]),
    ...Array.from(
      ENGINEERING_OTHER_EXTENSIONS,
      (extension) => `.${extension}`,
    ),
  ]),
)
  .sort()
  .join(",");
