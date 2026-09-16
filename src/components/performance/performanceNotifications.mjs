export const PERFORMANCE_RETURN_NOTIFICATION_TYPE =
  "performance_review_returned";

export function buildPerformanceReturnActionUrl({
  currentUrl,
  reviewId,
  cycleId,
}) {
  const url = new URL(currentUrl);
  url.searchParams.set("workspace", "performance");
  url.searchParams.delete("module");
  url.hash = `/?${new URLSearchParams({
    performanceTab: "self",
    performanceCycle: cycleId,
    performanceReview: reviewId,
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

  return {
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
