import {
  CATEGORIES,
  readSelfAssessment,
  readManagerAssessment,
} from "./rd2Assessment.mjs";

export const PERFORMANCE_CYCLES = [
  {
    id: "2026-q3",
    label: "2026 Q3 · 季度考核",
    period: "2026/07/01 - 2026/09/30",
  },
  {
    id: "2026-q2",
    label: "2026 Q2 · 歷史考核",
    period: "2026/04/01 - 2026/06/30",
  },
];

export const PERFORMANCE_STATUS = {
  draft: { label: "草稿", tone: "slate" },
  "in-progress": { label: "填寫中", tone: "amber" },
  submitted: { label: "待主管審核", tone: "sky" },
  approved: { label: "已完成", tone: "emerald" },
};

export function getPerformanceStatusForAction({
  mode,
  action,
  currentStatus = "draft",
}) {
  if (mode === "self") return action === "submit" ? "submitted" : "in-progress";
  if (mode === "manager") {
    if (action === "return") return "in-progress";
    if (action === "submit") return "approved";
  }
  return currentStatus;
}

export const DEFAULT_PERFORMANCE_REVIEWS = [
  {
    id: "performance-operator-7",
    cycleId: "2026-q3",
    employeeId: "demo-admin",
    employeeName: "Operator 7",
    department: "平台營運",
    role: "系統管理員",
    reviewerName: "管理員",
    status: "in-progress",
    score: null,
    dueDate: "2026-09-18",
    updatedAt: "2026-08-20T08:00:00.000Z",
    selfFeedback: "已完成工作區權限與協作流程整理。",
    managerFeedback: "",
    goals: [
      {
        id: "goal-operator-1",
        category: "KPI",
        title: "完成工作區權限盤點",
        progress: 75,
        weight: 40,
      },
      {
        id: "goal-operator-2",
        category: "OKR",
        title: "降低跨頁操作等待時間",
        progress: 50,
        weight: 30,
      },
      {
        id: "goal-operator-3",
        category: "IDP",
        title: "建立新人上手文件",
        progress: 25,
        weight: 30,
      },
    ],
  },
  {
    id: "performance-yumin-wang",
    cycleId: "2026-q3",
    employeeId: "yumin-wang",
    employeeName: "Yumin Wang",
    department: "硬體工程",
    role: "工程師",
    reviewerName: "Ben",
    status: "submitted",
    score: 86,
    dueDate: "2026-09-12",
    updatedAt: "2026-08-18T06:51:00.000Z",
    selfFeedback: "完成 PCB Designer 的 2D／3D 對照與 BOM 整理。",
    managerFeedback: "功能交付穩定，建議加強跨部門文件同步。",
    goals: [
      {
        id: "goal-yumin-1",
        title: "完成 E2 Switch board 版圖",
        progress: 100,
        weight: 45,
      },
      {
        id: "goal-yumin-2",
        title: "建立料號申請標準流程",
        progress: 85,
        weight: 35,
      },
      {
        id: "goal-yumin-3",
        title: "協助新人熟悉 BOM 工具",
        progress: 60,
        weight: 20,
      },
    ],
  },
  {
    id: "performance-ben",
    cycleId: "2026-q3",
    employeeId: "ben",
    employeeName: "Ben",
    department: "硬體工程",
    role: "工程師",
    reviewerName: "管理員",
    status: "approved",
    score: 92,
    dueDate: "2026-09-12",
    updatedAt: "2026-08-16T03:20:00.000Z",
    selfFeedback: "完成跨工作區問題追蹤與維修紀錄整合。",
    managerFeedback: "主動協作且能穩定完成高優先級問題。",
    goals: [
      {
        id: "goal-ben-1",
        title: "完成 L10 測試流程優化",
        progress: 100,
        weight: 50,
      },
      {
        id: "goal-ben-2",
        title: "縮短問題回報到結案時間",
        progress: 90,
        weight: 30,
      },
      { id: "goal-ben-3", title: "補齊維修紀錄範本", progress: 80, weight: 20 },
    ],
  },
  {
    id: "performance-henry",
    cycleId: "2026-q3",
    employeeId: "henry",
    employeeName: "Henry",
    department: "平台工程",
    role: "工程師",
    reviewerName: "管理員",
    status: "in-progress",
    score: null,
    dueDate: "2026-09-20",
    updatedAt: "2026-08-14T02:10:00.000Z",
    selfFeedback: "",
    managerFeedback: "",
    goals: [
      {
        id: "goal-henry-1",
        title: "完成 Data Center 場景資料整理",
        progress: 65,
        weight: 40,
      },
      {
        id: "goal-henry-2",
        title: "提升共用資料查詢穩定性",
        progress: 40,
        weight: 35,
      },
      {
        id: "goal-henry-3",
        title: "支援跨組技術分享",
        progress: 50,
        weight: 25,
      },
    ],
  },
  {
    id: "performance-johnny",
    cycleId: "2026-q3",
    employeeId: "johnny",
    employeeName: "Johnny",
    department: "製造工程",
    role: "工程師",
    reviewerName: "管理員",
    status: "draft",
    score: null,
    dueDate: "2026-09-24",
    updatedAt: "2026-08-12T01:40:00.000Z",
    selfFeedback: "",
    managerFeedback: "",
    goals: [
      {
        id: "goal-johnny-1",
        title: "完成 Station 1 測試資產盤點",
        progress: 30,
        weight: 40,
      },
      {
        id: "goal-johnny-2",
        title: "建立異常回報範例",
        progress: 20,
        weight: 30,
      },
      {
        id: "goal-johnny-3",
        title: "改善交接資訊完整度",
        progress: 25,
        weight: 30,
      },
    ],
  },
];

export function normalizePerformanceReview(value) {
  const review = value && typeof value === "object" ? value : {};
  const status = Object.prototype.hasOwnProperty.call(
    PERFORMANCE_STATUS,
    review.status,
  )
    ? review.status
    : "draft";
  const goals = Array.isArray(review.goals) ? review.goals : [];

  return {
    id: String(review.id || `performance-${Date.now()}`),
    cycleId: String(review.cycleId || review.cycle_id || "2026-q3"),
    employeeId: String(review.employeeId || review.employee_id || ""),
    employeeName: String(
      review.employeeName || review.employee_name || "未指定員工",
    ),
    department: String(review.department || "未指定部門"),
    role: String(review.role || "工程師"),
    reviewerName: String(
      review.reviewerName || review.reviewer_name || "",
    ),
    status,
    score:
      review.score == null || review.score === ""
        ? null
        : Number.isFinite(Number(review.score))
          ? Number(review.score)
          : null,
    dueDate: String(review.dueDate || review.due_date || "2026-09-30"),
    updatedAt: String(
      review.updatedAt || review.updated_at || new Date().toISOString(),
    ),
    selfFeedback: String(review.selfFeedback || review.self_feedback || ""),
    managerFeedback: String(
      review.managerFeedback || review.manager_feedback || "",
    ),
    goals: goals.map((goal, index) => ({
      id: String(goal?.id || `${review.id || "goal"}-${index + 1}`),
      category: ["KPI", "OKR", "IDP"].includes(goal?.category)
        ? goal.category
        : "KPI",
      title: String(goal?.title || "未命名目標"),
      progress: Math.min(100, Math.max(0, Number(goal?.progress) || 0)),
      weight: Math.max(0, Number(goal?.weight) || 0),
    })),
  };
}

export function calculatePerformanceSummary(reviews) {
  const rows = Array.isArray(reviews) ? reviews : [];
  const scored = rows.filter((review) => Number.isFinite(review.score));
  const progressValues = rows.flatMap(
    (review) => review.goals?.map((goal) => goal.progress) || [],
  );

  return {
    total: rows.length,
    completed: rows.filter((review) => review.status === "approved").length,
    pending: rows.filter((review) => review.status !== "approved").length,
    averageScore: scored.length
      ? Math.round(
          scored.reduce((sum, review) => sum + review.score, 0) / scored.length,
        )
      : 0,
    averageProgress: progressValues.length
      ? Math.round(
          progressValues.reduce((sum, progress) => sum + progress, 0) /
            progressValues.length,
        )
      : 0,
  };
}

export function toPerformanceCsv(reviews, { includeManager = true } = {}) {
  const headers = [
    "員工",
    "部門",
    "考核人",
    "狀態",
    "目標平均進度",
    "截止日期",
    "工號",
    "團隊",
    "職級",
    "IDP 實績",
    "OKR 實績",
    "KPI 實績",
    "既有自評",
    "證明連結",
    "圖片附件數",
  ];
  if (includeManager) {
    headers.splice(4, 0, "分數");
    headers.splice(13, 0, "當責題一", "當責題二", "主管回饋");
  }
  const rows = (reviews || []).map((review) => {
    const self = readSelfAssessment(review.selfFeedback);
    const manager = readManagerAssessment(review.managerFeedback);
    const row = [
      review.employeeName,
      review.department,
      review.reviewerName,
      PERFORMANCE_STATUS[review.status]?.label || review.status,
      review.goals?.length
        ? Math.round(
            review.goals.reduce((sum, goal) => sum + goal.progress, 0) /
              review.goals.length,
          )
        : 0,
      review.dueDate,
      self.employeeNumber || manager.employeeNumber,
      self.team,
      self.level,
      ...CATEGORIES.map((category) => self.sections[category].text),
      self.legacyText,
      CATEGORIES.flatMap((category) => self.sections[category].links).join(
        "\n",
      ),
      CATEGORIES.reduce(
        (count, category) => count + self.sections[category].images.length,
        0,
      ),
    ];
    if (includeManager) {
      row.splice(4, 0, review.score ?? "");
      row.splice(
        13,
        0,
        manager.answers.q1 ?? "",
        manager.answers.q2 ?? "",
        manager.feedback,
      );
    }
    return row;
  });
  return [headers, ...rows]
    .map((row) =>
      row
        .map((value) => {
          const text = String(value);
          const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
          return `"${safe.replaceAll('"', '""')}"`;
        })
        .join(","),
    )
    .join("\n");
}
