import type { TestPlanFileRecord } from "../types";

export type TestPlanPreviewKind = "image" | "pdf" | "text" | "unsupported";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "log"]);

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

  if (mimeType.startsWith("image/") || IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  if (mimeType === "application/pdf" || extension === "pdf") {
    return "pdf";
  }
  if (mimeType.startsWith("text/") || TEXT_EXTENSIONS.has(extension)) {
    return "text";
  }
  return "unsupported";
}
