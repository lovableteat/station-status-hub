import type { TestPlanFileRecord } from "../types";

export type TestPlanPreviewKind = "image" | "svg" | "pdf" | "text" | "sheet" | "archive" | "unsupported";

/**
 * Bytes the preview pane may pull into the browser for each kind. PDFs and
 * raster images stream from a short-lived link instead, so these caps only
 * apply when the storage cannot hand out links.
 */
export const TEST_PLAN_PREVIEW_LIMITS: Record<Exclude<TestPlanPreviewKind, "unsupported">, number> = {
  image: 60 * 1024 * 1024,
  pdf: 60 * 1024 * 1024,
  svg: 8 * 1024 * 1024,
  text: 5 * 1024 * 1024,
  sheet: 25 * 1024 * 1024,
  archive: 150 * 1024 * 1024,
};

const SHEET_EXTENSIONS = new Set(["xlsx", "xlsm", "xls", "xlsb", "ods"]);

const IMAGE_EXTENSIONS = new Set([
  "bmp",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "tif",
  "tiff",
  "webp",
]);
const TEXT_EXTENSIONS = new Set([
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
  "csv",
  "cxx",
  "diff",
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
  "patch",
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
  "tsv",
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
]);

type PreviewCandidate = Pick<
  TestPlanFileRecord,
  "extension" | "mimeType" | "originalName"
>;

export function getTestPlanPreviewKind(
  file: PreviewCandidate,
): TestPlanPreviewKind {
  const extension = file.extension.trim().toLowerCase()
    || file.originalName.split(".").pop()?.toLowerCase()
    || "";
  const mimeType = file.mimeType?.toLowerCase() ?? "";

  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  // SVG can carry script. It is only ever shown as a data: URL inside <img>,
  // where scripts never run and the address cannot be opened as a page.
  if (extension === "svg" || mimeType === "image/svg+xml") {
    return "svg";
  }
  if (mimeType === "application/pdf" || extension === "pdf") {
    return "pdf";
  }
  if (TEXT_EXTENSIONS.has(extension)) {
    return "text";
  }
  if (SHEET_EXTENSIONS.has(extension)) {
    return "sheet";
  }
  if (extension === "zip") {
    return "archive";
  }
  return "unsupported";
}
