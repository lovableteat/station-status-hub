import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, FEEDBACK_TABS } from "./types.ts";
import type { FeedbackAttachment, FeedbackDraft, FeedbackFilters, FeedbackImage, FeedbackReport } from "./types.ts";

export const MAX_FEEDBACK_IMAGES = 5;
export const MAX_FEEDBACK_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_FEEDBACK_EXPORT_BYTES = 500 * 1024 * 1024;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const imageExtensions = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;

export function validateFeedbackText(input: Pick<FeedbackDraft, "id" | "reporterId" | "title" | "description" | "category" | "tab" | "projectName">) {
  if (!UUID_PATTERN.test(input.id) || !UUID_PATTERN.test(input.reporterId)) throw new Error("登入或回報識別資料無效，請重新登入後再試。");
  if (!input.title.trim() || input.title.trim().length > 120) throw new Error("請填寫問題標題，最多 120 字。");
  if (!input.description.trim() || input.description.trim().length > 4000) throw new Error("請填寫問題說明，最多 4000 字。");
  if (!Object.keys(FEEDBACK_CATEGORIES).includes(input.category) || !Object.keys(FEEDBACK_TABS).includes(input.tab) || input.projectName.length > 120) throw new Error("回報的頁面或分類資料無效。");
}

export async function detectImageMime(file: Blob): Promise<FeedbackImage["mime"]> {
  if (!file.size || file.size > MAX_FEEDBACK_IMAGE_BYTES) throw new Error("截圖必須有內容，且每張不可超過 10 MB。");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  const mime = png.every((byte, index) => bytes[index] === byte) ? "image/png"
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg"
      : new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP" ? "image/webp" : null;
  if (!mime || (file.type && file.type !== mime)) throw new Error("請使用有效的 PNG、JPG 或 WebP 截圖。");
  return mime;
}

export async function prepareFeedbackImages(reportId: string, reporterId: string, attachments: readonly FeedbackAttachment[]) {
  if (!UUID_PATTERN.test(reportId) || !UUID_PATTERN.test(reporterId)) throw new Error("回報識別資料無效。");
  if (attachments.length > MAX_FEEDBACK_IMAGES) throw new Error("最多可附上 5 張截圖。");
  if (new Set(attachments.map(image => image.id)).size !== attachments.length) throw new Error("截圖識別不可重複。");
  return Promise.all(attachments.map(async ({ id, file }): Promise<FeedbackImage> => {
    if (!UUID_PATTERN.test(id)) throw new Error("截圖識別資料無效。");
    const mime = await detectImageMime(file);
    return { id, name: (file.name || `截圖.${imageExtensions[mime]}`).slice(0, 180), path: `${reporterId}/${reportId}/${id}.${imageExtensions[mime]}`, mime, size: file.size };
  }));
}

export function validateFeedbackImageRecord(image: FeedbackImage, reportId: string, attachmentOwnerId: string): void {
  if (!image || !UUID_PATTERN.test(image.id) || !UUID_PATTERN.test(reportId) || !UUID_PATTERN.test(attachmentOwnerId)
    || !Object.keys(imageExtensions).includes(image.mime) || typeof image.name !== "string" || !image.name || image.name.length > 180
    || !Number.isSafeInteger(image.size) || image.size < 1 || image.size > MAX_FEEDBACK_IMAGE_BYTES
    || image.path !== `${attachmentOwnerId}/${reportId}/${image.id}.${imageExtensions[image.mime]}`) {
    throw new Error("回報內的截圖資料不完整，請重新整理後再試。");
  }
}

export function feedbackMatchesDraft(report: FeedbackReport, draft: FeedbackDraft): boolean {
  return report.reporterId === draft.reporterId && report.title === draft.title.trim()
    && report.description === draft.description.trim() && report.category === draft.category
    && report.tab === draft.tab && report.projectName === draft.projectName
    && report.screenshots.length === draft.screenshots.length && report.screenshots.every((image, index) => {
      const expected = draft.screenshots[index];
      return image.id === expected.id && image.name === expected.name && image.path === expected.path && image.mime === expected.mime && image.size === expected.size;
    });
}

export function filterFeedbackReports(reports: readonly FeedbackReport[], filters: FeedbackFilters) {
  const query = filters.query.trim().toLocaleLowerCase();
  return reports.filter(report => (!query || [report.title, report.description, report.projectName, report.reporterName, report.reporterUsername, report.adminNote, report.id].some(text => text.toLocaleLowerCase().includes(query)))
    && (filters.status === "all" || report.status === filters.status)
    && (!filters.owner || (report.reporterId ?? `deleted:${report.reporterUsername}`) === filters.owner)
    && (filters.category === "all" || report.category === filters.category));
}

export function assertReviewInput(status: string, note: string) {
  if (!Object.keys(FEEDBACK_STATUSES).includes(status) || note.length > 2000) throw new Error("處理狀態無效，或備註超過 2000 字。");
}

export function feedbackDate(value: string | Date): string {
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

export function feedbackExportPath(report: FeedbackReport, image: FeedbackImage): string {
  validateFeedbackImageRecord(image, report.id, report.attachmentOwnerId);
  return `screenshots/${report.id}/${image.id}.${imageExtensions[image.mime]}`;
}
