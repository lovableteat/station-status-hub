import type { BomPageTrackerPage } from "./materialBomStorage";

export interface PdfPageTitle { pageNumber: number; title: string }

export function parsePdfPageTitles(text: string, expectedPages: number[]): PdfPageTitle[] {
  const parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  if (!Array.isArray(parsed?.pages) || parsed.pages.length !== expectedPages.length) throw new Error("AI 回傳的頁數不完整，請重新辨識。");
  const found = new Map<number, string>();
  for (const page of parsed.pages) {
    if (!Number.isInteger(page?.pageNumber) || !expectedPages.includes(page.pageNumber) || found.has(page.pageNumber)
      || (typeof page.title !== "string" && page.title !== null)) throw new Error("AI 回傳的頁碼或標題格式不正確，請重新辨識。");
    const title = (page.title ?? "").replace(/\s+/g, " ").trim();
    if (title.length > 300) throw new Error(`第 ${page.pageNumber} 頁標題過長，請重新辨識。`);
    found.set(page.pageNumber, title);
  }
  return expectedPages.map(pageNumber => ({ pageNumber, title: found.get(pageNumber)! }));
}

export function applyPdfPageTitles(existing: BomPageTrackerPage[], titles: PdfPageTitle[]): BomPageTrackerPage[] {
  const pages = new Map(existing.map(page => [page.pageNumber, { ...page }]));
  for (const page of titles) {
    const previous = pages.get(page.pageNumber) ?? { pageNumber: page.pageNumber, status: "pending" as const, note: "" };
    pages.set(page.pageNumber, { ...previous, ...(page.title.trim() ? { title: page.title.trim() } : {}) });
  }
  return [...pages.values()].sort((a, b) => a.pageNumber - b.pageNumber);
}
