import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  FileText,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Save,
  Search,
  Target,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

import { useUser } from "@/components/auth/UserContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

import {
  calculatePerformanceSummary,
  DEFAULT_PERFORMANCE_REVIEWS,
  getPerformanceStatusForAction,
  PERFORMANCE_CYCLES,
  PERFORMANCE_STATUS,
  normalizePerformanceReview,
  toPerformanceCsv,
} from "./performanceData.mjs";
import "./performance.css";

const STORAGE_KEY = "station-status-hub:performance-reviews:v1";
// Keep this workspace resilient while the generated Supabase client types catch up with the new table.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const performanceSupabase = supabase as any;
const performanceStatusEntries = Object.entries(PERFORMANCE_STATUS) as Array<[
  PerformanceStatus,
  { label: string; tone: string },
]>;

type PerformanceTab = "overview" | "mine" | "team";
type PerformanceStatus = "draft" | "in-progress" | "submitted" | "approved";
type PerformanceFormMode = "admin" | "self" | "manager";
type PerformanceSaveAction = "draft" | "submit" | "return";

const SIDEBAR_STORAGE_KEY = "station-status-hub:performance-sidebar-collapsed:v1";
const PERFORMANCE_NAV_ITEMS = [
  { id: "overview" as const, label: "績效總覽", description: "摘要與全部考核", icon: FileText },
  { id: "mine" as const, label: "我的考核", description: "個人目標與回饋", icon: UserRound },
  { id: "team" as const, label: "團隊考核", description: "主管評分與追蹤", icon: UsersRound },
];

interface PerformanceGoal {
  id: string;
  category: "KPI" | "OKR" | "IDP";
  title: string;
  progress: number;
  weight: number;
}

interface PerformanceReview {
  id: string;
  cycleId: string;
  employeeId: string;
  employeeName: string;
  department: string;
  role: string;
  reviewerName: string;
  status: PerformanceStatus;
  score: number | null;
  dueDate: string;
  updatedAt: string;
  selfFeedback: string;
  managerFeedback: string;
  goals: PerformanceGoal[];
}

interface EmployeeOption {
  id: string;
  label: string;
  department: string;
  role: string;
}

interface ReviewFormState {
  employeeId: string;
  employeeName: string;
  department: string;
  role: string;
  reviewerName: string;
  status: PerformanceStatus;
  score: string;
  dueDate: string;
  goalCategory: "KPI" | "OKR" | "IDP";
  goalTitle: string;
  goalProgress: string;
  goalWeight: string;
  selfFeedback: string;
  managerFeedback: string;
}

const EMPTY_FORM: ReviewFormState = {
  employeeId: "",
  employeeName: "",
  department: "",
  role: "工程師",
  reviewerName: "",
  status: "draft",
  score: "",
  dueDate: "2026-09-30",
  goalCategory: "KPI",
  goalTitle: "",
  goalProgress: "0",
  goalWeight: "100",
  selfFeedback: "",
  managerFeedback: "",
};

const formatUpdatedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "尚未更新";
  return new Intl.DateTimeFormat("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const formatDueDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value || "未設定";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
};

const getAverageGoalProgress = (review: PerformanceReview) => {
  if (!review.goals.length) return 0;
  return Math.round(review.goals.reduce((sum, goal) => sum + goal.progress, 0) / review.goals.length);
};

const readLocalReviews = (): PerformanceReview[] => {
  if (typeof window === "undefined") return DEFAULT_PERFORMANCE_REVIEWS as PerformanceReview[];
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_PERFORMANCE_REVIEWS as PerformanceReview[];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.map((review) => normalizePerformanceReview(review) as PerformanceReview)
      : DEFAULT_PERFORMANCE_REVIEWS as PerformanceReview[];
  } catch {
    return DEFAULT_PERFORMANCE_REVIEWS as PerformanceReview[];
  }
};

const persistLocalReviews = (reviews: PerformanceReview[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
};

const getMine = (review: PerformanceReview, user: { userId?: string; username?: string; displayName?: string } | null) => {
  const candidates = [user?.userId, user?.username, user?.displayName].filter(Boolean);
  return candidates.includes(review.employeeId) || candidates.includes(review.employeeName);
};

const getReviewForm = (review?: PerformanceReview | null, reviewerName = "管理員"): ReviewFormState => {
  if (!review) return { ...EMPTY_FORM, reviewerName };
  const goal = review.goals[0];
  return {
    employeeId: review.employeeId,
    employeeName: review.employeeName,
    department: review.department,
    role: review.role,
    reviewerName: review.reviewerName,
    status: review.status,
    score: review.score == null ? "" : String(review.score),
    dueDate: review.dueDate,
    goalCategory: goal?.category || "KPI",
    goalTitle: goal?.title || "",
    goalProgress: String(goal?.progress || 0),
    goalWeight: String(goal?.weight || 100),
    selfFeedback: review.selfFeedback,
    managerFeedback: review.managerFeedback,
  };
};

function StatusPill({ status }: { status: PerformanceStatus }) {
  const config = PERFORMANCE_STATUS[status];
  return (
    <span className={`performance-status performance-status--${config.tone}`}>
      {status === "approved" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
      {config.label}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="flex min-w-[120px] items-center gap-2">
      <div className="performance-progress-track flex-1">
        <div className="performance-progress-value" style={{ width: `${value}%` }} />
      </div>
      <span className="w-9 text-right text-xs font-bold text-cyan-100">{value}%</span>
    </div>
  );
}

interface PerformanceSidebarProps {
  activeTab: PerformanceTab;
  canEdit: boolean;
  collapsed: boolean;
  currentCycle: { id: string; label: string; period: string };
  dataSource: "cloud" | "local";
  isLoading: boolean;
  mineCount: number;
  mobileOpen: boolean;
  reviewCount: number;
  selectedCycle: string;
  onCollapseChange: (collapsed: boolean) => void;
  onExport: () => void;
  onMobileOpenChange: (open: boolean) => void;
  onNewReview: () => void;
  onRefresh: () => void;
  onSelectCycle: (cycleId: string) => void;
  onTabChange: (tab: PerformanceTab) => void;
}

function PerformanceSidebar({
  activeTab,
  canEdit,
  collapsed,
  currentCycle,
  dataSource,
  isLoading,
  mineCount,
  mobileOpen,
  reviewCount,
  selectedCycle,
  onCollapseChange,
  onExport,
  onMobileOpenChange,
  onNewReview,
  onRefresh,
  onSelectCycle,
  onTabChange,
}: PerformanceSidebarProps) {
  const compact = collapsed && !mobileOpen;
  const navCounts: Record<PerformanceTab, number | null> = {
    overview: reviewCount,
    mine: mineCount,
    team: Math.max(0, reviewCount - mineCount),
  };

  const handleTabChange = (tab: PerformanceTab) => {
    onTabChange(tab);
    onMobileOpenChange(false);
  };

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="performance-sidebar-backdrop"
          aria-label="關閉績效工作區選單"
          onClick={() => onMobileOpenChange(false)}
        />
      )}
      <aside
        className={cn(
          "performance-sidebar",
          compact && "is-collapsed",
          mobileOpen && "is-mobile-open",
        )}
        data-testid="performance-sidebar"
        aria-label="績效考核工作區"
      >
        <div className="performance-sidebar-heading">
          <span className="performance-sidebar-mark" aria-hidden="true">
            <Target className="h-5 w-5" />
          </span>
          {!compact && (
            <div className="performance-sidebar-title">
              <strong>績效工作區</strong>
              <span>People Performance</span>
            </div>
          )}
          <button
            type="button"
            className="performance-sidebar-collapse"
            aria-label={compact ? "展開績效側邊欄" : "收合績效側邊欄"}
            title={compact ? "展開側邊欄" : "收合側邊欄"}
            onClick={() => onCollapseChange(!collapsed)}
          >
            {compact ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
          <button
            type="button"
            className="performance-sidebar-mobile-close"
            aria-label="關閉績效工作區選單"
            onClick={() => onMobileOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="performance-sidebar-nav" aria-label="績效考核導覽">
          {!compact && <p className="performance-sidebar-label">考核檢視</p>}
          {PERFORMANCE_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={cn("performance-sidebar-item", active && "is-active")}
                data-performance-nav={item.id}
                aria-current={active ? "page" : undefined}
                title={compact ? item.label : undefined}
                onClick={() => handleTabChange(item.id)}
              >
                <span className="performance-sidebar-item-icon"><Icon className="h-5 w-5" /></span>
                {!compact && (
                  <span className="performance-sidebar-item-copy">
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                )}
                {!compact && navCounts[item.id] !== null && (
                  <span className="performance-sidebar-count">{navCounts[item.id]}</span>
                )}
              </button>
            );
          })}
        </nav>

        {!compact && (
          <div className="performance-sidebar-cycle">
            <div className="performance-sidebar-section-title">
              <CalendarDays className="h-4 w-4" />
              <span>考核週期</span>
            </div>
            <select
              aria-label="選擇考核週期"
              value={selectedCycle}
              onChange={(event) => onSelectCycle(event.target.value)}
              className="performance-select"
            >
              {PERFORMANCE_CYCLES.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.label}</option>)}
            </select>
            <p>{currentCycle.period}</p>
          </div>
        )}

        <div className="performance-sidebar-actions" aria-label="績效考核常用操作">
          {!compact && <p className="performance-sidebar-label">常用操作</p>}
          {canEdit && (
            <button type="button" className="performance-sidebar-action is-primary" onClick={onNewReview} title="新增考核">
              <Plus className="h-4 w-4" />
              {!compact && <span>新增考核</span>}
            </button>
          )}
          <button type="button" className="performance-sidebar-action is-amber" onClick={onExport} title="匯出報表">
            <Download className="h-4 w-4" />
            {!compact && <span>匯出報表</span>}
          </button>
          <button type="button" className="performance-sidebar-action" onClick={onRefresh} disabled={isLoading} title="重新整理">
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            {!compact && <span>{isLoading ? "同步中" : "重新整理"}</span>}
          </button>
        </div>

        <div className="performance-sidebar-footer">
          <span className="performance-source-dot" />
          {!compact && (
            <span>
              <strong>{dataSource === "cloud" ? "共用資料已同步" : "本機示範資料"}</strong>
              <small>{canEdit ? "管理模式" : "檢視模式"}</small>
            </span>
          )}
        </div>
      </aside>
    </>
  );
}

export function PerformanceAppraisalPage() {
  const { user } = useUser();
  const { canEditModule } = usePermissions();
  const canEdit = canEditModule("performance");
  const { toast } = useToast();
  const [reviews, setReviews] = useState<PerformanceReview[]>(readLocalReviews);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedCycle, setSelectedCycle] = useState("2026-q3");
  const [activeTab, setActiveTab] = useState<PerformanceTab>("overview");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PerformanceStatus>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [dataSource, setDataSource] = useState<"cloud" | "local">("local");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<PerformanceReview | null>(null);
  const [formReview, setFormReview] = useState<PerformanceReview | null>(null);
  const [formMode, setFormMode] = useState<PerformanceFormMode>("admin");
  const [form, setForm] = useState<ReviewFormState>(() => getReviewForm(null, user?.displayName || "管理員"));
  const [formOpen, setFormOpen] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const localReviews = readLocalReviews();
    try {
      const [{ data: reviewRows, error: reviewError }, { data: employeeRows, error: employeeError }] = await Promise.all([
        performanceSupabase.from("performance_reviews").select("*").order("updated_at", { ascending: false }),
        performanceSupabase.from("system_users").select("id, display_name, username, role").eq("status", "active").order("display_name"),
      ]);

      if (reviewError) throw reviewError;
      const cloudReviews = (reviewRows || []).map((review) => normalizePerformanceReview(review) as PerformanceReview);
      setReviews(cloudReviews.length ? cloudReviews : localReviews);
      setDataSource(cloudReviews.length ? "cloud" : "local");
      if (cloudReviews.length) persistLocalReviews(cloudReviews);

      if (!employeeError && employeeRows) {
        setEmployees(employeeRows.map((employee) => ({
          id: employee.id,
          label: employee.display_name || employee.username,
          department: "",
          role: employee.role === "admin" || employee.role === "super_admin" ? "管理員" : "工程師",
        })));
      }
    } catch (error) {
      console.warn("Performance cloud data is unavailable; using local fallback.", error);
      setReviews(localReviews);
      setDataSource("local");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!mobileSidebarOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileSidebarOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileSidebarOpen]);

  const reviewRows = useMemo(
    () => reviews.filter((review) => review.cycleId === selectedCycle),
    [reviews, selectedCycle],
  );
  const currentCycle = PERFORMANCE_CYCLES.find((cycle) => cycle.id === selectedCycle) || PERFORMANCE_CYCLES[0];
  const activeNavigation = PERFORMANCE_NAV_ITEMS.find((item) => item.id === activeTab) || PERFORMANCE_NAV_ITEMS[0];
  const summary = useMemo(() => calculatePerformanceSummary(reviewRows), [reviewRows]);
  const mineCount = useMemo(
    () => reviewRows.filter((review) => getMine(review, user)).length,
    [reviewRows, user],
  );
  const filteredReviews = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return reviewRows.filter((review) => {
      const mine = getMine(review, user);
      if (activeTab === "mine" && !mine) return false;
      if (activeTab === "team" && mine) return false;
      if (statusFilter !== "all" && review.status !== statusFilter) return false;
      if (!keyword) return true;
      return [review.employeeName, review.department, review.reviewerName, review.role]
        .some((value) => value.toLowerCase().includes(keyword));
    });
  }, [activeTab, reviewRows, search, statusFilter, user]);

  const employeeOptions = useMemo(() => {
    const optionMap = new Map<string, EmployeeOption>();
    employees.forEach((employee) => optionMap.set(employee.id, employee));
    reviews.forEach((review) => {
      if (!optionMap.has(review.employeeId)) {
        optionMap.set(review.employeeId, {
          id: review.employeeId,
          label: review.employeeName,
          department: review.department,
          role: review.role,
        });
      }
    });
    return Array.from(optionMap.values());
  }, [employees, reviews]);

  const openNewReview = () => {
    setFormMode("admin");
    setFormReview(null);
    setForm(getReviewForm(null, user?.displayName || "管理員"));
    setFormOpen(true);
  };

  const openEditReview = (review: PerformanceReview) => {
    setFormMode("admin");
    setFormReview(review);
    setForm(getReviewForm(review, user?.displayName || "管理員"));
    setFormOpen(true);
  };

  const openSelfReview = (review: PerformanceReview) => {
    setFormMode("self");
    setFormReview(review);
    setForm(getReviewForm(review, user?.displayName || "管理員"));
    setSelectedReview(null);
    setFormOpen(true);
  };

  const openManagerReview = (review: PerformanceReview) => {
    setFormMode("manager");
    setFormReview(review);
    setForm(getReviewForm(review, user?.displayName || "管理員"));
    setSelectedReview(null);
    setFormOpen(true);
  };

  const updateForm = (key: keyof ReviewFormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleEmployeeChange = (employeeId: string) => {
    const employee = employeeOptions.find((option) => option.id === employeeId);
    if (!employee) {
      updateForm("employeeId", employeeId);
      return;
    }
    setForm((current) => ({
      ...current,
      employeeId,
      employeeName: employee.label,
      department: employee.department || current.department,
      role: employee.role || current.role,
    }));
  };

  const saveReview = async (action: PerformanceSaveAction = "draft") => {
    if (!form.employeeName.trim() || !form.goalTitle.trim()) {
      toast({ title: "資料尚未完成", description: "請先選擇員工並填寫至少一個考核目標。", variant: "destructive" });
      return;
    }

    if (formMode === "self" && action === "submit" && !form.selfFeedback.trim()) {
      toast({ title: "自評尚未完成", description: "請以 STAR 寫下本期實際貢獻，再送出給主管。", variant: "destructive" });
      return;
    }

    const numericScore = form.score === "" ? null : Number(form.score);
    if (formMode === "manager" && action === "submit" && (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100)) {
      toast({ title: "尚未完成主管評分", description: "請先輸入 0 到 100 的評分。", variant: "destructive" });
      return;
    }
    if (formMode === "manager" && action === "submit" && !form.managerFeedback.trim()) {
      toast({ title: "請補充主管回饋", description: "送出前請留下具體肯定、改善方向或下一步。", variant: "destructive" });
      return;
    }

    const previous = formReview?.goals || [];
    const nextReview = normalizePerformanceReview({
      ...(formReview || {}),
      id: formReview?.id || `performance-${Date.now()}`,
      cycleId: formReview?.cycleId || selectedCycle,
      employeeId: form.employeeId || form.employeeName,
      employeeName: form.employeeName.trim(),
      department: form.department.trim() || "未指定部門",
      role: form.role.trim() || "工程師",
      reviewerName: form.reviewerName.trim() || user?.displayName || "管理員",
      status: getPerformanceStatusForAction({ mode: formMode, action, currentStatus: form.status }),
      score: formMode === "self"
        ? formReview?.score ?? null
        : numericScore == null || !Number.isFinite(numericScore)
          ? null
          : Math.min(100, Math.max(0, numericScore)),
      dueDate: form.dueDate,
      selfFeedback: formMode === "manager" ? formReview?.selfFeedback || "" : form.selfFeedback,
      managerFeedback: formMode === "self" ? formReview?.managerFeedback || "" : form.managerFeedback,
      updatedAt: new Date().toISOString(),
      goals: [
        {
          id: previous[0]?.id || `goal-${Date.now()}`,
          category: form.goalCategory,
          title: form.goalTitle.trim(),
          progress: Math.min(100, Math.max(0, Number(form.goalProgress) || 0)),
          weight: Math.max(0, Number(form.goalWeight) || 100),
        },
        ...previous.slice(1),
      ],
    }) as PerformanceReview;

    const nextReviews = formReview
      ? reviews.map((review) => review.id === formReview.id ? nextReview : review)
      : [nextReview, ...reviews];
    setReviews(nextReviews);
    persistLocalReviews(nextReviews);

    try {
      const { error } = await performanceSupabase.from("performance_reviews").upsert({
        id: nextReview.id,
        cycle_id: nextReview.cycleId,
        employee_id: nextReview.employeeId || null,
        employee_name: nextReview.employeeName,
        department: nextReview.department,
        role: nextReview.role,
        reviewer_name: nextReview.reviewerName,
        status: nextReview.status,
        score: nextReview.score,
        due_date: nextReview.dueDate,
        goals: nextReview.goals,
        self_feedback: nextReview.selfFeedback,
        manager_feedback: nextReview.managerFeedback,
        updated_at: nextReview.updatedAt,
      });
      if (error) throw error;
      setDataSource("cloud");
      const actionLabel = formMode === "self"
        ? action === "submit" ? "自評已送出" : "自評草稿已儲存"
        : formMode === "manager"
          ? action === "return" ? "已退回補充" : action === "submit" ? "主管評分已送出" : "主管評分已儲存"
          : formReview ? "考核已更新" : "考核已建立";
      toast({ title: actionLabel, description: "資料已同步到共用工作區。" });
    } catch {
      setDataSource("local");
      const actionLabel = formMode === "self"
        ? action === "submit" ? "自評已送出" : "自評草稿已儲存"
        : formMode === "manager"
          ? action === "return" ? "已退回補充" : action === "submit" ? "主管評分已送出" : "主管評分已儲存"
          : formReview ? "考核已更新" : "考核已建立";
      toast({ title: actionLabel, description: "雲端資料表尚未啟用，已先保存在本機瀏覽器。" });
    }

    setFormOpen(false);
  };

  const exportReport = () => {
    const blob = new Blob(["\uFEFF", toPerformanceCsv(filteredReviews)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `performance-${selectedCycle}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast({ title: "報表已匯出", description: `已匯出 ${filteredReviews.length} 筆考核資料。` });
  };

  const renderReviewActions = (review: PerformanceReview) => {
    const mine = getMine(review, user);
    if (review.status === "approved") {
      return <Button type="button" variant="ghost" onClick={() => setSelectedReview(review)} className="h-9 rounded-lg px-2.5 text-xs text-slate-300">查看</Button>;
    }
    return (
      <div className="performance-row-actions">
        {mine ? (
          <Button type="button" onClick={() => openSelfReview(review)} className="h-9 rounded-lg bg-cyan-300 px-2.5 text-xs font-bold text-[#062030] hover:bg-cyan-200">填寫自評</Button>
        ) : canEdit ? (
          <Button type="button" onClick={() => openManagerReview(review)} className="h-9 rounded-lg bg-emerald-300/15 px-2.5 text-xs font-bold text-emerald-100 hover:bg-emerald-300/25">主管評分</Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={() => setSelectedReview(review)} className="h-9 rounded-lg px-2.5 text-xs text-slate-300 hover:bg-cyan-300/10 hover:text-cyan-100">查看</Button>
      </div>
    );
  };

  return (
    <section
      className={cn("performance-workspace", sidebarCollapsed && "is-sidebar-collapsed")}
      data-workspace="performance"
      data-performance-shell="true"
    >
      <PerformanceSidebar
        activeTab={activeTab}
        canEdit={canEdit}
        collapsed={sidebarCollapsed}
        currentCycle={currentCycle}
        dataSource={dataSource}
        isLoading={isLoading}
        mineCount={mineCount}
        mobileOpen={mobileSidebarOpen}
        reviewCount={reviewRows.length}
        selectedCycle={selectedCycle}
        onCollapseChange={setSidebarCollapsed}
        onExport={exportReport}
        onMobileOpenChange={setMobileSidebarOpen}
        onNewReview={openNewReview}
        onRefresh={() => void loadData()}
        onSelectCycle={setSelectedCycle}
        onTabChange={setActiveTab}
      />

      <div className="performance-content">
        <header className="performance-hero">
          <div className="performance-hero-copy">
            <button
              type="button"
              className="performance-mobile-menu"
              data-testid="performance-mobile-nav"
              aria-label="開啟績效工作區選單"
              onClick={() => {
                setSidebarCollapsed(false);
                setMobileSidebarOpen(true);
              }}
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="performance-hero-icon" aria-hidden="true"><Target className="h-6 w-6" /></span>
            <div className="min-w-0">
              <div className="performance-eyebrow">PEOPLE · PERFORMANCE <span>第七工作區</span></div>
              <h1>績效考核系統</h1>
              <p>從三個入口開始：建立考核、填寫自評，或查看團隊進度。</p>
            </div>
          </div>
          <div className="performance-hero-context performance-hero-context--compact" aria-label="考核週期與資料狀態">
            <div>
              <span>本期週期</span>
              <strong>{currentCycle.label}</strong>
              <small>{currentCycle.period}</small>
            </div>
            <span className="performance-hero-source">
              <span className="performance-source-dot" />
              {dataSource === "cloud" ? "已同步" : "本機資料"}
            </span>
          </div>
        </header>

        <div className="space-y-4 py-4 sm:space-y-5 sm:py-5" data-performance-main="true">
        <section className="performance-next-step" data-performance-zone="quick-start" aria-labelledby="performance-quick-start-title">
          <div className="performance-next-step-copy">
            <span className="performance-kicker">先做這件事</span>
            <h2 id="performance-quick-start-title">你現在要做什麼？</h2>
            <p>選一個入口就能開始，不用同時看懂全部資料。</p>
          </div>
          <div className="performance-next-step-actions">
            <button type="button" className="performance-next-step-action is-primary" onClick={canEdit ? openNewReview : () => setActiveTab("overview")}>
              <span className="performance-next-step-number">1</span>
              <span className="performance-next-step-label">{canEdit ? "新增考核" : "查看考核"}<small>{canEdit ? "建立員工與目標" : "查看本期清單"}</small></span>
              <Plus className="h-4 w-4 shrink-0" />
            </button>
            <button type="button" className="performance-next-step-action" onClick={() => setActiveTab("mine")}>
              <span className="performance-next-step-number">2</span>
              <span className="performance-next-step-label">填寫我的考核<small>{mineCount ? `${mineCount} 筆待處理` : "查看個人目標"}</small></span>
              <UserRound className="h-4 w-4 shrink-0" />
            </button>
            <button type="button" className="performance-next-step-action" onClick={() => setActiveTab("team")}>
              <span className="performance-next-step-number">3</span>
              <span className="performance-next-step-label">查看團隊進度<small>追蹤主管評分</small></span>
              <UsersRound className="h-4 w-4 shrink-0" />
            </button>
          </div>
        </section>

        <section className="performance-summary-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="考核摘要">
          <div className="performance-stat rounded-2xl p-4 sm:p-5">
            <div className="flex items-start justify-between"><span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">本期考核人數</span><UsersRound className="h-5 w-5 text-cyan-200" /></div>
            <div className="mt-3 text-3xl font-black text-white">{summary.total}</div>
            <p className="mt-1 text-xs text-slate-400">已建立的考核紀錄</p>
          </div>
          <div className="performance-stat performance-stat--mint rounded-2xl p-4 sm:p-5">
            <div className="flex items-start justify-between"><span className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100/70">平均目標進度</span><BarChart3 className="h-5 w-5 text-emerald-200" /></div>
            <div className="mt-3 text-3xl font-black text-white">{summary.averageProgress}%</div>
            <ProgressBar value={summary.averageProgress} />
          </div>
          <div className="performance-stat performance-stat--amber rounded-2xl p-4 sm:p-5">
            <div className="flex items-start justify-between"><span className="text-xs font-black uppercase tracking-[0.18em] text-amber-100/70">已完成</span><CheckCircle2 className="h-5 w-5 text-amber-200" /></div>
            <div className="mt-3 text-3xl font-black text-white">{summary.completed}<span className="ml-1 text-base font-bold text-slate-400">/ {summary.total}</span></div>
            <p className="mt-1 text-xs text-slate-400">仍有 {summary.pending} 筆待處理</p>
          </div>
          <div className="performance-stat performance-stat--violet rounded-2xl p-4 sm:p-5">
            <div className="flex items-start justify-between"><span className="text-xs font-black uppercase tracking-[0.18em] text-violet-100/70">平均評分</span><ClipboardCheck className="h-5 w-5 text-violet-200" /></div>
            <div className="mt-3 text-3xl font-black text-white">{summary.averageScore || "--"}<span className="ml-1 text-base font-bold text-slate-400">/ 100</span></div>
            <p className="mt-1 text-xs text-slate-400">已完成評分的平均值</p>
          </div>
        </section>

        <section className="performance-surface performance-filter-panel rounded-2xl p-3 sm:p-4" data-performance-zone="filters">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/65">快速找到考核</p>
              <p className="mt-1 text-sm text-slate-400">先選分頁，再用關鍵字或狀態縮小清單。 · 顯示 {filteredReviews.length} 筆</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative block min-w-0 sm:min-w-[260px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋員工、部門或考核人" className="h-10 rounded-xl border-cyan-200/15 bg-[#061522]/70 pl-9 text-slate-100 placeholder:text-slate-500" />
              </label>
              <select aria-label="篩選考核狀態" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | PerformanceStatus)} className="performance-select h-10 sm:w-[170px]">
                <option value="all">全部狀態</option>
                {performanceStatusEntries.map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}
              </select>
            </div>
          </div>
        </section>

        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.65fr)]">
          <section className="performance-surface performance-review-list min-w-0 rounded-2xl p-4 sm:p-5" data-performance-zone="review-list">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200/70">目前考核</p>
                <h2 className="mt-1 text-xl font-black text-white">考核清單</h2>
                <p className="mt-1 text-sm text-slate-400">點選員工查看目標與回饋，右側只保留下一步。</p>
              </div>
              <span className="rounded-full border border-slate-600/70 bg-slate-900/40 px-3 py-1 text-xs font-bold text-slate-300">顯示 {filteredReviews.length} / {reviewRows.length} 筆</span>
            </div>

            {filteredReviews.length ? (
              <>
                <div className="performance-table-scroll hidden overflow-x-auto md:block">
                  <table className="performance-table w-full min-w-[820px] border-separate border-spacing-0 text-left" aria-label="績效考核清單">
                    <thead><tr><th className="pb-3 pr-4">員工</th><th className="pb-3 pr-4">部門／考核人</th><th className="pb-3 pr-4">目標進度</th><th className="pb-3 pr-4">狀態</th><th className="pb-3 pr-4">評分</th><th className="pb-3 text-right">操作</th></tr></thead>
                    <tbody>
                      {filteredReviews.map((review) => {
                        const progress = getAverageGoalProgress(review);
                        return (
                          <tr key={review.id}>
                            <td className="py-4 pr-4"><button type="button" onClick={() => setSelectedReview(review)} className="group flex min-w-0 items-center gap-3 text-left"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-200/20 bg-cyan-300/10 text-sm font-black text-cyan-100">{review.employeeName.slice(0, 2).toUpperCase()}</span><span className="min-w-0"><strong className="block truncate text-sm text-white group-hover:text-cyan-100">{review.employeeName}</strong><span className="block truncate text-xs text-slate-500">{review.role}</span></span></button></td>
                            <td className="py-4 pr-4"><span className="block text-sm text-slate-200">{review.department}</span><span className="block text-xs text-slate-500">考核人：{review.reviewerName}</span></td>
                            <td className="py-4 pr-4"><ProgressBar value={progress} /><span className="mt-1 block text-[11px] text-slate-500">更新於 {formatUpdatedAt(review.updatedAt)}</span></td>
                            <td className="py-4 pr-4"><StatusPill status={review.status} /></td>
                            <td className="py-4 pr-4 text-lg font-black text-white">{review.score == null ? <span className="text-slate-500">--</span> : review.score}</td>
                            <td className="py-4 text-right">{renderReviewActions(review)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="grid gap-3 md:hidden">
                  {filteredReviews.map((review) => {
                    const progress = getAverageGoalProgress(review);
                    return <article key={review.id} className="rounded-2xl border border-cyan-100/10 bg-[#071b2d]/80 p-4"><div className="flex items-start justify-between gap-3"><button type="button" onClick={() => setSelectedReview(review)} className="flex min-w-0 items-center gap-3 text-left"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-300/10 text-sm font-black text-cyan-100">{review.employeeName.slice(0, 2).toUpperCase()}</span><span className="min-w-0"><strong className="block truncate text-sm text-white">{review.employeeName}</strong><span className="block truncate text-xs text-slate-500">{review.department}</span></span></button><StatusPill status={review.status} /></div><div className="mt-4 flex items-center justify-between text-xs text-slate-400"><span>目標平均進度</span><strong className="text-cyan-100">{progress}%</strong></div><div className="mt-2"><ProgressBar value={progress} /></div><div className="mt-4 flex items-center justify-between gap-3"><span className="text-sm text-slate-400">評分 <strong className="ml-1 text-white">{review.score ?? "--"}</strong></span>{renderReviewActions(review)}</div></article>;
                  })}
                </div>
              </>
            ) : (
              <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-cyan-100/15 bg-[#061522]/45 p-6 text-center"><div><Target className="mx-auto h-8 w-8 text-slate-500" /><p className="mt-3 font-bold text-slate-200">目前沒有符合條件的考核</p><p className="mt-1 text-sm text-slate-500">調整篩選條件，或建立本期第一筆考核。</p>{canEdit && <Button type="button" onClick={openNewReview} className="mt-4 rounded-xl bg-cyan-300 text-[#062030] hover:bg-cyan-200"><Plus className="mr-2 h-4 w-4" />新增考核</Button>}</div></div>
            )}
          </section>

          <aside className="space-y-4" data-performance-zone="cycle-insights">
            <section className="performance-surface performance-help rounded-2xl p-4 sm:p-5"><details><summary><span className="flex min-w-0 items-center gap-2"><FileText className="h-5 w-5 shrink-0 text-cyan-200" /><span><strong>不確定怎麼用？</strong><small>看 3 步驟</small></span></span><span className="performance-help-toggle" aria-hidden="true">+</span></summary><div className="performance-help-body space-y-3">{[["01", "員工自評", "寫下成果，再送出給主管。"], ["02", "主管評分", "沿用同一筆目標補上評分與回饋。"], ["03", "完成考核", "確認後送出，完成本期考核。"]].map(([step, title, description]) => <div key={step} className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-cyan-300/10 text-xs font-black text-cyan-100">{step}</span><div><strong className="block text-sm text-slate-100">{title}</strong><p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p></div></div>)}</div></details></section>
            <section className="rounded-2xl border border-emerald-200/15 bg-emerald-300/[0.06] p-4"><div className="flex gap-3"><ArrowUpRight className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" /><div><strong className="block text-sm text-emerald-50">權限依工作區控管</strong><p className="mt-1 text-xs leading-5 text-emerald-100/65">目前為 {canEdit ? "管理模式，可新增、編輯與完成考核" : "檢視模式，只能查看與匯出報表"}。</p></div></div></section>
          </aside>
        </div>
      </div>
      </div>

      <Dialog open={Boolean(selectedReview)} onOpenChange={(open) => !open && setSelectedReview(null)}>
        <DialogContent className="max-h-[90dvh] w-[min(94vw,720px)] overflow-y-auto border-cyan-200/25 bg-[#081a2a] p-0 text-slate-100">
          {selectedReview && <><DialogHeader className="border-b border-cyan-100/10 bg-[#0d263a] px-5 py-5 sm:px-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200/70">{selectedReview.cycleId} · REVIEW DETAIL</p><DialogTitle className="mt-1 text-2xl font-black text-white">{selectedReview.employeeName}</DialogTitle><DialogDescription className="mt-1 text-slate-400">{selectedReview.department} · {selectedReview.role} · 考核人 {selectedReview.reviewerName}</DialogDescription></div><StatusPill status={selectedReview.status} /></div></DialogHeader><div className="space-y-5 p-5 sm:p-6"><div className="grid grid-cols-3 gap-2 rounded-2xl border border-cyan-100/10 bg-cyan-300/[0.04] p-3 text-center text-xs"><div className="rounded-xl bg-cyan-300/10 p-2 font-bold text-cyan-100">1. 填寫貢獻</div><div className={cn("rounded-xl p-2 font-bold", selectedReview.status === "draft" || selectedReview.status === "in-progress" ? "bg-white/[0.04] text-slate-500" : "bg-sky-300/10 text-sky-100")}>2. 送出自評</div><div className={cn("rounded-xl p-2 font-bold", selectedReview.status === "approved" ? "bg-emerald-300/10 text-emerald-100" : "bg-white/[0.04] text-slate-500")}>3. 主管完成</div></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><span className="text-xs text-slate-500">目標進度</span><strong className="mt-1 block text-xl text-cyan-100">{getAverageGoalProgress(selectedReview)}%</strong></div><div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><span className="text-xs text-slate-500">評分</span><strong className="mt-1 block text-xl text-white">{selectedReview.score ?? "--"}</strong></div><div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><span className="text-xs text-slate-500">截止日期</span><strong className="mt-1 block text-sm text-white">{formatDueDate(selectedReview.dueDate)}</strong></div><div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><span className="text-xs text-slate-500">最近更新</span><strong className="mt-1 block text-sm text-white">{formatUpdatedAt(selectedReview.updatedAt)}</strong></div></div><section><h3 className="flex items-center gap-2 text-sm font-black text-white"><Target className="h-4 w-4 text-cyan-200" />本期目標</h3><div className="mt-3 space-y-3">{selectedReview.goals.map((goal) => <div key={goal.id} className="rounded-xl border border-white/10 bg-[#071b2d] p-3"><div className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-slate-200">{goal.category || "KPI"} · {goal.title}</span><span className="text-xs font-black text-cyan-100">{goal.progress}%</span></div><div className="mt-2"><ProgressBar value={goal.progress} /></div></div>)}</div></section><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-cyan-100/10 bg-[#071b2d] p-4"><h3 className="text-sm font-black text-cyan-100">員工自評貢獻（STAR）</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{selectedReview.selfFeedback || "尚未填寫"}</p></div><div className="rounded-xl border border-amber-100/10 bg-[#071b2d] p-4"><h3 className="text-sm font-black text-amber-100">主管回饋</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{selectedReview.managerFeedback || "尚未填寫"}</p></div></div></div><DialogFooter className="flex-wrap border-t border-cyan-100/10 bg-[#071522] px-5 py-4 sm:px-6"><Button type="button" variant="outline" onClick={() => setSelectedReview(null)} className="rounded-xl border-slate-600 text-slate-200">關閉</Button>{selectedReview.status !== "approved" && getMine(selectedReview, user) && <Button type="button" onClick={() => openSelfReview(selectedReview)} className="rounded-xl bg-cyan-300 text-[#062030] hover:bg-cyan-200">填寫我的貢獻</Button>}{canEdit && selectedReview.status !== "approved" && !getMine(selectedReview, user) && <Button type="button" onClick={() => openManagerReview(selectedReview)} className="rounded-xl bg-emerald-300 text-[#05251d] hover:bg-emerald-200"><ClipboardCheck className="mr-2 h-4 w-4" />主管評分</Button>}{canEdit && selectedReview.status !== "approved" && <Button type="button" variant="outline" onClick={() => { setSelectedReview(null); openEditReview(selectedReview); }} className="rounded-xl border-cyan-200/25 text-cyan-100">編輯紀錄</Button>}</DialogFooter></>}
        </DialogContent>
      </Dialog>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[92dvh] w-[min(94vw,760px)] overflow-y-auto border-cyan-200/25 bg-[#081a2a] p-0 text-slate-100">
          <DialogHeader className="border-b border-cyan-100/10 bg-[#0d263a] px-5 py-5 sm:px-6"><DialogTitle className="flex items-center gap-2 text-xl font-black"><ClipboardCheck className="h-5 w-5 text-cyan-200" />{formMode === "self" ? "填寫我的貢獻" : formMode === "manager" ? "主管評分" : formReview ? "編輯考核" : "新增考核"}</DialogTitle><DialogDescription className="text-slate-400">{formMode === "self" ? "用 STAR 寫下成果與貢獻，儲存草稿或送出給主管審核。" : formMode === "manager" ? "確認員工目標與自評內容，給予評分與具體回饋。" : "建立考核紀錄並設定本期目標，後續由員工與主管接續完成。"}</DialogDescription></DialogHeader>
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            {formMode === "admin" ? <><div className="sm:col-span-2"><Label htmlFor="performance-employee" className="text-slate-300">考核員工 *</Label><select id="performance-employee" value={form.employeeId} onChange={(event) => handleEmployeeChange(event.target.value)} className="performance-select mt-1.5"><option value="">選擇員工</option>{employeeOptions.map((employee) => <option key={employee.id} value={employee.id}>{employee.label}{employee.department ? ` · ${employee.department}` : ""}</option>)}</select><Input value={form.employeeName} onChange={(event) => updateForm("employeeName", event.target.value)} placeholder="也可以直接輸入員工姓名" className="performance-input mt-2" /></div><div><Label htmlFor="performance-department" className="text-slate-300">部門</Label><Input id="performance-department" value={form.department} onChange={(event) => updateForm("department", event.target.value)} className="performance-input mt-1.5" /></div><div><Label htmlFor="performance-role" className="text-slate-300">職稱</Label><Input id="performance-role" value={form.role} onChange={(event) => updateForm("role", event.target.value)} className="performance-input mt-1.5" /></div><div><Label htmlFor="performance-reviewer" className="text-slate-300">考核人</Label><Input id="performance-reviewer" value={form.reviewerName} onChange={(event) => updateForm("reviewerName", event.target.value)} className="performance-input mt-1.5" /></div><div><Label htmlFor="performance-due" className="text-slate-300">截止日期</Label><Input id="performance-due" type="date" value={form.dueDate} onChange={(event) => updateForm("dueDate", event.target.value)} className="performance-input mt-1.5" /></div><div><Label htmlFor="performance-status" className="text-slate-300">狀態</Label><select id="performance-status" value={form.status} onChange={(event) => updateForm("status", event.target.value as PerformanceStatus)} className="performance-select mt-1.5">{performanceStatusEntries.map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}</select></div><div><Label htmlFor="performance-score" className="text-slate-300">評分（0 - 100）</Label><Input id="performance-score" type="number" min="0" max="100" value={form.score} onChange={(event) => updateForm("score", event.target.value)} placeholder="尚未評分" className="performance-input mt-1.5" /></div></> : <div className="sm:col-span-2 grid gap-3 rounded-2xl border border-cyan-100/10 bg-cyan-300/[0.04] p-4 sm:grid-cols-3"><div><span className="text-xs text-slate-500">員工</span><strong className="mt-1 block text-sm text-white">{form.employeeName}</strong></div><div><span className="text-xs text-slate-500">部門／職稱</span><strong className="mt-1 block text-sm text-white">{form.department} · {form.role}</strong></div><div><span className="text-xs text-slate-500">截止日期</span><strong className="mt-1 block text-sm text-white">{formatDueDate(form.dueDate)}</strong></div></div>}
            <div className="sm:col-span-2 rounded-2xl border border-cyan-100/10 bg-[#071b2d] p-4"><div className="flex items-center gap-2"><Target className="h-4 w-4 text-cyan-200" /><h3 className="text-sm font-black text-white">本期主要目標</h3><span className="ml-auto rounded-full bg-cyan-300/10 px-2 py-1 text-[10px] font-black text-cyan-100">{form.goalCategory}</span></div><div className="mt-3 grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]"><div><Label htmlFor="performance-goal-category" className="text-slate-300">類型</Label><select id="performance-goal-category" value={form.goalCategory} onChange={(event) => updateForm("goalCategory", event.target.value as ReviewFormState["goalCategory"])} disabled={formMode === "manager"} className="performance-select mt-1.5"><option value="KPI">KPI</option><option value="OKR">OKR</option><option value="IDP">IDP</option></select></div><div><Label htmlFor="performance-goal" className="text-slate-300">目標內容 *</Label><Input id="performance-goal" value={form.goalTitle} onChange={(event) => updateForm("goalTitle", event.target.value)} readOnly={formMode === "manager"} placeholder="例如：完成跨部門問題追蹤流程" className="performance-input mt-1.5" /></div></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><Label htmlFor="performance-progress" className="text-slate-300">目前進度（%）</Label><Input id="performance-progress" type="number" min="0" max="100" value={form.goalProgress} onChange={(event) => updateForm("goalProgress", event.target.value)} readOnly={formMode === "manager"} className="performance-input mt-1.5" /></div><div><Label htmlFor="performance-weight" className="text-slate-300">目標權重（%）</Label><Input id="performance-weight" type="number" min="0" max="100" value={form.goalWeight} onChange={(event) => updateForm("goalWeight", event.target.value)} readOnly={formMode === "manager"} className="performance-input mt-1.5" /></div></div></div>
            {formMode === "self" ? <div className="sm:col-span-2 rounded-2xl border border-cyan-200/20 bg-cyan-300/[0.05] p-4"><div className="flex items-start justify-between gap-3"><div><Label htmlFor="performance-self-feedback" className="text-cyan-100">STAR 自評實績 *</Label><p className="mt-1 text-xs leading-5 text-slate-400">S 情境／T 任務／A 行動／R 結果，請盡量寫出可驗證的成果。</p></div><span className="rounded-full border border-cyan-200/20 px-2 py-1 text-[10px] font-black text-cyan-100">員工填寫</span></div><textarea id="performance-self-feedback" value={form.selfFeedback} onChange={(event) => updateForm("selfFeedback", event.target.value)} className="performance-textarea mt-3 min-h-40" placeholder="S：遇到什麼情境？\nT：你負責什麼？\nA：採取哪些行動？\nR：帶來什麼結果？" /></div> : <div className="sm:col-span-2 rounded-2xl border border-cyan-100/10 bg-[#071b2d] p-4"><Label htmlFor="performance-self-feedback" className="text-cyan-100">員工自評貢獻（STAR）</Label><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{form.selfFeedback || "員工尚未送出自評內容"}</p></div>}
            {formMode !== "self" && <div className="sm:col-span-2 rounded-2xl border border-amber-100/15 bg-amber-300/[0.04] p-4"><div className="flex items-start justify-between gap-3"><div><Label htmlFor="performance-manager-feedback" className="text-amber-100">主管回饋{formMode === "manager" ? " *" : ""}</Label><p className="mt-1 text-xs text-slate-400">針對成果給予肯定、改善方向與下一步。</p></div>{formMode === "manager" && <span className="rounded-full border border-amber-200/20 px-2 py-1 text-[10px] font-black text-amber-100">主管填寫</span>}</div>{formMode === "admin" || formMode === "manager" ? <textarea id="performance-manager-feedback" value={form.managerFeedback} onChange={(event) => updateForm("managerFeedback", event.target.value)} className="performance-textarea mt-3 min-h-32" placeholder="請寫下具體觀察與下一步建議。" /> : <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{form.managerFeedback || "尚未填寫"}</p>}</div>}
          </div>
          <DialogFooter className="flex-wrap border-t border-cyan-100/10 bg-[#071522] px-5 py-4 sm:px-6"><Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="rounded-xl border-slate-600 text-slate-200"><X className="mr-2 h-4 w-4" />取消</Button>{formMode === "self" ? <><Button type="button" variant="outline" onClick={() => void saveReview("draft")} className="rounded-xl border-cyan-200/25 text-cyan-100"><Save className="mr-2 h-4 w-4" />儲存草稿</Button><Button type="button" onClick={() => void saveReview("submit")} className="rounded-xl bg-cyan-300 text-[#062030] hover:bg-cyan-200">送出自評</Button></> : formMode === "manager" ? <><Button type="button" variant="outline" onClick={() => void saveReview("return")} className="rounded-xl border-amber-200/25 text-amber-100">退回補充</Button><Button type="button" variant="outline" onClick={() => void saveReview("draft")} className="rounded-xl border-cyan-200/25 text-cyan-100"><Save className="mr-2 h-4 w-4" />儲存評分</Button><Button type="button" onClick={() => void saveReview("submit")} className="rounded-xl bg-emerald-300 text-[#05251d] hover:bg-emerald-200"><CheckCircle2 className="mr-2 h-4 w-4" />送出評核結果</Button></> : <Button type="button" onClick={() => void saveReview()} className="rounded-xl bg-cyan-300 text-[#062030] hover:bg-cyan-200"><Save className="mr-2 h-4 w-4" />儲存考核</Button>}</DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
