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
  CATEGORY_ROLE_REFERENCES,
  KPI_REFERENCES,
  ACCOUNTABILITY_QUESTIONS,
  calculateWeightedManagerScores,
  calculateWeightedSelfScores,
  getLevelWeights,
  getKpiReference,
  getCategoryRoleReference,
} from "./rd2Standards.mjs";
import {
  LEVELS,
  JOB_GRADES,
  ACCOUNTABILITY_QUESTIONS,
  ACCOUNTABILITY_ROLES,
  STANDARDS_SOURCE,
  calculateWeightedManagerScores,
  getAccountabilityQuestions,
  getLevelWeights,
  getKpiReference,
} from "./rd2Standards.mjs";
export const MAX_EVIDENCE_CHARACTERS = 1_500_000;
export const MAX_IMAGES_PER_CATEGORY = 2;
export { MAX_MANAGER_ATTACHMENTS, MAX_MANAGER_ATTACHMENT_BYTES, MAX_MANAGER_ATTACHMENT_CHARACTERS } from "./assessmentAttachmentPolicy.mjs";
import { safeManagerAttachments, MAX_MANAGER_ATTACHMENT_CHARACTERS } from "./assessmentAttachmentPolicy.mjs";
const str = (value) => (typeof value === "string" ? value : "");
const validRating = (value) =>
  Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
/** Employee's own 0-100 figure for a category; anything else is dropped. */
const validSelfScore = (value) =>
  value !== null &&
  value !== undefined &&
  Number.isFinite(Number(value)) &&
  String(value).trim() !== "" &&
  Number(value) >= 0 &&
  Number(value) <= 100
    ? Math.round(Number(value))
    : null;
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
            selfScore: validSelfScore(section?.selfScore),
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
const emptyCategoryReviews = () =>
  Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      { score: null, feedback: "", entryFeedback: {} },
    ]),
  );
export function readManagerAssessment(raw = "") {
  if (str(raw).startsWith(MANAGER_PREFIX)) {
    try {
      const parsed = JSON.parse(raw.slice(MANAGER_PREFIX.length));
      return {
        feedback: str(parsed.feedback),
        attachments: safeManagerAttachments(parsed.attachments),
        categoryReviews: Object.fromEntries(
          CATEGORIES.map((category) => [
            category,
            {
              score: validSelfScore(parsed.categoryReviews?.[category]?.score),
              feedback: str(parsed.categoryReviews?.[category]?.feedback),
              entryFeedback: Object.fromEntries(Object.entries(parsed.categoryReviews?.[category]?.entryFeedback || {}).filter(([id, value]) => id && typeof value === "string")),
            },
          ]),
        ),
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
    attachments: [],
    categoryReviews: emptyCategoryReviews(),
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
  const entryAttachmentSize = CATEGORIES.reduce((total, category) => total + getAssessmentEntries(form.self.sections[category]).reduce((sum, entry) => sum + entry.attachments.reduce((size, file) => size + file.dataUrl.length, 0), 0), 0);
  if (entryAttachmentSize > MAX_MANAGER_ATTACHMENT_CHARACTERS) return "實績附件總量過大，所有實績合計約 4.5 MB，請移除部分附件或改用證明連結。";
  const managerAttachmentSize = form.manager.attachments.reduce(
    (total, attachment) => total + attachment.dataUrl.length,
    0,
  );
  if (managerAttachmentSize > MAX_MANAGER_ATTACHMENT_CHARACTERS)
    return "主管附件總量過大，請移除部分檔案後再儲存。";
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
    if (
      getLevelWeights(form.self.grade) &&
      CATEGORIES.some(
        (category) => {
          const score = form.self.sections[category].selfScore;
          return score == null || !Number.isFinite(Number(score)) || Number(score) < 0 || Number(score) > 100;
        },
      )
    )
      return "請填寫 IDP、OKR、KPI 三類自評分數，系統會依政策權重計算後送交主管。";
  } else if (action === "submit") {
    if (
      getLevelWeights(form.self.grade) &&
      CATEGORIES.some(
        (category) =>
          validSelfScore(form.manager.categoryReviews?.[category]?.score) ==
          null,
      )
    )
      return "請對照員工自評，完成 IDP、OKR、KPI 三類主管評分（0–100 分）。";
    if (
      !getAccountabilityQuestions(form.manager.roleGroup).length ||
      getAccountabilityQuestions(form.manager.roleGroup).some(
        (q) => validRating(form.manager.answers[q.id]) == null,
      )
    )
      return "請依受評者當責職級完成全部 7 題評分（1–5 分）。";
  }
  if (
    mode === "manager" &&
    action === "return" &&
    !form.manager.feedback.trim() &&
    !form.manager.attachments.length &&
    !CATEGORIES.some(category => Object.values(form.manager.categoryReviews[category].entryFeedback || {}).some(text => typeof text === "string" && text.trim()))
  )
    return "退回補充時請留下回饋或附加檔案。";
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
  if (mode === "manager" && action === "return") {
    const marker = "\n\n【逐筆實績補充要求】\n";
    const comments = CATEGORIES.flatMap(category => getAssessmentEntries(form.self.sections[category]).flatMap((entry,index) => {
      const feedback = manager.categoryReviews[category].entryFeedback?.[entry.id];
      return feedback?.trim() ? [`${category} 實績 ${index+1}：${entry.text.slice(0,80)}\n${feedback.trim()}`] : [];
    }));
    manager.feedback = manager.feedback.split(marker)[0] + (comments.length ? marker + comments.join("\n\n") : "");
  }
  const weightedManager = calculateWeightedManagerScores(
    form.self.grade,
    manager.categoryReviews,
  );
  return {
    ...previous,
    id: previous?.id || id,
    cycleId: previous?.cycleId || cycleId,
    employeeId:
      previous?.employeeId || form.employeeId || form.self.employeeNumber,
    employeeName: previous?.employeeName || form.employeeName.trim(),
    department:
      mode === "self"
        ? form.department ||
          TEAMS.find((t) => t.value === form.self.team)?.label ||
          ""
        : previous?.department || form.department,
    role:
      mode === "self"
        ? form.role ||
          LEVELS.find((l) => l.value === form.self.level)?.label ||
          ""
        : previous?.role || form.role,
    // The protected database trigger assigns the verified manager from the
    // organization. A new self-review must not claim this protected field.
    reviewerName:
      mode === "manager" ? reviewerName : previous?.reviewerName || "",
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
        ? weightedManager
          ? weightedManager.complete
            ? weightedManager.total
            : null
          : form.score === ""
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
