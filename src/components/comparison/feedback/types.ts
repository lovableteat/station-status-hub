export const FEEDBACK_CATEGORIES = { bug: "功能問題", ui: "畫面問題", suggestion: "改善建議", other: "其他" } as const;
export const FEEDBACK_STATUSES = { new: "未處理", in_progress: "處理中", resolved: "已修正" } as const;
export const FEEDBACK_TABS = { compare: "比對檢查", review: "審查追蹤", power: "Power Tree", i2c: "I²C Map", library: "位址庫" } as const;
export type FeedbackCategory = keyof typeof FEEDBACK_CATEGORIES;
export type FeedbackStatus = keyof typeof FEEDBACK_STATUSES;
export type FeedbackTab = keyof typeof FEEDBACK_TABS;
export interface FeedbackContext { browser: string; width: number; height: number; revisionA: string; revisionB: string }
export interface FeedbackImage { id: string; name: string; path: string; mime: "image/png" | "image/jpeg" | "image/webp"; size: number }
export interface FeedbackAttachment { id: string; file: File }
export interface FeedbackDraft {
  id: string; reporterId: string; title: string; description: string; category: FeedbackCategory;
  tab: FeedbackTab; projectName: string; context: FeedbackContext; screenshots: FeedbackImage[];
}
export interface FeedbackReport extends Omit<FeedbackDraft, "reporterId"> {
  reporterId: string | null; attachmentOwnerId: string; reporterName: string; reporterUsername: string;
  isSubmitted: boolean; status: FeedbackStatus; adminNote: string; createdAt: string;
  submittedAt: string | null; updatedAt: string;
}
export interface FeedbackFilters { query: string; status: FeedbackStatus | "all"; owner: string; category: FeedbackCategory | "all" }
export interface FeedbackAdapter {
  listReports(adminMode?: boolean): Promise<FeedbackReport[]>;
  getReport(id: string): Promise<FeedbackReport | null>;
  createDraft(draft: FeedbackDraft): Promise<FeedbackReport>;
  submitDraft(id: string): Promise<FeedbackReport>;
  abandonDraft(id: string): Promise<void>;
  uploadImage(image: FeedbackImage, file: File): Promise<void>;
  removeImages(paths: string[]): Promise<void>;
  downloadImage(path: string): Promise<Blob>;
  reviewReport(report: FeedbackReport, reviewerId: string, status: FeedbackStatus, note: string): Promise<FeedbackReport>;
}
