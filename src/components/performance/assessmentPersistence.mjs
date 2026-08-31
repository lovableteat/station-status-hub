import { normalizePerformanceReview } from "./performanceData.mjs";

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
