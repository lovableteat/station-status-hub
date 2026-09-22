import { readManagerAssessment } from './rd2Assessment.mjs';

export const PERFORMANCE_RETURN_NOTIFICATION_TYPE =
  "performance_review_returned";

export function buildPerformanceReturnActionUrl({
  currentUrl,
  reviewId,
  cycleId,
  category,
  entryId,
}) {
  const url = new URL(currentUrl);
  url.searchParams.set("workspace", "performance");
  url.searchParams.delete("module");
  url.hash = `/?${new URLSearchParams({
    performanceTab: "self",
    performanceCycle: cycleId,
    performanceReview: reviewId,
    ...(category && entryId ? { performanceCategory: category, performanceEntry: entryId } : {}),
  }).toString()}`;
  return url.toString();
}

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

  const lastReturn = readManagerAssessment(review.managerFeedback).returnHistory.at(-1);
  const target = lastReturn?.entries.length === 1 ? lastReturn.entries[0] : null;
  return {
    ...(lastReturn ? { id: lastReturn.id } : {}),
    recipient_id: recipientId,
    sender_id: senderId,
    notification_type: PERFORMANCE_RETURN_NOTIFICATION_TYPE,
    title: "績效自評已退回補充",
    message: `${senderName || "直屬主管"} 已退回你的本期自評，請查看退回回饋並補充後重新送出。`,
    reference_type: "performance_review",
    reference_id: null,
    action_url: buildPerformanceReturnActionUrl({
      currentUrl,
      reviewId: review.id,
      cycleId: review.cycleId,
      category: target?.category,
      entryId: target?.entryId,
    }),
    category: "system",
    priority: "high",
    status: "pending",
    is_read: false,
    metadata: {
      module: "performance",
      performance_tab: "self",
      review_id: review.id,
      cycle_id: review.cycleId,
      employee_name: review.employeeName || "",
    },
  };
}
