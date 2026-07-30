import type { TestPlanFileRecord } from "../types";

export type TestPlanPreviewKind = "image" | "pdf" | "text" | "unsupported";

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
  if (mimeType === "application/pdf" || extension === "pdf") {
    return "pdf";
  }
  if (TEXT_EXTENSIONS.has(extension)) {
    return "text";
  }
  return "unsupported";
}
