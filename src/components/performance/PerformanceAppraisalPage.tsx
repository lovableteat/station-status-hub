import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BookOpen,
  ClipboardCheck,
  Download,
  FileText,
  Plus,
  RefreshCw,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useUser } from "@/components/auth/UserContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AssessmentEditor } from "./AssessmentEditor";
import { AssessmentPolicy } from "./AssessmentPolicy";
import { StatTile, StatusBreakdownChart } from "./PerformanceCharts";
import { PerformanceFlowGuide } from "./PerformanceFlowGuide";
import { saveAssessmentRecord } from "./assessmentPersistence.mjs";
import {
  ACCOUNTABILITY_QUESTIONS,
  CATEGORIES,
  buildAssessmentReview,
  createAssessmentForm,
  draftKey,
  readManagerAssessment,
  readSelfAssessment,
  validateAssessment,
} from "./rd2Assessment.mjs";
import {
  DEFAULT_PERFORMANCE_REVIEWS,
  PERFORMANCE_CYCLES,
  PERFORMANCE_STATUS,
  normalizePerformanceReview,
  toPerformanceCsv,
} from "./performanceData.mjs";
import type {
  AssessmentAction,
  AssessmentForm,
  AssessmentMode,
  EmployeeOption,
  PerformanceReview,
} from "./assessmentTypes";
import "./performance.css";

// The deployed table is not yet included in the generated database types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const performanceDb = supabase as any;
const NAV = [
  { id: "policy", label: "系統說明與政策", icon: BookOpen },
  { id: "self", label: "員工自評", icon: UserRound },
  { id: "manager", label: "主管評分（主管專用）", icon: ClipboardCheck },
  { id: "records", label: "考核紀錄", icon: FileText },
];
const LEGACY_CACHE = "station-status-hub:performance-reviews:v1";
const matchesUser = (
  review: { employeeId: string },
  user: { userId?: string; username?: string } | null,
) =>
  !!user &&
  [user.userId, user.username]
    .filter(Boolean)
    .some((id) => review.employeeId.toLowerCase() === id.toLowerCase());

const isAdministrator = (user: { role?: string } | null) =>
  user?.role === "admin" || user?.role === "super_admin";

const matchesReviewer = (
  review: PerformanceReview,
  user: { username?: string; displayName?: string } | null,
) => {
  if (!user) return false;
  const reviewer = review.reviewerName.trim().toLocaleLowerCase();
  if (!reviewer) return false;
  return [user.displayName, user.username]
    .filter(Boolean)
    .some((name) => reviewer === name!.trim().toLocaleLowerCase());
};

function readCache(
  key: string,
  demo: boolean,
  user: {
    userId?: string;
    username?: string;
    displayName?: string;
    role?: string;
  } | null,
  canManagePerformance: boolean,
  canManageAll: boolean,
): PerformanceReview[] {
  try {
    const scoped = localStorage.getItem(key);
    const raw = scoped || (!demo ? localStorage.getItem(LEGACY_CACHE) : null);
    const rows = raw
      ? JSON.parse(raw)
      : demo
        ? DEFAULT_PERFORMANCE_REVIEWS
        : [];
    if (!Array.isArray(rows)) return [];
    return (rows.map(normalizePerformanceReview) as PerformanceReview[]).filter(
      (review) => {
        // Earlier versions wrote static examples to the shared cache.
        if (
          !scoped &&
          !demo &&
          DEFAULT_PERFORMANCE_REVIEWS.some(
            (seed) =>
              seed.id === review.id && seed.updatedAt === review.updatedAt,
          )
        )
          return false;
        return (
          matchesUser(review, user) ||
          (canManagePerformance && (canManageAll || matchesReviewer(review, user)))
        );
      },
    );
  } catch {
    return [];
  }
}

function ReviewDetail({
  review,
  showManagerAssessment,
}: {
  review: PerformanceReview;
  showManagerAssessment: boolean;
}) {
  const self = readSelfAssessment(review.selfFeedback);
  const manager = readManagerAssessment(review.managerFeedback);
  return (
    <article className="rd2-card rd2-detail">
      <h3>{review.employeeName} · 考核內容</h3>
      <p className="rd2-hint">
        工號 {self.employeeNumber || manager.employeeNumber || "未填寫"} ·{" "}
        {review.department} · {review.role}
      </p>
      {CATEGORIES.map((category) => (
        <section key={category}>
          <h4>{category}</h4>
          <p className="rd2-prewrap">
            {self.sections[category].text || "尚未填寫"}
          </p>
          <div className="rd2-images">
            {self.sections[category].images.map((image) => (
              <a key={image.id} href={image.dataUrl} download={image.name}>
                <img src={image.dataUrl} alt={image.name} loading="lazy" />
              </a>
            ))}
          </div>
          {self.sections[category].links.map((url) => (
            <p key={url}>
              <a href={url} target="_blank" rel="noopener noreferrer">
                {url}
              </a>
            </p>
          ))}
        </section>
      ))}
      {self.legacyText && (
        <section>
          <h4>既有自評內容</h4>
          <p className="rd2-prewrap">{self.legacyText}</p>
        </section>
      )}
      {!!review.goals.length && (
        <section>
          <h4>既有目標與進度</h4>
          <ul>
            {review.goals.map((goal) => (
              <li key={goal.id}>
                {goal.category} · {goal.title} — {goal.progress}%（權重{" "}
                {goal.weight}%）
              </li>
            ))}
          </ul>
        </section>
      )}
      {showManagerAssessment && (
        <>
          <section>
            <h4>主管當責評分</h4>
            {ACCOUNTABILITY_QUESTIONS.map((question) => (
              <p key={question.id}>
                {question.text}：
                <strong>
                  {manager.answers[question.id] == null
                    ? "尚未評分"
                    : `${manager.answers[question.id]} / 5`}
                </strong>
              </p>
            ))}
          </section>
          <section>
            <h4>主管回饋</h4>
            <p className="rd2-prewrap">{manager.feedback || "尚無回饋"}</p>
            <p>
              綜合評分：
              {review.score == null ? "尚未評分" : `${review.score} / 100`}
            </p>
          </section>
        </>
      )}
    </article>
  );
}

export function PerformanceAppraisalPage() {
  const { user, sessionMode } = useUser();
  const { canEditModule, isPerformanceManager } = usePermissions();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const canEdit = canEditModule("performance");
  const canManageAll = isAdministrator(user);
  // Editing the performance workspace is intentionally not enough to expose
  // manager reviews. Administrators must explicitly assign the reviewer role
  // in the backend account-permissions dialog.
  const canManagePerformance = canManageAll || (canEdit && isPerformanceManager);
  const demo = sessionMode === "demo";
  const userId = user?.userId || user?.username || "signed-out";
  const cacheKey = `station-status-hub:performance-reviews:v2:${demo ? "demo" : "cloud"}:${encodeURIComponent(userId)}`;
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const savedId = useRef<{ key: string; id: string } | null>(null);
  const requestNumber = useRef(0);
  const requestedTab = NAV.some((item) => item.id === params.get("performanceTab"))
    ? params.get("performanceTab")!
    : "policy";
  // A manually crafted URL must not expose the manager workflow to employees
  // who only have view access. Keep them on their own self-assessment screen.
  const tab =
    requestedTab === "manager" && !canManagePerformance
      ? "self"
      : requestedTab === "records" && canManagePerformance
        ? "manager"
        : requestedTab;
  const editorId =
    requestedTab === "manager" && !canManagePerformance
      ? null
      : params.get("performanceReview");
  const cycle = PERFORMANCE_CYCLES.some(
    (item) => item.id === params.get("performanceCycle"),
  )
    ? params.get("performanceCycle")!
    : PERFORMANCE_CYCLES[0].id;
  const query = params.get("performanceSearch") || "";
  const editorSession = `${userId}:${cycle}:${tab}:${editorId || "new"}`;
  const effectiveSavedId =
    savedId.current?.key === editorSession ? savedId.current.id : null;
  const rawStatus = params.get("performanceStatus") || "";
  const status = Object.prototype.hasOwnProperty.call(
    PERFORMANCE_STATUS,
    rawStatus,
  )
    ? rawStatus
    : "";
  const scope = params.get("performanceScope") === "mine" ? "mine" : "all";
  const updateParams = (values: Record<string, string | null>) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        Object.entries(values).forEach(([key, value]) => {
          if (value) next.set(key, value);
          else next.delete(key);
        });
        return next;
      },
      { replace: true },
    );
  const load = useCallback(async () => {
    const request = ++requestNumber.current;
    setLoading(true);
    setLoadError("");
    setReviews(
      readCache(cacheKey, demo, user, canManagePerformance, canManageAll),
    );
    if (demo) {
      setLoading(false);
      return;
    }
    try {
      const reviewsQuery = performanceDb
        .from("performance_reviews")
        .select("*")
        .order("updated_at", { ascending: false });
      // RLS already limits employees to their own rows. Do not add a second
      // client-side identity filter here: older records may have been created
      // with the account username instead of the auth UUID. Filtering by one
      // representation would hide that record and make the editor look new.
      // Managers can request the rows assigned to them; administrators retain
      // the full review workspace.
      const [{ data, error }, employeeResult] = await Promise.all([
        reviewsQuery,
        canManagePerformance
          ? performanceDb
              .from("system_users")
              .select("id, display_name, username")
              .eq("status", "active")
              .order("display_name")
          : Promise.resolve({ data: [] }),
      ]);
      if (request !== requestNumber.current) return;
      if (error) throw error;
      const rows = (data || []).map(
        normalizePerformanceReview,
      ) as PerformanceReview[];
      const accessible = rows.filter(
        (review) =>
          matchesUser(review, user) ||
          (canManagePerformance &&
            (canManageAll || matchesReviewer(review, user))),
      );
      setReviews(accessible);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(accessible));
      } catch {
        /* The server remains the source of truth. */
      }
      setEmployees(
        (employeeResult.data || []).map(
          (employee: {
            id: string;
            display_name: string;
            username: string;
          }) => ({
            id: employee.id,
            label: employee.display_name || employee.username,
          }),
        ),
      );
    } catch {
      if (request === requestNumber.current)
        setLoadError(
          "無法讀取工作區考核。以下僅為本機快取；請重新整理後再儲存，避免覆蓋較新的內容。",
        );
    } finally {
      if (request === requestNumber.current) setLoading(false);
    }
  }, [cacheKey, demo, user, canManagePerformance, canManageAll]);
  useEffect(() => {
    void load();
    const request = requestNumber.current;
    return () => {
      requestNumber.current = request + 1;
    };
  }, [load]);
  const editorReview =
    (() => {
      // An employee has one editable record per cycle. Opening the self tab
      // without a URL id must resume that record instead of creating a second
      // blank one. This also lets a saved local draft follow the same identity
      // before and after the cloud row is created.
      const existingSelfReview =
        tab === "self"
          ? reviews.find(
              (review) =>
                review.cycleId === cycle && matchesUser(review, user),
            )
          : null;
      const selectedId =
        editorId || existingSelfReview?.id || effectiveSavedId || null;
      return (
        reviews.find(
          (review) =>
            review.cycleId === cycle &&
            review.id === selectedId &&
            (tab !== "self" || matchesUser(review, user)),
        ) || null
      );
    })();
  const editorRecordId = editorReview?.id || editorId || effectiveSavedId;
  const employeeOptions = useMemo(() => {
    // system_users (後台管理) is the authoritative roster. Review rows and the
    // signed-in user are folded in so historic names stay pickable, but they
    // were previously keyed by id alone: a review created with a free-typed
    // name carries an id that does not match that person's account, so the
    // same person surfaced twice. Claim each display name once, letting the
    // roster entry win.
    const options = new Map<string, EmployeeOption>();
    const claimed = new Set<string>();
    const nameKey = (label: string) => label.trim().toLocaleLowerCase();
    const add = (option: EmployeeOption) => {
      const label = (option.label || "").trim();
      if (!label) return;
      const key = nameKey(label);
      if (claimed.has(key)) return;
      claimed.add(key);
      options.set(option.id, { ...option, label });
    };

    const managedReviews = reviews.filter(
      (review) => canManageAll || matchesReviewer(review, user),
    );
    const managedEmployeeIds = new Set(
      managedReviews.map((review) => review.employeeId).filter(Boolean),
    );
    const managedEmployeeNames = new Set(
      managedReviews.map((review) => nameKey(review.employeeName)),
    );
    const roster = canManageAll
      ? employees
      : employees.filter(
          (employee) =>
            managedEmployeeIds.has(employee.id) ||
            managedEmployeeNames.has(nameKey(employee.label)),
        );
    roster.forEach(add);
    managedReviews.forEach((review) =>
      add({ id: review.employeeId, label: review.employeeName }),
    );
    if (canManageAll && user)
      add({ id: userId, label: user.displayName || user.username });

    return Array.from(options.values()).sort((a, b) =>
      a.label.localeCompare(b.label, "zh-Hant"),
    );
  }, [canManageAll, employees, reviews, user, userId]);
  const visibleReviews = useMemo(
    () =>
      reviews.filter(
        (review) =>
          review.cycleId === cycle &&
          (tab !== "manager" || canManageAll || matchesReviewer(review, user)) &&
          (!status || review.status === status) &&
          (scope !== "mine" || matchesUser(review, user)) &&
          (!query.trim() ||
            [
              review.employeeName,
              review.department,
              review.reviewerName,
              readSelfAssessment(review.selfFeedback).employeeNumber,
              readManagerAssessment(review.managerFeedback).employeeNumber,
            ]
              .join(" ")
              .toLowerCase()
              .includes(query.trim().toLowerCase())),
      ),
    [reviews, cycle, status, scope, query, user, tab, canManageAll],
  );

  const recordSummary = useMemo(() => {
    const counts: Record<string, number> = {
      draft: 0,
      "in-progress": 0,
      submitted: 0,
      approved: 0,
    };
    let scoreSum = 0;
    let scored = 0;
    let progressSum = 0;
    let progressCount = 0;
    visibleReviews.forEach((review) => {
      counts[review.status] = (counts[review.status] ?? 0) + 1;
      if (Number.isFinite(review.score)) {
        scoreSum += review.score as number;
        scored += 1;
      }
      (review.goals || []).forEach((goal) => {
        progressSum += goal.progress;
        progressCount += 1;
      });
    });
    return {
      counts,
      total: visibleReviews.length,
      approved: counts.approved,
      awaiting: counts.submitted,
      averageScore: scored ? Math.round(scoreSum / scored) : null,
      averageProgress: progressCount
        ? Math.round(progressSum / progressCount)
        : null,
    };
  }, [visibleReviews]);
  const navigate = (
    nextTab: string,
    review: PerformanceReview | null = null,
  ) => {
    savedId.current = null;
    setEditorRevision((revision) => revision + 1);
    setDetailId(null);
    updateParams({
      performanceTab: nextTab,
      performanceReview: review?.id || null,
    });
  };
  const [managerView, setManagerView] = useState<"records" | "score">(
    "records",
  );
  const [pendingDelete, setPendingDelete] =
    useState<PerformanceReview | null>(null);
  const [deleting, setDeleting] = useState(false);

  const removeReview = async (review: PerformanceReview) => {
    setDeleting(true);
    try {
      if (!demo) {
        const { error } = await performanceDb
          .from("performance_reviews")
          .delete()
          .eq("id", review.id);
        if (error) throw error;
      }
      const nextRows = reviews.filter((row) => row.id !== review.id);
      setReviews(nextRows);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(nextRows));
      } catch {
        /* cache is best-effort */
      }
      if (detailId === review.id) setDetailId(null);
      if (editorId === review.id) navigate(tab);
      toast({
        title: "考核已刪除",
        description: `${review.employeeName} 的這期考核紀錄已移除。`,
      });
      setPendingDelete(null);
    } catch {
      toast({
        title: "刪除失敗",
        description: "請確認你的權限與工作區連線後再試一次。",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const save = async (form: AssessmentForm, action: AssessmentAction) => {
    if (!canEdit || loading || loadError)
      throw new Error("目前無法送出，請確認管理權限與工作區連線。");
    const mode = tab as AssessmentMode;
    if (mode === "manager" && !canManagePerformance)
      throw new Error("只有管理員指定的績效主管才能送出主管評分。");
    if (mode === "self" && !matchesUser(form, user))
      throw new Error("員工自評只能編輯目前登入帳號自己的紀錄。");
    const validation = validateAssessment(form, mode, action);
    if (validation) throw new Error(validation);
    const previous = reviews.find(
      (review) => review.id === (editorRecordId || ""),
    );
    if (
      mode === "manager" &&
      !canManageAll &&
      (!previous || !matchesReviewer(previous, user))
    )
      throw new Error("只能評分考核人設定為你的直屬同仁，請先從直屬同仁紀錄選擇對象。");
    if (previous?.status === "approved" && mode === "self")
      throw new Error("此考核已完成，請由主管處理。");
    if (!effectiveSavedId)
      savedId.current = {
        key: editorSession,
        id: previous?.id || form.recordId,
      };
    const nextReview = buildAssessmentReview({
      form,
      previous,
      mode,
      action,
      cycleId: cycle,
      reviewerName: user?.displayName || user?.username || "管理員",
      id: savedId.current.id,
      now: new Date().toISOString(),
    }) as PerformanceReview;
    let confirmed = nextReview;
    if (!demo)
      confirmed = (await saveAssessmentRecord(
        performanceDb,
        nextReview,
        previous,
      )) as PerformanceReview;
    const nextRows = [
      confirmed,
      ...reviews.filter((review) => review.id !== confirmed.id),
    ];
    if (demo) localStorage.setItem(cacheKey, JSON.stringify(nextRows));
    else {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(nextRows));
      } catch {
        /* Already confirmed by the server. */
      }
    }
    setReviews(nextRows);
    toast({
      title:
        action === "draft"
          ? "考核已儲存"
          : action === "return"
            ? "已退回補充"
            : mode === "self"
              ? "自評已送出"
              : "主管評分已送出",
      description: demo
        ? "本機示範模式，不會寫入正式資料。"
        : "已確認儲存至工作區。",
    });
    return createAssessmentForm(confirmed) as AssessmentForm;
  };
  const exportCsv = () => {
    const url = URL.createObjectURL(
      // Manager-only fields are exported only for an administrator-assigned
      // reviewer.
      new Blob(["\uFEFF", toPerformanceCsv(visibleReviews, { includeManager: canManagePerformance })], {
        type: "text/csv;charset=utf-8;",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `performance-${cycle}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const detail = reviews.find((review) => review.id === detailId);
  const initial = createAssessmentForm(
    editorReview,
    tab === "self" ? user || {} : {},
  ) as AssessmentForm;
  if (!editorReview)
    initial.dueDate = `${cycle.slice(0, 4)}-${cycle.endsWith("q2") ? "06-30" : "09-30"}`;

  return (
    <div className="performance-workspace rd2-workspace">
      <aside className="rd2-sidebar" data-testid="performance-sidebar">
        <div className="rd2-brand">
          <ClipboardCheck />
          <strong>RD2 績效考核</strong>
        </div>
        <nav aria-label="績效考核導覽">
          {NAV.filter((item) =>
            item.id === "manager"
              ? canManagePerformance
              : item.id !== "records" || !canManagePerformance,
          ).map(
            (item) => (
              <button
                type="button"
                key={item.id}
                data-performance-nav={item.id}
                aria-current={tab === item.id ? "page" : undefined}
                onClick={() => navigate(item.id)}
              >
                <item.icon />
                <span>{item.label}</span>
              </button>
            ),
          )}
        </nav>
      </aside>
      <main className="performance-content">
        <header className="rd2-page-header">
          <div>
            <h1>績效與當責評估系統</h1>
            <p>{demo ? "本機示範模式" : "RD2 · 員工自評與主管評核"}</p>
          </div>
          <div className="rd2-header-actions">
            <select
              aria-label="選擇考核週期"
              value={cycle}
              onChange={(event) => {
                savedId.current = null;
                setEditorRevision((revision) => revision + 1);
                setDetailId(null);
                updateParams({
                  performanceCycle: event.target.value,
                  performanceReview: null,
                });
              }}
            >
              {PERFORMANCE_CYCLES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </header>
        {loadError && (
          <div className="rd2-error rd2-load-error" role="alert">
            <span>{loadError}</span>
            <Button
              type="button"
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
            >
              重新整理
            </Button>
          </div>
        )}
        {tab === "policy" && (
          <>
            <PerformanceFlowGuide
              canManage={canManagePerformance}
              canManageAll={canManageAll}
            />
            <AssessmentPolicy />
          </>
        )}
        {tab === "manager" && canManagePerformance && (
          <>
            <div className="rd2-manager-only-notice" role="note">
              <strong>{canManageAll ? "績效管理者檢視" : "主管專用"}</strong>
              <span>
                {canManageAll
                  ? "可檢視全部考核並處理主管評分。"
                  : "只顯示考核人設定為你的直屬同仁；一般員工不會看到這個分頁。"}
              </span>
            </div>
            <div
              className="rd2-view-switch"
              role="tablist"
              aria-label="主管評分與紀錄檢視"
            >
              {[
                {
                  id: "records" as const,
                  label: canManageAll ? "全部考核紀錄" : "直屬同仁紀錄",
                  hint: canManageAll
                    ? "查看所有員工的送件狀態並挑選評分對象"
                    : "只查看你負責的直屬同仁並挑選評分對象",
                },
                {
                  id: "score" as const,
                  label: "主管評分",
                  hint: "為選定的員工打當責分數與回饋",
                },
              ].map((view) => (
                <button
                  key={view.id}
                  type="button"
                  role="tab"
                  aria-selected={managerView === view.id}
                  data-active={managerView === view.id || undefined}
                  onClick={() => setManagerView(view.id)}
                >
                  <strong>{view.label}</strong>
                  <small>{view.hint}</small>
                </button>
              ))}
            </div>
          </>
        )}
        {(tab === "self" ||
          (tab === "manager" && (!canManagePerformance || managerView === "score"))) && (
          <>
            {tab === "manager" && !canManagePerformance ? (
              <p role="alert">需要由管理員指定為績效主管才能進行主管評分。</p>
            ) : loading ? (
              <p role="status">正在讀取考核…</p>
            ) : editorId && !editorReview ? (
              <p role="alert">
                找不到這份考核，或目前無權限檢視。請從考核紀錄重新選擇。
              </p>
            ) : (
              <>
                <div
                  className="rd2-editor-context"
                  hidden={tab === "self"}
                >
                  <label htmlFor="rd2-existing">正在評核</label>
                  <select
                    id="rd2-existing"
                    value={editorRecordId || ""}
                    onChange={(event) =>
                      navigate(
                        tab,
                        reviews.find(
                          (review) => review.id === event.target.value,
                        ) || null,
                      )
                    }
                  >
                    <option value="">
                      {canManageAll
                        ? "＋ 建立新的一筆（員工還沒自評）"
                        : "請選擇直屬同仁的考核"}
                    </option>
                    {reviews
                      .filter(
                        (review) =>
                          review.cycleId === cycle &&
                          (canManageAll || matchesReviewer(review, user)),
                      )
                      .map((review) => (
                        <option key={review.id} value={review.id}>
                          {review.employeeName} ·{" "}
                          {PERFORMANCE_STATUS[review.status].label}
                        </option>
                      ))}
                  </select>
                  <p className="rd2-hint rd2-editor-context-hint">
                    {canManageAll
                      ? "從全部考核紀錄選擇對象後，即可查看自評並完成主管評分。"
                      : "只能選擇考核人設定為你的直屬同仁；一般員工不會看到主管評分內容。"}
                  </p>
                  {!canManagePerformance && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => navigate("records")}
                    >
                      查看考核紀錄
                    </Button>
                  )}
                </div>
                {editorReview && tab === "manager" && (
                  <details className="rd2-card">
                    <summary>
                      查看 {editorReview.employeeName} 的自評與現有回饋
                    </summary>
                    <ReviewDetail
                      review={editorReview}
                      showManagerAssessment
                    />
                  </details>
                )}
                {tab === "manager" && !canManageAll && !editorReview ? (
                  <div
                    className="rd2-empty rd2-manager-selection-required"
                    role="status"
                  >
                    請先從「直屬同仁紀錄」選擇一筆考核，再查看自評並填寫主管評分。
                  </div>
                ) : (
                  <AssessmentEditor
                    key={`${userId}:${cycle}:${tab}:${editorRecordId || "new"}:${editorRevision}`}
                    initial={initial}
                    mode={tab}
                    // Self drafts are keyed to the account rather than a row
                    // id, so a draft made before the first cloud save is
                    // restored when the same review is opened from records.
                    storageKey={draftKey(
                      userId,
                      cycle,
                      tab,
                      tab === "self" ? userId : editorRecordId,
                    )}
                    readonly={
                      tab === "self" && editorReview?.status === "approved"
                    }
                    identityLocked={tab === "self" || !!editorReview}
                    canSubmit={canEdit && (tab !== "manager" || canManagePerformance) && !loadError && !loading}
                    employees={
                      tab === "manager" && canManagePerformance ? employeeOptions : []
                    }
                    demo={demo}
                    onSave={save}
                  />
                )}
              </>
            )}
          </>
        )}
        {(tab === "records" ||
          (tab === "manager" && canManagePerformance && managerView === "records")) && (
          <section>
            <header className="rd2-section-heading rd2-records-heading">
              <div>
                <h2>考核紀錄</h2>
                <p>
                  {visibleReviews.length} 筆 ·{" "}
                  {canManagePerformance
                    ? "自評、主管評分與既有目標"
                    : "我的自評與既有目標"}
                </p>
              </div>
              <div className="rd2-actions">
                <Button
                  variant="outline"
                  onClick={() => void load()}
                  disabled={loading}
                >
                  <RefreshCw data-icon="inline-start" />
                  重新整理
                </Button>
                <Button
                  variant="outline"
                  onClick={exportCsv}
                  disabled={!visibleReviews.length}
                >
                  <Download data-icon="inline-start" />
                  匯出報表
                </Button>
                <Button onClick={() => navigate("self")}>
                  <Plus data-icon="inline-start" />
                  新增自評
                </Button>
              </div>
            </header>
            <div className="rd2-records-summary">
              <div className="rd2-stat-row">
                <StatTile
                  label="本期考核"
                  value={recordSummary.total}
                  suffix=" 筆"
                  tone="info"
                  hint="符合目前篩選條件"
                />
                <StatTile
                  label="已完成"
                  value={recordSummary.approved}
                  suffix=" 筆"
                  tone="good"
                  hint="主管已確認"
                />
                <StatTile
                  label="待主管評分"
                  value={recordSummary.awaiting}
                  suffix=" 筆"
                  tone="warning"
                  hint="員工已送出自評"
                />
                {canManagePerformance && (
                  <StatTile
                    label="平均綜合評分"
                    value={recordSummary.averageScore ?? "--"}
                    suffix={recordSummary.averageScore === null ? "" : " 分"}
                    tone="score"
                    hint="僅計入已評分者"
                  />
                )}
                <StatTile
                  label="平均目標進度"
                  value={recordSummary.averageProgress ?? "--"}
                  suffix={recordSummary.averageProgress === null ? "" : "%"}
                  tone="progress"
                  hint="所有目標平均"
                />
              </div>
              <section className="rd2-card rd2-records-chart">
                <StatusBreakdownChart counts={recordSummary.counts} />
              </section>
            </div>
            <div className="rd2-filter-bar" aria-label="考核篩選">
              <div className="rd2-filters">
                <Input
                  aria-label="搜尋考核"
                  placeholder="搜尋姓名、工號、部門或考核人"
                  value={query}
                  onChange={(event) =>
                    updateParams({ performanceSearch: event.target.value })
                  }
                />
                <select
                  aria-label="考核狀態"
                  value={status}
                  onChange={(event) =>
                    updateParams({ performanceStatus: event.target.value })
                  }
                >
                  <option value="">全部狀態</option>
                  {Object.keys(PERFORMANCE_STATUS).map((value) => (
                    <option key={value} value={value}>
                      {PERFORMANCE_STATUS[value].label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="考核對象"
                  value={scope}
                  onChange={(event) =>
                    updateParams({
                      performanceScope:
                        event.target.value === "mine" ? "mine" : null,
                    })
                  }
                >
                  <option value="all">全部考核</option>
                  <option value="mine">我的考核</option>
                </select>
              </div>
              <div className="rd2-filter-chips">
                {query && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateParams({ performanceSearch: null })}
                  >
                    搜尋：{query}
                    <X data-icon="inline-end" />
                  </Button>
                )}
                {status && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateParams({ performanceStatus: null })}
                  >
                    狀態：{PERFORMANCE_STATUS[status].label}
                    <X data-icon="inline-end" />
                  </Button>
                )}
                {scope === "mine" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateParams({ performanceScope: null })}
                  >
                    對象：我的考核
                    <X data-icon="inline-end" />
                  </Button>
                )}
                {query || status || scope === "mine" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      updateParams({
                        performanceSearch: null,
                        performanceStatus: null,
                        performanceScope: null,
                      })
                    }
                  >
                    全部清除
                  </Button>
                ) : (
                  <span className="rd2-hint">顯示全部考核</span>
                )}
              </div>
            </div>
            <div className="rd2-table-scroll rd2-records-table">
              <table>
                <thead>
                  <tr>
                    <th>員工／工號</th>
                    <th>部門／職級</th>
                    <th>考核人</th>
                    <th>狀態</th>
                    {canManagePerformance && <th>綜合評分</th>}
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleReviews.map((review) => (
                    <tr key={review.id}>
                      <td>
                        <strong>{review.employeeName}</strong>
                        <small>
                          {readSelfAssessment(review.selfFeedback)
                            .employeeNumber ||
                            readManagerAssessment(review.managerFeedback)
                              .employeeNumber ||
                            "未填工號"}
                        </small>
                      </td>
                      <td>
                        {review.department}
                        <small>{review.role}</small>
                      </td>
                      <td>{review.reviewerName}</td>
                      <td>
                        <span
                          className={`rd2-status rd2-status-${review.status}`}
                        >
                          {PERFORMANCE_STATUS[review.status].label}
                        </span>
                      </td>
                      {canManagePerformance && <td>{review.score ?? "—"}</td>}
                      <td>
                        <div className="rd2-row-actions">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setDetailId(
                                detailId === review.id ? null : review.id,
                              )
                            }
                          >
                            查看
                          </Button>
                          {matchesUser(review, user) &&
                            review.status !== "approved" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => navigate("self", review)}
                              >
                                填寫自評
                              </Button>
                            )}
                          {canManagePerformance && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setManagerView("score");
                                navigate("manager", review);
                              }}
                            >
                              主管評分
                            </Button>
                          )}
                          {canEdit && (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`刪除 ${review.employeeName} 的考核`}
                              className="rd2-delete-action"
                              onClick={() => setPendingDelete(review)}
                            >
                              <Trash2 />
                              刪除
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!visibleReviews.length && (
                    <tr>
                      <td colSpan={canManagePerformance ? 6 : 5} className="rd2-empty">
                        {loading
                          ? "正在讀取考核…"
                          : "目前篩選條件沒有符合的考核"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {detail && (
              <section className="rd2-detail-region">
                <Button variant="ghost" onClick={() => setDetailId(null)}>
                  <X data-icon="inline-start" />
                  關閉考核內容
                </Button>
                <ReviewDetail
                  review={detail}
                  showManagerAssessment={canManagePerformance}
                />
              </section>
            )}
          </section>
        )}
      </main>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除這份考核紀錄？</AlertDialogTitle>
            <AlertDialogDescription>
              將永久移除{pendingDelete ? ` ${pendingDelete.employeeName} ` : ""}
              在「
              {PERFORMANCE_CYCLES.find((item) => item.id === cycle)?.label ??
                cycle}
              」的自評內容、主管評分與回饋，且無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                if (pendingDelete) void removeReview(pendingDelete);
              }}
            >
              {deleting ? "刪除中…" : "確定刪除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
