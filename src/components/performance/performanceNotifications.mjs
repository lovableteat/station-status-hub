import { readManagerAssessment } from './rd2Assessment.mjs';

export const PERFORMANCE_RETURN_NOTIFICATION_TYPE =
  "performance_review_returned";

export function buildPerformanceReturnNotification({
  review,
  recipientId,
  senderId,
  senderName,
  currentUrl,
}) {
  if (!review?.id || !review?.cycleId || !recipientId || !senderId) {
    throw new Error("Missing performance return notification identity");
  }

  const url = new URL(currentUrl);
  url.searchParams.set("workspace", "performance");
  url.searchParams.delete("module");
  const lastReturn = readManagerAssessment(review.managerFeedback).returnHistory.at(-1);
  const target = lastReturn?.entries.length === 1 ? lastReturn.entries[0] : null;
  url.hash = `/?${new URLSearchParams({
    performanceTab: "self",
    performanceCycle: review.cycleId,
    performanceReview: review.id,
    ...(target ? { performanceCategory: target.category, performanceEntry: target.entryId } : {}),
  }).toString()}`;

  return {
    ...(lastReturn ? { id: lastReturn.id } : {}),
    recipient_id: recipientId,
    sender_id: senderId,
    notification_type: PERFORMANCE_RETURN_NOTIFICATION_TYPE,
    title: "績效自評已退回補充",
    message: `${senderName || "直屬主管"} 已退回你的本期自評，請查看退回回饋並補充後重新送出。`,
    reference_type: "performance_review",
    // Older/new assessment IDs are text (performance-...), while the shared
    // notification reference column is UUID. The full ID belongs in metadata.
    reference_id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(review.id) ? review.id : null,
    action_url: url.toString(),
    category: "performance",
    priority: "high",
    status: "pending",
    is_read: false,
    metadata: {
      cycle_id: review.cycleId,
      review_id: review.id,
      employee_name: review.employeeName || "",
    },
  };
}
