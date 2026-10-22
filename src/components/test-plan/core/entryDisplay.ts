import type { TestPlanEntry, TestPlanFileCategory } from "../types";

const TYPE_LABELS: Record<TestPlanFileCategory, string> = {
  presentation: "簡報",
  spreadsheet: "Excel 試算表",
  document: "文件",
  image: "圖片",
  "3d": "3D 圖檔",
  pcb: "PCB／BRD",
  archive: "壓縮檔",
  other: "檔案",
};

export function describeEntryType(entry: TestPlanEntry) {
  if (entry.kind === "folder") return "檔案資料夾";
  const extension = entry.extension.toUpperCase();
  if (entry.category === "document" && extension === "PDF") return "PDF 文件";
  if (entry.category === "image") return `${extension || "圖片"} 圖片`;
  return TYPE_LABELS[entry.category] ?? (extension ? `${extension} 檔案` : "檔案");
}

export function formatEntryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未提供";
  return date.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
