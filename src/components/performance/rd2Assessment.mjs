// Functional reference: https://liu52417.github.io/company_web/
// Source revision is documented in docs/performance-rd2-integration.md.
// Versioned envelopes fit the existing protected performance_reviews text
// columns. Legacy plain text remains readable; no additional public service
// or database migration is required for assessment evidence.
export const SELF_PREFIX = "RD2_SELF_V1\n";
export const MANAGER_PREFIX = "RD2_MANAGER_V1\n";
export const CATEGORIES = ["IDP", "OKR", "KPI"];
export const TEAMS = [
  { value: "EE", label: "HW / EE 團隊" },
  { value: "FW", label: "FW 韌體團隊" },
];
export const LEVELS = [
  {
    value: "junior",
    label: "Junior Engineer (13, 19)",
    policy:
      "穩固基本盤：著重日常任務（KPI）的準確率與執行力。IDP 具體列出預計補強的硬體／韌體基礎技能。",
  },
  {
    value: "senior",
    label: "Senior Engineer (23)",
    policy:
      "獨立解決與跨界：著重影響力、獨立解決系統性 Bug，並在 OKR 提出流程優化方案。",
  },
  {
    value: "leader",
    label: "EE/FW Leader (29)",
    policy:
      "資源與協調：著重跨部門溝通、專案時程控管，以及資源受限時帶領團隊達成目標。",
  },
  {
    value: "manager",
    label: "Design Manager (33, 39)",
    policy:
      "戰略與培育：著重 OKR 創新、團隊 IDP、客戶滿意度、專案風險防堵，以及培育獨當一面的 Senior 成員。",
  },
];
export const CATEGORY_GUIDANCE = {
  IDP: {
    title: "未來潛力",
    focus: "評估本期能力成長計畫，以及學習成果是否實際應用在工作上。",
    details: [
      "專業知識、工具與技能的熟練度，以及持續學習的投入。",
      "說明訓練、認證或自主研究後，如何獨立解題、改善工作或分享給團隊。",
      "寫出下一階段的成長目標與需要的支援，讓發展方向可以被追蹤。",
    ],
    example:
      "針對專業領域知識不足，透過內部培訓與自主研讀規格書，取得相關認證，並能獨立完成模組設計與除錯。",
  },
  OKR: {
    title: "創新與改善能力",
    focus: "評估挑戰性目標與關鍵成果，以及對專案、流程與團隊帶來的影響。",
    details: [
      "目標是否與團隊方向對齊，關鍵成果是否有明確結果與完成程度。",
      "提出新方法、改善流程、導入自動化或解決跨部門問題的能力。",
      "用前後差異、節省時間、品質提升或客戶影響等數據佐證成果。",
    ],
    example:
      "技術創新：導入 PegaAI 助手與自動化檢查清單，減少 RD 資源投入 20%。\n效率：交付時間縮短 20%，現場支援一次完成率達 95%。\n客戶感受：與 Diag team 完成 GUI Debug 工具，啟動時間 < 5 秒、操作步驟 < 3 步。",
  },
  KPI: {
    title: "角色基本盤穩定度",
    focus: "評估目前職務的日常工作是否穩定、準時且符合品質要求。",
    details: [
      "依團隊與職級的 Base line、Outstanding 標準檢視交付品質與效率。",
      "包含任務完成率、準時率、缺陷或返工情形，以及問題處理與溝通。",
      "優先使用可量化數據、紀錄或具體案例，說明你如何維持穩定交付。",
    ],
    example: "以 S 情境、T 任務、A 行動、R 結果描述具體成果。",
  },
};
const ref = (baseline, outstanding) => ({ baseline, outstanding });
export const KPI_REFERENCES = {
  EE: {
    junior: ref(
      [
        "BOM create and maintain.",
        "Work with senior engineer 2nd source spec check.",
        "Daughter board design.",
        "Check list prepare.",
      ],
      ["Independent board level debug.", "Independent MB schematic review."],
    ),
    senior: ref(
      [
        "Mother board schematic design, GPIO table.",
        "Layout prepare & review.",
        "Board level bug handle and solve.",
      ],
      [
        "System level debug and cross function team debug.",
        "Proposal prepare and solution survey.",
      ],
    ),
    leader: ref(
      [
        "Resource request to DM.",
        "Review MB schematic/layout file.",
        "System level bug handle and solve.",
      ],
      [
        "Cross function team negotiation.",
        "Overall project status handle and update to manager.",
      ],
    ),
    manager: ref(
      [
        "Review overall connection.",
        "Schedule control.",
        "Overall project status handle.",
      ],
      [
        "Limitation resource to let project on-going.",
        "All member can achieve outstanding requirement.",
      ],
    ),
  },
  FW: {
    junior: ref(
      [
        "Basic firmware coding and debugging.",
        "Unit test case development.",
        "Bug tracking and documentation.",
      ],
      [
        "Independent module-level firmware development.",
        "Propose test automation improvements.",
      ],
    ),
    senior: ref(
      [
        "System firmware architecture design.",
        "Driver development for hardware components.",
        "Firmware debugging at system level.",
      ],
      [
        "Cross-platform firmware migration and porting.",
        "Security firmware implementation.",
      ],
    ),
    leader: ref(
      [
        "Resource planning and task assignment.",
        "Review firmware architecture and code quality.",
        "System level bug analysis.",
      ],
      [
        "Cross function negotiation to let project run smoothly.",
        "Customer requirement analysis and proposal.",
      ],
    ),
    manager: ref(
      [
        "Review overall firmware architecture.",
        "Schedule control and milestone tracking.",
        "Task prioritization and resource allocation.",
      ],
      [
        "Deliver project with limited resource on schedule.",
        "All team members achieve outstanding performance.",
      ],
    ),
  },
};
export const ACCOUNTABILITY_QUESTIONS = [
  {
    id: "q1",
    dimension: "承諾 Commitment",
    role: "高階管理層",
    text: "我能清晰地定義並傳達組織的使命與願景",
  },
  {
    id: "q2",
    dimension: "承諾 Commitment",
    role: "高階管理層",
    text: "我負責確保所有團隊朝著共同目標努力，並能有效調動資源",
  },
];
export const MAX_EVIDENCE_CHARACTERS = 1_500_000;
export const MAX_IMAGES_PER_CATEGORY = 2;
export const getLevelWeights = (level) =>
  level === "manager"
    ? { KPI: 40, OKR: 35, IDP: 25 }
    : { KPI: 60, OKR: 20, IDP: 20 };
export const getKpiReference = (team, level) =>
  KPI_REFERENCES[team]?.[level] || null;
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
    legacyText: str(payload.legacyText),
    sections: Object.fromEntries(
      CATEGORIES.map((category) => {
        const section = payload.sections?.[category];
        return [
          category,
          {
            text: str(section?.text),
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
        answers: {
          q1: validRating(parsed.answers?.q1),
          q2: validRating(parsed.answers?.q2),
        },
      };
    } catch {
      /* Preserve older or malformed content as plain feedback. */
    }
  }
  return {
    feedback: str(raw),
    employeeNumber: "",
    answers: { q1: null, q2: null },
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
  if (!form.self.employeeNumber?.trim()) return "請填寫員工工號。";
  if (mode === "self") {
    if (!getKpiReference(form.self.team, form.self.level))
      return "請選擇團隊與職級。";
    if (CATEGORIES.some((c) => !form.self.sections[c].text.trim()))
      return "請分別填寫 IDP、OKR、KPI 實績後再送出。";
  } else if (
    action === "submit" &&
    ACCOUNTABILITY_QUESTIONS.some(
      (q) => validRating(form.manager.answers[q.id]) == null,
    )
  ) {
    return "請完成兩題當責評分（1–5 分）。";
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
  const manager = { ...form.manager, employeeNumber: form.self.employeeNumber };
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
