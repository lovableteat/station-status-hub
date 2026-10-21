import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronRight, CircleHelp, ClipboardCheck, ListChecks, PanelRightClose, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { RackDeviceHealth, RackStatus } from "./dataCenterTypes";
import type { DailyWorkReport } from "./dailyWorkReports";
import { WORK_REPORT_STATUSES } from "./dailyWorkReports";

export interface WorkflowStep {
  id: string;
  title: string;
  value: string;
  done: boolean;
}

interface WorkflowStripProps {
  steps: WorkflowStep[];
  nextStepId: string | null;
  onStep: (id: string) => void;
  help: ReactNode;
}

/** The page's purpose as five live steps; the first unfinished one is the suggested next action. */
export function WorkflowStrip({ steps, nextStepId, onStep, help }: WorkflowStripProps) {
  const listRef = useRef<HTMLOListElement | null>(null);
  // On narrow screens the strip scrolls; keep the suggested next step in view without moving the page.
  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!list || !current || list.scrollWidth <= list.clientWidth) return;
    list.scrollLeft = Math.max(0, current.offsetLeft - 12);
  }, [nextStepId]);
  return (
    <>
      <ol ref={listRef} className="dc-flow" aria-label="機房配置工作流程">
        {steps.map((step, index) => {
          const isNext = step.id === nextStepId;
          return (
            <li key={step.id}>
              <button
                type="button"
                className="dc-flow-step"
                data-step={step.id}
                data-done={step.done ? "true" : "false"}
                aria-current={isNext ? "step" : undefined}
                aria-label={`${step.title}：${step.value}${isNext ? "（建議下一步）" : step.done ? "（已完成）" : ""}`}
                onClick={() => onStep(step.id)}
              >
                <span className="dc-flow-index" aria-hidden="true">{step.done ? <Check className="h-4 w-4" /> : index + 1}</span>
                <span className="dc-flow-title">{step.title}{isNext ? <em className="dc-flow-next">下一步</em> : null}</span>
                <span className="dc-flow-value">{step.value}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="dc-flow-help h-9 px-3 text-sm"><CircleHelp className="h-4 w-4" />使用說明</Button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className="dc-flow-help-content w-[min(92vw,30rem)] text-sm leading-6">
          {help}
        </PopoverContent>
      </Popover>
    </>
  );
}

export interface ProgressRackRow {
  id: string;
  cabinet: string;
  row: string;
  status: RackStatus;
  health: RackDeviceHealth;
  hasModel: boolean;
  modelLabel: string;
  deviceCount: number;
  serviceCount: number;
  nextStep: { title: string; owner: string; status: string } | null;
  pendingSteps: number;
}

export interface SiteProgress {
  rackCount: number;
  racksWithModel: number;
  racksWithDevices: number;
  deviceCount: number;
  serviceDeviceCount: number;
  attentionCount: number;
  capacityU: number;
  usedU: number;
  checklistDone: number;
  checklistTotal: number;
  stepsDone: number;
  stepsTotal: number;
  maintenanceOpen: number;
  rows: ProgressRackRow[];
}

export interface ReportSummary {
  todayMine: DailyWorkReport | null;
  todaySite: number;
  latest: DailyWorkReport[];
  recentCount: number;
  blockedRecent: number;
  lastReportDate: string;
}

export type ReportState = "signed-out" | "no-project" | "loading" | "error" | "ready";

interface WorkProgressPanelProps {
  siteLabel: string;
  progress: SiteProgress;
  healthLabels: Record<RackDeviceHealth, string>;
  selectedRackId: string;
  onSelectRack: (rackId: string) => void;
  onOpenRack: (rackId: string) => void;
  onOpenPlan: () => void;
  onOpenReports: () => void;
  onCollapse: () => void;
  reportState: ReportState;
  reports: ReportSummary;
  canReport: boolean;
  siteName: (siteId: string) => string;
}

function Meter({ label, value, total, unit = "", tone }: { label: string; value: number; total: number; unit?: string; tone?: "warning" }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="dc-progress-meter" data-tone={tone} role="group" aria-label={`${label} ${value}／${total}${unit}`}>
      <div className="dc-progress-meter-label"><span>{label}</span><span>{value}／{total}{unit}</span></div>
      <div className="dc-progress-meter-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, percent)}%` }} /></div>
    </div>
  );
}

const statusLabel = (status: string) => (Object.prototype.hasOwnProperty.call(WORK_REPORT_STATUSES, status) ? WORK_REPORT_STATUSES[status as keyof typeof WORK_REPORT_STATUSES] : status);

/** Right-hand overview panel: configuration progress, every rack's state and today's report. */
export function WorkProgressPanel({ siteLabel, progress, healthLabels, selectedRackId, onSelectRack, onOpenRack, onOpenPlan, onOpenReports, onCollapse, reportState, reports, canReport, siteName }: WorkProgressPanelProps) {
  const rackMeterTone = progress.rackCount > 0 && progress.racksWithDevices < progress.rackCount ? "warning" : undefined;
  return (
    <aside className="dc-progress-panel" data-testid="data-center-work-panel" aria-label="工作進度">
      <header className="dc-progress-head">
        <div className="min-w-0">
          <h2>工作進度</h2>
          <p className="truncate">{siteLabel} · {progress.rackCount} 座機櫃 · {progress.deviceCount} 台設備</p>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="收合工作進度" onClick={onCollapse} className="h-9 w-9 shrink-0"><PanelRightClose className="h-4 w-4" /></Button>
      </header>
      <div className="dc-progress-body">
        <section className="dc-progress-section" aria-label="配置進度">
          <div className="dc-progress-section-head"><h3><ListChecks className="h-4 w-4" />配置進度</h3>{progress.attentionCount > 0 ? <span className="dc-progress-flag"><AlertTriangle className="h-3.5 w-3.5" />{progress.attentionCount} 座需注意</span> : null}</div>
          <Meter label="機櫃已裝設備" value={progress.racksWithDevices} total={progress.rackCount} unit=" 座" tone={rackMeterTone} />
          <Meter label="U 位使用" value={progress.usedU} total={progress.capacityU} unit=" U" />
          {progress.stepsTotal > 0 ? <Meter label="部署步驟" value={progress.stepsDone} total={progress.stepsTotal} /> : null}
          {progress.checklistTotal > 0 ? <Meter label="站點檢查清單" value={progress.checklistDone} total={progress.checklistTotal} /> : null}
        </section>

        <section className="dc-progress-section" aria-label="機櫃狀態">
          <div className="dc-progress-section-head"><h3><Server className="h-4 w-4" />機櫃狀態</h3><button type="button" className="dc-progress-link" onClick={onOpenPlan}>2D 規劃</button></div>
          {progress.rows.length === 0 ? (
            <div className="dc-progress-empty"><p>這個站點還沒有機櫃。</p><Button type="button" size="sm" onClick={onOpenPlan}>到 2D 規劃新增機櫃</Button></div>
          ) : (
            <ul className="dc-progress-racks">
              {progress.rows.map((row) => {
                const selected = row.id === selectedRackId;
                return (
                  <li key={row.id} className={cn("dc-progress-rack", selected && "is-selected")}>
                    <button type="button" className="dc-progress-rack-main" aria-pressed={selected} aria-label={`選取 ${row.cabinet}，${healthLabels[row.health]}，${row.deviceCount} 台設備`} onClick={() => onSelectRack(row.id)}>
                      <span className="dc-progress-rack-name"><i data-health={row.health} aria-hidden="true" />{row.cabinet}<small>{healthLabels[row.health]}</small></span>
                      <span className="dc-progress-rack-meta">{row.hasModel ? row.modelLabel : <strong>未套用外框</strong>} · {row.deviceCount > 0 ? `${row.deviceCount} 台設備` : <strong>尚未裝設備</strong>}</span>
                      {row.nextStep ? <span className="dc-progress-rack-step">{row.nextStep.status === "active" ? "進行中" : "待辦"}：{row.nextStep.title}（{row.nextStep.owner}）</span> : null}
                    </button>
                    <button type="button" className="dc-progress-rack-open" aria-label={`開啟 ${row.cabinet} 的機櫃與設備`} onClick={() => onOpenRack(row.id)}><ChevronRight className="h-4 w-4" /></button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="dc-progress-section" aria-label="今日回報">
          <div className="dc-progress-section-head"><h3><ClipboardCheck className="h-4 w-4" />每日工作回報</h3><button type="button" className="dc-progress-link" onClick={onOpenReports}>全部紀錄</button></div>
          {reportState === "signed-out" ? (
            <div className="dc-progress-empty"><p>回報存在共用專案裡，登入後才能讀取與填寫。</p><Button type="button" size="sm" variant="outline" onClick={onOpenReports}>查看回報頁</Button></div>
          ) : reportState === "no-project" ? (
            <div className="dc-progress-empty"><p>先選擇共用專案，回報會依專案保存。</p></div>
          ) : reportState === "loading" ? (
            <p className="dc-progress-muted" role="status">正在讀取回報…</p>
          ) : reportState === "error" ? (
            <div className="dc-progress-empty"><p>目前讀不到回報紀錄。</p><Button type="button" size="sm" variant="outline" onClick={onOpenReports}>到回報頁重試</Button></div>
          ) : (
            <>
              <div className={cn("dc-progress-today", reports.todayMine ? "is-done" : "is-open")}>
                {reports.todayMine ? (
                  <>
                    <div className="dc-progress-today-head"><span className="dc-progress-today-title"><Check className="h-4 w-4" />今天已回報</span><span className="dc-work-status" data-status={reports.todayMine.status}>{statusLabel(reports.todayMine.status)}</span></div>
                    <p className="dc-progress-excerpt">{reports.todayMine.summary}</p>
                    <Button type="button" size="sm" variant="outline" onClick={onOpenReports}>修改今天的回報</Button>
                  </>
                ) : (
                  <>
                    <div className="dc-progress-today-head"><span className="dc-progress-today-title">今天尚未回報</span>{reports.todaySite > 0 ? <span className="dc-progress-muted">本站已有 {reports.todaySite} 筆</span> : null}</div>
                    <p className="dc-progress-muted">記錄今天完成的事、下一步與需要的協助；不會改動場景配置。</p>
                    <Button type="button" size="sm" disabled={!canReport} onClick={onOpenReports}>{canReport ? "填寫今天的回報" : "唯讀權限，僅能查看"}</Button>
                  </>
                )}
              </div>
              {reports.blockedRecent > 0 ? <p className="dc-progress-flag mt-2"><AlertTriangle className="h-3.5 w-3.5" />近 7 天有 {reports.blockedRecent} 筆待協助</p> : null}
              {reports.latest.length > 0 ? (
                <ul className="dc-progress-reports" aria-label="最近回報">
                  {reports.latest.map((report) => (
                    <li key={report.id}>
                      <button type="button" onClick={onOpenReports} aria-label={`查看 ${report.report_date} ${report.author?.display_name ?? ""} 的回報`}>
                        <span className="dc-progress-report-meta"><time>{report.report_date}</time> · {report.author?.display_name ?? "未提供姓名"} · {siteName(report.site_id)}<span className="dc-work-status" data-status={report.status}>{statusLabel(report.status)}</span></span>
                        <span className="dc-progress-excerpt">{report.summary}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="dc-progress-muted">這個專案還沒有任何回報。</p>}
            </>
          )}
        </section>
      </div>
    </aside>
  );
}
