import { normalizePerformanceReview } from "./performanceData.mjs";
import { readManagerAssessment, serializeManagerAssessment } from "./rd2Assessment.mjs";

const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;

export async function saveAssessmentRecord(db, review, previous) {
  const payload = {
    id: review.id,
    cycle_id: review.cycleId,
    employee_id: review.employeeId,
    employee_name: review.employeeName,
    department: review.department,
    role: review.role,
    reviewer_name: review.reviewerName,
    status: review.status,
    score: review.score,
    due_date: review.dueDate || null,
    goals: review.goals,
    self_feedback: review.selfFeedback,
    manager_feedback: review.managerFeedback,
    updated_at: review.updatedAt,
  };
  // An edit is valid only against the version the user actually loaded.
  // A retry of a new record uses the same ID, avoiding duplicate submissions.
  const operation = previous
    ? db
        .from("performance_reviews")
        .update(payload)
        .eq("id", previous.id)
        .eq("updated_at", previous.updatedAt)
    : db.from("performance_reviews").insert(payload);
  let { data, error } = await operation.select("*").single();
  // The first response may have been lost after a successful insert. Verify
  // exact content on retry, never overwrite a record another reviewer changed.
  if (!previous && error?.code === "23505") {
    const existing = await db
      .from("performance_reviews")
      .select("*")
      .eq("id", review.id)
      .single();
    const matches =
      existing.data &&
      Object.entries(payload).every(
        ([key, value]) =>
          key === "updated_at" ||
          // A verified organization trigger owns reviewer assignment. A lost
          // insert response may return its canonical reviewer on the retry.
          (key === "reviewer_name" && Array.isArray(existing.data.privacy_scope_ids)) ||
          JSON.stringify(canonical(existing.data[key])) ===
            JSON.stringify(canonical(value)),
      );
    if (!existing.error && matches) {
      data = existing.data;
      error = null;
    }
  }
  if (error || !data || data.id !== review.id) {
    throw new Error(
      "工作區尚未確認儲存，或紀錄已被其他人更新。草稿仍保留；請重新整理確認後再試。",
    );
  }
  return normalizePerformanceReview(data);
}

// Keep one request ID while retrying identical form content after a lost response.
// This is memory only; no assessment content is written to localStorage.
const pendingRequests = new Map();
export async function submitAssessmentRecord(db, review, { mode, action, expectedUpdatedAt }) {
  const payload = {
    id: review.id, cycle_id: review.cycleId, employee_id: review.employeeId,
    employee_name: review.employeeName, department: review.department,
    role: review.role, due_date: review.dueDate || null, goals: review.goals,
    ...(mode === "self" ? { self_feedback: review.selfFeedback }
      : { manager_feedback: review.managerFeedback, score: review.score }),
  };
  const key = JSON.stringify([payload, mode, action, expectedUpdatedAt]);
  let requestId = pendingRequests.get(key);
  if (!requestId) {
    requestId = crypto.randomUUID();
    if (pendingRequests.size >= 20) pendingRequests.delete(pendingRequests.keys().next().value);
    pendingRequests.set(key, requestId);
  }
  const args = { p_request_id: requestId, p_review: payload, p_mode: mode,
    p_action: action, p_expected_updated_at: expectedUpdatedAt };
  let result;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      result = await db.rpc("submit_performance_assessment", args);
    } catch {
      result = { error: { message: "連線中斷", code: "NETWORK" } };
    }
    if (!result.error) break;
    const code = result.error.code || "";
    if (attempt === 0 && (code === "NETWORK" || !code || code.startsWith("08"))) continue;
    if (code === "40001") throw new Error(result.error.message);
    if (code === "42501" || code === "22023") throw new Error(result.error.message);
    if (code === "PGRST202") throw new Error("提交服務更新尚未完成，本頁輸入仍保留，請稍後重試。");
    throw new Error(`提交未完成（${code || "連線異常"}），本頁輸入仍保留。請再按提交重試。`);
  }
  const expectedStatus = action === "return" ? "in-progress" : mode === "self" ? "submitted" : "approved";
  if (!result.data?.review || result.data.review.id !== review.id || result.data.review.status !== expectedStatus ||
      (action === "return" && !result.data.notification_id)) {
    throw new Error("提交結果尚未確認，本頁輸入仍保留。請再按提交重試。");
  }
  const confirmed = normalizePerformanceReview(result.data.review);
  if (mode === 'self' && review.managerFeedback) {
    // The submission receipt redacts manager data. Keep only responses already
    // received by this employee; never restore private ratings or category notes.
    const { feedback, attachments, entryReviews, returnHistory } = readManagerAssessment(review.managerFeedback);
    confirmed.managerFeedback = serializeManagerAssessment({ feedback, attachments, entryReviews, returnHistory });
  }
  return confirmed;
}
