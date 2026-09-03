// Functional reference: https://liu52417.github.io/company_web/
// Source revision is documented in docs/performance-rd2-integration.md.
// Versioned envelopes fit the existing protected performance_reviews text
// columns. Legacy plain text remains readable; no additional public service
// or database migration is required for assessment evidence.
import {
  getAssessmentEntries,
  withAssessmentEntries,
} from "./assessmentEntries.mjs";

export const SELF_PREFIX = "RD2_SELF_V1\n";
export const MANAGER_PREFIX = "RD2_MANAGER_V1\n";
export const CATEGORIES = ["IDP", "OKR", "KPI"];
export const TEAMS = [
  { value: "EE", label: "HW / EE 團隊" },
  { value: "FW", label: "FW 韌體團隊" },
];
// Standards come from the complete, user-supplied RD2 workbook.
export {
  LEVELS,
  JOB_GRADES,
  CATEGORY_GUIDANCE,
  KPI_REFERENCES,
  ACCOUNTABILITY_QUESTIONS,
  getLevelWeights,
  getKpiReference,
} from "./rd2Standards.mjs";
import {
  LEVELS,
  JOB_GRADES,
  ACCOUNTABILITY_QUESTIONS,
  ACCOUNTABILITY_ROLES,
  STANDARDS_SOURCE,
  getAccountabilityQuestions,
  getKpiReference,
} from "./rd2Standards.mjs";
export const MAX_EVIDENCE_CHARACTERS = 1_500_000;
export const MAX_IMAGES_PER_CATEGORY = 2;
const str = (value) => (typeof value === "string" ? value : "");
const validRating = (value) =>
  Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
export const safeEvidenceUrl = (value) => {
  try {
    const url = new URL(str(value).trim());
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
};
export function readSelfAssessment(raw = "") {
  let payload = {};
  if (str(raw).startsWith(SELF_PREFIX)) {
    try {
      payload = JSON.parse(raw.slice(SELF_PREFIX.length)) || {};
    } catch {
      payload = { legacyText: raw };
    }
  } else payload = { legacyText: str(raw) };
  return {
    employeeNumber: str(payload.employeeNumber),
    team: TEAMS.some((t) => t.value === payload.team) ? payload.team : "",
    level: LEVELS.some((l) => l.value === payload.level) ? payload.level : "",
    grade: JOB_GRADES.includes(Number(payload.grade))
      ? String(payload.grade)
      : "",
    legacyText: str(payload.legacyText),
    sections: Object.fromEntries(
      CATEGORIES.map((category) => {
        const section = payload.sections?.[category];
        return [
          category,
          {
            text: str(section?.text),
            ...(Array.isArray(section?.entries)
              ? withAssessmentEntries({}, getAssessmentEntries(section))
              : {}),
            ...(typeof section?.draftText === "string"
              ? { draftText: section.draftText }
              : {}),
            links: (Array.isArray(section?.links) ? section.links : [])
              .map(safeEvidenceUrl)
              .filter(Boolean),
            images: (Array.isArray(section?.images) ? section.images : [])
              .filter((img) =>
                /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(
                  str(img?.dataUrl),
                ),
              )
              .slice(0, MAX_IMAGES_PER_CATEGORY)
              .map((img) => ({
                id: str(img.id),
                name: str(img.name),
                dataUrl: img.dataUrl,
              })),
          },
        ];
      }),
    ),
  };
}
export const serializeSelfAssessment = (value) =>
  SELF_PREFIX +
  JSON.stringify(readSelfAssessment(SELF_PREFIX + JSON.stringify(value)));
export function readManagerAssessment(raw = "") {
  if (str(raw).startsWith(MANAGER_PREFIX)) {
    try {
      const parsed = JSON.parse(raw.slice(MANAGER_PREFIX.length));
      return {
        feedback: str(parsed.feedback),
        employeeNumber: str(parsed.employeeNumber),
        roleGroup: ACCOUNTABILITY_ROLES.some(
          (role) => role.value === parsed.roleGroup,
        )
          ? parsed.roleGroup
          : "",
        standardsVersion: str(parsed.standardsVersion),
        answers: Object.fromEntries(
          ACCOUNTABILITY_QUESTIONS.map((question) => [
            question.id,
            validRating(parsed.answers?.[question.id]),
          ]),
        ),
      };
    } catch {
      /* Preserve older or malformed content as plain feedback. */
    }
  }
  return {
    feedback: str(raw),
    employeeNumber: "",
    roleGroup: "",
    standardsVersion: "",
    answers: Object.fromEntries(
      ACCOUNTABILITY_QUESTIONS.map((question) => [question.id, null]),
    ),
  };
}
export const serializeManagerAssessment = (value) =>
  MANAGER_PREFIX +
  JSON.stringify(readManagerAssessment(MANAGER_PREFIX + JSON.stringify(value)));
export function validateAssessment(form, mode, action) {
  if (!form.employeeName?.trim()) return "請填寫員工姓名。";
  if (
    mode === "manager" &&
    form.score !== "" &&
    (!Number.isFinite(Number(form.score)) ||
      Number(form.score) < 0 ||
      Number(form.score) > 100)
  )
    return "綜合評分必須介於 0–100。";
  const evidenceSize = CATEGORIES.reduce(
    (total, c) =>
      total +
      form.self.sections[c].images.reduce(
        (size, image) => size + image.dataUrl.length,
        0,
      ),
    0,
  );
  if (evidenceSize > MAX_EVIDENCE_CHARACTERS)
    return "證明圖片總量過大，請減少圖片或改用內部連結。";
  if (action === "draft") return "";
  if (mode === "self") {
    if (!form.self.employeeNumber?.trim()) return "請填寫員工工號。";
    if (!getKpiReference(form.self.team, form.self.level))
      return "請選擇團隊與職務角色。";
    if (!JOB_GRADES.includes(Number(form.self.grade)))
      return "請選擇數字職等，以確認評核權重。";
    if (
      CATEGORIES.some(
        (c) =>
          !getAssessmentEntries(form.self.sections[c]).some((entry) =>
            entry.text.trim(),
          ),
      )
    )
      return "請分別填寫 IDP、OKR、KPI 實績後再送出。";
    if (
      CATEGORIES.some((c) =>
        getAssessmentEntries(form.self.sections[c]).some(
          (entry) => !entry.text.trim(),
        ),
      )
    )
      return "請填寫或刪除空白的實績項目後再送出。";
  } else if (
    action === "submit" &&
    (!getAccountabilityQuestions(form.manager.roleGroup).length ||
      getAccountabilityQuestions(form.manager.roleGroup).some(
        (q) => validRating(form.manager.answers[q.id]) == null,
      ))
  ) {
    return "請依受評者當責職級完成全部 7 題評分（1–5 分）。";
  }
  if (
    mode === "manager" &&
    action === "return" &&
    !form.manager.feedback.trim()
  )
    return "退回補充時請留下回饋。";
  return "";
}
export function createAssessmentForm(review, user = {}) {
  const self = readSelfAssessment(review?.selfFeedback);
  const manager = readManagerAssessment(review?.managerFeedback);
  if (!self.employeeNumber) self.employeeNumber = manager.employeeNumber;
  return {
    sourceUpdatedAt: review?.updatedAt || "",
    recordId: review?.id || `performance-${crypto.randomUUID()}`,
    employeeId: review?.employeeId || user.userId || "",
    employeeName:
      review?.employeeName || user.displayName || user.username || "",
    reviewerName: review?.reviewerName || "",
    department: review?.department || "",
    role: review?.role || "工程師",
    dueDate: review?.dueDate || "2026-09-30",
    score: review?.score == null ? "" : String(review.score),
    self,
    manager,
    goals: review?.goals ? review.goals.map((goal) => ({ ...goal })) : [],
  };
}
export function buildAssessmentReview({
  form,
  previous,
  mode,
  action,
  cycleId,
  reviewerName,
  id,
  now,
}) {
  const manager = {
    ...form.manager,
    employeeNumber: form.self.employeeNumber,
    standardsVersion: STANDARDS_SOURCE.version,
  };
  return {
    ...previous,
    id: previous?.id || id,
    cycleId: previous?.cycleId || cycleId,
    employeeId:
      previous?.employeeId || form.employeeId || form.self.employeeNumber,
    employeeName: previous?.employeeName || form.employeeName.trim(),
    department:
      mode === "self"
        ? TEAMS.find((t) => t.value === form.self.team)?.label ||
          form.department
        : previous?.department || form.department,
    role:
      mode === "self"
        ? LEVELS.find((l) => l.value === form.self.level)?.label || form.role
        : previous?.role || form.role,
    reviewerName: mode === "manager" ? reviewerName : form.reviewerName,
    status:
      mode === "self"
        ? action === "submit"
          ? "submitted"
          : "in-progress"
        : action === "submit"
          ? "approved"
          : action === "return"
            ? "in-progress"
            : previous?.status || "draft",
    score:
      mode === "manager"
        ? form.score === ""
          ? null
          : Number(form.score)
        : (previous?.score ?? null),
    dueDate: form.dueDate,
    updatedAt: now,
    goals: mode === "manager" ? previous?.goals || [] : form.goals,
    selfFeedback:
      mode === "self"
        ? serializeSelfAssessment(form.self)
        : previous?.selfFeedback || "",
    managerFeedback:
      mode === "manager"
        ? serializeManagerAssessment(manager)
        : previous?.managerFeedback || "",
  };
}
export const draftKey = (userId, cycle, mode, reviewId) =>
  `station-status-hub:rd2-draft:v1:${encodeURIComponent(userId)}:${cycle}:${mode}:${encodeURIComponent(reviewId || "new")}`;
export function readAssessmentDraft(storage, key, fallback) {
  try {
    const value = JSON.parse(storage.getItem(key) || "null");
    if (value?.version !== 1 || !value.form || !Array.isArray(value.form.goals))
      return null;
    if (
      [
        "employeeId",
        "employeeName",
        "department",
        "role",
        "reviewerName",
        "dueDate",
        "score",
      ].some((key) => typeof value.form[key] !== "string")
    )
      return null;
    if (
      !value.form.self ||
      !value.form.manager ||
      value.form.goals.some(
        (goal) =>
          !goal ||
          typeof goal.id !== "string" ||
          typeof goal.title !== "string" ||
          !Number.isFinite(goal.progress) ||
          !Number.isFinite(goal.weight),
      )
    )
      return null;
    return {
      form: {
        ...fallback,
        ...value.form,
        self: readSelfAssessment(serializeSelfAssessment(value.form.self)),
        manager: readManagerAssessment(
          serializeManagerAssessment(value.form.manager),
        ),
      },
      savedAt: str(value.savedAt),
    };
  } catch {
    return null;
  }
}
export function saveAssessmentDraft(
  storage,
  key,
  form,
  savedAt = new Date().toISOString(),
) {
  storage.setItem(key, JSON.stringify({ version: 1, form, savedAt }));
  return savedAt;
}
