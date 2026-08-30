import { ChevronDown, Database, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import {
  MaintenanceProjectOption,
  MaintenanceScopeState,
  clearMaintenanceProjects,
  selectAllMaintenanceProjects,
  selectCurrentMaintenanceProject,
  toggleMaintenanceProject,
} from "./maintenanceKnowledge";

interface MaintenanceSourceSelectorProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  projects: MaintenanceProjectOption[];
  currentProjectId?: null | string;
  scope: MaintenanceScopeState;
  onScopeChange: (scope: MaintenanceScopeState) => void;
  loading?: boolean;
  lastResultCount?: null | number;
  retrievalError?: null | string;
}
export function MaintenanceSourceSelector({
  enabled,
  onEnabledChange,
  projects,
  currentProjectId,
  scope,
  onScopeChange,
  loading = false,
  lastResultCount = null,
  retrievalError = null,
}: MaintenanceSourceSelectorProps) {
  const activeProjects = projects.filter((project) => project.status !== "archived");
  const selectedProjectIds = scope.selectedProjectIds;
  const selectedNames = activeProjects
    .filter((project) => selectedProjectIds.includes(project.id))
    .map((project) => project.name);
  const sourceStatus = loading
    ? "正在查詢正式資料"
    : retrievalError
      ? `檢索失敗：${retrievalError}`
      : lastResultCount !== null
        ? `找到 ${lastResultCount} 筆來源`
        : `已選 ${selectedProjectIds.length} 個專案`;

  return (
    <section
      data-testid="maintenance-source-selector"
      className="rounded-lg border border-cyan-300/20 bg-[linear-gradient(110deg,rgba(8,47,73,0.66),rgba(15,23,42,0.9))] px-1.5 py-1 shadow-[0_10px_28px_rgba(2,132,199,0.08)] sm:rounded-xl sm:px-3 sm:py-2"
    >
      <div className="flex min-h-10 items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-300/25 bg-cyan-300/12 text-cyan-100 sm:h-9 sm:w-9">
          <Wrench className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-bold text-slate-100" title="機台維修紀錄中心">維修資料</p>
            <Badge variant="outline" className="hidden border-emerald-300/25 bg-emerald-400/10 text-[10px] text-emerald-200 md:inline-flex">
              即時資料
            </Badge>
          </div>
          <p
            className={cn(
              "truncate text-[10px] font-semibold sm:text-[11px]",
              !enabled && "text-slate-400",
              enabled && !loading && !retrievalError && "text-emerald-200/85",
              loading && "text-cyan-200",
              retrievalError && "text-rose-300",
            )}
            title={enabled ? sourceStatus : "關閉中，一般 AI 對話"}
          >
            {enabled ? sourceStatus : "關閉中 · 一般 AI 對話"}
          </p>
        </div>

        {enabled ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                aria-label="選擇維修資料專案範圍"
                className="h-9 w-[88px] shrink-0 justify-between border-cyan-300/25 bg-slate-950/45 px-2 text-[11px] font-bold text-slate-100 hover:bg-slate-800/80 sm:w-[190px] sm:px-3 sm:text-xs"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Database className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                  <span className="truncate sm:hidden">{selectedProjectIds.length} 專案</span>
                  <span className="hidden truncate sm:inline">
                    {selectedNames.length
                      ? selectedNames.length === 1
                        ? selectedNames[0]
                        : `已選 ${selectedNames.length} 個專案`
                      : "尚未選取專案"}
                  </span>
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-[min(380px,calc(100vw-24px))] border-cyan-300/20 bg-slate-950/95 p-0 text-slate-100 shadow-2xl backdrop-blur-xl"
            >
              <div className="border-b border-slate-700/70 p-3">
                <p className="text-sm font-semibold">查詢專案範圍</p>
                <p className="mt-1 text-[11px] text-slate-400">預設查目前專案，也可以同時比對多個專案。</p>
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 border-cyan-300/20 bg-cyan-400/5 px-2 text-[11px]"
                    onClick={() => onScopeChange(selectCurrentMaintenanceProject(scope, currentProjectId, projects))}
                  >
                    目前專案
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 border-emerald-300/20 bg-emerald-400/5 px-2 text-[11px]"
                    onClick={() => onScopeChange(selectAllMaintenanceProjects(scope, projects))}
                  >
                    全部選取
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 border-slate-600 bg-slate-900 px-2 text-[11px]"
                    onClick={() => onScopeChange(clearMaintenanceProjects(scope))}
                  >
                    清除
                  </Button>
                </div>
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto p-2">
                {activeProjects.length ? projects.map((project) => {
                  if (project.status === "archived") return null;
                  const checked = selectedProjectIds.includes(project.id);
                  const isCurrent = project.id === currentProjectId;
                  return (
                    <label
                      key={project.id}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                        checked
                          ? "border-cyan-300/30 bg-cyan-400/10"
                          : "border-transparent bg-slate-900/45 hover:border-slate-600",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => onScopeChange(
                          toggleMaintenanceProject(scope, project.id, value === true, projects),
                        )}
                        aria-label={`選取專案 ${project.name}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{project.name}</span>
                      {isCurrent ? (
                        <Badge variant="outline" className="border-blue-300/20 bg-blue-400/10 text-[9px] text-blue-200">
                          目前
                        </Badge>
                      ) : null}
                    </label>
                  );
                }) : (
                  <p className="px-3 py-6 text-center text-xs text-slate-500">沒有可查詢的維修專案</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        ) : null}

        <Switch
          data-mobile-ai-source-toggle="true"
          checked={enabled}
          onCheckedChange={onEnabledChange}
          aria-describedby="maintenance-source-help"
          aria-label="啟用機台維修紀錄來源"
        />
      </div>

      <p
        id="maintenance-source-help"
        data-testid="maintenance-source-help"
        className="sr-only"
      >
        開啟＝專案資料查詢；關閉＝一般 AI 對話／附件分析。若不是要查機台維修紀錄，請先關閉，避免一般問題被當成專案搜尋。
      </p>
    </section>
  );
}
