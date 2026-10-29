import { getLatestTrackingEntry } from "./materialRequestUtils";
import type { MaterialTrackingHistoryImage, MaterialWorkbookRecord } from "./materialRequestUtils";
import { MATERIAL_TRACKING_STATUS_OPTIONS } from "./materialTrackingStatus";
export { MATERIAL_TRACKING_STATUS_OPTIONS } from "./materialTrackingStatus";

export interface MaterialTrackingDraft {
  sessionId: string;
  status: string;
  note: string;
  requestTicket: string;
  requestUrl: string;
  createdBy: string;
  requestInfo: string;
  images: MaterialTrackingHistoryImage[];
  pendingImageReads: number;
}

export function normalizeMaterialRequestUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : /^[\w.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(trimmed) ? `https://${trimmed}` : '';
  try { return new URL(candidate).hostname ? candidate : ''; } catch { return ''; }
}

export function createMaterialTrackingDraft(record: MaterialWorkbookRecord): MaterialTrackingDraft {
  return {
    sessionId: crypto.randomUUID(),
    status: "",
    note: "",
    requestTicket: record.requestTicket ?? "",
    requestUrl: record.requestUrl ?? "",
    createdBy: "",
    requestInfo: "",
    images: [],
    pendingImageReads: 0,
  };
}

export function applyMaterialTrackingDraft(record: MaterialWorkbookRecord, draft: MaterialTrackingDraft, defaultAuthor = ""): MaterialWorkbookRecord {
  if (draft.pendingImageReads > 0) throw new Error("圖片仍在讀取中，請稍候再儲存。");
  const status = draft.status.trim();
  if (!status && (draft.note.trim() || draft.createdBy.trim() || draft.requestInfo.trim() || draft.images.length)) {
    throw new Error("請先選擇追蹤狀態，再儲存這次進度與圖片。");
  }
  if (status && !MATERIAL_TRACKING_STATUS_OPTIONS.some((option) => option === status)) throw new Error("請選擇有效的追蹤狀態。");
  const requestUrl = normalizeMaterialRequestUrl(draft.requestUrl);
  if (draft.requestUrl.trim() && !requestUrl) throw new Error('連結請填寫有效的 http／https 網址，或清空後再儲存。');
  const next = { ...record, requestTicket: draft.requestTicket.trim(), requestUrl };
  if (!status) return next;

  const legacy = !record.trackingHistory?.length ? getLatestTrackingEntry(record) : null;
  return {
    ...next,
    trackingStatus: status,
    trackingHistory: [
      ...(record.trackingHistory ?? []),
      ...(legacy ? [legacy] : []),
      {
        id: `tracking-${crypto.randomUUID()}`,
        status,
        note: draft.note.trim(),
        requestTicket: next.requestTicket,
        requestUrl: next.requestUrl,
        createdAt: new Date().toISOString(),
        createdBy: draft.createdBy.trim() || defaultAuthor.trim(),
        requestInfo: draft.requestInfo.trim(),
        images: draft.images.map((image) => ({ ...image })),
      },
    ],
  };
}
