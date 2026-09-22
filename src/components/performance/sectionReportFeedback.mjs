import { safeManagerAttachments } from "./assessmentAttachmentPolicy.mjs";

const text = (value) => typeof value === "string" ? value : "";

export function readSectionReportFeedbackHistory(value) {
  const rows = typeof value === "string"
    ? (() => { try { return JSON.parse(value); } catch { return []; } })()
    : value;
  return (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const action = row?.action === "approve" ? "approve" : row?.action === "return" ? "return" : "";
    const attachments = safeManagerAttachments(row?.attachments);
    const feedback = text(row?.feedback).trim();
    if (!action || (!feedback && !attachments.length)) return [];
    return [{
      id: text(row?.id) || `${text(row?.reviewedAt)}-${action}`,
      action,
      feedback,
      attachments,
      reviewerName: text(row?.reviewerName) || "部長",
      reviewedAt: text(row?.reviewedAt),
    }];
  });
}

export function getSectionReportRoleCopy(orgLevel) {
  return orgLevel === "director"
    ? {
        heading: "評核直屬課長",
        description: "查看直屬課長的個人自評、給分與回饋；代理課別同仁也在這裡處理。",
        selfHint: "課長本人的考核請到「主管評分」處理。",
      }
    : {
        heading: "評核直屬同仁",
        description: "查看本課同仁的個人自評、給分與逐項回覆。",
        selfHint: "你的自評請到「員工自評」填寫與查看。",
      };
}
